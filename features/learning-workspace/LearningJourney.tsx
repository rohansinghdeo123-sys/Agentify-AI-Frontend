import { AppIcon } from "@/components/ui/Polished";
import { LEARNING_WORKSPACE_STEPS } from "@/features/learning-workspace/config";
import Link from "next/link";
import type { CSSProperties } from "react";
import styles from "./journey-landing.module.css";

const STEP_LABELS = ["Plan", "Understand", "Recall", "Test"] as const;

export default function LearningJourney() {
  return (
    <section
      className={styles.page}
      aria-labelledby="learning-journey-title"
    >
      <div className={styles.intro}>
        <p>Your AgentifyAI workspace</p>
        <h1 id="learning-journey-title">What do you want to do <span>today?</span></h1>
        <p className={styles.introCopy}>
          Choose the workspace that matches your goal. Every option stays available;
          AgentifyAI simply makes the purpose of each one clear.
        </p>
      </div>

      <div className={styles.routePanel}>
        <div className={styles.routeMeta}>
          <div>
            <span>Four focused workspaces</span>
            <strong>Start where you need help now</strong>
          </div>
          <p>No forced sequence. You stay in control.</p>
        </div>

        <ol className={styles.route} aria-label="Choose Planning, Study, Revision, or Exam">
          {LEARNING_WORKSPACE_STEPS.map((step, index) => (
            <li
              key={step.id}
              className={styles.station}
              data-mode={step.id}
              data-recommended={index === 0 ? "true" : undefined}
              style={{ "--journey-delay": `${index * 110}ms` } as CSSProperties}
            >
              <Link
                href={step.href}
                className={styles.stationLink}
                aria-describedby={`${step.id}-description ${step.id}-outcome`}
              >
                <span className={styles.stationTopline}>
                  <span className={styles.stationNode} aria-hidden="true">
                    <AppIcon name={step.icon} />
                  </span>
                  <span className={styles.phase}>{index === 0 ? "Suggested start" : STEP_LABELS[index]}</span>
                </span>

                <span className={styles.stationCopy}>
                  <small>{String(step.step).padStart(2, "0")} · {step.eyebrow}</small>
                  <h2>{step.title}</h2>
                  <span id={`${step.id}-description`}>{step.description}</span>
                </span>

                <span className={styles.stationOutcome} id={`${step.id}-outcome`}>
                  <span>
                    <small>Outcome</small>
                    <strong>{step.outcome}</strong>
                  </span>
                  <span className={styles.openIndicator} aria-hidden="true">
                    Open <AppIcon name="arrowRight" />
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
