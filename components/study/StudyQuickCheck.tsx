"use client";
import { useRef, useState } from "react";
import { getStudyRouteCheck, recordStudyRouteHeartbeat, type StudyRouteCheck } from "@/features/study/api";
import styles from "./planned-learning.module.css";

type Props = {
  userId: string;
  unitId: string;
  conversationId: string;
  initialAnswers: Record<string, string>;
  getAuthHeaders: () => Promise<HeadersInit>;
  saving: boolean;
  onSubmit: (id: string, answers: Record<string, string>) => Promise<void>;
};
export default function StudyQuickCheck(props: Props) {
  const [check, setCheck] = useState<StudyRouteCheck | null>(null);
  const [answers, setAnswers] = useState(props.initialAnswers);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [syncing, setSyncing] = useState(false);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const load = async () => {
    setLoading(true); setError("");
    try {
      const pack = await getStudyRouteCheck({ headers: await props.getAuthHeaders() }, props.userId);
      if (pack.unit_id !== props.unitId) throw new Error("The route changed. Return to Study Home to continue.");
      setCheck(pack);
    } catch (e) { setError(e instanceof Error ? e.message : "The check could not be loaded. Try again."); }
    finally { setLoading(false); }
  };
  const choose = async (questionId: string, value: string) => {
    const next = { ...answers, [questionId]: value };
    setAnswers(next);
    setSyncing(true);
    const pending = saveQueue.current.catch(() => undefined).then(async () => {
      await recordStudyRouteHeartbeat({ headers: await props.getAuthHeaders() }, props.userId,
        { unit_id: props.unitId, conversation_id: props.conversationId, check_answers: next });
      setError("");
    }).catch(() => {
      setError("Answers are on this page but could not be synced. Submit or retry before leaving.");
    }).finally(() => { if (saveQueue.current === pending) setSyncing(false); });
    saveQueue.current = pending;
    await pending;
  };
  return <section className={`${styles.context} ${styles.check}`} aria-label="Quick check">
    <h3>Quick check</h3>
    <p>Your answers update mastery and the next learning recommendation.</p>
    {error ? <p role="alert">{error}</p> : null}
    {!check ? <button disabled={loading} onClick={() => void load()}>{loading ? "Preparing check..." : "Start / resume quick check"}</button> : <>
      {check.questions.map((q, index) => <fieldset key={q.id} disabled={props.saving}>
        <legend>{index + 1}. {q.question}</legend>
        {q.options.map((option) => <label key={option}>
          <input type="radio" name={`check-${q.id}`} checked={answers[q.id] === option[0]}
            onChange={() => void choose(q.id, option[0])} /> {option}
        </label>)}
      </fieldset>)}
      <button disabled={syncing || props.saving || check.questions.some((q) => !answers[q.id])}
        onClick={() => void props.onSubmit(check.id, answers)}>{props.saving ? "Saving..." : "Check answers and update plan"}</button>
    </>}
  </section>;
}
