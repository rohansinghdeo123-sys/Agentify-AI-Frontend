"use client";

import { AppIcon } from "@/components/ui/Polished";
import Link from "next/link";
import { getEstimatedPlanMinutes, getMissionPlan } from "./contracts";
import { usePlanningExperience } from "./PlanningExperience";
import { PlanningLoading, PlanningScreen, planningStyles as styles } from "./PlanningScreen";
import { PLANNING_ROUTES } from "./routes";

const JOURNEY = [
  { number: "01", title: "Choose a chapter", detail: "One clear selection and no complicated setup." },
  { number: "02", title: "Follow the roadmap", detail: "Work through comfortable chapter steps in order." },
  { number: "03", title: "Take the chapter check", detail: "Use one clear result to decide what needs another pass." },
];

export default function PlanningHome() {
  const {
    authBusy,
    hydrated,
    activePlan,
    history,
    catalogSource,
    catalogSettled,
    staleNotice,
  } = usePlanningExperience();

  if (authBusy || !hydrated) return <PlanningLoading />;

  const estimatedMinutes = getEstimatedPlanMinutes(activePlan);
  const blockCount = getMissionPlan(activePlan?.mission).length;
  const continueHref = activePlan?.checkpoint ? PLANNING_ROUTES.review : PLANNING_ROUTES.active;

  return (
    <PlanningScreen
      eyebrow="AgentifyAI / Planning Lab"
      title="One chapter. One clear way forward."
      intro="Choose a chapter and receive a comfortable step-by-step roadmap. Planning keeps every step and check together so students always know what to do next."
      actions={(
        <Link href={PLANNING_ROUTES.history} className={styles.secondaryButton}>
          <AppIcon name="history" />
          Device history
        </Link>
      )}
    >
      {staleNotice ? <div className={styles.notice} role="status">{staleNotice}</div> : null}
      <section className={styles.homeHero} aria-label="Current planning focus">
        <article className={styles.focusCard}>
          <p className={styles.eyebrow}>{activePlan ? "Active plan" : "Start with one clear target"}</p>
          <h2>
            {activePlan
              ? `${activePlan.scope.chapterLabel} is ready to continue.`
              : "Turn a full chapter into steps you can actually finish."}
          </h2>
          <p>
            {activePlan
              ? activePlan.mission.objective
              : "Choose only the chapter. Planning will organise the foundations, learning units, practice, and final check in a calm order."}
          </p>
          <div className={styles.focusMeta}>
            {activePlan ? (
              <>
                <span className={styles.statusChip}>{activePlan.scope.subject}</span>
                <span className={styles.statusChip}>{activePlan.scope.chapterLabel}</span>
                <span className={styles.durationChip}>
                  {estimatedMinutes ? `About ${estimatedMinutes} min` : `${blockCount} ${blockCount === 1 ? "block" : "blocks"}`}
                </span>
                <span className={styles.sourceChip} data-source={activePlan.catalogSource}>
                  {activePlan.catalogSource === "published" ? "Published syllabus" : "Starter catalog"}
                </span>
              </>
            ) : (
              <>
                <span className={styles.statusChip}>Chapter-wide</span>
                <span className={styles.statusChip}>Step by step</span>
                <span className={styles.statusChip}>Everything in one place</span>
              </>
            )}
          </div>
          <div className={styles.focusActions}>
            {activePlan ? (
              <Link href={continueHref} className={styles.primaryButton}>
                {activePlan.checkpoint ? "Open plan review" : "Continue active plan"}
                <AppIcon name="arrowRight" />
              </Link>
            ) : null}
            <Link href={PLANNING_ROUTES.new} className={activePlan ? styles.secondaryButton : styles.primaryButton}>
              <AppIcon name="mission" />
              {activePlan ? "Build another plan" : "Build my plan"}
            </Link>
          </div>
        </article>

        <aside className={styles.trustCard}>
          <div>
            <span className={styles.trustIcon} aria-hidden="true"><AppIcon name="check" /></span>
            <h2>Clear about what is real</h2>
            <p>
              {catalogSettled
                ? catalogSource === "published"
                  ? "Your chapter selector is using the published catalog for this account."
                  : "No published catalog was available, so starter chapters remain clearly labelled."
                : "Checking the published catalog before you build."}
            </p>
          </div>
          <div className={styles.trustList}>
            <span>Plan snapshots stay on this device.</span>
            <span>Learning activity counts only after server confirmation.</span>
            <span>Plan duration is estimated from the generated learning blocks.</span>
          </div>
        </aside>
      </section>

      <section className={styles.dashboardGrid} aria-label="Simple chapter planning journey">
        <article className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <p className={styles.eyebrow}>Simple by design</p>
              <h2>Three calm steps</h2>
              <p>No second selector, no crowded controls, and no broken learning flow.</p>
            </div>
            <span className={styles.statusChip}>Chapter-wide</span>
          </div>
          <div className={styles.journeyList}>
            {JOURNEY.map((item) => (
              <div key={item.number} className={styles.journeyRow}>
                <span>{item.number}</span>
                <div><strong>{item.title}</strong><p>{item.detail}</p></div>
              </div>
            ))}
          </div>
        </article>

        <article className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <p className={styles.eyebrow}>Always reliable</p>
              <h2>Your place is easy to find</h2>
              <p>Completed steps are saved with the plan on this device, and the next unfinished step is shown clearly.</p>
            </div>
            <span className={styles.statusChip}>{history.length} on device</span>
          </div>
          <div className={styles.trustList}>
            <span>Every plan covers the complete selected chapter.</span>
            <span>Prerequisite guidance belongs to its exact learning step.</span>
            <span>Only you decide when a step is complete or when to open the chapter check.</span>
          </div>
        </article>
      </section>
    </PlanningScreen>
  );
}
