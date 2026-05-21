import type { TesseractProject } from '../types/project';
import {
  DEFAULT_BPM,
  DEFAULT_TIME_SIGNATURE,
  BEATS_PER_SECTION,
} from '../utils/constants';

/**
 * Projeto mock para a Etapa 1.
 * Tracks com cores mapeadas ao sistema de Tiers do Projeto.md.
 * Clips vazios — serão populados na Etapa 2 com importação de stems.
 */
export const MOCK_PROJECT: TesseractProject = {
  id: 'proj_001',
  name: 'Untitled Session',
  bpm: DEFAULT_BPM,
  timeSignature: DEFAULT_TIME_SIGNATURE,
  tracks: [
    { id: 'trk_kick',  name: 'Kick',     color: 'var(--accent-kick)',  tier: 1, muted: false, solo: false, volume: 1.0, clips: [] },
    { id: 'trk_snare', name: 'Snare',    color: 'var(--accent-snare)', tier: 1, muted: false, solo: false, volume: 1.0, clips: [] },
    { id: 'trk_hihat', name: 'Hi-Hat',   color: 'var(--accent-hihat)', tier: 1, muted: false, solo: false, volume: 0.85, clips: [] },
    { id: 'trk_perc',  name: 'Perc',     color: 'var(--accent-snare)', tier: 1, muted: false, solo: false, volume: 0.8, clips: [] },
    { id: 'trk_bass',  name: 'Sub Bass', color: 'var(--accent-bass)',  tier: 2, muted: false, solo: false, volume: 0.95, clips: [] },
    { id: 'trk_mid',   name: 'Mid Bass', color: 'var(--accent-bass)',  tier: 2, muted: false, solo: false, volume: 0.9, clips: [] },
    { id: 'trk_synth', name: 'Synth',    color: 'var(--accent-synth)', tier: 3, muted: false, solo: false, volume: 0.75, clips: [] },
    { id: 'trk_pad',   name: 'Pad',      color: 'var(--accent-pad)',   tier: 3, muted: false, solo: false, volume: 0.7, clips: [] },
    { id: 'trk_fx',    name: 'FX',       color: 'var(--accent-fx)',    tier: 3, muted: false, solo: false, volume: 0.6, clips: [] },
    { id: 'trk_vox',   name: 'Vox',      color: 'var(--accent-vox)',   tier: 3, muted: false, solo: false, volume: 0.8, clips: [] },
  ],
  sections: [
    { id: 'sec_intro',   label: 'Intro',   startBeat: 0,                        durationBeats: BEATS_PER_SECTION,     color: 'var(--section-intro)' },
    { id: 'sec_verse1',  label: 'Verse',   startBeat: BEATS_PER_SECTION,         durationBeats: BEATS_PER_SECTION,     color: 'var(--section-verse)' },
    { id: 'sec_chorus1', label: 'Chorus',  startBeat: BEATS_PER_SECTION * 2,     durationBeats: BEATS_PER_SECTION,     color: 'var(--section-chorus)' },
    { id: 'sec_verse2',  label: 'Verse',   startBeat: BEATS_PER_SECTION * 3,     durationBeats: BEATS_PER_SECTION,     color: 'var(--section-verse)' },
    { id: 'sec_bridge',  label: 'Bridge',  startBeat: BEATS_PER_SECTION * 4,     durationBeats: BEATS_PER_SECTION,     color: 'var(--section-bridge)' },
    { id: 'sec_outro',   label: 'Outro',   startBeat: BEATS_PER_SECTION * 5,     durationBeats: BEATS_PER_SECTION,     color: 'var(--section-outro)' },
  ],
  groups: [],
};
