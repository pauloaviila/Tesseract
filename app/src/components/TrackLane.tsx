import { useMemo, useCallback } from 'react';
import type { Track } from '../types/project';
import { useStemStore } from '../store/stemStore';
import { useStemDrop } from '../hooks/useStemDrop';
import { WaveformCanvas } from './WaveformCanvas';
import { pickAudioFile, loadStemFromPath } from '../engine/stemLoader';
import {
  BEAT_WIDTH_PX,
  BEATS_PER_BAR,
  TOTAL_ARRANGEMENT_BEATS,
  TRACK_LANE_HEIGHT_PX,
} from '../utils/constants';
import './TrackLane.css';

interface TrackLaneProps {
  readonly track: Track;
  readonly index: number;
}

function useBeatLines() {
  return useMemo(() => {
    const lines: { position: number; isBar: boolean }[] = [];
    for (let beat = 0; beat < TOTAL_ARRANGEMENT_BEATS; beat++) {
      lines.push({
        position: beat * BEAT_WIDTH_PX,
        isBar: beat % BEATS_PER_BAR === 0,
      });
    }
    return lines;
  }, []);
}

export function TrackLane({ track, index }: TrackLaneProps) {
  const beatLines = useBeatLines();
  const parity = index % 2 === 0 ? 'even' : 'odd';
  const totalWidth = TOTAL_ARRANGEMENT_BEATS * BEAT_WIDTH_PX;

  const stem = useStemStore((s) => s.stems[track.id]);
  const setStem = useStemStore((s) => s.setStem);
  const { onDragOver, onDrop } = useStemDrop(track.id);

  const handleLoad = useCallback(async () => {
    const filePath = await pickAudioFile();
    if (!filePath) return;
    try {
      const stemData = await loadStemFromPath(track.id, filePath);
      setStem(stemData);
    } catch (err) {
      console.error('[Tesseract] load failed:', err);
    }
  }, [track.id, setStem]);

  const hasStem = !!stem;

  return (
    <div
      className={`track-lane track-lane--${parity} ${track.muted ? 'track-lane--muted' : ''} ${hasStem ? 'track-lane--loaded' : 'track-lane--empty'}`}
      id={`track-lane-${track.id}`}
      data-track-id={track.id}
      style={{ minWidth: totalWidth }}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      {/* Tier indicator */}
      <div
        className="track-lane__tier-indicator"
        style={{ backgroundColor: track.color }}
      />

      {/* Beat grid */}
      <div className="track-lane__grid">
        {beatLines.map((line) => (
          <div
            key={line.position}
            className={`track-lane__beat-line ${
              line.isBar
                ? 'track-lane__beat-line--bar'
                : 'track-lane__beat-line--beat'
            }`}
            style={{ left: line.position }}
          />
        ))}
      </div>

      {hasStem ? (
        <div className="track-lane__waveform">
          <WaveformCanvas
            peaks={stem.peaks}
            color={track.color}
            height={TRACK_LANE_HEIGHT_PX - 4}
          />
          <div className="track-lane__stem-meta">
            <span className="track-lane__stem-name">
              {stem.filePath.split(/[\\/]/).pop()}
            </span>
            <span className="track-lane__stem-level">
              {stem.peakDb.toFixed(1)} dBFS pk
            </span>
            <button
              className="track-lane__replace-btn"
              onClick={handleLoad}
              title="Replace stem"
            >
              ↺
            </button>
          </div>
        </div>
      ) : (
        <div className="track-lane__drop-zone">
          <button
            className="track-lane__load-btn"
            onClick={handleLoad}
            title={`Load audio file for ${track.name}`}
          >
            + Load
          </button>
          <span className="track-lane__drop-label">or drag a file here</span>
        </div>
      )}
    </div>
  );
}
