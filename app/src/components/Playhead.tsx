import { useProjectStore } from '../store/projectStore';
import { PLAYHEAD_ID } from '../engine/playheadDOM';
import './Playhead.css';

export function Playhead() {
  // Se inscreve apenas no pixelsPerBeat (zoom).
  // Quando o zoom muda, reposicionamos a agulha com base no beat atual da memória.
  const pixelsPerBeat = useProjectStore((s) => s.pixelsPerBeat);
  const currentBeat = useProjectStore.getState().playheadBeat;
  const x = currentBeat * pixelsPerBeat;

  return (
    <div
      id={PLAYHEAD_ID}
      className="playhead"
      style={{ transform: `translateX(${x}px)` }}
      aria-hidden
    >
      <div className="playhead__head" />
      <div className="playhead__line" />
    </div>
  );
}
