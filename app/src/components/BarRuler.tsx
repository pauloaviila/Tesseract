import { useMemo, useCallback } from 'react';
import { useProjectStore } from '../store/projectStore';
import {
  TOTAL_BARS,
  BAR_RULER_MAJOR_INTERVAL,
  BEATS_PER_BAR,
  TOTAL_ARRANGEMENT_BEATS,
} from '../utils/constants';
import './BarRuler.css';

interface BarRulerProps {
  onSeek?: (beat: number, isDragging?: boolean) => void;
}

interface BarTick {
  barNumber: number;
  position: number;
  isMajor: boolean;
}

function useBarTicks(pixelsPerBeat: number): BarTick[] {
  return useMemo(() => {
    const ticks: BarTick[] = [];
    const barWidthPx = pixelsPerBeat * BEATS_PER_BAR;
    for (let bar = 1; bar <= TOTAL_BARS; bar++) {
      ticks.push({
        barNumber: bar,
        position: (bar - 1) * barWidthPx,
        isMajor: (bar - 1) % BAR_RULER_MAJOR_INTERVAL === 0,
      });
    }
    return ticks;
  }, [pixelsPerBeat]);
}

/**
 * Régua de compassos.
 * Click em qualquer posição faz seek para aquele beat (como no Ableton).
 * e.nativeEvent.offsetX dá a posição dentro do elemento completo (total width),
 * independente do scroll do container pai.
 */
export function BarRuler({ onSeek }: BarRulerProps) {
  const pixelsPerBeat = useProjectStore((s) => s.pixelsPerBeat);
  const ticks = useBarTicks(pixelsPerBeat);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!onSeek) return;
    e.preventDefault(); // prevent text selection during drag

    const ruler = e.currentTarget;

    const getBeat = (ev: MouseEvent | React.MouseEvent) => {
      const rect = ruler.getBoundingClientRect();
      const scrollLeft = ruler.parentElement?.parentElement?.scrollLeft ?? 0;
      const x = ev.clientX - rect.left + scrollLeft;
      return Math.max(0, x / pixelsPerBeat);
    };

    let lastBeat = getBeat(e);
    
    // Início imediato do drag (ou click rápido)
    onSeek(lastBeat, true);

    const move = (ev: MouseEvent) => {
      const beat = getBeat(ev);
      if (beat !== lastBeat) {
        lastBeat = beat;
        onSeek(beat, true);
      }
    };

    const up = (ev: MouseEvent) => {
      const beat = getBeat(ev);
      onSeek(beat, false); // O drag terminou, aplica o seek no backend
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };

    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  }, [onSeek, pixelsPerBeat]);

  const timelineTotalWidthPx = TOTAL_ARRANGEMENT_BEATS * pixelsPerBeat;

  return (
    <div
      className={`bar-ruler ${onSeek ? 'bar-ruler--seekable' : ''}`}
      id="bar-ruler"
      style={{ minWidth: timelineTotalWidthPx }}
      onMouseDown={handleMouseDown}
    >
      {ticks.map((tick) => (
        <div
          key={tick.barNumber}
          className="bar-ruler__tick"
          style={{ left: tick.position }}
        >
          <div
            className={`bar-ruler__tick-line ${
              tick.isMajor
                ? 'bar-ruler__tick-line--major'
                : 'bar-ruler__tick-line--minor'
            }`}
          />
          {tick.isMajor && (
            <span className="bar-ruler__label bar-ruler__label--major">
              {tick.barNumber}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
