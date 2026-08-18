"use client";

import { AppIcon } from "@/components/ui/Polished";
import Link from "next/link";
import { useState } from "react";
import {
  getEstimatedPlanMinutes,
  getMissionPlan,
  getMissionQuestion,
} from "./contracts";
import { usePlanningExperience } from "./PlanningExperience";
import { PlanningLoading, PlanningScreen, planningStyles as styles } from "./PlanningScreen";
import { PLANNING_ROUTES } from "./routes";

export default function PlanningActive() {
  const { authBusy, hydrated, activePlan, staleNotice, togglePlanStep } = usePlanningExperience();
  const [openStep, setOpenStep] = useState<number | null>(null);

  if (authBusy || !hydrated) return <PlanningLoading label="Opening your chapter plan..." />;

  if (!activePlan) {
    return (
      <PlanningScreen
        eyebrow="Planning Lab / Active plan"
        title="No active chapter plan on this device."
        intro="Choose a chapter to create a calm, step-by-step route from the foundations to the final check."
        backHref={PLANNING_ROUTES.home}
      >
        {staleNotice ? <div className={styles.notice} role="status">{staleNotice}</div> : null}
        <div className={styles.checkpointWrap}>
          <section className={styles.emptyCard}>
            <h2>Choose the chapter you want to finish.</h2>
            <p>A plan becomes active only after the planning service returns a complete chapter roadmap.</p>
            <div className={styles.emptyActions}>
              <Link href={PLANNING_ROUTES.new} className={styles.primaryButton}>Build a chapter plan</Link>
              <Link href={PLANNING_ROUTES.history} className={styles.secondaryButton}>Open device history</Link>
            </div>
          </section>
        </div>
      </PlanningScreen>
    );
  }

  const { mission, scope } = activePlan;
  const route = getMissionPlan(mission);
  const question = getMissionQuestion(mission);
  const estimatedMinutes = getEstimatedPlanMinutes(activePlan);
  const completed = new Set(
    (activePlan.completedStepIndexes || []).filter((index) => index >= 0 && index < route.length),
  );
  const completedCount = completed.size;
  const progress = route.length ? Math.round((completedCount / route.length) * 100) : 0;
  const currentIndex = route.findIndex((_, index) => !completed.has(index));
  const nextIndex = currentIndex < 0 ? Math.max(0, route.length - 1) : currentIndex;
  const displayedOpenStep = openStep === null ? nextIndex : openStep;

  return (
    <PlanningScreen
      eyebrow="Planning Lab / Chapter plan"
      title={scope.chapterLabel}
      intro="Follow one comfortable step at a time. Your roadmap, prerequisite guidance, and chapter check all stay inside Planning."
      backHref={PLANNING_ROUTES.home}
      actions={(
        <>
          <Link href={PLANNING_ROUTES.new} className={styles.secondaryButton}>Choose another chapter</Link>
          {question ? (
            <Link href={activePlan.checkpoint ? PLANNING_ROUTES.review : PLANNING_ROUTES.checkpoint} className={styles.primaryButton}>
              {activePlan.checkpoint ? "Review chapter check" : "Open chapter check"}
              <AppIcon name="arrowRight" />
            </Link>
          ) : null}
        </>
      )}
    >
      <section className={styles.summaryCard} aria-labelledby="active-plan-objective">
        <div className={styles.summaryTop}>
          <div>
            <p className={styles.eyebrow}>Your complete chapter route</p>
            <h2 id="active-plan-objective">{mission.objective}</h2>
            <p>{mission.why}</p>
          </div>
          <span className={styles.sourceChip} data-source={activePlan.catalogSource}>
            {activePlan.catalogSource === "published" ? "Published syllabus" : "Starter catalog"}
          </span>
        </div>
        <div className={styles.summaryMetrics}>
          <div><span>Subject</span><strong>{scope.subject}</strong></div>
          <div><span>Progress</span><strong>{completedCount} of {route.length} steps</strong></div>
          <div><span>Estimated duration</span><strong>{estimatedMinutes ? `About ${estimatedMinutes} minutes` : "Flexible pace"}</strong></div>
        </div>
        <div
          className={styles.progressTrack}
          role="progressbar"
          aria-label="Chapter plan progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress}
        >
          <span style={{ width: `${progress}%` }} />
        </div>
      </section>

      <div className={styles.activeLayout}>
        <section className={styles.routePanel} aria-labelledby="route-heading">
          <div className={styles.sectionHeader}>
            <div>
              <p className={styles.eyebrow}>Step-by-step roadmap</p>
              <h2 id="route-heading">Complete the chapter in this order</h2>
              <p>Open only the step you are working on. Mark it complete when its check feels comfortable.</p>
            </div>
            <span className={styles.statusChip}>{progress}% complete</span>
          </div>

          {route.length ? (
            <ol className={styles.routeList}>
              {route.map((step, index) => {
                const isComplete = completed.has(index);
                const isOpen = displayedOpenStep === index;
                const prerequisite = step.prerequisite_check;
                const completion = step.completion_check;
                return (
                  <li
                    key={step.unit_id || `${step.title}-${index}`}
                    className={styles.routeStep}
                    data-completed={isComplete ? "true" : "false"}
                    data-current={index === nextIndex && !isComplete ? "true" : "false"}
                  >
                    <span className={styles.stepIndex}>{isComplete ? <AppIcon name="check" /> : String(index + 1).padStart(2, "0")}</span>
                    <div className={styles.stepCopy}>
                      <button type="button" className={styles.stepToggle} onClick={() => setOpenStep(isOpen ? -1 : index)} aria-expanded={isOpen}>
                        <span>
                          <strong>{step.title}</strong>
                          <small>{step.duration}</small>
                          <small className={styles.stepCompletionState} data-completed={isComplete ? "true" : "false"}>
                            {isComplete ? "Completed" : index === nextIndex ? "Next step" : "Not completed"}
                          </small>
                        </span>
                        <span aria-hidden="true">{isOpen ? "−" : "+"}</span>
                      </button>
                      {isOpen ? (
                        <div className={styles.stepDetails}>
                          <p>{step.detail}</p>
                          <p><strong>Focus:</strong> {step.focus}</p>
                          <div className={styles.inlineCheck} data-status={prerequisite.status}>
                            <span>{prerequisite.status === "repair_first" ? "Before this step" : "Quick readiness check"}</span>
                            <strong>{prerequisite.question}</strong>
                            <p>{prerequisite.guidance}</p>
                          </div>
                          <div className={styles.inlineCheck}>
                            <span>Before marking complete</span>
                            <strong>{completion.question}</strong>
                            <p>{completion.expected_outcome}</p>
                          </div>
                          <button type="button" className={isComplete ? styles.secondaryButton : styles.primaryButton} onClick={() => togglePlanStep(index)}>
                            <AppIcon name={isComplete ? "x" : "check"} />
                            {isComplete ? "Mark as not finished" : "Mark step complete"}
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ol>
          ) : <p className={styles.stateMessage}>No chapter steps were returned. Rebuild the plan before starting.</p>}
        </section>

        <aside className={styles.strategyPanel} aria-labelledby="chapter-next-heading">
          <p className={styles.eyebrow}>Your next move</p>
          <h2 id="chapter-next-heading">{progress === 100 ? "Roadmap complete" : `Step ${nextIndex + 1} is next`}</h2>
          <p className={styles.panelCopy}>
            {progress === 100
              ? "You have worked through every chapter step. Use the chapter check when you are ready."
              : "Stay with one step until its completion check feels clear. You can return here anytime without losing progress."}
          </p>
          {route[nextIndex] ? (
            <div className={styles.nextStepCard}>
              <span>{progress === 100 ? "Last completed step" : "Continue here"}</span>
              <strong>{route[nextIndex].title}</strong>
              <p>{route[nextIndex].focus}</p>
              <button type="button" className={styles.secondaryButton} onClick={() => setOpenStep(nextIndex)}>Open this step</button>
            </div>
          ) : null}
          {question ? (
            <Link href={activePlan.checkpoint ? PLANNING_ROUTES.review : PLANNING_ROUTES.checkpoint} className={`${styles.primaryButton} ${styles.chapterCheckAction}`}>
              {activePlan.checkpoint ? "View chapter result" : "Take the chapter check"}
              <AppIcon name="arrowRight" />
            </Link>
          ) : (
            <p className={styles.stateMessage}>The planner did not return a chapter check. Your roadmap remains usable.</p>
          )}
          <p className={styles.safetyNote}>Your chapter roadmap and checks stay together in Planning.</p>
        </aside>
      </div>
    </PlanningScreen>
  );
}
