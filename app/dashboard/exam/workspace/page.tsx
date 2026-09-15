"use client";

import { AppIcon } from "@/components/ui/Polished";
import { useRouteHeadingFocus } from "@/components/exam/useRouteHeadingFocus";
import { useAuth } from "@/context/AuthContext";
import {
  generateWrittenQuestion,
  startWrittenSession,
  submitCustomAnswer,
  submitGeneratedAnswer,
  type WrittenFeedback,
  type WrittenQuestion,
  type WrittenSession,
} from "@/features/exam/written";
import { WrittenFeedbackView } from "@/features/exam/WrittenFeedbackView";
import {
  planningExamCatalogChapter,
  planningExamQuery,
  readPlanningExamScope,
} from "@/features/exam/mcq/planningScope";
import { BUILTIN_CHAPTERS, findChapterForTopic, reconcileSelection, useCatalog } from "@/lib/catalog";
import { DEFAULT_CLASS_LEVEL, QUESTION_TYPES, SUBJECT } from "@/lib/examConfig";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import styles from "./workspace.module.css";

type PracticeMode = "generated" | "custom";
type WorkspaceStage = "setup" | "write" | "feedback";

type WrittenDraft = {
  version: 1;
  mode: PracticeMode;
  stage: Exclude<WorkspaceStage, "feedback">;
  chapter: string;
  topic: string;
  marksFocus: string;
  questionType: string;
  session: WrittenSession | null;
  question: WrittenQuestion | null;
  answer: string;
  customQuestion: string;
  customAnswer: string;
};

function normalizeScope(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function formatLabel(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function wordCount(value: string) {
  return value.trim() ? value.trim().split(/\s+/).length : 0;
}

function queryFor(chapter: string, topic: string) {
  const query = new URLSearchParams();
  if (chapter) query.set("chapter", chapter);
  if (topic) query.set("topic", topic);
  return query.toString();
}

export default function AnswerWorkspacePage() {
  const { profile, userId, loading, getAuthHeaders } = useAuth();
  const { chapters, settled: catalogSettled } = useCatalog();
  const searchParams = useSearchParams();
  const router = useRouter();
  const backendURL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:8000";
  const planningScope = useMemo(() => readPlanningExamScope(searchParams), [searchParams]);
  const planningChapter = useMemo(
    () => planningScope ? planningExamCatalogChapter(planningScope) : null,
    [planningScope],
  );
  const scopeChapters = useMemo(
    () => planningChapter ? [planningChapter] : chapters,
    [chapters, planningChapter],
  );

  const initialTopic = planningScope?.topic || normalizeScope(searchParams.get("topic") || "alkanes") || "alkanes";
  const initialChapter = planningScope?.chapter || normalizeScope(searchParams.get("chapter") || "")
    || findChapterForTopic(BUILTIN_CHAPTERS, initialTopic)
    || "hydrocarbon";

  const [chapter, setChapter] = useState(initialChapter);
  const [topic, setTopic] = useState(initialTopic);
  const [mode, setMode] = useState<PracticeMode | null>(null);
  const [stage, setStage] = useState<WorkspaceStage>("setup");
  const [marksFocus, setMarksFocus] = useState("5");
  const [questionType, setQuestionType] = useState("long_answer");
  const [session, setSession] = useState<WrittenSession | null>(null);
  const [question, setQuestion] = useState<WrittenQuestion | null>(null);
  const [answer, setAnswer] = useState("");
  const [customQuestion, setCustomQuestion] = useState("");
  const [customAnswer, setCustomAnswer] = useState("");
  const [feedback, setFeedback] = useState<WrittenFeedback | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [draftReady, setDraftReady] = useState(false);
  const preserveUnrelatedDraftRef = useRef(false);
  const headingRef = useRouteHeadingFocus();

  const selection = useMemo(
    () => planningScope
      ? { chapter: planningScope.chapter, topic: planningScope.topic, changed: false }
      : reconcileSelection(scopeChapters, chapter, topic),
    [chapter, planningScope, scopeChapters, topic],
  );
  const selectedChapter = scopeChapters.find((item) => item.value === selection.chapter) || scopeChapters[0];
  const selectedTopic = selectedChapter?.topics.find((item) => item.value === selection.topic) || selectedChapter?.topics[0];
  const classLevel = planningScope?.classLevel || profile?.classLevel || DEFAULT_CLASS_LEVEL;
  const activeSubject = planningScope?.subject || SUBJECT;
  const scopeQuery = planningScope
    ? planningExamQuery(planningScope)
    : queryFor(selectedChapter?.value || chapter, selectedTopic?.value || topic);
  const draftKey = userId ? `agentifyai:exam:written:v1:${userId}` : "";
  const hasUnsavedDraft = stage === "write" && !feedback && (
    Boolean(answer.trim()) || Boolean(customQuestion.trim()) || Boolean(customAnswer.trim()) || Boolean(question)
  );

  useEffect(() => {
    if (planningScope) return;
    // Published chapters are not necessarily present in the instantaneous
    // starter catalog. Preserve their URL until the real catalog has settled.
    if (!catalogSettled) return;
    if (!selection.changed) return;
    setChapter(selection.chapter);
    setTopic(selection.topic);
    router.replace(`/dashboard/exam/workspace?${queryFor(selection.chapter, selection.topic)}`, { scroll: false });
  }, [catalogSettled, planningScope, router, selection]);

  useEffect(() => {
    if (!draftKey) return;
    try {
      const raw = window.sessionStorage.getItem(draftKey);
      if (raw) {
        const draft = JSON.parse(raw) as Partial<WrittenDraft>;
        if (draft.version === 1 && (draft.mode === "generated" || draft.mode === "custom")) {
          if (planningScope && (draft.chapter !== planningScope.chapter || draft.topic !== planningScope.topic)) {
            preserveUnrelatedDraftRef.current = true;
            setNotice("Your earlier draft remains saved. This workspace is ready for the focus selected in Planning.");
            return;
          }
          setMode(draft.mode);
          setStage(draft.stage === "write" ? "write" : "setup");
          if (draft.chapter) setChapter(draft.chapter);
          if (draft.topic) setTopic(draft.topic);
          if (draft.marksFocus) setMarksFocus(draft.marksFocus);
          if (draft.questionType) setQuestionType(draft.questionType);
          setSession(draft.session || null);
          setQuestion(draft.question || null);
          setAnswer(draft.answer || "");
          setCustomQuestion(draft.customQuestion || "");
          setCustomAnswer(draft.customAnswer || "");
          setNotice("Your unfinished answer was restored on this device.");
        }
      }
    } catch {
      window.sessionStorage.removeItem(draftKey);
    } finally {
      setDraftReady(true);
    }
  }, [draftKey, planningScope]);

  useEffect(() => {
    if (!draftReady || !draftKey) return;
    if (!hasUnsavedDraft || !mode) {
      if (preserveUnrelatedDraftRef.current) return;
      window.sessionStorage.removeItem(draftKey);
      return;
    }
    const draft: WrittenDraft = {
      version: 1,
      mode,
      stage: stage === "write" ? "write" : "setup",
      chapter: selectedChapter?.value || chapter,
      topic: selectedTopic?.value || topic,
      marksFocus,
      questionType,
      session,
      question,
      answer,
      customQuestion,
      customAnswer,
    };
    window.sessionStorage.setItem(draftKey, JSON.stringify(draft));
  }, [answer, chapter, customAnswer, customQuestion, draftKey, draftReady, hasUnsavedDraft, marksFocus, mode, question, questionType, selectedChapter?.value, selectedTopic?.value, session, stage, topic]);

  useEffect(() => {
    if (!hasUnsavedDraft) return;
    const warnBeforeLeave = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeLeave);
    return () => window.removeEventListener("beforeunload", warnBeforeLeave);
  }, [hasUnsavedDraft]);

  useEffect(() => {
    if (stage !== "feedback") return;
    const frame = window.requestAnimationFrame(() => headingRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [headingRef, stage]);

  const updateRouteScope = (nextChapter: string, nextTopic: string) => {
    if (planningScope) return;
    setChapter(nextChapter);
    setTopic(nextTopic);
    router.replace(`/dashboard/exam/workspace?${queryFor(nextChapter, nextTopic)}`, { scroll: false });
  };

  const getContext = async () => ({ backendURL, headers: await getAuthHeaders() });

  const ensureSession = async () => {
    if (session) return session;
    if (!selectedChapter || !selectedTopic) throw new Error("Choose a chapter and topic first.");
    const nextSession = await startWrittenSession(await getContext(), {
      class_level: classLevel,
      subject: activeSubject,
      chapter_name: selectedChapter.label,
      topic: selectedTopic.label,
      marks_focus: marksFocus,
    });
    setSession(nextSession);
    return nextSession;
  };

  const prepareGeneratedQuestion = async () => {
    if (busy || !selectedTopic) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const activeSession = await ensureSession();
      const nextQuestion = await generateWrittenQuestion(await getContext(), {
        session_id: activeSession.id,
        topic: selectedTopic.label,
        marks_focus: marksFocus,
        question_type: questionType,
        use_syllabus_grounding: true,
      });
      setQuestion(nextQuestion);
      setAnswer("");
      setFeedback(null);
      setStage("write");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not prepare a written question.");
    } finally {
      setBusy(false);
    }
  };

  const evaluateAnswer = async () => {
    if (!mode || busy) return;
    if (mode === "generated" && (!question || !answer.trim())) return;
    if (mode === "custom" && (!customQuestion.trim() || !customAnswer.trim())) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const context = await getContext();
      const result = mode === "generated" && question
        ? await submitGeneratedAnswer(context, { attempt_id: question.attempt_id, answer: answer.trim() })
        : await submitCustomAnswer(context, {
          session_id: (await ensureSession()).id,
          question_text: customQuestion.trim(),
          marks_total: Math.max(1, Number(marksFocus) || 5),
          answer: customAnswer.trim(),
          question_type: questionType,
          topic: selectedTopic?.label || topic,
        });
      setFeedback(result.feedback);
      setStage("feedback");
      setNotice(`${result.weaknesses_updated} learning signal${result.weaknesses_updated === 1 ? "" : "s"} updated.`);
      if (draftKey) window.sessionStorage.removeItem(draftKey);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not evaluate this answer.");
    } finally {
      setBusy(false);
    }
  };

  const resetWorkspace = () => {
    if (busy) return;
    if (hasUnsavedDraft && !window.confirm("Discard this unfinished answer and start again?")) return;
    setMode(null);
    setStage("setup");
    setQuestion(null);
    setAnswer("");
    setCustomQuestion("");
    setCustomAnswer("");
    setFeedback(null);
    setError("");
    setNotice("");
    if (draftKey) window.sessionStorage.removeItem(draftKey);
  };

  const practiceAgain = () => {
    setStage("setup");
    setQuestion(null);
    setAnswer("");
    setCustomQuestion("");
    setCustomAnswer("");
    setFeedback(null);
    setError("");
    setNotice("");
  };

  return (
    <div className={styles.page} data-stage={stage}>
      <div className={styles.frame}>
        <header className={styles.topbar}>
          <div className={styles.breadcrumbs} aria-label="Breadcrumb">
            <Link href={`/dashboard/exam?${scopeQuery}`}>
              <AppIcon name="arrowRight" />
              Exam Lab
            </Link>
            <span aria-hidden="true">/</span>
            <span>Answer Workspace</span>
          </div>
          <div className={styles.topActions}>
            <Link className={styles.historyLink} href={`/dashboard/exam/workspace/history?${scopeQuery}`}>
              <AppIcon name="history" />
              History & insights
            </Link>
            {stage !== "setup" ? <button type="button" className={styles.quietButton} onClick={resetWorkspace} disabled={busy}>Start over</button> : null}
          </div>
        </header>

        <section className={styles.titleRow}>
          <div>
            <p className={styles.eyebrow}>Focused written practice</p>
            <h1 ref={headingRef} tabIndex={-1}>{stage === "feedback" ? "Teacher feedback" : "Answer Workspace"}</h1>
            <p>{stage === "feedback" ? "Review what earned marks and what will lift your next response." : "One question, one answer, one clear path to improvement."}</p>
          </div>
          <ol className={styles.steps} aria-label="Workspace progress">
            <li aria-current={stage === "setup" ? "step" : undefined} data-active={stage === "setup"} data-complete={stage !== "setup"}>1 <span>Setup</span></li>
            <li aria-current={stage === "write" ? "step" : undefined} data-active={stage === "write"} data-complete={stage === "feedback"}>2 <span>Write</span></li>
            <li aria-current={stage === "feedback" ? "step" : undefined} data-active={stage === "feedback"}>3 <span>Feedback</span></li>
          </ol>
        </section>

        {notice ? <div className={styles.notice} role="status"><AppIcon name="check" />{notice}</div> : null}
        {error ? <div className={styles.error} role="alert"><AppIcon name="x" />{error}</div> : null}
        {busy ? (
          <div className={styles.notice} role="status" aria-live="polite">
            <span className={styles.spinner} aria-hidden="true" />
            {stage === "setup" ? "Preparing your question. Your selected settings are held while it loads." : "Evaluating your answer. Your submitted response is held while feedback is prepared."}
          </div>
        ) : null}

        {loading ? (
          <section className={styles.statePanel} aria-busy="true" role="status" aria-label="Preparing your workspace">
            <span className={styles.spinner} />
            <h2>Preparing your workspace</h2>
            <p>Restoring your course context and secure session.</p>
          </section>
        ) : null}

        {!loading && stage === "setup" ? (
          <section className={styles.setupGrid} aria-busy={busy}>
            <div className={styles.modePanel}>
              <p className={styles.eyebrow}>Choose a practice path</p>
              <h2>How would you like to practise?</h2>
              <div className={styles.modeChoices} role="group" aria-label="Practice path">
                <button type="button" aria-pressed={mode === "generated"} data-selected={mode === "generated"} disabled={busy} onClick={() => setMode("generated")}>
                  <span><AppIcon name="spark" /></span>
                  <strong>Generated question</strong>
                  <p>Get a syllabus-grounded question without seeing the marking points first.</p>
                  <small>Best for exam simulation</small>
                </button>
                <button type="button" aria-pressed={mode === "custom"} data-selected={mode === "custom"} disabled={busy} onClick={() => setMode("custom")}>
                  <span><AppIcon name="book" /></span>
                  <strong>My own question</strong>
                  <p>Paste a question from class, homework, or a paper and receive teacher-style feedback.</p>
                  <small>Best for targeted review</small>
                </button>
              </div>
            </div>

            <aside className={styles.setupPanel} aria-label="Practice setup">
              <div className={styles.panelHeading}>
                <p className={styles.eyebrow}>Practice setup</p>
                <h2>{mode ? (mode === "generated" ? "Question settings" : "Evaluation settings") : "Select a path to continue"}</h2>
              </div>
              {mode ? (
                <form onSubmit={(event) => {
                  event.preventDefault();
                  if (busy) return;
                  if (mode === "generated") void prepareGeneratedQuestion();
                  else setStage("write");
                }}>
                  <div className={styles.fieldGrid}>
                    <label>
                      <span>Chapter</span>
                      <select value={selectedChapter?.value || chapter} onChange={(event) => {
                        const nextChapter = scopeChapters.find((item) => item.value === event.target.value) || scopeChapters[0];
                        updateRouteScope(nextChapter.value, nextChapter.topics[0]?.value || "");
                      }} disabled={busy || Boolean(planningScope)}>
                        {scopeChapters.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                      </select>
                    </label>
                    <label>
                      <span>Topic</span>
                      <select value={selectedTopic?.value || topic} onChange={(event) => updateRouteScope(selectedChapter.value, event.target.value)} disabled={busy || Boolean(planningScope)}>
                        {(selectedChapter?.topics || []).map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                      </select>
                    </label>
                    <label>
                      <span>Marks</span>
                      <input type="number" min="1" max="30" value={marksFocus} disabled={busy} onChange={(event) => setMarksFocus(event.target.value)} />
                    </label>
                    <label>
                      <span>Question style</span>
                      <select value={questionType} disabled={busy} onChange={(event) => setQuestionType(event.target.value)}>
                        {QUESTION_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                      </select>
                    </label>
                  </div>
                  <div className={styles.scopeSummary}>
                    <span>{classLevel}</span>
                    <span>{activeSubject}</span>
                    <span>{selectedTopic?.label}</span>
                  </div>
                  <button className={styles.primaryButton} type="submit" disabled={busy || !marksFocus || Number(marksFocus) < 1}>
                    {busy ? <span className={styles.buttonSpinner} /> : <AppIcon name={mode === "generated" ? "spark" : "arrowRight"} />}
                    {busy ? "Preparing question..." : mode === "generated" ? "Generate question" : "Open writing canvas"}
                  </button>
                  <p className={styles.privacyNote}>Marking guidance stays hidden until you submit.</p>
                </form>
              ) : (
                <div className={styles.selectionHint}>
                  <AppIcon name="arrowRight" />
                  <p>Choose one practice path. Only that workspace will open.</p>
                </div>
              )}
            </aside>
          </section>
        ) : null}

        {!loading && stage === "write" && mode ? (
          <section className={styles.writingCanvas} aria-busy={busy}>
            <div className={styles.questionColumn}>
              <div className={styles.questionMeta}>
                <span>{formatLabel(questionType)}</span>
                <span>{marksFocus} marks</span>
                <span>{selectedTopic?.label}</span>
              </div>
              {mode === "generated" && question ? (
                <>
                  <p className={styles.eyebrow}>Question</p>
                  <h2>{question.question_text}</h2>
                  <p className={styles.commandWord}>Command word: <strong>{formatLabel(question.command_word)}</strong></p>
                </>
              ) : (
                <label className={styles.questionInput}>
                  <span>Your question</span>
                  <textarea value={customQuestion} disabled={busy} onChange={(event) => setCustomQuestion(event.target.value)} rows={5} placeholder="Paste the exact question you want evaluated." autoFocus />
                </label>
              )}
              <div className={styles.integrityNote}>
                <AppIcon name="mission" />
                <p><strong>Exam conditions</strong><span>The rubric and model answer appear only after submission.</span></p>
              </div>
            </div>

            <div className={styles.editorColumn}>
              <div className={styles.editorHeading}>
                <div>
                  <p className={styles.eyebrow}>Your response</p>
                  <h2>Write a complete answer</h2>
                </div>
                <span>{wordCount(mode === "generated" ? answer : customAnswer)} words</span>
              </div>
              <label className={styles.answerEditor}>
                <span className="sr-only">Answer</span>
                <textarea
                  value={mode === "generated" ? answer : customAnswer}
                  disabled={busy}
                  onChange={(event) => mode === "generated" ? setAnswer(event.target.value) : setCustomAnswer(event.target.value)}
                  rows={14}
                  placeholder="Build your answer clearly. Use key terms, explain each step, and finish the argument."
                  autoFocus={mode === "generated"}
                />
              </label>
              <footer className={styles.editorFooter}>
                <p><AppIcon name="check" />Draft is saved on this device.</p>
                <button className={styles.primaryButton} type="button" onClick={() => void evaluateAnswer()} disabled={busy || (mode === "generated" ? !answer.trim() : !customQuestion.trim() || !customAnswer.trim())}>
                  {busy ? <span className={styles.buttonSpinner} /> : <AppIcon name="send" />}
                  {busy ? "Evaluating answer..." : "Submit for evaluation"}
                </button>
              </footer>
            </div>
          </section>
        ) : null}

        {!loading && stage === "feedback" && feedback ? (
          <section className={styles.feedbackStage}>
            <WrittenFeedbackView feedback={feedback} />
            <footer className={styles.feedbackActions}>
              <Link className={styles.secondaryButton} href={`/dashboard/exam/workspace/history?${scopeQuery}`}>
                <AppIcon name="history" />View history & insights
              </Link>
              <button className={styles.primaryButton} type="button" onClick={practiceAgain}>
                <AppIcon name="arrowRight" />Practise another answer
              </button>
            </footer>
          </section>
        ) : null}
      </div>
    </div>
  );
}
