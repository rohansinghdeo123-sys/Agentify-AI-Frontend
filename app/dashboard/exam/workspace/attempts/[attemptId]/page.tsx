"use client";

import { AppIcon } from "@/components/ui/Polished";
import { useRouteHeadingFocus } from "@/components/exam/useRouteHeadingFocus";
import { useAuth } from "@/context/AuthContext";
import { fetchAttemptFeedback, type WrittenFeedback } from "@/features/exam/written";
import { WrittenFeedbackView } from "@/features/exam/WrittenFeedbackView";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import styles from "../../workspace.module.css";

export default function AttemptFeedbackPage() {
  const { userId, loading, getAuthHeaders } = useAuth();
  const params = useParams<{ attemptId: string }>();
  const searchParams = useSearchParams();
  const backendURL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:8000";
  const attemptId = Number(params.attemptId);
  const scopeQuery = searchParams.toString();
  const [feedback, setFeedback] = useState<WrittenFeedback | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const headingRef = useRouteHeadingFocus();

  const loadFeedback = useCallback(async () => {
    if (!userId || !Number.isInteger(attemptId) || attemptId < 1) {
      setError("This feedback link is not valid.");
      setBusy(false);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const data = await fetchAttemptFeedback(
        { backendURL, headers: await getAuthHeaders() },
        attemptId,
      );
      setFeedback(data);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Feedback is not available for this attempt.");
    } finally {
      setBusy(false);
    }
  }, [attemptId, backendURL, getAuthHeaders, userId]);

  useEffect(() => {
    if (!loading) void loadFeedback();
  }, [loadFeedback, loading]);

  return (
    <div className={styles.page}>
      <div className={styles.frame}>
        <header className={styles.topbar}>
          <div className={styles.breadcrumbs} aria-label="Breadcrumb">
            <Link href={`/dashboard/exam?${scopeQuery}`}><AppIcon name="arrowRight" />Exam Lab</Link>
            <span aria-hidden="true">/</span>
            <Link href={`/dashboard/exam/workspace/history?${scopeQuery}`}>History</Link>
            <span aria-hidden="true">/</span>
            <span>Feedback</span>
          </div>
          <Link className={styles.historyLink} href={`/dashboard/exam/workspace/history?${scopeQuery}`}><AppIcon name="history" />All attempts</Link>
        </header>

        <section className={styles.titleRow}>
          <div>
            <p className={styles.eyebrow}>Saved evaluation</p>
            <h1 ref={headingRef} tabIndex={-1}>Teacher feedback</h1>
            <p>Attempt #{Number.isFinite(attemptId) ? attemptId : "--"} · Review the evidence, rubric, and stronger answer.</p>
          </div>
        </section>

        {busy ? (
          <section className={styles.statePanel} aria-busy="true"><span className={styles.spinner} /><h2>Loading teacher feedback</h2><p>Retrieving your saved evaluation.</p></section>
        ) : null}

        {!busy && error ? (
          <section className={styles.statePanel} role="alert">
            <AppIcon name="book" />
            <h2>Feedback is not available</h2>
            <p>{error}</p>
            <Link className={styles.primaryButton} href={`/dashboard/exam/workspace/history?${scopeQuery}`}>Return to history</Link>
          </section>
        ) : null}

        {!busy && feedback ? (
          <section className={styles.feedbackStage}>
            <WrittenFeedbackView feedback={feedback} />
            <footer className={styles.feedbackActions}>
              <Link className={styles.secondaryButton} href={`/dashboard/exam/workspace/history?${scopeQuery}`}><AppIcon name="history" />Back to history</Link>
              <Link className={styles.primaryButton} href={`/dashboard/exam/workspace?${scopeQuery}`}><AppIcon name="plus" />Practise another answer</Link>
            </footer>
          </section>
        ) : null}
      </div>
    </div>
  );
}
