export type PlanningFocusLevel = "high" | "medium" | "light";

export interface PlanningFocusArea {
  focus_area_id: string;
  unit_ids: string[];
  unit_id: string;
  unit_titles: string[];
  title: string;
  subtopics: string[];
  focus_level: PlanningFocusLevel;
  reason: string;
  guidance: string;
}

export interface PlanningGuidanceStep {
  sequence: number;
  title: string;
  instruction: string;
  focus_unit_ids: string[];
}

export interface AutonomousMission {
  mission_id: string;
  status?: string;
  subject: string;
  chapter?: string;
  target_topic: string;
  target_source?: string;
  plan_scope: "chapter";
  brief_version: "chapter_focus_v1";
  chapter_summary: string;
  focus_areas: PlanningFocusArea[];
  guidance_steps: PlanningGuidanceStep[];
  completion_signal: string;
  coverage: {
    status: "complete";
    included_unit_ids: string[];
    unit_count: number;
  };
}

export interface PlanningDraft {
  classLevel: string;
  subject: string;
  chapter: string;
}

export interface PlanningScope {
  chapter: string;
  chapterLabel: string;
  subject: string;
  classLevel: string;
}

export interface PlanningPlan {
  mission: AutonomousMission;
  scope: PlanningScope;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function normalizePlanningDraft(value: unknown): PlanningDraft | null {
  if (!isRecord(value) || typeof value.chapter !== "string") return null;
  return {
    classLevel: typeof value.classLevel === "string" ? value.classLevel : "",
    subject: typeof value.subject === "string" ? value.subject : "",
    chapter: value.chapter,
  };
}

export function normalizePlanningPlan(value: unknown): PlanningPlan | null {
  if (!isRecord(value) || !isChapterPlanningMission(value.mission) || !isRecord(value.scope)) return null;
  const mission = value.mission;
  const scope = value.scope;
  if (typeof scope.chapter !== "string") return null;

  const plan: PlanningPlan = {
    mission,
    scope: {
      chapter: scope.chapter,
      chapterLabel: typeof scope.chapterLabel === "string"
        ? scope.chapterLabel
        : formatPlanningLabel(mission.chapter || scope.chapter),
      subject: typeof scope.subject === "string" ? scope.subject : mission.subject,
      classLevel: typeof scope.classLevel === "string" ? scope.classLevel : "",
    },
  };
  return plan;
}

export function formatPlanningLabel(value?: string | number) {
  if (value === undefined || value === null || value === "") return "Not set";
  return String(value).replace(/_/g, " ");
}

export function getPlanningFocusAreas(mission?: AutonomousMission | null): PlanningFocusArea[] {
  return mission?.focus_areas?.filter(isPlanningFocusArea) || [];
}

export function getPlanningGuidanceSteps(mission?: AutonomousMission | null): PlanningGuidanceStep[] {
  return mission?.guidance_steps?.filter(isPlanningGuidanceStep) || [];
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && Boolean(value.trim());
}

function isPlanningFocusArea(value: unknown): value is PlanningFocusArea {
  return Boolean(
    isRecord(value)
    && nonEmptyString(value.focus_area_id)
    && Array.isArray(value.unit_ids)
    && value.unit_ids.length > 0
    && value.unit_ids.every(nonEmptyString)
    && nonEmptyString(value.unit_id)
    && value.unit_id === value.unit_ids[0]
    && Array.isArray(value.unit_titles)
    && value.unit_titles.length === value.unit_ids.length
    && value.unit_titles.every(nonEmptyString)
    && nonEmptyString(value.title)
    && Array.isArray(value.subtopics)
    && value.subtopics.length >= 1
    && value.subtopics.length <= 4
    && value.subtopics.every(nonEmptyString)
    && ["high", "medium", "light"].includes(String(value.focus_level))
    && nonEmptyString(value.reason)
    && nonEmptyString(value.guidance),
  );
}

function isPlanningGuidanceStep(value: unknown, index?: number): value is PlanningGuidanceStep {
  return Boolean(
    isRecord(value)
    && (index === undefined || value.sequence === index + 1)
    && Number.isInteger(value.sequence)
    && nonEmptyString(value.title)
    && nonEmptyString(value.instruction)
    && Array.isArray(value.focus_unit_ids)
    && value.focus_unit_ids.length > 0
    && value.focus_unit_ids.every(nonEmptyString),
  );
}

export function isChapterPlanningMission(value: unknown): value is AutonomousMission {
  if (!isRecord(value) || value.plan_scope !== "chapter" || value.brief_version !== "chapter_focus_v1") return false;
  if (!Array.isArray(value.focus_areas) || !value.focus_areas.length || value.focus_areas.length > 5) return false;
  if (!value.focus_areas.every(isPlanningFocusArea)) return false;
  if (!Array.isArray(value.guidance_steps) || value.guidance_steps.length < 3 || value.guidance_steps.length > 5) return false;
  if (!value.guidance_steps.every(isPlanningGuidanceStep)) return false;
  if (!isRecord(value.coverage) || value.coverage.status !== "complete") return false;

  const areaIds = value.focus_areas.map((area) => area.focus_area_id);
  const focusLevels = new Set(value.focus_areas.map((area) => area.focus_level));
  if (!focusLevels.has("high")) return false;
  if (value.focus_areas.length >= 2 && !focusLevels.has("medium")) return false;
  if (value.focus_areas.length >= 3 && !focusLevels.has("light")) return false;
  const unitIds = value.focus_areas.flatMap((area) => area.unit_ids);
  const unitIdSet = new Set(unitIds);
  const includedIds = Array.isArray(value.coverage.included_unit_ids)
    ? value.coverage.included_unit_ids.filter(nonEmptyString)
    : [];
  if (new Set(areaIds).size !== areaIds.length || unitIdSet.size !== unitIds.length) return false;
  if (includedIds.length !== unitIds.length || new Set(includedIds).size !== unitIds.length) return false;
  if (value.coverage.unit_count !== unitIds.length || includedIds.some((id) => !unitIdSet.has(id))) return false;
  const guidedIds = new Set(value.guidance_steps.flatMap((step) => step.focus_unit_ids));
  if (Array.from(guidedIds).some((id) => !unitIdSet.has(id))) return false;
  if (unitIds.some((id) => !guidedIds.has(id))) return false;

  return Boolean(
    nonEmptyString(value.mission_id)
    && nonEmptyString(value.subject)
    && nonEmptyString(value.target_topic)
    && nonEmptyString(value.chapter_summary)
    && nonEmptyString(value.completion_signal),
  );
}

export function isRetiredTopicPlanningSnapshot(value: unknown) {
  if (!isRecord(value) || !isRecord(value.mission)) return false;
  return !isChapterPlanningMission(value.mission);
}
