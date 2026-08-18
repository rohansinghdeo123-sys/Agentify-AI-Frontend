import {
  normalizePlanningDraft,
  normalizePlanningPlan,
  isRetiredTopicPlanningSnapshot,
  type PlanningDraft,
  type PlanningPlan,
} from "./contracts";

const VERSION = "v3";

function key(userId: string, part: string) {
  return `agentify:planning:${VERSION}:${encodeURIComponent(userId)}:${part}`;
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
  return normalizePlanningDraft(readJSON<unknown>(key(userId, "draft")));
}

export function writePlanningDraft(userId: string, draft: PlanningDraft) {
  writeJSON(key(userId, "draft"), draft);
}

export function readActivePlanningPlanState(userId: string) {
  const raw = readJSON<unknown>(key(userId, "active"));
  const plan = normalizePlanningPlan(raw);
  const retired = !plan && isRetiredTopicPlanningSnapshot(raw);
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
  } catch {
    // In-memory state remains authoritative for this visit.
  }
}

export function readPlanningHistory(userId: string) {
  const history = readJSON<unknown>(key(userId, "history"));
  return Array.isArray(history)
    ? history.map(normalizePlanningPlan).filter((plan): plan is PlanningPlan => Boolean(plan)).slice(0, 12)
    : [];
}

export function writePlanningHistory(userId: string, plans: PlanningPlan[]) {
  writeJSON(key(userId, "history"), plans.slice(0, 12));
}

export function mergePlanningHistory(history: PlanningPlan[], plan: PlanningPlan) {
  return [
    plan,
    ...history.filter((entry) => entry.mission.mission_id !== plan.mission.mission_id),
  ].slice(0, 12);
}
