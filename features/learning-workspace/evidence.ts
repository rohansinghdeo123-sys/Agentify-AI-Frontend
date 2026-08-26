import { apiJson } from "@/lib/apiClient";
import type { SessionRecord } from "./types";

type LearningEvidenceContext = {
  backendURL?: string;
  getAuthHeaders: () => Promise<HeadersInit>;
  userId: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function finiteInteger(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const number = typeof value === "number" ? value : Number(value);
  return Number.isInteger(number) && Number.isFinite(number) ? number : null;
}

function nonEmptyString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

export function normalizeLearningSession(value: unknown): SessionRecord | null {
  if (!isRecord(value)) return null;
  const id = typeof value.id === "number" ? String(value.id) : nonEmptyString(value.id);
  const sessionType = nonEmptyString(value.session_type);
  const totalQuestions = finiteInteger(value.total_questions ?? value.questions);
  const score = finiteInteger(value.score ?? value.correct);
  const xpEarned = finiteInteger(value.xp_earned ?? value.xp) ?? 0;
  const durationSeconds = finiteInteger(value.time_spent_seconds);
  const durationMinutes = finiteInteger(value.duration);
  const completedAt = [
    value.completed_at,
    value.completedAt,
    value.timestamp,
    value.date,
  ].map(nonEmptyString).find(Boolean) ?? "";
  const completedDate = new Date(completedAt);

  if (
    !id
    || !sessionType
    || totalQuestions === null
    || score === null
    || totalQuestions < 0
    || score < 0
    || score > totalQuestions
    || !completedAt
    || Number.isNaN(completedDate.getTime())
  ) return null;

  return {
    id,
    subject: nonEmptyString(value.subject),
    ...(nonEmptyString(value.class_level) ? { class_level: nonEmptyString(value.class_level) } : {}),
    topic: nonEmptyString(value.topic) || "unknown",
    total_questions: totalQuestions,
    score,
    xp_earned: Math.max(0, xpEarned),
    time_spent_seconds: Math.max(0, durationSeconds ?? ((durationMinutes ?? 0) * 60)),
    session_type: sessionType,
    completed_at: completedDate.toISOString(),
  };
}

export function latestLearningSessionFromPayload(payload: unknown): SessionRecord | null {
  if (!isRecord(payload) || !Array.isArray(payload.sessions)) return null;
  return payload.sessions
    .map(normalizeLearningSession)
    .filter((session): session is SessionRecord => Boolean(session))
    .sort((left, right) => (
      new Date(right.completed_at).getTime() - new Date(left.completed_at).getTime()
    ))[0] ?? null;
}

export async function fetchLatestLearningSession(
  context: LearningEvidenceContext,
  signal?: AbortSignal,
) {
  const configured = context.backendURL || process.env.NEXT_PUBLIC_BACKEND_URL;
  if (!configured && process.env.NODE_ENV === "production") return null;
  const backendURL = (configured || "http://127.0.0.1:8000").replace(/\/$/, "");
  const payload = await apiJson<unknown>(
    `${backendURL}/sessions/${encodeURIComponent(context.userId)}?limit=5`,
    {
      headers: await context.getAuthHeaders(),
      cacheKey: `learning-workspace-evidence:${context.userId}`,
      cacheTtlMs: 30_000,
      retries: 1,
      timeoutMs: 7_000,
      signal,
    },
  );
  return latestLearningSessionFromPayload(payload);
}
