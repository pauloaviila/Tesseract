import { useCallback } from 'react';
import { useProjectStore } from '../store/projectStore';
import { useStemStore } from '../store/stemStore';
import { analyzeProject } from '../engine/tauri';
import './AnalysisPanel.css';

const BAND_LABELS: Record<string, string> = {
  '20-80':    'Sub',
  '80-250':   'Bass',
  '250-500':  'Lo-Mid',
  '500-2000': 'Mid',
  '2000-6000':'Hi-Mid',
  '6000-20000':'Air',
};

function bandLabel(lo: number, hi: number): string {
  const key = `${lo}-${hi}`;
  return BAND_LABELS[key] ?? `${lo}–${hi} Hz`;
}

function conflictSeverity(db: number): 'low' | 'medium' | 'high' {
  if (db > 12) return 'high';
  if (db > 6) return 'medium';
  return 'low';
}

export function AnalysisPanel() {
  const tracks = useProjectStore((s) => s.project.tracks);
  const stems = useStemStore((s) => s.stems);
  const conflicts = useStemStore((s) => s.conflicts);
  const gainStaging = useStemStore((s) => s.gainStaging);
  const status = useStemStore((s) => s.analysisStatus);
  const error = useStemStore((s) => s.analysisError);
  const setAnalysisResult = useStemStore((s) => s.setAnalysisResult);
  const setAnalysisStatus = useStemStore((s) => s.setAnalysisStatus);

  const loadedCount = Object.keys(stems).length;
  const totalCount = tracks.length;

  const runAnalysis = useCallback(async () => {
    if (loadedCount === 0) return;
    setAnalysisStatus('running');

    const stemInputs = Object.values(stems).map((s) => {
      const track = tracks.find((t) => t.id === s.trackId);
      return {
        track_id: s.trackId,
        file_path: s.filePath,
        tier: track?.tier ?? 3,
      };
    });

    try {
      const result = await analyzeProject(stemInputs, -6.0);
      setAnalysisResult(result.conflicts, result.gain_staging);
    } catch (e) {
      setAnalysisStatus('error', String(e));
    }
  }, [stems, tracks, loadedCount, setAnalysisResult, setAnalysisStatus]);

  return (
    <aside className="analysis-panel" id="analysis-panel">
      <div className="analysis-panel__header">
        <span className="analysis-panel__title">Spectral Analysis</span>
        <span className="analysis-panel__loaded">
          {loadedCount}/{totalCount} stems
        </span>
      </div>

      <button
        className={`analysis-panel__run-btn ${status === 'running' ? 'analysis-panel__run-btn--running' : ''}`}
        onClick={runAnalysis}
        disabled={status === 'running' || loadedCount === 0}
      >
        {status === 'running' ? 'Analyzing…' : 'Run Analysis'}
      </button>

      {error && (
        <div className="analysis-panel__error">{error}</div>
      )}

      {status === 'done' && conflicts.length === 0 && (
        <div className="analysis-panel__clean">
          No conflicts detected — spectrum is clean.
        </div>
      )}

      {conflicts.length > 0 && (
        <div className="analysis-panel__conflicts">
          <div className="analysis-panel__section-label">
            Frequency Conflicts ({conflicts.length})
          </div>
          {conflicts.map((c, i) => {
            const sev = conflictSeverity(c.attenuation_db);
            const nameA = tracks.find((t) => t.id === c.stem_a_id)?.name ?? c.stem_a_id;
            const nameB = tracks.find((t) => t.id === c.stem_b_id)?.name ?? c.stem_b_id;
            return (
              <div key={i} className={`analysis-panel__conflict analysis-panel__conflict--${sev}`}>
                <div className="analysis-panel__conflict-band">
                  {bandLabel(c.hz_lo, c.hz_hi)}
                </div>
                <div className="analysis-panel__conflict-stems">
                  <span className="analysis-panel__conflict-hi">{nameA}</span>
                  <span className="analysis-panel__conflict-arrow">→</span>
                  <span className="analysis-panel__conflict-lo">{nameB}</span>
                </div>
                <div className="analysis-panel__conflict-db">
                  −{c.attenuation_db.toFixed(1)} dB
                </div>
              </div>
            );
          })}
        </div>
      )}

      {gainStaging.length > 0 && (
        <div className="analysis-panel__gain">
          <div className="analysis-panel__section-label">Gain Staging</div>
          {gainStaging.map((g) => {
            const name = tracks.find((t) => t.id === g.track_id)?.name ?? g.track_id;
            const sign = g.required_gain_db >= 0 ? '+' : '';
            return (
              <div key={g.track_id} className="analysis-panel__gain-row">
                <span className="analysis-panel__gain-name">{name}</span>
                <span className="analysis-panel__gain-current">
                  {g.current_peak_db.toFixed(1)} dBFS
                </span>
                <span
                  className={`analysis-panel__gain-delta ${
                    Math.abs(g.required_gain_db) > 3
                      ? 'analysis-panel__gain-delta--warn'
                      : ''
                  }`}
                >
                  {sign}{g.required_gain_db.toFixed(1)} dB
                </span>
              </div>
            );
          })}
        </div>
      )}
    </aside>
  );
}
