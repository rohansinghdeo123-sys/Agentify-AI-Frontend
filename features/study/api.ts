import { ApiRequestError, apiFetch, apiJson } from "@/lib/apiClient";
import { normalizeServerConversation } from "@/features/study/conversationUtils";
import type {
  AdaptiveAnswerBlock,
  AgentStagePayload,
  CoachSources,
  PendingAttachment,
  StudyConversation,
  StudyScope,
} from "@/features/study/types";

export type StudyApiErrorCode =
  | "auth_required"
  | "material_missing"
  | "rate_limited"
  | "timeout"
  | "service_unavailable"
  | "invalid_response";

export class StudyApiError extends Error {
  code: StudyApiErrorCode;
  status: number;

  constructor(message: string, code: StudyApiErrorCode, status = 0) {
    super(message);
    this.name = "StudyApiError";
    this.code = code;
    this.status = status;
  }
}

export type StudyApiContext = {
  backendURL?: string;
  headers: HeadersInit;
};

export type CoachTurnPayload = {
  userId: string;
  conversationId: string;
  prompt: string;
  groundingContextPrompt: string;
  scope: StudyScope;
  attachments: PendingAttachment[];
  directAnswer: boolean;
  socraticMode: boolean;
  strictAttachmentGrounding: boolean;
  intent: string;
  mentorDirective: string;
  systemGuardrail: string;
  studentState: Record<string, unknown>;
  adaptiveStrategy: Record<string, unknown>;
  learningContext: Record<string, unknown>;
  requiredNotFoundResponse: string;
};

export type CoachTurnResult = {
  answer: string;
  blocks: AdaptiveAnswerBlock[];
  sources?: CoachSources;
  socratic?: boolean;
};

type StreamCallbacks = {
  signal?: AbortSignal;
  onStage?: (stage: AgentStagePayload) => void;
  onDelta?: (delta: string) => void;
};

type ParsedFrame =
  | { kind: "done" }
  | { kind: "stage"; stage: AgentStagePayload }
  | { kind: "delta"; delta: string }
  | { kind: "answer"; result: CoachTurnResult; semantic: boolean }
  | { kind: "none" };

const STUDY_STREAM_CONNECT_TIMEOUT_MS = 25000;
const STUDY_STREAM_IDLE_TIMEOUT_MS = 60000;

function apiBase(override?: string) {
  const configured = override || process.env.NEXT_PUBLIC_BACKEND_URL;
  if (!configured && process.env.NODE_ENV === "production") {
    throw new StudyApiError(
      "The Study service is not configured for this deployment.",
      "service_unavailable",
    );
  }
  return (configured || "http://127.0.0.1:8000").replace(/\/$/, "");
}

function stripDataPrefix(value: string) {
  return value
    .split(/\r?\n/)
    .filter((line) => !line.startsWith(":"))
    .map((line) => line.replace(/^data:\s?/, ""))
    .join("\n")
    .trim();
}

function decodeBase64Utf8(value: string) {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value) || value.length % 4 !== 0) return "";
  try {
    const binary = globalThis.atob(value);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return new TextDecoder().decode(bytes).trim();
  } catch {
    return "";
  }
}

export function parseStudyStreamFrame(raw: string): ParsedFrame {
  const payload = stripDataPrefix(raw);
  if (!payload) return { kind: "none" };
  if (payload === "[DONE]") return { kind: "done" };

  try {
    const parsed = JSON.parse(payload) as Record<string, unknown>;
    if (parsed.type === "agent_stage" && typeof parsed.stage === "string" && typeof parsed.status === "string") {
      return { kind: "stage", stage: parsed as unknown as AgentStagePayload };
    }
    if (parsed.type === "answer_delta" && typeof parsed.delta === "string") {
      return { kind: "delta", delta: parsed.delta };
    }
    if (parsed.type === "turn_event" && parsed.event === "answer.completed") {
      return {
        kind: "answer",
        result: {
          answer: String(parsed.answer || "").trim(),
          blocks: Array.isArray(parsed.blocks) ? parsed.blocks as AdaptiveAnswerBlock[] : [],
          sources: parsed.sources && typeof parsed.sources === "object" ? parsed.sources as unknown as CoachSources : undefined,
          socratic: typeof parsed.socratic === "boolean" ? parsed.socratic : undefined,
        },
        semantic: true,
      };
    }
    if (typeof parsed.answer === "string") {
      return { kind: "answer", result: { answer: parsed.answer.trim(), blocks: [] }, semantic: false };
    }
    return { kind: "none" };
  } catch {
    const decoded = decodeBase64Utf8(payload);
    return decoded
      ? { kind: "answer", result: { answer: decoded, blocks: [] }, semantic: false }
      : { kind: "answer", result: { answer: payload, blocks: [] }, semantic: false };
  }
}

function normalizeError(error: unknown): StudyApiError {
  if (error instanceof StudyApiError) return error;
  if (error instanceof ApiRequestError) {
    if (error.status === 401 || error.status === 403) {
      return new StudyApiError("Your learning session has expired. Please sign in again.", "auth_required", error.status);
    }
    if (error.status === 404) {
      return new StudyApiError("This topic is not available in the selected learning source yet.", "material_missing", error.status);
    }
    if (error.status === 429) {
      return new StudyApiError("Your tutor is handling many requests. Please wait a moment and try again.", "rate_limited", error.status);
    }
    if (error.status >= 500 || error.status === 0) {
      return new StudyApiError("The learning service is temporarily unavailable. Your conversation is safe.", "service_unavailable", error.status);
    }
    return new StudyApiError(error.message, "invalid_response", error.status);
  }
  if (error instanceof Error && error.name === "AbortError") {
    return new StudyApiError("This response was stopped.", "timeout");
  }
  return new StudyApiError(
    error instanceof Error && error.message ? error.message : "The tutor could not complete this response.",
    "service_unavailable",
  );
}

async function errorFromResponse(response: Response) {
  const body = await response.json().catch(() => null) as { detail?: unknown } | null;
  return normalizeError(new ApiRequestError(String(body?.detail || `Request failed: ${response.status}`), response.status));
}

async function readStreamChunk(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  controller: AbortController,
) {
  let timedOut = false;
  let timeout: ReturnType<typeof globalThis.setTimeout> | undefined;

  try {
    return await Promise.race([
      reader.read(),
      new Promise<never>((_, reject) => {
        timeout = globalThis.setTimeout(() => {
          timedOut = true;
          controller.abort();
          reject(new StudyApiError(
            "Your tutor took too long to continue this response. Your question is safe—please try again.",
            "timeout",
          ));
        }, STUDY_STREAM_IDLE_TIMEOUT_MS);
      }),
    ]);
  } catch (error) {
    if (timedOut) {
      throw new StudyApiError(
        "Your tutor took too long to continue this response. Your question is safe—please try again.",
        "timeout",
      );
    }
    throw error;
  } finally {
    if (timeout) globalThis.clearTimeout(timeout);
  }
}

export async function listStudyConversations(
  context: StudyApiContext,
  userId: string,
): Promise<StudyConversation[]> {
  try {
    const payload = await apiJson<{ conversations?: unknown[] }>(
      `${apiBase(context.backendURL)}/coach/conversations/${encodeURIComponent(userId)}`,
      {
        headers: context.headers,
        forceFresh: true,
        retries: 1,
        timeoutMs: 9000,
      },
    );
    return Array.isArray(payload.conversations)
      ? payload.conversations.map(normalizeServerConversation).filter((item): item is StudyConversation => Boolean(item))
      : [];
  } catch (error) {
    throw normalizeError(error);
  }
}

export async function getStudyConversation(
  context: StudyApiContext,
  userId: string,
  conversationId: string,
): Promise<StudyConversation | null> {
  try {
    const payload = await apiJson<{ conversation?: unknown }>(
      `${apiBase(context.backendURL)}/coach/conversations/${encodeURIComponent(userId)}/${encodeURIComponent(conversationId)}`,
      {
        headers: context.headers,
        forceFresh: true,
        retries: 0,
        timeoutMs: 9000,
      },
    );
    return normalizeServerConversation(payload.conversation);
  } catch (error) {
    const normalized = normalizeError(error);
    if (normalized.code === "material_missing") return null;
    throw normalized;
  }
}

export async function getStudyCoachName(context: StudyApiContext, userId: string) {
  try {
    const payload = await apiJson<{ profile?: { coach_name?: unknown } }>(
      `${apiBase(context.backendURL)}/coach/${encodeURIComponent(userId)}`,
      {
        headers: context.headers,
        cacheKey: `coach-profile:${userId}`,
        cacheTtlMs: 60000,
        retries: 1,
        timeoutMs: 8000,
      },
    );
    return String(payload.profile?.coach_name || "Aria");
  } catch {
    return "Aria";
  }
}

export async function updateStudyConversation(
  context: StudyApiContext,
  userId: string,
  conversation: Pick<StudyConversation, "id" | "sessionId">,
  patch: Partial<Pick<StudyConversation, "title" | "pinned" | "archived" | "titleLocked">>,
) {
  try {
    await apiJson(
      `${apiBase(context.backendURL)}/coach/conversations/${encodeURIComponent(userId)}/${encodeURIComponent(conversation.sessionId || conversation.id)}`,
      {
        method: "PATCH",
        headers: context.headers,
        body: JSON.stringify(patch),
        forceFresh: true,
        retries: 0,
        timeoutMs: 8000,
      },
    );
  } catch (error) {
    throw normalizeError(error);
  }
}

export async function removeStudyConversation(
  context: StudyApiContext,
  userId: string,
  conversation: Pick<StudyConversation, "id" | "sessionId">,
) {
  try {
    const response = await apiFetch(
      `${apiBase(context.backendURL)}/coach/conversations/${encodeURIComponent(userId)}/${encodeURIComponent(conversation.sessionId || conversation.id)}`,
      {
        method: "DELETE",
        headers: context.headers,
        retries: 0,
        timeoutMs: 8000,
      },
    );
    if (!response.ok) throw await errorFromResponse(response);
  } catch (error) {
    throw normalizeError(error);
  }
}

export async function streamCoachTurn(
  context: StudyApiContext,
  payload: CoachTurnPayload,
  callbacks: StreamCallbacks = {},
): Promise<CoachTurnResult> {
  const syllabusGrounded = payload.scope.source === "syllabus";
  const attachmentGrounded = Boolean(payload.strictAttachmentGrounding && payload.attachments.length);
  const strictGrounding = syllabusGrounded || attachmentGrounded;
  let streamed = "";
  let completed: CoachTurnResult | null = null;
  const streamController = new AbortController();
  const abortStream = () => streamController.abort();
  let connectionTimedOut = false;
  const connectionTimeout = globalThis.setTimeout(() => {
    connectionTimedOut = true;
    streamController.abort();
  }, STUDY_STREAM_CONNECT_TIMEOUT_MS);
  if (callbacks.signal?.aborted) abortStream();
  else callbacks.signal?.addEventListener("abort", abortStream, { once: true });

  try {
    const response = await fetch(`${apiBase(context.backendURL)}/coach/chat/stream`, {
      method: "POST",
      headers: context.headers,
      cache: "no-store",
      signal: streamController.signal,
      body: JSON.stringify({
        user_id: payload.userId,
        message: payload.prompt,
        original_message: payload.prompt,
        grounding_context_prompt: payload.groundingContextPrompt,
        mode: "coach",
        intent: payload.intent,
        session_id: `coach-${payload.userId}-${payload.conversationId}`,
        attachments: payload.attachments,
        direct_answer: payload.directAnswer,
        socratic_mode: payload.socraticMode,
        mentor_directive: payload.mentorDirective,
        system_guardrail: payload.systemGuardrail,
        retrieval_required: strictGrounding,
        strict_grounding: strictGrounding,
        fallback_to_general_knowledge: !strictGrounding,
        required_not_found_response: payload.requiredNotFoundResponse,
        subject: syllabusGrounded ? payload.scope.subject : "",
        chapter: syllabusGrounded ? payload.scope.chapterLabel : "",
        topic: syllabusGrounded ? payload.scope.topicLabel : "",
        section_id: syllabusGrounded ? payload.scope.topicId : "general",
        student_state: payload.studentState,
        adaptive_strategy: payload.adaptiveStrategy,
        learning_context: {
          ...payload.learningContext,
          scope: syllabusGrounded
            ? "selected_study_material_only"
            : attachmentGrounded
              ? "uploaded_material_only"
              : "open_tutor_reasoning_first",
          selected_subject: syllabusGrounded ? payload.scope.subject : "",
          catalog_source: syllabusGrounded ? payload.scope.catalogSource || "starter" : "",
          selected_chapter_id: syllabusGrounded ? payload.scope.chapterId : "",
          selected_chapter: syllabusGrounded ? payload.scope.chapterLabel : "",
          selected_topic_id: syllabusGrounded ? payload.scope.topicId : "",
          selected_topic: syllabusGrounded ? payload.scope.topicLabel : "",
          section_id: syllabusGrounded ? payload.scope.topicId : "general",
        },
      }),
    });
    globalThis.clearTimeout(connectionTimeout);
    if (!response.ok) throw await errorFromResponse(response);

    if (!response.body) {
      const frame = parseStudyStreamFrame(await response.text());
      if (frame.kind === "answer") return frame.result;
      throw new StudyApiError("The tutor returned an empty response.", "invalid_response");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let streamDone = false;
    let completedIsSemantic = false;

    const processFrame = (frameText: string) => {
      const frame = parseStudyStreamFrame(frameText);
      if (frame.kind === "done") {
        streamDone = true;
        return;
      }
      if (frame.kind === "stage") callbacks.onStage?.(frame.stage);
      if (frame.kind === "delta") {
        streamed += frame.delta;
        callbacks.onDelta?.(frame.delta);
      }
      if (frame.kind === "answer" && (!completedIsSemantic || frame.semantic)) {
        completed = frame.result;
        completedIsSemantic = frame.semantic;
      }
    };

    while (!streamDone) {
      const { value, done } = await readStreamChunk(reader, streamController);
      if (done) break;
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
      const frames = buffer.split("\n\n");
      buffer = frames.pop() || "";
      for (const frame of frames) {
        processFrame(frame);
        if (streamDone) break;
      }
    }
    if (streamDone) await reader.cancel().catch(() => undefined);
    else if (buffer.trim()) processFrame(buffer);

    const result = completed as CoachTurnResult | null;
    const answer = result?.answer || streamed.trim();
    if (!answer) throw new StudyApiError("The tutor returned an empty response.", "invalid_response");
    return {
      answer,
      blocks: result?.blocks || [],
      sources: result?.sources,
      socratic: result?.socratic,
    };
  } catch (error) {
    if (connectionTimedOut) {
      throw new StudyApiError(
        "The tutor could not start this response in time. Your question is safe—please try again.",
        "timeout",
      );
    }
    throw normalizeError(error);
  } finally {
    globalThis.clearTimeout(connectionTimeout);
    callbacks.signal?.removeEventListener("abort", abortStream);
  }
}

export function studyErrorMessage(error: unknown) {
  return normalizeError(error).message;
}
