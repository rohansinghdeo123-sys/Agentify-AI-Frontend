"use client";

import { AppIcon } from "@/components/ui/Polished";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import {
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
  disabled = false,
}: {
  label: string;
  value: string;
  options: ReadonlyArray<{ label: string; value: string }>;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <label>
      <span className={styles.fieldLabel}>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className={styles.field} disabled={disabled}>
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
    generating,
    error,
    staleNotice,
    setChapter,
    updateProfile,
    createPlan,
  } = usePlanningExperience();

  useEffect(() => {
    if (appliedQueryRef.current || !hydrated || !catalogSettled || !chapters.length) return;
    appliedQueryRef.current = true;
    const requestedChapter = searchParams.get("chapter") || "";
    const chapter = chapters.find((item) => item.value === requestedChapter);
    if (chapter) setChapter(chapter.value);
  }, [catalogSettled, chapters, hydrated, searchParams, setChapter]);

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
      title="Choose a chapter. Get a clear plan."
      intro="Pick the chapter you want to finish. AgentifyAI will arrange it into comfortable learning steps, from the first idea to the final chapter check."
      backHref={PLANNING_ROUTES.home}
    >
      {staleNotice ? <div className={styles.notice} role="status">{staleNotice}</div> : null}
      {error ? <div className={styles.alert} role="alert">{error}</div> : null}

      <div className={styles.builderLayout}>
        <section className={styles.builderPanel} aria-labelledby="builder-heading">
          <p className={styles.eyebrow}>Plan setup</p>
          <h2 id="builder-heading">One choice is enough to begin</h2>
          <div className={styles.builderSections}>
            <div className={styles.builderSection}>
              <div className={styles.builderSectionTitle}>
                <span>01</span>
                <div><strong>Choose your chapter</strong><small>Your plan will cover the complete chapter in a clear order.</small></div>
              </div>
              <div className={styles.chapterField}>
                <label>
                  <span className={styles.fieldLabel}>Chapter</span>
                  <select value={draft.chapter} onChange={(event) => setChapter(event.target.value)} className={styles.field} disabled={generating}>
                    {chapters.map((chapter) => <option key={chapter.value} value={chapter.value}>{chapter.label}</option>)}
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

            <details
              className={styles.personalisePanel}
              aria-disabled={generating}
              onClick={(event) => {
                if (generating) event.preventDefault();
              }}
              onKeyDown={(event) => {
                if (generating && (event.key === "Enter" || event.key === " ")) event.preventDefault();
              }}
            >
              <summary>
                <span><strong>Personalise my plan</strong><small>Optional — the defaults already work well for most students.</small></span>
                <span aria-hidden="true">+</span>
              </summary>
              <div className={styles.formGrid}>
                <SelectField label="What I know now" value={draft.profile.currentKnowledge} options={KNOWLEDGE_OPTIONS} onChange={changeProfile("currentKnowledge")} disabled={generating} />
                <SelectField label="My goal" value={draft.profile.learningGoal} options={GOAL_OPTIONS} onChange={changeProfile("learningGoal")} disabled={generating} />
                <SelectField label="How I learn best" value={draft.profile.preferredStyle} options={STYLE_OPTIONS} onChange={changeProfile("preferredStyle")} disabled={generating} />
                <SelectField label="Basics confidence" value={draft.profile.prerequisiteConfidence} options={PREREQUISITE_OPTIONS} onChange={changeProfile("prerequisiteConfidence")} disabled={generating} />
              </div>
            </details>
          </div>
        </section>

        <aside className={styles.builderAside} aria-label="Plan confirmation">
          <div className={styles.asideBlock}>
            <p className={styles.eyebrow}>Ready to generate</p>
            <h2>{selectedChapter?.label || "Your chapter"}</h2>
            <p>You will receive a complete, ordered roadmap. Every step stays together in Planning so it is always easy to continue.</p>
            <ol className={styles.planPreview} aria-label="Expected chapter route">
              <li><span>01</span><strong>Start with the foundations</strong></li>
              <li><span>02</span><strong>Build the chapter step by step</strong></li>
              <li><span>03</span><strong>Finish with one chapter check</strong></li>
            </ol>
          </div>

          {generating ? (
            <div className={styles.asideBlock} role="status" aria-live="polite">
              <p className={styles.eyebrow}>Building your route</p>
              <div className={styles.buildState}>
                {[
                  "Reading the complete chapter",
                  "Arranging comfortable learning steps",
                  "Preparing the final chapter check",
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
