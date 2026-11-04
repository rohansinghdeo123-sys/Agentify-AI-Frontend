import { notePoints } from "./notePoints";
import NotesChemistryText from "./NotesChemistryText";
import RichMarkdown from "@/components/RichMarkdown";
import styles from "./topic-notes.module.css";

export default function ThemedNotePoints({ text, blocks }: { text: string; blocks?: Array<{kind: string; text: string}> }) {
  const points = blocks || notePoints(text).map(value=>({kind:"legacy",text:value}));
  const labels: Record<string,string> = {definition:"Scientific definition",formula:"Formula",worked_example:"Worked example",misconception:"A common mistake",clarification:"Teacher clarification"};
  return <ul className={styles.points} role="list">{points.map((block,i) => {
    const point = block.text;
    const example = ["example","worked_example"].includes(block.kind) || /^(?:For example|For instance|Example)\b/i.test(point);
    const colon = point.indexOf(":");
    const lead = block.kind === "legacy" && colon > 0 && colon < 85 ? point.slice(0,colon+1) : "";
    return <li key={i} className={example ? styles.example : undefined}>
      <span className={styles.dot} aria-hidden="true" />
      <div className={styles.teachingText}>{labels[block.kind] || example ? <span className={styles.exampleLabel}>{labels[block.kind] || "In practice"}</span> : null}
      {/[`$]|\\[([]/.test(point) ? <RichMarkdown content={point} /> : <>
        {lead ? <strong><NotesChemistryText text={lead} /> </strong> : null}
        <NotesChemistryText text={lead ? point.slice(lead.length).trimStart() : point} />
      </>}</div>
    </li>;
  })}</ul>;
}
