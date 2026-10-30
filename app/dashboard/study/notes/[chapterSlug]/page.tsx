"use client";
import LegacyNotes from "./LegacyNotes";
import { useAuth } from "@/context/AuthContext";
import { getChapterNotes, getStudyLabContext, recordStudyRouteHeartbeat, type ChapterNotes } from "@/features/study/api";
import NotesChemistryText from "@/components/study/NotesChemistryText";
import RichMarkdown from "@/components/RichMarkdown";
import { LoadingState } from "@/components/ui/Polished";
import { createConversationId } from "@/features/study/conversationUtils";
import { studySessionHref } from "@/features/study/routes";
import Link from "next/link";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import styles from "../../home.module.css";

export default function StudyNotesPage() {
  const {chapterSlug} = useParams<{chapterSlug:string}>();
  return chapterSlug.includes("some_basic_concepts_of_chemistry") || chapterSlug === "matter" ? <TopicNotesReader /> : <LegacyNotes />;
}

function TopicNotesReader() {
  const { chapterSlug } = useParams<{chapterSlug: string}>();
  const params = useSearchParams();
  const router = useRouter();
  const topic = params.get("topic") || undefined;
  const {userId, getAuthHeaders, loading: authBusy} = useAuth();
  const [notes, setNotes] = useState<ChapterNotes | null>(null);
  const [page, setPage] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (authBusy || !userId) return;
    let active = true;
    void getAuthHeaders().then((headers) => { if (active) setLoading(true); return getChapterNotes({headers},chapterSlug,topic); }).then((data) => {
      if (!active) return;
      setNotes(data);
      const count = data?.pages?.length || data?.concepts.length || 1;
      const requested = params.get("page");
      setPage(Math.max(0,Math.min(count-1,requested !== null ? Number(requested) || 0 : data?.saved_page || 0)));
    }).catch(() => { if (active) setError("Notes could not load. Please retry."); }).finally(() => {if(active)setLoading(false);});
    return () => {active=false;};
  },[authBusy,userId,getAuthHeaders,chapterSlug,topic,params]);
  const pages = notes?.pages || notes?.concepts.map((c) => ({id:c.id,title:c.title,text:[c.definition,c.explanation,...c.key_points.map((p)=>`- ${p}`),...c.formulas,...c.examples].filter(Boolean).join("\n\n")})) || [];
  const current = pages[page];
  const navigate = async (next: number) => {
    const query = new URLSearchParams(params.toString()); query.set("page",String(next));
    setPage(next); router.replace(`?${query}`,{scroll:false});
    try {
      const headers = await getAuthHeaders();
      const context = await getStudyLabContext({headers},userId);
      if (context) {
        await recordStudyRouteHeartbeat({headers},userId,{unit_id:context.current_unit_id,notes_page:next,notes_topic:notes?.topic_id || topic});
      }
    } catch {setError("Reading position could not sync. This page remains in the address bar; retry before leaving.");}
  };
  const askHref = current ? `${studySessionHref(createConversationId(),{source:"syllabus",catalogSource:notes?.topic_id?.startsWith("chem11_u01") ? "planning_manifest" : "published",classLevel:notes?.chapter.class_level,subject:notes?.chapter.subject || "",chapterId:chapterSlug,chapterLabel:notes?.chapter.name || chapterSlug,topicId:notes?.topic_id || topic || current.id,topicLabel:notes?.topic_title || current.title},{fresh:true})}&entry=ask_ai&notesPage=${page}&notesTopic=${encodeURIComponent(notes?.topic_id || topic || current.id)}` : "#";
  if (authBusy || loading) return <LoadingState title="Loading topic notes" detail="Opening your saved reading position." />;
  if (!userId) return <p>Please sign in to read notes.</p>;
  return <main className={styles.notesContainer}>
    <header className={styles.notesHeader}><Link href="/dashboard/planning/active">Return to Planning</Link><div>
      <p>{notes?.chapter.name}</p><h1>{notes?.topic_title || "Topic notes"}</h1>
      {notes?.estimated_minutes ? <p>{notes.estimated_minutes.min}–{notes.estimated_minutes.max} min · Topic duration</p> : null}
    </div></header>
    {error ? <p role="alert">{error}</p> : null}
    {current ? <>
      <nav aria-label="Reading pages" style={{display:"flex",gap:"1rem",alignItems:"center",flexWrap:"wrap"}}>
        <button disabled={page===0} onClick={()=>void navigate(page-1)}>Previous</button>
        <span>Page {page+1} of {pages.length}</span>
        <button disabled={page===pages.length-1} onClick={()=>void navigate(page+1)}>Next</button>
        <Link href={askHref}>Ask AI about this page</Link>
      </nav>
      <progress aria-label="Reading progress" value={page+1} max={pages.length} style={{width:"100%"}} />
      <article className={styles.conceptCard}><h2>{current.title}</h2>{notes?.pages ? <ul><li><NotesChemistryText text={current.text} /></li></ul> : <RichMarkdown content={current.text} />}</article>
      <p>Reading progress records your position. Demonstrate mastery with a quick check.</p>
      <Link href="/dashboard/study?planned=1">Continue to learning and quick check</Link>
    </> : <p>No verified notes are mapped to this topic yet.</p>}
    {notes?.review_required?.length ? <details><summary>Source material awaiting review</summary><p>Mixed summaries and exercises are excluded until their topic boundaries and scientific content are verified.</p><ul>{Array.from(new Set(notes.review_required.map(r=>r.reason))).map(r=><li key={r}>{r}</li>)}</ul></details> : null}
  </main>;
}
