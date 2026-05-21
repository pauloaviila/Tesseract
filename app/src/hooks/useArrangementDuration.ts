import { useMemo } from 'react';
import { useProjectStore } from '../store/projectStore';
import { useStemStore } from '../store/stemStore';
import { BEATS_PER_BAR } from '../utils/constants';

export function useArrangementDuration() {
  const stems = useStemStore((s) => s.stems);
  const bpm = useProjectStore((s) => s.project.bpm);

  return useMemo(() => {
    let maxDurationSecs = 0;
    for (const stemId in stems) {
      const stem = stems[stemId];
      if (stem && stem.durationSecs > maxDurationSecs) {
        maxDurationSecs = stem.durationSecs;
      }
    }

    // Converte duração máxima para compassos (bars) com base no BPM atual
    const durationBeats = (maxDurationSecs * bpm) / 60;
    const durationBars = durationBeats / BEATS_PER_BAR;

    // Padrão mínimo de 90 compassos. Se exceder, expande até o fim da track + 20 compassos
    const totalBars = Math.max(90, Math.ceil(durationBars) + 20);
    const totalBeats = totalBars * BEATS_PER_BAR;

    return {
      totalBars,
      totalBeats,
    };
  }, [stems, bpm]);
}
