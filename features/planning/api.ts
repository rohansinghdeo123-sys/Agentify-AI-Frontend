import { ApiRequestError, apiJson } from "@/lib/apiClient";
import {
  isChapterPlanningMission,
  type AutonomousMission,
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
  if (!isRecord(payload) || !Array.isArray(payload.subjects)) {
    throw new PlanningApiError("The syllabus catalog could not be read.", "invalid_response");
  }

  const chapters: PlanningCatalogChapter[] = [];
  const seen = new Set<string>();
  payload.subjects.forEach((rawGroup) => {
    if (!isRecord(rawGroup) || !Array.isArray(rawGroup.chapters)) return;
    const subject = typeof rawGroup.subject === "string" ? rawGroup.subject.trim() : "";
    const classLevel = typeof rawGroup.class_level === "string" ? rawGroup.class_level.trim() : "";
    if (!subject || !classLevel) return;
    rawGroup.chapters.forEach((rawChapter) => {
      if (!isRecord(rawChapter)) return;
      const value = typeof rawChapter.slug === "string" ? rawChapter.slug.trim() : "";
      const label = typeof rawChapter.name === "string" ? rawChapter.name.trim() : value;
      const order = typeof rawChapter.chapter_number === "number" ? rawChapter.chapter_number : undefined;
      const identity = `${classLevel}\u0000${subject}\u0000${value}`;
      if (!value || seen.has(identity)) return;
      seen.add(identity);
      chapters.push({ label, value, subject, classLevel, order });
    });
  });
  if (!chapters.length) {
    throw new PlanningApiError("No chapters are available in the syllabus catalog yet.", "invalid_response");
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

export async function generatePlanningMission(
  context: PlanningRequestContext,
  scope: PlanningScope,
  signal?: AbortSignal,
): Promise<AutonomousMission> {
  try {
    const mission = await apiJson<unknown>(
      `${getBackendURL(context.backendURL)}/coach/autonomous-study/${encodeURIComponent(context.userId)}`,
      {
        method: "POST",
        headers: await jsonHeaders(context.getAuthHeaders),
        body: JSON.stringify({
          current_chapter: scope.chapter,
          subject: scope.subject,
          class_level: scope.classLevel,
        }),
        retries: 0,
        timeoutMs: 45000,
        forceFresh: true,
        signal,
      },
    );

    if (!isChapterPlanningMission(mission)) {
      throw new PlanningApiError("The planner returned an incomplete plan. Please try again.", "invalid_response");
    }
    return mission;
  } catch (error) {
    throw normalizePlanningError(error, "Your plan could not be created.");
  }
}

export function planningErrorMessage(error: unknown) {
  return normalizePlanningError(error, "The planning request could not be completed.").message;
}
