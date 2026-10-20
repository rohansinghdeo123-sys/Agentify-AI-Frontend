"use client";

import { useAuth } from "@/context/AuthContext";
import { getChapterNotes, type ChapterNotes, type ConceptNote } from "@/features/study/api";
import RichMarkdown from "@/components/RichMarkdown";
import { AppIcon, LoadingState } from "@/components/ui/Polished";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import styles from "../../home.module.css";

export default function StudyNotesPage() {
  const params = useParams<{ chapterSlug: string }>();
  const searchParams = useSearchParams();
  const chapterSlug = decodeURIComponent(String(params.chapterSlug || ""));
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
          chapterSlug
        );
        if (active) {
          if (data) {
            setNotes(data);
            setError("");
          } else {
            setError("Notes for this chapter are not yet available.");
          }
        }
      } catch (err) {
        if (active) setError("Failed to load notes. Please try again.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [authBusy, chapterSlug, getAuthHeaders, userId]);

  if (authBusy || loading) {
    return <LoadingState title="Loading chapter notes…" detail="Preparing your study material." />;
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
    <div className={styles.notesContainer}>
      <header className={styles.notesHeader}>
        <Link href="/dashboard/study" className={styles.backLink}>
          <AppIcon name="arrowRight" /> Study Lab
        </Link>
        <div>
          <p>{notes.chapter.class_level} • {notes.chapter.subject}</p>
          <h1>Chapter {notes.chapter.chapter_number}: {notes.chapter.name}</h1>
          <span>Master Notes</span>
        </div>
      </header>

      <div className={styles.notesContent}>
        {notes.concepts.map((concept: ConceptNote) => (
          <article key={concept.id} className={styles.conceptCard}>
            <h2>{concept.title}</h2>
            
            {concept.definition && (
              <div className={styles.conceptSection}>
                <h3>Definition</h3>
                <RichMarkdown content={concept.definition} />
              </div>
            )}

            {concept.explanation && (
              <div className={styles.conceptSection}>
                <h3>Explanation</h3>
                <RichMarkdown content={concept.explanation} />
              </div>
            )}

            {concept.key_points.length > 0 && (
              <div className={styles.conceptSection}>
                <h3>Key Points</h3>
                <ul>
                  {concept.key_points.map((point, i) => (
                    <li key={i}><RichMarkdown content={point} /></li>
                  ))}
                </ul>
              </div>
            )}

            {concept.formulas.length > 0 && (
              <div className={styles.conceptSection}>
                <h3>Formulas</h3>
                <ul className={styles.formulaList}>
                  {concept.formulas.map((formula, i) => (
                    <li key={i}><RichMarkdown content={formula} /></li>
                  ))}
                </ul>
              </div>
            )}

            {concept.examples.length > 0 && (
              <div className={styles.conceptSection}>
                <h3>Examples</h3>
                <ul>
                  {concept.examples.map((example, i) => (
                    <li key={i}><RichMarkdown content={example} /></li>
                  ))}
                </ul>
              </div>
            )}

            {concept.common_mistakes.length > 0 && (
              <div className={styles.conceptSection}>
                <h3>Common Mistakes</h3>
                <ul>
                  {concept.common_mistakes.map((item, i) => (
                    <li key={i}>
                      {typeof item === "string" ? (
                        <RichMarkdown content={item} />
                      ) : (
                        <span>
                          {item.mistake || item.note}
                          {item.correction && <strong> Correction: {item.correction}</strong>}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}