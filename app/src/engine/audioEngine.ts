/**
 * Client Tauri para o motor de playback nativo em Rust (rodio/cpal/WASAPI).
 * Sem Web Audio API. O Rust reporta pos_secs via Sink::get_pos().
 */

const IS_TAURI =
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (IS_TAURI) {
    const { invoke: ti } = await import('@tauri-apps/api/core');
    return ti<T>(cmd, args);
  }
  return browserStub(cmd, args) as T;
}

// ── Stubs browser dev ─────────────────────────────────────────────────────────
let _sSecs = 0, _sPlaying = false, _sWall = 0;

function browserStub(cmd: string, args?: Record<string, unknown>): unknown {
  if (cmd === 'pb_play')   { _sPlaying = true;  _sWall = performance.now() / 1000 - _sSecs; return null; }
  if (cmd === 'pb_pause')  { _sSecs = performance.now() / 1000 - _sWall; _sPlaying = false; return null; }
  if (cmd === 'pb_resume') { _sWall = performance.now() / 1000 - _sSecs; _sPlaying = true; return null; }
  if (cmd === 'pb_stop')   { _sSecs = 0; _sPlaying = false; return null; }
  if (cmd === 'pb_seek')   { _sSecs = (args?.secs as number) ?? 0; return null; }
  if (cmd === 'pb_get_pos') {
    if (_sPlaying) _sSecs = performance.now() / 1000 - _sWall;
    return { pos_secs: _sSecs, sample_rate: 44100, is_playing: _sPlaying };
  }
  if (cmd === 'ingest_stem') return STUB_INGEST;
  if (cmd === 'get_waveform_peaks') return STUB_PEAKS;
  if (cmd === 'analyze_project') return { conflicts: [], gain_staging: [] };
  return null;
}

const STUB_PEAKS: [number, number][] = Array.from({ length: 800 }, (_, i) => {
  const t = i / 800, v = Math.sin(t * Math.PI * 40) * 0.5 * Math.sin(t * Math.PI);
  return [v - 0.05, v + 0.05];
});
const STUB_INGEST = {
  track_id: 'stub', duration_secs: 8.0, sample_rate: 44100,
  channels: 2, peaks: STUB_PEAKS, rms_db: -18.0, peak_db: -6.0,
};

// ── API pública ───────────────────────────────────────────────────────────────

export interface PlayheadInfo {
  pos_secs: number;
  sample_rate: number;
  is_playing: boolean;
}

export const play    = (offsetSecs: number) => invoke<void>('pb_play',   { offsetSecs });
export const pause   = ()                    => invoke<void>('pb_pause');
export const resume  = ()                    => invoke<void>('pb_resume');
export const stop    = ()                    => invoke<void>('pb_stop');
export const seekTo  = (secs: number)        => invoke<void>('pb_seek',   { secs });
export const getPos  = ()                    => invoke<PlayheadInfo>('pb_get_pos');
export const setVolume = (trackId: string, volume: number) =>
  invoke<void>('pb_set_volume', { trackId, volume });
export const setMuted  = (trackId: string, muted: boolean) =>
  invoke<void>('pb_set_muted',  { trackId, muted });
