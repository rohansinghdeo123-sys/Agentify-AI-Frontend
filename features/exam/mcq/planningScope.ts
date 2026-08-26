type SearchParamsReader = {
  get(name: string): string | null;
};

export type PlanningExamScope = {
  source: "planning";
  catalogSource: "planning_manifest";
  classLevel: string;
  subject: string;
  chapter: string;
  chapterLabel: string;
  topic: string;
  topicLabel: string;
};

export type PlanningMcqScope = PlanningExamScope;
type PlanningScopeFields = Omit<PlanningExamScope, "source" | "catalogSource">;

function cleanLabel(value: string | null, maximum: number) {
  return String(value || "").trim().slice(0, maximum);
}

function cleanId(value: string | null) {
  return cleanLabel(value, 180)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function readPlanningExamScope(searchParams: SearchParamsReader): PlanningExamScope | null {
  if (searchParams.get("source") !== "planning") return null;
  const classLevel = cleanLabel(searchParams.get("classLevel"), 64);
  const subject = cleanLabel(searchParams.get("subject"), 120);
  const chapter = cleanId(searchParams.get("chapter"));
  const chapterLabel = cleanLabel(searchParams.get("chapterLabel"), 180);
  const topic = cleanId(searchParams.get("topic"));
  const topicLabel = cleanLabel(searchParams.get("topicLabel"), 180);
  if (!classLevel || !subject || !chapter || !chapterLabel || !topic || !topicLabel) return null;
  return {
    source: "planning",
    catalogSource: "planning_manifest",
    classLevel,
    subject,
    chapter,
    chapterLabel,
    topic,
    topicLabel,
  };
}

export const readPlanningMcqScope = readPlanningExamScope;

function planningScopeParams(scope: PlanningScopeFields) {
  return new URLSearchParams({
    source: "planning",
    catalogSource: "planning_manifest",
    classLevel: scope.classLevel,
    subject: scope.subject,
    chapter: scope.chapter,
    chapterLabel: scope.chapterLabel,
    topic: scope.topic,
    topicLabel: scope.topicLabel,
  });
}

export function planningMcqHref(scope: PlanningScopeFields) {
  return planningExamDestinationHref("/dashboard/exam/mcq", scope);
}

export function planningExamHubHref(scope: PlanningScopeFields) {
  return planningExamDestinationHref("/dashboard/exam", scope);
}

export function planningExamQuery(scope: PlanningScopeFields) {
  return planningScopeParams(scope).toString();
}

export function planningExamDestinationHref(route: string, scope: PlanningScopeFields) {
  const safeRoute = route.startsWith("/dashboard/exam") ? route : "/dashboard/exam";
  return `${safeRoute}?${planningExamQuery(scope)}`;
}

export function planningExamCatalogChapter(scope: PlanningScopeFields) {
  return {
    label: scope.chapterLabel,
    value: scope.chapter,
    subject: scope.subject,
    classLevel: scope.classLevel,
    topics: [{ label: scope.topicLabel, value: scope.topic }],
  };
}
