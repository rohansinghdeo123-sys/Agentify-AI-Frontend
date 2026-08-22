type SearchParamsReader = {
  get(name: string): string | null;
};

export type PlanningMcqScope = {
  source: "planning";
  catalogSource: "planning_manifest";
  classLevel: string;
  subject: string;
  chapter: string;
  chapterLabel: string;
  topic: string;
  topicLabel: string;
};

function cleanLabel(value: string | null, maximum: number) {
  return String(value || "").trim().slice(0, maximum);
}

function cleanId(value: string | null) {
  return cleanLabel(value, 180)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function readPlanningMcqScope(searchParams: SearchParamsReader): PlanningMcqScope | null {
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

export function planningMcqHref(scope: Omit<PlanningMcqScope, "source" | "catalogSource">) {
  const params = new URLSearchParams({
    source: "planning",
    catalogSource: "planning_manifest",
    classLevel: scope.classLevel,
    subject: scope.subject,
    chapter: scope.chapter,
    chapterLabel: scope.chapterLabel,
    topic: scope.topic,
    topicLabel: scope.topicLabel,
  });
  return `/dashboard/exam/mcq?${params.toString()}`;
}
