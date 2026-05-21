use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::path::Path;
use std::fs::File;
use std::io::{Write, BufWriter};
use crate::audio::decode_file;
use crate::detective::DetectiveResult;

// ── Estruturas de Dados ───────────────────────────────────────────────────────

#[derive(Debug, serde::Serialize, serde::Deserialize, Clone, Copy)]
pub struct AnchorPoint {
    pub time_ms: f64, // Posição real no áudio
    pub beat: f64,    // Posição no grid da DAW
}

#[derive(serde::Serialize, Clone, Debug)]
pub struct PerfectTimeResult {
    pub output_path: String,          // WAV processado em cache temporário
    pub stretch_ratio: f64,
    pub method_used: StretchMethod,
    pub architect_suggestion: ArchitectSuggestion,
}

#[derive(serde::Serialize, Clone, Debug)]
pub enum StretchMethod {
    Slicing,
    PhaseVocoder,
}

#[derive(serde::Serialize, Clone, Debug)]
pub struct ArchitectSuggestion {
    pub suggested_beat: f64,
    pub suggested_bar: u32,
    pub confidence: f64,
    pub collision_warning: bool,
    pub collision_element_id: Option<String>,
}

// ── 1. Cache Determinístico (FNV-1a Hash) ─────────────────────────────────────

/// Gera um Hash determinístico rápido para usar como nome de arquivo no cache.
pub fn generate_cache_filename(stem_path: &str, project_bpm: f64, anchors: &Option<Vec<AnchorPoint>>) -> String {
    let mut hasher = DefaultHasher::new();
    
    stem_path.hash(&mut hasher);
    project_bpm.to_bits().hash(&mut hasher);
    
    if let Some(anchors_vec) = anchors {
        for a in anchors_vec {
            a.time_ms.to_bits().hash(&mut hasher);
            a.beat.to_bits().hash(&mut hasher);
        }
    } else {
        "auto".hash(&mut hasher);
    }
    
    // Retorna o hash em Hexadecimal (ex: "a1b2c3d4e5f6.wav")
    format!("{:x}.wav", hasher.finish())
}

// ── 2. Micro-Fades (Anti-Click) ───────────────────────────────────────────────

/// Aplica um fade-in e fade-out linear de 'fade_ms' nas bordas de um slice estéreo ou mono.
pub fn apply_micro_fade_multichannel(slice: &mut [f32], fade_ms: f32, sample_rate: u32, channels: u32) {
    if slice.is_empty() || channels == 0 { return; }
    
    let total_frames = slice.len() / channels as usize;
    let fade_frames = ((fade_ms * sample_rate as f32) / 1000.0) as usize;
    let fade_len = fade_frames.min(total_frames / 2); // Proteção contra fatias muito curtas

    for i in 0..fade_len {
        let t = i as f32 / fade_len as f32; // de 0.0 a 1.0
        
        // Fade-in no começo
        for c in 0..channels as usize {
            slice[i * channels as usize + c] *= t;
        }
        
        // Fade-out no final
        let end_frame = total_frames - 1 - i;
        for c in 0..channels as usize {
            slice[end_frame * channels as usize + c] *= t;
        }
    }
}

// ── 3. Motor de Fatiamento (Dynamic Pre-Roll) ─────────────────────────────────

const PRE_ROLL_MS: f64 = 5.0;
const FADE_OUT_MS: f64 = 2.0; 

/// Calcula o ponto exato onde a tesoura deve cortar, protegendo o ataque do Kick
/// e impedindo que o pre-roll invada a cauda da nota anterior (Flam protection).
pub fn calculate_slice_starts(onsets_ms: &[f64]) -> Vec<f64> {
    let mut starts = Vec::with_capacity(onsets_ms.len());
    
    for (i, &onset) in onsets_ms.iter().enumerate() {
        let ideal_start = onset - PRE_ROLL_MS;
        
        let safe_boundary = if i > 0 {
            onsets_ms[i - 1] + FADE_OUT_MS
        } else {
            0.0
        };
        
        let final_start = ideal_start.max(safe_boundary).max(0.0);
        starts.push(final_start);
    }
    
    starts
}

// ── 4. Alinhamento de Transientes via Penalty Subsequence DTW ─────────────────

/// Alinha transientes e o grid teórico de batidas aceitando penalidades por saltar
/// notas fantasma (ghost notes) ou batidas sem onsets correspondentes.
pub fn dtw_align_with_penalty(transients: &[f64], grid_beats: &[f64]) -> Vec<(usize, usize)> {
    let n = transients.len();
    let m = grid_beats.len();
    if n == 0 || m == 0 {
        return Vec::new();
    }

    // Penalidade por saltar um transiente (ghost note) ou uma batida (silêncio)
    const SKIP_TRANSIENT_PENALTY: f64 = 250.0; // ms
    const SKIP_BEAT_PENALTY: f64 = 250.0;      // ms

    let mut dp = vec![vec![f64::INFINITY; m + 1]; n + 1];
    let mut choice = vec![vec![0; m + 1]; n + 1]; // 1: match, 2: skip trans, 3: skip beat

    dp[0][0] = 0.0;

    for i in 1..=n {
        dp[i][0] = i as f64 * SKIP_TRANSIENT_PENALTY;
        choice[i][0] = 2;
    }
    for j in 1..=m {
        dp[0][j] = j as f64 * SKIP_BEAT_PENALTY;
        choice[0][j] = 3;
    }

    for i in 1..=n {
        for j in 1..=m {
            let match_cost = (transients[i - 1] - grid_beats[j - 1]).abs();
            let cost_match = dp[i - 1][j - 1] + match_cost;
            let cost_skip_trans = dp[i - 1][j] + SKIP_TRANSIENT_PENALTY;
            let cost_skip_beat = dp[i][j - 1] + SKIP_BEAT_PENALTY;

            let mut min_cost = cost_match;
            let mut best_choice = 1;

            if cost_skip_trans < min_cost {
                min_cost = cost_skip_trans;
                best_choice = 2;
            }
            if cost_skip_beat < min_cost {
                min_cost = cost_skip_beat;
                best_choice = 3;
            }

            dp[i][j] = min_cost;
            choice[i][j] = best_choice;
        }
    }

    // Backtrace para recuperar o caminho de menor custo
    let mut matches = Vec::new();
    let mut i = n;
    let mut j = m;

    while i > 0 && j > 0 {
        match choice[i][j] {
            1 => {
                matches.push((i - 1, j - 1));
                i -= 1;
                j -= 1;
            }
            2 => {
                i -= 1;
            }
            3 => {
                j -= 1;
            }
            _ => unreachable!(),
        }
    }

    matches.reverse();
    matches
}

// ── 5. Curva de Warp por Natural Cubic Spline Solver ──────────────────────────

pub struct NaturalCubicSpline {
    x: Vec<f64>,
    y: Vec<f64>,
    a: Vec<f64>,
    b: Vec<f64>,
    c: Vec<f64>,
    d: Vec<f64>,
}

impl NaturalCubicSpline {
    pub fn new(mut points: Vec<(f64, f64)>) -> Self {
        points.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap());
        
        let n = points.len();
        let mut x = Vec::with_capacity(n);
        let mut y = Vec::with_capacity(n);
        for p in points {
            x.push(p.0);
            y.push(p.1);
        }
        
        let mut h = vec![0.0; n - 1];
        for i in 0..n-1 {
            h[i] = x[i+1] - x[i];
        }
        
        let mut l = vec![1.0; n];
        let mut mu = vec![0.0; n];
        let mut z = vec![0.0; n];
        
        for i in 1..n-1 {
            let g = 3.0 * (y[i+1] - y[i]) / h[i] - 3.0 * (y[i] - y[i-1]) / h[i-1];
            l[i] = 2.0 * (x[i+1] - x[i-1]) - h[i-1] * mu[i-1];
            mu[i] = h[i] / l[i];
            z[i] = (g - h[i-1] * z[i-1]) / l[i];
        }
        
        let mut c = vec![0.0; n];
        for i in (1..n-1).rev() {
            c[i] = z[i] - mu[i] * c[i+1];
        }
        
        let mut b = vec![0.0; n - 1];
        let mut d = vec![0.0; n - 1];
        for i in 0..n-1 {
            b[i] = (y[i+1] - y[i]) / h[i] - h[i] * (c[i+1] + 2.0 * c[i]) / 3.0;
            d[i] = (c[i+1] - c[i]) / (3.0 * h[i]);
        }
        
        let mut a = y.clone();
        a.pop();

        Self { x, y, a, b, c, d }
    }
    
    pub fn interpolate(&self, val: f64) -> f64 {
        let n = self.x.len();
        if n == 0 { return 0.0; }
        if n == 1 { return self.y[0]; }
        
        if val <= self.x[0] {
            let t = val - self.x[0];
            let slope = self.b[0].clamp(0.2, 4.0);
            return self.y[0] + t * slope;
        }
        if val >= self.x[n - 1] {
            let last_idx = n - 2;
            let t = val - self.x[n - 1];
            let h = self.x[n - 1] - self.x[n - 2];
            let slope = (self.b[last_idx] + 2.0 * self.c[last_idx] * h + 3.0 * self.d[last_idx] * h * h).clamp(0.2, 4.0);
            return self.y[n - 1] + t * slope;
        }
        
        let mut idx = 0;
        let mut low = 0;
        let mut high = n - 2;
        while low <= high {
            let mid = (low + high) / 2;
            if val >= self.x[mid] && val <= self.x[mid + 1] {
                idx = mid;
                break;
            } else if val < self.x[mid] {
                if mid == 0 { break; }
                high = mid - 1;
            } else {
                low = mid + 1;
            }
        }
        
        let t = val - self.x[idx];
        let raw_y = self.a[idx] + self.b[idx] * t + self.c[idx] * t * t + self.d[idx] * t * t * t;
        
        // Clamping militar (limitador de velocidade/stretch ratio) para impedir overshoot de Runge
        let min_y = self.y[idx] + 0.2 * t;
        let max_y = self.y[idx] + 4.0 * t;
        raw_y.clamp(min_y, max_y)
    }
}

pub fn natural_cubic_spline_interpolate(anchors: &[AnchorPoint], target_time_ms: f64, project_bpm: f64) -> f64 {
    let n = anchors.len();
    if n == 0 { return target_time_ms; }
    if n == 1 {
        let target_anchor_ms = anchors[0].beat * (60.0 / project_bpm) * 1000.0;
        return target_time_ms - target_anchor_ms + anchors[0].time_ms;
    }
    
    let points: Vec<(f64, f64)> = anchors.iter().map(|a| {
        let t_target = a.beat * (60.0 / project_bpm) * 1000.0;
        (t_target, a.time_ms)
    }).collect();
    
    if n == 2 {
        let mut sorted_points = points;
        sorted_points.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap());
        let x0 = sorted_points[0].0;
        let y0 = sorted_points[0].1;
        let x1 = sorted_points[1].0;
        let y1 = sorted_points[1].1;
        if (x1 - x0).abs() < 1e-6 { return y0; }
        return y0 + (target_time_ms - x0) * (y1 - y0) / (x1 - x0);
    }
    
    let spline = NaturalCubicSpline::new(points);
    spline.interpolate(target_time_ms)
}

// ── 6. Escrita Física de Arquivo WAV (IEEE Float 32-bit) ──────────────────────

pub fn write_wav_file(path: &Path, samples: &[f32], sample_rate: u32, channels: u16) -> Result<(), String> {
    let file = File::create(path).map_err(|e| format!("Falha ao criar arquivo de áudio WAV: {}", e))?;
    let mut writer = BufWriter::new(file);

    let data_size = (samples.len() * 4) as u32;
    let chunk_size = 36 + data_size;

    writer.write_all(b"RIFF").map_err(|e| e.to_string())?;
    writer.write_all(&chunk_size.to_le_bytes()).map_err(|e| e.to_string())?;
    writer.write_all(b"WAVE").map_err(|e| e.to_string())?;

    writer.write_all(b"fmt ").map_err(|e| e.to_string())?;
    writer.write_all(&16u32.to_le_bytes()).map_err(|e| e.to_string())?; // Subchunk1Size
    writer.write_all(&3u16.to_le_bytes()).map_err(|e| e.to_string())?;  // AudioFormat = 3 (IEEE float)
    writer.write_all(&channels.to_le_bytes()).map_err(|e| e.to_string())?;
    writer.write_all(&sample_rate.to_le_bytes()).map_err(|e| e.to_string())?;
    
    let byte_rate = sample_rate * channels as u32 * 4;
    let block_align = channels * 4;
    writer.write_all(&byte_rate.to_le_bytes()).map_err(|e| e.to_string())?;
    writer.write_all(&block_align.to_le_bytes()).map_err(|e| e.to_string())?;
    writer.write_all(&32u16.to_le_bytes()).map_err(|e| e.to_string())?; // BitsPerSample

    writer.write_all(b"data").map_err(|e| e.to_string())?;
    writer.write_all(&data_size.to_le_bytes()).map_err(|e| e.to_string())?;

    for &sample in samples {
        writer.write_all(&sample.to_le_bytes()).map_err(|e| e.to_string())?;
    }

    writer.flush().map_err(|e| format!("Falha ao descarregar gravação WAV: {}", e))?;
    Ok(())
}

// ── 7. Motor de Correção de Tempo por Slicing (Fase 4) ────────────────────────

/// Processa o fatiamento e remontagem de áudio com base no alinhamento de transientes.
pub fn process_slicing(
    stem_path: &str,
    project_bpm: f64,
    anchors: Option<Vec<AnchorPoint>>,
    detective_result: &DetectiveResult,
    cache_dir: &Path,
) -> Result<PerfectTimeResult, String> {
    let decoded = decode_file(Path::new(stem_path))?;
    let sample_rate = decoded.sample_rate;
    let channels = decoded.channels;
    let total_duration_ms = decoded.duration_secs * 1000.0;
    
    // 1. Determinar os pontos de controle (Matchings)
    let control_points = if let Some(mut manual_anchors) = anchors.clone() {
        // Ordenar âncoras manualmente passadas pelo usuário
        manual_anchors.sort_by(|a, b| a.time_ms.partial_cmp(&b.time_ms).unwrap());
        let mut pts = Vec::new();
        // Adiciona o início do arquivo
        pts.push((0.0, 0.0));
        for a in manual_anchors {
            let t_target = a.beat * (60.0 / project_bpm) * 1000.0;
            pts.push((a.time_ms, t_target));
        }
        // Adiciona o final do arquivo
        let last_beat = if pts.len() > 1 {
            let last_a = pts.last().unwrap();
            last_a.1 + (total_duration_ms - last_a.0)
        } else {
            total_duration_ms
        };
        pts.push((total_duration_ms, last_beat));
        pts
    } else {
        // Alinhamento automático via Penalty DTW
        let beat_len_ms = 60000.0 / project_bpm;
        let num_beats = (total_duration_ms / beat_len_ms).ceil() as usize + 8;
        let grid_beats: Vec<f64> = (0..num_beats).map(|i| i as f64 * beat_len_ms).collect();
        
        let matches = dtw_align_with_penalty(&detective_result.transients_ms, &grid_beats);
        
        let mut pts = Vec::new();
        pts.push((0.0, 0.0));
        for &(orig_idx, target_idx) in &matches {
            pts.push((
                detective_result.transients_ms[orig_idx],
                grid_beats[target_idx],
            ));
        }
        let last_beat = if pts.len() > 1 {
            let last_a = pts.last().unwrap();
            last_a.1 + (total_duration_ms - last_a.0)
        } else {
            total_duration_ms
        };
        pts.push((total_duration_ms, last_beat));
        pts
    };

    // 2. Separar as fatias
    let k = control_points.len() - 1;
    let mut onsets_orig = Vec::with_capacity(k);
    for i in 0..k {
        onsets_orig.push(control_points[i].0);
    }
    let slice_starts_ms = calculate_slice_starts(&onsets_orig);

    // Determinar a duração total da saída
    let last_pt = control_points.last().unwrap();
    let target_end_ms = last_pt.1;
    let target_end_frame = (target_end_ms * sample_rate as f64 / 1000.0) as usize;
    
    // Alocar buffer de saída com silêncio
    let mut output_samples = vec![0.0f32; target_end_frame * channels as usize];

    for n in 0..k {
        let orig_start_ms = slice_starts_ms[n];
        let orig_end_ms = if n + 1 < k { slice_starts_ms[n + 1] } else { total_duration_ms };
        
        let onset_orig = control_points[n].0;
        let onset_target = control_points[n].1;
        
        let offset_ms = onset_orig - orig_start_ms;
        let target_start_ms = (onset_target - offset_ms).max(0.0);
        
        let start_frame = (orig_start_ms * sample_rate as f64 / 1000.0) as usize;
        let end_frame = (orig_end_ms * sample_rate as f64 / 1000.0) as usize;
        
        if end_frame <= start_frame || start_frame * channels as usize >= decoded.samples.len() {
            continue;
        }

        let slice_samples_start = start_frame * channels as usize;
        let slice_samples_end = (end_frame * channels as usize).min(decoded.samples.len());
        
        let mut slice = decoded.samples[slice_samples_start..slice_samples_end].to_vec();
        
        // Aplica micro-fades de 2ms nas bordas da fatia
        apply_micro_fade_multichannel(&mut slice, 2.0, sample_rate, channels as u32);

        // Copiar fatia misturando (overlap-add) no buffer de saída
        let target_start_frame = (target_start_ms * sample_rate as f64 / 1000.0) as usize;
        let target_samples_start = target_start_frame * channels as usize;
        
        let copy_len = slice.len().min(output_samples.len().saturating_sub(target_samples_start));
        for i in 0..copy_len {
            output_samples[target_samples_start + i] += slice[i];
        }
    }

    // 3. Salvar arquivo no diretório de cache
    let filename = generate_cache_filename(stem_path, project_bpm, &anchors);
    let out_path = cache_dir.join(&filename);
    write_wav_file(&out_path, &output_samples, sample_rate, channels as u16)?;

    // Calcular o stretch ratio médio para a estatística
    let stretch_ratio = if total_duration_ms > 0.0 {
        target_end_ms / total_duration_ms
    } else {
        1.0
    };

    Ok(PerfectTimeResult {
        output_path: out_path.to_string_lossy().to_string(),
        stretch_ratio,
        method_used: StretchMethod::Slicing,
        architect_suggestion: ArchitectSuggestion {
            suggested_beat: 0.0,
            suggested_bar: 0,
            confidence: detective_result.confidence,
            collision_warning: false,
            collision_element_id: None,
        },
    })
}
