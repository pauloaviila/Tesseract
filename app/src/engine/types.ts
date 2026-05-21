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
