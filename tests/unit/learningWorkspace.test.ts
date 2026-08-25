import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  LEARNING_WORKSPACE_STEPS,
  getContinueDestination,
  getRecommendedMode,
  getSessionDestination,
} from "@/features/learning-workspace";
import type { SessionRecord } from "@/features/learning-workspace";
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

  it("renders one clear choice screen with only the four canonical landing destinations", () => {
    const markup = renderToStaticMarkup(createElement(LearningJourney));
    const destinationLinks = markup.match(/href="\/dashboard\/(?:planning|study|revision|exam)"/g) ?? [];

    expect(destinationLinks).toHaveLength(4);
    expect(markup).toContain("What do you want to do");
    expect(markup).toContain("Four focused workspaces");
    expect(markup).toContain("No forced sequence");
    expect(markup).toContain("Suggested start");
    expect(markup).not.toContain("<header");
    expect(markup).not.toContain("<aside");
    expect(markup).not.toContain("<nav");
    expect(markup).not.toContain("Progress snapshot");
    expect(markup).not.toContain("Recent work");
  });
});
