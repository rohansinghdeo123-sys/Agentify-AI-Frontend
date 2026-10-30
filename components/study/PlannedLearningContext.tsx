import type { StudyLabContext } from "@/features/planning/contracts";
import styles from "./planned-learning.module.css";

/** Plain bullets until Amit supplies the final notes format. */
export function LearningNotes({ notes }: { notes: string[] }) {
  return <div><h3>Today you&apos;ll learn</h3><ul>{notes.map((note, i) => <li key={`${i}-${note}`}>{note}</li>)}</ul></div>;
}

export default function PlannedLearningContext({ context }: { context: StudyLabContext }) {
  return <section className={styles.context} aria-label="Planned learning context">
    <p>Today&apos;s route · {context.step_label}</p>
    <h2>{context.current_topic}</h2>
    <p>{context.recommended_minutes || 0} min · Main focus · {context.recommended_depth}</p>
    <p><strong>Why now: </strong>{context.why_now}</p>
    {context.override.active ? <p role="status">{context.override.explanation || context.override.reason_label}</p> : null}
    <LearningNotes notes={context.key_notes || []} />
    <p><strong>Learning approach: </strong>{context.recommended_approach.join(" → ")}</p>
    {context.prerequisites.length ? <p>Prerequisites: {context.prerequisites.join(", ")}</p> : null}
    <label>Progress: {context.progress_percentage || 0}% <progress max={100} value={context.progress_percentage || 0} /></label>
  </section>;
}
