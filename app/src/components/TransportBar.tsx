import { useState, useRef, useCallback, useEffect } from 'react';
import { useProjectStore } from '../store/projectStore';
import './TransportBar.css';

function BpmControl() {
  const bpm = useProjectStore((s) => s.project.bpm);
  const setBpm = useProjectStore((s) => s.setBpm);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const commit = useCallback(() => {
    const val = parseInt(draft, 10);
    if (!isNaN(val)) setBpm(val);
    setEditing(false);
  }, [draft, setBpm]);

  const startEdit = useCallback(() => {
    setDraft(String(bpm));
    setEditing(true);
  }, [bpm]);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const onWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      setBpm(bpm + (e.deltaY < 0 ? 1 : -1));
    },
    [bpm, setBpm],
  );

  return (
    <div className="transport-bar__bpm" onWheel={onWheel} title="Scroll to adjust BPM">
      {editing ? (
        <input
          ref={inputRef}
          className="transport-bar__bpm-input"
          type="number"
          min={40}
          max={300}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') setEditing(false);
          }}
        />
      ) : (
        <span
          className="transport-bar__bpm-value"
          onClick={startEdit}
          title="Click to edit BPM"
        >
          {bpm}
        </span>
      )}
      <span className="transport-bar__bpm-label">BPM</span>
    </div>
  );
}

/** Barra de transporte com controles de playback e metadata do projeto */
export function TransportBar() {
  const project = useProjectStore((s) => s.project);
  const isPlaying = useProjectStore((s) => s.isPlaying);
  const playheadBeat = useProjectStore((s) => s.playheadBeat);
  const togglePlayback = useProjectStore((s) => s.togglePlayback);
  const stopPlayback = useProjectStore((s) => s.stopPlayback);

  const totalSeconds = (playheadBeat / project.bpm) * 60;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const frames = Math.floor((totalSeconds % 1) * 30);
  const timecode = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}:${String(frames).padStart(2, '0')}`;

  return (
    <header className="transport-bar" id="transport-bar">
      {/* Branding */}
      <div className="transport-bar__brand">
        <span className="transport-bar__logo">Tesseract</span>
        <span className="transport-bar__version">v0.1</span>
      </div>

      <div className="transport-bar__divider" />

      {/* Controles de Transporte */}
      <div className="transport-bar__controls">
        <button
          id="btn-stop"
          className="transport-bar__btn"
          onClick={stopPlayback}
          title="Stop (Space)"
          aria-label="Stop"
        >
          ■
        </button>
        <button
          id="btn-play"
          className={`transport-bar__btn ${isPlaying ? 'transport-bar__btn--active' : ''}`}
          onClick={togglePlayback}
          title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? '⏸' : '▶'}
        </button>
      </div>

      <div className="transport-bar__divider" />

      {/* Timecode */}
      <div className="transport-bar__timecode">{timecode}</div>

      <div className="transport-bar__divider" />

      {/* BPM — editável */}
      <BpmControl />

      {/* Time Signature */}
      <div className="transport-bar__time-sig">
        {project.timeSignature[0]}/{project.timeSignature[1]}
      </div>

      {/* Nome do Projeto */}
      <span className="transport-bar__project-name">{project.name}</span>

      {/* Headroom Target */}
      <div className="transport-bar__headroom">
        <span className="transport-bar__headroom-value">-6.0</span>
        <span className="transport-bar__headroom-label">dB Target</span>
      </div>
    </header>
  );
}
