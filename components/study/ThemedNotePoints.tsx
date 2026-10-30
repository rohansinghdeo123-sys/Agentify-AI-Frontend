import { notePoints } from "./notePoints";
import NotesChemistryText from "./NotesChemistryText";
import RichMarkdown from "@/components/RichMarkdown";
import styles from "./topic-notes.module.css";

export default function ThemedNotePoints({ text }: { text: string }) {
  const points = notePoints(text);
  return <ul className={styles.points} role="list">{points.map((point,i) => {
    const example = /^(?:For example|For instance|Example)\b/i.test(point);
    const colon = point.indexOf(":");
    const lead = colon > 0 && colon < 85 ? point.slice(0,colon+1) : "";
    return <li key={i} className={example ? styles.example : undefined}>
      <span className={styles.dot} aria-hidden="true" />
      <div>{example ? <span className={styles.exampleLabel}>In practice</span> : null}
      {/[`$]|\\[([]/.test(point) ? <RichMarkdown content={point} /> : <>
        {lead ? <strong><NotesChemistryText text={lead} /> </strong> : null}
        <NotesChemistryText text={lead ? point.slice(lead.length).trimStart() : point} />
      </>}</div>
    </li>;
  })}</ul>;
}
