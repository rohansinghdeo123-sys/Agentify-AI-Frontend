import {
  normalizePlanningDraft,
  normalizePlanningPlan,
  isRetiredPlanningSnapshot,
  type PlanningDraft,
  type PlanningPlan,
} from "./contracts";

const VERSION = "v4";
const LEGACY_VERSION = "v3";

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

  const legacy = normalizePlanningDraft(readJSON<unknown>(key(userId, "draft", LEGACY_VERSION)));
  if (legacy) writeJSON(key(userId, "draft"), legacy);
  return legacy;
}

export function writePlanningDraft(userId: string, draft: PlanningDraft) {
  writeJSON(key(userId, "draft"), draft);
}

export function readActivePlanningPlanState(userId: string) {
  const currentRaw = readJSON<unknown>(key(userId, "active"));
  const legacyRaw = currentRaw ? null : readJSON<unknown>(key(userId, "active", LEGACY_VERSION));
  const raw = currentRaw ?? legacyRaw;
  const plan = normalizePlanningPlan(raw);
  const retired = !plan && isRetiredPlanningSnapshot(raw);
  return {
    plan,
    retired,
    invalid: Boolean(raw && !plan && !retired),
  };
}

export function writeActivePlanningPlan(userId: string, plan: PlanningPlan) {
  writeJSON(key(userId, "active"), plan);
}

export function clearActivePlanningPlan(userId: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key(userId, "active"));
    window.localStorage.removeItem(key(userId, "active", LEGACY_VERSION));
  } catch {
    // In-memory state remains authoritative for this visit.
  }
}
