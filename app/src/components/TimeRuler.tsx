import { useMemo } from 'react';
import { useProjectStore } from '../store/projectStore';
import { useArrangementDuration } from '../hooks/useArrangementDuration';
import {
  beatsToSeconds,
  formatTime,
} from '../utils/constants';
import './TimeRuler.css';

interface TimeTick {
  readonly id: number;
  readonly position: number;
  readonly label: string;
  readonly isMajor: boolean;
}

/**
 * Calcula intervalos de tempo baseados no BPM e zoom (pixelsPerBeat).
 * Major ticks a cada 5 segundos, minor a cada 1 segundo.
 */
function useTimeTicks(bpm: number, pixelsPerBeat: number, totalBeats: number): TimeTick[] {
  return useMemo(() => {
    const ticks: TimeTick[] = [];
    const totalSeconds = beatsToSeconds(totalBeats, bpm);
    const secondsPerBeat = 60 / bpm;
    const pxPerSecond = pixelsPerBeat / secondsPerBeat;

    for (let sec = 0; sec <= totalSeconds; sec++) {
      const isMajor = sec % 5 === 0;
      ticks.push({
        id: sec,
        position: sec * pxPerSecond,
        label: formatTime(sec),
        isMajor,
      });
    }
    return ticks;
  }, [bpm, pixelsPerBeat, totalBeats]);
}

/**
 * Régua de tempo — exibe marcadores de tempo (mm:ss) ao longo da timeline.
 * Major ticks a cada 5 segundos com label. Minor ticks a cada segundo.
 * Calcula posições com base no BPM e zoom do projeto.
 */
export function TimeRuler() {
  const bpm = useProjectStore((s) => s.project.bpm);
  const pixelsPerBeat = useProjectStore((s) => s.pixelsPerBeat);
  const { totalBeats } = useArrangementDuration();
  const ticks = useTimeTicks(bpm, pixelsPerBeat, totalBeats);
  
  const timelineTotalWidthPx = totalBeats * pixelsPerBeat;

  return (
    <div
      className="time-ruler"
      id="time-ruler"
      style={{ minWidth: timelineTotalWidthPx }}
    >
      {ticks.map((tick) => (
        <div
          key={tick.id}
          className="time-ruler__tick"
          style={{ left: tick.position }}
        >
          <div
            className={`time-ruler__tick-line ${
              tick.isMajor
                ? 'time-ruler__tick-line--major'
                : 'time-ruler__tick-line--minor'
            }`}
          />
          {tick.isMajor && (
            <span className={`time-ruler__label time-ruler__label--major`}>
              {tick.label}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
