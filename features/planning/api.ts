import { ApiRequestError, apiJson } from "@/lib/apiClient";
import {
  normalizePlanningPortfolio,
  normalizePlanningRoadmap,
  type PlanningPlan,
  type PlanningPortfolio,
  type PlanningRoadmap,
  type PlanningScope,
  type PlanningStudyTime,
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

const CLASS_11_CHEMISTRY_CHAPTERS = [
  {
    value: "some_basic_concepts_of_chemistry",
    label: "Some Basic Concepts of Chemistry",
    classLevel: "Class 11",
    subject: "Chemistry",
    aliases: ["matter", "Basic Concepts of Chemistry", "basic-concepts-of-chemistry", "ncert_class_11_chemistry_chapter_1_some_basic_concepts_of_chemistry"],
  },
  {
    value: "structure_of_atom",
    label: "Structure of Atom",
    classLevel: "Class 11",
    subject: "Chemistry",
    aliases: ["Atomic Structure", "structure-of-atom", "NCERT Class 11 Chemistry Chapter 2", "ncert_class_11_chemistry_chapter_2_structure_of_atom"],
  },
  {
    value: "classification_of_elements_and_periodicity_in_properties",
    label: "Classification of Elements and Periodicity in Properties",
    classLevel: "Class 11",
    subject: "Chemistry",
    aliases: ["Periodicity", "Classification of Elements", "NCERT Class 11 Chemistry Chapter 3", "ncert_class_11_chemistry_chapter_3_classification_of_elements_and_periodicity_in_properties"],
  },
  {
    value: "chemical_bonding_and_molecular_structure",
    label: "Chemical Bonding and Molecular Structure",
    classLevel: "Class 11",
    subject: "Chemistry",
    aliases: ["Chemical Bonding", "Molecular Structure", "NCERT Class 11 Chemistry Chapter 4", "ncert_class_11_chemistry_chapter_4_chemical_bonding_and_molecular_structure"],
  },
  {
    value: "thermodynamics",
    label: "Thermodynamics",
    classLevel: "Class 11",
    subject: "Chemistry",
    aliases: ["Chemical Thermodynamics", "NCERT Class 11 Chemistry Chapter 5", "ncert_class_11_chemistry_chapter_5_thermodynamics"],
  },
  {
    value: "equilibrium",
    label: "Equilibrium",
    classLevel: "Class 11",
    subject: "Chemistry",
    aliases: ["Chemical Equilibrium", "Ionic Equilibrium", "NCERT Class 11 Chemistry Chapter 6", "ncert_class_11_chemistry_chapter_6_equilibrium"],
  },
  {
    value: "redox_reactions",
    label: "Redox Reactions",
    classLevel: "Class 11",
    subject: "Chemistry",
    aliases: ["Redox", "Oxidation and Reduction", "NCERT Class 11 Chemistry Chapter 7", "ncert_class_11_chemistry_chapter_7_redox_reactions"],
  },
  {
    value: "organic_chemistry_some_basic_principles_and_techniques",
    label: "Organic Chemistry - Some Basic Principles and Techniques",
    classLevel: "Class 11",
    subject: "Chemistry",
    aliases: ["Organic Chemistry", "Basic Principles of Organic Chemistry", "NCERT Class 11 Chemistry Chapter 8", "ncert_class_11_chemistry_chapter_8_organic_chemistry_some_basic_principles_and_techniques"],
  },
  {
    value: "hydrocarbons",
    label: "Hydrocarbons",
    classLevel: "Class 11",
    subject: "Chemistry",
    aliases: ["Hydrocarbon", "NCERT Class 11 Chemistry Chapter 9", "ncert_class_11_chemistry_chapter_9_hydrocarbons"],
  },
] as const;

// Only these two existed before the backend published per-chapter Planning
// capability metadata. Keep the legacy bridge narrow so a builtin Study
// catalog never implies that an un-ingested Planning curriculum is available.
const LEGACY_REGISTERED_PLANNING_CHAPTERS = CLASS_11_CHEMISTRY_CHAPTERS.slice(0, 2);

/** Stable allow-list used only to validate an already-saved roadmap offline. */
export const BUILTIN_PLANNING_CHAPTERS: PlanningCatalogChapter[] = CLASS_11_CHEMISTRY_CHAPTERS.map(
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

function planningClassLabel(value: string) {
  const normalized = normalizePlanningClass(value);
  return /^\d+$/.test(normalized) ? `Class ${normalized}` : value.trim();
}

export function planningCatalogClassMatches(left: string, right: string) {
  return normalizePlanningClass(left) === normalizePlanningClass(right);
}

function knownLegacyPlanningChapter(
  chapter: { value: string; label: string; aliases: string[] },
  classLevel: string,
  subject: string,
) {
  const chapterIdentities = [chapter.value, chapter.label, ...chapter.aliases].map(normalizeCatalogIdentity);
  return LEGACY_REGISTERED_PLANNING_CHAPTERS.find((candidate) => {
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

export function planningCatalogScopeMatches(
  chapter: Pick<PlanningCatalogChapter, "classLevel" | "subject">,
  classLevel: string,
  subject: string,
) {
  return planningCatalogClassMatches(chapter.classLevel, classLevel)
    && normalizeCatalogIdentity(chapter.subject) === normalizeCatalogIdentity(subject);
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
    cacheKey: `planning-catalog:v2:${context.userId}`,
    cacheTtlMs: 60000,
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
      classLevel: planningClassLabel(classLevel),
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
  }

  if (Array.isArray(payload.subjects)) {
    // The published syllabus is also a Planning source of truth. Reading it in
    // addition to the capability manifest keeps newly ingested chapters
    // visible during rolling deployments where the manifest may still contain
    // only the original registered curricula.
    const publishedCatalog = payload.source === "published";
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
          : (rawChapter.planning_supported === true && Boolean(canonicalFallback)) || publishedCatalog;
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
      "No Planning-ready chapters are available in your published syllabus yet.",
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

const STUDY_TIME_BUDGETS: Record<PlanningStudyTime, number | null> = {
  "15": 15,
  "30": 30,
  "60": 60,
  "120_plus": 120,
  no_limit: null,
};

function validSessionDuration(value: number | undefined) {
  return Number.isInteger(value) && Number(value) >= 15 && Number(value) <= 120
    ? Number(value)
    : null;
}

function assertPlanningTimeApplied(
  response: Pick<PlanningRoadmap | PlanningPortfolio, "study_time_today" | "session_duration_minutes">
    & { daily_route?: PlanningRoadmap["daily_route"]; today_route?: PlanningPortfolio["today_route"] },
  scope: PlanningScope,
) {
  const selectedTime = scope.studyTimeToday || null;
  const sessionDuration = validSessionDuration(scope.sessionDurationMinutes);
  const route = response.daily_route || response.today_route;
  const expectedSource = selectedTime
    ? "student_choice"
    : sessionDuration !== null
      ? "session_state"
      : "default_focus";
  const expectedBudget = selectedTime
    ? STUDY_TIME_BUDGETS[selectedTime]
    : sessionDuration !== null
      ? Math.floor(sessionDuration / 5) * 5
      : 30;

  if (
    response.study_time_today !== selectedTime
    || response.session_duration_minutes !== sessionDuration
    || !route
    || route.source !== expectedSource
    || route.budget_minutes !== expectedBudget
  ) {
    throw new PlanningApiError(
      "The planner did not apply your selected study time. Please build the roadmap again.",
      "invalid_response",
    );
  }
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
    assertPlanningTimeApplied(roadmap, scope);
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
      || normalizePlanningClass(normalized.class_level) !== normalizePlanningClass(firstScope.classLevel)
      || normalizeCatalogIdentity(normalized.subject) !== normalizeCatalogIdentity(firstScope.subject)
    ) {
      throw new PlanningApiError("The planner returned a roadmap for a different student or syllabus. Please try again.", "invalid_response");
    }
    assertPlanningTimeApplied(normalized, firstScope);
    return normalized;
  } catch (error) {
    throw normalizePlanningError(error, "Your multi-chapter roadmap could not be created.");
  }
}

export function planningErrorMessage(error: unknown) {
  return normalizePlanningError(error, "The planning request could not be completed.").message;
}
