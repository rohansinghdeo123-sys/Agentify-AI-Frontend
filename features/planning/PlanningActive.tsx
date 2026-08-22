"use client";

import { AppIcon } from "@/components/ui/Polished";
import { planningMcqHref } from "@/features/exam/mcq/planningScope";
import { createConversationId } from "@/features/study/conversationUtils";
import { studySessionHref } from "@/features/study/routes";
import type { StudyScope } from "@/features/study/types";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  getPlanningLearningUnits,
  getPlanningUnit,
  planningTimeLabel,
  type PlanningDepth,
  type PlanningDifficulty,
  type PlanningImportance,
  type PlanningLearningUnit,
  type PlanningRoadmap,
  type PlanningUnitStatus,
} from "./contracts";
import { usePlanningExperience } from "./PlanningExperience";
import { PlanningLoading, PlanningScreen, planningStyles as styles } from "./PlanningScreen";
import { PLANNING_ROUTES } from "./routes";

const IMPORTANCE_LABELS: Record<PlanningImportance, string> = {
  very_high: "Very important",
  high: "High importance",
  moderate: "Moderate",
  low: "Light attention",
};

const DIFFICULTY_LABELS: Record<PlanningDifficulty, string> = {
  foundation: "Foundation",
  steady: "Steady",
  challenging: "Challenging",
};

const STATUS_LABELS: Record<PlanningUnitStatus, string> = {
  not_started: "Not started",
  learning: "Learning",
  practising: "Practising",
  needs_review: "Needs review",
  mastered: "Mastered",
};

const DEPTH_LABELS: Record<PlanningDepth, string> = {
  overview: "Quick understanding",
  working: "Understand well",
  mastery: "Master",
};

const LEARNING_TYPE_LABELS: Record<string, string> = {
  theory_concept: "Theory / Concept",
  theory: "Theory",
  concept: "Concept",
  formula: "Formula",
  calculation_numerical: "Numerical",
  calculation: "Calculation",
  numerical: "Numerical",
  application: "Application",
  memorization: "Memorisation",
  memorisation: "Memorisation",
  recall: "Recall",
  practice: "Practice",
};

function learningTypeLabel(value: string) {
  const key = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return LEARNING_TYPE_LABELS[key]
    || key.split("_").filter(Boolean).map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`).join(" ");
}

function ncertSectionLabel(id: string, title: string) {
  if (/^\d+(?:\.\d+)*$/.test(id.trim())) return `${id} · ${title}`;
  if (id.trim().toLowerCase().startsWith("intro")) return `Opening context · ${title}`;
  return `Source context · ${title}`;
}

function timeRange(range: { min: number; max: number }) {
  return range.min === range.max ? `${range.min} min` : `${range.min}–${range.max} min`;
}

function practiceHref(roadmap: PlanningRoadmap, unit: PlanningLearningUnit) {
  return planningMcqHref({
    classLevel: roadmap.class_level,
    subject: roadmap.subject,
    chapter: roadmap.chapter_slug,
    chapterLabel: roadmap.chapter,
    topic: unit.primary_topic_id,
    topicLabel: unit.title,
  });
}

function DetailList({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div className={styles.detailList}>
      <strong>{title}</strong>
      <ul>{items.map((item) => <li key={item}>{item}</li>)}</ul>
    </div>
  );
}

function ConceptList({ concepts }: { concepts: PlanningLearningUnit["concepts"] }) {
  return (
    <div className={`${styles.detailList} ${styles.conceptList}`}>
      <strong>Concepts</strong>
      <ul>
        {concepts.map((concept) => (
          <li key={concept.id}>
            <span>{concept.title}</span>
            <span className={`${styles.statusBadge} ${styles.conceptStatus}`} data-status={concept.status}>
              {STATUS_LABELS[concept.status]}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function RoadmapUnitDetail({
  unit,
  roadmap,
  onOpenStudy,
}: {
  unit: PlanningLearningUnit;
  roadmap: PlanningRoadmap;
  onOpenStudy: (unit: PlanningLearningUnit, intent: "learn" | "ask") => void;
}) {
  const prerequisites = unit.prerequisite_unit_ids
    .map((unitId) => getPlanningUnit(roadmap, unitId))
    .filter((item): item is PlanningLearningUnit => Boolean(item));
  const dependents = unit.dependent_unit_ids
    .map((unitId) => getPlanningUnit(roadmap, unitId))
    .filter((item): item is PlanningLearningUnit => Boolean(item));

  return (
    <div className={styles.unitDetails}>
      <p className={styles.unitDescription}>{unit.short_description}</p>
      <div className={styles.detailGrid}>
        <section>
          <span className={styles.detailIcon} aria-hidden="true"><AppIcon name="spark" /></span>
          <div><h4>Why this matters</h4><p>{unit.why_it_matters}</p></div>
        </section>
        <section>
          <span className={styles.detailIcon} aria-hidden="true"><AppIcon name="book" /></span>
          <div>
            <h4>Before you start</h4>
            {prerequisites.length ? (
              <ul>{prerequisites.map((item) => <li key={item.id}>{item.title}</li>)}</ul>
            ) : <p>No prerequisite—this is a clear starting point.</p>}
            {dependents.length ? <DetailList title="Unlocks" items={dependents.map((item) => item.title)} /> : null}
          </div>
        </section>
        <section>
          <span className={styles.detailIcon} aria-hidden="true"><AppIcon name="study" /></span>
          <div>
            <h4>What you’ll learn</h4>
            <ConceptList concepts={unit.concepts} />
            <DetailList title="Skills" items={unit.skills} />
            <DetailList title="Practice" items={unit.practice} />
          </div>
        </section>
        <section>
          <span className={styles.detailIcon} aria-hidden="true"><AppIcon name="arrowRight" /></span>
          <div>
            <h4>Learning route</h4>
            <ol className={styles.learningRoute}>
              {unit.learning_route.map((step) => <li key={step}>{step}</li>)}
            </ol>
          </div>
        </section>
        <section>
          <span className={styles.detailIcon} aria-hidden="true"><AppIcon name="mission" /></span>
          <div>
            <h4>Learning depth</h4>
            <p>{DEPTH_LABELS[unit.depth]} · {IMPORTANCE_LABELS[unit.exam_relevance]} for exams</p>
          </div>
        </section>
        <section>
          <span className={styles.detailIcon} aria-hidden="true"><AppIcon name="book" /></span>
          <div>
            <h4>NCERT coverage</h4>
            <ul>{unit.ncert_sections.map((section) => <li key={section.id}>{ncertSectionLabel(section.id, section.title)}</li>)}</ul>
          </div>
        </section>
        <section>
          <span className={styles.detailIcon} aria-hidden="true"><AppIcon name="check" /></span>
          <div>
            <h4>Done when</h4>
            <ul>{unit.mastery_criteria.map((criterion) => <li key={criterion}>{criterion}</li>)}</ul>
          </div>
        </section>
      </div>
      <div className={styles.unitActions} aria-label={`Actions for ${unit.title}`}>
        <button type="button" className={styles.primaryButton} onClick={() => onOpenStudy(unit, "learn")}>
          <AppIcon name="study" /> Start Learning <AppIcon name="arrowRight" />
        </button>
        <Link className={styles.secondaryButton} href={practiceHref(roadmap, unit)}>
          <AppIcon name="check" /> Practice
        </Link>
        <button type="button" className={styles.secondaryButton} onClick={() => onOpenStudy(unit, "ask")}>
          <AppIcon name="spark" /> Ask AI
        </button>
      </div>
    </div>
  );
}

function LearningRoadmap({
  roadmap,
  onOpenStudy,
}: {
  roadmap: PlanningRoadmap;
  onOpenStudy: (unit: PlanningLearningUnit, intent: "learn" | "ask") => void;
}) {
  const units = getPlanningLearningUnits(roadmap);
  const [openUnitId, setOpenUnitId] = useState<string | null>(null);

  return (
    <section className={styles.roadmapPanel} aria-labelledby="roadmap-heading">
      <div className={styles.panelHeading}>
        <div>
          <p className={styles.eyebrow}>NCERT learning roadmap</p>
          <h2 id="roadmap-heading">Learn the chapter in the right order</h2>
          <p>Importance guides your attention. The numbered sequence protects the concepts you need first.</p>
        </div>
        <span className={styles.orderBadge}><AppIcon name="check" /> NCERT order locked</span>
      </div>

      <ol className={styles.roadmapList}>
        {units.map((unit) => {
          const isOpen = openUnitId === unit.id;
          const panelId = `planning-unit-${unit.id.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
          return (
            <li key={unit.id}>
              <article className={styles.roadmapUnit} data-importance={unit.importance} data-status={unit.status} data-open={isOpen || undefined}>
                <button
                  type="button"
                  className={styles.unitSummary}
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  onClick={() => setOpenUnitId(isOpen ? null : unit.id)}
                >
                  <span className={styles.unitNumber} aria-hidden="true">{String(unit.order).padStart(2, "0")}</span>
                  <span className={styles.unitTitle}>{unit.title}</span>
                  <span className={styles.unitMetadata}>
                    <span className={styles.importanceBadge} data-importance={unit.importance}>{IMPORTANCE_LABELS[unit.importance]}</span>
                    <span>{DIFFICULTY_LABELS[unit.difficulty]}</span>
                    <span><AppIcon name="clock" /> {timeRange(unit.estimated_minutes)}</span>
                    <span>{unit.learning_types.map(learningTypeLabel).join(" + ")}</span>
                    <span className={styles.statusBadge} data-status={unit.status}>{STATUS_LABELS[unit.status]}</span>
                  </span>
                  <span className={styles.unitToggle} aria-hidden="true">
                    <span>{isOpen ? "Close" : "Details"}</span><AppIcon name="arrowRight" />
                  </span>
                </button>
                <div id={panelId} hidden={!isOpen} className={styles.unitDetailPanel}>
                  <RoadmapUnitDetail unit={unit} roadmap={roadmap} onOpenStudy={onOpenStudy} />
                </div>
              </article>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export default function PlanningActive() {
  const router = useRouter();
  const {
    authBusy,
    hydrated,
    catalogSettled,
    catalogNotice,
    activePlan,
    staleNotice,
    refreshingPlan,
    refreshNotice,
    refreshActivePlan,
  } = usePlanningExperience();

  useEffect(() => {
    if (!activePlan || !catalogSettled) return;
    void refreshActivePlan();

    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void refreshActivePlan();
    };
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => document.removeEventListener("visibilitychange", refreshWhenVisible);
  }, [activePlan, catalogSettled, refreshActivePlan]);

  if (authBusy || !hydrated || !catalogSettled) return <PlanningLoading label="Opening your learning roadmap..." />;

  if (!activePlan) {
    const unavailableNotice = catalogNotice || staleNotice;
    return (
      <PlanningScreen
        eyebrow="Planning Lab"
        title={catalogNotice ? "Planning is not available for this chapter yet." : "Choose a chapter first."}
        intro={catalogNotice || "Your NCERT-ordered roadmap appears after three quick syllabus choices."}
      >
        <div className={styles.selectionStage}>
          {unavailableNotice ? <div className={styles.compactNotice} role="status">{unavailableNotice}</div> : null}
          <section className={styles.emptyCard}>
            <h2>No current roadmap</h2>
            <p>Select a class, subject, and chapter to create one.</p>
            <div className={styles.emptyActions}>
              <Link href={PLANNING_ROUTES.home} className={styles.secondaryButton}>Choose a chapter</Link>
            </div>
          </section>
        </div>
      </PlanningScreen>
    );
  }

  const { roadmap, scope } = activePlan;
  const nextUnit = getPlanningUnit(roadmap, roadmap.next_step.unit_id);
  const showTodayRoute = Boolean(scope.studyTimeToday && roadmap.daily_route);
  const firstRouteUnit = roadmap.daily_route?.items[0]
    ? getPlanningUnit(roadmap, roadmap.daily_route.items[0].unit_id)
    : undefined;
  const activeUnits = roadmap.progress.learning_units + roadmap.progress.practising_units;

  const openStudy = (unit: PlanningLearningUnit, intent: "learn" | "ask") => {
    const studyScope: StudyScope = {
      source: "syllabus",
      catalogSource: "planning_manifest",
      classLevel: roadmap.class_level,
      subject: scope.subject,
      chapterId: roadmap.chapter_slug,
      chapterLabel: scope.chapterLabel,
      topicId: unit.primary_topic_id,
      topicLabel: unit.title,
    };
    const destination = studySessionHref(createConversationId(), studyScope, { fresh: true });
    router.push(`${destination}&entry=${intent === "ask" ? "ask_ai" : "planning"}`);
  };

  return (
    <PlanningScreen
      eyebrow={`${scope.classLevel} / ${scope.subject}`}
      title={scope.chapterLabel}
      intro={`${roadmap.curriculum.source} · ${roadmap.curriculum.edition}. Your route follows the chapter’s conceptual order.`}
      backHref={PLANNING_ROUTES.home}
      backLabel="Change plan"
    >
      <div className={styles.roadmapExperience}>
        {refreshingPlan || refreshNotice ? (
          <div className={`${styles.compactNotice} ${styles.refreshNotice}`} role="status" aria-live="polite">
            <span>{refreshingPlan ? "Refreshing your latest learning progress…" : refreshNotice}</span>
            {!refreshingPlan && refreshNotice ? (
              <button type="button" className={styles.retryButton} onClick={() => void refreshActivePlan({ force: true })}>
                Try again
              </button>
            ) : null}
          </div>
        ) : null}
        {nextUnit ? (
          <section className={styles.nextStepCard} aria-labelledby="next-step-heading">
            <div className={styles.nextStepCopy}>
              <p className={styles.eyebrow}>Your next step</p>
              <h2 id="next-step-heading">{nextUnit.title}</h2>
              <p>{roadmap.next_step.reason}</p>
              <div className={styles.nextStepMetadata}>
                <span><AppIcon name="clock" /> {timeRange(roadmap.next_step.estimated_minutes)}</span>
                <span className={styles.importanceBadge} data-importance={nextUnit.importance}>{IMPORTANCE_LABELS[nextUnit.importance]}</span>
                <span>{nextUnit.learning_types.map(learningTypeLabel).join(" + ")}</span>
                <span className={styles.statusBadge} data-status={nextUnit.status}>{STATUS_LABELS[nextUnit.status]}</span>
              </div>
              {nextUnit.prerequisite_unit_ids.length ? (
                <p className={styles.prerequisiteLine}>
                  <strong>Before this:</strong> {nextUnit.prerequisite_unit_ids
                    .map((id) => getPlanningUnit(roadmap, id)?.title)
                    .filter(Boolean)
                    .join(", ")}
                </p>
              ) : null}
            </div>
            <button type="button" className={`${styles.primaryButton} ${styles.nextStepAction}`} onClick={() => openStudy(nextUnit, "learn")}>
              <AppIcon name="study" /> Start Learning <AppIcon name="arrowRight" />
            </button>
          </section>
        ) : null}

        <section className={styles.routeProgressGrid} aria-label="Today’s route and chapter progress">
          {showTodayRoute && roadmap.daily_route ? (
            <div className={styles.todayRoute}>
              <div className={styles.compactHeading}>
                <div><p className={styles.eyebrow}>Today</p><h2>Your {scope.studyTimeToday === "no_limit" ? "flexible" : planningTimeLabel(scope.studyTimeToday)} route</h2></div>
                <span>{roadmap.daily_route.total_minutes} min planned</span>
              </div>
              <ol>
                {roadmap.daily_route.items.map((item, index) => (
                  <li key={`${item.unit_id}-${index}`}>
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <div>
                      <strong>{item.title}</strong>
                      <p>{item.activity}</p>
                      {item.reason ? <p className={styles.routeReason}>{item.reason}</p> : null}
                    </div>
                    <small>{item.minutes} min · {item.scope === "partial" ? "Small step" : "Complete"}</small>
                  </li>
                ))}
              </ol>
              {firstRouteUnit ? (
                <button type="button" className={`${styles.primaryButton} ${styles.todayRouteAction}`} onClick={() => openStudy(firstRouteUnit, "learn")}>
                  <AppIcon name="study" /> Start today’s route <AppIcon name="arrowRight" />
                </button>
              ) : null}
            </div>
          ) : null}

          <div className={styles.chapterProgress} data-solo={!showTodayRoute || undefined}>
            <div className={styles.compactHeading}>
              <div><p className={styles.eyebrow}>Chapter progress</p><h2>{roadmap.progress.mastered_units} of {roadmap.progress.total_units} mastered</h2></div>
              <strong>{roadmap.progress.percentage}%</strong>
            </div>
            <span
              className={styles.progressTrack}
              role="progressbar"
              aria-label={`${roadmap.progress.mastered_units} of ${roadmap.progress.total_units} learning units mastered`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={roadmap.progress.percentage}
            >
              <span style={{ width: `${roadmap.progress.percentage}%` }} />
            </span>
            <p>{activeUnits ? `${activeUnits} currently active. ` : ""}Progress changes with learning and practice—not simply opening a card.</p>
          </div>
        </section>

        <LearningRoadmap key={roadmap.curriculum.key} roadmap={roadmap} onOpenStudy={openStudy} />

        <section className={styles.readinessCard} aria-labelledby="readiness-heading">
          <span className={styles.selectionMark} aria-hidden="true"><AppIcon name="check" /></span>
          <div>
            <p className={styles.eyebrow}>Chapter readiness</p>
            <h2 id="readiness-heading">You are ready to move on when…</h2>
            <ul>{roadmap.completion_criteria.map((criterion) => <li key={criterion}>{criterion}</li>)}</ul>
          </div>
        </section>
      </div>
    </PlanningScreen>
  );
}
