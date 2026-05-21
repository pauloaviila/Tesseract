use rustfft::{FftPlanner, num_complex::Complex};

/// Biquad filter implementation for 2nd order Butterworth filtering.
pub struct BiquadFilter {
    b0: f64,
    b1: f64,
    b2: f64,
    a1: f64,
    a2: f64,
    x1: f64,
    x2: f64,
    y1: f64,
    y2: f64,
}

impl BiquadFilter {
    pub fn new_lowpass(cutoff_hz: f64, sample_rate: f64) -> Self {
        let omega = (std::f64::consts::PI * cutoff_hz / sample_rate).tan();
        let sqrt2 = std::f64::consts::SQRT_2;
        let omega_sq = omega * omega;
        
        let a0 = 1.0 + sqrt2 * omega + omega_sq;
        let b0 = omega_sq / a0;
        let b1 = 2.0 * omega_sq / a0;
        let b2 = omega_sq / a0;
        let a1 = 2.0 * (omega_sq - 1.0) / a0;
        let a2 = (1.0 - sqrt2 * omega + omega_sq) / a0;
        
        Self { b0, b1, b2, a1, a2, x1: 0.0, x2: 0.0, y1: 0.0, y2: 0.0 }
    }

    pub fn new_highpass(cutoff_hz: f64, sample_rate: f64) -> Self {
        let omega = (std::f64::consts::PI * cutoff_hz / sample_rate).tan();
        let sqrt2 = std::f64::consts::SQRT_2;
        let omega_sq = omega * omega;
        
        let a0 = 1.0 + sqrt2 * omega + omega_sq;
        let b0 = 1.0 / a0;
        let b1 = -2.0 / a0;
        let b2 = 1.0 / a0;
        let a1 = 2.0 * (omega_sq - 1.0) / a0;
        let a2 = (1.0 - sqrt2 * omega + omega_sq) / a0;
        
        Self { b0, b1, b2, a1, a2, x1: 0.0, x2: 0.0, y1: 0.0, y2: 0.0 }
    }

    pub fn new_bandpass(center_hz: f64, bandwidth_hz: f64, sample_rate: f64) -> Self {
        let w0 = 2.0 * std::f64::consts::PI * center_hz / sample_rate;
        let q = center_hz / bandwidth_hz;
        let alpha = w0.sin() / (2.0 * q);
        let cos_w0 = w0.cos();
        
        let a0 = 1.0 + alpha;
        let b0 = alpha / a0;
        let b1 = 0.0;
        let b2 = -alpha / a0;
        let a1 = -2.0 * cos_w0 / a0;
        let a2 = (1.0 - alpha) / a0;
        
        Self { b0, b1, b2, a1, a2, x1: 0.0, x2: 0.0, y1: 0.0, y2: 0.0 }
    }

    pub fn process(&mut self, x: f32) -> f32 {
        let x_f64 = x as f64;
        let y_f64 = self.b0 * x_f64 + self.b1 * self.x1 + self.b2 * self.x2 - self.a1 * self.y1 - self.a2 * self.y2;
        
        self.x2 = self.x1;
        self.x1 = x_f64;
        self.y2 = self.y1;
        self.y1 = y_f64;
        
        y_f64 as f32
    }

    pub fn process_signal(&mut self, input: &[f32]) -> Vec<f32> {
        input.iter().map(|&x| self.process(x)).collect()
    }
}

/// Computes a Hann window of the given size.
pub fn Hann_window(size: usize) -> Vec<f32> {
    (0..size)
        .map(|n| 0.5 * (1.0 - (2.0 * std::f32::consts::PI * n as f32 / (size - 1) as f32).cos()))
        .collect()
}

/// Short-Time Fourier Transform.
/// Returns complex positive-frequency frames of size `fft_size / 2 + 1`.
pub fn forward_stft(
    signal: &[f32],
    fft_size: usize,
    hop_size: usize,
) -> Vec<Vec<Complex<f32>>> {
    if signal.len() < fft_size {
        return Vec::new();
    }
    let num_frames = (signal.len() - fft_size) / hop_size + 1;
    let window = Hann_window(fft_size);
    let mut planner = FftPlanner::new();
    let fft = planner.plan_fft_forward(fft_size);
    
    let mut frames = Vec::with_capacity(num_frames);
    for f in 0..num_frames {
        let offset = f * hop_size;
        let mut buf: Vec<Complex<f32>> = signal[offset..offset + fft_size]
            .iter()
            .zip(window.iter())
            .map(|(&s, &w)| Complex::new(s * w, 0.0))
            .collect();
            
        fft.process(&mut buf);
        buf.truncate(fft_size / 2 + 1);
        frames.push(buf);
    }
    frames
}

/// Inverse Short-Time Fourier Transform using Overlap-Add.
pub fn inverse_stft(
    frames: &[Vec<Complex<f32>>],
    fft_size: usize,
    hop_size: usize,
) -> Vec<f32> {
    if frames.is_empty() {
        return Vec::new();
    }
    let num_frames = frames.len();
    let output_len = (num_frames - 1) * hop_size + fft_size;
    let mut output = vec![0.0f32; output_len];
    let mut window_sum = vec![0.0f32; output_len];
    let window = Hann_window(fft_size);
    
    let mut planner = FftPlanner::new();
    let ifft = planner.plan_fft_inverse(fft_size);
    
    for (f_idx, frame) in frames.iter().enumerate() {
        let mut buf = vec![Complex::new(0.0, 0.0); fft_size];
        for i in 0..=(fft_size / 2) {
            if i < frame.len() {
                buf[i] = frame[i];
                if i > 0 && i < fft_size / 2 {
                    buf[fft_size - i] = frame[i].conj();
                }
            }
        }
        
        ifft.process(&mut buf);
        
        let offset = f_idx * hop_size;
        for i in 0..fft_size {
            let val = buf[i].re / fft_size as f32;
            output[offset + i] += val * window[i];
            window_sum[offset + i] += window[i] * window[i];
        }
    }
    
    for i in 0..output.len() {
        if window_sum[i] > 1e-4 {
            output[i] /= window_sum[i];
        }
    }
    
    output
}

/// Computes energy envelope (mean square value) of each frame.
pub fn energy_envelope(signal: &[f32], fft_size: usize, hop_size: usize) -> Vec<f32> {
    if signal.len() < fft_size {
        return Vec::new();
    }
    let num_frames = (signal.len() - fft_size) / hop_size + 1;
    let mut envelope = Vec::with_capacity(num_frames);
    for f in 0..num_frames {
        let offset = f * hop_size;
        let frame = &signal[offset..offset + fft_size];
        let sum_sq: f32 = frame.iter().map(|&x| x * x).sum();
        envelope.push(sum_sq / fft_size as f32);
    }
    envelope
}

/// Computes Spectral Flatness Measure (SFM) of a single spectrum.
pub fn spectral_flatness(spectrum_mag: &[f32]) -> f32 {
    if spectrum_mag.is_empty() {
        return 0.0;
    }
    let n = spectrum_mag.len() as f32;
    let mut sum_val = 0.0f64;
    let mut sum_ln = 0.0f64;
    let eps = 1e-12f64;
    
    for &val in spectrum_mag {
        let p = (val * val) as f64 + eps;
        sum_val += p;
        sum_ln += p.ln();
    }
    
    let geom_mean = (sum_ln / n as f64).exp();
    let arith_mean = sum_val / n as f64;
    
    if arith_mean > eps {
        (geom_mean / arith_mean) as f32
    } else {
        0.0
    }
}

/// Computes Spectral Flux of a complex spectrogram.
pub fn spectral_flux(complex_frames: &[Vec<Complex<f32>>]) -> Vec<f32> {
    if complex_frames.len() < 2 {
        return Vec::new();
    }
    let num_frames = complex_frames.len();
    let num_bins = complex_frames[0].len();
    let mut flux = Vec::with_capacity(num_frames - 1);
    
    for f in 1..num_frames {
        let prev = &complex_frames[f - 1];
        let curr = &complex_frames[f];
        let mut diff_sum = 0.0f32;
        for b in 0..num_bins {
            let prev_mag = prev[b].norm();
            let curr_mag = curr[b].norm();
            let diff = (curr_mag - prev_mag).max(0.0);
            diff_sum += diff;
        }
        flux.push(diff_sum);
    }
    flux
}
