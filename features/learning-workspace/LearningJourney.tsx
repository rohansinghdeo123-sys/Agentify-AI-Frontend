"use client";

import { AppIcon } from "@/components/ui/Polished";
import type { PlanningPortfolioProgress } from "@/features/planning/contracts";
import Image from "next/image";
import Link from "next/link";
import { useState, type CSSProperties } from "react";
import { LEARNING_WORKSPACE_STEPS } from "./config";
import { recommendLearningWorkspace, type LearningRecommendation } from "./recommendation";
import type { LearningModeId } from "./types";
import styles from "./journey-landing.module.css";

// Positions match the four glass spheres in the 800 by 720 crop.
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
  const active = LEARNING_WORKSPACE_STEPS.find((step) => step.id === (choice ?? recommendation.mode)) ?? LEARNING_WORKSPACE_STEPS[0];
  const recommended = active.id === recommendation.mode;
  const mastered = !!progress?.total_units && progress.mastered_units === progress.total_units;

  return (
    <section className={styles.page} aria-labelledby="learning-journey-title">
      <div className={styles.world}>
        <div className={styles.intro}>
          <h1 id="learning-journey-title">Your learning <em>journey</em></h1>
          <p>Pick a glowing marker to explore a workspace.</p>
        </div>

        <div className={styles.landscape}>
          <div className={styles.map}>
            <Image className={styles.art} src="/learning-journey.webp" alt=""
              width={1080} height={720} unoptimized preload />
            {mastered ? <span className={styles.compassReward} aria-hidden="true" /> : null}
            <ol className={styles.waypoints} aria-label="Explore the learning path">
              {LEARNING_WORKSPACE_STEPS.map((step) => {
                const point = WAYPOINTS[step.id];
                return (
                  <li key={step.id} className={styles.waypoint}
                    style={{ "--waypoint-x": `${point.x}%`, "--waypoint-y": `${point.y}%` } as CSSProperties}>
                    <button type="button" className={styles.pin} aria-label={`Preview ${step.title}`}
                      aria-pressed={active.id === step.id} aria-controls="workspace-preview"
                      onClick={() => setChoice(step.id)}>
                      <span className={styles.pinCore}><AppIcon name={step.icon} /></span>
                      <span className={styles.pinLabel} aria-hidden="true">{step.title}</span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </div>
        </div>

        <section id="workspace-preview" className={styles.preview} aria-labelledby="workspace-preview-title">
          <div className={styles.previewCopy} aria-live="polite" aria-atomic="true">
            <div key={active.id} className={styles.previewReveal}>
              <p className={styles.kicker}>
                <AppIcon name={recommended ? "spark" : active.icon} />
                {recommended ? (recommendation.basis === "setup" ? "Suggested start" : "Suggested for you") : active.eyebrow}
              </p>
              <h2 id="workspace-preview-title">{active.title}</h2>
              <p className={styles.detail}>{recommended ? recommendation.reason : active.description}</p>
            </div>
          </div>
          <Link className={styles.launch} href={active.href}>
            {recommended && recommendation.basis === "setup" ? "Create a plan" : WAYPOINTS[active.id].action}
            <AppIcon name="arrowRight" />
          </Link>
          {progress && progress.total_units > 0 ? (
            <div className={styles.mastery} data-mastered={mastered || undefined}>
              <div className={styles.masteryCaption}>
                <AppIcon name={mastered ? "trophy" : "check"} />
                <span id="journey-mastery-title">
                  {mastered ? "Plan mastered" : `${progress.mastered_units} of ${progress.total_units} topics mastered`}
                </span>
              </div>
              <progress className="journey-progress" aria-labelledby="journey-mastery-title"
                value={progress.mastered_units} max={progress.total_units} />
            </div>
          ) : null}
        </section>

        <div className={styles.destinations}>
          <h2>Learning workspaces</h2>
          <ol className={styles.route} aria-label="Planning, Study, Revision, and Exam learning route">
            {LEARNING_WORKSPACE_STEPS.map((step) => (
              <li key={step.id} data-mode={step.id} data-recommended={step.id === recommendation.mode || undefined}>
                <Link className={styles.destination} href={step.href} data-selected={active.id === step.id || undefined}>
                  <AppIcon name={step.icon} />
                  <span>{step.title}</span>
                </Link>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
