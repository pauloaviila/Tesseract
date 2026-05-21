use std::path::Path;
use serde::{Deserialize, Serialize};
use tauri::command;
use tauri::Emitter;

use crate::audio::{decode_file, to_mono, compute_peaks};
use crate::dsp::{stft, detect_conflicts, measure_levels, gain_for_target_peak, FrequencyConflict, StemSpec};
use crate::playback::PlaybackEngine;
use crate::detective::{run_detective, DetectiveResult};
use std::sync::atomic::{AtomicU32, Ordering};

const FFT_SIZE: usize = 2048;
const HOP_SIZE: usize = 512;
const WAVEFORM_RESOLUTION: usize = 4000;

// ── Ingest ────────────────────────────────────────────────────────────────────

#[derive(Serialize)]
pub struct IngestResult {
    pub track_id: String,
    pub duration_secs: f64,
    pub sample_rate: u32,
    pub channels: usize,
    pub peaks: Vec<[f32; 2]>,
    pub rms_db: f32,
    pub peak_db: f32,
}

#[command]
pub fn ingest_stem(
    track_id: String,
    file_path: String,
    engine: tauri::State<PlaybackEngine>,
) -> Result<IngestResult, String> {
    let path = Path::new(&file_path);
    let audio = decode_file(path)?;
    let mono = to_mono(&audio);
    let peaks = compute_peaks(&mono, WAVEFORM_RESOLUTION)
        .into_iter()
        .map(|(lo, hi)| [lo, hi])
        .collect();

    let (rms, peak) = measure_levels(&mono);
    let rms_db = if rms < 1e-9 { -96.0 } else { 20.0 * rms.log10() };
    let peak_db = if peak < 1e-9 { -96.0 } else { 20.0 * peak.log10() };

    engine.register_stem(track_id.clone(), file_path, 1.0);

    Ok(IngestResult {
        track_id,
        duration_secs: audio.duration_secs,
        sample_rate: audio.sample_rate,
        channels: audio.channels,
        peaks,
        rms_db,
        peak_db,
    })
}

// ── Native Playback ───────────────────────────────────────────────────────────

#[derive(Serialize)]
pub struct NativePlayheadInfo {
    /// Posição real em segundos — Sink::get_pos() rastreia output do driver,
    /// não apenas frames gerados. Sem buffering phantom.
    pub pos_secs: f64,
    pub sample_rate: u32,
    pub is_playing: bool,
}

#[command]
pub fn pb_play(offset_secs: f64, engine: tauri::State<PlaybackEngine>) -> Result<(), String> {
    engine.play(offset_secs)
}

#[command]
pub fn pb_pause(engine: tauri::State<PlaybackEngine>) {
    engine.pause();
}

#[command]
pub fn pb_resume(engine: tauri::State<PlaybackEngine>) -> Result<(), String> {
    engine.resume()
}

#[command]
pub fn pb_stop(engine: tauri::State<PlaybackEngine>) {
    engine.stop();
}

#[command]
pub fn pb_seek(secs: f64, engine: tauri::State<PlaybackEngine>) -> Result<(), String> {
    engine.seek_to(secs)
}

/// Âncora de dead reckoning — chamado a cada ~50ms pelo frontend.
/// pos_secs = Sink::get_pos().as_secs_f64() = posição real do hardware.
#[command]
pub fn pb_get_pos(engine: tauri::State<PlaybackEngine>) -> NativePlayheadInfo {
    NativePlayheadInfo {
        pos_secs:    engine.get_pos_secs(),
        sample_rate: engine.sample_rate(),
        is_playing:  engine.is_playing(),
    }
}

#[command]
pub fn pb_set_volume(track_id: String, volume: f32, engine: tauri::State<PlaybackEngine>) {
    engine.set_volume(&track_id, volume);
}

#[command]
pub fn pb_set_muted(track_id: String, muted: bool, engine: tauri::State<PlaybackEngine>) {
    engine.set_muted(&track_id, muted);
}

// ── Waveform peaks ────────────────────────────────────────────────────────────

#[command]
pub fn get_waveform_peaks(
    file_path: String,
    resolution: usize,
) -> Result<Vec<[f32; 2]>, String> {
    let path = Path::new(&file_path);
    let audio = decode_file(path)?;
    let mono = to_mono(&audio);
    let peaks = compute_peaks(&mono, resolution)
        .into_iter()
        .map(|(lo, hi)| [lo, hi])
        .collect();
    Ok(peaks)
}

// ── Spectral analysis (offline batch) ────────────────────────────────────────

#[derive(Deserialize)]
pub struct StemInput {
    pub track_id: String,
    pub file_path: String,
    pub tier: u8,
}

#[derive(Serialize)]
pub struct AnalysisResult {
    pub conflicts: Vec<FrequencyConflict>,
    pub gain_staging: Vec<GainStagingResult>,
}

#[derive(Serialize)]
pub struct GainStagingResult {
    pub track_id: String,
    pub current_peak_db: f32,
    pub required_gain_db: f32,
}

#[command]
pub fn analyze_project(
    stems: Vec<StemInput>,
    target_headroom_db: f32,
) -> Result<AnalysisResult, String> {
    use rayon::prelude::*;

    let specs: Vec<Result<(StemSpec, GainStagingResult), String>> = stems
        .par_iter()
        .map(|input| {
            let path = Path::new(&input.file_path);
            let audio = decode_file(path)?;
            let mono = to_mono(&audio);
            let spectrogram = stft(&mono, FFT_SIZE, HOP_SIZE, audio.sample_rate);
            let (_, peak) = measure_levels(&mono);
            let peak_db = if peak < 1e-9 { -96.0 } else { 20.0 * peak.log10() };
            let gain_linear = gain_for_target_peak(peak, target_headroom_db);
            let required_gain_db = 20.0 * gain_linear.log10();
            let spec = StemSpec { id: input.track_id.clone(), tier: input.tier, spectrogram };
            let staging = GainStagingResult {
                track_id: input.track_id.clone(),
                current_peak_db: peak_db,
                required_gain_db,
            };
            Ok((spec, staging))
        })
        .collect();

    let mut stem_specs = Vec::new();
    let mut gain_staging = Vec::new();
    for result in specs {
        let (spec, staging) = result?;
        stem_specs.push(spec);
        gain_staging.push(staging);
    }
    let conflicts = detect_conflicts(&stem_specs);
    Ok(AnalysisResult { conflicts, gain_staging })
}

// ── Perfect Time: Motor 1 (Detective) ──────────────────────────────────────────

static NEXT_JOB_ID: AtomicU32 = AtomicU32::new(1);

#[derive(Serialize)]
pub struct JobQueued {
    pub job_id: u32,
    pub status: String,
}

#[derive(Serialize, Clone)]
pub struct DetectiveEventPayload {
    pub job_id: u32,
    pub stem_path: String,
    pub status: String,
    pub result: Option<DetectiveResult>,
    pub error: Option<String>,
}

#[command]
pub async fn perfect_time_analyze(
    stem_path: String,
    project_bpm: f64,
    app: tauri::AppHandle,
) -> Result<JobQueued, String> {
    let job_id = NEXT_JOB_ID.fetch_add(1, Ordering::SeqCst);
    let handle = app.clone();
    
    tauri::async_runtime::spawn(async move {
        let path = stem_path.clone();
        let path_clone = stem_path.clone();
        let run_result = tauri::async_runtime::spawn_blocking(move || {
            run_detective(&path, project_bpm)
        }).await;

        match run_result {
            Ok(Ok(result)) => {
                handle.emit("perfect_time_analyzed", DetectiveEventPayload {
                    job_id,
                    stem_path: path_clone,
                    status: "success".to_string(),
                    result: Some(result),
                    error: None,
                }).ok();
            }
            Ok(Err(err)) => {
                handle.emit("perfect_time_analyzed", DetectiveEventPayload {
                    job_id,
                    stem_path: path_clone,
                    status: "error".to_string(),
                    result: None,
                    error: Some(err),
                }).ok();
            }
            Err(join_err) => {
                handle.emit("perfect_time_analyzed", DetectiveEventPayload {
                    job_id,
                    stem_path: path_clone,
                    status: "error".to_string(),
                    result: None,
                    error: Some(format!("Thread join error: {}", join_err)),
                }).ok();
            }
        }
    });

    Ok(JobQueued {
        job_id,
        status: "queued".to_string(),
    })
}
