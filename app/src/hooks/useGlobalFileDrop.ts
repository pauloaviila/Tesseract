/**
 * Global file drag-drop using Tauri v2's onDragDropEvent.
 *
 * Why not DOM DragEvent: Tauri v2's WebView2 does NOT expose native file paths
 * in e.dataTransfer.files[0].path — that's Electron-only. Tauri fires its own
 * event with real native paths + cursor position in PHYSICAL pixels.
 *
 * DPI fix: elementFromPoint() uses CSS (logical) pixels. Tauri position comes
 * in physical pixels. Dividing by devicePixelRatio converts correctly.
 */
import { useEffect } from 'react';
import { useStemStore } from '../store/stemStore';
import { loadStemFromPath, isAudioFile } from '../engine/stemLoader';

const IS_TAURI =
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

const DRAG_OVER_CLASS = 'track-lane--drag-over';
const WINDOW_DRAG_CLASS = 'app--dragging';

/** Convert Tauri physical px → CSS logical px, then hit-test the DOM. */
function trackIdAtPhysical(physX: number, physY: number): string | null {
  const dpr = window.devicePixelRatio || 1;
  const el = document.elementFromPoint(physX / dpr, physY / dpr);
  return el?.closest<HTMLElement>('[data-track-id]')?.dataset.trackId ?? null;
}

function setHighlight(trackId: string | null) {
  document.querySelectorAll(`.${DRAG_OVER_CLASS}`)
    .forEach((el) => el.classList.remove(DRAG_OVER_CLASS));
  if (trackId) {
    document.getElementById(`track-lane-${trackId}`)
      ?.classList.add(DRAG_OVER_CLASS);
  }
}

export function useGlobalFileDrop() {
  const setStem = useStemStore((s) => s.setStem);

  useEffect(() => {
    if (!IS_TAURI) return;

    let unlisten: (() => void) | undefined;

    (async () => {
      const { getCurrentWebview } = await import('@tauri-apps/api/webview');

      unlisten = await getCurrentWebview().onDragDropEvent(async (event) => {
        // Cast: Tauri types vary by version; access the raw payload safely
        const p = event.payload as {
          type: 'enter' | 'over' | 'drop' | 'leave';
          paths?: string[];
          position?: { x: number; y: number };
        };

        switch (p.type) {
          // 'enter' fires first when a file enters the window — highlight the lane
          case 'enter':
          case 'over': {
            if (!p.position) break;
            const trackId = trackIdAtPhysical(p.position.x, p.position.y);
            setHighlight(trackId);
            // Show a global "dragging" state so lanes become more visible
            document.getElementById('app-shell')
              ?.classList.toggle(WINDOW_DRAG_CLASS, true);
            break;
          }

          case 'leave': {
            setHighlight(null);
            document.getElementById('app-shell')
              ?.classList.remove(WINDOW_DRAG_CLASS);
            break;
          }

          case 'drop': {
            setHighlight(null);
            document.getElementById('app-shell')
              ?.classList.remove(WINDOW_DRAG_CLASS);

            if (!p.position || !p.paths?.length) break;

            const trackId = trackIdAtPhysical(p.position.x, p.position.y);
            if (!trackId) {
              console.warn('[Tesseract] drop outside any track lane — ignored');
              break;
            }

            const filePath = p.paths.find(isAudioFile);
            if (!filePath) {
              console.warn('[Tesseract] dropped file is not a recognised audio format');
              break;
            }

            try {
              const stemData = await loadStemFromPath(trackId, filePath);
              setStem(stemData);
            } catch (err) {
              console.error('[Tesseract] ingest failed after drop:', err);
            }
            break;
          }
        }
      });
    })();

    return () => {
      unlisten?.();
      setHighlight(null);
      document.getElementById('app-shell')?.classList.remove(WINDOW_DRAG_CLASS);
    };
  }, [setStem]);
}
