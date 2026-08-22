import type {
  CoachMessage,
  CoachSources,
  StudyConversation,
} from "@/features/study/types";

export function getHistoryStorageKey(userId?: string) {
  return `agentify-study-history-${userId || "guest"}`;
}

export function createConversationId() {
  return `study-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

export function titleFromMessages(messages: CoachMessage[]) {
  const firstUserMessage = messages.find((message) => message.role === "user")?.content.trim();
  if (!firstUserMessage) return "New study conversation";
  return firstUserMessage.length > 54 ? `${firstUserMessage.slice(0, 54)}...` : firstUserMessage;
}

export function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function normalizeServerMessage(value: unknown): CoachMessage | null {
  if (!isPlainRecord(value)) return null;
  const role = value.role === "user" ? "user" : value.role === "coach" ? "coach" : null;
  if (!role) return null;

  return {
    role,
    content: String(value.content || ""),
    timestamp: String(value.timestamp || ""),
    ...(Array.isArray(value.blocks) ? { blocks: value.blocks as CoachMessage["blocks"] } : {}),
    ...(isPlainRecord(value.sources) ? { sources: value.sources as unknown as CoachSources } : {}),
    ...(typeof value.socratic === "boolean" ? { socratic: value.socratic } : {}),
  };
}

export function normalizeServerConversation(value: unknown): StudyConversation | null {
  if (!isPlainRecord(value)) return null;
  const id = String(value.id || "").trim();
  if (!id) return null;
  const messages = Array.isArray(value.messages)
    ? value.messages.map(normalizeServerMessage).filter((message): message is CoachMessage => Boolean(message))
    : [];

  return {
    id,
    sessionId: String(value.sessionId || ""),
    title: String(value.title || "New study conversation").slice(0, 72),
    updatedAt: String(value.updatedAt || new Date().toISOString()),
    chapter: String(value.chapter || "Open tutor"),
    topic: String(value.topic || "Any subject"),
    messages,
    pinned: Boolean(value.pinned),
    archived: Boolean(value.archived),
    titleLocked: Boolean(value.titleLocked),
    ...(isPlainRecord(value.scope)
      ? {
          scope: {
            source: value.scope.source === "syllabus" ? "syllabus" : "open",
            catalogSource: value.scope.catalogSource === "planning_manifest"
              ? "planning_manifest"
              : value.scope.catalogSource === "published"
                ? "published"
                : "starter",
            ...(typeof value.scope.classLevel === "string" && value.scope.classLevel.trim()
              ? { classLevel: value.scope.classLevel.trim() }
              : {}),
            subject: String(value.scope.subject || ""),
            chapterId: String(value.scope.chapterId || ""),
            chapterLabel: String(value.scope.chapterLabel || "Open tutor"),
            topicId: String(value.scope.topicId || ""),
            topicLabel: String(value.scope.topicLabel || "Any subject"),
          },
        }
      : {}),
  };
}

export function mergeConversations(primary: StudyConversation[], secondary: StudyConversation[]) {
  const merged = new Map<string, StudyConversation>();

  for (const conversation of [...primary, ...secondary]) {
    if (!conversation?.id) continue;
    const existing = merged.get(conversation.id);
    if (!existing) {
      merged.set(conversation.id, conversation);
      continue;
    }
    // The backend remains authoritative for messages and metadata, while the
    // local cache may carry the richer source scope until the API returns it.
    if (!existing.scope && conversation.scope) {
      merged.set(conversation.id, { ...existing, scope: conversation.scope });
    }
  }

  return [...merged.values()]
    .sort((left, right) => {
      if (Boolean(left.pinned) !== Boolean(right.pinned)) return Number(Boolean(right.pinned)) - Number(Boolean(left.pinned));
      return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
    })
    .slice(0, 40);
}

export function getConversationDeleteKeys(conversation: Pick<StudyConversation, "id" | "sessionId">) {
  return [conversation.id, conversation.sessionId].filter((value): value is string => Boolean(value));
}
