import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import { useProjectStore } from '../store/projectStore';
import { useArrangementDuration } from '../hooks/useArrangementDuration';
import { BarRuler } from './BarRuler';
import { TimeRuler } from './TimeRuler';
import { TrackLane } from './TrackLane';
import { Playhead } from './Playhead';
import './ArrangementView.css';

interface ArrangementViewProps {
  readonly scrollRef: RefObject<HTMLDivElement | null>;
  readonly onScroll: () => void;
  readonly onSeek: (beat: number, isDragging?: boolean) => void;
}

export function ArrangementView({ scrollRef, onScroll, onSeek }: ArrangementViewProps) {
  const tracks = useProjectStore((s) => s.project.tracks);
  const setZoom = useProjectStore((s) => s.setZoom);
  const pixelsPerBeat = useProjectStore((s) => s.pixelsPerBeat);
  const { totalBeats } = useArrangementDuration();
  const timelineTotalWidthPx = totalBeats * pixelsPerBeat;

  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault(); // Impede o zoom padrão da página do navegador
        
        const direction = e.deltaY > 0 ? -1 : 1;
        const zoomSpeed = 4; // Sensibilidade ideal do zoom
        
        const currentZoom = useProjectStore.getState().pixelsPerBeat;
        setZoom(currentZoom + direction * zoomSpeed);
      }
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', handleWheel);
    };
  }, [setZoom]);

  return (
    <main
      className="arrangement-view"
      id="arrangement-view"
      ref={containerRef}
    >
      <div className="arrangement-view__scroll-container">
        {/* Régua de compassos — clicável para seek */}
        <div className="arrangement-view__top-rulers">
          <BarRuler onSeek={onSeek} />
        </div>

        {/* Lanes das tracks */}
        <div
          className="arrangement-view__lanes"
          ref={scrollRef}
          onScroll={onScroll}
          style={{ minWidth: timelineTotalWidthPx }}
        >
          <div className="arrangement-view__lanes-inner" style={{ minWidth: timelineTotalWidthPx }}>
            {tracks.map((track, index) => (
              <TrackLane key={track.id} track={track} index={index} />
            ))}
          </div>
        </div>

        {/* Régua de tempo */}
        <div className="arrangement-view__bottom-ruler">
          <TimeRuler />
        </div>

        {/* Agulha de playhead — abrange toda a altura (renderizado por último para garantir z-index) */}
        <Playhead />
      </div>
    </main>
  );
}
