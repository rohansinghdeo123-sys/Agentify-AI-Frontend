"use client";

import { StudyScreen, StudySyncPill } from "@/components/study/StudyScreen";
import { AppIcon } from "@/components/ui/Polished";
import { useAuth } from "@/context/AuthContext";
import { createConversationId } from "@/features/study/conversationUtils";
import { useStudyConversations } from "@/features/study/hooks/useStudyConversations";
import {
  legacyStudyHandoff,
  openStudyScope,
  studySessionHref,
  syllabusStudyScope,
} from "@/features/study/routes";
import {
  getStudyLabContext,
  recordStudyRouteHeartbeat,
} from "@/features/study/api";
import type { StudyConversation, StudyScope } from "@/features/study/types";
import type { StudyLabContext } from "@/features/planning/contracts";
import { useCatalog } from "@/lib/catalog";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "./home.module.css";

function conversationHref(conversation: StudyConversation) {
  return studySessionHref(conversation.id, conversation.scope || openStudyScope());
}

function relativeTime(value: string) {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return "";
  const minutes = Math.max(0, Math.round((Date.now() - timestamp) / 60000));
  if (minutes < 1) return "Now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function studyRouteScope(context: StudyLabContext): StudyScope | null {
  if (!context.current_unit_id) return null;
  const chapter = context.chapters.find((candidate) => (
    candidate.learning_units.some((unit) => unit.id === context.current_unit_id)
  )) || context.chapters[0];
  if (!chapter) return null;
  const unit = chapter.learning_units.find((candidate) => candidate.id === context.current_unit_id);
  if (!unit) return null;
  return {
    source: "syllabus",
    catalogSource: "planning_manifest",
    classLevel: "",
    subject: "",
    chapterId: chapter.chapter_slug,
    chapterLabel: chapter.chapter,
    topicId: unit.id,
    topicLabel: unit.title,
  };
}

export default function StudyHomePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { profile, userId, getAuthHeaders } = useAuth();
  const { chapters, source, settled } = useCatalog();
  const { conversations, syncState, reload } = useStudyConversations();
  const legacyHandoff = legacyStudyHandoff(searchParams);
  const requestedChapter = searchParams.get("chapter") || "";
  const requestedTopic = searchParams.get("topic") || "";
  const [chapterId, setChapterId] = useState(requestedChapter);
  const [topicId, setTopicId] = useState(requestedTopic);
  const [studyLab, setStudyLab] = useState<StudyLabContext | null>(null);
  const [studyLabLoading, setStudyLabLoading] = useState(false);
  const [studyLabOpening, setStudyLabOpening] = useState(false);

  useEffect(() => {
    if (legacyHandoff) router.replace(legacyHandoff);
  }, [legacyHandoff, router]);

  const loadStudyLabContext = useCallback(async () => {
    if (!userId) return;
    setStudyLabLoading(true);
    try {
      const context = await getStudyLabContext(
        { headers: await getAuthHeaders() },
        userId,
      );
      setStudyLab(context);
    } catch {
      setStudyLab(null);
    } finally {
      setStudyLabLoading(false);
    }
  }, [getAuthHeaders, userId]);

  useEffect(() => {
    void loadStudyLabContext();
  }, [loadStudyLabContext]);

  useEffect(() => {
    if (!userId) return;
    const onFocus = () => { void loadStudyLabContext(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [loadStudyLabContext, userId]);

  const startPlannedStudyRoute = useCallback(async () => {
    if (!studyLab || studyLabOpening) return;
    const scope = studyRouteScope(studyLab);
    if (!scope) return;
    setStudyLabOpening(true);
    void recordStudyRouteHeartbeat(
      { headers: await getAuthHeaders() },
      studyLab.user_id,
      studyLab.last_position,
    );
    const destination = studySessionHref(createConversationId(), scope, { fresh: true });
    router.push(`${destination}&entry=learn`);
  }, [getAuthHeaders, router, studyLab, studyLabOpening]);

  // Find active chapter slug for the notes button
  const activeChapter = studyLab?.chapters.find((c) => 
    c.learning_units.some((u) => u.id === studyLab.current_unit_id)
  ) || studyLab?.chapters[0];

  const selectedChapter = chapters.find((chapter) => chapter.value === chapterId)
    || (settled ? chapters.find((chapter) => chapter.value === requestedChapter) || chapters[0] : undefined);
  const selectedTopic = selectedChapter?.topics.find((topic) => topic.value === topicId)
    || (settled
      ? selectedChapter?.topics.find((topic) => topic.value === requestedTopic) || selectedChapter?.topics[0]
      : undefined);
  const recent = useMemo(
    () => conversations.filter((conversation) => !conversation.archived).slice(0, 3),
    [conversations],
  );
  const firstName = profile?.name?.split(" ")[0] || "Student";

  const startSession = (intent: "learn" | "clarify" | "practice") => {
    const syllabusGrounded = intent !== "clarify";
    const scope = syllabusGrounded && selectedChapter && selectedTopic
      ? syllabusStudyScope(selectedChapter, selectedTopic, source === "published" ? "published" : "starter")
      : openStudyScope();
    const destination = studySessionHref(createConversationId(), scope, { fresh: true });
    const entry = intent === "clarify" ? "ask_ai" : intent;
    router.push(`${destination}&entry=${entry}`);
  };

  if (legacyHandoff) {
    return <div className={styles.redirectState} role="status">Opening the focused learning workspace…</div>;
  }

  const showStudyLabCard = Boolean(userId) && !studyLabLoading && Boolean(studyLab);

  return (
    <StudyScreen
      eyebrow="AgentifyAI / Study Lab"
      title={`What do you need help with, ${firstName}?`}
      description="Learn a planned concept, ask one doubt directly, or check what you understand. Choose one route and Study Lab will keep the session focused."
      aside={<StudySyncPill state={syncState} />}
    >
      {showStudyLabCard && studyLab ? (
        <section className={styles.todayRoutePanel} aria-labelledby="today-route-heading">
          <div className={styles.todayRouteHeader}>
            <div>
              <p className={styles.todayRouteEyebrow}>Today&apos;s route</p>
              <h2 id="today-route-heading" className={styles.todayRouteStep}>
                {studyLab.step_label}
              </h2>
            </div>
            {studyLab.override.active ? (
              <span className={styles.todayRouteBranch} data-reason={studyLab.override.reason}>
                {studyLab.override.reason_label}
              </span>
            ) : null}
          </div>

          <div className={styles.todayRouteBody}>
            <div className={styles.todayRouteTopic}>
              <span className={styles.todayRouteTopicStatus} data-status={studyLab.current_unit_status}>
                {studyLab.current_unit_status === "mastered"
                  ? "✓"
                  : studyLab.current_unit_status === "needs_review"
                    ? "!"
                    : studyLab.current_unit_status === "practising" || studyLab.current_unit_status === "learning"
                      ? "▶"
                      : "○"}
              </span>
              <div>
                <strong>{studyLab.current_topic}</strong>
                <small>
                  {studyLab.status === "completed"
                    ? "Today's route complete"
                    : studyLab.status === "not_started"
                      ? "Ready to begin"
                      : "In progress"}
                </small>
              </div>
            </div>

            {studyLab.why_now ? (
              <p className={styles.todayRouteWhy}>{studyLab.why_now}</p>
            ) : null}

            {studyLab.recommended_approach.length ? (
              <ol className={styles.todayRouteApproach} aria-label="Recommended approach">
                {studyLab.recommended_approach.map((step, index) => (
                  <li key={`${step}-${index}`}>
                    <span className={styles.todayRouteApproachIndex}>{index + 1}</span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            ) : null}

            {studyLab.prerequisites.length ? (
              <p className={styles.todayRoutePrereq}>
                Prerequisite{studyLab.prerequisites.length > 1 ? "s" : ""}: {studyLab.prerequisites.join(", ")}
              </p>
            ) : null}

            {studyLab.progress ? (
              <div className={styles.todayRouteProgress} aria-label="Chapter progress">
                <div className={styles.todayRouteProgressBar}>
                  <span style={{ width: `${studyLab.progress.percentage}%` }} />
                </div>
                <span className={styles.todayRouteProgressLabel}>
                  {studyLab.progress.mastered_units} of {studyLab.progress.total_units} units mastered
                </span>
              </div>
            ) : null}
          </div>

          {studyLab.status === "completed" ? (
            <div className={styles.todayRouteActions}>
              <p className={styles.todayRouteComplete}>
                You&apos;ve completed today&apos;s route. Come back tomorrow, or choose another route below.
              </p>
            </div>
          ) : (
            <div className={styles.todayRouteActions}>
              {activeChapter ? (
                <Link
                  href={`/dashboard/study/notes/${encodeURIComponent(activeChapter.chapter_slug)}`}
                  className={styles.todayRouteNotes}
                >
                  Read Notes
                </Link>
              ) : null}
              
              <button
                type="button"
                className={styles.todayRouteStart}
                disabled={studyLabOpening}
                onClick={() => { void startPlannedStudyRoute(); }}
              >
                {studyLab.status === "in_progress" || studyLab.status === "paused"
                  ? "Continue learning"
                  : "Start learning"} <AppIcon name="arrowRight" />
              </button>
            </div>
          )}
        </section>
      ) : null}

      <div className={styles.workspace}>
        <section className={styles.startPanel} aria-labelledby="start-study-heading">
          <div className={styles.panelHeading}>
            <div>
              <p>Choose what you need now</p>
              <h2 id="start-study-heading">Three simple ways to study</h2>
            </div>
            <span className={styles.sourceBadge} data-source={source}>
              {source === "published" ? "Published syllabus" : settled ? "Starter syllabus" : "Checking syllabus"}
            </span>
          </div>

          <div className={styles.syllabusRoute}>
            <div className={styles.syllabusCopy}>
              <span className={styles.routeIcon}><AppIcon name="book" /></span>
              <div>
                <small>01 · Learn a planned concept</small>
                <strong>Continue the concept you are ready to learn</strong>
                <p>Use the concept carried from Planning, or choose one here. Your tutor stays anchored to the selected syllabus source.</p>
              </div>
            </div>

            <div className={styles.scopeControls}>
              <label>
                <span>Chapter</span>
                <select
                  value={selectedChapter?.value || ""}
                  disabled={!settled || !selectedChapter}
                  onChange={(event) => {
                    const next = chapters.find((chapter) => chapter.value === event.target.value);
                    setChapterId(event.target.value);
                    setTopicId(next?.topics[0]?.value || "");
                  }}
                >
                  {chapters.map((chapter) => <option key={chapter.value} value={chapter.value}>{chapter.label}</option>)}
                </select>
              </label>
              <label>
                <span>Topic</span>
                <select
                  value={selectedTopic?.value || ""}
                  disabled={!settled || !selectedTopic}
                  onChange={(event) => setTopicId(event.target.value)}
                >
                  {(selectedChapter?.topics || []).map((topic) => <option key={topic.value} value={topic.value}>{topic.label}</option>)}
                </select>
              </label>
              <button
                type="button"
                disabled={!settled || !selectedChapter || !selectedTopic}
                onClick={() => startSession("learn")}
              >
                Start learning <AppIcon name="arrowRight" />
              </button>
            </div>
          </div>

          <div className={styles.quickRoutes} aria-label="Direct Study Lab routes">
            <button
              type="button"
              className={styles.quickRoute}
              data-route="clarify"
              onClick={() => startSession("clarify")}
            >
              <span className={styles.routeIcon}><AppIcon name="spark" /></span>
              <span className={styles.routeCopy}>
                <small>02 · Clarify a doubt</small>
                <strong>Ask AI directly</strong>
                <span>Type the question in your own words and get a calm, step-by-step explanation.</span>
              </span>
              <span className={styles.routeAction}>Ask AI <AppIcon name="arrowRight" /></span>
            </button>

            <button
              type="button"
              className={styles.quickRoute}
              data-route="practice"
              disabled={!settled || !selectedChapter || !selectedTopic}
              onClick={() => startSession("practice")}
            >
              <span className={styles.routeIcon}><AppIcon name="check" /></span>
              <span className={styles.routeCopy}>
                <small>03 · Check understanding</small>
                <strong>Practise one focused question</strong>
                <span>Answer first, then let your tutor explain what is clear and what needs another look.</span>
              </span>
              <span className={styles.routeAction}>Check me <AppIcon name="arrowRight" /></span>
            </button>
          </div>
        </section>

        <aside className={styles.continuePanel} aria-labelledby="continue-study-heading">
          <div className={styles.panelHeading}>
            <div>
              <p>Pick up naturally</p>
              <h2 id="continue-study-heading">Recent conversations</h2>
            </div>
            <Link href="/dashboard/study/history">View all</Link>
          </div>

          {recent.length ? (
            <div className={styles.recentList}>
              {recent.map((conversation) => (
                <Link key={conversation.id} href={conversationHref(conversation)} className={styles.recentRow}>
                  <span className={styles.recentIcon}><AppIcon name={conversation.pinned ? "spark" : "history"} /></span>
                  <span>
                    <strong>{conversation.title}</strong>
                    <small>{conversation.scope?.source === "syllabus" ? conversation.scope.topicLabel : conversation.topic || "Open tutor"}</small>
                  </span>
                  <time dateTime={conversation.updatedAt}>{relativeTime(conversation.updatedAt)}</time>
                </Link>
              ))}
            </div>
          ) : syncState !== "synced" ? (
            <div className={styles.emptyRecent} role="status">
              <AppIcon name="history" />
              <strong>{syncState === "loading" ? "Finding your conversations…" : "Your history could not sync"}</strong>
              <span>{syncState === "loading" ? "You can choose a study route while we check." : "Your conversations have not been erased. Try syncing again, or start a new question."}</span>
              {syncState === "offline" ? <button type="button" className={styles.retryHistory} onClick={reload}>Retry sync</button> : null}
            </div>
          ) : (
            <div className={styles.emptyRecent}>
              <AppIcon name="study" />
              <strong>Your first conversation starts here</strong>
              <span>Choose one of the three study routes. Study Lab will keep the conversation ready for you to continue.</span>
            </div>
          )}

          <div className={styles.promise}>
            <span><AppIcon name="check" /></span>
            <div>
              <strong>One task at a time</strong>
              <p>Revision tools and exam practice stay in their own dedicated labs, so this space remains focused on learning.</p>
            </div>
          </div>
        </aside>
      </div>
    </StudyScreen>
  );
}