import {
  BUILTIN_CHAPTERS,
  findChapterForTopic,
  reconcileSelection,
  type CatalogChapter,
} from "@/lib/catalog";

export const REVISION_ROUTES = {
  home: "/dashboard/revision",
} as const;

export type RevisionScope = {
  chapter: string;
  topic: string;
};

export type RevisionHandoffTarget = "study" | "exam";

type SearchParamsReader = {
  get(name: string): string | null;
};

export const DEFAULT_REVISION_SCOPE: RevisionScope = {
  chapter: BUILTIN_CHAPTERS[0]?.value || "hydrocarbon",
  topic: BUILTIN_CHAPTERS[0]?.topics[0]?.value || "alkanes",
};

export function normalizeRevisionValue(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function readRevisionScope(
  searchParams?: SearchParamsReader | null,
  chapterParam?: string | null,
): RevisionScope {
  const topic = normalizeRevisionValue(
    searchParams?.get("topic") || DEFAULT_REVISION_SCOPE.topic,
  ) || DEFAULT_REVISION_SCOPE.topic;
  const requestedChapter = normalizeRevisionValue(
    chapterParam || searchParams?.get("chapter") || "",
  );
  const inferredChapter = findChapterForTopic(BUILTIN_CHAPTERS, topic);

  return {
    chapter: requestedChapter || inferredChapter || DEFAULT_REVISION_SCOPE.chapter,
    topic,
  };
}

export function resolveRevisionScope(
  chapters: CatalogChapter[],
  requested: RevisionScope,
): RevisionScope {
  const resolved = reconcileSelection(chapters, requested.chapter, requested.topic);
  return { chapter: resolved.chapter, topic: resolved.topic };
}

export function revisionHomeHref(scope?: Partial<RevisionScope> | null) {
  const params = new URLSearchParams();
  const chapter = normalizeRevisionValue(scope?.chapter || "");
  const topic = normalizeRevisionValue(scope?.topic || "");
  if (chapter) params.set("chapter", chapter);
  if (topic) params.set("topic", topic);
  const query = params.toString();
  return query ? `${REVISION_ROUTES.home}?${query}` : REVISION_ROUTES.home;
}

export function revisionLessonHref(scope: RevisionScope) {
  const chapter = normalizeRevisionValue(scope.chapter) || DEFAULT_REVISION_SCOPE.chapter;
  const topic = normalizeRevisionValue(scope.topic) || DEFAULT_REVISION_SCOPE.topic;
  return `/dashboard/revision/${encodeURIComponent(chapter)}?topic=${encodeURIComponent(topic)}`;
}

export function revisionToolsHref(scope: RevisionScope) {
  const chapter = normalizeRevisionValue(scope.chapter) || DEFAULT_REVISION_SCOPE.chapter;
  const topic = normalizeRevisionValue(scope.topic) || DEFAULT_REVISION_SCOPE.topic;
  return `/dashboard/revision/${encodeURIComponent(chapter)}/tools?topic=${encodeURIComponent(topic)}`;
}

export function revisionHandoffHref(
  target: RevisionHandoffTarget,
  scope: RevisionScope,
) {
  const chapter = normalizeRevisionValue(scope.chapter) || DEFAULT_REVISION_SCOPE.chapter;
  const topic = normalizeRevisionValue(scope.topic) || DEFAULT_REVISION_SCOPE.topic;
  const params = new URLSearchParams({ chapter, topic });
  return `/dashboard/${target}?${params.toString()}`;
}

export function getRevisionScopeLabels(chapters: CatalogChapter[], scope: RevisionScope) {
  const chapter = chapters.find((candidate) => candidate.value === scope.chapter) || chapters[0];
  const topic = chapter?.topics.find((candidate) => candidate.value === scope.topic) || chapter?.topics[0];
  return {
    chapter: chapter?.label || scope.chapter.replace(/_/g, " "),
    topic: topic?.label || scope.topic.replace(/_/g, " "),
  };
}
