/**
 * Motor de áudio nativo — rodio/cpal (WASAPI no Windows).
 *
 * Posição reportada via Sink::get_pos() — rodio rastreia a posição real
 * do hardware (depois de todo buffering interno), não apenas quando os
 * frames foram gerados. Isso é o que o usuário ouve.
 *
 * OutputStream é !Send no WASAPI → fica preso em thread dedicado.
 * PlaybackEngine só expõe OutputStreamHandle + Sink (ambos Send+Sync).
 */

use rodio::{dynamic_mixer, Decoder, OutputStreamHandle, Sink, Source};
use std::collections::HashMap;
use std::fs::File;
use std::io::BufReader;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

pub const MIXER_RATE: u32 = 44100;
const MIXER_CHANNELS: u16 = 2;

#[derive(Clone)]
struct StemEntry {
    path: String,
    volume: f32,
    muted: bool,
}

pub struct PlaybackEngine {
    handle: OutputStreamHandle,
    sink: Mutex<Option<Sink>>,
    stems: Mutex<HashMap<String, StemEntry>>,
    is_playing: Arc<AtomicBool>,
    paused_at_secs: Mutex<f64>,
}

impl PlaybackEngine {
    pub fn new() -> Result<Self, String> {
        let (tx, rx) = std::sync::mpsc::channel::<Result<OutputStreamHandle, String>>();

        std::thread::Builder::new()
            .name("tesseract-audio-device".into())
            .spawn(move || {
                let result = rodio::OutputStream::try_default()
                    .map(|(_stream, handle)| {
                        std::mem::forget(_stream); // mantém device aberto
                        handle
                    })
                    .map_err(|e| e.to_string());
                tx.send(result).ok();
                loop { std::thread::sleep(Duration::from_secs(86400)); }
            })
            .map_err(|e| e.to_string())?;

        let handle = rx
            .recv()
            .map_err(|_| "audio device thread failed".to_string())??;

        Ok(Self {
            handle,
            sink: Mutex::new(None),
            stems: Mutex::new(HashMap::new()),
            is_playing: Arc::new(AtomicBool::new(false)),
            paused_at_secs: Mutex::new(0.0),
        })
    }

    // ── Stem management ───────────────────────────────────────────────────────

    pub fn register_stem(&self, track_id: String, path: String, volume: f32) {
        self.stems.lock().unwrap().insert(track_id, StemEntry { path, volume, muted: false });
    }

    pub fn set_volume(&self, track_id: &str, v: f32) {
        if let Some(s) = self.stems.lock().unwrap().get_mut(track_id) { s.volume = v; }
    }

    pub fn set_muted(&self, track_id: &str, m: bool) {
        if let Some(s) = self.stems.lock().unwrap().get_mut(track_id) { s.muted = m; }
    }

    // ── Playback ──────────────────────────────────────────────────────────────

    pub fn play(&self, offset_secs: f64) -> Result<(), String> {
        // Para sink anterior
        if let Some(old) = self.sink.lock().unwrap().take() { old.stop(); }
        self.is_playing.store(false, Ordering::Relaxed);

        let stems = self.stems.lock().unwrap().clone();
        if stems.is_empty() { return Ok(()); }

        let (controller, mixer_src) = dynamic_mixer::mixer::<f32>(MIXER_CHANNELS, MIXER_RATE);

        for entry in stems.values() {
            let file = File::open(&entry.path)
                .map_err(|e| format!("open {}: {e}", entry.path))?;
            let source = Decoder::new(BufReader::new(file))
                .map_err(|e| format!("decode {}: {e}", entry.path))?
                .convert_samples::<f32>();
            let vol = if entry.muted { 0.0 } else { entry.volume };
            controller.add(source.amplify(vol));
        }

        let sink = Sink::try_new(&self.handle).map_err(|e| e.to_string())?;
        sink.append(mixer_src);

        if offset_secs > 0.001 {
            sink.try_seek(Duration::from_secs_f64(offset_secs))
                .map_err(|e| format!("seek: {e}"))?;
        }

        sink.play();
        self.is_playing.store(true, Ordering::Relaxed);
        *self.paused_at_secs.lock().unwrap() = offset_secs;
        *self.sink.lock().unwrap() = Some(sink);
        Ok(())
    }

    pub fn pause(&self) {
        let guard = self.sink.lock().unwrap();
        if let Some(sink) = guard.as_ref() {
            // Salva posição ANTES de pausar
            *self.paused_at_secs.lock().unwrap() = sink.get_pos().as_secs_f64();
            sink.pause();
            self.is_playing.store(false, Ordering::Relaxed);
        }
    }

    pub fn resume(&self) -> Result<(), String> {
        let offset = *self.paused_at_secs.lock().unwrap();
        self.play(offset)
    }

    pub fn stop(&self) {
        if let Some(sink) = self.sink.lock().unwrap().take() { sink.stop(); }
        self.is_playing.store(false, Ordering::Relaxed);
        *self.paused_at_secs.lock().unwrap() = 0.0;
    }

    pub fn seek_to(&self, secs: f64) -> Result<(), String> {
        let was_playing = self.is_playing.load(Ordering::Relaxed);
        *self.paused_at_secs.lock().unwrap() = secs;
        if was_playing { self.play(secs) } else {
            if let Some(sink) = self.sink.lock().unwrap().as_ref() {
                sink.try_seek(Duration::from_secs_f64(secs))
                    .map_err(|e| format!("seek: {e}"))?;
            }
            Ok(())
        }
    }

    // ── Posição ───────────────────────────────────────────────────────────────

    /// Posição real do hardware via Sink::get_pos().
    /// Rodio rastreia quando os frames saem do buffer para o driver —
    /// não quando foram gerados. É o que o usuário ouve.
    pub fn get_pos_secs(&self) -> f64 {
        self.sink
            .lock()
            .unwrap()
            .as_ref()
            .map(|s| s.get_pos().as_secs_f64())
            .unwrap_or_else(|| *self.paused_at_secs.lock().unwrap())
    }

    pub fn sample_rate(&self) -> u32 { MIXER_RATE }

    pub fn is_playing(&self) -> bool {
        self.is_playing.load(Ordering::Relaxed)
    }
}
