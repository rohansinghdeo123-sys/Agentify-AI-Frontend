import { AppIcon } from "@/components/ui/Polished";
import { LEARNING_WORKSPACE_STEPS } from "@/features/learning-workspace/config";
import Link from "next/link";
import type { CSSProperties } from "react";
import { recommendLearningWorkspace, type LearningRecommendation } from "./recommendation";
import styles from "./journey-landing.module.css";

const STEP_LABELS = ["Plan", "Understand", "Recall", "Test"] as const;

export default function LearningJourney({
  recommendation = recommendLearningWorkspace(null),
}: {
  recommendation?: LearningRecommendation;
}) {
  return (
    <section
      className={styles.page}
      aria-labelledby="learning-journey-title"
    >
      <div className={styles.intro}>
        <p>AgentifyAI learning route</p>
        <h1 id="learning-journey-title">
          One clear route from <span>intention to readiness.</span>
        </h1>
        <p className={styles.introCopy}>
          Start with a plan, build understanding, strengthen recall, and finish by
          proving what you know. You can enter at whichever stage fits today.
        </p>
      </div>

      <div className={styles.routePanel}>
        <div className={styles.routeMeta} aria-hidden="true">
          <span>Start with clarity</span>
          <span>Move at your pace</span>
          <span>Finish ready</span>
        </div>

        <ol className={styles.route} aria-label="Planning, Study, Revision, and Exam learning route">
          {LEARNING_WORKSPACE_STEPS.map((step, index) => {
            const recommended = step.id === recommendation.mode;
            return (
              <li
                key={step.id}
                className={styles.station}
                data-mode={step.id}
                data-recommended={recommended ? "true" : undefined}
                style={{ "--journey-delay": `${index * 110}ms` } as CSSProperties}
              >
                <Link
                  href={step.href}
                  className={styles.stationLink}
                  aria-describedby={`${step.id}-description ${step.id}-outcome`}
                >
                  <span className={styles.stationNode} aria-hidden="true">
                    <AppIcon name={step.icon} />
                  </span>

                  <span className={styles.stationTopline}>
                    <span className={styles.sequence}>{String(step.step).padStart(2, "0")}</span>
                    <span className={styles.phase}>
                      {recommended ? recommendation.label : STEP_LABELS[index]}
                    </span>
                  </span>

                  <span className={styles.stationCopy}>
                    <small>{step.eyebrow}</small>
                    <h2>{step.title}</h2>
                    <span id={`${step.id}-description`}>{step.description}</span>
                  </span>

                  <span className={styles.stationOutcome} id={`${step.id}-outcome`}>
                    <span>
                      <small>{recommended ? recommendation.label : "Outcome"}</small>
                      <strong>{recommended ? recommendation.reason : step.outcome}</strong>
                    </span>
                    <span className={styles.openIndicator} aria-hidden="true">
                      <AppIcon name="arrowRight" />
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
