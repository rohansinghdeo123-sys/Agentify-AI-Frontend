export type CoachRole = "user" | "coach";
export type AgentStageId = "received" | "understanding" | "drafting" | "reviewing" | "formatting" | "delivering";
export type AgentStageStatus = "pending" | "active" | "done";
export type ArtifactType = "concept_map" | "flip_cards" | "formula_lab" | "mistake_cards";
export type StudySourceMode = "open" | "syllabus";
export type StudyCatalogSource = "published" | "starter" | "planning_manifest";
export type LearningIntent = "concept" | "exam" | "revision" | "practice" | "planning" | "curiosity";
export type LearningLevel = "beginner" | "intermediate" | "advanced";
export type EmotionalState = "steady" | "confused" | "anxious" | "curious" | "confident";
export type LearningSpeed = "slow" | "balanced" | "fast";
export type AdaptiveAnswerBlockKind = "explanation" | "example" | "formula" | "mistake" | "checkpoint" | "recall";

export interface AdaptiveAnswerBlock {
  kind: AdaptiveAnswerBlockKind | string;
  title: string;
  content: string;
}

export interface CoachMessage {
  role: CoachRole;
  content: string;
  timestamp: string;
  blocks?: AdaptiveAnswerBlock[];
  sources?: CoachSources;
  socratic?: boolean;
  attachments?: DisplayAttachment[];
}

export interface StudyScope {
  source: StudySourceMode;
  catalogSource?: StudyCatalogSource;
  classLevel?: string;
  subject: string;
  chapterId: string;
  chapterLabel: string;
  topicId: string;
  topicLabel: string;
}

export interface StudyConversation {
  id: string;
  sessionId?: string;
  title: string;
  updatedAt: string;
  chapter: string;
  topic: string;
  messages: CoachMessage[];
  pinned?: boolean;
  archived?: boolean;
  titleLocked?: boolean;
  scope?: StudyScope;
}

export interface CoachCitation {
  id: string;
  label: string;
  source: string;
  section_id?: string;
  excerpt?: string;
  kind?: string;
}

export interface CoachSources {
  grounded: boolean;
  indicator?: string;
  answer_basis?: string;
  retrieval_policy?: string;
  material_supported?: boolean;
  source_count?: number;
  citations: CoachCitation[];
}

export interface DisplayAttachment {
  name: string;
  mime_type: string;
  size_bytes: number;
}

export interface PendingAttachment extends DisplayAttachment {
  id: string;
  data_url: string;
}

export interface AgentStageState {
  id: AgentStageId;
  agent: string;
  title: string;
  detail: string;
  status: AgentStageStatus;
}

export interface AgentStagePayload {
  type: "agent_stage";
  stage: AgentStageId;
  status: AgentStageStatus;
  agent?: string;
  title?: string;
  detail?: string;
}

export interface AnswerDeltaPayload {
  type: "answer_delta";
  delta: string;
}

export interface TurnEventPayload {
  type: "turn_event";
  event: string;
  turn_id?: string;
  answer?: string;
  blocks?: AdaptiveAnswerBlock[];
  sources?: CoachSources;
  socratic?: boolean;
  metadata?: Record<string, unknown>;
}

export type StreamProcessResult =
  | { kind: "none" }
  | { kind: "delta"; value: string }
  | { kind: "answer"; value: string };

export interface ArtifactNode {
  id: string;
  label: string;
  description?: string;
  kind?: "core" | "property" | "related" | "prerequisite";
}

export interface ArtifactEdge {
  from: string;
  to: string;
  label?: string;
}

export interface FlipCard {
  front: string;
  back: string;
  tag?: string;
}

export interface FormulaItem {
  label: string;
  formula: string;
  variables?: string[];
  hint?: string;
}

export interface MistakeItem {
  mistake: string;
  correction: string;
  frequency?: string;
}

export interface StudyArtifact {
  type: ArtifactType;
  title: string;
  subtitle?: string;
  nodes?: ArtifactNode[];
  edges?: ArtifactEdge[];
  cards?: FlipCard[];
  formulas?: FormulaItem[];
  mistakes?: MistakeItem[];
  empty_note?: string;
}

export interface StudyArtifactResponse {
  available?: boolean;
  source: string;
  section_id: string;
  subject?: string;
  chapter?: string;
  topic?: string;
  generated_at?: string;
  title: string;
  subtitle?: string;
  student_goal?: string;
  quality?: {
    key_points?: number;
    formulas?: number;
    mistakes?: number;
  };
  artifacts: StudyArtifact[];
}

export interface MentorProfile {
  intent: LearningIntent;
  level: LearningLevel;
  emotion: EmotionalState;
  confidence: number;
  speed: LearningSpeed;
  curiosityDepth: number;
  answerStyle: string;
  nextMove: string;
  shouldTest: boolean;
  weakSignals: string[];
}

export type SpeechRecognitionEventLike = {
  results: {
    [index: number]: {
      [index: number]: {
        transcript: string;
      };
    };
  };
};

export type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

export type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;
