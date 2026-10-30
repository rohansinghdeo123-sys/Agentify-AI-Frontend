"use client";
import LegacyNotes from "./LegacyNotes";
import { useAuth } from "@/context/AuthContext";
import { getChapterNotes, getStudyLabContext, recordStudyRouteHeartbeat, type ChapterNotes } from "@/features/study/api";
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
  return chapterSlug.includes("some_basic_concepts_of_chemistry") || chapterSlug === "matter" ? <TopicNotesReader /> : <LegacyNotes />;
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
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (authBusy || !userId) return;
    let active = true;
    void getAuthHeaders().then((headers) => { if (active) setLoading(true); return getChapterNotes({headers},chapterSlug,topic); }).then((data) => {
      if (!active) return;
      setNotes(data);
      setSavedPage(data?.saved_page || 0);
    }).catch(() => { if (active) setError("Notes could not load. Please retry."); }).finally(() => {if(active)setLoading(false);});
    return () => {active=false;};
  },[authBusy,userId,getAuthHeaders,chapterSlug,topic]);
  const pages = notes?.pages || notes?.concepts.map((c) => ({id:c.id,title:c.title,text:[c.definition,c.explanation,...c.key_points.map((p)=>`- ${p}`),...c.formulas,...c.examples].filter(Boolean).join("\n\n")})) || [];
  const page = Math.max(0, Math.min(pages.length - 1, requestedPage !== null ? Number(requestedPage) || 0 : savedPage));
  const current = pages[page];
  const navigate = async (next: number) => {
    const query = new URLSearchParams(params.toString()); query.set("page",String(next));
    // Next synchronizes native history with useSearchParams without a server
    // navigation. Paging an already-loaded lesson needs no RSC round trip.
    window.history.replaceState(null, "", `?${query}`);
    try {
      const headers = await getAuthHeaders();
      const activeUnit = notes?.active_unit_id || (await getStudyLabContext({headers},userId))?.current_unit_id;
      if (activeUnit) {
        await recordStudyRouteHeartbeat({headers},userId,{unit_id:activeUnit,notes_page:next,notes_topic:notes?.topic_id || topic});
      }
    } catch {setError("Reading position could not sync. This page remains in the address bar; retry before leaving.");}
  };
  const askHref = current ? `${studySessionHref(createConversationId(),{source:"syllabus",catalogSource:notes?.topic_id?.startsWith("chem11_u01") ? "planning_manifest" : "published",classLevel:notes?.chapter.class_level,subject:notes?.chapter.subject || "",chapterId:chapterSlug,chapterLabel:notes?.chapter.name || chapterSlug,topicId:notes?.topic_id || topic || current.id,topicLabel:notes?.topic_title || current.title},{fresh:true})}&entry=ask_ai&notesPage=${page}&notesTopic=${encodeURIComponent(notes?.topic_id || topic || current.id)}` : "#";
  if (authBusy || loading) return <LoadingState title="Loading topic notes" detail="Opening your saved reading position." />;
  if (!userId) return <p>Please sign in to read notes.</p>;
  return <div className={`${styles.notesContainer} ${noteStyles.reader}`}>
    <header className={styles.notesHeader}><Link href="/dashboard/planning/active">Return to Planning</Link><div>
      <p>{notes?.chapter.name}</p><h1>{notes?.topic_title || "Topic notes"}</h1>
      {notes?.estimated_minutes ? <p>{notes.estimated_minutes.min}–{notes.estimated_minutes.max} min · Topic duration</p> : null}
    </div></header>
    {error ? <p role="alert">{error}</p> : null}
    {current ? <>
      <nav aria-label="Reading pages" className={noteStyles.navigation}>
        <button disabled={page===0} onClick={()=>void navigate(page-1)}>Previous</button>
        <span>Page {page+1} of {pages.length}</span>
        <button disabled={page===pages.length-1} onClick={()=>void navigate(page+1)}>Next</button>
        <Link href={askHref}>Ask AI about this page</Link>
      </nav>
      <progress aria-label="Reading progress" value={page+1} max={pages.length} className={noteStyles.progress} />
      <article className={noteStyles.card} data-tone={page % 3}>
        <div className={noteStyles.eyebrow}><span>Concept notes</span><span className={noteStyles.badge}>{notePoints(current.text).length} key {notePoints(current.text).length === 1 ? "point" : "points"}</span></div>
        <h2>{current.title}</h2><ThemedNotePoints text={current.text} />
      </article>
      <p>Reading progress records your position. Demonstrate mastery with a quick check.</p>
      <Link className={noteStyles.continue} href="/dashboard/study?planned=1">Continue to learning and quick check</Link>
    </> : <p>No verified notes are mapped to this topic yet.</p>}
    {notes?.review_required?.length ? <details><summary>Source material awaiting review</summary><p>Mixed summaries and exercises are excluded until their topic boundaries and scientific content are verified.</p><ul>{Array.from(new Set(notes.review_required.map(r=>r.reason))).map(r=><li key={r}>{r}</li>)}</ul></details> : null}
  </div>;
}
