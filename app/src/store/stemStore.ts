import { create } from 'zustand';
import type { FrequencyConflict, GainStagingResult } from '../engine/types';

export interface StemData {
  trackId: string;
  filePath: string;
  durationSecs: number;
  sampleRate: number;
  channels: number;
  /** Waveform peaks [min, max] for canvas rendering */
  peaks: [number, number][];
  rmsDb: number;
  peakDb: number;
}

export type AnalysisStatus = 'idle' | 'running' | 'done' | 'error';

interface StemState {
  /** Map of trackId → stem data */
  stems: Record<string, StemData>;
  /** Frequency conflicts detected in last analysis */
  conflicts: FrequencyConflict[];
  /** Gain staging recommendations */
  gainStaging: GainStagingResult[];
  analysisStatus: AnalysisStatus;
  analysisError: string | null;

  setStem: (data: StemData) => void;
  removeStem: (trackId: string) => void;
  setAnalysisResult: (conflicts: FrequencyConflict[], gainStaging: GainStagingResult[]) => void;
  setAnalysisStatus: (status: AnalysisStatus, error?: string) => void;
}

export const useStemStore = create<StemState>((set) => ({
  stems: {},
  conflicts: [],
  gainStaging: [],
  analysisStatus: 'idle',
  analysisError: null,

  setStem: (data) =>
    set((state) => ({
      stems: { ...state.stems, [data.trackId]: data },
    })),

  removeStem: (trackId) =>
    set((state) => {
      const { [trackId]: _, ...rest } = state.stems;
      return { stems: rest };
    }),

  setAnalysisResult: (conflicts, gainStaging) =>
    set({ conflicts, gainStaging, analysisStatus: 'done', analysisError: null }),

  setAnalysisStatus: (status, error) =>
    set({ analysisStatus: status, analysisError: error ?? null }),
}));
