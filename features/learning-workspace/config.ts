import type { AppIconName } from "@/components/ui/Polished";
import type { LearningModeId, SessionRecord } from "@/features/learning-workspace/types";

export type LearningWorkspaceStep = {
  id: LearningModeId;
  step: number;
  title: string;
  eyebrow: string;
  description: string;
  outcome: string;
  href: string;
  icon: AppIconName;
};

export const LEARNING_WORKSPACE_STEPS: LearningWorkspaceStep[] = [
  {
    id: "planning",
    step: 1,
    title: "Planning",
    eyebrow: "Set the route",
    description: "Build a route around your chapters, confidence, and study time.",
    outcome: "A clear next study task",
    href: "/dashboard/planning",
    icon: "mission",
  },
  {
    id: "study",
    step: 2,
    title: "Study Lab",
    eyebrow: "Build understanding",
    description: "Explore your notes, ask questions, and practise what you learn.",
    outcome: "Concepts you can explain",
    href: "/dashboard/study",
    icon: "study",
  },
  {
    id: "revision",
    step: 3,
    title: "Revision",
    eyebrow: "Strengthen recall",
    description: "Recall key ideas and revisit the topics that need another pass.",
    outcome: "Knowledge that sticks",
    href: "/dashboard/revision",
    icon: "book",
  },
  {
    id: "exam",
    step: 4,
    title: "Exam",
    eyebrow: "Prove readiness",
    description: "Try exam-style questions and see where you are ready to move on.",
    outcome: "A readiness signal",
    href: "/dashboard/exam",
    icon: "check",
  },
];

export function getRecommendedMode(session: SessionRecord | null): LearningModeId {
  if (!session) return "planning";

  const sessionType = session.session_type.toLowerCase();
  if (sessionType.includes("mission") || sessionType.includes("plan")) return "study";
  if (sessionType.includes("exam") || sessionType.includes("test")) return "planning";
  if (sessionType.includes("revision") || sessionType.includes("review")) return "exam";
  if (
    sessionType.includes("study")
    || sessionType.includes("coach")
    || sessionType.includes("tutor")
  ) {
    return "revision";
  }
  return "planning";
}

function topicQuery(session: SessionRecord) {
  return session.topic ? `?topic=${encodeURIComponent(session.topic)}` : "";
}

export function getContinueDestination(
  session: SessionRecord | null,
  mode: LearningModeId,
) {
  const topic = session ? topicQuery(session) : "";

  if (mode === "planning") return "/dashboard/planning";
  if (mode === "revision") return `/dashboard/revision${topic}`;
  if (mode === "exam") return `/dashboard/exam${topic}`;
  return `/dashboard/study${topic}`;
}

export function getSessionDestination(session: SessionRecord) {
  const sessionType = session.session_type.toLowerCase();
  const topic = topicQuery(session);

  if (sessionType.includes("mission") || sessionType.includes("plan")) {
    return `/dashboard/planning${topic}`;
  }
  if (sessionType.includes("exam") || sessionType.includes("test")) {
    return `/dashboard/exam${topic}`;
  }
  if (sessionType.includes("revision") || sessionType.includes("review")) {
    return `/dashboard/revision${topic}`;
  }
  return `/dashboard/study${topic}`;
}
