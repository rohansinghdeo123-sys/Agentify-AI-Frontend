"use client";

import { AppIcon } from "@/components/ui/Polished";
import { BUCKET_LABELS } from "@/lib/revision";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatPlanningLabel, getEstimatedPlanMinutes, getMissionPlan } from "./contracts";
import { usePlanningExperience } from "./PlanningExperience";
import { PlanningLoading, PlanningScreen, planningStyles as styles } from "./PlanningScreen";
import { PLANNING_ROUTES } from "./routes";

const JOURNEY = [
  { number: "01", title: "Plan", detail: "Select one target and generate a focused route." },
  { number: "02", title: "Study", detail: "Open the exact learning block in Study Lab." },
  { number: "03", title: "Revise", detail: "Protect recall with the guided revision route." },
  { number: "04", title: "Test", detail: "Check application in Exam Lab." },
];

export default function PlanningHome() {
  const router = useRouter();
  const {
    authBusy,
    hydrated,
    activePlan,
    history,
    catalogSource,
    catalogSettled,
    radar,
    radarState,
    applyRadarTopic,
  } = usePlanningExperience();

  if (authBusy || !hydrated) return <PlanningLoading />;

  const estimatedMinutes = getEstimatedPlanMinutes(activePlan);
  const blockCount = getMissionPlan(activePlan?.mission).length;
  const continueHref = activePlan?.checkpoint ? PLANNING_ROUTES.review : PLANNING_ROUTES.active;

  return (
    <PlanningScreen
      eyebrow="AgentifyAI / Planning Lab"
      title="Plan the work. Then do the work."
      intro="Turn one syllabus target into a realistic sequence, launch each block in the right learning lab, and use a checkpoint before moving forward."
      actions={(
        <Link href={PLANNING_ROUTES.history} className={styles.secondaryButton}>
          <AppIcon name="history" />
          Device history
        </Link>
      )}
    >
      <section className={styles.homeHero} aria-label="Current planning focus">
        <article className={styles.focusCard}>
          <p className={styles.eyebrow}>{activePlan ? "Active plan" : "Start with one clear target"}</p>
          <h2>
            {activePlan
              ? `${activePlan.scope.topicLabel} is ready for focused work.`
              : "Turn one topic into a route you can start now."}
          </h2>
          <p>
            {activePlan
              ? activePlan.mission.objective
              : "Choose the chapter, topic, and learning approach once. Planning will organise the route, checkpoint, and next action into calm workspaces."}
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
                <span className={styles.statusChip}>One topic</span>
                <span className={styles.statusChip}>One focused route</span>
                <span className={styles.statusChip}>One next action</span>
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
                  ? "Your target selector is using the published catalog for this account."
                  : "No published catalog was available, so starter topics remain clearly labelled."
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

      <section className={styles.dashboardGrid} aria-label="Planning recommendations and journey">
        <article className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <p className={styles.eyebrow}>Memory signal</p>
              <h2>Revision radar</h2>
              <p>Use real due-topic data as the next planning target.</p>
            </div>
            {radarState === "ready" ? <span className={styles.statusChip}>{radar.length} signals</span> : null}
          </div>
          {radarState === "loading" ? <p className={styles.stateMessage}>Checking your revision queue…</p> : null}
          {radarState === "unavailable" ? (
            <p className={styles.stateMessage}>Revision data is unavailable right now. This is different from having no due topics.</p>
          ) : null}
          {radarState === "empty" ? <p className={styles.stateMessage}>No due revision targets were returned.</p> : null}
          {radar.length ? (
            <div className={styles.radarList}>
              {radar.map((entry) => (
                <button
                  key={entry.topic}
                  type="button"
                  className={styles.radarButton}
                  onClick={() => {
                    if (!applyRadarTopic(entry)) return;
                    router.push(PLANNING_ROUTES.new);
                  }}
                >
                  <span>
                    <strong>{formatPlanningLabel(entry.topic)}</strong>
                    <small>{entry.reason}</small>
                  </span>
                  <span className={styles.modeChip}>{BUCKET_LABELS[entry.bucket]} · {entry.suggested_minutes}m</span>
                </button>
              ))}
            </div>
          ) : null}
        </article>

        <article className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <p className={styles.eyebrow}>Learning journey</p>
              <h2>Every plan leads somewhere</h2>
              <p>The active plan carries the same topic into focused learning workspaces.</p>
            </div>
            <span className={styles.statusChip}>{history.length} on device</span>
          </div>
          <div className={styles.journeyList}>
            {JOURNEY.map((item) => (
              <div key={item.number} className={styles.journeyRow}>
                <span>{item.number}</span>
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </article>
      </section>
    </PlanningScreen>
  );
}
