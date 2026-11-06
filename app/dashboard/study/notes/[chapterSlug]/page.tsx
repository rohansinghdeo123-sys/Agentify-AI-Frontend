"use client";
import { LegacyNotesContent } from "./LegacyNotes";
import { useAuth } from "@/context/AuthContext";
import { getChapterNotes, getStudyLabContext, recordStudyRouteHeartbeat, type ChapterNotes, type NotePage } from "@/features/study/api";
import NotesChemistryText from "@/components/study/NotesChemistryText";
import ThemedNotePoints from "@/components/study/ThemedNotePoints";
import { notePoints } from "@/components/study/notePoints";
import noteStyles from "@/components/study/topic-notes.module.css";
import { LoadingState } from "@/components/ui/Polished";
import { createConversationId } from "@/features/study/conversationUtils";
import { studySessionHref } from "@/features/study/routes";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import styles from "../../home.module.css";

export default function StudyNotesPage() {
  const {chapterSlug} = useParams<{chapterSlug:string}>();
  const params = useSearchParams();
  const {userId} = useAuth();
  // A different topic/account must never display the previous request's
  // lesson while authentication or its new notes request is pending.
  return <TopicNotesReader key={`${userId}:${chapterSlug}:${params.get("topic") || ""}`} />;
}

function hasReadableNotes(notes: ChapterNotes | null): notes is ChapterNotes {
  if (!notes) return false;
  if (notes.resolution==="topic_choice") return Boolean(notes.topic_options?.length && notes.topic_options.every(option=>option.id && option.title));
  if (notes.pages?.length) return notes.pages.every(page => page.text?.trim() || page.blocks?.some(block=>block.text?.trim()));
  return Boolean(notes.concepts?.some(concept => [concept.definition,concept.explanation,...(concept.key_points || []),...(concept.formulas || []),...(concept.examples || [])].some(text=>text?.trim())));
}

function chapterName(slug: string) {
  return slug.replace(/^ncert_class_\d+_[a-z]+_chapter_\d+_/, "").split(/[_-]+/).map(word=>word.charAt(0).toUpperCase()+word.slice(1)).join(" ");
}

function TopicNotesReader() {
  const { chapterSlug } = useParams<{chapterSlug: string}>();
  const params = useSearchParams();
  const topic = params.get("topic") || undefined;
  const requestedPage = params.get("page");
  const {userId, getAuthHeaders, loading: authBusy} = useAuth();
  const [notes, setNotes] = useState<ChapterNotes | null>(null);
  const [savedPage, setSavedPage] = useState(0);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (authBusy) return;
    if (!userId) return;
    let active = true;
    const abort = new AbortController();
    void getAuthHeaders().then((headers) => { if (!active) return null; setLoading(true);setLoadError(""); return getChapterNotes({headers},chapterSlug,topic,abort.signal); }).then((data) => {
      if (!active) return;
      if (!hasReadableNotes(data)) {
        setNotes(null);
        setLoadError("We could not find readable notes for this selected topic. Retry to reconnect, or reopen the topic from Planning.");
        return;
      }
      setNotes(data);
      setSavedPage(data?.saved_page || 0);
    }).catch(() => { if (active) {setNotes(null);setLoadError("Your notes could not be loaded. Check your connection and retry.");} }).finally(() => {if(active)setLoading(false);});
    return () => {active=false;abort.abort();};
  },[authBusy,userId,getAuthHeaders,chapterSlug,topic,attempt]);
  useEffect(()=>{
    if (!loading) {
      const scroller = document.getElementById("main-content");
      if (scroller) { scroller.scrollTop = 0; scroller.scrollLeft = 0; }
    }
  },[loading]);
  const pages: NotePage[] = notes?.pages || notes?.concepts.map((c) => ({id:c.id,title:c.title,source:undefined as string | undefined, source_pages:undefined as number[] | undefined, teaching_format:undefined as string | undefined,text:[c.definition,c.explanation,...c.key_points.map((p)=>`- ${p}`),...c.formulas,...c.examples].filter(Boolean).join("\n\n")})) || [];
  const requestedIndex = Number(requestedPage !== null ? requestedPage : savedPage);
  const page = Math.max(0, Math.min(pages.length - 1, Number.isFinite(requestedIndex) ? Math.floor(requestedIndex) : 0));
  const current = pages[page];
  const navigate = async (next: number) => {
    const query = new URLSearchParams(params.toString()); query.set("page",String(next));
    // Next synchronizes native history with useSearchParams without a server
    // navigation. Paging an already-loaded lesson needs no RSC round trip.
    window.history.replaceState(null, "", `?${query}`);
    if (notes?.can_save_position === false) return;
    try {
      const headers = await getAuthHeaders();
      const activeUnit = notes?.active_unit_id || (await getStudyLabContext({headers},userId))?.current_unit_id;
      if (activeUnit) {
        await recordStudyRouteHeartbeat({headers},userId,{unit_id:activeUnit,notes_page:next,notes_topic:notes?.topic_id || topic,...(notes?.content_version ? {notes_version:notes.content_version} : {})});
      }
    } catch {setError("Reading position could not sync. This page remains in the address bar; retry before leaving.");}
  };
  const askHref = current ? `${studySessionHref(createConversationId(),{source:"syllabus",catalogSource:notes?.catalog_source || (notes?.topic_id?.startsWith("chem11_") ? "planning_manifest" : "published"),classLevel:notes?.chapter.class_level,subject:notes?.chapter.subject || "",chapterId:chapterSlug,chapterLabel:notes?.chapter.name || chapterSlug,topicId:notes?.topic_id || topic || current.id,topicLabel:notes?.topic_title || current.title},{fresh:true})}&entry=ask_ai&notesPage=${page}&notesTopic=${encodeURIComponent(notes?.topic_id || topic || current.id)}` : "#";
  if (authBusy || (userId && loading)) return <LoadingState title="Loading topic notes" detail="Opening your saved reading position." />;
  if (!userId) return <p>Please sign in to read notes.</p>;
  if (loadError) return <div className={`${styles.notesContainer} ${noteStyles.reader}`}>
    <header className={styles.notesHeader}><Link href="/dashboard/planning/active">Return to Planning</Link><div><p>{chapterName(chapterSlug)}</p><h1>Notes could not open</h1></div></header>
    <section className={noteStyles.card} role="alert"><h2>Let’s get your topic notes back</h2><p>{loadError}</p>
      <div className={noteStyles.navigation} aria-label="Notes recovery"><button onClick={()=>{setLoading(true);setAttempt(value=>value+1);}}>Retry loading notes</button><Link href="/dashboard/planning/active">Choose a topic in Planning</Link></div>
    </section>
  </div>;
  if (notes?.resolution==="topic_choice") return <div className={`${styles.notesContainer} ${noteStyles.reader}`}>
    <header className={styles.notesHeader}><Link href="/dashboard/planning/active">Return to Planning</Link><div><p>{notes.chapter.name}</p><h1>Choose a learning topic</h1></div></header>
    <section className={noteStyles.card} aria-label="Available learning topics"><p>This section covers several learning topics. Choose one to open its notes.</p>
      <ul className={noteStyles.topicChoices}>{notes.topic_options?.map(option=>{
        const query = new URLSearchParams(params.toString()); query.set("topic",option.id); query.delete("page");
        return <li key={option.id}><Link prefetch={false} className={noteStyles.topicChoice} href={`?${query}`}><strong>{option.title}</strong><span>{option.estimated_minutes.min}–{option.estimated_minutes.max} min</span><span aria-hidden="true">→</span></Link></li>;
      })}</ul>
    </section>
  </div>;
  if (notes && !notes.pages?.length) return <LegacyNotesContent notes={notes} topicId={topic} />;
  return <div className={`${styles.notesContainer} ${noteStyles.reader}`}>
    <header className={styles.notesHeader}><Link href="/dashboard/planning/active">Return to Planning</Link><div>
      <p>{notes?.chapter.name}</p><h1>{notes?.topic_title || "Topic notes"}</h1>
      {notes?.estimated_minutes ? <p>{notes.estimated_minutes.min}–{notes.estimated_minutes.max} min · Topic duration</p> : null}
    </div></header>
    {error ? <p role="alert">{error}</p> : null}
    {notes?.session_portion ? <p className={noteStyles.sessionPortion}>For today’s {notes.session_portion.allocated_minutes}-minute study portion, focus on pages {notes.session_portion.start_page+1}–{notes.session_portion.end_page+1}.{notes.session_portion.additional_practice_needed ? " Continue the remaining explanation and practice in your next session." : " Allow time for the revision questions."}</p> : null}
    {current ? <>
      <nav aria-label="Reading pages" className={noteStyles.navigation}>
        <button disabled={page===0} onClick={()=>void navigate(page-1)}>Previous</button>
        <span>Page {page+1} of {pages.length}</span>
        <button disabled={page===pages.length-1} onClick={()=>void navigate(page+1)}>Next</button>
        <Link href={askHref}>Ask AI about this page</Link>
      </nav>
      <progress aria-label="Reading progress" value={page+1} max={pages.length} className={noteStyles.progress} />
      <article className={noteStyles.card} data-tone={page % 3}>
        <div className={noteStyles.eyebrow}><span>{current.source || "Concept notes"}</span><span className={noteStyles.badge}>{current.blocks?.length || notePoints(current.text).length} key {(current.blocks?.length || notePoints(current.text).length) === 1 ? "point" : "points"}</span></div>
        <h2>{current.title}</h2>{current.source_pages?.length ? <p>{current.source} · PDF page {current.source_pages.join(", ")}</p> : null}<ThemedNotePoints text={current.text} blocks={current.blocks} />
        {current.questions?.length ? <section className={noteStyles.review} aria-label="Check your understanding"><h3>Check your understanding</h3><ol>{current.questions.map((q,i)=><li key={i}><NotesChemistryText text={q.question} /><details><summary>Check the reasoning</summary><NotesChemistryText text={q.answer} /></details></li>)}</ol></section> : null}
        {current.transition ? <p className={noteStyles.transition}><NotesChemistryText text={current.transition} /></p> : null}
      </article>
      <p>Reading progress records your position. Demonstrate mastery with a quick check.</p>
      <Link className={noteStyles.continue} href="/dashboard/study?planned=1">Continue to learning and quick check</Link>
    </> : <p>No verified notes are mapped to this topic yet.</p>}
    {notes?.review_required?.length ? <details><summary>Source material awaiting review</summary><p>Mixed summaries and exercises are excluded until their topic boundaries and scientific content are verified.</p><ul>{Array.from(new Set(notes.review_required.map(r=>r.reason))).map(r=><li key={r}>{r}</li>)}</ul></details> : null}
  </div>;
}
