import { AppIcon } from "@/components/ui/Polished";
import type { PlanningPortfolioProgress } from "@/features/planning/contracts";
import Image from "next/image";
import Link from "next/link";
import { LEARNING_WORKSPACE_STEPS } from "./config";
import { recommendLearningWorkspace, type LearningRecommendation } from "./recommendation";
import styles from "./journey-landing.module.css";

const ACTIONS = {
  planning: "Open Planning",
  study: "Open Study Lab",
  revision: "Start a review",
  exam: "Open Exam",
} as const;

export default function LearningJourney({
  recommendation = recommendLearningWorkspace(null),
  progress,
}: {
  recommendation?: LearningRecommendation;
  progress?: PlanningPortfolioProgress;
}) {
  const next = LEARNING_WORKSPACE_STEPS.find((step) => step.id === recommendation.mode) ?? LEARNING_WORKSPACE_STEPS[0];

  const mastered = !!progress?.total_units && progress.mastered_units === progress.total_units;

  return (
    <section className={styles.page} aria-labelledby="learning-journey-title">
      <div className={styles.hero}>
        <div className={styles.heroArt}>
          <Image src="/learning-journey.webp" alt="" width={1080} height={720} unoptimized priority />
        </div>
        <div className={styles.heroCopy}>
          <p className={styles.kicker}><AppIcon name="mission" /> Your learning journey</p>
          <h1 id="learning-journey-title">
            Take the <em>next step.</em>
          </h1>
          <p className={styles.reason}>{recommendation.reason}</p>
          <Link className={styles.heroAction} href={next.href}>
            {recommendation.basis === "setup" ? "Create a plan" : ACTIONS[next.id]}
            <AppIcon name="arrowRight" />
          </Link>
        </div>
      </div>

      <section className={styles.workspaces} aria-labelledby="learning-stages-title">
        <div className={styles.sectionHeading}>
          <h2 id="learning-stages-title">Learning workspaces</h2>
        </div>
        <ol className={styles.route} aria-label="Planning, Study, Revision, and Exam learning route">
          {LEARNING_WORKSPACE_STEPS.map((step) => {
            const recommended = next.id === step.id;
            return (
              <li className={styles.station} key={step.id} data-mode={step.id} data-recommended={recommended || undefined}>
                <Link className={styles.stationLink} href={step.href}
                  aria-labelledby={`${step.id}-title`} aria-describedby={recommended ? `${step.id}-description suggested-workspace` : `${step.id}-description`}>
                  <div className={styles.stationArt}>
                    <span className={styles.stationIcon} aria-hidden="true"><AppIcon name={step.icon} /></span>
                    <span className={styles.stationTrace} aria-hidden="true" />
                    {recommended ? (
                      <span id="suggested-workspace" className={styles.suggestion}>{recommendation.basis === "setup" ? "Suggested start" : "Suggested for you"}</span>
                    ) : null}
                  </div>
                  <div className={styles.stationBody}>
                    <h3 id={`${step.id}-title`}>{step.title}</h3>
                    <p id={`${step.id}-description`}>{step.description}</p>
                  </div>
                  <span className={styles.stationFoot} aria-hidden="true">
                    <span>{step.eyebrow}</span>
                    <AppIcon name="arrowRight" />
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
      </section>

      {progress && progress.total_units > 0 ? (
        <section className={styles.mastery} data-mastered={mastered || undefined} aria-labelledby="journey-mastery-title">
          <div className={styles.masteryCopy}>
            <span className={styles.masteryIcon}><AppIcon name={mastered ? "trophy" : "check"} /></span>
            <div>
              <h2 id="journey-mastery-title">{mastered ? "Plan mastered" : "Plan mastery"}</h2>
              <p>{progress.mastered_units} of {progress.total_units} planned topics mastered</p>
            </div>
          </div>
          <progress className="journey-progress" aria-labelledby="journey-mastery-title"
            value={progress.mastered_units} max={progress.total_units} />
          <Link href="/dashboard/analytics">View analytics <AppIcon name="arrowRight" /></Link>
        </section>
      ) : null}
    </section>
  );
}
