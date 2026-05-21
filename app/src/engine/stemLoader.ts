/**
 * Shared stem loading utilities — called by both the drag-drop handler
 * and the native file dialog button.
 */
import { ingestStem } from './tauri';
import type { StemData } from '../store/stemStore';

const IS_TAURI =
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

const AUDIO_EXTS = ['wav', 'flac', 'mp3', 'aac', 'ogg', 'aiff', 'aif'];

export function isAudioFile(path: string): boolean {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  return AUDIO_EXTS.includes(ext);
}

/** Decode a stem file and return structured data for the store. */
export async function loadStemFromPath(
  trackId: string,
  filePath: string,
): Promise<StemData> {
  const result = await ingestStem(trackId, filePath);
  return {
    trackId,
    filePath,
    durationSecs: result.duration_secs,
    sampleRate: result.sample_rate,
    channels: result.channels,
    peaks: result.peaks as [number, number][],
    rmsDb: result.rms_db,
    peakDb: result.peak_db,
  };
}

/**
 * Open a native file picker dialog and return the selected file path.
 * In browser dev mode, falls back to a hidden <input type="file"> and
 * returns a blob URL (stubs handle the Rust side).
 */
export async function pickAudioFile(): Promise<string | null> {
  if (IS_TAURI) {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const result = await open({
      multiple: false,
      filters: [
        { name: 'Audio', extensions: AUDIO_EXTS },
      ],
    });
    return typeof result === 'string' ? result : null;
  }

  // Browser fallback: invisible <input>
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = AUDIO_EXTS.map((e) => `.${e}`).join(',');
    input.onchange = () => {
      const file = input.files?.[0];
      resolve(file ? URL.createObjectURL(file) : null);
    };
    input.click();
  });
}
