"use client";

import { AppIcon } from "@/components/ui/Polished";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { PLANNING_PROFICIENCY_OPTIONS, PLANNING_STUDY_TIME_OPTIONS } from "./contracts";
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
    setChapterProficiency,
    setStudyTimeToday,
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
    && draft.chapterProficiency
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
      title="Know exactly what to learn next."
      intro="Choose one chapter. AgentifyAI will keep the NCERT order, make the next step clear, and fit today’s route around you."
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
          <h2 id="planning-selection-heading" className={styles.srOnly}>
            Choose class, subject, chapter, chapter proficiency, and optionally today’s study time
          </h2>

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
              helper="Pick one chapter to get its learning roadmap."
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

          {selectedChapter ? (
            <fieldset
              className={styles.proficiencyField}
              disabled={generating}
              aria-describedby="planning-proficiency-help"
            >
              <legend>
                <span className={styles.proficiencyNumber} aria-hidden="true">04</span>
                <span>
                  <strong>How well do you know this chapter?</strong>
                  <small id="planning-proficiency-help">This helps Agentify personalize your route.</small>
                </span>
              </legend>
              <div className={styles.proficiencyOptions} role="radiogroup" aria-label="Chapter proficiency">
                {PLANNING_PROFICIENCY_OPTIONS.map((option) => {
                  const selected = draft.chapterProficiency === option.value;
                  const descriptionId = `planning-proficiency-${option.value}-description`;
                  return (
                    <label
                      key={option.value}
                      className={styles.proficiencyOption}
                      data-selected={selected || undefined}
                    >
                      <input
                        type="radio"
                        name="chapter-proficiency"
                        value={option.value}
                        checked={selected}
                        required
                        aria-describedby={descriptionId}
                        onChange={() => {
                          clearError();
                          setChapterProficiency(option.value);
                        }}
                      />
                      <span className={styles.proficiencyCopy}>
                        <strong>{option.label}</strong>
                        <small id={descriptionId}>
                          {option.description}
                        </small>
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          ) : null}

          {selectedChapter ? (
            <fieldset
              className={styles.todayTimeField}
              disabled={generating}
              aria-describedby="planning-time-help"
            >
              <legend>
                <span className={styles.timeLegendIcon} aria-hidden="true">05</span>
                <span>
                  <strong>How much time would you like to study today?</strong>
                  <small id="planning-time-help">Optional. This shapes today’s route, not a deadline for the chapter.</small>
                </span>
              </legend>
              <div className={styles.timeOptions} role="group" aria-label="Study time today">
                {PLANNING_STUDY_TIME_OPTIONS.map((option) => {
                  const selected = draft.studyTimeToday === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      className={styles.timeOption}
                      aria-pressed={selected}
                      onClick={() => {
                        clearError();
                        setStudyTimeToday(selected ? "" : option.value);
                      }}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          ) : null}

          {error ? <div className={styles.catalogError} role="alert">{error}</div> : null}

          <button type="submit" className={`${styles.primaryButton} ${styles.generateFocusButton}`} disabled={!canGenerate}>
            <AppIcon name={generating ? "clock" : "spark"} />
            {generating ? "Building your learning roadmap…" : "Build My Roadmap"}
            {!generating ? <AppIcon name="arrowRight" /> : null}
          </button>
          <p className={styles.generateHint} aria-live="polite">
            {generating
              ? "Reading the selected chapter and preserving its NCERT learning order."
              : selectedChapter && draft.chapterProficiency
                ? `Ready to personalize ${selectedChapter.label}.`
                : selectedChapter
                  ? "Choose how well you know this chapter to continue."
                : "Choose all three fields to continue."}
          </p>
        </form>
      </div>
    </PlanningScreen>
  );
}
