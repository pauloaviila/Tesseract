import { useState, useRef, useEffect, useCallback, type MouseEvent } from 'react';
import type { Track, TrackTier, TrackGroup } from '../types/project';
import { useProjectStore } from '../store/projectStore';
import './TrackListItem.css';

interface TrackListItemProps {
  readonly track: Track;
  readonly index: number;
  readonly isSelected: boolean;
  readonly group: TrackGroup | undefined;
}

const TIER_OPTIONS: { tier: TrackTier; label: string; color: string }[] = [
  { tier: 1, label: 'Tier 1 · Core', color: 'var(--accent-kick)' },
  { tier: 2, label: 'Tier 2 · Sub',  color: 'var(--accent-bass)' },
  { tier: 3, label: 'Tier 3 · Fill', color: 'var(--accent-fx)' },
];

const TIER_SHORT: Record<TrackTier, string> = {
  1: 'Core',
  2: 'Sub',
  3: 'Fill',
};

/**
 * Track item no painel lateral — estilo Studio One / Pro Tools.
 * Tier badge é clicável (dropdown de seleção).
 * Click seleciona, Ctrl+Click multi-seleciona.
 */
export function TrackListItem({ track, index, isSelected, group }: TrackListItemProps) {
  const toggleMute = useProjectStore((s) => s.toggleMute);
  const toggleSolo = useProjectStore((s) => s.toggleSolo);
  const setTrackTier = useProjectStore((s) => s.setTrackTier);
  const selectTrack = useProjectStore((s) => s.selectTrack);

  const [tierDropdownOpen, setTierDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  /** Fecha dropdown ao clicar fora */
  useEffect(() => {
    if (!tierDropdownOpen) return;

    function handleClickOutside(e: globalThis.MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setTierDropdownOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [tierDropdownOpen]);

  /** Selecionar tier */
  const handleTierSelect = useCallback(
    (tier: TrackTier) => {
      setTrackTier(track.id, tier);
      setTierDropdownOpen(false);
    },
    [setTrackTier, track.id]
  );

  /** Click no card para seleção (Ctrl+Click = multi) */
  const handleCardClick = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      // Ignorar clicks em botões e controles internos
      const target = e.target as HTMLElement;
      if (
        target.closest('.track-list-item__btn') ||
        target.closest('.track-list-item__tier-selector')
      ) {
        return;
      }
      selectTrack(track.id, e.ctrlKey || e.metaKey);
    },
    [selectTrack, track.id]
  );

  return (
    <div
      className={`track-list-item ${isSelected ? 'track-list-item--selected' : ''}`}
      id={`track-item-${track.id}`}
      onClick={handleCardClick}
    >
      {/* Color strip no topo */}
      <div
        className="track-list-item__color-strip"
        style={{ backgroundColor: track.color }}
      />

      {/* Barra de grupo na borda esquerda */}
      {group && (
        <div
          className="track-list-item__group-bar"
          style={{ backgroundColor: group.color }}
          title={group.name}
        />
      )}

      {/* Linha 1: Número + M + S + Nome + Ícone */}
      <div className="track-list-item__row-main">
        <span className="track-list-item__number">{index + 1}</span>

        <button
          className={`track-list-item__btn ${
            track.muted ? 'track-list-item__btn--mute-active' : ''
          }`}
          onClick={() => toggleMute(track.id)}
          title="Mute"
          aria-label={`Mute ${track.name}`}
        >
          M
        </button>

        <button
          className={`track-list-item__btn ${
            track.solo ? 'track-list-item__btn--solo-active' : ''
          }`}
          onClick={() => toggleSolo(track.id)}
          title="Solo"
          aria-label={`Solo ${track.name}`}
        >
          S
        </button>

        <span
          className={`track-list-item__name truncate ${
            track.muted ? 'track-list-item__name--muted' : ''
          }`}
        >
          {track.name}
        </span>

        <span className="track-list-item__waveform-icon">∿</span>
      </div>

      {/* Linha 2: Tier selector (editável) + Group badge */}
      <div className="track-list-item__row-tier">
        <div className="track-list-item__tier-selector" ref={dropdownRef}>
          <button
            className={`track-list-item__tier-badge track-list-item__tier-badge--${track.tier}`}
            onClick={() => setTierDropdownOpen((prev) => !prev)}
            title="Alterar tier de prioridade"
            aria-label={`Tier ${track.tier} — clique para alterar`}
          >
            <span
              className="track-list-item__tier-dot"
              style={{ backgroundColor: track.color }}
            />
            Tier {track.tier} · {TIER_SHORT[track.tier]}
            <span className="track-list-item__tier-arrow">▾</span>
          </button>

          {/* Dropdown */}
          {tierDropdownOpen && (
            <div className="track-list-item__tier-dropdown">
              {TIER_OPTIONS.map((opt) => (
                <button
                  key={opt.tier}
                  className={`track-list-item__tier-option ${
                    track.tier === opt.tier ? 'track-list-item__tier-option--active' : ''
                  }`}
                  onClick={() => handleTierSelect(opt.tier)}
                >
                  <span
                    className="track-list-item__tier-option-dot"
                    style={{ backgroundColor: opt.color }}
                  />
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Group badge */}
        {group && (
          <span
            className="track-list-item__group-badge"
            style={{
              color: group.color,
              borderColor: group.color,
              backgroundColor: `${group.color}15`,
            }}
          >
            {group.name}
          </span>
        )}
      </div>

      {/* Linha 3: I/O Routing (placeholders — funcional na Etapa 3) */}
      <div className="track-list-item__row-routing">
        <div className="track-list-item__routing-select">
          <span className="track-list-item__routing-label">In: None</span>
          <span className="track-list-item__routing-arrow">▾</span>
        </div>
        <div className="track-list-item__routing-select">
          <span className="track-list-item__routing-label">Out: Master</span>
          <span className="track-list-item__routing-arrow">▾</span>
        </div>
      </div>
    </div>
  );
}
