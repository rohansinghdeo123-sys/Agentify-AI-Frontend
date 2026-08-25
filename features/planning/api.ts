import { ApiRequestError, apiJson } from "@/lib/apiClient";
import {
  normalizePlanningPortfolio,
  normalizePlanningRoadmap,
  type PlanningPlan,
  type PlanningPortfolio,
  type PlanningRoadmap,
  type PlanningScope,
} from "./contracts";

export type PlanningRequestContext = {
  backendURL?: string;
  getAuthHeaders: () => Promise<HeadersInit>;
  userId: string;
};

export type PlanningCatalogChapter = {
  label: string;
  value: string;
  subject: string;
  classLevel: string;
  order?: number;
  aliases?: string[];
  planningSupported: true;
  roadmapVersion: "planning_roadmap_v2";
};

export type PlanningCatalog = {
  chapters: PlanningCatalogChapter[];
};

export type PlanningApiErrorCode =
  | "auth_required"
  | "rate_limited"
  | "timeout"
  | "service_unavailable"
  | "invalid_response";

export class PlanningApiError extends Error {
  code: PlanningApiErrorCode;
  status: number;

  constructor(message: string, code: PlanningApiErrorCode, status = 0) {
    super(message);
    this.name = "PlanningApiError";
    this.code = code;
    this.status = status;
  }
}

function getBackendURL(override?: string) {
  const configured = override || process.env.NEXT_PUBLIC_BACKEND_URL;
  if (!configured && process.env.NODE_ENV === "production") {
    throw new PlanningApiError("The Planning service is not configured for this deployment.", "service_unavailable");
  }
  return (configured || "http://127.0.0.1:8000").replace(/\/$/, "");
}

async function jsonHeaders(getAuthHeaders: () => Promise<HeadersInit>) {
  const headers = new Headers(await getAuthHeaders());
  headers.set("Content-Type", "application/json");
  return headers;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

const LEGACY_PLANNING_CHAPTERS = [
  {
    value: "some_basic_concepts_of_chemistry",
    label: "Some Basic Concepts of Chemistry",
    classLevel: "Class 11",
    subject: "Chemistry",
    aliases: ["matter", "Basic Concepts of Chemistry", "basic-concepts-of-chemistry"],
  },
  {
    value: "structure_of_atom",
    label: "Structure of Atom",
    classLevel: "Class 11",
    subject: "Chemistry",
    aliases: ["Atomic Structure", "structure-of-atom", "NCERT Class 11 Chemistry Chapter 2"],
  },
] as const;

/** Stable allow-list used only to validate an already-saved roadmap offline. */
export const BUILTIN_PLANNING_CHAPTERS: PlanningCatalogChapter[] = LEGACY_PLANNING_CHAPTERS.map(
  (chapter, index) => ({
    ...chapter,
    aliases: [...chapter.aliases],
    order: index + 1,
    planningSupported: true,
    roadmapVersion: "planning_roadmap_v2",
  }),
);

function normalizeCatalogIdentity(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function normalizePlanningClass(value: string) {
  const identity = normalizeCatalogIdentity(value).replace(/^class_/, "");
  return identity === "xi" ? "11" : identity;
}

function knownLegacyPlanningChapter(
  chapter: { value: string; label: string; aliases: string[] },
  classLevel: string,
  subject: string,
) {
  const chapterIdentities = [chapter.value, chapter.label, ...chapter.aliases].map(normalizeCatalogIdentity);
  return LEGACY_PLANNING_CHAPTERS.find((candidate) => {
    const knownChapterIdentities = [candidate.value, candidate.label, ...candidate.aliases]
      .map(normalizeCatalogIdentity);
    return normalizePlanningClass(classLevel) === normalizePlanningClass(candidate.classLevel)
      && normalizeCatalogIdentity(subject) === normalizeCatalogIdentity(candidate.subject)
      && chapterIdentities.some((identity) => knownChapterIdentities.includes(identity));
  });
}

export function planningCatalogChapterMatches(chapter: PlanningCatalogChapter, requested: string) {
  const identity = normalizeCatalogIdentity(requested);
  return Boolean(
    identity
    && (
      normalizeCatalogIdentity(chapter.value) === identity
      || normalizeCatalogIdentity(chapter.label) === identity
      || chapter.aliases?.some((alias) => normalizeCatalogIdentity(alias) === identity)
    ),
  );
}

/** Prevent saved/deep-linked roadmaps from rendering outside the supported Planning catalog. */
export function isPlanningPlanSupported(plan: PlanningPlan, chapters: PlanningCatalogChapter[]) {
  const chapter = chapters.find((candidate) => (
    candidate.planningSupported === true
    && normalizePlanningClass(candidate.classLevel) === normalizePlanningClass(plan.scope.classLevel)
    && normalizeCatalogIdentity(candidate.subject) === normalizeCatalogIdentity(plan.scope.subject)
    && planningCatalogChapterMatches(candidate, plan.scope.chapter)
  ));
  return Boolean(
    chapter
    && planningCatalogChapterMatches(chapter, plan.roadmap.chapter_slug)
    && normalizePlanningClass(chapter.classLevel) === normalizePlanningClass(plan.roadmap.class_level)
    && normalizeCatalogIdentity(chapter.subject) === normalizeCatalogIdentity(plan.roadmap.subject)
  );
}

export async function fetchPlanningCatalog(
  context: PlanningRequestContext,
  signal?: AbortSignal,
): Promise<PlanningCatalog> {
  const payload = await apiJson<unknown>(`${getBackendURL(context.backendURL)}/catalog`, {
    headers: await context.getAuthHeaders(),
    cacheKey: `planning-catalog:${context.userId}`,
    cacheTtlMs: 300000,
    retries: 1,
    timeoutMs: 10000,
    signal,
  });
  if (!isRecord(payload)) {
    throw new PlanningApiError("The syllabus catalog could not be read.", "invalid_response");
  }

  const chapters: PlanningCatalogChapter[] = [];
  const seen = new Set<string>();

  const addChapter = ({
    value,
    label,
    subject,
    classLevel,
    order,
    aliases,
  }: Omit<PlanningCatalogChapter, "planningSupported" | "roadmapVersion">) => {
    if (!value || !label || !subject || !classLevel) return;
    const identity = `${normalizePlanningClass(classLevel)}\u0000${normalizeCatalogIdentity(subject)}\u0000${normalizeCatalogIdentity(value)}`;
    if (seen.has(identity)) return;
    seen.add(identity);
    chapters.push({
      label,
      value,
      subject,
      classLevel,
      order,
      ...(aliases?.length ? { aliases } : {}),
      planningSupported: true,
      roadmapVersion: "planning_roadmap_v2",
    });
  };

  const manifestContainer = isRecord(payload.planning) ? payload.planning : null;
  const manifestEntries = Array.isArray(payload.planning_chapters)
    ? payload.planning_chapters
    : manifestContainer && Array.isArray(manifestContainer.chapters)
      ? manifestContainer.chapters
      : null;

  if (manifestEntries) {
    manifestEntries.forEach((rawEntry) => {
      if (!isRecord(rawEntry) || rawEntry.supported !== true || rawEntry.roadmap_version !== "planning_roadmap_v2") return;
      const value = typeof rawEntry.canonical_slug === "string" ? rawEntry.canonical_slug.trim() : "";
      const label = typeof rawEntry.name === "string" ? rawEntry.name.trim() : value;
      const subject = typeof rawEntry.subject === "string" ? rawEntry.subject.trim() : "";
      const classLevel = typeof rawEntry.class_level === "string" ? rawEntry.class_level.trim() : "";
      const aliases = Array.isArray(rawEntry.aliases)
        ? rawEntry.aliases.filter((alias): alias is string => typeof alias === "string" && Boolean(alias.trim()))
        : [];
      addChapter({
        value,
        label,
        subject,
        classLevel,
        order: typeof rawEntry.chapter_number === "number" ? rawEntry.chapter_number : undefined,
        aliases,
      });
    });
  } else if (Array.isArray(payload.subjects)) {
    // Short rollout bridge for catalogs deployed before `planning_chapters`.
    // Missing capability metadata never exposes arbitrary shared chapters.
    payload.subjects.forEach((rawGroup) => {
      if (!isRecord(rawGroup) || !Array.isArray(rawGroup.chapters)) return;
      const subject = typeof rawGroup.subject === "string" ? rawGroup.subject.trim() : "";
      const classLevel = typeof rawGroup.class_level === "string" ? rawGroup.class_level.trim() : "";
      if (!subject || !classLevel) return;
      rawGroup.chapters.forEach((rawChapter) => {
        if (!isRecord(rawChapter)) return;
        const rawValue = typeof rawChapter.slug === "string" ? rawChapter.slug.trim() : "";
        const rawLabel = typeof rawChapter.name === "string" ? rawChapter.name.trim() : rawValue;
        const rawAliases = Array.isArray(rawChapter.aliases)
          ? rawChapter.aliases.filter((alias): alias is string => typeof alias === "string" && Boolean(alias.trim()))
          : [];
        const canonicalFallback = knownLegacyPlanningChapter(
          { value: rawValue, label: rawLabel, aliases: rawAliases },
          classLevel,
          subject,
        );
        const capability = isRecord(rawChapter.planning) ? rawChapter.planning : null;
        const attachedSupported = capability
          ? capability.supported === true
            && capability.roadmap_version === "planning_roadmap_v2"
            && typeof capability.canonical_slug === "string"
            && Boolean(capability.canonical_slug.trim())
          : rawChapter.planning_supported === true && Boolean(canonicalFallback);
        const legacyFallback = !capability
          && rawChapter.planning_supported === undefined
          && Boolean(canonicalFallback);
        if (!rawValue || (!attachedSupported && !legacyFallback)) return;

        const capabilitySlug = capability && typeof capability.canonical_slug === "string"
          ? capability.canonical_slug.trim()
          : "";
        const value = capabilitySlug || canonicalFallback?.value || rawValue;
        const label = canonicalFallback?.label || rawLabel;
        const aliases = Array.from(new Set([
          ...rawAliases,
          rawValue,
          ...(canonicalFallback ? [rawLabel, ...canonicalFallback.aliases] : []),
        ])).filter((alias) => normalizeCatalogIdentity(alias) !== normalizeCatalogIdentity(value));
        addChapter({
          value,
          label,
          subject,
          classLevel,
          order: typeof rawChapter.chapter_number === "number" ? rawChapter.chapter_number : undefined,
          aliases,
        });
      });
    });
  }
  if (!chapters.length) {
    throw new PlanningApiError(
      "Planning is currently available for Class 11 Chemistry — Some Basic Concepts of Chemistry and Structure of Atom.",
      "invalid_response",
    );
  }
  return {
    chapters,
  };
}

function normalizePlanningError(error: unknown, fallback: string) {
  if (error instanceof PlanningApiError) return error;
  if (error instanceof ApiRequestError) {
    if (error.status === 401 || error.status === 403) {
      return new PlanningApiError("Your learning session expired. Please sign in again.", "auth_required", error.status);
    }
    if (error.status === 429) {
      return new PlanningApiError("The planner is busy right now. Wait a moment and try again.", "rate_limited", error.status);
    }
    if (error.status >= 500 || error.status === 0) {
      return new PlanningApiError("The planning service is temporarily unavailable. Your setup is still safe on this device.", "service_unavailable", error.status);
    }
    return new PlanningApiError(error.message || fallback, "invalid_response", error.status);
  }
  if (error instanceof DOMException && error.name === "AbortError") {
    return new PlanningApiError("This planning request was cancelled.", "timeout");
  }
  if (error instanceof Error && error.name === "AbortError") {
    return new PlanningApiError("This planning request was cancelled.", "timeout");
  }
  return new PlanningApiError(
    error instanceof Error && error.message ? error.message : fallback,
    "service_unavailable",
  );
}

export async function generatePlanningRoadmap(
  context: PlanningRequestContext,
  scope: PlanningScope,
  signal?: AbortSignal,
): Promise<PlanningRoadmap> {
  try {
    const sessionDurationMinutes = scope.sessionDurationMinutes;
    const hasSessionDuration = Number.isInteger(sessionDurationMinutes)
      && Number(sessionDurationMinutes) >= 15
      && Number(sessionDurationMinutes) <= 120;
    const mission = await apiJson<unknown>(
      `${getBackendURL(context.backendURL)}/coach/autonomous-study/${encodeURIComponent(context.userId)}`,
      {
        method: "POST",
        headers: await jsonHeaders(context.getAuthHeaders),
        body: JSON.stringify({
          current_chapter: scope.chapter,
          subject: scope.subject,
          class_level: scope.classLevel,
          chapter_proficiency: scope.chapterProficiency,
          ...(scope.studyTimeToday
            ? { study_time_today: scope.studyTimeToday }
            : {}),
          ...(hasSessionDuration
            ? { session_duration_minutes: sessionDurationMinutes }
            : {}),
        }),
        retries: 0,
        timeoutMs: 45000,
        forceFresh: true,
        signal,
      },
    );

    const roadmap = normalizePlanningRoadmap(mission);
    if (!roadmap) {
      throw new PlanningApiError("The planner returned an incomplete roadmap. Please try again.", "invalid_response");
    }
    return roadmap;
  } catch (error) {
    throw normalizePlanningError(error, "Your plan could not be created.");
  }
}

export async function generatePlanningPortfolio(
  context: PlanningRequestContext,
  scopes: PlanningScope[],
  signal?: AbortSignal,
): Promise<PlanningPortfolio> {
  if (!scopes.length || scopes.length > 6) {
    throw new PlanningApiError("Choose between one and six chapters for this roadmap.", "invalid_response");
  }
  const [firstScope] = scopes;
  if (scopes.some((scope) => (
    scope.classLevel !== firstScope.classLevel
    || scope.subject !== firstScope.subject
    || scope.studyTimeToday !== firstScope.studyTimeToday
    || scope.sessionDurationMinutes !== firstScope.sessionDurationMinutes
  ))) {
    throw new PlanningApiError("Every selected chapter must belong to the same class, subject, and study session.", "invalid_response");
  }

  try {
    const sessionDurationMinutes = firstScope.sessionDurationMinutes;
    const hasSessionDuration = Number.isInteger(sessionDurationMinutes)
      && Number(sessionDurationMinutes) >= 15
      && Number(sessionDurationMinutes) <= 120;
    const portfolio = await apiJson<unknown>(
      `${getBackendURL(context.backendURL)}/planning/portfolio/${encodeURIComponent(context.userId)}`,
      {
        method: "POST",
        headers: await jsonHeaders(context.getAuthHeaders),
        body: JSON.stringify({
          class_level: firstScope.classLevel,
          subject: firstScope.subject,
          chapters: scopes.map((scope) => ({
            chapter_ref: scope.chapter,
            chapter_proficiency: scope.chapterProficiency,
          })),
          ...(firstScope.studyTimeToday
            ? { study_time_today: firstScope.studyTimeToday }
            : {}),
          ...(hasSessionDuration
            ? { session_duration_minutes: sessionDurationMinutes }
            : {}),
        }),
        retries: 0,
        timeoutMs: 45000,
        forceFresh: true,
        signal,
      },
    );
    const normalized = normalizePlanningPortfolio(portfolio);
    if (!normalized) {
      throw new PlanningApiError("The planner returned an incomplete chapter portfolio. Please try again.", "invalid_response");
    }
    if (
      normalized.user_id !== context.userId
      || normalized.class_level !== firstScope.classLevel
      || normalized.subject !== firstScope.subject
    ) {
      throw new PlanningApiError("The planner returned a roadmap for a different student or syllabus. Please try again.", "invalid_response");
    }
    return normalized;
  } catch (error) {
    throw normalizePlanningError(error, "Your multi-chapter roadmap could not be created.");
  }
}

export function planningErrorMessage(error: unknown) {
  return normalizePlanningError(error, "The planning request could not be completed.").message;
}
