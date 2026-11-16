import RichMarkdown from "@/components/RichMarkdown";
import type { NoteInterrupt, NotesSourceType } from "@/features/study/api";
import NotesChemistryText from "./NotesChemistryText";
import styles from "./topic-notes.module.css";

export function NoteLearningText({text}:{text:string}) {
  return /[`$]|\\[([]/.test(text) ? <RichMarkdown content={text} /> : <NotesChemistryText text={text} />;
}

export function notesSourceLabel(type?: NotesSourceType) {
  return type ? "NCERT" : "";
}

export function NotesSourceBadge({type}:{type?:NotesSourceType}) {
  const label = notesSourceLabel(type);
  return label ? <span className={styles.sourceBadge} data-source={type}>{label}</span> : null;
}

const interruptLabels: Record<string,string> = {
  think_about_it:"Think about it",predict_what_happens:"Predict what happens",everyday_connection:"Everyday connection",
  common_misconception:"Common misconception",quick_knowledge_check:"Quick knowledge check",spot_the_difference:"Spot the difference",
  apply_your_knowledge:"Apply your knowledge",numerical_challenge:"Numerical challenge",interesting_scientific_insight:"Scientific insight",
};

export function PatternInterrupt({interrupt}:{interrupt:NoteInterrupt}) {
  const type = interrupt.type.toLowerCase().replace(/[^a-z0-9]+/g,"_");
  const answer = interrupt.answer || interrupt.explanation;
  return <aside className={styles.interrupt} aria-label={interrupt.heading} data-interrupt={type}>
    <span className={styles.exampleLabel}>{interruptLabels[type] || interrupt.type.replaceAll("_"," ")}</span>
    <h3>{interrupt.heading}</h3>
    <div className={styles.teachingText}><NoteLearningText text={interrupt.question || interrupt.activity || ""} /></div>
    {interrupt.hint ? <details><summary>Show a hint</summary><div className={styles.teachingText}><NoteLearningText text={interrupt.hint} /></div></details> : null}
    {answer ? <details><summary>Reveal the explanation</summary><div className={styles.teachingText}><NoteLearningText text={answer} /></div></details> : null}
  </aside>;
}
