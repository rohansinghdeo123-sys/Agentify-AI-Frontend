import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  LEARNING_WORKSPACE_STEPS,
  getContinueDestination,
  getRecommendedMode,
  getSessionDestination,
  latestLearningSessionFromPayload,
  normalizeLearningSession,
  recommendLearningWorkspace,
} from "@/features/learning-workspace";
import type { SessionRecord } from "@/features/learning-workspace";
import type { PlanningPortfolioState, PlanningUnitStatus } from "@/features/planning/contracts";
import LearningJourney from "@/features/learning-workspace/LearningJourney";

function session(sessionType: string, topic = "Chemical Bonding"): SessionRecord {
  return {
    id: `${sessionType}-1`,
    subject: "Chemistry",
    topic,
    total_questions: 5,
    score: 4,
    xp_earned: 40,
    time_spent_seconds: 600,
    session_type: sessionType,
    completed_at: "2026-07-25T12:00:00.000Z",
  };
}

function planningState({
  proficiency = "know_a_little",
  status = "recommended",
  needsReview = 0,
  mastered = 0,
  total = 10,
}: {
  proficiency?: "new_to_it" | "know_a_little" | "know_the_basics" | "mostly_confident";
  status?: PlanningUnitStatus;
  needsReview?: number;
  mastered?: number;
  total?: number;
} = {}) {
  return {
    activeChapterSlug: "some_basic_concepts_of_chemistry",
    portfolio: {
      global_next_step: {
        chapter_slug: "some_basic_concepts_of_chemistry",
        unit_id: "chemistry-foundations",
        title: "Chemistry foundations",
      },
      aggregate_progress: {
        mastered_units: mastered,
        needs_review_units: needsReview,
        total_units: total,
      },
      chapters: [{
        chapter_slug: "some_basic_concepts_of_chemistry",
        chapter: "Some Basic Concepts of Chemistry",
        chapter_proficiency: proficiency,
        learning_units: [{ id: "chemistry-foundations", status }],
      }],
    },
  } as unknown as PlanningPortfolioState;
}

describe("learning workspace journey", () => {
  it("keeps the canonical four-stage order and routes", () => {
    expect(LEARNING_WORKSPACE_STEPS.map((step) => step.id)).toEqual([
      "planning",
      "study",
      "revision",
      "exam",
    ]);
    expect(LEARNING_WORKSPACE_STEPS.map((step) => step.href)).toEqual([
      "/dashboard/planning",
      "/dashboard/study",
      "/dashboard/revision",
      "/dashboard/exam",
    ]);
  });

  it("guides a new learner through one complete cycle", () => {
    expect(getRecommendedMode(null)).toBe("planning");
    expect(getRecommendedMode(session("planning"))).toBe("study");
    expect(getRecommendedMode(session("study"))).toBe("revision");
    expect(getRecommendedMode(session("revision"))).toBe("exam");
    expect(getRecommendedMode(session("exam"))).toBe("planning");
  });

  it("preserves topic context in continuation links", () => {
    const latest = session("study", "Organic reactions");

    expect(getContinueDestination(latest, "revision")).toBe(
      "/dashboard/revision?topic=Organic%20reactions",
    );
    expect(getSessionDestination(latest)).toBe(
      "/dashboard/study?topic=Organic%20reactions",
    );
  });

  it("recommends from learner evidence while keeping every workspace optional", () => {
    expect(recommendLearningWorkspace(null)).toMatchObject({ mode: "planning", basis: "setup" });
    expect(recommendLearningWorkspace(planningState())).toMatchObject({ mode: "study", basis: "learning_progress" });
    expect(recommendLearningWorkspace(planningState({ status: "needs_review", needsReview: 1 }))).toMatchObject({
      mode: "revision",
      basis: "review_evidence",
    });
    expect(recommendLearningWorkspace(planningState({ proficiency: "mostly_confident" }))).toMatchObject({
      mode: "exam",
      basis: "proficiency",
    });
    expect(recommendLearningWorkspace(planningState({ status: "mastered", mastered: 1, total: 1 }))).toMatchObject({
      mode: "exam",
      basis: "mastery",
    });

    const lowAssessment = { ...session("exam"), score: 2, total_questions: 5 };
    expect(recommendLearningWorkspace(
      planningState({ proficiency: "mostly_confident" }),
      lowAssessment,
    )).toMatchObject({ mode: "revision", basis: "assessment_evidence" });
  });

  it("attributes a multi-chapter review gap to the chapter that actually contains it", () => {
    const state = planningState();
    state.portfolio.chapters.push({
      chapter_slug: "structure_of_atom",
      chapter: "Structure of Atom",
      chapter_proficiency: "know_the_basics",
      learning_units: [{ id: "quantum_numbers", title: "Quantum Numbers", order: 1, status: "needs_review" }],
    } as never);
    state.portfolio.aggregate_progress.needs_review_units = 1;

    const recommendation = recommendLearningWorkspace(state);
    expect(recommendation).toMatchObject({ mode: "revision", basis: "review_evidence" });
    expect(recommendation.reason).toContain("Quantum Numbers in Structure of Atom");
    expect(recommendation.reason).not.toContain("Some Basic Concepts of Chemistry has a demonstrated gap");
  });

  it("normalizes and orders authenticated learning evidence defensively", () => {
    expect(normalizeLearningSession({ id: "broken", session_type: "exam", completed_at: "2026-08-20" })).toBeNull();
    const latest = latestLearningSessionFromPayload({
      sessions: [
        { id: 1, session_type: "study", topic: "matter", questions: 2, correct: 2, timestamp: "2026-08-20T10:00:00Z" },
        { id: 2, session_type: "exam", topic: "mole", questions: 5, correct: 3, timestamp: "2026-08-22T10:00:00Z" },
      ],
    });
    expect(latest).toMatchObject({ id: "2", session_type: "exam", topic: "mole", total_questions: 5, score: 3 });
  });

  it("renders one clear choice screen with only the four canonical landing destinations", () => {
    const markup = renderToStaticMarkup(createElement(LearningJourney));
    const destinationLinks = markup.match(/href="\/dashboard\/(?:planning|study|revision|exam)"/g) ?? [];

    expect(destinationLinks).toHaveLength(4);
    expect(markup).toContain("One clear route from");
    expect(markup).toContain("Start with clarity");
    expect(markup).toContain("Move at your pace");
    expect(markup).toContain("Choose your chapters and starting confidence");
    expect(markup).toContain("Suggested start");
    expect(markup).toContain('data-mode="planning" data-recommended="true"');
    expect(markup).not.toContain("<header");
    expect(markup).not.toContain("<aside");
    expect(markup).not.toContain("<nav");
    expect(markup).not.toContain("Progress snapshot");
    expect(markup).not.toContain("Recent work");
  });

  it("moves the visual recommendation without changing the four available routes", () => {
    const markup = renderToStaticMarkup(createElement(LearningJourney, {
      recommendation: {
        mode: "exam",
        label: "Suggested for you",
        reason: "Your current evidence is ready for a short diagnostic.",
        basis: "mastery",
      },
    }));

    expect(markup).toContain('data-mode="exam" data-recommended="true"');
    expect(markup).toContain("Your current evidence is ready for a short diagnostic.");
    expect(markup.match(/data-recommended="true"/g)).toHaveLength(1);
  });
});
