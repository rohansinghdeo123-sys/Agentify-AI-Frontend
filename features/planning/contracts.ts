export const PLANNING_PROFICIENCY_OPTIONS = [
  {
    value: "new_to_it",
    label: "New to It",
    description: "I haven’t studied this chapter before.",
  },
  {
    value: "know_a_little",
    label: "Know a Little",
    description: "I’ve seen it, but I’m not confident.",
  },
  {
    value: "know_the_basics",
    label: "Know the Basics",
    description: "I understand the fundamentals but need stronger practice.",
  },
  {
    value: "mostly_confident",
    label: "Mostly Confident",
    description: "I mainly need revision, practice and gap-finding.",
  },
] as const;

export const PLANNING_STUDY_TIME_OPTIONS = [
  { value: "15", label: "15 min" },
  { value: "30", label: "30 min" },
  { value: "60", label: "1 hour" },
  { value: "120_plus", label: "2+ hours" },
  { value: "no_limit", label: "No limit" },
] as const;

export type PlanningChapterProficiency = (typeof PLANNING_PROFICIENCY_OPTIONS)[number]["value"];
export type PlanningStudyTime = (typeof PLANNING_STUDY_TIME_OPTIONS)[number]["value"];
export type PlanningImportance = "very_high" | "high" | "moderate" | "low";
export type PlanningDifficulty = "foundation" | "steady" | "challenging";
export type PlanningDepth = "overview" | "working" | "mastery";
export type PlanningUnitStatus = "not_started" | "recommended" | "learning" | "practising" | "needs_review" | "mastered";

export interface PlanningNcertSection {
  id: string;
  title: string;
}

export interface PlanningNcertSubtopic {
  id: string;
  title: string;
  section_id: string;
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
  ncert_subtopics: PlanningNcertSubtopic[];
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
  importance: PlanningImportance;
  learning_types: string[];
  approach: string[];
  outcome: string;
}

export interface PlanningDailyRouteItem {
  unit_id: string;
  title: string;
  activity: string;
  reason: string;
  role: "main_focus" | "quick_check";
  minutes: number;
  scope: "partial" | "full_unit";
}

export interface PlanningDailyRoute {
  source: "default_focus" | "student_choice" | "session_state";
  budget_minutes: number | null;
  estimated_minutes: PlanningTimeRange;
  total_minutes: number;
  items: PlanningDailyRouteItem[];
}

export interface PlanningProgress {
  mastered_units: number;
  learning_units: number;
  practising_units: number;
  needs_review_units: number;
  recommended_units: number;
  total_units: number;
  percentage: number;
}

export interface PlanningCurriculum {
  key: string;
  source: string;
  source_reference: Record<string, unknown>;
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
  chapter_proficiency: PlanningChapterProficiency;
  study_time_today: PlanningStudyTime | null;
  session_duration_minutes: number | null;
  curriculum: PlanningCurriculum;
  learning_units: PlanningLearningUnit[];
  next_step: PlanningNextStep;
  daily_route: PlanningDailyRoute;
  progress: PlanningProgress;
  completion_criteria: string[];
  coverage: PlanningCoverage;
}

export interface PlanningChapterChoice {
  chapter: string;
  chapterProficiency: PlanningChapterProficiency | "";
}

export interface PlanningDraft {
  classLevel: string;
  subject: string;
  chapterChoices: PlanningChapterChoice[];
  studyTimeToday: PlanningStudyTime | "";
}

export interface PlanningScope {
  chapter: string;
  chapterLabel: string;
  subject: string;
  classLevel: string;
  chapterProficiency: PlanningChapterProficiency;
  studyTimeToday: PlanningStudyTime | "";
  /** Optional context supplied by an existing learning session, never setup UI. */
  sessionDurationMinutes?: number;
}

export interface PlanningPlan {
  roadmap: PlanningRoadmap;
  scope: PlanningScope;
}

export interface PlanningSelectionFactor {
  id: string;
  label: string;
  value: string;
  score: number;
  explanation: string;
}

export interface PlanningPortfolioChapter {
  curriculum_key: string;
  chapter_slug: string;
  chapter: string;
  chapter_proficiency: PlanningChapterProficiency;
  roadmap_version: "planning_roadmap_v2";
  curriculum: PlanningCurriculum;
  learning_units: PlanningLearningUnit[];
  next_step: PlanningNextStep;
  progress: PlanningProgress;
  coverage: PlanningCoverage;
  completion_criteria: string[];
  candidate_score: number;
  selection_factors: PlanningSelectionFactor[];
  selected_for_today: boolean;
}

export interface PlanningPortfolioNextStep extends PlanningNextStep {
  curriculum_key: string;
  chapter_slug: string;
  chapter: string;
  chapter_proficiency: PlanningChapterProficiency;
  selection_reason: string;
  candidate_score: number;
}

export interface PlanningPortfolioRouteItem extends PlanningDailyRouteItem {
  curriculum_key: string;
  chapter_slug: string;
  chapter: string;
}

export interface PlanningPortfolioTodayRoute extends Omit<PlanningDailyRoute, "items"> {
  items: PlanningPortfolioRouteItem[];
}

export interface PlanningPortfolioProgress {
  mastered_units: number;
  active_units: number;
  needs_review_units: number;
  total_units: number;
  percentage: number;
}

export interface PlanningPortfolio {
  portfolio_version: "planning_portfolio_v1";
  user_id: string;
  class_level: string;
  subject: string;
  requested_chapter_count: number;
  chapter_count: number;
  deduplicated_chapter_count: number;
  study_time_today: PlanningStudyTime | null;
  session_duration_minutes: number | null;
  chapters: PlanningPortfolioChapter[];
  global_next_step: PlanningPortfolioNextStep;
  today_route: PlanningPortfolioTodayRoute;
  selection_factors: PlanningSelectionFactor[];
  aggregate_progress: PlanningPortfolioProgress;
}

export interface PlanningPortfolioState {
  portfolio: PlanningPortfolio;
  activeChapterSlug: string;
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

export function isPlanningChapterProficiency(value: unknown): value is PlanningChapterProficiency {
  return PLANNING_PROFICIENCY_OPTIONS.some((option) => option.value === value);
}

export function isPlanningStudyTime(value: unknown): value is PlanningStudyTime {
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
  return ["not_started", "recommended", "learning", "practising", "needs_review", "mastered"].includes(String(value));
}

function isPlanningTimeRange(value: unknown): value is PlanningTimeRange {
  return Boolean(
    isRecord(value)
    && isIntegerInRange(value.min, 5, 180)
    && isIntegerInRange(value.max, Number(value.min), 180),
  );
}

function isPlanningNcertSection(value: unknown): value is PlanningNcertSection {
  return Boolean(isRecord(value) && nonEmptyString(value.id) && nonEmptyString(value.title));
}

function isPlanningNcertSubtopic(value: unknown): value is PlanningNcertSubtopic {
  return Boolean(
    isRecord(value)
    && nonEmptyString(value.id)
    && nonEmptyString(value.title)
    && nonEmptyString(value.section_id),
  );
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
    && Array.isArray(value.ncert_subtopics)
    && value.ncert_subtopics.length > 0
    && value.ncert_subtopics.every(isPlanningNcertSubtopic)
    && value.ncert_subtopics.every((subtopic) => (
      (value.ncert_sections as PlanningNcertSection[]).some((section) => section.id === subtopic.section_id)
    ))
    && Array.isArray(value.concepts)
    && value.concepts.length > 0
    && value.concepts.every(isPlanningConceptDetail)
    && isStringArray(value.skills)
    && isStringArray(value.practice)
    && isStringArray(value.learning_route, { nonEmpty: true })
    && value.learning_route.length >= 2
    && value.learning_route.length <= 4
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
    && isPlanningTimeRange(value.estimated_minutes)
    && isPlanningImportance(value.importance)
    && isStringArray(value.learning_types, { nonEmpty: true })
    && isStringArray(value.approach, { nonEmpty: true })
    && value.approach.length >= 2
    && value.approach.length <= 4
    && nonEmptyString(value.outcome),
  );
}

function isPlanningDailyRouteItem(value: unknown): value is PlanningDailyRouteItem {
  return Boolean(
    isRecord(value)
    && nonEmptyString(value.unit_id)
    && nonEmptyString(value.title)
    && nonEmptyString(value.activity)
    && nonEmptyString(value.reason)
    && ["main_focus", "quick_check"].includes(String(value.role))
    && isIntegerInRange(value.minutes, 5, 180)
    && ["partial", "full_unit"].includes(String(value.scope)),
  );
}

function isPlanningDailyRoute(value: unknown): value is PlanningDailyRoute {
  return Boolean(
    isRecord(value)
    && ["default_focus", "student_choice", "session_state"].includes(String(value.source))
    && (value.budget_minutes === null || isIntegerInRange(value.budget_minutes, 15, 120))
    && isPlanningTimeRange(value.estimated_minutes)
    && isIntegerInRange(value.total_minutes, 5, 180)
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
    value.recommended_units,
    value.total_units,
  ];
  if (!fields.every((field) => isIntegerInRange(field, 0))) return false;
  if (!isIntegerInRange(value.recommended_units, 0, 1)) return false;
  if (!isIntegerInRange(value.percentage, 0, 100)) return false;
  return Number(value.mastered_units)
    + Number(value.learning_units)
    + Number(value.practising_units)
    + Number(value.needs_review_units)
    + Number(value.recommended_units) <= Number(value.total_units);
}

function isPlanningCurriculum(value: unknown): value is PlanningCurriculum {
  return Boolean(
    isRecord(value)
    && nonEmptyString(value.key)
    && nonEmptyString(value.source)
    && isRecord(value.source_reference)
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
  if (!isRecord(value)) return null;
  const legacyChapter = [
    value.chapter,
    value.currentChapter,
    value.current_chapter,
    value.targetChapter,
    value.target_chapter,
  ].find((candidate) => typeof candidate === "string" && candidate.trim());
  const rawChoices = Array.isArray(value.chapterChoices)
    ? value.chapterChoices
    : Array.isArray(value.chapter_choices)
      ? value.chapter_choices
      : typeof legacyChapter === "string"
      ? [{
          chapter: legacyChapter,
          chapterProficiency: planningProficiencyFromRecord(value),
        }]
      : [];
  const seen = new Set<string>();
  const chapterChoices = rawChoices.flatMap((rawChoice) => {
    if (!isRecord(rawChoice) || !nonEmptyString(rawChoice.chapter)) return [];
    const chapter = rawChoice.chapter.trim();
    const identity = normalizePlanningChoice(chapter);
    if (!identity || seen.has(identity) || seen.size >= 6) return [];
    seen.add(identity);
    return [{
      chapter,
      chapterProficiency: legacyPlanningProficiency(
        rawChoice.chapterProficiency ?? rawChoice.chapter_proficiency,
      ),
    } satisfies PlanningChapterChoice];
  });
  return {
    classLevel: typeof value.classLevel === "string"
      ? value.classLevel
      : typeof value.class_level === "string"
        ? value.class_level
        : "",
    subject: typeof value.subject === "string" ? value.subject : "",
    chapterChoices,
    studyTimeToday: planningStudyTimeFromRecord(value),
  };
}

function normalizePlanningChoice(value: unknown) {
  return typeof value === "string"
    ? value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "")
    : "";
}

function legacyPlanningProficiency(value: unknown): PlanningChapterProficiency | "" {
  const normalized = normalizePlanningChoice(value);
  if (isPlanningChapterProficiency(normalized)) return normalized;
  return {
    new: "new_to_it",
    weak_basics: "know_a_little",
    some_idea: "know_a_little",
    know_basics: "know_the_basics",
    fast_track: "mostly_confident",
    quick_revision: "mostly_confident",
  }[normalized] as PlanningChapterProficiency | undefined || "";
}

function planningProficiencyFromRecord(value: Record<string, unknown>): PlanningChapterProficiency | "" {
  const explicit = legacyPlanningProficiency(
    value.chapterProficiency ?? value.chapter_proficiency,
  );
  if (explicit) return explicit;
  const legacyGoal = legacyPlanningProficiency(
    value.planGoal ?? value.plan_goal ?? value.learningGoal ?? value.learning_goal,
  );
  if (legacyGoal) return legacyGoal;
  return legacyPlanningProficiency(value.currentKnowledge ?? value.current_knowledge);
}

function planningStudyTimeFromRecord(value: Record<string, unknown>): PlanningStudyTime | "" {
  const explicit = value.studyTimeToday ?? value.study_time_today;
  if (isPlanningStudyTime(explicit)) return explicit;
  const duration = value.sessionDurationMinutes ?? value.session_duration_minutes;
  if (duration === 15 || duration === "15") return "15";
  if (duration === 30 || duration === "30") return "30";
  if (duration === 60 || duration === "60") return "60";
  if (duration === 120 || duration === "120") return "120_plus";
  return "";
}

export function isPlanningRoadmap(value: unknown): value is PlanningRoadmap {
  if (!isRecord(value) || value.roadmap_version !== "planning_roadmap_v2") return false;
  if (!nonEmptyString(value.class_level) || !nonEmptyString(value.subject)) return false;
  if (!nonEmptyString(value.chapter) || !nonEmptyString(value.chapter_slug)) return false;
  if (!isPlanningChapterProficiency(value.chapter_proficiency)) return false;
  if (value.study_time_today !== null && !isPlanningStudyTime(value.study_time_today)) return false;
  if (value.session_duration_minutes !== null && !isIntegerInRange(value.session_duration_minutes, 15, 120)) return false;
  if (!isPlanningCurriculum(value.curriculum)) return false;
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
  if (nextStep.importance !== nextUnit.importance) return false;
  // Next Step timing is route guidance. The Learning Unit card independently
  // retains the complete-unit range and must not overwrite this value.
  if (nextStep.learning_types.length !== nextUnit.learning_types.length) return false;
  if (nextStep.learning_types.some((type, index) => type !== nextUnit.learning_types[index])) return false;
  if (units.some((unit) => {
    if (new Set(unit.ncert_subtopics.map((subtopic) => subtopic.id)).size !== unit.ncert_subtopics.length) return true;
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
  if (progress.recommended_units !== units.filter((unit) => unit.status === "recommended").length) return false;
  if (progress.percentage !== Math.round((progress.mastered_units / progress.total_units) * 100)) return false;
  const expectedNextUnit = orderedUnits.find((unit) => unit.status !== "mastered") || orderedUnits.at(-1);
  if (!expectedNextUnit || nextStep.unit_id !== expectedNextUnit.id) return false;
  const dailyRoute = value.daily_route as PlanningDailyRoute;
  if (nextStep.estimated_minutes.min !== dailyRoute.estimated_minutes.min) return false;
  if (nextStep.estimated_minutes.max !== dailyRoute.estimated_minutes.max) return false;
  const sessionDuration = value.session_duration_minutes as number | null;
  const studyTime = value.study_time_today as PlanningStudyTime | null;
  const selectedBudget: Record<PlanningStudyTime, number | null> = {
    "15": 15,
    "30": 30,
    "60": 60,
    "120_plus": 120,
    no_limit: null,
  };
  const expectedSource = studyTime !== null
    ? "student_choice"
    : sessionDuration !== null
      ? "session_state"
      : "default_focus";
  const expectedBudget = studyTime !== null
    ? selectedBudget[studyTime]
    : sessionDuration !== null
      ? Math.floor(sessionDuration / 5) * 5
      : 30;
  if (dailyRoute.source !== expectedSource || dailyRoute.budget_minutes !== expectedBudget) return false;
  if (dailyRoute.total_minutes !== dailyRoute.items.reduce((total, item) => total + item.minutes, 0)) return false;
  if (dailyRoute.budget_minutes !== null && dailyRoute.total_minutes > dailyRoute.budget_minutes) return false;
  if (dailyRoute.total_minutes < dailyRoute.estimated_minutes.min) return false;
  if (dailyRoute.total_minutes > dailyRoute.estimated_minutes.max) return false;
  if (dailyRoute.items[0]?.unit_id !== nextStep.unit_id) return false;
  if (dailyRoute.items.some((item) => item.unit_id !== nextStep.unit_id)) return false;
  const routeUnits = dailyRoute.items.map((item) => unitById.get(item.unit_id));
  if (routeUnits.some((unit) => !unit)) return false;
  if (new Set(dailyRoute.items.map((item) => `${item.unit_id}:${item.role}`)).size !== dailyRoute.items.length) return false;
  if (dailyRoute.items.some((item, index) => item.title !== routeUnits[index]?.title)) return false;
  if (routeUnits.some((unit, index) => index > 0 && Number(unit?.order) < Number(routeUnits[index - 1]?.order))) return false;
  if (dailyRoute.items.some((item, index) => (
    index > 0
    && item.unit_id === dailyRoute.items[index - 1]?.unit_id
    && item.role === "main_focus"
    && dailyRoute.items[index - 1]?.role === "quick_check"
  ))) return false;
  return true;
}

export function normalizePlanningRoadmap(value: unknown): PlanningRoadmap | null {
  // V2 roadmaps saved before the optional time selector did not carry the
  // nullable preference and used a 25-minute default. Upgrade them in memory
  // so students keep their roadmap when the v6 device schema is introduced.
  let candidate: unknown = value;
  if (isRecord(value) && value.study_time_today === undefined) {
    const migratedRoute = isRecord(value.daily_route)
      && value.daily_route.source === "default_focus"
      && value.daily_route.budget_minutes === 25
      ? { ...value.daily_route, budget_minutes: 30 }
      : value.daily_route;
    const migratedNextStep = isRecord(value.next_step)
      && isRecord(migratedRoute)
      && isRecord(migratedRoute.estimated_minutes)
      ? { ...value.next_step, estimated_minutes: migratedRoute.estimated_minutes }
      : value.next_step;
    candidate = {
      ...value,
      study_time_today: null,
      daily_route: migratedRoute,
      next_step: migratedNextStep,
    };
  }
  if (!isPlanningRoadmap(candidate)) return null;
  return {
    ...candidate,
    learning_units: [...candidate.learning_units].sort((left, right) => left.order - right.order),
  };
}

export function normalizePlanningPlan(value: unknown): PlanningPlan | null {
  if (!isRecord(value) || !isRecord(value.scope)) return null;
  const roadmap = normalizePlanningRoadmap(value.roadmap);
  if (!roadmap) return null;
  // The validated server roadmap is the canonical source for a restored
  // snapshot. Device scope is merely the request context and may be stale or
  // partially migrated; rebuilding it here prevents refreshes from applying a
  // different chapter, proficiency, or session duration than the rendered UI.
  const sessionDurationMinutes = roadmap.session_duration_minutes ?? undefined;
  return {
    roadmap,
    scope: {
      chapter: roadmap.chapter_slug,
      chapterLabel: roadmap.chapter,
      subject: roadmap.subject,
      classLevel: roadmap.class_level,
      chapterProficiency: roadmap.chapter_proficiency,
      studyTimeToday: roadmap.study_time_today ?? "",
      ...(sessionDurationMinutes ? { sessionDurationMinutes } : {}),
    },
  };
}

function isPlanningSelectionFactor(value: unknown): value is PlanningSelectionFactor {
  return Boolean(
    isRecord(value)
    && nonEmptyString(value.id)
    && nonEmptyString(value.label)
    && nonEmptyString(value.value)
    && typeof value.score === "number"
    && Number.isFinite(value.score)
    && nonEmptyString(value.explanation),
  );
}

function isPlanningPortfolioChapter(value: unknown): value is PlanningPortfolioChapter {
  return Boolean(
    isRecord(value)
    && nonEmptyString(value.curriculum_key)
    && nonEmptyString(value.chapter_slug)
    && nonEmptyString(value.chapter)
    && isPlanningChapterProficiency(value.chapter_proficiency)
    && value.roadmap_version === "planning_roadmap_v2"
    && isPlanningCurriculum(value.curriculum)
    && Array.isArray(value.learning_units)
    && value.learning_units.length > 0
    && value.learning_units.every(isPlanningLearningUnit)
    && isPlanningNextStep(value.next_step)
    && isPlanningProgress(value.progress)
    && isPlanningCoverage(value.coverage)
    && isStringArray(value.completion_criteria, { nonEmpty: true })
    && typeof value.candidate_score === "number"
    && Number.isFinite(value.candidate_score)
    && Array.isArray(value.selection_factors)
    && value.selection_factors.every(isPlanningSelectionFactor)
    && typeof value.selected_for_today === "boolean",
  );
}

function isPlanningPortfolioNextStep(value: unknown): value is PlanningPortfolioNextStep {
  return Boolean(
    isRecord(value)
    && isPlanningNextStep(value)
    && nonEmptyString(value.curriculum_key)
    && nonEmptyString(value.chapter_slug)
    && nonEmptyString(value.chapter)
    && isPlanningChapterProficiency(value.chapter_proficiency)
    && nonEmptyString(value.selection_reason)
    && typeof value.candidate_score === "number"
    && Number.isFinite(value.candidate_score),
  );
}

function isPlanningPortfolioRouteItem(value: unknown): value is PlanningPortfolioRouteItem {
  return Boolean(
    isRecord(value)
    && isPlanningDailyRouteItem(value)
    && nonEmptyString(value.curriculum_key)
    && nonEmptyString(value.chapter_slug)
    && nonEmptyString(value.chapter),
  );
}

function isPlanningPortfolioTodayRoute(value: unknown): value is PlanningPortfolioTodayRoute {
  if (!isRecord(value)) return false;
  const budget = value.budget_minutes;
  const totalMinutes = value.total_minutes;
  return Boolean(
    ["default_focus", "student_choice", "session_state"].includes(String(value.source))
    && (budget === null || isIntegerInRange(budget, 15, 120))
    && isPlanningTimeRange(value.estimated_minutes)
    && isIntegerInRange(totalMinutes, 5, 180)
    && Array.isArray(value.items)
    && value.items.length > 0
    && value.items.every(isPlanningPortfolioRouteItem)
    && totalMinutes === value.items.reduce((total, item) => total + Number((item as PlanningPortfolioRouteItem).minutes), 0)
    && (budget === null || Number(totalMinutes) <= Number(budget)),
  );
}

function isPlanningPortfolioProgress(value: unknown): value is PlanningPortfolioProgress {
  return Boolean(
    isRecord(value)
    && isIntegerInRange(value.mastered_units, 0)
    && isIntegerInRange(value.active_units, 0)
    && isIntegerInRange(value.needs_review_units, 0)
    && isIntegerInRange(value.total_units, 1)
    && isIntegerInRange(value.percentage, 0, 100)
    && Number(value.mastered_units) <= Number(value.total_units),
  );
}

export function isPlanningPortfolio(value: unknown): value is PlanningPortfolio {
  if (!isRecord(value) || value.portfolio_version !== "planning_portfolio_v1") return false;
  if (!nonEmptyString(value.user_id) || !nonEmptyString(value.class_level) || !nonEmptyString(value.subject)) return false;
  if (!isIntegerInRange(value.requested_chapter_count, 1, 6)) return false;
  if (!isIntegerInRange(value.chapter_count, 1, 6)) return false;
  if (!isIntegerInRange(value.deduplicated_chapter_count, 0, 5)) return false;
  if (Number(value.requested_chapter_count) !== Number(value.chapter_count) + Number(value.deduplicated_chapter_count)) return false;
  if (value.study_time_today !== null && !isPlanningStudyTime(value.study_time_today)) return false;
  if (value.session_duration_minutes !== null && !isIntegerInRange(value.session_duration_minutes, 15, 120)) return false;
  if (!Array.isArray(value.chapters) || value.chapters.length !== value.chapter_count) return false;
  if (!value.chapters.every(isPlanningPortfolioChapter)) return false;
  if (!isPlanningPortfolioNextStep(value.global_next_step)) return false;
  if (!isPlanningPortfolioTodayRoute(value.today_route)) return false;
  if (!Array.isArray(value.selection_factors) || !value.selection_factors.every(isPlanningSelectionFactor)) return false;
  if (!isPlanningPortfolioProgress(value.aggregate_progress)) return false;

  const chapters = value.chapters as PlanningPortfolioChapter[];
  const chapterSlugs = chapters.map((chapter) => chapter.chapter_slug);
  const curriculumKeys = chapters.map((chapter) => chapter.curriculum_key);
  if (new Set(chapterSlugs).size !== chapters.length || new Set(curriculumKeys).size !== chapters.length) return false;
  const selectedChapter = chapters.find((chapter) => chapter.selected_for_today);
  if (!selectedChapter || chapters.filter((chapter) => chapter.selected_for_today).length !== 1) return false;
  const globalNextStep = value.global_next_step as PlanningPortfolioNextStep;
  if (selectedChapter.chapter_slug !== globalNextStep.chapter_slug) return false;
  if (selectedChapter.curriculum_key !== globalNextStep.curriculum_key) return false;
  if (selectedChapter.next_step.unit_id !== globalNextStep.unit_id) return false;
  if ((value.today_route as PlanningPortfolioTodayRoute).items.some((item) => (
    item.chapter_slug !== selectedChapter.chapter_slug
    || item.curriculum_key !== selectedChapter.curriculum_key
  ))) return false;
  const totalUnits = chapters.reduce((total, chapter) => total + chapter.progress.total_units, 0);
  if ((value.aggregate_progress as PlanningPortfolioProgress).total_units !== totalUnits) return false;
  return true;
}

export function normalizePlanningPortfolio(value: unknown): PlanningPortfolio | null {
  if (!isPlanningPortfolio(value)) return null;
  return {
    ...value,
    chapters: [...value.chapters].map((chapter) => ({
      ...chapter,
      learning_units: [...chapter.learning_units].sort((left, right) => left.order - right.order),
    })),
  };
}

export function planningPortfolioFromPlan(plan: PlanningPlan, userId: string): PlanningPortfolio {
  const { roadmap } = plan;
  const factor: PlanningSelectionFactor = {
    id: "legacy_priority",
    label: "Saved roadmap",
    value: "restored",
    score: 0,
    explanation: "This chapter was restored from your previous single-chapter roadmap.",
  };
  return {
    portfolio_version: "planning_portfolio_v1",
    user_id: userId,
    class_level: roadmap.class_level,
    subject: roadmap.subject,
    requested_chapter_count: 1,
    chapter_count: 1,
    deduplicated_chapter_count: 0,
    study_time_today: roadmap.study_time_today,
    session_duration_minutes: roadmap.session_duration_minutes,
    chapters: [{
      curriculum_key: roadmap.curriculum.key,
      chapter_slug: roadmap.chapter_slug,
      chapter: roadmap.chapter,
      chapter_proficiency: roadmap.chapter_proficiency,
      roadmap_version: roadmap.roadmap_version,
      curriculum: roadmap.curriculum,
      learning_units: roadmap.learning_units,
      next_step: roadmap.next_step,
      progress: roadmap.progress,
      coverage: roadmap.coverage,
      completion_criteria: roadmap.completion_criteria,
      candidate_score: 0,
      selection_factors: [factor],
      selected_for_today: true,
    }],
    global_next_step: {
      ...roadmap.next_step,
      curriculum_key: roadmap.curriculum.key,
      chapter_slug: roadmap.chapter_slug,
      chapter: roadmap.chapter,
      chapter_proficiency: roadmap.chapter_proficiency,
      selection_reason: factor.explanation,
      candidate_score: 0,
    },
    today_route: {
      ...roadmap.daily_route,
      items: roadmap.daily_route.items.map((item) => ({
        ...item,
        curriculum_key: roadmap.curriculum.key,
        chapter_slug: roadmap.chapter_slug,
        chapter: roadmap.chapter,
      })),
    },
    selection_factors: [factor],
    aggregate_progress: {
      mastered_units: roadmap.progress.mastered_units,
      active_units: roadmap.progress.learning_units + roadmap.progress.practising_units + roadmap.progress.recommended_units,
      needs_review_units: roadmap.progress.needs_review_units,
      total_units: roadmap.progress.total_units,
      percentage: roadmap.progress.percentage,
    },
  };
}

export function planningRoadmapFromPortfolioChapter(
  portfolio: PlanningPortfolio,
  chapter: PlanningPortfolioChapter,
): PlanningRoadmap {
  const selectedRouteItems = portfolio.today_route.items
    .filter((item) => item.chapter_slug === chapter.chapter_slug)
    .map((item): PlanningDailyRouteItem => ({
      unit_id: item.unit_id,
      title: item.title,
      activity: item.activity,
      reason: item.reason,
      role: item.role,
      minutes: item.minutes,
      scope: item.scope,
    }));
  const dailyRoute: PlanningDailyRoute = selectedRouteItems.length
    ? { ...portfolio.today_route, items: selectedRouteItems }
    : {
        source: "default_focus",
        budget_minutes: null,
        estimated_minutes: chapter.next_step.estimated_minutes,
        total_minutes: chapter.next_step.estimated_minutes.min,
        items: [{
          unit_id: chapter.next_step.unit_id,
          title: chapter.next_step.title,
          activity: chapter.next_step.approach[0] || `Begin ${chapter.next_step.title}.`,
          reason: chapter.next_step.reason,
          role: "main_focus",
          minutes: chapter.next_step.estimated_minutes.min,
          scope: "partial",
        }],
      };
  return {
    roadmap_version: chapter.roadmap_version,
    class_level: portfolio.class_level,
    subject: portfolio.subject,
    chapter: chapter.chapter,
    chapter_slug: chapter.chapter_slug,
    chapter_proficiency: chapter.chapter_proficiency,
    study_time_today: portfolio.study_time_today,
    session_duration_minutes: portfolio.session_duration_minutes,
    curriculum: chapter.curriculum,
    learning_units: chapter.learning_units,
    next_step: chapter.next_step,
    daily_route: dailyRoute,
    progress: chapter.progress,
    completion_criteria: chapter.completion_criteria,
    coverage: chapter.coverage,
  };
}

export function planningPlanFromPortfolioState(state: PlanningPortfolioState): PlanningPlan | null {
  const chapter = state.portfolio.chapters.find((item) => item.chapter_slug === state.activeChapterSlug)
    || state.portfolio.chapters.find((item) => item.selected_for_today)
    || state.portfolio.chapters[0];
  if (!chapter) return null;
  return {
    roadmap: planningRoadmapFromPortfolioChapter(state.portfolio, chapter),
    scope: {
      chapter: chapter.chapter_slug,
      chapterLabel: chapter.chapter,
      subject: state.portfolio.subject,
      classLevel: state.portfolio.class_level,
      chapterProficiency: chapter.chapter_proficiency,
      studyTimeToday: state.portfolio.study_time_today ?? "",
      ...(state.portfolio.session_duration_minutes
        ? { sessionDurationMinutes: state.portfolio.session_duration_minutes }
        : {}),
    },
  };
}

export function getPlanningLearningUnits(roadmap?: Pick<PlanningRoadmap, "learning_units"> | null) {
  return roadmap?.learning_units?.filter(isPlanningLearningUnit).sort((left, right) => left.order - right.order) || [];
}

export function getPlanningUnit(roadmap: Pick<PlanningRoadmap, "learning_units">, unitId: string) {
  return getPlanningLearningUnits(roadmap).find((unit) => unit.id === unitId);
}

export function isRetiredPlanningSnapshot(value: unknown) {
  if (!isRecord(value)) return false;
  if (isRecord(value.mission) && value.mission.brief_version === "chapter_focus_v1") return true;
  if (isRecord(value.roadmap) && value.roadmap.roadmap_version !== "planning_roadmap_v2") return true;
  return false;
}
