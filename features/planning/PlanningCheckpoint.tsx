"use client";

import { AppIcon } from "@/components/ui/Polished";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { CONFIDENCE_OPTIONS, getMissionQuestion } from "./contracts";
import { usePlanningExperience } from "./PlanningExperience";
import { PlanningLoading, PlanningScreen, planningStyles as styles } from "./PlanningScreen";
import { PLANNING_ROUTES } from "./routes";

export default function PlanningCheckpoint() {
  const {
    authBusy,
    hydrated,
    activePlan,
    savingCheckpoint,
    error,
    submitCheckpoint,
  } = usePlanningExperience();
  const [answer, setAnswer] = useState("");
  const [confidence, setConfidence] = useState("medium");
  const [hintOpen, setHintOpen] = useState(false);
  const [hintCount, setHintCount] = useState(0);
  const [retryCount, setRetryCount] = useState(0);
  const startedAtRef = useRef<string | null>(null);
  const firstAnswerAtRef = useRef<string | null>(null);
  const lastAnswerRef = useRef("");
  const requestRef = useRef<AbortController | null>(null);

  useEffect(() => () => requestRef.current?.abort(), []);

  if (authBusy || !hydrated) return <PlanningLoading label="Preparing your checkpoint..." />;

  if (!activePlan) {
    return (
      <PlanningScreen
        eyebrow="Planning Lab / Checkpoint"
        title="Build a plan before checking it."
        intro="The chapter check belongs to one saved plan, so Planning will not guess which chapter you meant."
        backHref={PLANNING_ROUTES.home}
      >
        <div className={styles.checkpointWrap}>
          <section className={styles.emptyCard}>
            <h2>No active plan found.</h2>
            <p>Start in the Builder or restore a device snapshot from History.</p>
            <div className={styles.emptyActions}>
              <Link href={PLANNING_ROUTES.new} className={styles.primaryButton}>Build a plan</Link>
              <Link href={PLANNING_ROUTES.history} className={styles.secondaryButton}>Open device history</Link>
            </div>
          </section>
        </div>
      </PlanningScreen>
    );
  }

  const question = getMissionQuestion(activePlan.mission);
  const result = activePlan.checkpoint;
  const selectedAnswer = result?.answer || answer;
  const selectedConfidence = result?.confidence || confidence;
  if (!question) {
    return (
      <PlanningScreen
        eyebrow="Planning Lab / Checkpoint"
        title="This plan has no chapter check."
        intro="The planning service did not return a chapter question. Continue with the roadmap or rebuild the plan."
        backHref={PLANNING_ROUTES.active}
        backLabel="Active plan"
      >
        <div className={styles.checkpointWrap}>
          <section className={styles.emptyCard}>
            <h2>No question was returned.</h2>
            <p>Your active route remains available and has not been marked complete.</p>
            <div className={styles.emptyActions}>
              <Link href={PLANNING_ROUTES.active} className={styles.primaryButton}>Return to plan</Link>
              <Link href={PLANNING_ROUTES.new} className={styles.secondaryButton}>Rebuild</Link>
            </div>
          </section>
        </div>
      </PlanningScreen>
    );
  }

  const selectAnswer = (option: string) => {
    if (result) return;
    if (!firstAnswerAtRef.current) {
      const firstAnswerAt = new Date().toISOString();
      firstAnswerAtRef.current = firstAnswerAt;
      startedAtRef.current = firstAnswerAt;
    }
    if (lastAnswerRef.current && lastAnswerRef.current !== option) setRetryCount((current) => current + 1);
    lastAnswerRef.current = option;
    setAnswer(option);
  };

  const revealHint = () => {
    if (result || hintOpen) return;
    setHintOpen(true);
    setHintCount((current) => current + 1);
  };

  const saveAnswer = async () => {
    if (!selectedAnswer || result || savingCheckpoint) return;
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    await submitCheckpoint({
      answer: selectedAnswer,
      confidence: selectedConfidence,
      hintCount,
      retryCount,
      startedAt: startedAtRef.current || new Date().toISOString(),
      firstAnswerAt: firstAnswerAtRef.current,
    }, controller.signal);
  };

  const hint = `Think about the central ideas in ${activePlan.scope.chapterLabel} before comparing the options.`;

  return (
    <PlanningScreen
      eyebrow="Planning Lab / Diagnostic checkpoint"
      title={`Check your understanding of ${activePlan.scope.chapterLabel}.`}
      intro="One chapter question, one confidence signal, and one confirmed save. Everything stays inside your Planning workspace."
      backHref={PLANNING_ROUTES.active}
      backLabel="Active plan"
      actions={result ? (
        <Link href={PLANNING_ROUTES.review} className={styles.primaryButton}>
          Open review
          <AppIcon name="arrowRight" />
        </Link>
      ) : undefined}
    >
      {error ? <div className={styles.alert} role="alert">{error}</div> : null}
      <div className={styles.checkpointWrap}>
        <section className={styles.checkpointCard} aria-labelledby="checkpoint-question">
          <div className={styles.sectionHeader}>
            <div>
              <p className={styles.eyebrow}>One chapter check</p>
              <h2>{activePlan.scope.chapterLabel}</h2>
            </div>
            <span className={styles.statusChip}>{result ? "Recorded" : "Not submitted"}</span>
          </div>
          <h3 id="checkpoint-question" className={styles.checkpointQuestion}>{question.question}</h3>

          <fieldset className={styles.fieldset} disabled={Boolean(result)}>
            <legend>Choose one answer</legend>
            <div className={styles.optionGrid}>
              {question.options.map((option) => {
                const outcome = result
                  ? option === question.correct
                    ? "correct"
                    : option === result.answer && !result.correct
                      ? "wrong"
                      : undefined
                  : undefined;
                return (
                  <label
                    key={option}
                    className={styles.optionLabel}
                    data-selected={selectedAnswer === option ? "true" : "false"}
                    data-result={outcome}
                  >
                    <input
                      type="radio"
                      name="planning-answer"
                      value={option}
                      checked={selectedAnswer === option}
                      onChange={() => selectAnswer(option)}
                    />
                    <span>{option}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          <fieldset className={styles.fieldset} disabled={Boolean(result)}>
            <legend>Your confidence before checking</legend>
            <div className={styles.confidenceRow}>
              {CONFIDENCE_OPTIONS.map((option) => (
                <label key={option.value} className={styles.confidenceLabel} data-selected={selectedConfidence === option.value ? "true" : "false"}>
                  <input
                    type="radio"
                    name="planning-confidence"
                    value={option.value}
                    checked={selectedConfidence === option.value}
                    onChange={() => setConfidence(option.value)}
                  />
                  <span>{option.label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className={styles.hintRow}>
            <button type="button" className={styles.quietButton} disabled={Boolean(result) || hintOpen} onClick={revealHint}>
              <AppIcon name="spark" />
              {hintOpen ? "Hint used" : "Use one hint"}
            </button>
            {hintOpen ? <p className={styles.hintCopy} role="status">{hint}</p> : null}
          </div>

          {!result ? (
            <button
              type="button"
              className={`${styles.primaryButton} ${styles.checkpointAction}`}
              disabled={!selectedAnswer || savingCheckpoint}
              onClick={saveAnswer}
            >
              <AppIcon name={savingCheckpoint ? "clock" : "send"} />
              {savingCheckpoint ? "Recording checkpoint…" : "Check and record answer"}
            </button>
          ) : (
            <div className={styles.checkpointResult} data-correct={result.correct ? "true" : "false"} role="status" aria-live="polite">
              <strong>{result.correct ? "Correct — checkpoint recorded." : "Gap detected — checkpoint recorded."}</strong>
              <p>{result.report.summary}</p>
            </div>
          )}

          {result && question.explanation ? <p className={styles.explanation}>{question.explanation}</p> : null}
        </section>
      </div>
    </PlanningScreen>
  );
}
