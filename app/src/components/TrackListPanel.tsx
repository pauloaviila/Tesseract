import { useEffect, useCallback, type RefObject } from 'react';
import { useProjectStore } from '../store/projectStore';
import { TrackListItem } from './TrackListItem';
import type { TrackGroup } from '../types/project';
import './TrackListPanel.css';

interface TrackListPanelProps {
  /** Ref para sincronizar scroll vertical com as lanes */
  readonly scrollRef: RefObject<HTMLDivElement | null>;
  readonly onScroll: () => void;
}

/**
 * Painel lateral com lista de tracks.
 * Escuta Ctrl+G globalmente para criar grupos.
 */
export function TrackListPanel({ scrollRef, onScroll }: TrackListPanelProps) {
  const tracks = useProjectStore((s) => s.project.tracks);
  const groups = useProjectStore((s) => s.project.groups);
  const selectedTrackIds = useProjectStore((s) => s.selectedTrackIds);
  const createGroup = useProjectStore((s) => s.createGroup);

  /** Mapa rápido: trackId → grupo ao qual pertence */
  const trackGroupMap = useCallback((): Map<string, TrackGroup> => {
    const map = new Map<string, TrackGroup>();
    for (const group of groups) {
      for (const trackId of group.trackIds) {
        map.set(trackId, group);
      }
    }
    return map;
  }, [groups]);

  const groupMap = trackGroupMap();

  /** Atalho global: Ctrl+G para criar grupo */
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'g') {
        e.preventDefault();
        createGroup();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [createGroup]);

  return (
    <aside className="track-list-panel" id="track-list-panel">
      {/* Header — alinhado com régua de barras + seções */}
      <div className="track-list-panel__header">
        <div className="track-list-panel__ruler-zone">
          <span className="track-list-panel__title">Tracks</span>
          <span className="track-list-panel__count">{tracks.length}</span>
        </div>
      </div>

      {/* Info de seleção + grupos */}
      {selectedTrackIds.length > 1 && (
        <div className="track-list-panel__selection-bar">
          <span className="track-list-panel__selection-text">
            {selectedTrackIds.length} selecionadas
          </span>
          <span className="track-list-panel__selection-hint">
            Ctrl+G → Grupo
          </span>
        </div>
      )}

      {/* Corpo scrollável */}
      <div
        className="track-list-panel__body"
        ref={scrollRef}
        onScroll={onScroll}
      >
        {tracks.map((track, index) => (
          <TrackListItem
            key={track.id}
            track={track}
            index={index}
            isSelected={selectedTrackIds.includes(track.id)}
            group={groupMap.get(track.id)}
          />
        ))}
      </div>

      {/* Footer — alinhado com régua de tempo */}
      <div className="track-list-panel__footer">
        <span className="track-list-panel__footer-label">Time</span>
      </div>
    </aside>
  );
}
