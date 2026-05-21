use std::path::Path;
use rustfft::{FftPlanner, num_complex::Complex};
use serde::{Serialize, Deserialize};
use crate::audio::{decode_file, to_mono};
use crate::dsp_primitives::{
    BiquadFilter, energy_envelope, forward_stft, spectral_flatness, spectral_flux
};

#[derive(Serialize, Deserialize, Clone, Copy, Debug)]
pub enum MaterialClass {
    Percussive,
    Tonal,
    Mixed,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct DetectiveResult {
    pub bpm_estimated: f64,
    pub confidence: f64,
    pub requires_manual_anchors: bool,
    pub transients_ms: Vec<f64>,
    pub material_class: MaterialClass,
    pub spectral_flux_variance: f64,
    pub spectral_flatness: f64,
    pub band_weights: [f64; 3],
}

/// Helper to compute the Spectral Flatness Measure of a 1D vector (like an ODF).
/// Pads to next power of 2 and computes the power spectrum first.
pub fn compute_vector_sfm(vector: &[f32]) -> f32 {
    if vector.is_empty() {
        return 1.0;
    }
    let n = vector.len();
    let fft_size = n.next_power_of_two();
    let mut buf = vec![Complex::new(0.0, 0.0); fft_size];
    for i in 0..n {
        buf[i] = Complex::new(vector[i], 0.0);
    }
    let mut planner = FftPlanner::new();
    let fft = planner.plan_fft_forward(fft_size);
    fft.process(&mut buf);
    
    let half_len = fft_size / 2 + 1;
    let mags: Vec<f32> = buf[..half_len].iter().map(|c| c.norm()).collect();
    spectral_flatness(&mags)
}

/// Runs the Motor 1 (Detective) analysis on a WAV/audio file.
pub fn run_detective(stem_path: &str, _project_bpm: f64) -> Result<DetectiveResult, String> {
    let path = Path::new(stem_path);
    let decoded = decode_file(path)?;
    let mono = to_mono(&decoded);
    let sample_rate = decoded.sample_rate;
    
    if mono.is_empty() {
        return Err("Audio file is empty".to_string());
    }

    // --- 1. Multi-Band Filtering ---
    // Band A: Sub/Kick (0 - 200 Hz)
    let mut filter_a = BiquadFilter::new_lowpass(200.0, sample_rate as f64);
    // Band B: Mid/Snare (200 - 2000 Hz) - Center = 1100 Hz, Bandwidth = 1800 Hz
    let mut filter_b = BiquadFilter::new_bandpass(1100.0, 1800.0, sample_rate as f64);
    // Band C: Hats/Noise (2000 Hz - Nyquist)
    let mut filter_c = BiquadFilter::new_highpass(2000.0, sample_rate as f64);
    
    let sig_a = filter_a.process_signal(&mono);
    let sig_b = filter_b.process_signal(&mono);
    let sig_c = filter_c.process_signal(&mono);

    // --- 2. Energy Envelopes ---
    // Frame size ~23ms (1024 samples @ 44.1kHz), Hop size ~12ms (512 samples)
    let fft_size = 1024;
    let hop_size = 512;
    
    let env_a = energy_envelope(&sig_a, fft_size, hop_size);
    let env_b = energy_envelope(&sig_b, fft_size, hop_size);
    let env_c = energy_envelope(&sig_c, fft_size, hop_size);

    // --- 3. Onset Detection Functions (ODFs) ---
    let odf_fn = |env: &[f32]| -> Vec<f32> {
        if env.len() < 2 {
            return vec![0.0; env.len()];
        }
        let mut odf_vec = vec![0.0f32; env.len()];
        for t in 1..env.len() {
            odf_vec[t] = (env[t] - env[t - 1]).max(0.0);
        }
        odf_vec
    };
    
    let odf_a = odf_fn(&env_a);
    let odf_b = odf_fn(&env_b);
    let odf_c = odf_fn(&env_c);

    // --- 4. Spectral Flatness & Weights ---
    let sfm_a = compute_vector_sfm(&odf_a);
    let sfm_b = compute_vector_sfm(&odf_b);
    let sfm_c = compute_vector_sfm(&odf_c);

    // Prominence weighting: 1.0 - SFM (lower SFM = cleaner peaks = higher weight)
    let mut weight_a = (1.0 - sfm_a as f64).max(0.0);
    let mut weight_b = (1.0 - sfm_b as f64).max(0.0);
    let weight_c = (1.0 - sfm_c as f64).max(0.0);

    // Contramedida para grave não-rítmico (rumble):
    if weight_a < 0.20 {
        weight_a = weight_a * 0.1; // peso reduzido para 10%
    }
    
    // Normalização/Proteção
    if weight_a + weight_b < 1e-4 {
        weight_a = 1.0;
        weight_b = 1.0;
    }

    // --- 5. Autocorrelation & BPM Estimation ---
    let num_frames = odf_a.len();
    let mut odf_weighted = vec![0.0f32; num_frames];
    for i in 0..num_frames {
        odf_weighted[i] = (odf_a[i] as f64 * weight_a + odf_b[i] as f64 * weight_b) as f32;
    }

    let f_frame = sample_rate as f64 / hop_size as f64;
    // Search lag corresponding to 50 BPM to 220 BPM
    let lag_min = ((60.0 / 220.0) * f_frame).floor() as usize;
    let lag_max = ((60.0 / 50.0) * f_frame).ceil() as usize;

    let mut r = vec![0.0f64; lag_max + 1];
    let mut best_lag = lag_min;
    let mut max_val = -1.0f64;

    for lag in lag_min..=lag_max {
        if lag >= num_frames {
            continue;
        }
        let mut sum = 0.0f64;
        let mut count = 0.0f64;
        for t in lag..num_frames {
            sum += odf_weighted[t] as f64 * odf_weighted[t - lag] as f64;
            count += 1.0;
        }
        if count > 0.0 {
            let val = sum / count;
            r[lag] = val;
            if val > max_val {
                max_val = val;
                best_lag = lag;
            }
        }
    }

    // Refinar o pico usando interpolação parabólica
    let mut final_lag = best_lag as f64;
    if best_lag > lag_min && best_lag < lag_max && best_lag < r.len() - 1 {
        let y0 = r[best_lag - 1];
        let y1 = r[best_lag];
        let y2 = r[best_lag + 1];
        let denom = 2.0 * y1 - y0 - y2;
        if denom.abs() > 1e-6 {
            let delta = (y2 - y0) / (2.0 * denom);
            if delta.abs() < 1.0 {
                final_lag = best_lag as f64 + delta;
            }
        }
    }

    let bpm_estimated = (60.0 * f_frame) / final_lag;

    // --- 6. Transients Detection (Combined ODF: Sub/Kick + Mid/Snare + Hats) ---
    let mut odf_total = vec![0.0f64; num_frames];
    for i in 0..num_frames {
        odf_total[i] = odf_a[i] as f64 * weight_a + odf_b[i] as f64 * weight_b + odf_c[i] as f64 * weight_c;
    }

    let mut mean_total = 0.0f64;
    let mut variance_total = 0.0f64;
    if !odf_total.is_empty() {
        mean_total = odf_total.iter().sum::<f64>() / odf_total.len() as f64;
        variance_total = odf_total.iter().map(|&x| {
            let diff = x - mean_total;
            diff * diff
        }).sum::<f64>() / odf_total.len() as f64;
    }
    let std_dev_total = variance_total.sqrt();
    let threshold_total = mean_total + 1.2 * std_dev_total; // 1.2 para maior sensibilidade a ghost notes e rolos

    let mut transients_ms = Vec::new();
    for t in 1..(odf_total.len() - 1) {
        let prev = odf_total[t - 1];
        let curr = odf_total[t];
        let next = odf_total[t + 1];
        if curr > prev && curr > next && curr > threshold_total {
            let ms = (t as f64 * hop_size as f64 * 1000.0) / sample_rate as f64;
            // Janela de guarda de 30ms para evitar registros duplos na mesma vizinhança
            if transients_ms.is_empty() || ms - transients_ms.last().unwrap() >= 30.0 {
                transients_ms.push(ms);
            }
        }
    }

    // --- 7. Confidence Score ---
    let distances: Vec<f64> = transients_ms.windows(2).map(|w| w[1] - w[0]).collect();
    let beat_ms = 60000.0 / bpm_estimated;
    let mut bpms = Vec::new();
    for &d in &distances {
        let q = (d / beat_ms).round();
        if q >= 1.0 {
            let t_i = d / q;
            let bpm_i = 60000.0 / t_i;
            bpms.push(bpm_i);
        }
    }

    let confidence = if bpms.len() >= 2 {
        let mean_bpm = bpms.iter().sum::<f64>() / bpms.len() as f64;
        let variance_bpm = bpms.iter().map(|&x| {
            let diff = x - mean_bpm;
            diff * diff
        }).sum::<f64>() / bpms.len() as f64;
        let std_dev_bpm = variance_bpm.sqrt();
        let c = 1.0 - (std_dev_bpm / bpm_estimated);
        c.max(0.0).min(1.0)
    } else {
        0.5 // confiança padrão mediana se não houver transientes suficientes
    };

    let requires_manual_anchors = confidence < 0.70;

    // --- 8. Classificador de Material (Flux Variance + SFM) ---
    // STFT do sinal inteiro
    let complex_frames = forward_stft(&mono, fft_size, hop_size);
    let flux = spectral_flux(&complex_frames);
    
    let mean_flux = if !flux.is_empty() {
        flux.iter().sum::<f32>() / flux.len() as f32
    } else {
        0.0
    };
    let var_flux = if !flux.is_empty() {
        flux.iter().map(|&x| {
            let diff = x - mean_flux;
            diff * diff
        }).sum::<f32>() / flux.len() as f32
    } else {
        0.0
    };
    let spectral_flux_variance = var_flux as f64;

    let mut sfm_sum = 0.0f64;
    for frame in &complex_frames {
        let mags: Vec<f32> = frame.iter().map(|c| c.norm()).collect();
        sfm_sum += spectral_flatness(&mags) as f64;
    }
    let spectral_flatness = if !complex_frames.is_empty() {
        sfm_sum / complex_frames.len() as f64
    } else {
        0.0
    };

    // Classificação
    // THRESHOLD_PERCUSSIVE inicial sugerido = 0.15 (sendo adaptado)
    let threshold_percussive = 0.15;
    let material_class = if spectral_flux_variance > threshold_percussive && spectral_flatness > 0.4 {
        MaterialClass::Percussive
    } else if spectral_flux_variance > threshold_percussive && spectral_flatness <= 0.4 {
        MaterialClass::Tonal // Reese Bass com LFO agressivo
    } else {
        MaterialClass::Tonal // Pista tonal estável
    };

    Ok(DetectiveResult {
        bpm_estimated,
        confidence,
        requires_manual_anchors,
        transients_ms,
        material_class,
        spectral_flux_variance,
        spectral_flatness,
        band_weights: [weight_a, weight_b, weight_c],
    })
}
