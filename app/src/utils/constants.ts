/** Constantes globais do Tesseract Engine */

export const DEFAULT_BPM = 174;
export const DEFAULT_TIME_SIGNATURE: [number, number] = [4, 4];

/** Batidas por seção (baseado em 8 compassos por seção a 4/4) */
export const BEATS_PER_BAR = 4;
export const BARS_PER_SECTION = 8;
export const BEATS_PER_SECTION = BEATS_PER_BAR * BARS_PER_SECTION;

/** Largura visual de cada batida no grid (px) */
export const BEAT_WIDTH_PX = 12;

/** Largura de um compasso inteiro no grid (px) */
export const BAR_WIDTH_PX = BEAT_WIDTH_PX * BEATS_PER_BAR;

/** Altura de cada lane de track (px) — compatível com track items do painel */
export const TRACK_LANE_HEIGHT_PX = 80;

/** Largura do painel lateral de tracks (px) */
export const TRACK_PANEL_WIDTH_PX = 220;

/** Total de batidas visíveis na timeline (baseado nas seções do arranjo) */
export const TOTAL_ARRANGEMENT_BEATS = BEATS_PER_SECTION * 6;

/** Total de compassos na timeline */
export const TOTAL_BARS = TOTAL_ARRANGEMENT_BEATS / BEATS_PER_BAR;

/** Largura total da timeline em px */
export const TIMELINE_TOTAL_WIDTH_PX = TOTAL_ARRANGEMENT_BEATS * BEAT_WIDTH_PX;

/** Intervalo de marcação de compassos na régua (a cada N compassos) */
export const BAR_RULER_MAJOR_INTERVAL = 8;
export const BAR_RULER_MINOR_INTERVAL = 1;

/** Altura das réguas (px) */
export const RULER_HEIGHT_PX = 22;

/** Converte posição em beats para segundos */
export function beatsToSeconds(beats: number, bpm: number): number {
  return (beats / bpm) * 60;
}

/** Formata segundos para mm:ss */
export function formatTime(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}
