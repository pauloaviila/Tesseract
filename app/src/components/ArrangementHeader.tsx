import { useProjectStore } from '../store/projectStore';
import { BEAT_WIDTH_PX } from '../utils/constants';
import './ArrangementHeader.css';

/** Header com as seções do arranjo (Intro, Verse, Chorus, Bridge, Outro) */
export function ArrangementHeader() {
  const sections = useProjectStore((s) => s.project.sections);

  return (
    <div className="arrangement-header" id="arrangement-header">
      {sections.map((section) => (
        <div
          key={section.id}
          className="arrangement-header__section"
          style={{
            width: section.durationBeats * BEAT_WIDTH_PX,
            backgroundColor: section.color,
            minWidth: section.durationBeats * BEAT_WIDTH_PX,
          }}
        >
          <span className="arrangement-header__label">{section.label}</span>
        </div>
      ))}
    </div>
  );
}
