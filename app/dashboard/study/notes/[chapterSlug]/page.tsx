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
import { studyNotesHref, studySessionHref } from "@/features/study/routes";
import type { StudyScope } from "@/features/study/types";
import { NoteLearningText, notesSourceLabel, NotesSourceBadge, PatternInterrupt } from "@/components/study/NoteLearningBlocks";
import { notesCompletedPageIds, notesPageIndex } from "@/features/study/notesReaderState";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import styles from "../../home.module.css";

export default function StudyNotesPage() {
  const {chapterSlug} = useParams<{chapterSlug:string}>();
  const params = useSearchParams();
  const {userId} = useAuth();
  // A different topic/account must never display the previous request's
  // lesson while authentication or its new notes request is pending.
  return <TopicNotesReader key={`${userId}:${chapterSlug}:${params.get("topic") || ""}:${params.get("classLevel") || ""}:${params.get("subject") || ""}`} />;
}

function hasReadableNotes(notes: ChapterNotes | null): notes is ChapterNotes {
  if (!notes) return false;
  if (notes.resolution==="review_required") return true;
  if (notes.resolution==="topic_choice") return Boolean(notes.topic_options?.length && notes.topic_options.every(option=>option.id && option.title));
  if (notes.pages?.length) return new Set(notes.pages.map(page=>page.id)).size===notes.pages.length && notes.pages.every(page => page.id && (page.text?.trim() || page.blocks?.some(block=>block.text?.trim()) || page.interrupts?.some(interrupt=>interrupt.question?.trim() || interrupt.activity?.trim()) || page.questions?.some(question=>question.question?.trim())));
  return Boolean(notes.concepts?.some(concept => [concept.definition,concept.explanation,...(concept.key_points || []),...(concept.formulas || []),...(concept.examples || [])].some(text=>text?.trim())));
}

function chapterName(slug: string) {
  return slug.replace(/^ncert_class_\d+_[a-z]+_chapter_\d+_/, "").split(/[_-]+/).map(word=>word.charAt(0).toUpperCase()+word.slice(1)).join(" ");
}

function TopicNotesReader() {
  const router = useRouter();
  const { chapterSlug } = useParams<{chapterSlug: string}>();
  const params = useSearchParams();
  const topic = params.get("topic") || undefined;
  const requestedPage = params.get("page");
  const requestScope = useRef({classLevel:params.get("classLevel") || undefined,subject:params.get("subject") || undefined,contentVersion:params.get("notesVersion") || undefined,planned:params.get("planned")==="1",startSession:params.get("startSession")==="1"});
  const navigation = useRef({id:"",sequence:0});
  const {userId, getAuthHeaders, loading: authBusy} = useAuth();
  const [notes, setNotes] = useState<ChapterNotes | null>(null);
  const [completedPages, setCompletedPages] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(true);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [submittingFinish, setSubmittingFinish] = useState(false);
  const [openingNextTopic, startTopicTransition] = useTransition();
  const finishing = submittingFinish || openingNextTopic;
  const [finishOutcome, setFinishOutcome] = useState<"time_up" | "sequence_read">();
  const finishInFlight = useRef(false);
  useEffect(() => {
    if (authBusy) return;
    if (!userId) return;
    let active = true;
    const abort = new AbortController();
    void getAuthHeaders().then((headers) => { if (!active) return null; setLoading(true);setLoadError(""); return getChapterNotes({headers},chapterSlug,topic,abort.signal,requestScope.current); }).then((data) => {
      if (!active) return;
      if (!hasReadableNotes(data)) {
        setNotes(null);
        setLoadError("We could not find readable notes for this selected topic. Retry to reconnect, or reopen the topic from Planning.");
        return;
      }
      setNotes(data);
      setCompletedPages(notesCompletedPageIds(data));
      if (requestScope.current.startSession && data.study_session) {
        requestScope.current.startSession = false;
        const url = new URL(window.location.href);
        url.searchParams.delete("startSession");
        window.history.replaceState(null, "", url);
      }
    }).catch(() => { if (active) {setNotes(null);setLoadError("Your notes could not be loaded. Check your connection and retry.");} }).finally(() => {if(active)setLoading(false);});
    return () => {active=false;abort.abort();};
  },[authBusy,userId,getAuthHeaders,chapterSlug,topic,attempt]);
  useEffect(()=>{
    if (!loading) {
      const scroller = document.getElementById("main-content");
      if (scroller) { scroller.scrollTop = 0; scroller.scrollLeft = 0; }
    }
  },[loading]);
  const deadline = notes?.study_session?.ends_at;
  useEffect(() => {
    if (!deadline) return;
    const tick = () => setRemaining(Math.max(0, Math.ceil((Date.parse(deadline) - Date.now()) / 1000)));
    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [deadline]);
  const pages: NotePage[] = notes?.pages || notes?.concepts.map((c) => ({id:c.id,title:c.title,source:undefined as string | undefined, source_pages:undefined as number[] | undefined, teaching_format:undefined as string | undefined,text:[c.definition,c.explanation,...c.key_points.map((p)=>`- ${p}`),...c.formulas,...c.examples].filter(Boolean).join("\n\n")})) || [];
  const page = notesPageIndex(notes,{page:requestedPage,pageId:params.get("pageId"),version:params.get("notesVersion")});
  const current = pages[page];
  const tracksCompletedPages = notes?.completed_page_ids !== undefined;
  const saveReadingPosition = async (next: number, completed: string[], finishNotes = false) => {
    if (notes?.can_save_position === false) return;
    navigation.current.id ||= createConversationId();
    const sequence = ++navigation.current.sequence;
    const headers = await getAuthHeaders();
    const activeUnit = notes?.active_unit_id || (await getStudyLabContext({headers},userId))?.current_unit_id;
    if (activeUnit) {
      return await recordStudyRouteHeartbeat({headers},userId,{unit_id:activeUnit,notes_page:next,notes_topic:notes?.topic_id || topic,
        ...(finishNotes ? {finish_notes:true} : {}),
        ...(notes?.content_version ? {notes_version:notes.content_version} : {}),
        ...(tracksCompletedPages ? {notes_page_id:pages[next]?.id,notes_total_pages:pages.length,notes_completed_page_ids:completed,notes_navigation_id:navigation.current.id,notes_navigation_seq:sequence} : {}),
      });
    }
  };
  const timedTopic = Boolean(notes?.study_session && notes?.topic_id === notes?.active_unit_id);
  const finishTopic = async (completed: string[]) => {
    if (finishInFlight.current || openingNextTopic) return;
    finishInFlight.current = true;
    setSubmittingFinish(true);
    try {
      const result = await saveReadingPosition(page, completed, true);
      if (result?.next_notes && result.notes_outcome === "continue") {
        const next = studyNotesHref(result.next_notes.chapter_slug, result.next_notes.topic_id, {
          planned:true,classLevel:notes?.chapter.class_level,subject:notes?.chapter.subject,
        });
        startTopicTransition(() => router.replace(next));
        return;
      }
      if (result?.notes_outcome === "time_up" || result?.notes_outcome === "sequence_read") {
        setFinishOutcome(result.notes_outcome);
        setError("");
      } else {
        setError("Your next topic could not open. Retry to continue.");
      }
    } catch {
      setError("Your topic could not be saved. Retry to continue.");
    } finally {
      finishInFlight.current = false;
      setSubmittingFinish(false);
    }
  };
  const navigate = async (next: number) => {
    const completed = tracksCompletedPages && next>page && current ? [...new Set([...completedPages,current.id])] : completedPages;
    setCompletedPages(completed);
    const query = new URLSearchParams(params.toString()); query.set("page",String(next));
    if (tracksCompletedPages && pages[next]) {
      query.set("pageId",pages[next].id);
      if (notes?.content_version) query.set("notesVersion",notes.content_version);
    }
    // Next synchronizes native history with useSearchParams without a server
    // navigation. Paging an already-loaded lesson needs no RSC round trip.
    window.history.replaceState(null, "", `?${query}`);
    try {
      await saveReadingPosition(next,completed);
      setError("");
    } catch {setError("Reading position could not sync. This page remains in the address bar; retry before leaving.");}
  };
  const markPageRead = async () => {
    if (!current) return;
    const completed = [...new Set([...completedPages,current.id])];
    setCompletedPages(completed);
    if (timedTopic && completed.length === pages.length) {
      await finishTopic(completed);
      return;
    }
    try { await saveReadingPosition(page,completed);setError(""); }
    catch {setError("Reading progress could not sync. Please retry before leaving.");}
  };
  const retryProgress = async () => {
    if (timedTopic && completedPages.length === pages.length && !finishOutcome) {
      await finishTopic(completedPages);
      return;
    }
    try {await saveReadingPosition(page,completedPages);setError("");}
    catch {setError("Reading progress still could not sync. Keep this page open and retry.");}
  };
  const studyScope: StudyScope = {source:"syllabus",catalogSource:notes?.catalog_source || "published",classLevel:notes?.chapter.class_level,subject:notes?.chapter.subject || "",chapterId:chapterSlug,chapterLabel:notes?.chapter.name || chapterSlug,topicId:notes?.topic_id || topic || current?.id || "",topicLabel:notes?.topic_title || current?.title || ""};
  const askHref = current ? `${studySessionHref(createConversationId(),studyScope,{fresh:true})}&entry=ask_ai&notesPage=${page}&notesPageId=${encodeURIComponent(current.id)}&notesVersion=${encodeURIComponent(notes?.content_version || "")}&notesTopic=${encodeURIComponent(notes?.topic_id || topic || current.id)}` : "#";
  const continueHref = notes?.topic_id===notes?.active_unit_id && notes?.can_save_position!==false
    ? "/dashboard/study?planned=1&fromNotes=1"
    : `${studySessionHref(createConversationId(),studyScope,{fresh:true})}&entry=learn`;
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
        const query = new URLSearchParams(params.toString()); query.set("topic",option.id); query.delete("page");query.delete("pageId");query.delete("notesVersion");
        return <li key={option.id}><Link prefetch={false} className={noteStyles.topicChoice} href={`?${query}`}><strong>{option.title}</strong><span>{option.estimated_minutes.min}–{option.estimated_minutes.max} min</span><span aria-hidden="true">→</span></Link></li>;
      })}</ul>
    </section>
  </div>;
  if (notes?.resolution==="review_required") return <div className={`${styles.notesContainer} ${noteStyles.reader}`}>
    <header className={styles.notesHeader}><Link href="/dashboard/planning/active">Return to Planning</Link><div><p>{notes.chapter.name}</p><h1>{notes.topic_title || "Source review needed"}</h1></div></header>
    <section className={noteStyles.sourceReview} aria-label="Source review needed"><h2>This topic needs a source review</h2><p>Verified teaching content is not ready for this topic. Missing or conflicting source information needs review before the notes can be shown safely.</p>
      {notes.review_required?.length ? <ul>{notes.review_required.map((item,index)=><li key={index}><NoteLearningText text={item.reason} /></li>)}</ul> : null}
      <div className={noteStyles.navigation}><button onClick={()=>{setLoading(true);setAttempt(value=>value+1);}}>Retry loading notes</button><Link href="/dashboard/planning/active">Choose a topic in Planning</Link></div>
    </section>
  </div>;
  if (notes && !notes.pages?.length) return <LegacyNotesContent notes={notes} topicId={topic} />;
  return <div className={`${styles.notesContainer} ${noteStyles.reader}`}>
    <header className={styles.notesHeader}><Link href="/dashboard/planning/active">Return to Planning</Link><div>
      <p>{notes?.chapter.name}</p><h1>{notes?.topic_title || "Topic notes"}</h1>
      {notes?.estimated_minutes ? <p>{notes.estimated_minutes.min}–{notes.estimated_minutes.max} min · Topic duration</p> : null}
      {notes?.topic_read ? <p>Topic read</p> : null}
      {notes?.proficiency ? <p>{({new_to_it:"Learning for the first time",know_the_basics:"Know the basics",mostly_confident:"Mostly confident"} as Record<string,string>)[notes.proficiency] || "Learning for the first time"}{notes.learning_depth ? ` · ${notes.learning_depth.replaceAll("_"," ")}` : ""}</p> : null}
    </div></header>
    {error ? <div className={noteStyles.sessionPortion} role="alert"><p>{error}</p><button className={noteStyles.markRead} onClick={()=>void retryProgress()}>Retry saving progress</button></div> : null}
    {notes?.progress_rebased ? <p className={noteStyles.sessionPortion} role="status">These notes have been updated. Your reading position has been matched where possible, and page completion follows the updated notes.</p> : null}
    {finishOutcome === "sequence_read" ? <p role="status" className={noteStyles.sessionPortion}>You’ve read all the topics in this sequence.</p> :
      remaining === 0 || finishOutcome === "time_up" ? <p role="status" className={noteStyles.sessionPortion}>Study time is up. Your place is saved.</p> :
      remaining !== null ? <p role="timer" className={noteStyles.sessionPortion}>{Math.floor(remaining/60)}:{String(remaining%60).padStart(2,"0")} remaining</p> : null}
    {current ? <>
      <nav aria-label="Reading pages" className={noteStyles.navigation}>
        <button disabled={finishing || page===0} onClick={()=>void navigate(page-1)}>Previous</button>
        <span>Page {page+1} of {pages.length}</span>
        {timedTopic && !finishOutcome && page===pages.length-1 ? <button disabled={finishing || completedPages.length - Number(completedPages.includes(current.id)) !== pages.length-1} onClick={()=>void markPageRead()}>{finishing ? "Opening next topic…" : "Finish topic"}</button> :
          <button disabled={finishing || page===pages.length-1 || remaining===0} onClick={()=>void navigate(page+1)}>Next</button>}
        <Link href={askHref}>Ask AI about this page</Link>
      </nav>
      <progress aria-label="Reading progress" value={tracksCompletedPages ? completedPages.length : page+1} max={pages.length} className="journey-progress" />
      {tracksCompletedPages ? <p className={noteStyles.readingSummary}>{completedPages.length} of {pages.length} pages read</p> : null}
      <article key={current.id} className={`${noteStyles.card} journey-reveal`} data-tone={page % 3}>
        <div className={noteStyles.eyebrow}><span>{notesSourceLabel(current.source_type) || current.source || "Concept notes"}</span><span className={noteStyles.badge}>{current.blocks?.length || notePoints(current.text).length} key {(current.blocks?.length || notePoints(current.text).length) === 1 ? "point" : "points"}</span></div>
        <div className={noteStyles.sourceBadges}>{[...new Set([...(current.source_types || []),...(current.provenance || current.source_refs || []).flatMap(reference=>reference.source_type ? [reference.source_type] : [])])].map(type=><NotesSourceBadge key={type} type={type} />)}</div>
        <h2>{current.title}</h2>{current.source_pages?.length ? <p>{notesSourceLabel(current.source_type) || current.source || "Source"} · PDF page {current.source_pages.join(", ")}</p> : null}<ThemedNotePoints text={current.text} blocks={current.blocks} />
        {current.interrupts?.map((interrupt,i)=><PatternInterrupt key={`${current.id}-${i}`} interrupt={interrupt} />)}
        {current.questions?.length ? <section className={noteStyles.review} aria-label="Check your understanding"><h3>Check your understanding</h3><ol>{current.questions.map((q,i)=><li key={i}><NotesChemistryText text={q.question} /><details><summary>Check the reasoning</summary><NotesChemistryText text={q.answer} /></details></li>)}</ol></section> : null}
        {current.transition ? <p className={noteStyles.transition}><NotesChemistryText text={current.transition} /></p> : null}
      </article>
      {tracksCompletedPages ? <button type="button" className={noteStyles.markRead} disabled={finishing || completedPages.includes(current.id)} onClick={()=>void markPageRead()}>{completedPages.includes(current.id) ? "Page marked read" : "Mark page read"}</button> : null}
      <p>Reading progress records your position. Demonstrate mastery with a quick check.</p>
      {remaining !== 0 && finishOutcome !== "time_up" ? <Link className={noteStyles.continue} href={continueHref}>Continue to learning and quick check</Link> : null}
    </> : <p>No verified notes are mapped to this topic yet.</p>}
    {notes?.review_required?.length ? <details className={noteStyles.sourceReview}><summary>Source material awaiting review</summary><p>Some source points need review. Conflicting information is not silently combined with the lesson.</p><ul>{Array.from(new Set(notes.review_required.map(r=>r.reason))).map(r=><li key={r}><NoteLearningText text={r} /></li>)}</ul></details> : null}
  </div>;
}
