"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { getEstimatedPlanMinutes, getMissionPlan } from "./contracts";
import { usePlanningExperience } from "./PlanningExperience";
import { PlanningLoading, PlanningScreen, planningStyles as styles } from "./PlanningScreen";
import { PLANNING_ROUTES } from "./routes";

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export default function PlanningHistory() {
  const router = useRouter();
  const { authBusy, hydrated, history, loadHistoryPlan } = usePlanningExperience();
  if (authBusy || !hydrated) return <PlanningLoading label="Opening device plan history..." />;

  return (
    <PlanningScreen
      eyebrow="Planning Lab / Device history"
      title="Plans created on this device."
      intro="Opening a snapshot restores its exact chapter, preferences, roadmap, and completed steps on this device."
      backHref={PLANNING_ROUTES.home}
      actions={<Link href={PLANNING_ROUTES.new} className={styles.primaryButton}>Build a new plan</Link>}
    >
      <div className={styles.historyWrap}>
        {!history.length ? (
          <section className={styles.emptyCard}>
            <h2>No device plan history yet.</h2>
            <p>Your first complete mission response will appear here. Failed or incomplete generations are not added.</p>
            <div className={styles.emptyActions}>
              <Link href={PLANNING_ROUTES.new} className={styles.primaryButton}>Build your first plan</Link>
            </div>
          </section>
        ) : (
          <div className={styles.historyList}>
            {history.map((plan) => {
              const estimatedMinutes = getEstimatedPlanMinutes(plan);
              const blockCount = getMissionPlan(plan.mission).length;
              const completedCount = (plan.completedStepIndexes || []).filter((index) => index < blockCount).length;
              return (
                <article key={plan.mission.mission_id} className={styles.historyCard}>
                  <div className={styles.historyTop}>
                    <div>
                      <p className={styles.eyebrow}>{plan.scope.subject}{plan.scope.classLevel ? ` / ${plan.scope.classLevel}` : ""}</p>
                      <h2>{plan.scope.chapterLabel}</h2>
                      <p className={styles.panelCopy}>{plan.mission.objective}</p>
                    </div>
                    <button
                      type="button"
                      className={styles.historyAction}
                      onClick={() => {
                        if (!loadHistoryPlan(plan.mission.mission_id)) return;
                        router.push(plan.checkpoint ? PLANNING_ROUTES.review : PLANNING_ROUTES.active);
                      }}
                    >
                      {plan.checkpoint ? "Open review" : "Make active"}
                    </button>
                  </div>
                  <div className={styles.historyMeta}>
                    <span className={styles.statusChip}>{formatDate(plan.createdAt)}</span>
                    <span className={styles.statusChip}>
                      {estimatedMinutes ? `About ${estimatedMinutes} min` : `${blockCount} ${blockCount === 1 ? "step" : "steps"}`}
                    </span>
                    <span className={styles.statusChip}>{completedCount} of {blockCount} steps complete</span>
                    <span className={styles.statusChip}>{plan.checkpoint ? "Chapter check recorded" : "Chapter check pending"}</span>
                    <span className={styles.sourceChip} data-source={plan.catalogSource}>
                      {plan.catalogSource === "published" ? "Published syllabus" : "Starter catalog"}
                    </span>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </PlanningScreen>
  );
}
