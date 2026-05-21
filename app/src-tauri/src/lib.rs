mod audio;
mod dsp;
mod dsp_primitives;
mod detective;
mod slicer;
mod commands;
mod playback;

use playback::PlaybackEngine;

pub fn run() {
    let engine = PlaybackEngine::new()
        .expect("failed to initialise native audio engine");

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(engine)
        .invoke_handler(tauri::generate_handler![
            // Análise espectral (offline DSP)
            commands::ingest_stem,
            commands::analyze_project,
            commands::get_waveform_peaks,
            commands::perfect_time_analyze,
            commands::perfect_time_process,
            // Playback nativo (rodio / cpal / WASAPI)
            commands::pb_play,
            commands::pb_pause,
            commands::pb_resume,
            commands::pb_stop,
            commands::pb_seek,
            commands::pb_get_pos,
            commands::pb_set_volume,
            commands::pb_set_muted,
            commands::pb_register_stem,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Tesseract Engine");
}
