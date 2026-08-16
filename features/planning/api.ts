import { ApiRequestError, apiJson } from "@/lib/apiClient";
import type { RevisionQueueResponse } from "@/lib/revision";
import {
  isAutonomousMission,
  type AutonomousMission,
  type PlanningProfile,
  type PlanningScope,
} from "./contracts";

export type PlanningRequestContext = {
  backendURL?: string;
  getAuthHeaders: () => Promise<HeadersInit>;
  userId: string;
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
  profile: PlanningProfile,
  signal?: AbortSignal,
): Promise<AutonomousMission> {
  try {
    const mission = await apiJson<unknown>(
      `${getBackendURL(context.backendURL)}/coach/autonomous-study/${encodeURIComponent(context.userId)}`,
      {
        method: "POST",
        headers: await jsonHeaders(context.getAuthHeaders),
        body: JSON.stringify({
          current_topic: scope.topicLabel,
          current_chapter: scope.chapter,
          subject: scope.subject,
          current_knowledge: profile.currentKnowledge,
          learning_goal: profile.learningGoal,
          preferred_style: profile.preferredStyle,
          prerequisite_confidence: profile.prerequisiteConfidence,
        }),
        retries: 0,
        timeoutMs: 45000,
        forceFresh: true,
        signal,
      },
    );

    if (!isAutonomousMission(mission)) {
      throw new PlanningApiError("The planner returned an incomplete plan. Please try again.", "invalid_response");
    }
    return mission;
  } catch (error) {
    throw normalizePlanningError(error, "Your plan could not be created.");
  }
}

export async function fetchPlanningRadar(
  context: PlanningRequestContext,
  limit = 4,
  signal?: AbortSignal,
): Promise<RevisionQueueResponse> {
  try {
    return await apiJson<RevisionQueueResponse>(
      `${getBackendURL(context.backendURL)}/revision/queue/${encodeURIComponent(context.userId)}?limit=${limit}`,
      {
        headers: await context.getAuthHeaders(),
        retries: 1,
        timeoutMs: 12000,
        cacheKey: `planning-radar:${context.userId}:${limit}`,
        cacheTtlMs: 30000,
        signal,
      },
    );
  } catch (error) {
    throw normalizePlanningError(error, "Revision recommendations are unavailable.");
  }
}

export type PlanningCheckpointSubmission = {
  topic: string;
  subject: string;
  correct: boolean;
  durationSeconds: number;
  focusScore: number;
  startedAt: string;
  completedAt: string;
  responseLatencyMs: number;
  hintCount: number;
  retryCount: number;
  confidenceBefore: number;
  confidenceAfter: number;
  replayData: Record<string, unknown>;
};

export async function submitPlanningCheckpoint(
  context: PlanningRequestContext,
  submission: PlanningCheckpointSubmission,
  signal?: AbortSignal,
) {
  try {
    return await apiJson<{ message?: string; session?: unknown }>(
      `${getBackendURL(context.backendURL)}/submit-session`,
      {
        method: "POST",
        headers: await jsonHeaders(context.getAuthHeaders),
        body: JSON.stringify({
          user_id: context.userId,
          topic: submission.topic,
          subject: submission.subject,
          score: submission.correct ? 1 : 0,
          total_questions: 1,
          time_spent_seconds: submission.durationSeconds,
          focus_score: submission.focusScore,
          session_type: "planning_checkpoint",
          started_at: submission.startedAt,
          completed_at: submission.completedAt,
          response_latency_ms: submission.responseLatencyMs,
          hint_count: submission.hintCount,
          retry_count: submission.retryCount,
          confidence_before: submission.confidenceBefore,
          confidence_after: submission.confidenceAfter,
          replay_data: submission.replayData,
        }),
        retries: 0,
        timeoutMs: 18000,
        forceFresh: true,
        signal,
      },
    );
  } catch (error) {
    throw normalizePlanningError(error, "Your checkpoint could not be recorded.");
  }
}

export function planningErrorMessage(error: unknown) {
  return normalizePlanningError(error, "The planning request could not be completed.").message;
}
