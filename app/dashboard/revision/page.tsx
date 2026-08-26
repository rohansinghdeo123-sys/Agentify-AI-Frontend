"use client";

import { AppIcon } from "@/components/ui/Polished";
import { useAuth } from "@/context/AuthContext";
import {
  getRevisionScopeLabels,
  normalizeRevisionValue,
  readRevisionScope,
  resolveRevisionScope,
  revisionHandoffHref,
  revisionHomeHref,
  revisionLessonHref,
  revisionToolsHref,
  type RevisionScope,
} from "@/features/revision/routes";
import {
  readRevisionProgress,
  revisionScopeKey,
  type RevisionProgress,
} from "@/features/revision/storage";
import { useCatalog } from "@/lib/catalog";
import {
  BUCKET_LABELS,
  fetchRevisionQueue,
  type RevisionEntry,
  type RevisionQueueResponse,
} from "@/lib/revision";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styles from "./hub.module.css";

type QueueState =
  | { status: "loading"; data: null }
  | { status: "ready"; data: RevisionQueueResponse }
  | { status: "unavailable"; data: null };

function matchQueueEntry(
  entry: RevisionEntry,
  chapters: ReturnType<typeof useCatalog>["chapters"],
): RevisionScope | null {
  const target = normalizeRevisionValue(entry.topic);
  for (const chapter of chapters) {
    const topic = chapter.topics.find(
      (candidate) => candidate.value === target || normalizeRevisionValue(candidate.label) === target,
    );
    if (topic) return { chapter: chapter.value, topic: topic.value };
  }
  return null;
}

function findQueueRecommendation(
  data: RevisionQueueResponse,
  chapters: ReturnType<typeof useCatalog>["chapters"],
) {
  for (const entry of data.queue) {
    const matched = matchQueueEntry(entry, chapters);
    if (matched) return { entry, scope: matched };
  }
  return null;
}

export default function RevisionHomePage() {
  const { userId, loading, getAuthHeaders } = useAuth();
  const { chapters, source } = useCatalog();
  const router = useRouter();
  const searchParams = useSearchParams();
  const requested = useMemo(() => readRevisionScope(searchParams), [searchParams]);
  const scope = useMemo(() => resolveRevisionScope(chapters, requested), [chapters, requested]);
  const selectedChapter = chapters.find((chapter) => chapter.value === scope.chapter) || chapters[0];
  const selectedTopic = selectedChapter?.topics.find((topic) => topic.value === scope.topic) || selectedChapter?.topics[0];
  const labels = getRevisionScopeLabels(chapters, scope);

  const [progress, setProgress] = useState<RevisionProgress | null>(null);
  const [queue, setQueue] = useState<QueueState>({ status: "loading", data: null });
  const [queueRequest, setQueueRequest] = useState(0);
  const recommendationHeadingRef = useRef<HTMLHeadingElement>(null);
  const recommendationRetryRef = useRef<HTMLButtonElement>(null);
  const restoreRecommendationFocusRef = useRef(false);

  useEffect(() => {
    if (!userId) return;
    const timer = window.setTimeout(() => setProgress(readRevisionProgress(userId)), 0);
    return () => window.clearTimeout(timer);
  }, [userId]);

  useEffect(() => {
    if (loading || !userId) return;
    let active = true;
    void (async () => {
      try {
        const headers = await getAuthHeaders();
        if (!active) return;
        setQueue({ status: "loading", data: null });
        const data = await fetchRevisionQueue(
          process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:8000",
          userId,
          headers,
          5,
        );
        if (!active) return;
        setQueue(data ? { status: "ready", data } : { status: "unavailable", data: null });
      } catch {
        if (active) setQueue({ status: "unavailable", data: null });
      }
    })();
    return () => {
      active = false;
    };
  }, [getAuthHeaders, loading, queueRequest, userId]);

  useEffect(() => {
    if (queue.status === "loading" || !restoreRecommendationFocusRef.current) return;
    restoreRecommendationFocusRef.current = false;
    const timer = window.setTimeout(() => {
      const target = queue.status === "ready"
        ? recommendationHeadingRef.current
        : recommendationRetryRef.current;
      target?.focus({ preventScroll: true });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [queue.status]);

  const retryRecommendations = useCallback(() => {
    restoreRecommendationFocusRef.current = true;
    setQueue({ status: "loading", data: null });
    setQueueRequest((request) => request + 1);
  }, []);

  const replaceScope = useCallback(
    (next: RevisionScope) => {
      router.replace(revisionHomeHref(next), { scroll: false });
    },
    [router],
  );

  const pendingContinueScope = useMemo(() => {
    if (!progress?.lastChapter || !progress.lastTopic) return null;
    const status = progress.topics[revisionScopeKey(progress.lastChapter, progress.lastTopic)]?.status;
    if (status !== "reviewing" && status !== "needs_review") return null;
    const candidate = resolveRevisionScope(chapters, {
      chapter: progress.lastChapter,
      topic: progress.lastTopic,
    });
    return candidate.chapter === progress.lastChapter && candidate.topic === progress.lastTopic
      ? candidate
      : null;
  }, [chapters, progress]);

  const recommendation = queue.status === "ready"
    ? findQueueRecommendation(queue.data, chapters)
    : null;

  const recommendedScope = recommendation?.scope || null;
  const continueScope = pendingContinueScope || recommendedScope;
  const continueReason = pendingContinueScope
    ? "Resume where you stopped"
    : recommendedScope
      ? "Recommended from recent practice"
      : queue.status === "loading"
        ? "Checking your best next step"
        : "Start a focused revision";
  const chapterReviewed = selectedChapter?.topics.reduce((count, topic) => {
    const status = progress?.topics[revisionScopeKey(selectedChapter.value, topic.value)]?.status;
    return count + (status === "reviewed" ? 1 : 0);
  }, 0) || 0;
  const dueEntries = queue.status === "ready" ? queue.data.queue.slice(0, 3) : [];
  const dueCount = queue.status === "ready"
    ? queue.data.summary.overdue + queue.data.summary.due
    : 0;
  const sessionScope = {
    chapter: selectedChapter?.value || scope.chapter,
    topic: selectedTopic?.value || scope.topic,
  };
  const actionScope = continueScope || sessionScope;
  const actionLabels = getRevisionScopeLabels(chapters, actionScope);
  const recommendationDetail = pendingContinueScope
    ? "Finish the explanation and memory check you already started."
    : recommendation
      ? recommendation.entry.reason || `A focused ${recommendation.entry.suggested_minutes}-minute review based on recent practice.`
      : "Open the selected topic for a clear explanation, short notes, and a memory check.";
  const recommendationTime = !pendingContinueScope && recommendation?.entry.suggested_minutes
    ? `${recommendation.entry.suggested_minutes} min`
    : null;

  return (
    <section className={styles.hub}>
      <div className={styles.ambient} aria-hidden="true">
        <span />
        <span />
      </div>

      <div className={styles.shell}>
        <header className={styles.hero}>
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}>AgentifyAI / Revision Lab</p>
            <h1>Strengthen what matters next.</h1>
            <p className={styles.intro}>
              Continue a topic or choose one from the chapter library. Each revision combines a clear explanation, concise notes, and one honest memory check.
            </p>
          </div>

          <div className={styles.sourceCard} aria-label="Revision syllabus source">
            <span className={styles.sourceIcon}><AppIcon name="book" /></span>
            <div>
              <small>Learning source</small>
              <strong>{source === "published" ? "Published syllabus" : "Starter syllabus"}</strong>
              <span>{chapters.length} chapters available</span>
            </div>
          </div>
        </header>

        <div className={styles.workspace}>
          <section className={styles.todayPanel} aria-labelledby="today-heading">
            <div className={styles.panelHeading}>
              <div>
                <p>Continue with purpose</p>
                <h2 id="today-heading">Today&apos;s revision</h2>
              </div>
              {queue.status === "ready" ? <span className={styles.dueBadge}>{dueCount} due</span> : null}
            </div>

            <div className={styles.continueCard}>
              <span className={styles.continueIcon}><AppIcon name={pendingContinueScope ? "history" : "spark"} /></span>
              <div className={styles.continueCopy}>
                <small>{continueReason}</small>
                <strong>{actionLabels.topic}</strong>
                <span>{actionLabels.chapter}{recommendationTime ? ` · ${recommendationTime}` : ""}</span>
                <p>{recommendationDetail}</p>
              </div>
              <Link
                href={revisionLessonHref(actionScope)}
                className={styles.continueAction}
                aria-label={`Continue revision for ${actionLabels.topic}`}
              >
                Continue
                <AppIcon name="arrowRight" />
              </Link>
            </div>

            <nav className={styles.handoffRow} aria-label={`Other ways to work on ${actionLabels.topic}`}>
              <span>Use this topic in</span>
              <Link href={revisionHandoffHref("study", actionScope)}>
                <AppIcon name="study" /> Study
              </Link>
              <Link href={revisionHandoffHref("exam", actionScope)}>
                <AppIcon name="check" /> Exam
              </Link>
            </nav>

            <div className={styles.queueBlock} aria-busy={queue.status === "loading"}>
              <div className={styles.queueHeading}>
                <h3 ref={recommendationHeadingRef} tabIndex={-1}>Recommended next</h3>
                <small>{queue.status === "loading" ? "Checking your learning signals…" : "Based on recent practice"}</small>
              </div>

              {queue.status === "loading" ? (
                <div className={styles.queueSkeleton} role="status" aria-label="Loading revision recommendations">
                  <span /><span /><span />
                </div>
              ) : queue.status === "unavailable" ? (
                <div className={styles.queueEmpty} data-tone="error">
                  <AppIcon name="clock" />
                  <div>
                    <strong>Personal recommendations are offline</strong>
                    <span>Your chapter library still works—choose the topic you want to strengthen.</span>
                    <button
                      ref={recommendationRetryRef}
                      type="button"
                      className={styles.queueRetry}
                      onClick={retryRecommendations}
                    >
                      Try recommendations again
                    </button>
                  </div>
                </div>
              ) : dueEntries.length ? (
                <div className={styles.queueList}>
                  {dueEntries.map((entry, index) => {
                    const matched = matchQueueEntry(entry, chapters);
                    const row = (
                      <>
                        <span className={styles.queueIndex}>{String(index + 1).padStart(2, "0")}</span>
                        <span className={styles.queueCopy}>
                          <strong>{entry.topic}</strong>
                          <small>{entry.reason || `${entry.suggested_minutes} minute revision`}</small>
                        </span>
                        <span className={styles.bucket} data-bucket={entry.bucket}>{BUCKET_LABELS[entry.bucket]}</span>
                      </>
                    );
                    return matched ? (
                      <Link key={`${entry.topic}-${index}`} href={revisionLessonHref(matched)} className={styles.queueRow}>{row}</Link>
                    ) : (
                      <div key={`${entry.topic}-${index}`} className={styles.queueRow}>{row}</div>
                    );
                  })}
                </div>
              ) : (
                <div className={styles.queueEmpty}>
                  <AppIcon name="check" />
                  <div>
                    <strong>No urgent topics right now</strong>
                    <span>Choose any chapter to strengthen it before the next exam.</span>
                  </div>
                </div>
              )}
            </div>
          </section>

          <section className={styles.libraryPanel} aria-labelledby="library-heading">
            <div className={styles.panelHeading}>
              <div>
                <p>Guided chapter path</p>
                <h2 id="library-heading">Choose what to revise</h2>
              </div>
              <span className={styles.progressCount}>{chapterReviewed}/{selectedChapter?.topics.length || 0} reviewed</span>
            </div>

            <label className={styles.chapterSelect}>
              <span>Chapter</span>
              <select
                value={selectedChapter?.value || ""}
                onChange={(event) => {
                  const chapter = chapters.find((candidate) => candidate.value === event.target.value);
                  const topic = chapter?.topics[0];
                  if (chapter && topic) replaceScope({ chapter: chapter.value, topic: topic.value });
                }}
              >
                {chapters.map((chapter) => (
                  <option key={chapter.value} value={chapter.value}>{chapter.label}</option>
                ))}
              </select>
            </label>

            <div className={styles.topicList} aria-label={`${selectedChapter?.label || "Chapter"} topics`}>
              {selectedChapter?.topics.map((topic, index) => {
                const status = progress?.topics[revisionScopeKey(selectedChapter.value, topic.value)]?.status;
                const active = topic.value === selectedTopic?.value;
                return (
                  <button
                    key={topic.value}
                    type="button"
                    aria-pressed={active}
                    className={styles.topicButton}
                    data-active={active ? "true" : "false"}
                    data-status={status || "not_started"}
                    onClick={() => replaceScope({ chapter: selectedChapter.value, topic: topic.value })}
                  >
                    <span className={styles.topicNumber}>{String(index + 1).padStart(2, "0")}</span>
                    <span className={styles.topicName}>{topic.label}</span>
                    <span className={styles.topicStatus} aria-label={status === "reviewed" ? "Self-reviewed on this device" : status === "needs_review" ? "Needs another pass" : status === "reviewing" ? "In progress" : "Not started"}>
                      {status === "reviewed" ? <AppIcon name="check" /> : status === "needs_review" ? "Again" : status === "reviewing" ? "Open" : ""}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className={styles.selectionFooter}>
              <div>
                <small>Selected topic</small>
                <strong>{labels.topic}</strong>
                <span>{selectedChapter?.topics.findIndex((topic) => topic.value === selectedTopic?.value) + 1 || 1} of {selectedChapter?.topics.length || 1}</span>
              </div>
              <div className={styles.primaryActions}>
                <Link href={revisionToolsHref(sessionScope)} className={styles.secondaryButton}>
                  <AppIcon name="mission" />
                  Study Tools
                </Link>
                <Link href={revisionLessonHref(sessionScope)} className={styles.primaryButton}>
                  Start Real Revision
                  <AppIcon name="arrowRight" />
                </Link>
              </div>
            </div>
          </section>
        </div>

        <p className={styles.disclosure}>
          Topic status is saved on this device. Verified chapter coverage will activate when the new Revision backend is connected.
        </p>
      </div>
    </section>
  );
}
