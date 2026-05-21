/**
 * Thin wrapper around Tauri invoke — falls back to stubs in browser dev mode
 * so the React UI works with `npm run dev` without the Tauri shell.
 */
import type { FrequencyConflict, GainStagingResult, JobQueued, DetectiveResult } from './types';

const IS_TAURI =
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (IS_TAURI) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mod = await import('@tauri-apps/api/core' as any);
    return (mod.invoke as (cmd: string, args?: Record<string, unknown>) => Promise<T>)(cmd, args);
  }
  return browserStub(cmd, args) as T;
}

// ── Stubs for browser-only dev ───────────────────────────────────────────────

function browserStub(cmd: string, args?: Record<string, unknown>): unknown {
  console.warn(`[Tesseract] Tauri not available — stub for: ${cmd}`);
  if (cmd === 'ingest_stem') return STUB_INGEST;
  if (cmd === 'get_waveform_peaks') return STUB_PEAKS;
  if (cmd === 'analyze_project') return STUB_ANALYSIS;
  if (cmd === 'perfect_time_analyze') return { job_id: 123, status: 'queued' };
  return null;
}

const STUB_PEAKS: [number, number][] = Array.from({ length: 800 }, (_, i) => {
  const t = i / 800;
  const v = Math.sin(t * Math.PI * 40) * 0.5 * Math.sin(t * Math.PI);
  return [v - 0.05, v + 0.05];
});

const STUB_INGEST = {
  track_id: 'stub',
  duration_secs: 8.0,
  sample_rate: 44100,
  channels: 2,
  peaks: STUB_PEAKS,
  rms_db: -18.0,
  peak_db: -6.0,
};

const STUB_ANALYSIS = {
  conflicts: [],
  gain_staging: [],
};

// ── Public API ────────────────────────────────────────────────────────────────

export interface IngestResult {
  track_id: string;
  duration_secs: number;
  sample_rate: number;
  channels: number;
  peaks: [number, number][];
  rms_db: number;
  peak_db: number;
}

export interface AnalysisResult {
  conflicts: FrequencyConflict[];
  gain_staging: GainStagingResult[];
}

export interface StemInput {
  track_id: string;
  file_path: string;
  tier: number;
}

export async function ingestStem(trackId: string, filePath: string): Promise<IngestResult> {
  return invoke('ingest_stem', { trackId, filePath });
}

export async function getWaveformPeaks(
  filePath: string,
  resolution: number,
): Promise<[number, number][]> {
  return invoke('get_waveform_peaks', { filePath, resolution });
}

export async function analyzeProject(
  stems: StemInput[],
  targetHeadroomDb: number,
): Promise<AnalysisResult> {
  return invoke('analyze_project', { stems, targetHeadroomDb });
}

export async function perfectTimeAnalyze(
  stemPath: string,
  projectBpm: number,
): Promise<JobQueued> {
  return invoke('perfect_time_analyze', { stemPath, projectBpm });
}
