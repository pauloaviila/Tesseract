/** Tier de prioridade na mixagem algorítmica */
export type TrackTier = 1 | 2 | 3;

/** Assinatura de tempo */
export type TimeSignature = [number, number];

/** Clip de áudio posicionado numa track */
export interface Clip {
  readonly id: string;
  readonly trackId: string;
  readonly startBeat: number;
  readonly durationBeats: number;
  readonly label: string;
}

/** Track individual do projeto */
export interface Track {
  readonly id: string;
  readonly name: string;
  readonly color: string;
  tier: TrackTier;
  muted: boolean;
  solo: boolean;
  volume: number;
  readonly clips: Clip[];
}

/** Grupo de tracks (criado via Ctrl+G) */
export interface TrackGroup {
  readonly id: string;
  name: string;
  color: string;
  readonly trackIds: string[];
}

/** Seção de arranjo (Intro, Verse, Chorus, etc.) */
export interface ArrangementSection {
  readonly id: string;
  readonly label: string;
  readonly startBeat: number;
  readonly durationBeats: number;
  readonly color: string;
}

/** Projeto completo do Tesseract */
export interface TesseractProject {
  readonly id: string;
  readonly name: string;
  readonly bpm: number;
  readonly timeSignature: TimeSignature;
  readonly tracks: Track[];
  readonly sections: ArrangementSection[];
  readonly groups: TrackGroup[];
}
