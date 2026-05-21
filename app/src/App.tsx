import { useRef, useCallback, useEffect } from 'react';
import { TransportBar } from './components/TransportBar';
import { TrackListPanel } from './components/TrackListPanel';
import { ArrangementView } from './components/ArrangementView';
import { AnalysisPanel } from './components/AnalysisPanel';
import { useAudioPlayback } from './hooks/useAudioPlayback';
import { useGlobalFileDrop } from './hooks/useGlobalFileDrop';
import { useProjectStore } from './store/projectStore';

export function App() {
  const trackListScrollRef  = useRef<HTMLDivElement>(null);
  const arrangementScrollRef = useRef<HTMLDivElement>(null);
  const togglePlayback = useProjectStore((s) => s.togglePlayback);
  const stopPlayback   = useProjectStore((s) => s.stopPlayback);

  const { seekTo } = useAudioPlayback();
  useGlobalFileDrop();

  const handleTrackListScroll = useCallback(() => {
    const s = trackListScrollRef.current;
    const t = arrangementScrollRef.current;
    if (s && t) t.scrollTop = s.scrollTop;
  }, []);

  const handleArrangementScroll = useCallback(() => {
    const s = arrangementScrollRef.current;
    const t = trackListScrollRef.current;
    if (s && t) t.scrollTop = s.scrollTop;
  }, []);

  // Global keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.code === 'Space') { e.preventDefault(); togglePlayback(); }
      if (e.code === 'Escape') stopPlayback();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [togglePlayback, stopPlayback]);

  return (
    <div className="app-shell" id="app-shell">
      <TransportBar />
      <div className="workspace">
        <TrackListPanel
          scrollRef={trackListScrollRef}
          onScroll={handleTrackListScroll}
        />
        <ArrangementView
          scrollRef={arrangementScrollRef}
          onScroll={handleArrangementScroll}
          onSeek={seekTo}
        />
        <AnalysisPanel />
      </div>
    </div>
  );
}
