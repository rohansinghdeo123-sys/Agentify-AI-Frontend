"use client";

import { useAuth } from "@/context/AuthContext";
import { getChapterNotes, type ChapterNotes, type ConceptNote } from "@/features/study/api";
import ThemedNotePoints from "@/components/study/ThemedNotePoints";
import noteStyles from "@/components/study/topic-notes.module.css";
import { AppIcon, LoadingState } from "@/components/ui/Polished";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import styles from "../../home.module.css";

export default function LegacyNotes() {
  const params = useParams<{ chapterSlug: string }>();
  const searchParams = useSearchParams();

  const chapterSlug = decodeURIComponent(String(params.chapterSlug || ""));
  const topicId = searchParams.get("topic") || undefined;
  const { userId, getAuthHeaders, loading: authBusy } = useAuth();

  const [notes, setNotes] = useState<ChapterNotes | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (authBusy) return;
    if (!userId || !chapterSlug) {
      setLoading(false);
      setError("You must be signed in to view notes.");
      return;
    }

    let active = true;
    setLoading(true);
    void (async () => {
      try {
        const data = await getChapterNotes(
          { headers: await getAuthHeaders() },
          chapterSlug,
          topicId
        );
        if (active) {
          if (data) {
            setNotes(data);
            setError("");
          } else {
            setError("Notes for this section are not yet available.");
          }
        }
      } catch {
        if (active) setError("Failed to load notes. Please try again.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [authBusy, chapterSlug, getAuthHeaders, userId, topicId]);

  if (authBusy || loading) {
    return <LoadingState title="Loading master notes…" detail="Formatting your study material." />;
  }

  if (error || !notes) {
    return (
      <div className={styles.redirectState} role="alert">
        <p>{error || "Notes could not be found."}</p>
        <Link href="/dashboard/study" className={styles.backLink}>
          <AppIcon name="arrowRight" /> Back to Study Lab
        </Link>
      </div>
    );
  }

  return (
    <div className={`${styles.notesContainer} ${noteStyles.reader}`}>
      <header className={styles.notesHeader}>
        <Link href="/dashboard/study" className={styles.backLink}>
          <AppIcon name="arrowRight" /> Study Lab
        </Link>
        <div>
          <p>{notes.chapter.class_level} • {notes.chapter.subject}</p>
          <h1>Chapter {notes.chapter.chapter_number}: {notes.chapter.name}</h1>
          <span>{topicId ? "Focused Section" : "Full Chapter Master Notes"}</span>
        </div>
      </header>

      <div className={styles.notesContent}>
        {notes.concepts.length === 0 && (
          <p style={{ textAlign: "center", opacity: 0.7 }}>No notes found for this specific topic. Try viewing the full chapter.</p>
        )}

        {notes.concepts.map((concept: ConceptNote) => (
          <article key={concept.id} className={noteStyles.card}>
            <h2>{concept.title}</h2>

            {concept.definition && (
              <div className={styles.conceptSection}>
                <h3>Definition</h3>
                <ThemedNotePoints text={concept.definition} />
              </div>
            )}

            {concept.explanation && (
              <div className={styles.conceptSection}>
                <h3>Explanation</h3>
                <ThemedNotePoints text={concept.explanation} />
              </div>
            )}

            {concept.key_points.length > 0 && (
              <div className={styles.conceptSection}>
                <h3>Key Points</h3>
                <ThemedNotePoints text={concept.key_points.join("\n")} />
              </div>
            )}

            {concept.formulas.length > 0 && (
              <div className={styles.conceptSection}>
                <h3>Formulas</h3>
                <ThemedNotePoints text={concept.formulas.join("\n")} />
              </div>
            )}

            {concept.examples.length > 0 && (
              <div className={styles.conceptSection}>
                <h3>Examples</h3>
                <ThemedNotePoints text={concept.examples.join("\n")} />
              </div>
            )}

            {concept.common_mistakes.length > 0 && (
              <div className={styles.conceptSection}>
                <h3>Common Mistakes</h3>
                <ThemedNotePoints text={concept.common_mistakes.map(item => typeof item === "string" ? item : [item.mistake || item.note, item.correction ? `Correction: ${item.correction}` : ""].filter(Boolean).join(" ")).join("\n")} />
              </div>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}
