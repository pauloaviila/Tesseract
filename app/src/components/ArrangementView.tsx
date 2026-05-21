import type { RefObject } from 'react';
import { useProjectStore } from '../store/projectStore';
import { BarRuler } from './BarRuler';
import { TimeRuler } from './TimeRuler';
import { TrackLane } from './TrackLane';
import { Playhead } from './Playhead';
import './ArrangementView.css';

interface ArrangementViewProps {
  readonly scrollRef: RefObject<HTMLDivElement | null>;
  readonly onScroll: () => void;
  readonly onSeek: (beat: number) => void;
}

export function ArrangementView({ scrollRef, onScroll, onSeek }: ArrangementViewProps) {
  const tracks = useProjectStore((s) => s.project.tracks);

  return (
    <main className="arrangement-view" id="arrangement-view">
      <div className="arrangement-view__scroll-container">
        {/* Agulha de playhead — abrange toda a altura */}
        <Playhead />

        {/* Régua de compassos — clicável para seek */}
        <div className="arrangement-view__top-rulers">
          <BarRuler onSeek={onSeek} />
        </div>

        {/* Lanes das tracks */}
        <div
          className="arrangement-view__lanes"
          ref={scrollRef}
          onScroll={onScroll}
        >
          <div className="arrangement-view__lanes-inner">
            {tracks.map((track, index) => (
              <TrackLane key={track.id} track={track} index={index} />
            ))}
          </div>
        </div>

        {/* Régua de tempo */}
        <div className="arrangement-view__bottom-ruler">
          <TimeRuler />
        </div>
      </div>
    </main>
  );
}
