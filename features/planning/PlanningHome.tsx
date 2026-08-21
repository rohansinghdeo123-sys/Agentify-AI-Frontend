"use client";

import { AppIcon } from "@/components/ui/Polished";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { usePlanningExperience } from "./PlanningExperience";
import { PlanningLoading, PlanningScreen, planningStyles as styles } from "./PlanningScreen";
import { PLANNING_ROUTES } from "./routes";

function Selector({
  id,
  number,
  label,
  helper,
  value,
  placeholder,
  options,
  disabled,
  onChange,
}: {
  id: string;
  number: string;
  label: string;
  helper: string;
  value: string;
  placeholder: string;
  options: Array<{ label: string; value: string }>;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const helpId = `${id}-help`;
  return (
    <label className={styles.selectionField} htmlFor={id} data-disabled={disabled ? "true" : "false"}>
      <span className={styles.selectionNumber} aria-hidden="true">{number}</span>
      <span className={styles.selectionCopy}>
        <strong>{label}</strong>
        <small id={helpId}>{helper}</small>
      </span>
      <select
        id={id}
        className={styles.selectionControl}
        value={value}
        disabled={disabled}
        required
        aria-describedby={helpId}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="" disabled>{placeholder}</option>
        {options.map((option) => (
          <option key={`${option.value}-${option.label}`} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  );
}

export default function PlanningHome() {
  const router = useRouter();
  const requestRef = useRef<AbortController | null>(null);
  const {
    authBusy,
    hydrated,
    userId,
    draft,
    classOptions,
    subjectOptions,
    chapters,
    catalogSettled,
    catalogNotice,
    selectedChapter,
    generating,
    error,
    setClassLevel,
    setSubject,
    setChapter,
    retryCatalog,
    createPlan,
    clearError,
  } = usePlanningExperience();

  useEffect(() => () => requestRef.current?.abort(), []);

  if (authBusy || !hydrated) return <PlanningLoading label="Opening Planning..." />;

  const classSelected = classOptions.some((option) => option.value === draft.classLevel);
  const subjectSelected = subjectOptions.some((option) => option.value === draft.subject);
  const canGenerate = Boolean(
    userId
    && catalogSettled
    && classSelected
    && subjectSelected
    && selectedChapter
    && !generating,
  );

  const buildPlan = async () => {
    if (!canGenerate) return;
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    const plan = await createPlan(controller.signal);
    if (plan && !controller.signal.aborted) router.push(PLANNING_ROUTES.active);
  };

  return (
    <PlanningScreen
      eyebrow="Planning Lab"
      title="Find your chapter focus."
      intro="Choose your class, subject, and chapter. AgentifyAI will show what deserves attention and the shortest clear way through it."
    >
      <div className={styles.selectionStage}>
        <form
          className={styles.selectionCard}
          aria-labelledby="planning-selection-heading"
          aria-busy={!catalogSettled || generating}
          onSubmit={(event) => {
            event.preventDefault();
            void buildPlan();
          }}
        >
          <h2 id="planning-selection-heading" className={styles.srOnly}>Choose class, subject, and chapter</h2>

          {!catalogSettled ? (
            <div className={styles.catalogState} role="status" aria-live="polite">
              <span className={styles.inlineSpinner} aria-hidden="true" />
              Loading your syllabus…
            </div>
          ) : catalogNotice && !classOptions.length ? (
            <div className={styles.catalogError} role="alert">
              <span>{catalogNotice}</span>
              <button type="button" className={styles.retryButton} onClick={retryCatalog}>Try again</button>
            </div>
          ) : null}

          <fieldset
            className={styles.selectionStack}
            disabled={!catalogSettled || generating || Boolean(catalogNotice && !classOptions.length)}
            aria-busy={!catalogSettled || generating}
          >
            <legend className={styles.srOnly}>Choose class, subject, and chapter</legend>
            <Selector
              id="planning-class"
              number="01"
              label="Class"
              helper="Start with your school class."
              value={classSelected ? draft.classLevel : ""}
              placeholder="Choose class"
              options={classOptions}
              disabled={!catalogSettled || generating || !classOptions.length}
              onChange={(value) => {
                clearError();
                setClassLevel(value);
              }}
            />
            <Selector
              id="planning-subject"
              number="02"
              label="Subject"
              helper="Now choose the subject."
              value={subjectSelected ? draft.subject : ""}
              placeholder="Choose subject"
              options={subjectOptions}
              disabled={!catalogSettled || !classSelected || generating}
              onChange={(value) => {
                clearError();
                setSubject(value);
              }}
            />
            <Selector
              id="planning-chapter"
              number="03"
              label="Chapter"
              helper="Pick one chapter to get its focus map."
              value={selectedChapter?.value || ""}
              placeholder="Choose chapter"
              options={chapters.map((chapter) => ({ label: chapter.label, value: chapter.value }))}
              disabled={!catalogSettled || !subjectSelected || generating}
              onChange={(value) => {
                clearError();
                setChapter(value);
              }}
            />
          </fieldset>

          {error ? <div className={styles.catalogError} role="alert">{error}</div> : null}

          <button type="submit" className={`${styles.primaryButton} ${styles.generateFocusButton}`} disabled={!canGenerate}>
            <AppIcon name={generating ? "clock" : "spark"} />
            {generating ? "Finding the chapter focus…" : "Show my focus plan"}
            {!generating ? <AppIcon name="arrowRight" /> : null}
          </button>
          <p className={styles.generateHint} aria-live="polite">
            {generating
              ? "Reading the selected chapter and prioritising its learning units."
              : selectedChapter
                ? `Ready for ${selectedChapter.label}.`
                : "Choose all three fields to continue."}
          </p>
        </form>
      </div>
    </PlanningScreen>
  );
}
