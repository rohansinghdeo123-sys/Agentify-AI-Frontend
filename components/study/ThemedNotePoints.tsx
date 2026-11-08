import { notePoints } from "./notePoints";
import NotesChemistryText from "./NotesChemistryText";
import RichMarkdown from "@/components/RichMarkdown";
import styles from "./topic-notes.module.css";
import { NoteLearningText, NotesSourceBadge, PatternInterrupt } from "./NoteLearningBlocks";
import type { NoteTeachingBlock } from "@/features/study/api";

export default function ThemedNotePoints({ text, blocks }: { text: string; blocks?: NoteTeachingBlock[] }) {
  const points: NoteTeachingBlock[] = blocks?.length ? blocks : notePoints(text).map(value=>({kind:"legacy",text:value}));
  const labels: Record<string,string> = {definition:"Scientific definition",formula:"Formula",worked_example:"Worked example",misconception:"A common mistake",clarification:"Teacher clarification"};
  return <ul className={styles.points} role="list">{points.map((block,i) => {
    if (block.kind==="pattern_interrupt") return <li key={i} className={styles.interruptItem}><PatternInterrupt interrupt={{type:block.interrupt_type || "think_about_it",heading:block.heading || "Pause and think",question:block.question || block.activity || block.text,hint:block.hint,answer:block.answer}} /></li>;
    const point = block.text;
    const example = ["example","worked_example"].includes(block.kind) || /^(?:For example|For instance|Example)\b/i.test(point);
    const label = block.presentation==="source_preview" && ["worked_example","derivation"].includes(block.kind) ? "Try this example" : labels[block.kind];
    const colon = point.indexOf(":");
    const lead = block.kind === "legacy" && colon > 0 && colon < 85 ? point.slice(0,colon+1) : "";
    return <li key={i} className={example ? styles.example : undefined}>
      <span className={styles.dot} aria-hidden="true" />
      <div className={styles.teachingText}>{label || example ? <span className={styles.exampleLabel}>{label || "In practice"}</span> : null}
      <NotesSourceBadge type={block.source_type} />
      {/[`$]|\\[([]/.test(point) ? <RichMarkdown content={point} /> : <>
        {lead ? <strong><NotesChemistryText text={lead} /> </strong> : null}
        <NotesChemistryText text={lead ? point.slice(lead.length).trimStart() : point} />
      </>}</div>
      {block.expanded_text ? <div className={styles.expandedReasoning}>{block.presentation!=="source_preview" && ["definition","formula","worked_example"].includes(block.kind) ? <NoteLearningText text={block.expanded_text} /> : <details><summary>{block.presentation==="source_preview" ? block.kind==="worked_example" || block.kind==="derivation" ? "Reveal full worked solution" : "Read full source explanation" : "See the full reasoning"}</summary><NoteLearningText text={block.expanded_text} /></details>}</div> : null}
    </li>;
  })}</ul>;
}
