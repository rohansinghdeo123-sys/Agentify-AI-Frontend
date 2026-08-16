"use client";

import { AppIcon } from "@/components/ui/Polished";
import { findCatalogTopic } from "@/lib/catalog";
import { BUCKET_LABELS } from "@/lib/revision";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import {
  formatPlanningLabel,
  GOAL_OPTIONS,
  KNOWLEDGE_OPTIONS,
  PREREQUISITE_OPTIONS,
  STYLE_OPTIONS,
  type PlanningProfile,
} from "./contracts";
import { usePlanningExperience } from "./PlanningExperience";
import { PlanningLoading, PlanningScreen, planningStyles as styles } from "./PlanningScreen";
import { PLANNING_ROUTES } from "./routes";

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: ReadonlyArray<{ label: string; value: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <label>
      <span className={styles.fieldLabel}>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className={styles.field}>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}

export default function PlanningBuilder() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const appliedQueryRef = useRef(false);
  const requestRef = useRef<AbortController | null>(null);
  const {
    authBusy,
    hydrated,
    userId,
    draft,
    chapters,
    catalogSource,
    catalogSettled,
    selectedChapter,
    selectedTopic,
    radar,
    radarState,
    generating,
    error,
    staleNotice,
    setScope,
    setChapter,
    setTopic,
    updateProfile,
    applyRadarTopic,
    createPlan,
  } = usePlanningExperience();

  useEffect(() => {
    if (appliedQueryRef.current || !hydrated || !catalogSettled || !chapters.length) return;
    appliedQueryRef.current = true;
    const requestedTopic = searchParams.get("topic") || "";
    const requestedChapter = searchParams.get("chapter") || "";
    const chapter = chapters.find((item) => item.value === requestedChapter)
      || chapters.find((item) => findCatalogTopic(item, requestedTopic));
    const topic = findCatalogTopic(chapter, requestedTopic) || chapter?.topics[0];
    if (chapter && topic) setScope(chapter.value, topic.value);
  }, [catalogSettled, chapters, hydrated, searchParams, setScope]);

  useEffect(() => () => requestRef.current?.abort(), []);

  if (authBusy || !hydrated) return <PlanningLoading label="Preparing your plan builder..." />;

  const changeProfile = (key: keyof PlanningProfile) => (value: string) => (
    updateProfile(key, value as PlanningProfile[keyof PlanningProfile])
  );

  const buildPlan = async () => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    const plan = await createPlan(controller.signal);
    if (plan && !controller.signal.aborted) router.push(PLANNING_ROUTES.active);
  };

  return (
    <PlanningScreen
      eyebrow="Planning Lab / Builder"
      title="Select. Generate. Start learning."
      intro="Choose one syllabus topic and how you want to approach it. AgentifyAI will group the learning into a focused route and estimate the duration for you."
      backHref={PLANNING_ROUTES.home}
    >
      {staleNotice ? <div className={styles.notice} role="status">{staleNotice}</div> : null}
      {error ? <div className={styles.alert} role="alert">{error}</div> : null}

      <div className={styles.builderLayout}>
        <section className={styles.builderPanel} aria-labelledby="builder-heading">
          <p className={styles.eyebrow}>Plan setup</p>
          <h2 id="builder-heading">The inputs that shape this route</h2>
          <div className={styles.builderSections}>
            <div className={styles.builderSection}>
              <div className={styles.builderSectionTitle}>
                <span>01</span>
                <div><strong>Choose the target</strong><small>One chapter and one topic only.</small></div>
              </div>
              <div className={styles.formGrid}>
                <label>
                  <span className={styles.fieldLabel}>Chapter</span>
                  <select value={draft.chapter} onChange={(event) => setChapter(event.target.value)} className={styles.field}>
                    {chapters.map((chapter) => <option key={chapter.value} value={chapter.value}>{chapter.label}</option>)}
                  </select>
                </label>
                <label>
                  <span className={styles.fieldLabel}>Topic</span>
                  <select value={draft.topic} onChange={(event) => setTopic(event.target.value)} className={styles.field}>
                    {(selectedChapter?.topics || []).map((topic) => <option key={topic.value} value={topic.value}>{topic.label}</option>)}
                  </select>
                </label>
              </div>
              <div className={styles.sourceNotice}>
                <strong>{catalogSource === "published" ? "Published syllabus target" : "Starter catalog target"}</strong>
                <span>
                  {catalogSettled
                    ? catalogSource === "published"
                      ? `${selectedChapter?.subject || "Subject"}${selectedChapter?.classLevel ? ` · ${selectedChapter.classLevel}` : ""}`
                      : "The published catalog was not available. This source is labelled so it is never mistaken for verified syllabus data."
                    : "Checking the published catalog…"}
                </span>
              </div>
            </div>

            <div className={styles.builderSection}>
              <div className={styles.builderSectionTitle}>
                <span>02</span>
                <div><strong>Choose your learning approach</strong><small>Four quick choices help shape the route.</small></div>
              </div>
              <div className={styles.formGrid}>
                <SelectField label="Current knowledge" value={draft.profile.currentKnowledge} options={KNOWLEDGE_OPTIONS} onChange={changeProfile("currentKnowledge")} />
                <SelectField label="Plan goal" value={draft.profile.learningGoal} options={GOAL_OPTIONS} onChange={changeProfile("learningGoal")} />
                <SelectField label="Preferred style" value={draft.profile.preferredStyle} options={STYLE_OPTIONS} onChange={changeProfile("preferredStyle")} />
                <SelectField label="Prerequisite confidence" value={draft.profile.prerequisiteConfidence} options={PREREQUISITE_OPTIONS} onChange={changeProfile("prerequisiteConfidence")} />
              </div>
            </div>
          </div>
        </section>

        <aside className={styles.builderAside} aria-label="Plan confirmation">
          <div className={styles.asideBlock}>
            <p className={styles.eyebrow}>Ready to generate</p>
            <h2>{selectedTopic?.label || formatPlanningLabel(draft.topic)}</h2>
            <p>The planner will combine related ideas into a compact route, preserve syllabus coverage, and estimate the learning duration.</p>
            <ol className={styles.planPreview} aria-label="Expected learning route">
              <li><span>01</span><strong>Learn the core ideas</strong></li>
              <li><span>02</span><strong>Apply with focused practice</strong></li>
              <li><span>03</span><strong>Check your understanding</strong></li>
            </ol>
          </div>

          <div className={styles.asideBlock}>
            <p className={styles.eyebrow}>Revision radar</p>
            <h2>Use a due topic instead</h2>
            {radarState === "loading" ? <p className={styles.stateMessage}>Checking revision data…</p> : null}
            {radarState === "unavailable" ? <p className={styles.stateMessage}>Revision data is currently unavailable.</p> : null}
            {radarState === "empty" ? <p className={styles.stateMessage}>No due targets were returned.</p> : null}
            {radar.length ? (
              <div className={styles.radarList}>
                {radar.map((entry) => (
                  <button key={entry.topic} type="button" className={styles.radarButton} onClick={() => applyRadarTopic(entry)}>
                    <span><strong>{formatPlanningLabel(entry.topic)}</strong><small>{entry.reason}</small></span>
                    <span className={styles.modeChip}>{BUCKET_LABELS[entry.bucket]} · {entry.suggested_minutes}m</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          {generating ? (
            <div className={styles.asideBlock} role="status" aria-live="polite">
              <p className={styles.eyebrow}>Building your route</p>
              <div className={styles.buildState}>
                {[
                  "Checking prerequisite signals",
                  "Allocating the study order",
                  "Preparing one checkpoint",
                ].map((step) => <div key={step} className={styles.buildStep}>{step}</div>)}
              </div>
            </div>
          ) : null}

          <button
            type="button"
            className={`${styles.primaryButton} ${styles.builderAction}`}
            disabled={!userId || !catalogSettled || generating}
            onClick={buildPlan}
          >
            <AppIcon name={generating ? "clock" : "mission"} />
            {generating ? "Building your plan…" : "Generate my plan"}
          </button>
        </aside>
      </div>
    </PlanningScreen>
  );
}
