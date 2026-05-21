/**
 * Atualização direta do DOM para a agulha — bypassa React/Zustand para
 * eliminar o overhead de reconciliação em cada frame (60-144 FPS).
 *
 * A agulha precisa de movimento contínuo e suave; passar por setState a
 * cada rAF tick significaria re-renders desnecessários de todo o sub-tree.
 */
import { BEAT_WIDTH_PX } from '../utils/constants';

const PLAYHEAD_ID = 'playhead-needle';

let cached: HTMLElement | null = null;

function getEl(): HTMLElement | null {
  if (!cached || !cached.isConnected) {
    cached = document.getElementById(PLAYHEAD_ID);
  }
  return cached;
}

export function updatePlayheadDOM(beat: number): void {
  const el = getEl();
  if (el) el.style.transform = `translateX(${beat * BEAT_WIDTH_PX}px)`;
}

export { PLAYHEAD_ID };
