import { useRef } from 'react';
import { useProjectStore } from '../store/projectStore';
import { BEAT_WIDTH_PX } from '../utils/constants';
import { PLAYHEAD_ID } from '../engine/playheadDOM';
import './Playhead.css';

export function Playhead() {
  // Lê UMA VEZ no mount — sem inscrição no Zustand.
  // Depois disso, o DOM é controlado exclusivamente por updatePlayheadDOM().
  const initialBeat = useRef(useProjectStore.getState().playheadBeat);
  const x = initialBeat.current * BEAT_WIDTH_PX;

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
