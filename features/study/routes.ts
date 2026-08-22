import type { CatalogChapter } from "@/lib/catalog";
import type { StudyCatalogSource, StudyScope } from "@/features/study/types";

export const STUDY_ROUTES = {
  home: "/dashboard/study",
  history: "/dashboard/study/history",
} as const;

type SearchParamsReader = {
  get(name: string): string | null;
};

export function normalizeStudyValue(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function openStudyScope(): StudyScope {
  return {
    source: "open",
    subject: "",
    chapterId: "",
    chapterLabel: "Open tutor",
    topicId: "",
    topicLabel: "Any subject",
  };
}

export function syllabusStudyScope(
  chapter: CatalogChapter,
  topic: CatalogChapter["topics"][number],
  catalogSource: StudyCatalogSource = "starter",
): StudyScope {
  return {
    source: "syllabus",
    catalogSource,
    classLevel: chapter.classLevel || "",
    subject: chapter.subject || "Chemistry",
    chapterId: chapter.value,
    chapterLabel: chapter.label,
    topicId: topic.value,
    topicLabel: topic.label,
  };
}

function readCatalogSource(value: string | null): StudyCatalogSource {
  if (value === "planning_manifest") return "planning_manifest";
  return value === "published" ? "published" : "starter";
}

export function readStudyScope(searchParams?: SearchParamsReader | null): StudyScope {
  if (searchParams?.get("source") !== "syllabus") return openStudyScope();

  const chapterId = normalizeStudyValue(searchParams.get("chapter") || "");
  const topicId = normalizeStudyValue(searchParams.get("topic") || "");
  if (!chapterId || !topicId) return openStudyScope();

  return {
    source: "syllabus",
    catalogSource: readCatalogSource(searchParams.get("catalogSource")),
    classLevel: searchParams.get("classLevel")?.trim() || "",
    subject: searchParams.get("subject")?.trim() || "Chemistry",
    chapterId,
    chapterLabel: searchParams.get("chapterLabel")?.trim() || chapterId.replace(/_/g, " "),
    topicId,
    topicLabel: searchParams.get("topicLabel")?.trim() || topicId.replace(/_/g, " "),
  };
}

export function studySessionHref(
  conversationId: string,
  scope: StudyScope,
  options?: { fresh?: boolean },
) {
  const id = encodeURIComponent(conversationId.trim());
  const params = new URLSearchParams();
  if (options?.fresh) params.set("fresh", "1");
  if (scope.source === "syllabus") {
    params.set("source", "syllabus");
    params.set("catalogSource", scope.catalogSource || "starter");
    if (scope.classLevel) params.set("classLevel", scope.classLevel);
    params.set("subject", scope.subject);
    params.set("chapter", scope.chapterId);
    params.set("chapterLabel", scope.chapterLabel);
    params.set("topic", scope.topicId);
    params.set("topicLabel", scope.topicLabel);
  }
  const query = params.toString();
  return `/dashboard/study/session/${id}${query ? `?${query}` : ""}`;
}

export function studyHistoryHref(scope?: StudyScope | null) {
  if (!scope || scope.source === "open") return STUDY_ROUTES.history;
  const params = new URLSearchParams({
    source: "syllabus",
    catalogSource: scope.catalogSource || "starter",
    subject: scope.subject,
    chapter: scope.chapterId,
    chapterLabel: scope.chapterLabel,
    topic: scope.topicId,
    topicLabel: scope.topicLabel,
  });
  if (scope.classLevel) params.set("classLevel", scope.classLevel);
  return `${STUDY_ROUTES.history}?${params.toString()}`;
}

export function legacyStudyHandoff(searchParams?: SearchParamsReader | null) {
  const mode = searchParams?.get("mode");
  const target = mode === "revision"
    ? "/dashboard/revision"
    : mode === "exam"
      ? "/dashboard/exam"
      : "";
  if (!target) return "";

  const params = new URLSearchParams();
  const chapter = searchParams?.get("chapter")?.trim();
  const topic = searchParams?.get("topic")?.trim();
  if (chapter) params.set("chapter", chapter);
  if (topic) params.set("topic", topic);
  const query = params.toString();
  return `${target}${query ? `?${query}` : ""}`;
}
