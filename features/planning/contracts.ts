export const PLANNING_STUDY_TIME_OPTIONS = [
  { value: "15", label: "15 min" },
  { value: "30", label: "30 min" },
  { value: "60", label: "1 hour" },
  { value: "120_plus", label: "2+ hours" },
  { value: "no_limit", label: "No limit" },
] as const;

export type PlanningStudyTime = (typeof PLANNING_STUDY_TIME_OPTIONS)[number]["value"];
export type PlanningImportance = "very_high" | "high" | "moderate" | "low";
export type PlanningDifficulty = "foundation" | "steady" | "challenging";
export type PlanningDepth = "overview" | "working" | "mastery";
export type PlanningUnitStatus = "not_started" | "learning" | "practising" | "needs_review" | "mastered";

export interface PlanningNcertSection {
  id: string;
  title: string;
}

export interface PlanningConceptDetail {
  id: string;
  title: string;
  status: PlanningUnitStatus;
  evidence_count: number;
}

export interface PlanningTimeRange {
  min: number;
  max: number;
}

export interface PlanningLearningUnit {
  id: string;
  order: number;
  title: string;
  short_description: string;
  ncert_sections: PlanningNcertSection[];
  concepts: PlanningConceptDetail[];
  skills: string[];
  practice: string[];
  learning_route: string[];
  importance: PlanningImportance;
  difficulty: PlanningDifficulty;
  estimated_minutes: PlanningTimeRange;
  prerequisite_unit_ids: string[];
  dependent_unit_ids: string[];
  learning_types: string[];
  depth: PlanningDepth;
  exam_relevance: PlanningImportance;
  conceptual_importance: PlanningImportance;
  why_it_matters: string;
  mastery_criteria: string[];
  status: PlanningUnitStatus;
  primary_topic_id: string;
}

export interface PlanningNextStep {
  unit_id: string;
  title: string;
  reason: string;
  estimated_minutes: PlanningTimeRange;
}

export interface PlanningDailyRouteItem {
  unit_id: string;
  title: string;
  activity: string;
  reason?: string;
  minutes: number;
  scope: "partial" | "complete";
}

export interface PlanningDailyRoute {
  time_preference: PlanningStudyTime;
  budget_minutes: number | null;
  total_minutes: number;
  items: PlanningDailyRouteItem[];
}

export interface PlanningProgress {
  mastered_units: number;
  learning_units: number;
  practising_units: number;
  needs_review_units: number;
  total_units: number;
  percentage: number;
}

export interface PlanningCurriculum {
  key: string;
  source: string;
  edition: string;
  chapter_number: number;
  content_order_locked: true;
}

export interface PlanningCoverage {
  status: "complete";
  included_unit_ids: string[];
  unit_count: number;
}

export interface PlanningRoadmap {
  roadmap_version: "planning_roadmap_v2";
  class_level: string;
  subject: string;
  chapter: string;
  chapter_slug: string;
  study_time_today: PlanningStudyTime;
  curriculum: PlanningCurriculum;
  learning_units: PlanningLearningUnit[];
  next_step: PlanningNextStep;
  daily_route: PlanningDailyRoute;
  progress: PlanningProgress;
  completion_criteria: string[];
  coverage: PlanningCoverage;
}

export interface PlanningDraft {
  classLevel: string;
  subject: string;
  chapter: string;
  studyTimeToday: PlanningStudyTime | "";
}

export interface PlanningScope {
  chapter: string;
  chapterLabel: string;
  subject: string;
  classLevel: string;
  studyTimeToday: PlanningStudyTime | "";
}

export interface PlanningPlan {
  roadmap: PlanningRoadmap;
  scope: PlanningScope;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && Boolean(value.trim());
}

function isStringArray(value: unknown, options?: { nonEmpty?: boolean }): value is string[] {
  return Boolean(
    Array.isArray(value)
    && (!options?.nonEmpty || value.length > 0)
    && value.every(nonEmptyString),
  );
}

function isIntegerInRange(value: unknown, minimum: number, maximum = Number.MAX_SAFE_INTEGER) {
  return Number.isInteger(value) && Number(value) >= minimum && Number(value) <= maximum;
}

function isNumberInRange(value: unknown, minimum: number, maximum = Number.MAX_SAFE_INTEGER) {
  return typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum;
}

function isPlanningStudyTime(value: unknown): value is PlanningStudyTime {
  return PLANNING_STUDY_TIME_OPTIONS.some((option) => option.value === value);
}

function isPlanningImportance(value: unknown): value is PlanningImportance {
  return ["very_high", "high", "moderate", "low"].includes(String(value));
}

function isPlanningDifficulty(value: unknown): value is PlanningDifficulty {
  return ["foundation", "steady", "challenging"].includes(String(value));
}

function isPlanningDepth(value: unknown): value is PlanningDepth {
  return ["overview", "working", "mastery"].includes(String(value));
}

function isPlanningUnitStatus(value: unknown): value is PlanningUnitStatus {
  return ["not_started", "learning", "practising", "needs_review", "mastered"].includes(String(value));
}

function isPlanningTimeRange(value: unknown): value is PlanningTimeRange {
  return Boolean(
    isRecord(value)
    && isNumberInRange(value.min, 1)
    && isNumberInRange(value.max, Number(value.min)),
  );
}

function isPlanningNcertSection(value: unknown): value is PlanningNcertSection {
  return Boolean(isRecord(value) && nonEmptyString(value.id) && nonEmptyString(value.title));
}

function isPlanningConceptDetail(value: unknown): value is PlanningConceptDetail {
  return Boolean(
    isRecord(value)
    && nonEmptyString(value.id)
    && nonEmptyString(value.title)
    && isPlanningUnitStatus(value.status)
    && isIntegerInRange(value.evidence_count, 0),
  );
}

function isPlanningLearningUnit(value: unknown): value is PlanningLearningUnit {
  return Boolean(
    isRecord(value)
    && nonEmptyString(value.id)
    && isIntegerInRange(value.order, 1)
    && nonEmptyString(value.title)
    && nonEmptyString(value.short_description)
    && Array.isArray(value.ncert_sections)
    && value.ncert_sections.length > 0
    && value.ncert_sections.every(isPlanningNcertSection)
    && Array.isArray(value.concepts)
    && value.concepts.length > 0
    && value.concepts.every(isPlanningConceptDetail)
    && isStringArray(value.skills)
    && isStringArray(value.practice)
    && isStringArray(value.learning_route, { nonEmpty: true })
    && isPlanningImportance(value.importance)
    && isPlanningDifficulty(value.difficulty)
    && isPlanningTimeRange(value.estimated_minutes)
    && isStringArray(value.prerequisite_unit_ids)
    && isStringArray(value.dependent_unit_ids)
    && isStringArray(value.learning_types, { nonEmpty: true })
    && isPlanningDepth(value.depth)
    && isPlanningImportance(value.exam_relevance)
    && isPlanningImportance(value.conceptual_importance)
    && nonEmptyString(value.why_it_matters)
    && isStringArray(value.mastery_criteria, { nonEmpty: true })
    && isPlanningUnitStatus(value.status)
    && nonEmptyString(value.primary_topic_id),
  );
}

function isPlanningNextStep(value: unknown): value is PlanningNextStep {
  return Boolean(
    isRecord(value)
    && nonEmptyString(value.unit_id)
    && nonEmptyString(value.title)
    && nonEmptyString(value.reason)
    && isPlanningTimeRange(value.estimated_minutes),
  );
}

function isPlanningDailyRouteItem(value: unknown): value is PlanningDailyRouteItem {
  return Boolean(
    isRecord(value)
    && nonEmptyString(value.unit_id)
    && nonEmptyString(value.title)
    && nonEmptyString(value.activity)
    && (value.reason === undefined || nonEmptyString(value.reason))
    && isIntegerInRange(value.minutes, 1)
    && ["partial", "complete"].includes(String(value.scope)),
  );
}

function isPlanningDailyRoute(value: unknown): value is PlanningDailyRoute {
  return Boolean(
    isRecord(value)
    && isPlanningStudyTime(value.time_preference)
    && (value.budget_minutes === null || isIntegerInRange(value.budget_minutes, 1))
    && isIntegerInRange(value.total_minutes, 1)
    && Array.isArray(value.items)
    && value.items.length > 0
    && value.items.every(isPlanningDailyRouteItem),
  );
}

function isPlanningProgress(value: unknown): value is PlanningProgress {
  if (!isRecord(value)) return false;
  const fields = [
    value.mastered_units,
    value.learning_units,
    value.practising_units,
    value.needs_review_units,
    value.total_units,
  ];
  if (!fields.every((field) => isIntegerInRange(field, 0))) return false;
  if (!isNumberInRange(value.percentage, 0, 100)) return false;
  return Number(value.mastered_units)
    + Number(value.learning_units)
    + Number(value.practising_units)
    + Number(value.needs_review_units) <= Number(value.total_units);
}

function isPlanningCurriculum(value: unknown): value is PlanningCurriculum {
  return Boolean(
    isRecord(value)
    && nonEmptyString(value.key)
    && nonEmptyString(value.source)
    && nonEmptyString(value.edition)
    && isIntegerInRange(value.chapter_number, 1)
    && value.content_order_locked === true,
  );
}

function isPlanningCoverage(value: unknown): value is PlanningCoverage {
  return Boolean(
    isRecord(value)
    && value.status === "complete"
    && isStringArray(value.included_unit_ids, { nonEmpty: true })
    && isIntegerInRange(value.unit_count, 1),
  );
}

export function normalizePlanningDraft(value: unknown): PlanningDraft | null {
  if (!isRecord(value) || typeof value.chapter !== "string") return null;
  return {
    classLevel: typeof value.classLevel === "string" ? value.classLevel : "",
    subject: typeof value.subject === "string" ? value.subject : "",
    chapter: value.chapter,
    studyTimeToday: isPlanningStudyTime(value.studyTimeToday) ? value.studyTimeToday : "",
  };
}

export function isPlanningRoadmap(value: unknown): value is PlanningRoadmap {
  if (!isRecord(value) || value.roadmap_version !== "planning_roadmap_v2") return false;
  if (!nonEmptyString(value.class_level) || !nonEmptyString(value.subject)) return false;
  if (!nonEmptyString(value.chapter) || !nonEmptyString(value.chapter_slug)) return false;
  if (!isPlanningStudyTime(value.study_time_today) || !isPlanningCurriculum(value.curriculum)) return false;
  if (!Array.isArray(value.learning_units) || !value.learning_units.length) return false;
  if (!value.learning_units.every(isPlanningLearningUnit)) return false;
  if (!isPlanningNextStep(value.next_step) || !isPlanningProgress(value.progress)) return false;
  if (!isPlanningDailyRoute(value.daily_route)) return false;
  if (!isStringArray(value.completion_criteria, { nonEmpty: true }) || !isPlanningCoverage(value.coverage)) return false;

  const units = value.learning_units as PlanningLearningUnit[];
  const unitIds = units.map((unit) => unit.id);
  const unitIdSet = new Set(unitIds);
  const unitById = new Map(units.map((unit) => [unit.id, unit]));
  const orders = units.map((unit) => unit.order);
  const orderedUnits = [...units].sort((left, right) => left.order - right.order);
  if (unitIdSet.size !== units.length || new Set(orders).size !== units.length) return false;
  if ([...orders].sort((left, right) => left - right).some((order, index) => order !== index + 1)) return false;
  const nextStep = value.next_step as PlanningNextStep;
  const nextUnit = units.find((unit) => unit.id === nextStep.unit_id);
  if (!nextUnit || nextStep.title !== nextUnit.title) return false;
  if (units.some((unit) => {
    if (new Set(unit.prerequisite_unit_ids).size !== unit.prerequisite_unit_ids.length) return true;
    if (new Set(unit.dependent_unit_ids).size !== unit.dependent_unit_ids.length) return true;
    return unit.prerequisite_unit_ids.some((id) => {
      const prerequisite = unitById.get(id);
      return !prerequisite || prerequisite.id === unit.id || prerequisite.order >= unit.order;
    }) || unit.dependent_unit_ids.some((id) => {
      const dependent = unitById.get(id);
      return !dependent || dependent.id === unit.id || dependent.order <= unit.order;
    });
  })) return false;

  for (const unit of units) {
    const expectedDependents = units
      .filter((candidate) => candidate.prerequisite_unit_ids.includes(unit.id))
      .map((candidate) => candidate.id);
    if (unit.dependent_unit_ids.length !== expectedDependents.length) return false;
    if (unit.dependent_unit_ids.some((id) => !expectedDependents.includes(id))) return false;
  }

  const coverage = value.coverage as PlanningCoverage;
  if (coverage.unit_count !== units.length) return false;
  if (coverage.included_unit_ids.length !== units.length) return false;
  if (new Set(coverage.included_unit_ids).size !== units.length) return false;
  if (coverage.included_unit_ids.some((id) => !unitIdSet.has(id))) return false;
  if (coverage.included_unit_ids.some((id, index) => id !== orderedUnits[index].id)) return false;

  const progress = value.progress as PlanningProgress;
  if (progress.total_units !== units.length) return false;
  if (progress.mastered_units !== units.filter((unit) => unit.status === "mastered").length) return false;
  if (progress.learning_units !== units.filter((unit) => unit.status === "learning").length) return false;
  if (progress.practising_units !== units.filter((unit) => unit.status === "practising").length) return false;
  if (progress.needs_review_units !== units.filter((unit) => unit.status === "needs_review").length) return false;
  if (progress.percentage !== Math.round((progress.mastered_units / progress.total_units) * 100)) return false;
  const expectedNextUnit = orderedUnits.find((unit) => unit.status !== "mastered") || orderedUnits.at(-1);
  if (!expectedNextUnit || nextStep.unit_id !== expectedNextUnit.id) return false;
  const dailyRoute = value.daily_route as PlanningDailyRoute;
  if (dailyRoute.time_preference !== value.study_time_today) return false;
  const expectedBudget: Record<PlanningStudyTime, number | null> = {
    "15": 15,
    "30": 30,
    "60": 60,
    "120_plus": 120,
    no_limit: null,
  };
  if (dailyRoute.budget_minutes !== expectedBudget[dailyRoute.time_preference]) return false;
  if (dailyRoute.total_minutes !== dailyRoute.items.reduce((total, item) => total + item.minutes, 0)) return false;
  if (dailyRoute.budget_minutes !== null && dailyRoute.total_minutes > dailyRoute.budget_minutes) return false;
  if (dailyRoute.items[0]?.unit_id !== nextStep.unit_id) return false;
  const routeUnits = dailyRoute.items.map((item) => unitById.get(item.unit_id));
  if (routeUnits.some((unit) => !unit)) return false;
  if (new Set(dailyRoute.items.map((item) => item.unit_id)).size !== dailyRoute.items.length) return false;
  if (dailyRoute.items.some((item, index) => item.title !== routeUnits[index]?.title)) return false;
  if (routeUnits.some((unit, index) => index > 0 && Number(unit?.order) <= Number(routeUnits[index - 1]?.order))) return false;
  return true;
}

export function normalizePlanningRoadmap(value: unknown): PlanningRoadmap | null {
  if (!isPlanningRoadmap(value)) return null;
  return {
    ...value,
    learning_units: [...value.learning_units].sort((left, right) => left.order - right.order),
  };
}

export function normalizePlanningPlan(value: unknown): PlanningPlan | null {
  if (!isRecord(value) || !isRecord(value.scope)) return null;
  const roadmap = normalizePlanningRoadmap(value.roadmap);
  const scope = value.scope;
  if (!roadmap || typeof scope.chapter !== "string") return null;
  return {
    roadmap,
    scope: {
      chapter: scope.chapter,
      chapterLabel: typeof scope.chapterLabel === "string" ? scope.chapterLabel : roadmap.chapter,
      subject: typeof scope.subject === "string" ? scope.subject : roadmap.subject,
      classLevel: typeof scope.classLevel === "string" ? scope.classLevel : roadmap.class_level,
      studyTimeToday: isPlanningStudyTime(scope.studyTimeToday) ? scope.studyTimeToday : "",
    },
  };
}

export function getPlanningLearningUnits(roadmap?: PlanningRoadmap | null) {
  return roadmap?.learning_units?.filter(isPlanningLearningUnit).sort((left, right) => left.order - right.order) || [];
}

export function getPlanningUnit(roadmap: PlanningRoadmap, unitId: string) {
  return getPlanningLearningUnits(roadmap).find((unit) => unit.id === unitId);
}

export function planningTimeLabel(value?: PlanningStudyTime | "") {
  return PLANNING_STUDY_TIME_OPTIONS.find((option) => option.value === value)?.label || "Flexible";
}

export function isRetiredPlanningSnapshot(value: unknown) {
  if (!isRecord(value)) return false;
  if (isRecord(value.mission) && value.mission.brief_version === "chapter_focus_v1") return true;
  if (isRecord(value.roadmap) && value.roadmap.roadmap_version !== "planning_roadmap_v2") return true;
  return false;
}
