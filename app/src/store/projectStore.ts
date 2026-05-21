import { create } from 'zustand';
import type { TesseractProject, TrackTier } from '../types/project';
import { MOCK_PROJECT } from '../data/mockProject';

/** Cores disponíveis para grupos (cicla automaticamente) */
const GROUP_COLORS = [
  '#e74c3c', '#3498db', '#2ecc71', '#f39c12',
  '#9b59b6', '#1abc9c', '#e67e22', '#16a085',
];

/** Gera ID único para grupos */
let groupCounter = 0;
function generateGroupId(): string {
  groupCounter++;
  return `grp_${groupCounter.toString().padStart(3, '0')}`;
}

/** Gera nome de grupo por letra: A, B, C... */
function generateGroupName(index: number): string {
  return `Group ${String.fromCharCode(65 + (index % 26))}`;
}

interface ProjectState {
  /** Projeto ativo carregado na engine */
  project: TesseractProject;

  /** Estado de playback */
  isPlaying: boolean;

  /** Posição atual do playhead em beats */
  playheadBeat: number;

  /** IDs das tracks selecionadas */
  selectedTrackIds: string[];

  /** Alterna mute de uma track */
  toggleMute: (trackId: string) => void;

  /** Alterna solo de uma track */
  toggleSolo: (trackId: string) => void;

  /** Altera o tier de uma track */
  setTrackTier: (trackId: string, tier: TrackTier) => void;

  /** Seleciona/deseleciona uma track (multiSelect = Ctrl+Click) */
  selectTrack: (trackId: string, multiSelect: boolean) => void;

  /** Limpa toda a seleção */
  clearSelection: () => void;

  /** Cria grupo das tracks selecionadas (Ctrl+G) */
  createGroup: () => void;

  /** Remove uma track de seu grupo */
  removeTrackFromGroup: (trackId: string) => void;

  /** Dissolve um grupo inteiro */
  dissolveGroup: (groupId: string) => void;

  /** Play/Pause */
  togglePlayback: () => void;

  /** Reseta playhead para o início */
  stopPlayback: () => void;

  /** Atualiza BPM do projeto */
  setBpm: (bpm: number) => void;

  /** Atualiza posição do playhead (chamado pelo engine de áudio via rAF) */
  setPlayheadBeat: (beat: number) => void;

  /** Largura visual de cada beat (zoom) */
  pixelsPerBeat: number;

  /** Altera o nível de zoom */
  setZoom: (newZoom: number) => void;

  /** Resolução do snap magnético */
  snapResolution: SnapResolution;
  setSnapResolution: (res: SnapResolution) => void;
}

export type SnapResolution = '1/4' | '1/8' | '1/16' | '1/32' | '1/3T';

export const useProjectStore = create<ProjectState>((set, get) => ({
  project: MOCK_PROJECT,
  isPlaying: false,
  playheadBeat: 0,
  selectedTrackIds: [],
  pixelsPerBeat: 48, // valor padrão inicial (48px por batida)
  snapResolution: '1/8',
  setSnapResolution: (res) => set({ snapResolution: res }),

  toggleMute: (trackId) =>
    set((state) => ({
      project: {
        ...state.project,
        tracks: state.project.tracks.map((track) =>
          track.id === trackId ? { ...track, muted: !track.muted } : track
        ),
      },
    })),

  toggleSolo: (trackId) =>
    set((state) => ({
      project: {
        ...state.project,
        tracks: state.project.tracks.map((track) =>
          track.id === trackId ? { ...track, solo: !track.solo } : track
        ),
      },
    })),

  setTrackTier: (trackId, tier) =>
    set((state) => ({
      project: {
        ...state.project,
        tracks: state.project.tracks.map((track) =>
          track.id === trackId ? { ...track, tier } : track
        ),
      },
    })),

  selectTrack: (trackId, multiSelect) =>
    set((state) => {
      if (multiSelect) {
        // Ctrl+Click: toggle individual
        const isSelected = state.selectedTrackIds.includes(trackId);
        return {
          selectedTrackIds: isSelected
            ? state.selectedTrackIds.filter((id) => id !== trackId)
            : [...state.selectedTrackIds, trackId],
        };
      }
      // Click normal: seleção única
      const isAlreadyOnlySelected =
        state.selectedTrackIds.length === 1 &&
        state.selectedTrackIds[0] === trackId;
      return {
        selectedTrackIds: isAlreadyOnlySelected ? [] : [trackId],
      };
    }),

  clearSelection: () => set({ selectedTrackIds: [] }),

  createGroup: () => {
    const state = get();
    const { selectedTrackIds } = state;

    // Precisa de pelo menos 2 tracks para criar grupo
    if (selectedTrackIds.length < 2) return;

    // Remove tracks de grupos existentes antes de reagrupar
    const cleanedGroups = state.project.groups.map((group) => ({
      ...group,
      trackIds: group.trackIds.filter(
        (id) => !selectedTrackIds.includes(id)
      ),
    })).filter((group) => group.trackIds.length > 0);

    const newGroupIndex = cleanedGroups.length;
    const colorIndex = newGroupIndex % GROUP_COLORS.length;
    const groupColor = GROUP_COLORS[colorIndex];

    if (groupColor === undefined) return;

    const newGroup = {
      id: generateGroupId(),
      name: generateGroupName(newGroupIndex),
      color: groupColor,
      trackIds: [...selectedTrackIds],
    };

    set({
      project: {
        ...state.project,
        groups: [...cleanedGroups, newGroup],
      },
      selectedTrackIds: [],
    });
  },

  removeTrackFromGroup: (trackId) =>
    set((state) => ({
      project: {
        ...state.project,
        groups: state.project.groups
          .map((group) => ({
            ...group,
            trackIds: group.trackIds.filter((id) => id !== trackId),
          }))
          .filter((group) => group.trackIds.length > 0),
      },
    })),

  dissolveGroup: (groupId) =>
    set((state) => ({
      project: {
        ...state.project,
        groups: state.project.groups.filter((g) => g.id !== groupId),
      },
    })),

  togglePlayback: () =>
    set((state) => ({ isPlaying: !state.isPlaying })),

  stopPlayback: () =>
    set({ isPlaying: false, playheadBeat: 0 }),

  setBpm: (bpm) =>
    set((state) => ({
      project: { ...state.project, bpm: Math.min(300, Math.max(40, Math.round(bpm))) },
    })),

  setPlayheadBeat: (beat) =>
    set({ playheadBeat: beat }),

  setZoom: (newZoom) =>
    set({
      pixelsPerBeat: Math.max(12, Math.min(300, newZoom)), // Limita o zoom entre 12px e 300px
    }),
}));
