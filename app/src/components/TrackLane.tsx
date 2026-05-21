import { useMemo, useCallback, useRef } from 'react';
import type { Track } from '../types/project';
import { useStemStore } from '../store/stemStore';
import { useProjectStore } from '../store/projectStore';
import { useStemDrop } from '../hooks/useStemDrop';
import { WaveformCanvas } from './WaveformCanvas';
import { pickAudioFile, loadStemFromPath } from '../engine/stemLoader';
import { triggerPerfectTimeProcess, clearTrackWarp } from '../hooks/usePerfectTime';
import {
  BEATS_PER_BAR,
  TRACK_LANE_HEIGHT_PX,
} from '../utils/constants';
import { useArrangementDuration } from '../hooks/useArrangementDuration';
import './TrackLane.css';

interface TrackLaneProps {
  readonly track: Track;
  readonly index: number;
}

function useBeatLines(pixelsPerBeat: number, snapResolution: string, totalBeats: number) {
  return useMemo(() => {
    const lines: { position: number; isBar: boolean; isSubdivision: boolean }[] = [];
    
    let step = 1.0;
    switch (snapResolution) {
      case '1/4': step = 1.0; break;
      case '1/8': step = 0.5; break;
      case '1/16': step = 0.25; break;
      case '1/32': step = 0.125; break;
      case '1/3T': step = 1.0 / 3.0; break;
      default: step = 0.5;
    }

    const pxPerStep = step * pixelsPerBeat;
    // Se o espaço visual entre subdivisões for menor que 8px, recua para subdivisões maiores
    let finalStep = step;
    if (pxPerStep < 8) {
      if (pixelsPerBeat >= 8) {
        finalStep = 1.0; // Beats inteiros
      } else {
        finalStep = 4.0; // Apenas compassos
      }
    }

    const totalSteps = Math.ceil(totalBeats / finalStep);
    for (let i = 0; i < totalSteps; i++) {
      const beat = i * finalStep;
      const position = beat * pixelsPerBeat;
      const isBar = Math.abs(beat % BEATS_PER_BAR) < 1e-4;
      const isSubdivision = !isBar && (Math.abs(beat % 1.0) >= 1e-4);

      lines.push({
        position,
        isBar,
        isSubdivision,
      });
    }
    return lines;
  }, [pixelsPerBeat, snapResolution, totalBeats]);
}

function getSnapStep(resolution: string): number {
  switch (resolution) {
    case '1/4': return 0.25;
    case '1/8': return 0.125;
    case '1/16': return 0.0625;
    case '1/32': return 0.03125;
    case '1/3T': return 1.0 / 3.0;
    default: return 0.125;
  }
}

export function TrackLane({ track, index }: TrackLaneProps) {
  const pixelsPerBeat = useProjectStore((s) => s.pixelsPerBeat);
  const snapResolution = useProjectStore((s) => s.snapResolution);
  const { totalBeats } = useArrangementDuration();
  const beatLines = useBeatLines(pixelsPerBeat, snapResolution, totalBeats);
  const parity = index % 2 === 0 ? 'even' : 'odd';
  const totalWidth = totalBeats * pixelsPerBeat;

  const stem = useStemStore((s) => s.stems[track.id]);
  const setStem = useStemStore((s) => s.setStem);
  const setStemAnchors = useStemStore((s) => s.setStemAnchors);
  const resetStemAnchors = useStemStore((s) => s.resetStemAnchors);
  const bpm = useProjectStore((s) => s.project.bpm);
  const { onDragOver, onDrop } = useStemDrop(track.id);

  const containerRef = useRef<HTMLDivElement>(null);

  const pixelsPerSecond = (bpm / 60) * pixelsPerBeat;
  const timeToX = useCallback((timeMs: number) => (timeMs / 1000) * pixelsPerSecond, [pixelsPerSecond]);
  const xToTime = useCallback((xPx: number) => (xPx / pixelsPerSecond) * 1000, [pixelsPerSecond]);

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

  // Duplo-clique para adicionar novas âncoras na waveform
  const handleWaveformDoubleClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!stem || stem.processingState !== 'awaiting_anchors' || !containerRef.current) return;
    
    const rect = containerRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const timeMs = xToTime(clickX);
    
    const step = e.altKey ? 0.001 : getSnapStep(snapResolution);
    const targetBeat = Math.round((clickX / pixelsPerBeat) / step) * step;
    
    // Evita duplicados na mesma vizinhança de tempo (100ms de margem)
    const currentAnchors = stem.anchors ?? [];
    if (currentAnchors.some(a => Math.abs(a.time_ms - timeMs) < 100)) return;
    
    const newAnchors = [...currentAnchors, { time_ms: timeMs, beat: targetBeat }];
    newAnchors.sort((a, b) => a.time_ms - b.time_ms);
    setStemAnchors(track.id, newAnchors);
  }, [stem, pixelsPerBeat, xToTime, setStemAnchors, track.id, snapResolution]);

  // Handler de arraste de âncoras com snap magnético
  const handleAnchorMouseDown = useCallback((idx: number, e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.preventDefault();
    if (!stem || !stem.anchors || !containerRef.current) return;
    
    const anchors = [...stem.anchors];
    const rect = containerRef.current.getBoundingClientRect();
    
    const onMouseMove = (moveEvent: MouseEvent) => {
      const mouseX = moveEvent.clientX - rect.left;
      
      const step = moveEvent.altKey ? 0.001 : getSnapStep(snapResolution);
      const targetBeat = Math.round((mouseX / pixelsPerBeat) / step) * step;
      
      // Limita o arraste para não cruzar as âncoras adjacentes (evita inversão temporal)
      const prevBeat = anchors[idx - 1]?.beat ?? 0;
      const nextBeat = anchors[idx + 1]?.beat ?? totalBeats;
      
      const clampedBeat = Math.max(prevBeat + 0.001, Math.min(nextBeat - 0.001, targetBeat));
      
      anchors[idx] = { ...anchors[idx], beat: clampedBeat };
      setStemAnchors(track.id, anchors);
    };
    
    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
    
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }, [stem, pixelsPerBeat, setStemAnchors, track.id, snapResolution, totalBeats]);

  const handleAnchorContextMenu = useCallback((idx: number, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!stem || !stem.anchors) return;
    const newAnchors = stem.anchors.filter((_, i) => i !== idx);
    setStemAnchors(track.id, newAnchors);
  }, [stem, setStemAnchors, track.id]);

  const handleAnchorClick = useCallback((idx: number, e: React.MouseEvent) => {
    if (e.altKey) {
      e.stopPropagation();
      if (!stem || !stem.anchors) return;
      const newAnchors = stem.anchors.filter((_, i) => i !== idx);
      setStemAnchors(track.id, newAnchors);
    }
  }, [stem, setStemAnchors, track.id]);

  const hasStem = !!stem;
  const stemWidthPx = hasStem ? (stem.durationSecs * bpm / 60) * pixelsPerBeat : 0;

  return (
    <div
      className={`track-lane track-lane--${parity} ${track.muted ? 'track-lane--muted' : ''} ${hasStem ? 'track-lane--loaded' : 'track-lane--empty'}`}
      id={`track-lane-${track.id}`}
      data-track-id={track.id}
      style={{
        minWidth: totalWidth,
        ['--track-color' as any]: track.color,
      }}
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
                : line.isSubdivision
                ? 'track-lane__beat-line--subdivision'
                : 'track-lane__beat-line--beat'
            }`}
            style={{ left: line.position }}
          />
        ))}
      </div>

      {hasStem ? (
        <div
          ref={containerRef}
          className="track-lane__waveform"
          style={{ width: stemWidthPx, right: 'auto' }}
          onDoubleClick={handleWaveformDoubleClick}
        >
          <WaveformCanvas
            peaks={stem.peaks}
            color={track.color}
            height={TRACK_LANE_HEIGHT_PX - 8}
            width={stemWidthPx}
          />

          {/* Warp Markers Overlay */}
          {stem.processingState === 'awaiting_anchors' && stem.anchors?.map((anchor, idx) => {
            const xOrig = timeToX(anchor.time_ms);
            const xTarget = anchor.beat * pixelsPerBeat;
            const bridgeLeft = Math.min(xOrig, xTarget);
            const bridgeWidth = Math.abs(xOrig - xTarget);
            
            return (
              <div key={`${idx}-${anchor.time_ms}`} className="track-lane__warp-marker-group">
                {/* Transient original */}
                <div
                  className="track-lane__warp-marker-orig"
                  style={{ left: xOrig }}
                  title={`Transient original: ${anchor.time_ms.toFixed(0)}ms`}
                />
                
                {/* Linha vertical pontilhada no grid destino */}
                <div
                  className="track-lane__warp-marker-line-target"
                  style={{ left: xTarget }}
                />
                
                {/* Rubber Band Bridge */}
                {bridgeWidth > 1 && (
                  <div
                    className="track-lane__warp-marker-bridge"
                    style={{
                      left: bridgeLeft,
                      width: bridgeWidth,
                    }}
                  />
                )}
                
                {/* Drag Handle na parte superior */}
                <div
                  className="track-lane__warp-marker-target"
                  style={{ left: xTarget }}
                  onMouseDown={(e) => handleAnchorMouseDown(idx, e)}
                  onContextMenu={(e) => handleAnchorContextMenu(idx, e)}
                  onClick={(e) => handleAnchorClick(idx, e)}
                  title="Arraste para ajustar o beat. Alt+Clique ou Botão Direito para deletar."
                >
                  <div className="track-lane__warp-marker-handle" />
                </div>
              </div>
            );
          })}

          <div className="track-lane__stem-meta">
            <span className="track-lane__stem-name">
              {stem.filePath.split(/[\\/]/).pop()}
            </span>
            <span className="track-lane__stem-level">
              {stem.peakDb.toFixed(1)} dBFS pk
            </span>

            {/* Badges e Controles do Perfect Time */}
            {stem.processingState === 'queued' && (
              <span className="track-lane__pt-badge track-lane__pt-badge--loading">
                Na Fila...
              </span>
            )}

            {stem.processingState === 'analyzing' && (
              <span className="track-lane__pt-badge track-lane__pt-badge--loading">
                Processando...
              </span>
            )}

            {stem.processingState === 'awaiting_anchors' && (
              <>
                <span className="track-lane__pt-badge track-lane__pt-badge--awaiting" title="Dê duplo-clique na Waveform para inserir Warp Markers e arraste-os para os beats">
                  Warp Manual ({stem.anchors?.length ?? 0})
                </span>
                <div className="track-lane__warp-controls">
                  <button
                    className="track-lane__warp-btn track-lane__warp-btn--primary"
                    onClick={() => triggerPerfectTimeProcess(track.id, bpm)}
                    title="Aplica o Warp baseado nas âncoras configuradas"
                  >
                    Confirmar Warp
                  </button>
                  <button
                    className="track-lane__warp-btn"
                    onClick={() => resetStemAnchors(track.id)}
                    title="Remove todos os Warp Markers"
                  >
                    Reset
                  </button>
                </div>
              </>
            )}

            {stem.processingState === 'processed' && (
              <>
                <span className="track-lane__pt-badge track-lane__pt-badge--success" title={`Distorcido via ${stem.perfectTimeResult?.method_used || 'Slicing'}`}>
                  Perfect Time ✓
                </span>
                <div className="track-lane__warp-controls">
                  <button
                    className="track-lane__warp-btn"
                    onClick={() => useStemStore.getState().setStemProcessingState(track.id, 'awaiting_anchors')}
                    title="Abre a edição manual dos Warp Markers"
                  >
                    Editar Warp
                  </button>
                  <button
                    className="track-lane__warp-btn"
                    onClick={() => clearTrackWarp(track.id)}
                    title="Desfaz o Perfect Time e volta ao arquivo original"
                  >
                    Restaurar Original
                  </button>
                </div>
              </>
            )}

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
