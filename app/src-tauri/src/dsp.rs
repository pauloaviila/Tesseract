use ndarray::Array2;
use rayon::prelude::*;
use rustfft::{FftPlanner, num_complex::Complex};

/// STFT result: rows = time frames, cols = frequency bins (0..N/2+1)
pub struct Spectrogram {
    /// Magnitude matrix [frames × bins]
    pub magnitude: Array2<f32>,
    pub sample_rate: u32,
    #[allow(dead_code)]
    pub hop_size: usize,
    pub fft_size: usize,
}

impl Spectrogram {
    /// Number of frequency bins (positive frequencies only)
    pub fn bins(&self) -> usize {
        self.fft_size / 2 + 1
    }

    #[allow(dead_code)]
    pub fn bin_to_hz(&self, bin: usize) -> f32 {
        bin as f32 * self.sample_rate as f32 / self.fft_size as f32
    }

    /// Energy (mean magnitude²) in a Hz range for a given frame
    pub fn energy_in_range(&self, frame: usize, hz_lo: f32, hz_hi: f32) -> f32 {
        let bin_lo = (hz_lo * self.fft_size as f32 / self.sample_rate as f32) as usize;
        let bin_hi = ((hz_hi * self.fft_size as f32 / self.sample_rate as f32) as usize)
            .min(self.bins() - 1);
        if bin_lo >= bin_hi {
            return 0.0;
        }
        let row = self.magnitude.row(frame);
        let slice = &row.as_slice().unwrap()[bin_lo..=bin_hi];
        slice.iter().map(|m| m * m).sum::<f32>() / slice.len() as f32
    }
}

/// Short-Time Fourier Transform on a mono signal.
/// fft_size: window length (power of 2, e.g. 2048)
/// hop_size: step between windows (e.g. 512)
pub fn stft(mono: &[f32], fft_size: usize, hop_size: usize, sample_rate: u32) -> Spectrogram {
    let num_frames = if mono.len() >= fft_size {
        (mono.len() - fft_size) / hop_size + 1
    } else {
        0
    };
    let bins = fft_size / 2 + 1;

    // Hann window coefficients
    let window: Vec<f32> = (0..fft_size)
        .map(|n| {
            0.5 * (1.0 - (2.0 * std::f32::consts::PI * n as f32 / (fft_size - 1) as f32).cos())
        })
        .collect();

    // Process frames in parallel (rayon)
    let rows: Vec<Vec<f32>> = (0..num_frames)
        .into_par_iter()
        .map(|frame_idx| {
            let offset = frame_idx * hop_size;
            let mut buf: Vec<Complex<f32>> = mono[offset..offset + fft_size]
                .iter()
                .zip(window.iter())
                .map(|(&s, &w)| Complex::new(s * w, 0.0))
                .collect();

            let mut local_planner = FftPlanner::<f32>::new();
            let local_fft = local_planner.plan_fft_forward(fft_size);
            local_fft.process(&mut buf);

            buf[..bins]
                .iter()
                .map(|c| c.norm() / fft_size as f32)
                .collect()
        })
        .collect();

    let flat: Vec<f32> = rows.into_iter().flatten().collect();
    let magnitude = Array2::from_shape_vec((num_frames, bins), flat)
        .expect("shape mismatch in STFT");

    Spectrogram { magnitude, sample_rate, hop_size, fft_size }
}

/// A single frequency conflict detected between two stems.
#[derive(serde::Serialize, Clone)]
pub struct FrequencyConflict {
    pub stem_a_id: String,
    pub stem_b_id: String,
    /// Hz range of the conflict
    pub hz_lo: f32,
    pub hz_hi: f32,
    /// Mean frame where conflict occurs (for heatmap)
    pub frame_start: usize,
    pub frame_end: usize,
    /// How many dB stem_b should yield to stem_a
    pub attenuation_db: f32,
}

/// Tier of a stem — used for priority-based conflict resolution.
/// Lower number = higher priority.
pub type Tier = u8;

pub struct StemSpec {
    pub id: String,
    pub tier: Tier,
    pub spectrogram: Spectrogram,
}

/// Frequency bands to analyse (Hz ranges).
const BANDS: &[(f32, f32)] = &[
    (20.0,   80.0),   // sub bass
    (80.0,  250.0),   // bass / low-mid
    (250.0, 500.0),   // low-mid
    (500.0, 2000.0),  // mid
    (2000.0, 6000.0), // high-mid
    (6000.0, 20000.0),// air / high
];

/// Masking threshold: if lower-tier energy exceeds higher-tier energy by this
/// factor (linear), flag a conflict.
const MASKING_RATIO_THRESHOLD: f32 = 1.5;

/// Analyse all stems together and return detected conflicts.
pub fn detect_conflicts(stems: &[StemSpec]) -> Vec<FrequencyConflict> {
    let mut conflicts = Vec::new();
    let num_frames = stems
        .iter()
        .map(|s| s.spectrogram.magnitude.nrows())
        .min()
        .unwrap_or(0);

    for i in 0..stems.len() {
        for j in (i + 1)..stems.len() {
            let (hi_pri, lo_pri) = if stems[i].tier <= stems[j].tier {
                (&stems[i], &stems[j])
            } else {
                (&stems[j], &stems[i])
            };

            for &(hz_lo, hz_hi) in BANDS {
                // Collect per-frame conflict windows
                let mut conflict_frames: Vec<usize> = Vec::new();
                for frame in 0..num_frames {
                    let e_hi = hi_pri.spectrogram.energy_in_range(frame, hz_lo, hz_hi);
                    let e_lo = lo_pri.spectrogram.energy_in_range(frame, hz_lo, hz_hi);
                    if e_hi > 1e-9 && e_lo > e_hi * MASKING_RATIO_THRESHOLD {
                        conflict_frames.push(frame);
                    }
                }

                if conflict_frames.is_empty() {
                    continue;
                }

                // Compute average energies over conflict frames
                let (sum_hi, sum_lo): (f32, f32) = conflict_frames.iter().fold((0.0, 0.0), |acc, &f| {
                    (
                        acc.0 + hi_pri.spectrogram.energy_in_range(f, hz_lo, hz_hi),
                        acc.1 + lo_pri.spectrogram.energy_in_range(f, hz_lo, hz_hi),
                    )
                });
                let n = conflict_frames.len() as f32;
                let ratio = (sum_lo / n) / (sum_hi / n + 1e-12);
                let attenuation_db = 20.0 * ratio.log10();

                conflicts.push(FrequencyConflict {
                    stem_a_id: hi_pri.id.clone(),
                    stem_b_id: lo_pri.id.clone(),
                    hz_lo,
                    hz_hi,
                    frame_start: *conflict_frames.first().unwrap(),
                    frame_end: *conflict_frames.last().unwrap(),
                    attenuation_db,
                });
            }
        }
    }

    conflicts
}

/// Compute RMS and true-peak level for a mono signal.
pub fn measure_levels(mono: &[f32]) -> (f32, f32) {
    let rms = (mono.iter().map(|s| s * s).sum::<f32>() / mono.len() as f32).sqrt();
    let peak = mono.iter().cloned().map(f32::abs).fold(0.0_f32, f32::max);
    (rms, peak)
}

/// Required gain (linear) to hit a target peak level.
pub fn gain_for_target_peak(current_peak: f32, target_db: f32) -> f32 {
    let target_linear = 10.0_f32.powf(target_db / 20.0);
    if current_peak < 1e-9 {
        return 1.0;
    }
    target_linear / current_peak
}
