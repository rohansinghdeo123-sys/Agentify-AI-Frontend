"use client";

import { AppIcon } from "@/components/ui/Polished";
import Link from "next/link";
import {
  getPlanningFocusAreas,
  getPlanningGuidanceSteps,
  type PlanningFocusLevel,
} from "./contracts";
import { usePlanningExperience } from "./PlanningExperience";
import { PlanningLoading, PlanningScreen, planningStyles as styles } from "./PlanningScreen";
import { PLANNING_ROUTES } from "./routes";

const FOCUS_LABELS: Record<PlanningFocusLevel, string> = {
  high: "Deep focus",
  medium: "Learn well",
  light: "Quick scan",
};

export default function PlanningActive() {
  const { authBusy, hydrated, activePlan, staleNotice } = usePlanningExperience();

  if (authBusy || !hydrated) return <PlanningLoading label="Opening your focus plan..." />;

  if (!activePlan) {
    return (
      <PlanningScreen
        eyebrow="Planning Lab"
        title="Choose a chapter first."
        intro="Your focus plan appears after three quick syllabus choices."
      >
        <div className={styles.selectionStage}>
          {staleNotice ? <div className={styles.compactNotice} role="status">{staleNotice}</div> : null}
          <section className={styles.emptyCard}>
            <h2>No current focus plan</h2>
            <p>Select a class, subject, and chapter to create one.</p>
            <div className={styles.emptyActions}>
              <Link href={PLANNING_ROUTES.home} className={styles.secondaryButton}>Choose a chapter</Link>
            </div>
          </section>
        </div>
      </PlanningScreen>
    );
  }

  const { mission, scope } = activePlan;
  const focusAreas = getPlanningFocusAreas(mission);
  const guidanceSteps = getPlanningGuidanceSteps(mission);

  return (
    <PlanningScreen
      eyebrow={`${scope.classLevel} / ${scope.subject}`}
      title={scope.chapterLabel}
      intro={mission.chapter_summary || "Your short chapter focus plan is ready."}
      backHref={PLANNING_ROUTES.home}
      backLabel="Change chapter"
    >
      <div className={styles.focusBrief}>
        <section className={styles.focusMap} aria-labelledby="focus-map-heading">
          <div className={styles.focusMapHeader}>
            <div>
              <p className={styles.eyebrow}>What needs your attention</p>
              <h2 id="focus-map-heading">Chapter focus map</h2>
              <p>Darker cards deserve more attention. Every area still belongs to the chapter.</p>
            </div>
            <div className={styles.focusLegend} aria-label="Focus level guide">
              {(Object.entries(FOCUS_LABELS) as Array<[PlanningFocusLevel, string]>).map(([level, label]) => (
                <span key={level} data-level={level}><i aria-hidden="true" />{label}</span>
              ))}
            </div>
          </div>

          <ol className={styles.focusAreaList}>
            {focusAreas.map((area, index) => (
              <li key={area.focus_area_id} className={styles.focusAreaCard} data-level={area.focus_level}>
                <div className={styles.focusAreaTop}>
                  <span className={styles.focusSequence}>{String(index + 1).padStart(2, "0")}</span>
                  <span className={styles.focusLevel} data-level={area.focus_level}>
                    <i aria-hidden="true" />{FOCUS_LABELS[area.focus_level]}
                  </span>
                </div>
                <h3>{area.title}</h3>
                <ul className={styles.subtopicList} aria-label={`Subtopics in ${area.title}`}>
                  {area.subtopics.map((subtopic) => <li key={subtopic}>{subtopic}</li>)}
                </ul>
                <p className={styles.focusReason}>{area.reason}</p>
                <div className={styles.focusAction}>
                  <span>How to handle it</span>
                  <p>{area.guidance}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className={styles.guidancePanel} aria-labelledby="guidance-heading">
          <div className={styles.guidanceHeading}>
            <span className={styles.selectionMark} aria-hidden="true"><AppIcon name="spark" /></span>
            <div>
              <p className={styles.eyebrow}>Your shortest route</p>
              <h2 id="guidance-heading">Complete the chapter in these steps</h2>
            </div>
          </div>
          <ol className={styles.guidanceList}>
            {guidanceSteps.map((step) => (
              <li key={`${step.sequence}-${step.title}`}>
                <span>{String(step.sequence).padStart(2, "0")}</span>
                <div><strong>{step.title}</strong><p>{step.instruction}</p></div>
              </li>
            ))}
          </ol>
          <div className={styles.completionSignal}>
            <AppIcon name="check" />
            <div><span>You are done when</span><strong>{mission.completion_signal}</strong></div>
          </div>
        </section>
      </div>
    </PlanningScreen>
  );
}
