"use client";

import { AppIcon } from "@/components/ui/Polished";
import { useRouteHeadingFocus } from "@/components/exam/useRouteHeadingFocus";
import { useAuth } from "@/context/AuthContext";
import {
  fetchWeaknesses,
  fetchWeaknessTopics,
  fetchWrittenHistory,
  type AttemptSummary,
  type Weakness,
  type WeaknessTopic,
} from "@/features/exam/written";
import { SUBJECT } from "@/lib/examConfig";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "../workspace.module.css";

type AttemptFilter = "all" | "evaluated" | "awaiting";

function formatLabel(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDate(value: string | null) {
  if (!value) return "Not submitted";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" }).format(date);
}

function formatScore(attempt: AttemptSummary) {
  if (attempt.marks_awarded == null) return "--";
  return `${attempt.marks_awarded}/${attempt.marks_total}`;
}

function normalizePercentage(value: number) {
  return value <= 1 ? value * 100 : value;
}

export default function WrittenHistoryPage() {
  const { userId, loading, getAuthHeaders } = useAuth();
  const searchParams = useSearchParams();
  const backendURL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:8000";
  const scopeQuery = searchParams.toString();
  const [attempts, setAttempts] = useState<AttemptSummary[]>([]);
  const [weaknesses, setWeaknesses] = useState<Weakness[]>([]);
  const [topics, setTopics] = useState<WeaknessTopic[]>([]);
  const [filter, setFilter] = useState<AttemptFilter>("all");
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const headingRef = useRouteHeadingFocus();

  const loadReview = useCallback(async () => {
    if (!userId) return;
    setBusy(true);
    setError("");
    try {
      const context = { backendURL, headers: await getAuthHeaders() };
      const [historyResult, weaknessResult, topicResult] = await Promise.allSettled([
        fetchWrittenHistory(context, SUBJECT),
        fetchWeaknesses(context, SUBJECT),
        fetchWeaknessTopics(context),
      ]);
      if (historyResult.status === "fulfilled") setAttempts(historyResult.value.attempts || []);
      if (weaknessResult.status === "fulfilled") setWeaknesses(weaknessResult.value.weaknesses || []);
      if (topicResult.status === "fulfilled") setTopics(topicResult.value.topics || []);
      if (historyResult.status === "rejected" && weaknessResult.status === "rejected" && topicResult.status === "rejected") {
        throw historyResult.reason;
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not load written-practice history.");
    } finally {
      setBusy(false);
    }
  }, [backendURL, getAuthHeaders, userId]);

  useEffect(() => {
    if (!loading && userId) void loadReview();
  }, [loadReview, loading, userId]);

  const evaluated = attempts.filter((attempt) => attempt.evaluation_status === "evaluated");
  const averageScore = evaluated.length
    ? Math.round(evaluated.reduce((total, attempt) => total + normalizePercentage(attempt.score_percentage || 0), 0) / evaluated.length)
    : 0;
  const filteredAttempts = useMemo(() => attempts.filter((attempt) => {
    if (filter === "all") return true;
    if (filter === "evaluated") return attempt.evaluation_status === "evaluated";
    return attempt.evaluation_status !== "evaluated";
  }), [attempts, filter]);

  return (
    <div className={styles.page}>
      <div className={styles.frame}>
        <header className={styles.topbar}>
          <div className={styles.breadcrumbs} aria-label="Breadcrumb">
            <Link href={`/dashboard/exam?${scopeQuery}`}><AppIcon name="arrowRight" />Exam Lab</Link>
            <span aria-hidden="true">/</span>
            <Link href={`/dashboard/exam/workspace?${scopeQuery}`}>Answer Workspace</Link>
            <span aria-hidden="true">/</span>
            <span>History</span>
          </div>
          <button className={styles.quietButton} type="button" onClick={() => void loadReview()} disabled={busy}>
            {busy ? "Refreshing..." : "Refresh insights"}
          </button>
        </header>

        <section className={styles.titleRow}>
          <div>
            <p className={styles.eyebrow}>Written performance</p>
            <h1 ref={headingRef} tabIndex={-1}>History & insights</h1>
            <p>Review evaluated answers and the recurring skills to strengthen next.</p>
          </div>
          <Link className={styles.primaryButton} href={`/dashboard/exam/workspace?${scopeQuery}`}>
            <AppIcon name="plus" />New written practice
          </Link>
        </section>

        {error ? <div className={styles.error} role="alert"><AppIcon name="x" />{error}</div> : null}

        <section className={styles.insightStrip} aria-label="Written practice overview">
          <article><span>Evaluated answers</span><strong>{evaluated.length}</strong><small>{attempts.length} total attempts</small></article>
          <article><span>Average score</span><strong>{evaluated.length ? `${averageScore}%` : "--"}</strong><small>Across evaluated answers</small></article>
          <article><span>Focus topics</span><strong>{topics.length}</strong><small>Recurring learning signals</small></article>
        </section>

        <div className={styles.reviewGrid}>
          <section className={styles.historyPanel}>
            <div className={styles.reviewHeading}>
              <div><p className={styles.eyebrow}>Attempts</p><h2>Recent answers</h2></div>
              <div className={styles.filterGroup} aria-label="Filter attempts">
                {(["all", "evaluated", "awaiting"] as AttemptFilter[]).map((item) => (
                  <button key={item} type="button" data-selected={filter === item} onClick={() => setFilter(item)}>
                    {item === "awaiting" ? "Not evaluated" : formatLabel(item)}
                  </button>
                ))}
              </div>
            </div>

            {busy ? (
              <div className={styles.compactState} aria-busy="true"><span className={styles.spinner} /><p>Loading your answers...</p></div>
            ) : filteredAttempts.length ? (
              <div className={styles.attemptList}>
                {filteredAttempts.map((attempt) => {
                  const isEvaluated = attempt.evaluation_status === "evaluated";
                  return (
                    <article key={attempt.id}>
                      <div className={styles.attemptStatus} data-evaluated={isEvaluated}>
                        <AppIcon name={isEvaluated ? "check" : "clock"} />
                      </div>
                      <div className={styles.attemptCopy}>
                        <div className={styles.attemptMeta}>
                          <span>{formatLabel(attempt.question_type)}</span>
                          <span>{formatLabel(attempt.topic)}</span>
                          <span>{formatDate(attempt.submitted_at || attempt.created_at)}</span>
                        </div>
                        <h3>{attempt.question_text}</h3>
                      </div>
                      <div className={styles.attemptResult}>
                        <strong>{formatScore(attempt)}</strong>
                        {isEvaluated ? (
                          <Link href={`/dashboard/exam/workspace/attempts/${attempt.id}?${scopeQuery}`}>View feedback <AppIcon name="arrowRight" /></Link>
                        ) : <span>Feedback pending</span>}
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className={styles.compactState}>
                <AppIcon name="book" />
                <h3>No matching answers</h3>
                <p>Complete a written-practice answer to build this history.</p>
              </div>
            )}
          </section>

          <aside className={styles.focusPanel}>
            <div className={styles.reviewHeading}>
              <div><p className={styles.eyebrow}>Learning signals</p><h2>What to strengthen</h2></div>
            </div>
            {busy ? (
              <div className={styles.compactState} aria-busy="true"><span className={styles.spinner} /></div>
            ) : topics.length ? (
              <div className={styles.topicList}>
                {topics.slice(0, 6).map((item, index) => (
                  <article key={`${item.subject}-${item.topic}`}>
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <div><h3>{formatLabel(item.topic)}</h3><p>{item.latest_suggestion}</p><small>{item.total_frequency} signal{item.total_frequency === 1 ? "" : "s"}</small></div>
                  </article>
                ))}
              </div>
            ) : (
              <div className={styles.compactState}><AppIcon name="analytics" /><h3>No recurring gaps yet</h3><p>Insights appear after evaluated answers.</p></div>
            )}
          </aside>
        </div>

        {weaknesses.length ? (
          <section className={styles.signalSection}>
            <div className={styles.reviewHeading}><div><p className={styles.eyebrow}>Detailed signals</p><h2>Improvement recommendations</h2></div></div>
            <div className={styles.signalGrid}>
              {weaknesses.slice(0, 8).map((weakness) => (
                <article key={weakness.id}>
                  <div><span>{formatLabel(weakness.weakness_type)}</span><small>Seen {weakness.frequency_count}×</small></div>
                  <h3>{formatLabel(weakness.topic)}</h3>
                  <p>{weakness.weakness_summary}</p>
                  <strong>{weakness.improvement_suggestion}</strong>
                </article>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
