import type { PlanningPortfolioState } from "@/features/planning/contracts";
import { getRecommendedMode } from "./config";
import type { SessionRecord } from "./types";
import type { LearningModeId } from "./types";

export type LearningRecommendation = {
  mode: LearningModeId;
  label: string;
  reason: string;
  basis:
    | "setup"
    | "proficiency"
    | "learning_progress"
    | "review_evidence"
    | "mastery"
    | "recent_session"
    | "assessment_evidence";
};

const DEFAULT_RECOMMENDATION: LearningRecommendation = {
  mode: "planning",
  label: "Suggested start",
  reason: "Choose your chapters and starting confidence so AgentifyAI can build a route around you.",
  basis: "setup",
};

type ReviewTarget = {
  chapter: string;
  title: string;
};

function reviewTarget(state: PlanningPortfolioState): ReviewTarget | null {
  const { portfolio } = state;
  const globalChapter = portfolio.chapters.find((chapter) => (
    chapter.chapter_slug === portfolio.global_next_step.chapter_slug
  ));
  const globalUnit = globalChapter?.learning_units.find((unit) => (
    unit.id === portfolio.global_next_step.unit_id
  ));
  if (globalChapter && globalUnit?.status === "needs_review") {
    return { chapter: globalChapter.chapter, title: globalUnit.title };
  }

  for (const chapter of portfolio.chapters) {
    const unit = [...chapter.learning_units]
      .sort((left, right) => left.order - right.order)
      .find((candidate) => candidate.status === "needs_review");
    if (unit) return { chapter: chapter.chapter, title: unit.title };
  }
  return null;
}

function sessionTopic(session: SessionRecord) {
  const topic = session.topic.trim();
  if (!topic || topic.toLowerCase() === "unknown") return "your latest work";
  return topic.replaceAll("_", " ");
}

function recommendationFromSession(session: SessionRecord | null): LearningRecommendation | null {
  if (!session) return null;
  const sessionType = session.session_type.trim().toLowerCase();
  const topic = sessionTopic(session);
  const accuracy = session.total_questions > 0
    ? Math.round((session.score / session.total_questions) * 100)
    : null;

  // A scored struggle is demonstrated evidence. It takes precedence over the
  // normal workspace cycle, but it is never promoted to mastery here.
  if (accuracy !== null && accuracy < 60) {
    return {
      mode: "revision",
      label: "Suggested from your latest check",
      reason: `${topic} needs another pass based on your latest check. Strengthen the gap, then test it again.`,
      basis: "assessment_evidence",
    };
  }

  const mode = getRecommendedMode(session);
  if (mode === "study") {
    return {
      mode,
      label: "Suggested from recent work",
      reason: `Your route for ${topic} is ready. Open Study Lab to build the understanding behind it.`,
      basis: "recent_session",
    };
  }
  if (mode === "revision") {
    return {
      mode,
      label: "Suggested from recent work",
      reason: `You recently studied ${topic}. A short recall pass will show what has stayed clear.`,
      basis: "recent_session",
    };
  }
  if (mode === "exam") {
    return {
      mode,
      label: "Suggested from recent work",
      reason: `You recently revised ${topic}. Use an exam-style check to demonstrate what you can now do.`,
      basis: "recent_session",
    };
  }
  if (sessionType.includes("exam") || sessionType.includes("test")) {
    return {
      mode: "planning",
      label: "Suggested from recent work",
      reason: `Your latest check for ${topic} is complete. Choose the next chapter or route you want to move forward with.`,
      basis: "recent_session",
    };
  }
  return null;
}

export function recommendLearningWorkspace(
  state: PlanningPortfolioState | null,
  latestSession: SessionRecord | null = null,
): LearningRecommendation {
  const sessionRecommendation = recommendationFromSession(latestSession);
  if (!state) return sessionRecommendation ?? DEFAULT_RECOMMENDATION;

  // Demonstrated struggle from a completed assessment is stronger evidence
  // than an older self-report or device snapshot.
  if (sessionRecommendation?.basis === "assessment_evidence") {
    return sessionRecommendation;
  }

  const { portfolio } = state;
  const chapter = portfolio.chapters.find((item) => (
    item.chapter_slug === portfolio.global_next_step.chapter_slug
  ));
  if (!chapter) return sessionRecommendation ?? DEFAULT_RECOMMENDATION;

  const review = reviewTarget(state);
  if (review) {
    return {
      mode: "revision",
      label: "Suggested for you",
      reason: `${review.title} in ${review.chapter} has a demonstrated gap. Strengthen it before adding more difficulty.`,
      basis: "review_evidence",
    };
  }

  // A valid server portfolio keeps this count synchronized with its units. If
  // a historical snapshot contains only the aggregate, stay truthful and do
  // not attribute that gap to the global-next chapter.
  if (portfolio.aggregate_progress.needs_review_units > 0) {
    return {
      mode: "revision",
      label: "Suggested for you",
      reason: "One of your selected roadmaps has a demonstrated gap. Strengthen it before adding more difficulty.",
      basis: "review_evidence",
    };
  }

  const learningUnits = portfolio.chapters.flatMap((item) => item.learning_units);
  if (learningUnits.length > 0 && learningUnits.every((unit) => unit.status === "mastered")) {
    return {
      mode: "exam",
      label: "Suggested for you",
      reason: "Your selected roadmap is mastered. Use an exam-style check to confirm readiness.",
      basis: "mastery",
    };
  }

  if (chapter.chapter_proficiency === "mostly_confident") {
    return {
      mode: "exam",
      label: "Suggested for you",
      reason: `You marked ${chapter.chapter} as mostly confident. A short diagnostic can prove it and reveal any gaps.`,
      basis: "proficiency",
    };
  }

  return {
    mode: "study",
    label: "Suggested for you",
    reason: `${portfolio.global_next_step.title} is your strongest eligible next step from the selected chapters.`,
    basis: "learning_progress",
  };
}
