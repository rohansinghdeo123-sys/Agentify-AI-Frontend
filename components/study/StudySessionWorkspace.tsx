"use client";

import ChatThinkingLogo from "@/components/brand/ChatThinkingLogo";
import RichMarkdown from "@/components/RichMarkdown";
import { AppIcon, LoadingState } from "@/components/ui/Polished";
import { useAuth } from "@/context/AuthContext";
import {
  getStudyCoachName,
  recordPlanningStudyEvidence,
  streamCoachTurn,
  studyErrorMessage,
} from "@/features/study/api";
import { titleFromMessages } from "@/features/study/conversationUtils";
import { useStudyConversations } from "@/features/study/hooks/useStudyConversations";
import { useStudyDraftPersistence } from "@/features/study/hooks/useStudyDraftPersistence";
import {
  appendPendingStudyTurn,
  createStudyTutorRequestSnapshot,
  historyBeforeRetriedStudyTurn,
  type StudyTutorRequestSnapshot,
} from "@/features/study/retry";
import {
  openStudyScope,
  readStudyScope,
  studyHistoryHref,
  studySessionHref,
} from "@/features/study/routes";
import {
  DATA_GROUNDED_TUTOR_GUARDRAIL,
  MATERIAL_NOT_FOUND_MESSAGE,
  REASONING_FIRST_TUTOR_GUARDRAIL,
  STAGE_ORDER,
  TUTOR_TEMPORARY_ERROR_MESSAGE,
} from "@/features/study/studyConfig";
import type {
  AdaptiveAnswerBlock,
  AgentStagePayload,
  AgentStageState,
  CoachMessage,
  CoachSources,
  DisplayAttachment,
  EmotionalState,
  LearningIntent,
  LearningLevel,
  LearningSpeed,
  MentorProfile,
  PendingAttachment,
  SpeechRecognitionConstructor,
  SpeechRecognitionLike,
} from "@/features/study/types";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type RefObject,
} from "react";
import styles from "./study-session.module.css";

function getTime() {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function isFollowUpPrompt(value: string) {
  const lower = value.toLowerCase().trim();
  return [
    /\b(this|that|it|these|those|same topic|above|previous|last answer|your answer)\b/,
    /\b(simple words|simplify|explain again|again|more examples?|another example|explain more|in short|make it easy)\b/,
    /\b(can you explain|please explain|what does it mean|why is that|how so)\b/,
  ].some((pattern) => pattern.test(lower));
}

function significantTerms(value: string) {
  const stopWords = new Set([
    "define", "explain", "simple", "words", "please", "can", "you", "this", "that", "what", "why", "how",
    "the", "and", "with", "from", "into", "about", "again", "more", "example", "examples", "tell", "me",
  ]);
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((term) => term.length >= 4 && !stopWords.has(term))
    .slice(0, 8);
}

function buildTutorContextMessage(prompt: string, history: CoachMessage[]) {
  const previousUser = [...history].reverse().find((message) => message.role === "user" && message.content.trim());
  const previousCoach = [...history].reverse().find((message) => message.role === "coach" && message.content.trim());
  const previousQuestion = previousUser?.content.trim() || "";
  const previousAnswer = previousCoach?.content.trim() || "";
  const followUp = isFollowUpPrompt(prompt) && Boolean(previousQuestion || previousAnswer);

  return {
    message: followUp
      ? [
          "The student is asking a follow-up. Resolve the reference from the recent conversation before answering.",
          `Current follow-up: ${prompt}`,
          previousQuestion ? `Previous user question: ${previousQuestion}` : "",
          previousAnswer ? `Previous tutor answer: ${previousAnswer.slice(0, 1400)}` : "",
          "Continue the previous lesson naturally unless the student clearly asks to change topic.",
        ].filter(Boolean).join("\n")
      : prompt,
    isFollowUp: followUp,
    previousQuestion,
    previousAnswer,
    anchorTerms: significantTerms(followUp ? `${previousQuestion} ${previousAnswer}` : prompt),
  };
}

function hasAny(value: string, words: string[]) {
  return words.some((word) => value.includes(word));
}

function inferMentorProfile(prompt: string, history: CoachMessage[]): MentorProfile {
  const lower = prompt.toLowerCase();
  const recent = history.slice(-8).map((message) => message.content).join(" ").toLowerCase();
  const combined = `${recent} ${lower}`;
  const intent: LearningIntent = hasAny(lower, ["exam", "marks", "board", "test", "answer writing"])
    ? "exam"
    : hasAny(lower, ["revise", "revision", "recap", "remember"])
      ? "revision"
      : hasAny(lower, ["practice", "quiz", "question", "test me"])
        ? "practice"
        : hasAny(lower, ["plan", "schedule", "timetable"])
          ? "planning"
          : hasAny(lower, ["why", "how", "curious", "wonder"])
            ? "curiosity"
            : "concept";
  const emotion: EmotionalState = hasAny(lower, ["confused", "don’t understand", "don't understand", "stuck", "unclear"])
    ? "confused"
    : hasAny(lower, ["worried", "anxious", "scared", "panic"])
      ? "anxious"
      : hasAny(lower, ["got it", "understand now", "confident"])
        ? "confident"
        : hasAny(lower, ["why", "how", "curious"])
          ? "curious"
          : "steady";
  const level: LearningLevel = hasAny(combined, ["advanced", "derivation", "mechanism", "prove"])
    ? "advanced"
    : hasAny(combined, ["basic", "beginner", "simple", "from scratch", "first time"])
      ? "beginner"
      : "intermediate";
  const speed: LearningSpeed = hasAny(lower, ["quick", "brief", "short", "fast"])
    ? "fast"
    : hasAny(lower, ["slow", "step by step", "carefully"])
      ? "slow"
      : "balanced";
  const confidence = emotion === "confident" ? 78 : emotion === "confused" ? 34 : emotion === "anxious" ? 26 : 58;

  return {
    intent,
    level,
    emotion,
    confidence,
    speed,
    curiosityDepth: intent === "curiosity" ? 82 : level === "advanced" ? 74 : 55,
    answerStyle: level === "beginner"
      ? "Begin with the core idea in plain language, then give one concrete example."
      : intent === "exam"
        ? "Teach the concept, then show a marks-aware answer structure and common traps."
        : "Explain the reasoning clearly, connect it to prior context, and check understanding.",
    nextMove: intent === "practice" ? "Ask one focused question and wait for the learner." : "End with one short understanding check when useful.",
    shouldTest: intent === "practice" || hasAny(lower, ["test me", "quiz me"]),
    weakSignals: [
      ...(emotion === "confused" ? ["learner_confusion"] : []),
      ...(emotion === "anxious" ? ["assessment_anxiety"] : []),
      ...(level === "beginner" ? ["foundation_needed"] : []),
    ],
  };
}

function buildMentorDirective(profile: MentorProfile) {
  return [
    `Intent: ${profile.intent}.`,
    `Level: ${profile.level}. Emotional state: ${profile.emotion}.`,
    `Teaching route: ${profile.answerStyle}`,
    `Next move: ${profile.nextMove}`,
    profile.weakSignals.length ? `Watch for: ${profile.weakSignals.join(", ")}.` : "",
  ].filter(Boolean).join(" ");
}

function createStages(): AgentStageState[] {
  const copy: Record<AgentStageState["id"], Omit<AgentStageState, "id" | "status">> = {
    received: { agent: "Tutor", title: "Question received", detail: "Reading your learning intent." },
    understanding: { agent: "Tutor", title: "Understanding the doubt", detail: "Connecting this turn with your recent lesson." },
    drafting: { agent: "Tutor", title: "Building the explanation", detail: "Choosing the clearest teaching route." },
    reviewing: { agent: "Tutor", title: "Checking the answer", detail: "Reviewing clarity and learning-source support." },
    formatting: { agent: "Tutor", title: "Organizing the lesson", detail: "Making the response easy to scan." },
    delivering: { agent: "Tutor", title: "Answer ready", detail: "Delivering your focused explanation." },
  };
  return STAGE_ORDER.map((id) => ({ id, ...copy[id], status: "pending" }));
}

function applyStageUpdate(stages: AgentStageState[], update: AgentStagePayload) {
  const activeIndex = STAGE_ORDER.indexOf(update.stage);
  return stages.map((stage, index) => {
    if (stage.id === update.stage) {
      return {
        ...stage,
        status: update.status,
        agent: update.agent || stage.agent,
        title: update.title || stage.title,
        detail: update.detail || stage.detail,
      };
    }
    if (activeIndex >= 0 && index < activeIndex && update.status !== "pending") return { ...stage, status: "done" as const };
    return stage;
  });
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("File could not be read."));
    reader.readAsDataURL(file);
  });
}

function getSpeechRecognitionCtor(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const speechWindow = window as typeof window & {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition || null;
}

function speakTutorResponse(value: string) {
  if (typeof window === "undefined" || !window.speechSynthesis || !value.trim()) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(
    value.replace(/```[\s\S]*?```/g, " ").replace(/[#*_>`~\[\]]/g, " ").replace(/\s+/g, " ").trim(),
  );
  utterance.lang = "en-IN";
  utterance.rate = 0.98;
  const voice = window.speechSynthesis.getVoices().find((candidate) => /en[-_]IN/i.test(candidate.lang))
    || window.speechSynthesis.getVoices().find((candidate) => /^en/i.test(candidate.lang));
  if (voice) utterance.voice = voice;
  window.speechSynthesis.speak(utterance);
}

function AttachmentChips({
  attachments,
  onRemove,
}: {
  attachments: DisplayAttachment[];
  onRemove?: (name: string) => void;
}) {
  if (!attachments.length) return null;
  return (
    <div className={styles.attachments} aria-label="Attached learning materials">
      {attachments.map((attachment) => (
        <span key={`${attachment.name}-${attachment.size_bytes}`} className={styles.attachmentChip}>
          <AppIcon name="book" />
          <span>{attachment.name}</span>
          {onRemove ? (
            <button type="button" onClick={() => onRemove(attachment.name)} aria-label={`Remove ${attachment.name}`}>
              <AppIcon name="x" />
            </button>
          ) : null}
        </span>
      ))}
    </div>
  );
}

function SourceDrawer({ sources }: { sources?: CoachSources }) {
  if (!sources) return null;
  if (!sources.grounded || !sources.citations?.length) {
    return sources.indicator ? <p className={styles.sourceNote}>{sources.indicator}</p> : null;
  }
  return (
    <details className={styles.sourceDrawer}>
      <summary>
        <span>{sources.indicator || "Based on your selected material"}</span>
        <small>{sources.citations.length} source{sources.citations.length === 1 ? "" : "s"}</small>
      </summary>
      <div className={styles.sourceList}>
        {sources.citations.map((source) => (
          <article key={source.id}>
            <strong>{source.label}</strong>
            <span>{source.source}{source.section_id ? ` / ${source.section_id}` : ""}</span>
            {source.excerpt ? <p>{source.excerpt}</p> : null}
          </article>
        ))}
      </div>
    </details>
  );
}

function TutorAnswer({
  content,
  blocks = [],
  streaming,
}: {
  content: string;
  blocks?: AdaptiveAnswerBlock[];
  streaming: boolean;
}) {
  if (blocks.length) {
    return (
      <div className={styles.answerFlow}>
        {blocks.map((block, index) => (
          <section key={`${block.title}-${index}`} className={styles.answerBlock}>
            {block.title ? <h3>{block.title}</h3> : null}
            <RichMarkdown content={block.content} streaming={streaming && index === blocks.length - 1} />
          </section>
        ))}
      </div>
    );
  }
  return <RichMarkdown content={content} streaming={streaming} />;
}

function CopyAnswerButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  };
  return (
    <button type="button" onClick={() => void copy()} className={styles.quietAction} aria-live="polite">
      <AppIcon name={copied ? "check" : "copy"} />
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function TutorActions({
  answer,
  socratic,
  onPrompt,
  onRegenerate,
  onDirectAnswer,
}: {
  answer: string;
  socratic?: boolean;
  onPrompt: (prompt: string) => void;
  onRegenerate: () => void;
  onDirectAnswer: () => void;
}) {
  return (
    <div className={styles.tutorActions}>
      <button type="button" onClick={() => onPrompt("Explain the previous answer more simply, like I am learning it for the first time.")}>Simplify</button>
      <button type="button" onClick={() => onPrompt("Ask me one practice question from the concept we just discussed, wait for my answer, then evaluate it.")}>Practice</button>
      <button type="button" onClick={() => onPrompt("Turn the previous explanation into a concise exam-ready answer.")}>Exam answer</button>
      {socratic ? <button type="button" onClick={onDirectAnswer}>Direct answer</button> : null}
      <details>
        <summary>More</summary>
        <div>
          <button type="button" onClick={() => onPrompt("Give me one real-life example connected to the concept we just discussed.")}>Example</button>
          <button type="button" onClick={() => onPrompt("What common mistake might I make in this concept, and how do I avoid it?")}>Mistake check</button>
          <button type="button" onClick={onRegenerate}><AppIcon name="spark" /> Regenerate</button>
          <CopyAnswerButton value={answer} />
          <button type="button" onClick={() => speakTutorResponse(answer)}><AppIcon name="mic" /> Listen</button>
        </div>
      </details>
    </div>
  );
}

function StudyComposer({
  value,
  coachName,
  loading,
  listening,
  speechSupported,
  attachments,
  strictAttachmentGrounding,
  socraticMode,
  menuOpen,
  inputRef,
  attachmentInputRef,
  menuRef,
  menuTriggerRef,
  firstMenuActionRef,
  planningAskTopic,
  onChange,
  onKeyDown,
  onAttachmentSelect,
  onRemoveAttachment,
  onToggleMenu,
  onToggleSocratic,
  onToggleStrictGrounding,
  onVoice,
  onSend,
}: {
  value: string;
  coachName: string;
  loading: boolean;
  listening: boolean;
  speechSupported: boolean;
  attachments: PendingAttachment[];
  strictAttachmentGrounding: boolean;
  socraticMode: boolean;
  menuOpen: boolean;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  attachmentInputRef: RefObject<HTMLInputElement | null>;
  menuRef: RefObject<HTMLDivElement | null>;
  menuTriggerRef: RefObject<HTMLButtonElement | null>;
  firstMenuActionRef: RefObject<HTMLButtonElement | null>;
  planningAskTopic?: string;
  onChange: (value: string) => void;
  onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onAttachmentSelect: (event: ChangeEvent<HTMLInputElement>) => void;
  onRemoveAttachment: (name: string) => void;
  onToggleMenu: () => void;
  onToggleSocratic: () => void;
  onToggleStrictGrounding: () => void;
  onVoice: () => void;
  onSend: () => void;
}) {
  const canSend = Boolean(value.trim() || attachments.length) || loading;
  return (
    <div className={styles.composerWrap}>
      <div className={styles.composerMeta} role="status" aria-live="polite">
        <span>{loading ? `${coachName} is responding…` : "Enter to send · Shift+Enter for a new line"}</span>
        <span>{speechSupported ? "Voice available" : "Text ready"}</span>
      </div>
      <div className={styles.composerCard}>
        <AttachmentChips attachments={attachments} onRemove={onRemoveAttachment} />
        <div className={styles.composerInputRow}>
          <span className={styles.composerPromptMark} aria-hidden="true"><AppIcon name="spark" /></span>
          <div className={styles.composerTextField}>
            <label className="sr-only" htmlFor="study-session-message">Message your AI tutor</label>
            <textarea
              id="study-session-message"
              ref={inputRef}
              value={value}
              rows={1}
              className={styles.studyTextarea}
              onChange={(event) => onChange(event.target.value)}
              onKeyDown={onKeyDown}
              placeholder={listening
                ? "Listening…"
                : planningAskTopic
                  ? `Ask ${coachName} about ${planningAskTopic}…`
                  : `Ask ${coachName} anything…`}
              aria-describedby="study-session-message-help"
            />
            <p id="study-session-message-help" className="sr-only">
              {planningAskTopic ? `Planning opened Ask AI for ${planningAskTopic}. ` : ""}
              Press Enter to send or Shift+Enter to start a new line.
            </p>
          </div>
          <div className={styles.composerToolbar}>
            <div className={styles.toolCluster}>
              <input
                ref={attachmentInputRef}
                type="file"
                multiple
                accept="image/png,image/jpeg,image/webp,application/pdf,text/plain"
                onChange={onAttachmentSelect}
                className="sr-only"
                aria-label="Attach photos, documents, or notes"
              />
              <div ref={menuRef} className={styles.menuWrap}>
                <button
                  ref={menuTriggerRef}
                  type="button"
                  onClick={onToggleMenu}
                  disabled={loading}
                  aria-label="Open tutor tools"
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                  className={styles.iconButton}
                ><AppIcon name={menuOpen ? "x" : "plus"} /></button>
                {menuOpen ? (
                  <div className={styles.composerMenu} role="menu" aria-label="Tutor tools">
                    <button ref={firstMenuActionRef} type="button" role="menuitem" onClick={() => attachmentInputRef.current?.click()}>
                      <AppIcon name="plus" />
                      <span><strong>Add photos & files</strong><small>Images, PDFs, or text notes</small></span>
                    </button>
                    <button type="button" role="menuitemcheckbox" aria-checked={socraticMode} onClick={onToggleSocratic}>
                      <AppIcon name="study" />
                      <span><strong>Guide me step by step</strong><small>Use hints before the final answer</small></span>
                      <i data-on={socraticMode} />
                    </button>
                    <button
                      type="button"
                      role="menuitemcheckbox"
                      aria-checked={strictAttachmentGrounding}
                      disabled={!attachments.length}
                      onClick={onToggleStrictGrounding}
                    >
                      <AppIcon name="book" />
                      <span><strong>Use uploaded notes only</strong><small>Available after you attach material</small></span>
                      <i data-on={strictAttachmentGrounding} />
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
            <div className={styles.toolCluster}>
              <button type="button" onClick={onVoice} disabled={!speechSupported || loading} className={styles.iconButton} aria-label={listening ? "Stop voice input" : "Start voice input"}>
                <AppIcon name={listening ? "x" : "mic"} />
              </button>
              <button type="button" onClick={onSend} disabled={!canSend} className={styles.sendButton} aria-label={loading ? "Stop response" : "Send message"}>
                <AppIcon name={loading ? "x" : "send"} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const STARTERS = [
  { label: "Learn it", prompt: "Explain this concept from the basics with one simple example." },
  { label: "Ask a doubt", prompt: "Help me understand why this topic works the way it does, step by step." },
  { label: "Check me", prompt: "Ask me one focused practice question, wait for my answer, then explain what I understood and what I should revisit." },
];

export default function StudySessionWorkspace() {
  const params = useParams<{ conversationId: string }>();
  const conversationId = decodeURIComponent(String(params.conversationId || "")).slice(0, 180);

  return <StudySessionRoom key={conversationId} conversationId={conversationId} />;
}

function StudySessionRoom({ conversationId }: { conversationId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { profile, userId, loading, authLoading, getAuthHeaders } = useAuth() as ReturnType<typeof useAuth> & { authLoading?: boolean };
  const { conversations, setConversations, syncState, localReady } = useStudyConversations();
  const routeScope = useMemo(() => readStudyScope(searchParams), [searchParams]);
  const savedConversation = conversations.find((conversation) => conversation.id === conversationId);
  const savedScope = savedConversation?.scope;
  const scope = useMemo(
    () => routeScope.source === "syllabus" ? routeScope : savedScope || openStudyScope(),
    [routeScope, savedScope],
  );
  const freshSession = searchParams.get("fresh") === "1";
  const entry = searchParams.get("entry") || "";
  const directAskEntry = entry === "ask_ai";
  const practiceEntry = entry === "practice";
  const planningAskEntry = directAskEntry && ["planning_manifest", "published"].includes(
    scope.catalogSource || "",
  );
  const authBusy = loading || authLoading;
  const [coachName, setCoachName] = useState("Aria");
  const [messages, setMessages] = useState<CoachMessage[]>([]);
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [strictAttachmentGrounding, setStrictAttachmentGrounding] = useState(false);
  const [socraticMode, setSocraticMode] = useState(true);
  const [loadingAnswer, setLoadingAnswer] = useState(false);
  const [error, setError] = useState("");
  const [failedRequest, setFailedRequest] = useState<StudyTutorRequestSnapshot | null>(null);
  const [stages, setStages] = useState(createStages);
  const [composerMenuOpen, setComposerMenuOpen] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const lastRequestRef = useRef<StudyTutorRequestSnapshot | null>(null);
  const activityRef = useRef(false);
  const restoredRef = useRef("");
  const entryPreparedRef = useRef("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const firstMenuActionRef = useRef<HTMLButtonElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  const restoreDraft = useCallback((draft: string) => setInput((current) => current || draft), []);
  const { clearDraft } = useStudyDraftPersistence({ userId, conversationId, value: input, onRestore: restoreDraft });

  useEffect(() => {
    if (!localReady || restoredRef.current === conversationId || activityRef.current) return;
    if (!freshSession && !savedConversation && syncState === "loading") return;
    if (savedConversation?.messages.length) setMessages(savedConversation.messages);
    restoredRef.current = conversationId;
    setHydrated(true);
  }, [conversationId, freshSession, localReady, savedConversation, syncState]);

  useEffect(() => {
    if (!userId || authBusy) return;
    let active = true;
    void (async () => {
      const name = await getStudyCoachName(
        { backendURL: process.env.NEXT_PUBLIC_BACKEND_URL, headers: await getAuthHeaders() },
        userId,
      );
      if (active) setCoachName(name);
    })();
    return () => { active = false; };
  }, [authBusy, getAuthHeaders, userId]);

  useEffect(() => {
    const supported = Boolean(getSpeechRecognitionCtor()) && Boolean(window.speechSynthesis);
    setSpeechSupported(supported);
    if (window.speechSynthesis) window.speechSynthesis.getVoices();
    return () => {
      abortRef.current?.abort();
      recognitionRef.current?.stop();
      window.speechSynthesis?.cancel();
    };
  }, []);

  useEffect(() => {
    if (!composerMenuOpen) return;
    const frame = window.requestAnimationFrame(() => firstMenuActionRef.current?.focus());
    const closeOnPointer = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setComposerMenuOpen(false);
    };
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setComposerMenuOpen(false);
        menuTriggerRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", closeOnPointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("mousedown", closeOnPointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [composerMenuOpen]);

  useEffect(() => {
    if (!messages.length || !userId) return;
    setConversations((current) => {
      const previous = current.find((conversation) => conversation.id === conversationId);
      const conversation = {
        id: conversationId,
        sessionId: previous?.sessionId || `coach-${userId}-${conversationId}`,
        title: previous?.titleLocked ? previous.title : titleFromMessages(messages),
        updatedAt: new Date().toISOString(),
        chapter: scope.chapterLabel,
        topic: scope.topicLabel,
        messages,
        pinned: previous?.pinned,
        archived: previous?.archived,
        titleLocked: previous?.titleLocked,
        scope,
      };
      return [conversation, ...current.filter((item) => item.id !== conversationId)].slice(0, 40);
    });
  }, [conversationId, messages, scope, setConversations, userId]);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: reduced ? "auto" : "smooth" });
  }, [loadingAnswer, messages]);

  useEffect(() => {
    const timer = window.setTimeout(() => headingRef.current?.focus({ preventScroll: true }), 0);
    return () => window.clearTimeout(timer);
  }, [conversationId]);

  useEffect(() => {
    if ((!directAskEntry && !practiceEntry) || !hydrated) return;
    const timer = window.setTimeout(() => inputRef.current?.focus({ preventScroll: false }), 0);
    return () => window.clearTimeout(timer);
  }, [directAskEntry, hydrated, practiceEntry]);

  useEffect(() => {
    if (!hydrated || !practiceEntry || entryPreparedRef.current === conversationId) return;
    entryPreparedRef.current = conversationId;
    const focus = scope.source === "syllabus" ? scope.topicLabel : "this concept";
    setInput((current) => current || `Ask me one focused question about ${focus}. Wait for my answer, then explain what I understood and what I should revisit.`);
  }, [conversationId, hydrated, practiceEntry, scope.source, scope.topicLabel]);

  const updateLastCoachMessage = (patch: Partial<CoachMessage>) => {
    setMessages((current) => {
      const next = [...current];
      const last = next[next.length - 1];
      if (last?.role === "coach") next[next.length - 1] = { ...last, ...patch };
      return next;
    });
  };

  const appendCoachDelta = (delta: string) => {
    setMessages((current) => {
      const next = [...current];
      const last = next[next.length - 1];
      if (last?.role === "coach") next[next.length - 1] = { ...last, content: `${last.content}${delta}` };
      return next;
    });
  };

  const sendMessage = async (
    override?: string,
    options?: {
      replaceLastTurn?: boolean;
      directAnswer?: boolean;
      fromVoice?: boolean;
      requestSnapshot?: StudyTutorRequestSnapshot;
    },
  ) => {
    const requestedSnapshot = options?.requestSnapshot;
    const typed = (requestedSnapshot?.prompt ?? override ?? input).trim();
    const requestAttachments = requestedSnapshot?.attachments ?? attachments;
    const prompt = typed || (requestAttachments.length ? "Please explain the attached study material." : "");
    if (!prompt || !userId || authBusy || loadingAnswer) return;
    activityRef.current = true;
    const request = requestedSnapshot ?? createStudyTutorRequestSnapshot({
      prompt,
      attachments: requestAttachments,
      strictAttachmentGrounding,
      directAnswer: Boolean(options?.directAnswer),
      socraticMode,
      fromVoice: Boolean(options?.fromVoice),
    });
    lastRequestRef.current = request;
    const contextMessages = options?.replaceLastTurn
      ? historyBeforeRetriedStudyTurn(messages)
      : messages;
    const tutorContext = buildTutorContextMessage(prompt, contextMessages);
    const mentor = inferMentorProfile(prompt, contextMessages);
    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;
    setInput("");
    clearDraft();
    setAttachments([]);
    setStrictAttachmentGrounding(false);
    setComposerMenuOpen(false);
    setError("");
    setFailedRequest(null);
    setLoadingAnswer(true);
    setStages(createStages().map((stage) => stage.id === "received" ? { ...stage, status: "active" } : stage));
    setMessages((current) => appendPendingStudyTurn(current, request, getTime(), Boolean(options?.replaceLastTurn)));

    try {
      const result = await streamCoachTurn(
        { backendURL: process.env.NEXT_PUBLIC_BACKEND_URL, headers: await getAuthHeaders() },
        {
          userId,
          conversationId,
          prompt,
          groundingContextPrompt: tutorContext.message,
          scope,
          attachments: request.attachments,
          directAnswer: request.directAnswer,
          socraticMode: request.socraticMode,
          strictAttachmentGrounding: request.strictAttachmentGrounding,
          intent: mentor.intent,
          mentorDirective: buildMentorDirective(mentor),
          systemGuardrail: scope.source === "syllabus" || request.strictAttachmentGrounding
            ? DATA_GROUNDED_TUTOR_GUARDRAIL
            : REASONING_FIRST_TUTOR_GUARDRAIL,
          studentState: {
            knowledge_level: mentor.level,
            emotional_state: mentor.emotion,
            confidence: mentor.confidence,
            learning_speed: mentor.speed,
            curiosity_depth: mentor.curiosityDepth,
          },
          adaptiveStrategy: {
            answer_style: mentor.answerStyle,
            next_move: mentor.nextMove,
            should_test: mentor.shouldTest,
            weak_signals: mentor.weakSignals,
          },
          learningContext: {
            is_follow_up: tutorContext.isFollowUp,
            previous_user_question: tutorContext.previousQuestion,
            previous_ai_answer: tutorContext.previousAnswer,
            anchor_terms: tutorContext.anchorTerms,
            recent_messages: contextMessages.slice(-10),
            saved_conversations: conversations.length,
          },
          requiredNotFoundResponse: MATERIAL_NOT_FOUND_MESSAGE,
        },
        {
          signal: controller.signal,
          onStage: (stage) => setStages((current) => applyStageUpdate(current, stage)),
          onDelta: appendCoachDelta,
        },
      );
      if (controller.signal.aborted) return;
      updateLastCoachMessage({
        content: result.answer || TUTOR_TEMPORARY_ERROR_MESSAGE,
        timestamp: getTime(),
        blocks: result.blocks,
        sources: result.sources,
        socratic: result.socratic,
      });
      setStages((current) => current.map((stage) => ({ ...stage, status: "done" })));
      if (
        ["planning_manifest", "published"].includes(scope.catalogSource || "")
        && result.interactionId
      ) {
        void getAuthHeaders()
          .then((headers) => recordPlanningStudyEvidence(
            { backendURL: process.env.NEXT_PUBLIC_BACKEND_URL, headers },
            result.interactionId!,
          ))
          .catch(() => undefined);
      }
      if (request.fromVoice) speakTutorResponse(result.answer);
    } catch (requestError) {
      if (controller.signal.aborted) return;
      const message = studyErrorMessage(requestError);
      setError(message);
      setFailedRequest(request);
      updateLastCoachMessage({ content: TUTOR_TEMPORARY_ERROR_MESSAGE, timestamp: getTime() });
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setLoadingAnswer(false);
    }
  };

  const stopGenerating = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setLoadingAnswer(false);
    updateLastCoachMessage({
      content: messages.at(-1)?.content.trim() || "Stopped. Edit your question or try again when you are ready.",
      timestamp: getTime(),
    });
  };

  const startNewConversation = () => {
    abortRef.current?.abort();
    router.push(studySessionHref(`study-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`, scope, { fresh: true }));
  };

  const fillPrompt = (prompt: string) => {
    setFailedRequest(null);
    setInput(prompt);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  };

  const regenerate = () => {
    const lastUser = [...messages].reverse().find((message) => message.role === "user");
    if (!lastUser?.content.trim()) return;
    const remembered = failedRequest?.prompt === lastUser.content.trim()
      ? failedRequest
      : lastRequestRef.current?.prompt === lastUser.content.trim()
        ? lastRequestRef.current
        : null;
    const restoredAttachments = (lastUser.attachments || []).filter((attachment): attachment is PendingAttachment => (
      typeof (attachment as PendingAttachment).data_url === "string"
      && Boolean((attachment as PendingAttachment).data_url)
    ));
    if (!remembered && (lastUser.attachments?.length || 0) !== restoredAttachments.length) {
      setFailedRequest(null);
      setInput(lastUser.content);
      setError("Reattach the original files before retrying this question so the tutor keeps the same evidence.");
      window.setTimeout(() => inputRef.current?.focus(), 0);
      return;
    }
    const request = remembered ?? createStudyTutorRequestSnapshot({
      prompt: lastUser.content,
      attachments: restoredAttachments,
      strictAttachmentGrounding: restoredAttachments.length > 0,
      directAnswer: false,
      socraticMode,
      fromVoice: false,
    });
    void sendMessage(undefined, { replaceLastTurn: true, requestSnapshot: request });
  };

  const retryFailedRequest = () => {
    if (!failedRequest) return;
    void sendMessage(undefined, { replaceLastTurn: true, requestSnapshot: failedRequest });
  };

  const handleAttachmentSelect = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    setComposerMenuOpen(false);
    setFailedRequest(null);
    if (attachments.length + files.length > 5) {
      setError("Attach up to five images, PDFs, or text notes at a time.");
      return;
    }
    const allowed = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf", "text/plain"]);
    const next: PendingAttachment[] = [];
    for (const file of files) {
      const maxBytes = file.type.startsWith("image/") ? 4 * 1024 * 1024 : 6 * 1024 * 1024;
      if (!allowed.has(file.type) || file.size > maxBytes) {
        setError(`${file.name} is not supported or is too large.`);
        continue;
      }
      try {
        next.push({
          id: `${file.name}-${file.size}-${Date.now()}`,
          name: file.name,
          mime_type: file.type,
          size_bytes: file.size,
          data_url: await readFileAsDataUrl(file),
        });
      } catch {
        setError(`${file.name} could not be read.`);
      }
    }
    if (next.length) {
      setAttachments((current) => [...current, ...next]);
      setError("");
    }
  };

  const startVoiceInput = () => {
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }
    const Recognition = getSpeechRecognitionCtor();
    if (!Recognition || loadingAnswer) return;
    const recognition = new Recognition();
    recognitionRef.current = recognition;
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-IN";
    recognition.onresult = (event) => {
      const transcript = event.results?.[0]?.[0]?.transcript?.trim() || "";
      setListening(false);
      if (transcript) void sendMessage(transcript, { fromVoice: true });
    };
    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);
    setListening(true);
    recognition.start();
  };

  const handleComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage();
    }
  };

  if (authBusy || !hydrated) {
    return <LoadingState title="Opening your study room…" detail="Restoring your conversation and tutor settings." />;
  }

  const latestCoachIndex = messages.reduce((latest, message, index) => message.role === "coach" ? index : latest, -1);
  const sourceLabel = scope.source === "syllabus"
    ? scope.catalogSource === "planning_manifest"
      ? "NCERT roadmap"
      : scope.catalogSource === "published" ? "Published syllabus" : "Starter syllabus"
    : "Open tutor";
  const emptyTitle = practiceEntry
    ? `Ready for a quick check on ${scope.topicLabel}?`
    : directAskEntry && scope.source !== "syllabus"
      ? "What would you like to clarify?"
      : scope.source === "syllabus"
        ? `Let’s understand ${scope.topicLabel}.`
        : "What should we learn today?";
  const emptyDescription = practiceEntry
    ? "Send the prepared check when you are ready. Answer in your own words, then your tutor will show what is clear and what needs another look."
    : scope.source === "syllabus"
      ? `Your tutor will stay anchored to ${scope.chapterLabel} and show available source evidence.`
      : `Ask naturally, ${profile?.name?.split(" ")[0] || "Student"}. Add a screenshot or note whenever the question needs it.`;
  const canRetry = Boolean(failedRequest);

  return (
    <section className={styles.session} data-source={scope.source}>
      <div className={styles.ambient} aria-hidden="true"><span /><span /></div>
      <header className={styles.sessionHeader}>
        <div className={styles.headingBlock}>
          <Link href="/dashboard/study" className={styles.backLink}><AppIcon name="arrowRight" /> Study Home</Link>
          <div>
            <p>Study Lab / {sourceLabel}</p>
            <h1 ref={headingRef} tabIndex={-1}>{scope.source === "syllabus" ? scope.topicLabel : "Focused learning room"}</h1>
            <span>{scope.source === "syllabus" ? `${scope.chapterLabel} · ${scope.subject}` : "Ask freely, attach material, or continue your previous doubt."}</span>
          </div>
        </div>
        <div className={styles.headerActions}>
          <span className={styles.syncState} data-state={syncState}><i />{syncState === "synced" ? "Synced" : syncState === "offline" ? "Device history" : "Connecting"}</span>
          <Link href={studyHistoryHref(scope)}><AppIcon name="history" /> History</Link>
          <button type="button" onClick={startNewConversation}><AppIcon name="plus" /> New chat</button>
        </div>
      </header>

      <div
        ref={scrollRef}
        className={styles.threadScroll}
        role="log"
        aria-live={loadingAnswer ? "off" : "polite"}
        aria-relevant="additions text"
        aria-busy={loadingAnswer}
      >
        {messages.length ? (
          <div className={styles.thread}>
            {messages.map((message, index) => message.role === "user" ? (
              <div key={`user-${index}`} className={styles.userRow}>
                <article className={styles.userMessage}>
                  <div><span>You</span>{message.timestamp ? <time>{message.timestamp}</time> : null}</div>
                  <p>{message.content}</p>
                  {message.attachments?.length ? <AttachmentChips attachments={message.attachments} /> : null}
                  <button type="button" onClick={() => fillPrompt(message.content)}>Edit and retry</button>
                </article>
              </div>
            ) : (
              <div key={`coach-${index}`} className={styles.coachRow}>
                <article className={styles.coachMessage}>
                  <div className={styles.coachMeta}>
                    <strong>{coachName}</strong><span>Tutor</span>{message.timestamp ? <time>{message.timestamp}</time> : null}
                  </div>
                  {!message.content.trim() ? (
                    <div className={styles.thinking} role="status">
                      <ChatThinkingLogo state="thinking" size={70} label="" />
                      <div>
                        <strong>{stages.find((stage) => stage.status === "active")?.title || `${coachName} is preparing your answer`}</strong>
                        <span>{stages.find((stage) => stage.status === "active")?.detail || "Choosing the clearest learning route."}</span>
                      </div>
                    </div>
                  ) : (
                    <>
                      <SourceDrawer sources={message.sources} />
                      <div className={styles.answerBody}>
                        <TutorAnswer content={message.content} blocks={message.blocks} streaming={loadingAnswer && index === latestCoachIndex} />
                      </div>
                      {!loadingAnswer && index === latestCoachIndex ? (
                        <TutorActions
                          answer={message.content}
                          socratic={message.socratic}
                          onPrompt={fillPrompt}
                          onRegenerate={regenerate}
                          onDirectAnswer={() => void sendMessage("Please give me the direct answer now.", { directAnswer: true })}
                        />
                      ) : null}
                    </>
                  )}
                </article>
              </div>
            ))}
          </div>
        ) : (
          <div className={styles.emptyRoom}>
            <span className={styles.emptyMark}><ChatThinkingLogo state="idle" size={92} label="" /></span>
            <p>{practiceEntry ? "Understanding check" : sourceLabel}</p>
            <h2>{emptyTitle}</h2>
            <span>{emptyDescription}</span>
            <div className={styles.starters}>
              {STARTERS.map((starter) => <button key={starter.label} type="button" onClick={() => fillPrompt(starter.prompt)}>{starter.label}</button>)}
            </div>
          </div>
        )}
      </div>

      <footer className={styles.composerDock}>
        {error ? (
          <div className={styles.errorNotice} role="alert">
            <span className={styles.errorCopy}><AppIcon name="x" /><span>{error}</span></span>
            <span className={styles.errorActions}>
              {canRetry ? <button type="button" onClick={retryFailedRequest}>Try again</button> : null}
              <button type="button" onClick={() => setError("")}>Dismiss</button>
            </span>
          </div>
        ) : null}
        <StudyComposer
          value={input}
          coachName={coachName}
          loading={loadingAnswer}
          listening={listening}
          speechSupported={speechSupported}
          attachments={attachments}
          strictAttachmentGrounding={strictAttachmentGrounding}
          socraticMode={socraticMode}
          menuOpen={composerMenuOpen}
          inputRef={inputRef}
          attachmentInputRef={attachmentInputRef}
          menuRef={menuRef}
          menuTriggerRef={menuTriggerRef}
          firstMenuActionRef={firstMenuActionRef}
          planningAskTopic={planningAskEntry ? scope.topicLabel : undefined}
          onChange={(value) => {
            setFailedRequest(null);
            setInput(value);
          }}
          onKeyDown={handleComposerKeyDown}
          onAttachmentSelect={(event) => void handleAttachmentSelect(event)}
          onRemoveAttachment={(name) => {
            setFailedRequest(null);
            setAttachments((current) => {
              const next = current.filter((attachment) => attachment.name !== name);
              if (!next.length) setStrictAttachmentGrounding(false);
              return next;
            });
          }}
          onToggleMenu={() => setComposerMenuOpen((current) => !current)}
          onToggleSocratic={() => setSocraticMode((current) => !current)}
          onToggleStrictGrounding={() => attachments.length && setStrictAttachmentGrounding((current) => !current)}
          onVoice={startVoiceInput}
          onSend={loadingAnswer ? stopGenerating : () => void sendMessage()}
        />
      </footer>
    </section>
  );
}
