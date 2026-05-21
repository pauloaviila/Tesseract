export interface FrequencyConflict {
  stem_a_id: string;
  stem_b_id: string;
  hz_lo: number;
  hz_hi: number;
  frame_start: number;
  frame_end: number;
  attenuation_db: number;
}

export interface GainStagingResult {
  track_id: string;
  current_peak_db: number;
  required_gain_db: number;
}

export type MaterialClass = 'Percussive' | 'Tonal' | 'Mixed';

export interface DetectiveResult {
  bpm_estimated: number;
  confidence: number;
  requires_manual_anchors: boolean;
  transients_ms: number[];
  material_class: MaterialClass;
  spectral_flux_variance: number;
  spectral_flatness: number;
  band_weights: [number, number, number];
}

export interface JobQueued {
  job_id: number;
  status: string;
}

export interface DetectiveEventPayload {
  job_id: number;
  status: string;
  result: DetectiveResult | null;
  error: string | null;
}
