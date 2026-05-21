import { useProjectStore } from '../store/projectStore';
import './ArrangementHeader.css';

/** Header com as seções do arranjo (Intro, Verse, Chorus, Bridge, Outro) */
export function ArrangementHeader() {
  const sections = useProjectStore((s) => s.project.sections);
  const pixelsPerBeat = useProjectStore((s) => s.pixelsPerBeat);

  return (
    <div className="arrangement-header" id="arrangement-header">
      {sections.map((section) => (
        <div
          key={section.id}
          className="arrangement-header__section"
          style={{
            width: section.durationBeats * pixelsPerBeat,
            backgroundColor: section.color,
            minWidth: section.durationBeats * pixelsPerBeat,
          }}
        >
          <span className="arrangement-header__label">{section.label}</span>
        </div>
      ))}
    </div>
  );
}
