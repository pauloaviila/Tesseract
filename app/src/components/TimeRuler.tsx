import { useMemo } from 'react';
import { useProjectStore } from '../store/projectStore';
import {
  BEAT_WIDTH_PX,
  TOTAL_ARRANGEMENT_BEATS,
  TIMELINE_TOTAL_WIDTH_PX,
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
 * Calcula intervalos de tempo baseados no BPM.
 * Major ticks a cada 5 segundos, minor a cada 1 segundo.
 */
function useTimeTicks(bpm: number): TimeTick[] {
  return useMemo(() => {
    const ticks: TimeTick[] = [];
    const totalSeconds = beatsToSeconds(TOTAL_ARRANGEMENT_BEATS, bpm);
    const secondsPerBeat = 60 / bpm;
    const pxPerSecond = BEAT_WIDTH_PX / secondsPerBeat;

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
  }, [bpm]);
}

/**
 * Régua de tempo — exibe marcadores de tempo (mm:ss) ao longo da timeline.
 * Major ticks a cada 5 segundos com label. Minor ticks a cada segundo.
 * Calcula posições com base no BPM do projeto.
 */
export function TimeRuler() {
  const bpm = useProjectStore((s) => s.project.bpm);
  const ticks = useTimeTicks(bpm);

  return (
    <div
      className="time-ruler"
      id="time-ruler"
      style={{ minWidth: TIMELINE_TOTAL_WIDTH_PX }}
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
