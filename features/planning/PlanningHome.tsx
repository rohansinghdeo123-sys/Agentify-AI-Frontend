"use client";

import { AppIcon } from "@/components/ui/Polished";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef } from "react";
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
    selectedChapters,
    generating,
    error,
    setClassLevel,
    setSubject,
    setChapterSelected,
    setChapterProficiency,
    setStudyTimeToday,
    retryCatalog,
    createPortfolio,
    clearError,
  } = usePlanningExperience();

  useEffect(() => () => requestRef.current?.abort(), []);

  const classSelected = classOptions.some((option) => option.value === draft.classLevel);
  const subjectSelected = subjectOptions.some((option) => option.value === draft.subject);
  const allProficienciesReady = selectedChapters.length > 0 && selectedChapters.every((chapter) => (
    draft.chapterChoices.some((choice) => choice.chapter === chapter.value && Boolean(choice.chapterProficiency))
  ));
  const canGenerate = Boolean(
    userId
    && catalogSettled
    && classSelected
    && subjectSelected
    && allProficienciesReady
    && !generating,
  );
  const selectedLabel = useMemo(() => {
    if (!selectedChapters.length) return "";
    if (selectedChapters.length === 1) return selectedChapters[0].label;
    return `${selectedChapters.length} chapters`;
  }, [selectedChapters]);

  if (authBusy || !hydrated) {
    return <PlanningLoading label="Preparing your Planning Lab…" />;
  }

  const buildPlan = async () => {
    if (!canGenerate) return;
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    const portfolio = await createPortfolio(controller.signal);
    if (portfolio && !controller.signal.aborted) router.push(PLANNING_ROUTES.active);
  };

  return (
    <PlanningScreen
      eyebrow="Planning Lab · Multi-chapter"
      title="Build one clear route across your chapters."
      intro="Choose the chapters you need. AgentifyAI preserves each NCERT roadmap, uses a separate proficiency for every chapter, and recommends one achievable next step."
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
            Choose class, subject, chapters, proficiency for each chapter, and optionally today’s study time
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
            <legend className={styles.srOnly}>Choose class and subject</legend>
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
          </fieldset>

          {subjectSelected ? (
            <fieldset className={styles.chapterPicker} disabled={generating || !catalogSettled}>
              <legend>
                <span className={styles.proficiencyNumber} aria-hidden="true">03</span>
                <span>
                  <strong>Which chapters do you want to plan?</strong>
                  <small>Choose one or more. Their NCERT roadmaps remain separate.</small>
                </span>
                {selectedChapters.length ? <em>{selectedChapters.length} selected</em> : null}
              </legend>
              <div className={styles.chapterOptions} role="group" aria-label="Select chapters">
                {chapters.map((chapter, index) => {
                  const selected = selectedChapters.some((item) => item.value === chapter.value);
                  return (
                    <label key={chapter.value} className={styles.chapterOption} data-selected={selected || undefined}>
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={(event) => {
                          clearError();
                          setChapterSelected(chapter.value, event.target.checked);
                        }}
                      />
                      <span className={styles.chapterOrder}>{String(chapter.order ?? index + 1).padStart(2, "0")}</span>
                      <span>
                        <strong>{chapter.label}</strong>
                        <small>{selected ? "Included in this roadmap" : "Add this chapter"}</small>
                      </span>
                      <span className={styles.chapterCheck} aria-hidden="true"><AppIcon name={selected ? "check" : "plus"} /></span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          ) : null}

          {selectedChapters.length ? (
            <fieldset
              className={styles.proficiencyField}
              disabled={generating}
              aria-describedby="planning-proficiency-help"
            >
              <legend>
                <span className={styles.proficiencyNumber} aria-hidden="true">04</span>
                <span>
                  <strong>
                    {selectedChapters.length === 1
                      ? "How well do you know this chapter?"
                      : "How well do you know each chapter?"}
                  </strong>
                  <small id="planning-proficiency-help">This helps Agentify personalize every route independently.</small>
                </span>
              </legend>
              <div className={styles.chapterProficiencyList}>
                {selectedChapters.map((chapter) => {
                  const choice = draft.chapterChoices.find((item) => item.chapter === chapter.value);
                  const selectedOption = PLANNING_PROFICIENCY_OPTIONS.find((option) => option.value === choice?.chapterProficiency);
                  return (
                    <label key={chapter.value} className={styles.chapterProficiencyRow}>
                      <span>
                        <strong>{chapter.label}</strong>
                        <small>{selectedOption?.description || "Choose the closest starting point."}</small>
                      </span>
                      <select
                        value={choice?.chapterProficiency || ""}
                        required
                        aria-label={`How well do you know ${chapter.label}?`}
                        onChange={(event) => {
                          clearError();
                          setChapterProficiency(chapter.value, event.target.value as (typeof PLANNING_PROFICIENCY_OPTIONS)[number]["value"]);
                        }}
                      >
                        <option value="" disabled>Choose proficiency</option>
                        {PLANNING_PROFICIENCY_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          ) : null}

          {selectedChapters.length ? (
            <fieldset
              className={styles.todayTimeField}
              disabled={generating}
              aria-describedby="planning-time-help"
            >
              <legend>
                <span className={styles.timeLegendIcon} aria-hidden="true">05</span>
                <span>
                  <strong>How much time would you like to study today?</strong>
                  <small id="planning-time-help">Optional. One total ceiling across all selected chapters—not time repeated for each chapter.</small>
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
              ? "Comparing eligible NCERT steps and choosing one achievable next action."
              : allProficienciesReady
                ? `Ready to personalize ${selectedLabel}.`
                : selectedChapters.length
                  ? "Choose a proficiency for every selected chapter to continue."
                  : "Choose at least one chapter to continue."}
          </p>
        </form>
      </div>
    </PlanningScreen>
  );
}
