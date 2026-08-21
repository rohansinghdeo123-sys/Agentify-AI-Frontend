"use client";

import { AppIcon } from "@/components/ui/Polished";
import Link from "next/link";
import { useState } from "react";
import {
  getPlanningFocusAreas,
  getPlanningGuidanceSteps,
  type PlanningFocusArea,
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

const FOCUS_JOURNEY: Array<{
  level: PlanningFocusLevel;
  title: string;
  helper: string;
}> = [
  {
    level: "high",
    title: "Focus first",
    helper: "Give these ideas your strongest attention.",
  },
  {
    level: "medium",
    title: "Learn next",
    helper: "Understand these after your main focus.",
  },
  {
    level: "light",
    title: "Quick look",
    helper: "Read these once so the chapter stays complete.",
  },
];

function FocusJourney({ focusAreas }: { focusAreas: PlanningFocusArea[] }) {
  const firstDeepFocusId = focusAreas.find((area) => area.focus_level === "high")?.focus_area_id ?? null;
  const [openArtifactId, setOpenArtifactId] = useState<string | null>(firstDeepFocusId);
  const orderedFocusAreas = FOCUS_JOURNEY.flatMap(({ level }) => (
    focusAreas.filter((area) => area.focus_level === level)
  ));
  const cardNumbers = new Map(orderedFocusAreas.map((area, index) => [area.focus_area_id, index + 1]));

  return (
    <div className={styles.focusJourney}>
      {FOCUS_JOURNEY.map(({ level, title, helper }) => {
        const areas = focusAreas.filter((area) => area.focus_level === level);
        if (!areas.length) return null;

        return (
          <section key={level} className={styles.priorityBand} data-level={level} aria-labelledby={`focus-${level}-heading`}>
            <div className={styles.priorityBandHeading}>
              <span className={styles.priorityMark} aria-hidden="true"><AppIcon name={level === "high" ? "spark" : level === "medium" ? "book" : "check"} /></span>
              <div>
                <h3 id={`focus-${level}-heading`}>{title}</h3>
                <p>{helper}</p>
              </div>
              <span className={styles.focusLevel} data-level={level}>
                <i aria-hidden="true" />{FOCUS_LABELS[level]}
              </span>
            </div>

            <ol className={styles.artifactGrid}>
              {areas.map((area) => {
                const cardNumber = cardNumbers.get(area.focus_area_id) ?? 1;
                const primarySubtopic = area.subtopics[0] || area.title;
                const connectedSubtopics = area.subtopics.slice(1);
                const panelId = `focus-card-${cardNumber}-${area.focus_area_id.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
                const isOpen = openArtifactId === area.focus_area_id;

                return (
                  <li key={area.focus_area_id}>
                    <article className={styles.focusArtifact} data-level={level} data-open={isOpen || undefined}>
                      <button
                        type="button"
                        className={styles.artifactSummary}
                        aria-expanded={isOpen}
                        aria-controls={panelId}
                        aria-label={`${isOpen ? "Close" : "Open"} tips for ${primarySubtopic}. ${FOCUS_LABELS[level]}.`}
                        onClick={() => setOpenArtifactId(isOpen ? null : area.focus_area_id)}
                      >
                        <span className={styles.artifactNumber} aria-hidden="true">{String(cardNumber).padStart(2, "0")}</span>
                        <span className={styles.artifactSummaryCopy}>
                          <span className={styles.artifactTitle}>{primarySubtopic}</span>
                          <span className={styles.artifactMeta}>{isOpen ? "Hide the simple tip" : "See the simple tip"}</span>
                        </span>
                        <span className={styles.artifactToggle} aria-hidden="true">
                          <span>{isOpen ? "Close" : "Open"}</span>
                          <AppIcon name="arrowRight" />
                        </span>
                      </button>

                      {connectedSubtopics.length ? (
                        <ul className={styles.artifactSubtopicPreview} aria-label={`Connected subtopics for ${primarySubtopic}`}>
                          {connectedSubtopics.map((subtopic) => <li key={subtopic}>{subtopic}</li>)}
                        </ul>
                      ) : null}

                      <div id={panelId} className={styles.artifactDetails} hidden={!isOpen}>
                        <div className={styles.artifactNote}>
                          <span><AppIcon name="spark" />Why it matters</span>
                          <p>{area.reason}</p>
                        </div>
                        <div className={styles.artifactNote}>
                          <span><AppIcon name="check" />Do this</span>
                          <p>{area.guidance}</p>
                        </div>
                      </div>
                    </article>
                  </li>
                );
              })}
            </ol>
          </section>
        );
      })}
    </div>
  );
}

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
              <p className={styles.eyebrow}>Your easy chapter plan</p>
              <h2 id="focus-map-heading">Focus first. Quick look last.</h2>
              <p>Start with Deep focus, then Learn well, and finish with Quick scan. Open a card for one simple tip.</p>
            </div>
          </div>

          <FocusJourney key={mission.mission_id} focusAreas={focusAreas} />
        </section>

        <section className={styles.guidancePanel} aria-labelledby="guidance-heading">
          <div className={styles.guidanceHeading}>
            <span className={styles.selectionMark} aria-hidden="true"><AppIcon name="spark" /></span>
            <div>
              <p className={styles.eyebrow}>Simple steps</p>
              <h2 id="guidance-heading">Follow this chapter route</h2>
              <p>One step at a time. That is all you need to do.</p>
            </div>
          </div>
          <ol className={styles.guidanceList}>
            {guidanceSteps.map((step, index) => (
              <li key={`${step.sequence}-${step.title}`} data-tone={String((index % 3) + 1)}>
                <span className={styles.guidanceNumber}>{String(step.sequence).padStart(2, "0")}</span>
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
