"use client";

import { ExamScreen, ExamStatusMessage } from "@/components/exam/ExamScreen";
import { AppIcon } from "@/components/ui/Polished";
import { useAuth } from "@/context/AuthContext";
import { examApiRequest } from "@/features/exam/api";
import { type ExamQuestion, normalizeExamQuestion } from "@/features/exam/contracts";
import { readPlanningMcqScope } from "@/features/exam/mcq/planningScope";
import {
  MCQ_DRAFT_VERSION,
  clearMcqDraft,
  getMcqDraftKey,
  readMcqDraft,
  writeMcqDraft,
  type McqDifficulty,
} from "@/features/exam/mcq/draft";
import { BUILTIN_CHAPTERS, findChapterForTopic, reconcileSelection, useCatalog, type CatalogChapter } from "@/lib/catalog";
import { invalidateApiCache } from "@/lib/apiClient";
import {
  DEFAULT_CLASS_LEVEL,
  EXAM_GUARDRAIL,
  MATERIAL_NOT_FOUND_MESSAGE,
  SUBJECT,
} from "@/lib/examConfig";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import styles from "./mcq.module.css";

type McqStage = "configure" | "attempt" | "results";
type SaveState = "idle" | "saving" | "saved" | "failed";
type AttemptScope = {
  chapterValue: string;
  chapterLabel: string;
  topicValue: string;
  topicLabel: string;
};

type GenerationResponse = {
  questions?: unknown[];
  error?: string;
  detail?: string;
};

const COUNT_OPTIONS: Array<{ value: 5 | 10; label: string; detail: string }> = [
  { value: 5, label: "Quick check", detail: "5 questions" },
  { value: 10, label: "Full drill", detail: "10 questions" },
];

const DIFFICULTY_OPTIONS: Array<{ value: McqDifficulty; label: string; detail: string }> = [
  { value: "easy", label: "Foundation", detail: "Recall and core ideas" },
  { value: "medium", label: "Standard", detail: "Balanced exam practice" },
  { value: "advanced", label: "Challenge", detail: "Deeper application" },
];

function normalizeTopicValue(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function formatElapsed(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function clampMetric(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function optionText(option: string) {
  return option.replace(/^[A-D][.)]\s*/i, "");
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}

export default function McqExamPage() {
  const { profile, userId, loading, getAuthHeaders } = useAuth();
  const { chapters } = useCatalog();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchKey = searchParams.toString();
  const planningScope = useMemo(() => readPlanningMcqScope(searchParams), [searchParams]);

  const requestedTopic = planningScope?.topic || normalizeTopicValue(searchParams.get("topic") || "alkanes") || "alkanes";
  const requestedChapter =
    planningScope?.chapter ||
    searchParams.get("chapter") ||
    findChapterForTopic(BUILTIN_CHAPTERS, requestedTopic) ||
    BUILTIN_CHAPTERS[0]?.value ||
    "hydrocarbon";
  const selection = useMemo(
    () => reconcileSelection(chapters, requestedChapter, requestedTopic),
    [chapters, requestedChapter, requestedTopic],
  );
  const selectedCatalogChapter = chapters.find((item) => item.value === selection.chapter) || chapters[0];
  const planningChapter = useMemo<CatalogChapter | undefined>(() => planningScope ? ({
    label: planningScope.chapterLabel,
    value: planningScope.chapter,
    subject: planningScope.subject,
    classLevel: planningScope.classLevel,
    topics: [{ label: planningScope.topicLabel, value: planningScope.topic }],
  }) : undefined, [planningScope]);
  const selectedChapter = planningChapter || selectedCatalogChapter;
  const selectedTopic = planningScope
    ? planningChapter?.topics[0]
    : selectedChapter?.topics.find((item) => item.value === selection.topic) || selectedChapter?.topics[0];

  const [stage, setStage] = useState<McqStage>("configure");
  const [attemptScope, setAttemptScope] = useState<AttemptScope | null>(null);
  const [questionCount, setQuestionCount] = useState<5 | 10>(5);
  const [difficulty, setDifficulty] = useState<McqDifficulty>("medium");
  const [questions, setQuestions] = useState<ExamQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [retryCount, setRetryCount] = useState(0);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [pendingSubmission, setPendingSubmission] = useState<Record<string, unknown> | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const startedAtRef = useRef<string | null>(null);
  const generationLatencyRef = useRef(0);
  const hydratedDraftRef = useRef("");
  const generationAbortRef = useRef<AbortController | null>(null);
  const liveConfigureScopeRef = useRef("");
  const savingResultRef = useRef(false);

  const classLevel = planningScope?.classLevel || profile?.classLevel || DEFAULT_CLASS_LEVEL;
  const activeSubject = planningScope?.subject || SUBJECT;
  const chapterValue = selectedChapter?.value || requestedChapter;
  const topicValue = selectedTopic?.value || requestedTopic;
  const activeChapterValue = attemptScope?.chapterValue || chapterValue;
  const activeChapterLabel = attemptScope?.chapterLabel || selectedChapter?.label || "Chapter";
  const activeTopicValue = attemptScope?.topicValue || topicValue;
  const activeTopicLabel = attemptScope?.topicLabel || selectedTopic?.label || "Topic";
  liveConfigureScopeRef.current = `${chapterValue}:${topicValue}`;
  const draftKey = useMemo(
    () => (userId ? getMcqDraftKey(userId, activeChapterValue, activeTopicValue) : ""),
    [activeChapterValue, activeTopicValue, userId],
  );
  const scopeQuery = `chapter=${encodeURIComponent(activeChapterValue)}&topic=${encodeURIComponent(activeTopicValue)}`;
  const hubHref = `/dashboard/exam?${scopeQuery}`;
  const revisionHref = `/dashboard/revision/${encodeURIComponent(activeChapterValue)}?topic=${encodeURIComponent(activeTopicValue)}`;
  const workspaceHref = `/dashboard/exam/workspace?${scopeQuery}`;

  const answeredCount = questions.reduce(
    (total, question) => total + (answers[question.id] ? 1 : 0),
    0,
  );
  const completion = questions.length ? Math.round((answeredCount / questions.length) * 100) : 0;
  const score = questions.reduce(
    (total, question) => total + (answers[question.id] === question.correct ? 1 : 0),
    0,
  );
  const accuracy = questions.length ? Math.round((score / questions.length) * 100) : 0;

  const replaceScope = useCallback(
    (nextChapter: string, nextTopic: string) => {
      const params = new URLSearchParams(searchKey);
      params.set("chapter", nextChapter);
      params.set("topic", nextTopic);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchKey],
  );

  const resetAttempt = useCallback(() => {
    generationAbortRef.current?.abort();
    generationAbortRef.current = null;
    if (draftKey) clearMcqDraft(draftKey);
    setStage("configure");
    setAttemptScope(null);
    setQuestions([]);
    setAnswers({});
    setRetryCount(0);
    setCurrentIndex(0);
    setReviewIndex(0);
    setElapsedSeconds(0);
    setGenerating(false);
    setSaveState("idle");
    setNotice("");
    setError("");
    startedAtRef.current = null;
    generationLatencyRef.current = 0;
    setPendingSubmission(null);
    savingResultRef.current = false;
  }, [draftKey]);

  // Keep chapter and topic in the URL. Published catalog updates can correct
  // an obsolete value, and every focused Exam route remains deep-linkable.
  useEffect(() => {
    if (planningScope) return;
    if (!selectedChapter || !selectedTopic || stage !== "configure") return;
    if (requestedChapter !== selectedChapter.value || requestedTopic !== selectedTopic.value) {
      replaceScope(selectedChapter.value, selectedTopic.value);
    }
  }, [
    replaceScope,
    requestedChapter,
    requestedTopic,
    planningScope,
    selectedChapter,
    selectedTopic,
    stage,
  ]);

  // Restore only the draft for this authenticated user and exact course scope.
  useEffect(() => {
    if (!draftKey || !userId || !selectedChapter || !selectedTopic) return;
    if (hydratedDraftRef.current === draftKey || stage !== "configure" || questions.length) return;
    hydratedDraftRef.current = draftKey;

    const draft = readMcqDraft(draftKey);
    if (
      !draft ||
      draft.userId !== userId ||
      draft.chapter !== selectedChapter.value ||
      draft.topic !== selectedTopic.value
    ) {
      return;
    }

    setQuestionCount(draft.questionCount);
    setDifficulty(draft.difficulty);
    setAttemptScope({
      chapterValue: draft.chapter,
      chapterLabel: draft.chapterLabel,
      topicValue: draft.topic,
      topicLabel: draft.topicLabel,
    });
    setQuestions(draft.questions);
    setAnswers(draft.answers);
    setRetryCount(draft.retryCount);
    setCurrentIndex(Math.min(draft.currentIndex, draft.questions.length - 1));
    startedAtRef.current = draft.startedAt;
    generationLatencyRef.current = draft.generationLatencyMs;
    setStage("attempt");
    setNotice("Your unfinished attempt was restored on this device.");
  }, [draftKey, questions.length, selectedChapter, selectedTopic, stage, userId]);

  // Persist unfinished work within this browser session. Results are stored by
  // the backend; correct answers never outlive the active tab as a local draft.
  useEffect(() => {
    if (
      stage !== "attempt" ||
      !draftKey ||
      !userId ||
      !selectedChapter ||
      !selectedTopic ||
      !questions.length ||
      !startedAtRef.current
    ) {
      return;
    }

    writeMcqDraft(draftKey, {
      version: MCQ_DRAFT_VERSION,
      userId,
      chapter: attemptScope?.chapterValue || selectedChapter.value,
      chapterLabel: attemptScope?.chapterLabel || selectedChapter.label,
      topic: attemptScope?.topicValue || selectedTopic.value,
      topicLabel: attemptScope?.topicLabel || selectedTopic.label,
      questionCount,
      difficulty,
      questions,
      answers,
      retryCount,
      currentIndex,
      startedAt: startedAtRef.current,
      generationLatencyMs: generationLatencyRef.current,
      savedAt: new Date().toISOString(),
    });
  }, [
    answers,
    attemptScope,
    currentIndex,
    difficulty,
    draftKey,
    questionCount,
    questions,
    retryCount,
    selectedChapter,
    selectedTopic,
    stage,
    userId,
  ]);

  useEffect(() => {
    if (stage !== "attempt" || !questions.length) return;
    const updateElapsed = () => {
      const startedMs = startedAtRef.current ? new Date(startedAtRef.current).getTime() : NaN;
      if (Number.isFinite(startedMs)) {
        setElapsedSeconds(Math.max(0, Math.floor((Date.now() - startedMs) / 1000)));
      }
    };
    updateElapsed();
    const timer = window.setInterval(updateElapsed, 1000);
    return () => window.clearInterval(timer);
  }, [questions.length, stage]);

  useEffect(() => {
    if (stage !== "attempt" || !questions.length) return;
    const protectAttempt = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", protectAttempt);
    return () => window.removeEventListener("beforeunload", protectAttempt);
  }, [questions.length, stage]);

  useEffect(
    () => () => {
      generationAbortRef.current?.abort();
    },
    [],
  );

  const changeChapter = (event: ChangeEvent<HTMLSelectElement>) => {
    const nextChapter = chapters.find((item) => item.value === event.target.value);
    if (!nextChapter?.topics[0]) return;
    setNotice("");
    setError("");
    replaceScope(nextChapter.value, nextChapter.topics[0].value);
  };

  const changeTopic = (event: ChangeEvent<HTMLSelectElement>) => {
    setNotice("");
    setError("");
    replaceScope(chapterValue, event.target.value);
  };

  const generateQuestions = async () => {
    if (!userId || !selectedChapter || !selectedTopic || generating) return;

    const controller = new AbortController();
    const requestScope = `${selectedChapter.value}:${selectedTopic.value}`;
    generationAbortRef.current = controller;
    const requestedAt = Date.now();
    setGenerating(true);
    setNotice("");
    setError("");

    try {
      const sessionSeed = `${userId}-${selectedTopic.value}-${Date.now()}`;
      const data = await examApiRequest<GenerationResponse>("/generate-mcqs", {
        getAuthHeaders,
        method: "POST",
        retries: 0,
        timeoutMs: 45000,
        signal: controller.signal,
        body: {
          topic: selectedTopic.label,
          section_id: selectedTopic.value,
          session_id: `exam-${sessionSeed}`,
          difficulty,
          count: questionCount,
          subject: activeSubject,
          chapter: planningScope?.chapter || selectedChapter.label,
          ...(planningScope ? {
            class_level: classLevel,
            catalog_source: planningScope.catalogSource,
          } : {}),
          strict_grounding: true,
          retrieval_required: true,
          fallback_to_general_knowledge: false,
          include_source: true,
          require_four_options: true,
          require_explanation: true,
          system_guardrail: EXAM_GUARDRAIL,
          required_not_found_response: MATERIAL_NOT_FOUND_MESSAGE,
        },
      });

      const sourceLabel = `${selectedChapter.label} / ${selectedTopic.label}`;
      const nextQuestions = Array.isArray(data.questions)
        ? data.questions
            .map((question, index) => normalizeExamQuestion(question, index, sourceLabel))
            .filter((question): question is ExamQuestion => Boolean(question))
            .slice(0, questionCount)
        : [];
      const minimumViablePack = Math.min(5, questionCount);

      if (liveConfigureScopeRef.current !== requestScope) return;

      if (nextQuestions.length < minimumViablePack) {
        setError(
          data.error ||
            data.detail ||
            "The selected material did not support a complete grounded pack. Try another topic or add more study material.",
        );
        return;
      }

      const startedAt = new Date().toISOString();
      setQuestions(nextQuestions);
      setAttemptScope({
        chapterValue: selectedChapter.value,
        chapterLabel: selectedChapter.label,
        topicValue: selectedTopic.value,
        topicLabel: selectedTopic.label,
      });
      setAnswers({});
      setRetryCount(0);
      setCurrentIndex(0);
      setReviewIndex(0);
      setElapsedSeconds(0);
      setSaveState("idle");
      startedAtRef.current = startedAt;
      generationLatencyRef.current = Date.now() - requestedAt;
      setStage("attempt");
      setNotice(
        nextQuestions.length < questionCount
          ? `${nextQuestions.length} strongly supported questions are ready.`
          : "",
      );
    } catch (generationError) {
      if (controller.signal.aborted) return;
      setError(
        getErrorMessage(
          generationError,
          "The MCQ pack could not be generated. Check the selected study material and try again.",
        ),
      );
    } finally {
      if (generationAbortRef.current === controller) generationAbortRef.current = null;
      setGenerating(false);
    }
  };

  const recordAnswer = (questionId: string, option: string) => {
    if (stage !== "attempt") return;
    const previous = answers[questionId];
    if (previous && previous !== option) setRetryCount((count) => count + 1);
    setAnswers((current) => ({ ...current, [questionId]: option }));
    setNotice("");
  };

  const discardAttempt = () => {
    if (!window.confirm("Discard this unfinished MCQ attempt and clear its device draft?")) return;
    resetAttempt();
  };

  const persistResult = async (payload: Record<string, unknown>) => {
    if (!userId || savingResultRef.current) return;
    savingResultRef.current = true;
    setSaveState("saving");
    setError("");
    try {
      await examApiRequest<Record<string, unknown>>("/submit-session", {
        getAuthHeaders,
        method: "POST",
        retries: 0,
        timeoutMs: 12000,
        body: payload,
      });
      invalidateApiCache(`sessions:${userId}`);
      invalidateApiCache(`progress:${userId}`);
      invalidateApiCache("leaderboard");
      if (draftKey) clearMcqDraft(draftKey);
      setPendingSubmission(null);
      setSaveState("saved");
    } catch (saveError) {
      setSaveState("failed");
      setError(
        getErrorMessage(
          saveError,
          "Your review is ready, but this result could not be saved to history.",
        ),
      );
    } finally {
      savingResultRef.current = false;
    }
  };

  const submitAttempt = async () => {
    if (!questions.length || stage !== "attempt" || !userId) return;
    const firstUnanswered = questions.findIndex((question) => !answers[question.id]);
    if (firstUnanswered >= 0) {
      setCurrentIndex(firstUnanswered);
      setNotice(`Answer question ${firstUnanswered + 1} before submitting.`);
      return;
    }

    const completedAt = new Date();
    const startedAt = startedAtRef.current || completedAt.toISOString();
    const startedAtMs = new Date(startedAt).getTime();
    const durationSeconds = Number.isFinite(startedAtMs)
      ? Math.max(1, Math.round((completedAt.getTime() - startedAtMs) / 1000))
      : 1;
    const focusScore = clampMetric(accuracy - Math.min(20, retryCount * 3));
    const firstReview = questions.findIndex((question) => answers[question.id] !== question.correct);
    const submissionPayload: Record<string, unknown> = {
      user_id: userId,
      topic: planningScope ? activeTopicValue : activeTopicLabel,
      ...(planningScope ? {
        topic_label: activeTopicLabel,
        catalog_source: planningScope.catalogSource,
        class_level: classLevel,
        chapter: activeChapterValue,
      } : {}),
      subject: activeSubject,
      score,
      total_questions: questions.length,
      xp_earned: score * 10,
      time_spent_seconds: durationSeconds,
      focus_score: focusScore,
      session_type: "study_exam",
      started_at: startedAt,
      completed_at: completedAt.toISOString(),
      response_latency_ms: generationLatencyRef.current,
      hint_count: 0,
      retry_count: retryCount,
      replay_data: {
        topic: planningScope ? activeTopicValue : activeTopicLabel,
        ...(planningScope ? { topic_label: activeTopicLabel } : {}),
        source: planningScope ? "planning" : "exam_mode",
        ...(planningScope ? {
          catalog_source: planningScope.catalogSource,
          class_level: classLevel,
          chapter: activeChapterValue,
          chapter_label: activeChapterLabel,
        } : {}),
        telemetry: {
          started_at: startedAt,
          completed_at: completedAt.toISOString(),
          duration_seconds: durationSeconds,
          exam_generation_latency_ms: generationLatencyRef.current,
          retry_count: retryCount,
          focus_score: focusScore,
        },
        questions: questions.map((question) => ({
          id: question.id,
          text: question.question,
          topic: planningScope ? activeTopicValue : activeTopicLabel,
          ...(planningScope ? { topic_label: activeTopicLabel } : {}),
          options: question.options,
          correct_answer: question.correct,
          user_answer: answers[question.id] || "",
          is_correct: answers[question.id] === question.correct,
          ai_explanation: question.explanation,
        })),
        probable_questions: [],
      },
    };

    setElapsedSeconds(durationSeconds);
    setReviewIndex(firstReview >= 0 ? firstReview : 0);
    setStage("results");
    setNotice("");
    setError("");
    setPendingSubmission(submissionPayload);
    await persistResult(submissionPayload);
  };

  const actions = (
    <div className={styles.headerActions}>
      {stage === "attempt" ? (
        <>
          <span className={styles.headerMetric} aria-label={`${answeredCount} of ${questions.length} answered`}>
            {answeredCount}/{questions.length}
          </span>
          <span className={styles.timer} aria-label={`${formatElapsed(elapsedSeconds)} elapsed`}>
            <AppIcon name="clock" />
            {formatElapsed(elapsedSeconds)}
          </span>
          <button className={styles.quietButton} type="button" onClick={discardAttempt}>
            Discard
          </button>
          <Link className={styles.quietLink} href={hubHref}>
            Save &amp; exit
          </Link>
        </>
      ) : (
        <span className={styles.scopePill}>{activeTopicLabel}</span>
      )}
    </div>
  );

  if (loading) {
    return (
      <ExamScreen
        eyebrow="Exam Lab / MCQ Test"
        title="Preparing your MCQ workspace"
        description="Loading your course and secure session."
        backHref={hubHref}
        backLabel="Exam Mode"
        bodyClassName={styles.screenBody}
      >
        <div className={styles.loadingState} role="status" aria-live="polite">
          <span className={styles.loadingMark} aria-hidden="true" />
          <strong>Opening your test setup…</strong>
          <p>Your grounded assessment tools will be ready in a moment.</p>
        </div>
      </ExamScreen>
    );
  }

  return (
    <ExamScreen
      eyebrow="Exam Lab / MCQ Test"
      title={stage === "configure" ? "Build a focused MCQ test" : stage === "attempt" ? "MCQ attempt" : "Attempt review"}
      description={
        stage === "configure"
          ? "Choose one course scope, then practise with source-grounded questions."
          : `${activeSubject} · ${classLevel} · ${activeChapterLabel} · ${activeTopicLabel}`
      }
      backHref={hubHref}
      backLabel="Exam Mode"
      actions={actions}
      bodyClassName={styles.screenBody}
    >
      <div className={styles.workspace} data-stage={stage}>
        {notice ? (
          <div className={styles.messageRow}>
            <ExamStatusMessage tone="info">{notice}</ExamStatusMessage>
          </div>
        ) : null}
        {error ? (
          <div className={styles.messageRow}>
            <ExamStatusMessage tone="error">{error}</ExamStatusMessage>
          </div>
        ) : null}

        {stage === "configure" ? (
          <section className={styles.configure} aria-labelledby="mcq-configure-title">
            <div className={styles.configureIntro}>
              <span className={styles.heroIcon} aria-hidden="true">
                <AppIcon name="mission" />
              </span>
              <p className={styles.kicker}>Source-locked assessment</p>
              <h2 id="mcq-configure-title">One clear test. No competing tools.</h2>
              <p>
                Questions, options, explanations, and source traces are generated only from your selected study material.
              </p>
              <div className={styles.trustList} aria-label="Assessment safeguards">
                <span><AppIcon name="check" /> Four-option questions</span>
                <span><AppIcon name="check" /> Complete review after submit</span>
                <span><AppIcon name="check" /> No outside-knowledge guesses</span>
              </div>
            </div>

            <div className={styles.setupCard}>
              <div className={styles.cardHeading}>
                <div>
                  <p className={styles.stepLabel}>Test setup</p>
                  <h3>Choose your course scope</h3>
                </div>
                <span>{questionCount} questions</span>
              </div>

              <div className={styles.selectGrid}>
                <label>
                  <span>Chapter</span>
                  <select value={chapterValue} onChange={changeChapter} disabled={generating || Boolean(planningScope)}>
                    {(planningScope && selectedChapter ? [selectedChapter] : chapters).map((chapter) => (
                      <option key={chapter.value} value={chapter.value}>{chapter.label}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Topic</span>
                  <select value={topicValue} onChange={changeTopic} disabled={generating || Boolean(planningScope)}>
                    {(selectedChapter?.topics || []).map((topic) => (
                      <option key={topic.value} value={topic.value}>{topic.label}</option>
                    ))}
                  </select>
                </label>
              </div>

              <fieldset className={styles.choiceGroup} disabled={generating}>
                <legend>Test length</legend>
                <div className={styles.choiceGrid}>
                  {COUNT_OPTIONS.map((option) => (
                    <label key={option.value} data-selected={questionCount === option.value ? "true" : "false"}>
                      <input
                        type="radio"
                        name="mcq-question-count"
                        value={option.value}
                        checked={questionCount === option.value}
                        onChange={() => setQuestionCount(option.value)}
                      />
                      <span><strong>{option.label}</strong><small>{option.detail}</small></span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <fieldset className={styles.choiceGroup} disabled={generating}>
                <legend>Difficulty</legend>
                <div className={styles.choiceGrid} data-columns="three">
                  {DIFFICULTY_OPTIONS.map((option) => (
                    <label key={option.value} data-selected={difficulty === option.value ? "true" : "false"}>
                      <input
                        type="radio"
                        name="mcq-difficulty"
                        value={option.value}
                        checked={difficulty === option.value}
                        onChange={() => setDifficulty(option.value)}
                      />
                      <span><strong>{option.label}</strong><small>{option.detail}</small></span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <div className={styles.setupFooter}>
                <div>
                  <span>Selected material</span>
                  <strong>{selectedChapter?.label} / {selectedTopic?.label}</strong>
                </div>
                <button
                  className={styles.primaryButton}
                  type="button"
                  onClick={() => void generateQuestions()}
                  disabled={generating || !userId || !selectedTopic}
                >
                  {generating ? <span className={styles.buttonSpinner} aria-hidden="true" /> : <AppIcon name="spark" />}
                  {generating ? "Building your test…" : "Generate MCQ test"}
                </button>
              </div>
            </div>
          </section>
        ) : null}

        {stage === "attempt" && questions.length ? (
          <section className={styles.attempt} aria-label="MCQ attempt">
            <div className={styles.progressTrack} aria-label={`${completion}% complete`}>
              <span style={{ width: `${completion}%` }} />
            </div>

            <div className={styles.attemptGrid}>
              <aside className={styles.navigator} aria-label="Question navigator">
                <div className={styles.navigatorHeading}>
                  <div>
                    <span>Questions</span>
                    <strong>{answeredCount} answered</strong>
                  </div>
                  <span>{completion}%</span>
                </div>
                <div className={styles.questionGrid}>
                  {questions.map((question, index) => (
                    <button
                      key={question.id}
                      type="button"
                      aria-current={index === currentIndex ? "step" : undefined}
                      aria-label={`Question ${index + 1}${answers[question.id] ? ", answered" : ", not answered"}`}
                      data-answered={answers[question.id] ? "true" : "false"}
                      data-current={index === currentIndex ? "true" : "false"}
                      onClick={() => {
                        setCurrentIndex(index);
                        setNotice("");
                      }}
                    >
                      {answers[question.id] ? <AppIcon name="check" /> : index + 1}
                    </button>
                  ))}
                </div>
                <p>Answered questions are marked. You can revisit any answer before submitting.</p>
              </aside>

              {(() => {
                const question = questions[Math.min(currentIndex, questions.length - 1)];
                const selected = answers[question.id] || "";
                return (
                  <article className={styles.questionCard} key={question.id}>
                    <div className={styles.questionMeta}>
                      <span>Question {currentIndex + 1} of {questions.length}</span>
                      <span>{difficulty === "advanced" ? "Challenge" : difficulty === "easy" ? "Foundation" : "Standard"}</span>
                    </div>
                    <h2>{question.question}</h2>
                    {question.source ? <p className={styles.sourceLine}>Source · {question.source}</p> : null}

                    <fieldset className={styles.options}>
                      <legend className={styles.srOnly}>Choose one answer</legend>
                      {question.options.map((option, optionIndex) => {
                        const optionKey = String.fromCharCode(65 + optionIndex);
                        const inputId = `mcq-${currentIndex}-${optionKey}`;
                        return (
                          <label key={`${question.id}-${optionKey}`} htmlFor={inputId} data-selected={selected === optionKey ? "true" : "false"}>
                            <input
                              id={inputId}
                              type="radio"
                              name={`answer-${question.id}`}
                              value={optionKey}
                              checked={selected === optionKey}
                              onChange={() => recordAnswer(question.id, optionKey)}
                            />
                            <strong aria-hidden="true">{optionKey}</strong>
                            <span>{optionText(option)}</span>
                          </label>
                        );
                      })}
                    </fieldset>
                  </article>
                );
              })()}
            </div>

            <div className={styles.stickyActions}>
              <button
                className={styles.secondaryButton}
                type="button"
                onClick={() => setCurrentIndex((index) => Math.max(0, index - 1))}
                disabled={currentIndex === 0}
              >
                Previous
              </button>
              <div className={styles.mobileProgress}>{currentIndex + 1} / {questions.length}</div>
              {currentIndex < questions.length - 1 ? (
                <button
                  className={styles.secondaryButton}
                  type="button"
                  onClick={() => setCurrentIndex((index) => Math.min(questions.length - 1, index + 1))}
                >
                  Next question
                </button>
              ) : null}
              <button className={styles.primaryButton} type="button" onClick={() => void submitAttempt()}>
                Submit and review
                <AppIcon name="arrowRight" />
              </button>
            </div>
          </section>
        ) : null}

        {stage === "results" && questions.length ? (
          <section className={styles.results} aria-labelledby="mcq-result-title">
            <div className={styles.resultSummary} data-grade={accuracy >= 80 ? "strong" : accuracy >= 50 ? "steady" : "focus"}>
              <div className={styles.scoreRing}>
                <strong>{score}/{questions.length}</strong>
                <span>{accuracy}%</span>
              </div>
              <div className={styles.resultCopy}>
                <p className={styles.kicker}>Attempt complete</p>
                <h2 id="mcq-result-title">
                  {accuracy >= 80
                    ? "Strong work — your understanding is exam-ready."
                    : accuracy >= 50
                      ? "A solid base — use the review to close the gaps."
                      : "Every explanation below is a mark you can win back."}
                </h2>
                <p>+{score * 10} XP · {formatElapsed(elapsedSeconds)} · {activeTopicLabel}</p>
              </div>
              <div className={styles.saveStatus} data-state={saveState} role="status" aria-live="polite">
                {saveState === "saving" ? <span className={styles.buttonSpinner} aria-hidden="true" /> : <AppIcon name={saveState === "saved" ? "check" : "history"} />}
                <span className={styles.saveStatusCopy}>
                  <strong>{saveState === "saving" ? "Saving result" : saveState === "saved" ? "Saved to history" : "Result not saved"}</strong>
                  <small>{saveState === "failed" ? "Review remains available; retry only if history is missing" : "Your learning record is up to date"}</small>
                </span>
                {saveState === "failed" && pendingSubmission ? (
                  <button className={styles.retrySaveButton} type="button" onClick={() => {
                    void persistResult(pendingSubmission);
                  }}>
                    Retry save
                  </button>
                ) : null}
              </div>
            </div>

            <div className={styles.reviewLayout}>
              <aside className={styles.reviewNavigator} aria-label="Answer review navigator">
                <div className={styles.reviewLegend}>
                  <span><i data-tone="correct" /> Correct</span>
                  <span><i data-tone="incorrect" /> Review</span>
                </div>
                <div className={styles.questionGrid}>
                  {questions.map((question, index) => {
                    const correct = answers[question.id] === question.correct;
                    return (
                      <button
                        key={`review-${question.id}`}
                        type="button"
                        aria-current={index === reviewIndex ? "step" : undefined}
                        aria-label={`Review question ${index + 1}, ${correct ? "correct" : "incorrect"}`}
                        data-result={correct ? "correct" : "incorrect"}
                        data-current={index === reviewIndex ? "true" : "false"}
                        onClick={() => setReviewIndex(index)}
                      >
                        {index + 1}
                      </button>
                    );
                  })}
                </div>
              </aside>

              {(() => {
                const question = questions[Math.min(reviewIndex, questions.length - 1)];
                const selected = answers[question.id] || "";
                const correct = selected === question.correct;
                const selectedIndex = selected ? selected.charCodeAt(0) - 65 : -1;
                const correctIndex = question.correct.charCodeAt(0) - 65;
                return (
                  <article className={styles.reviewCard} data-correct={correct ? "true" : "false"}>
                    <div className={styles.reviewStatus}>
                      <span><AppIcon name={correct ? "check" : "x"} /> {correct ? "Correct" : "Review this answer"}</span>
                      <span>Question {reviewIndex + 1} of {questions.length}</span>
                    </div>
                    <h3>{question.question}</h3>
                    <div className={styles.answerComparison}>
                      <div data-tone={correct ? "correct" : "incorrect"}>
                        <span>Your answer</span>
                        <strong>{selected ? `${selected}. ${optionText(question.options[selectedIndex] || selected)}` : "Not answered"}</strong>
                      </div>
                      {!correct ? (
                        <div data-tone="correct">
                          <span>Correct answer</span>
                          <strong>{question.correct}. {optionText(question.options[correctIndex] || question.correct)}</strong>
                        </div>
                      ) : null}
                    </div>
                    <div className={styles.explanation}>
                      <span>Why this is the answer</span>
                      <p>{question.explanation}</p>
                    </div>
                    {question.source ? <p className={styles.reviewSource}><AppIcon name="book" /> Source · {question.source}</p> : null}
                  </article>
                );
              })()}
            </div>

            <div className={styles.resultActions}>
              <button className={styles.primaryButton} type="button" onClick={resetAttempt}>
                <AppIcon name="plus" /> New MCQ test
              </button>
              <Link className={styles.secondaryButton} href={revisionHref}>Revise this topic</Link>
              <Link className={styles.secondaryButton} href={workspaceHref}>Practise a written answer</Link>
              <div className={styles.reviewPaging}>
                <button type="button" onClick={() => setReviewIndex((index) => Math.max(0, index - 1))} disabled={reviewIndex === 0}>Previous</button>
                <span>{reviewIndex + 1} / {questions.length}</span>
                <button type="button" onClick={() => setReviewIndex((index) => Math.min(questions.length - 1, index + 1))} disabled={reviewIndex === questions.length - 1}>Next</button>
              </div>
            </div>
          </section>
        ) : null}
      </div>
    </ExamScreen>
  );
}
