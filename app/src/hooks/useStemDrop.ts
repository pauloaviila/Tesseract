/**
 * Per-lane drag-over handler — only provides visual feedback.
 * Actual drop loading is handled globally by useGlobalFileDrop (Tauri mode)
 * or by the Load button dialog (both modes).
 *
 * In browser dev mode (no Tauri), onDrop is also handled here using blob URLs
 * so the dev experience still works with stub data.
 */
import { useCallback } from 'react';
import { useStemStore } from '../store/stemStore';
import { loadStemFromPath, isAudioFile } from '../engine/stemLoader';

const IS_TAURI =
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export function useStemDrop(trackId: string) {
  const setStem = useStemStore((s) => s.setStem);

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  // In Tauri mode the actual drop is handled by useGlobalFileDrop.
  // In browser dev mode, handle it here using blob URLs.
  const onDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      if (IS_TAURI) return; // Tauri handles this via onDragDropEvent

      const file = e.dataTransfer.files[0];
      if (!file) return;
      if (!isAudioFile(file.name)) return;

      const blobUrl = URL.createObjectURL(file);
      try {
        const stemData = await loadStemFromPath(trackId, blobUrl);
        setStem(stemData);
      } catch (err) {
        console.error('[Tesseract] browser drop failed:', err);
      }
    },
    [trackId, setStem],
  );

  return { onDragOver, onDrop };
}
