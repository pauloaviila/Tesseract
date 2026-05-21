import { useMemo, useCallback } from 'react';
import {
  BAR_WIDTH_PX,
  TOTAL_BARS,
  BAR_RULER_MAJOR_INTERVAL,
  TIMELINE_TOTAL_WIDTH_PX,
} from '../utils/constants';
import './BarRuler.css';

interface BarRulerProps {
  onSeek?: (beat: number) => void;
}

interface BarTick {
  barNumber: number;
  position: number;
  isMajor: boolean;
}

function useBarTicks(): BarTick[] {
  return useMemo(() => {
    const ticks: BarTick[] = [];
    for (let bar = 1; bar <= TOTAL_BARS; bar++) {
      ticks.push({
        barNumber: bar,
        position: (bar - 1) * BAR_WIDTH_PX,
        isMajor: (bar - 1) % BAR_RULER_MAJOR_INTERVAL === 0,
      });
    }
    return ticks;
  }, []);
}

/**
 * Régua de compassos.
 * Click em qualquer posição faz seek para aquele beat (como no Ableton).
 * e.nativeEvent.offsetX dá a posição dentro do elemento completo (total width),
 * independente do scroll do container pai.
 */
export function BarRuler({ onSeek }: BarRulerProps) {
  const ticks = useBarTicks();

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!onSeek) return;
      const beat = e.nativeEvent.offsetX / (BAR_WIDTH_PX / 4); // px ÷ px-per-beat
      onSeek(Math.max(0, beat));
    },
    [onSeek],
  );

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!onSeek) return;
    e.preventDefault(); // prevent text selection during drag

    const ruler = e.currentTarget;

    const move = (ev: MouseEvent) => {
      const rect = ruler.getBoundingClientRect();
      // Account for horizontal scroll of the container
      const scrollLeft = ruler.parentElement?.parentElement?.scrollLeft ?? 0;
      const x = ev.clientX - rect.left + scrollLeft;
      const beat = Math.max(0, x / (BAR_WIDTH_PX / 4));
      onSeek(beat);
    };

    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };

    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  }, [onSeek]);

  return (
    <div
      className={`bar-ruler ${onSeek ? 'bar-ruler--seekable' : ''}`}
      id="bar-ruler"
      style={{ minWidth: TIMELINE_TOTAL_WIDTH_PX }}
      onClick={handleClick}
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
