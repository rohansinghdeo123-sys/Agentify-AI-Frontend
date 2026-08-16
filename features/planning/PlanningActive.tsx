"use client";

import { AppIcon } from "@/components/ui/Polished";
import Link from "next/link";
import {
  formatPlanningLabel,
  getMissionPlan,
  getMissionQuestion,
  getMissionRoadmap,
  getEstimatedPlanMinutes,
} from "./contracts";
import { usePlanningExperience } from "./PlanningExperience";
import { PlanningLoading, PlanningScreen, planningStyles as styles } from "./PlanningScreen";
import {
  getPlanBlockDestination,
  getPlanningHandoffs,
  PLANNING_ROUTES,
} from "./routes";

function StrategyGroup({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <section className={styles.strategyGroup}>
      <h3>{title}</h3>
      <ul>{items.map((item) => <li key={item}>{item}</li>)}</ul>
    </section>
  );
}

export default function PlanningActive() {
  const { authBusy, hydrated, activePlan } = usePlanningExperience();
  if (authBusy || !hydrated) return <PlanningLoading label="Opening your active plan..." />;

  if (!activePlan) {
    return (
      <PlanningScreen
        eyebrow="Planning Lab / Active plan"
        title="No active plan on this device."
        intro="Build a new plan or reopen a previous device snapshot. Planning will never substitute a different topic silently."
        backHref={PLANNING_ROUTES.home}
      >
        <div className={styles.checkpointWrap}>
          <section className={styles.emptyCard}>
            <h2>Choose the route you want to restore.</h2>
            <p>A generated plan becomes active only after the planning service returns a complete mission.</p>
            <div className={styles.emptyActions}>
              <Link href={PLANNING_ROUTES.new} className={styles.primaryButton}>Build a plan</Link>
              <Link href={PLANNING_ROUTES.history} className={styles.secondaryButton}>Open device history</Link>
            </div>
          </section>
        </div>
      </PlanningScreen>
    );
  }

  const { mission, scope } = activePlan;
  const route = getMissionPlan(mission);
  const question = getMissionQuestion(mission);
  const roadmap = getMissionRoadmap(mission);
  const estimatedMinutes = getEstimatedPlanMinutes(activePlan);
  const handoffs = getPlanningHandoffs(scope, mission.mission_id);
  const strategyGroups = [
    { title: "High-priority concepts", items: mission.high_priority_concepts || [] },
    { title: "Fast-track strategy", items: mission.fast_track_strategy || [] },
    { title: "Revision emphasis", items: mission.fast_revision_strategy || [] },
    { title: "Weakness detection", items: mission.weakness_detection_points || [] },
    { title: "Final confidence check", items: mission.final_confidence_check || [] },
  ];

  return (
    <PlanningScreen
      eyebrow="Planning Lab / Active plan"
      title={scope.topicLabel}
      intro="Follow the route in order or launch the exact block you need. The topic context moves with you into Study, Revision, and Exam."
      backHref={PLANNING_ROUTES.home}
      actions={(
        <>
          <Link href={PLANNING_ROUTES.new} className={styles.secondaryButton}>Change setup</Link>
          {question ? (
            <Link href={activePlan.checkpoint ? PLANNING_ROUTES.review : PLANNING_ROUTES.checkpoint} className={styles.primaryButton}>
              {activePlan.checkpoint ? "Review checkpoint" : "Open checkpoint"}
              <AppIcon name="arrowRight" />
            </Link>
          ) : null}
        </>
      )}
    >
      <section className={styles.summaryCard} aria-labelledby="active-plan-objective">
        <div className={styles.summaryTop}>
          <div>
            <p className={styles.eyebrow}>Adaptive learning plan</p>
            <h2 id="active-plan-objective">{mission.objective}</h2>
            <p>{mission.why}</p>
          </div>
          <span className={styles.sourceChip} data-source={activePlan.catalogSource}>
            {activePlan.catalogSource === "published" ? "Published syllabus" : "Starter catalog"}
          </span>
        </div>
        <div className={styles.summaryMetrics}>
          <div><span>Subject</span><strong>{scope.subject}</strong></div>
          <div><span>Chapter</span><strong>{scope.chapterLabel}</strong></div>
          <div><span>Estimated duration</span><strong>{estimatedMinutes ? `About ${estimatedMinutes} minutes` : "Flexible pace"}</strong></div>
        </div>
      </section>

      <div className={styles.activeLayout}>
        <section className={styles.routePanel} aria-labelledby="route-heading">
          <div className={styles.sectionHeader}>
            <div>
              <p className={styles.eyebrow}>Executable route</p>
              <h2 id="route-heading">Your study blocks</h2>
              <p>Each block opens in the workspace best suited to the task.</p>
            </div>
            <span className={styles.statusChip}>{route.length} {route.length === 1 ? "block" : "blocks"}</span>
          </div>
          {route.length ? (
            <ol className={styles.routeList}>
              {route.map((step, index) => {
                const destination = getPlanBlockDestination(step, index, scope, mission.mission_id);
                return (
                  <li key={`${step.title}-${index}`} className={styles.routeStep}>
                    <span className={styles.stepIndex}>{String(index + 1).padStart(2, "0")}</span>
                    <div className={styles.stepCopy}>
                      <div className={styles.stepHeading}>
                        <strong>{step.title}</strong>
                        <span>{step.duration || "Focused work"}</span>
                      </div>
                      <p>{step.detail}</p>
                      {step.focus ? <small>Focus: {step.focus}</small> : null}
                    </div>
                    <Link href={destination.href} className={styles.stepAction}>
                      {destination.label}
                      <AppIcon name="arrowRight" />
                    </Link>
                  </li>
                );
              })}
            </ol>
          ) : <p className={styles.stateMessage}>The service returned no executable blocks. Rebuild this plan before starting.</p>}
        </section>

        <aside className={styles.strategyPanel} aria-labelledby="strategy-heading">
          <p className={styles.eyebrow}>Plan intelligence</p>
          <h2 id="strategy-heading">Focus and strategy</h2>
          {mission.prerequisite_check ? (
            <section className={styles.strategyGroup}>
              <h3>Prerequisite check</h3>
              <ul>
                <li>{formatPlanningLabel(mission.prerequisite_check.status || "Ready check")}</li>
                {mission.prerequisite_check.question ? <li>{mission.prerequisite_check.question}</li> : null}
                {mission.prerequisite_check.action ? <li>{mission.prerequisite_check.action}</li> : null}
              </ul>
            </section>
          ) : null}
          <div className={styles.strategyList}>
            {strategyGroups.map((group) => <StrategyGroup key={group.title} title={group.title} items={group.items} />)}
            {roadmap.length ? (
              <section className={styles.strategyGroup}>
                <h3>Adaptive roadmap</h3>
                <div>
                  {roadmap.map((item) => (
                    <article key={item.condition} className={styles.roadmapItem}>
                      <strong>{item.condition}</strong>
                      <p>{item.next_step}</p>
                      {item.mentor_action ? <p>Coach: {item.mentor_action}</p> : null}
                    </article>
                  ))}
                </div>
              </section>
            ) : null}
          </div>
        </aside>
      </div>

      <section className={styles.handoffSection} aria-labelledby="handoff-heading">
        <div className={styles.sectionHeader}>
          <div>
            <p className={styles.eyebrow}>Learning journey</p>
            <h2 id="handoff-heading">Continue with this exact topic</h2>
            <p>These handoffs launch the current plan scope. Completion remains tied to confirmed learning sessions.</p>
          </div>
        </div>
        <div className={styles.handoffGrid}>
          {handoffs.map((handoff) => (
            <Link key={handoff.mode} href={handoff.href} className={styles.handoffCard}>
              <span className={styles.modeChip}>{handoff.mode}</span>
              <strong>{handoff.title}</strong>
              <p>{handoff.detail}</p>
              <span>Open workspace →</span>
            </Link>
          ))}
        </div>
      </section>
    </PlanningScreen>
  );
}
