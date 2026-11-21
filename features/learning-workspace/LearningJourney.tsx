"use client";

import { AppIcon } from "@/components/ui/Polished";
import type { PlanningPortfolioProgress } from "@/features/planning/contracts";
import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { LEARNING_WORKSPACE_STEPS } from "./config";
import { recommendLearningWorkspace, type LearningRecommendation } from "./recommendation";
import type { LearningModeId } from "./types";
import styles from "./journey-landing.module.css";

// Positions are relative to the 800 by 720 crop of the source illustration.
const WAYPOINTS = {
  planning: { x: 66, y: 64, action: "Open Planning" },
  study: { x: 51.25, y: 49, action: "Open Study Lab" },
  revision: { x: 58.75, y: 35.5, action: "Start a review" },
  exam: { x: 67.25, y: 26.6, action: "Open Exam" },
} as const;

export default function LearningJourney({
  recommendation = recommendLearningWorkspace(null),
  progress,
}: {
  recommendation?: LearningRecommendation;
  progress?: PlanningPortfolioProgress;
}) {
  const [choice, setChoice] = useState<LearningModeId | null>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const previewHeading = useRef<HTMLHeadingElement>(null);
  const active = LEARNING_WORKSPACE_STEPS.find((step) => step.id === choice);
  const recommended = active?.id === recommendation.mode;
  const mastered = !!progress?.total_units && progress.mastered_units === progress.total_units;

  useEffect(() => {
    if (choice) previewHeading.current?.focus({ preventScroll: true });
  }, [choice]);

  const closePreview = () => {
    setChoice(null);
    opener.current?.focus({ preventScroll: true });
  };

  return (
    <section className={styles.page} aria-labelledby="learning-journey-title"
      onKeyDown={(event) => {
        if (event.key === "Escape" && choice && !event.defaultPrevented) {
          event.preventDefault();
          closePreview();
        }
      }}>
      <h1 id="learning-journey-title" className={styles.title}>Your Learning <em>Journey</em></h1>

      <div className={styles.map}>
        <div className={styles.art} aria-hidden="true" />
        <span className={styles.routeSpark} aria-hidden="true" />
        {mastered ? <span className={styles.compassReward} data-mastered="true" aria-hidden="true" /> : null}
        <span className="sr-only" id="journey-recommendation">Suggested next step</span>
        {mastered ? <span className="sr-only" role="status">Plan mastered</span> : null}
        <ol className={styles.waypoints} aria-label="Explore the learning path">
          {LEARNING_WORKSPACE_STEPS.map((step) => {
            const point = WAYPOINTS[step.id];
            const suggested = recommendation.mode === step.id;
            const expanded = choice === step.id;
            return (
              <li key={step.id} className={styles.waypoint} data-mode={step.id} data-recommended={suggested || undefined}
                style={{ "--waypoint-x": `${point.x}%`, "--waypoint-y": `${point.y}%` } as CSSProperties}>
                <button type="button" className={styles.pin} aria-label={`Preview ${step.title}`}
                  aria-expanded={expanded} aria-controls={expanded ? "workspace-preview" : undefined}
                  aria-describedby={suggested ? "journey-recommendation" : undefined}
                  onClick={(event) => {
                    if (expanded) {
                      closePreview();
                    } else {
                      opener.current = event.currentTarget;
                      setChoice(step.id);
                    }
                  }}>
                  <span className={styles.pinCore}><AppIcon name={step.icon} /></span>
                  <span className={styles.pinLabel} aria-hidden="true">{step.title}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>

      {active ? (
        <section key={active.id} id="workspace-preview" className={styles.preview} aria-labelledby="workspace-preview-title">
          <div className={styles.previewHeading}>
            <div>
              <p className={styles.kicker}>
                <AppIcon name={recommended ? "spark" : active.icon} />
                {recommended ? (recommendation.basis === "setup" ? "Suggested start" : "Suggested for you") : active.eyebrow}
              </p>
              <h2 id="workspace-preview-title" ref={previewHeading} tabIndex={-1}>{active.title}</h2>
            </div>
            <button type="button" className={styles.close} aria-label="Close workspace preview" onClick={closePreview}>
              <AppIcon name="x" />
            </button>
          </div>
          <p className={styles.detail}>{recommended ? recommendation.reason : active.description}</p>
          <Link className={styles.launch} href={active.href}>
            {recommended && recommendation.basis === "setup" ? "Create a plan" : WAYPOINTS[active.id].action}
            <AppIcon name="arrowRight" />
          </Link>
          {progress && progress.total_units > 0 ? (
            <div className={styles.mastery}>
              <span id="journey-mastery-title">
                {mastered ? "Plan mastered" : `${progress.mastered_units} of ${progress.total_units} topics mastered`}
              </span>
              <progress className="journey-progress" aria-labelledby="journey-mastery-title"
                value={progress.mastered_units} max={progress.total_units} />
            </div>
          ) : null}
        </section>
      ) : null}
    </section>
  );
}
