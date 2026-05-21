import { create } from 'zustand';
import type { FrequencyConflict, GainStagingResult, DetectiveResult, AnchorPoint, PerfectTimeResult } from '../engine/types';

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
  detectiveResult?: DetectiveResult;
  processingState?: 'idle' | 'queued' | 'analyzing' | 'awaiting_anchors' | 'processed';
  anchors?: AnchorPoint[];
  perfectTimeResult?: PerfectTimeResult;
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
  setStemDetectiveResult: (trackId: string, result: DetectiveResult) => void;
  setStemProcessingState: (trackId: string, state: 'idle' | 'queued' | 'analyzing' | 'awaiting_anchors' | 'processed') => void;
  setStemAnchors: (trackId: string, anchors: AnchorPoint[]) => void;
  setStemPerfectTimeResult: (trackId: string, result: PerfectTimeResult) => void;
  clearStemPerfectTimeResult: (trackId: string) => void;
  resetStemAnchors: (trackId: string) => void;
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

  setStemDetectiveResult: (trackId, result) =>
    set((state) => {
      const stem = state.stems[trackId];
      if (!stem) return {};
      return {
        stems: {
          ...state.stems,
          [trackId]: { ...stem, detectiveResult: result },
        },
      };
    }),

  setStemProcessingState: (trackId, processingState) =>
    set((state) => {
      const stem = state.stems[trackId];
      if (!stem) return {};
      return {
        stems: {
          ...state.stems,
          [trackId]: { ...stem, processingState },
        },
      };
    }),

  setStemAnchors: (trackId, anchors) =>
    set((state) => {
      const stem = state.stems[trackId];
      if (!stem) return {};
      return {
        stems: {
          ...state.stems,
          [trackId]: { ...stem, anchors },
        },
      };
    }),

  setStemPerfectTimeResult: (trackId, perfectTimeResult) =>
    set((state) => {
      const stem = state.stems[trackId];
      if (!stem) return {};
      return {
        stems: {
          ...state.stems,
          [trackId]: { ...stem, perfectTimeResult, processingState: 'processed' },
        },
      };
    }),

  clearStemPerfectTimeResult: (trackId) =>
    set((state) => {
      const stem = state.stems[trackId];
      if (!stem) return {};
      const { perfectTimeResult, ...rest } = stem;
      return {
        stems: {
          ...state.stems,
          [trackId]: { ...rest, processingState: 'awaiting_anchors' },
        },
      };
    }),

  resetStemAnchors: (trackId) =>
    set((state) => {
      const stem = state.stems[trackId];
      if (!stem) return {};
      return {
        stems: {
          ...state.stems,
          [trackId]: { ...stem, anchors: [] },
        },
      };
    }),
}));
