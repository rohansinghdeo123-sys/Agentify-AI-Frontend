import {
  isRetiredPlanningSnapshot,
  normalizePlanningDraft,
  normalizePlanningPlan,
  normalizePlanningPortfolio,
  planningPlanFromPortfolioState,
  planningPortfolioFromPlan,
  type PlanningDraft,
  type PlanningPlan,
  type PlanningPortfolio,
  type PlanningPortfolioState,
} from "./contracts";

const VERSION = "v7";
const LEGACY_VERSIONS = ["v6", "v5", "v4", "v3"] as const;

function key(userId: string, part: string, version = VERSION) {
  return `agentify:planning:${version}:${encodeURIComponent(userId)}:${part}`;
}

function readJSON<T>(storageKey: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window.localStorage.getItem(storageKey);
    return value ? (JSON.parse(value) as T) : null;
  } catch {
    return null;
  }
}

function writeJSON(storageKey: string, value: unknown) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(value));
  } catch {
    // Planning continues in memory when device storage is unavailable.
  }
}

export function readPlanningDraft(userId: string) {
  const current = normalizePlanningDraft(readJSON<unknown>(key(userId, "draft")));
  if (current) return current;

  for (const legacyVersion of LEGACY_VERSIONS) {
    const legacy = normalizePlanningDraft(readJSON<unknown>(key(userId, "draft", legacyVersion)));
    if (!legacy) continue;
    writeJSON(key(userId, "draft"), legacy);
    return legacy;
  }
  return null;
}

export function writePlanningDraft(userId: string, draft: PlanningDraft) {
  writeJSON(key(userId, "draft"), draft);
}

function normalizePortfolioState(value: unknown): PlanningPortfolioState | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const portfolio = normalizePlanningPortfolio(record.portfolio);
  if (!portfolio) return null;
  const requestedActive = typeof record.activeChapterSlug === "string"
    ? record.activeChapterSlug
    : "";
  const activeChapterSlug = portfolio.chapters.some((chapter) => chapter.chapter_slug === requestedActive)
    ? requestedActive
    : portfolio.global_next_step.chapter_slug;
  return { portfolio, activeChapterSlug };
}

export function readPlanningPortfolioState(userId: string) {
  const currentRaw = readJSON<unknown>(key(userId, "portfolio"));
  const current = normalizePortfolioState(currentRaw);
  if (current) return { state: current, retired: false, invalid: false };

  const legacyRaw = LEGACY_VERSIONS
    .map((legacyVersion) => readJSON<unknown>(key(userId, "active", legacyVersion)))
    .find((value) => value !== null) ?? null;
  const legacyPlan = normalizePlanningPlan(legacyRaw);
  if (legacyPlan) {
    const portfolio = planningPortfolioFromPlan(legacyPlan, userId);
    const state = {
      portfolio,
      activeChapterSlug: portfolio.global_next_step.chapter_slug,
    } satisfies PlanningPortfolioState;
    writeJSON(key(userId, "portfolio"), state);
    return { state, retired: false, invalid: false };
  }

  const retired = Boolean(legacyRaw && isRetiredPlanningSnapshot(legacyRaw));
  return {
    state: null,
    retired,
    invalid: Boolean((currentRaw || legacyRaw) && !retired),
  };
}

export function writePlanningPortfolioState(userId: string, state: PlanningPortfolioState) {
  writeJSON(key(userId, "portfolio"), state);
}

export function writePlanningPortfolio(userId: string, portfolio: PlanningPortfolio, activeChapterSlug?: string) {
  const state = {
    portfolio,
    activeChapterSlug: portfolio.chapters.some((chapter) => chapter.chapter_slug === activeChapterSlug)
      ? String(activeChapterSlug)
      : portfolio.global_next_step.chapter_slug,
  } satisfies PlanningPortfolioState;
  writePlanningPortfolioState(userId, state);
  return state;
}

/** Compatibility reader for older callers while v6 snapshots migrate to v7 portfolios. */
export function readActivePlanningPlanState(userId: string) {
  const result = readPlanningPortfolioState(userId);
  return {
    plan: result.state ? planningPlanFromPortfolioState(result.state) : null,
    retired: result.retired,
    invalid: result.invalid,
  };
}

/** Compatibility writer used by tests and older routes during the portfolio rollout. */
export function writeActivePlanningPlan(userId: string, plan: PlanningPlan) {
  const portfolio = planningPortfolioFromPlan(plan, userId);
  writePlanningPortfolio(userId, portfolio, plan.roadmap.chapter_slug);
}

export function clearPlanningPortfolio(userId: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key(userId, "portfolio"));
    window.localStorage.removeItem(key(userId, "active"));
    LEGACY_VERSIONS.forEach((legacyVersion) => {
      window.localStorage.removeItem(key(userId, "active", legacyVersion));
    });
  } catch {
    // In-memory state remains authoritative for this visit.
  }
}

export const clearActivePlanningPlan = clearPlanningPortfolio;
