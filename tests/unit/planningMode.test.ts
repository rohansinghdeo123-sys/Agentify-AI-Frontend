import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  getEstimatedPlanMinutes,
  getMissionPlan,
  GOAL_OPTIONS,
  KNOWLEDGE_OPTIONS,
  normalizePlanningDraft,
  normalizePlanningPlan,
  isChapterPlanningMission,
  isRetiredTopicPlanningSnapshot,
  STYLE_OPTIONS,
  type AutonomousMission,
  type PlanningPlan,
  type PlanningScope,
} from "@/features/planning/contracts";
import {
  planningBuilderHref,
  PLANNING_ROUTES,
} from "@/features/planning/routes";

function readSource(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

const mission: AutonomousMission = {
  mission_id: "mission_test",
  status: "ready",
  subject: "Chemistry",
  chapter: "matter",
  target_topic: "Basic Concepts of Chemistry",
  target_source: "selected_chapter",
  plan_scope: "chapter",
  learning_unit_count: 2,
  objective: "Complete Basic Concepts of Chemistry",
  why: "It is the selected chapter.",
  steps: [],
  next_actions: [],
  study_plan: [
    {
      sequence: 1,
      unit_id: "foundations",
      title: "Core ideas",
      duration: "20 min",
      detail: "Learn the central model.",
      focus: "Matter and measurement",
      prerequisite_check: { status: "ready", question: "Can you identify matter?", guidance: "Recall the definition." },
      completion_check: { question: "Can you explain the model?", expected_outcome: "Explain it in your own words." },
    },
    {
      sequence: 2,
      unit_id: "applications",
      title: "Application sprint",
      duration: "15 min",
      detail: "Answer standard questions.",
      focus: "Apply the chapter relationships",
      prerequisite_check: { status: "connect_previous", question: "Can you explain the measurement model?", guidance: "Connect the first unit to the applications." },
      completion_check: { question: "Can you solve a standard application?", expected_outcome: "Solve and explain one application." },
    },
  ],
  diagnostic_question: {
    id: "chapter-check",
    question: "Which statement best connects the chapter ideas?",
    options: ["Correct connection", "Incorrect connection"],
    correct: "Correct connection",
    explanation: "The correct option connects the core ideas.",
  },
};

const scope: PlanningScope = {
  chapter: "matter",
  chapterLabel: "Basic Concepts of Chemistry",
  subject: "Chemistry",
  classLevel: "Class 11",
};

function plan(): PlanningPlan {
  return {
    mission,
    scope,
    profile: {
      currentKnowledge: "some_idea",
      learningGoal: "exam",
      preferredStyle: "examples_first",
      prerequisiteConfidence: "medium",
    },
    catalogSource: "published",
    createdAt: "2026-07-29T10:00:00.000Z",
  };
}

describe("market-ready Planning routes", () => {
  it("exposes one focused route per planning job", () => {
    expect(PLANNING_ROUTES).toEqual({
      home: "/dashboard/planning",
      new: "/dashboard/planning/new",
      active: "/dashboard/planning/active",
      checkpoint: "/dashboard/planning/checkpoint",
      review: "/dashboard/planning/review",
      history: "/dashboard/planning/history",
    });

    Object.values(PLANNING_ROUTES).slice(1).forEach((route) => {
      const leaf = route.split("/").at(-1);
      expect(readSource(`app/dashboard/planning/${leaf}/page.tsx`)).toBeTruthy();
    });
  });

  it("uses one chapter selector and sends chapter-only planning context", () => {
    expect(getEstimatedPlanMinutes(plan())).toBe(35);

    const api = readSource("features/planning/api.ts");
    const builder = readSource("features/planning/PlanningBuilder.tsx");
    expect(api).toContain("current_chapter: scope.chapter");
    expect(api).toContain("class_level: scope.classLevel");
    expect(api).not.toContain("current_topic");
    expect(api).not.toContain("available_minutes");
    expect(api).not.toContain("exam_target");
    expect(builder).not.toContain("Available time");
    expect(builder).not.toContain("Exam target");
    expect(builder).not.toContain("draft.topic");
    expect(builder).not.toContain("selectedTopic");
    expect(builder).not.toContain(">Topic<");
    expect(planningBuilderHref(scope)).toBe("/dashboard/planning/new?chapter=matter");
  });

  it("keeps only supported setup options", () => {
    expect(KNOWLEDGE_OPTIONS.map((option) => option.value)).toEqual(["new", "some_idea", "know_basics"]);
    expect(GOAL_OPTIONS.map((option) => option.value)).toEqual(["deep_understanding", "exam", "fast_track"]);
    expect(STYLE_OPTIONS.map((option) => option.value)).toEqual([
      "examples_first",
      "short_explanations",
      "conceptual_detail",
    ]);
  });

  it("normalizes old drafts but retires old topic-scoped plan snapshots", () => {
    const legacyDraft = normalizePlanningDraft({
      chapter: scope.chapter,
      topic: "legacy_atomic_mass",
      profile: {
        currentKnowledge: "some_idea",
        learningGoal: "quick_revision",
        availableMinutes: "45",
        examTarget: "school_exam",
        preferredStyle: "examples_first",
        prerequisiteConfidence: "medium",
      },
    });
    expect(legacyDraft?.profile).toEqual({
      currentKnowledge: "some_idea",
      learningGoal: "fast_track",
      preferredStyle: "examples_first",
      prerequisiteConfidence: "medium",
    });
    expect(legacyDraft).not.toHaveProperty("topic");

    const currentChapterPlan = normalizePlanningPlan({
      ...plan(),
      scope: { ...plan().scope, topic: "legacy_atomic_mass", topicLabel: "Atomic Mass" },
      requestedMinutes: 45,
    });
    expect(currentChapterPlan).not.toBeNull();
    expect(currentChapterPlan).not.toHaveProperty("requestedMinutes");
    expect(currentChapterPlan?.scope).not.toHaveProperty("topic");
    expect(currentChapterPlan?.scope).not.toHaveProperty("topicLabel");

    const oldTopicPlan = {
      ...plan(),
      mission: { ...mission, plan_scope: undefined, target_source: "selected_topic" },
      scope: { ...plan().scope, topic: "atomic_mass", topicLabel: "Atomic Mass" },
    };
    expect(normalizePlanningPlan(oldTopicPlan)).toBeNull();
    expect(isRetiredTopicPlanningSnapshot(oldTopicPlan)).toBe(true);
  });

  it("accepts only complete chapter missions and never invents a roadmap from legacy steps", () => {
    expect(isChapterPlanningMission(mission)).toBe(true);
    expect(getMissionPlan(mission)).toHaveLength(2);

    const genericLegacy = {
      ...mission,
      plan_scope: undefined,
      learning_unit_count: undefined,
      study_plan: undefined,
      diagnostic_question: undefined,
      steps: ["Generic legacy instruction"],
    } as unknown as AutonomousMission;
    expect(isChapterPlanningMission(genericLegacy)).toBe(false);
    expect(getMissionPlan(genericLegacy)).toEqual([]);

    expect(isChapterPlanningMission({ ...mission, diagnostic_question: undefined })).toBe(false);
    expect(isChapterPlanningMission({ ...mission, study_plan: [] })).toBe(false);
    expect(isChapterPlanningMission({
      ...mission,
      study_plan: mission.study_plan?.map((step) => ({
        ...step,
        prerequisite_check: { ...step.prerequisite_check, question: "Same repeated question" },
      })),
    })).toBe(false);
  });

  it("keeps the full chapter roadmap and prerequisite repair inside Planning", () => {
    const active = readSource("features/planning/PlanningActive.tsx");
    const routes = readSource("features/planning/routes.ts");
    expect(active).toContain("step.prerequisite_check");
    expect(active).toContain("step.completion_check");
    expect(active).toContain("togglePlanStep(index)");
    expect(active).toContain("roadmap and checks stay together in Planning");
    expect(`${active}\n${routes}`).not.toContain("/dashboard/study");
    expect(`${active}\n${routes}`).not.toContain("/dashboard/revision");
    expect(`${active}\n${routes}`).not.toContain("/dashboard/exam");
    expect(routes).not.toContain("getPlanBlockDestination");
    expect(routes).not.toContain("getPlanningHandoffs");
  });

  it("uses confirmed JSON mutations with no automatic POST retry", () => {
    const api = readSource("features/planning/api.ts");
    const checkpoint = readSource("features/planning/PlanningCheckpoint.tsx");

    expect(api).toContain("apiJson");
    expect(api.match(/retries:\s*0/g)?.length).toBeGreaterThanOrEqual(2);
    expect(api).toContain('session_type: "planning_checkpoint"');
    expect(checkpoint).not.toContain("Response saved");
    expect(checkpoint).toContain("checkpoint recorded.");
  });

  it("invalidates an active plan when setup state changes", () => {
    const provider = readSource("features/planning/PlanningExperience.tsx");
    expect(provider).toContain("retireActivePlan()");
    expect(provider).toContain("previous plan no longer matches this setup");
    expect(provider).toContain("clearActivePlanningPlan(userId)");
    expect(provider).toContain("setDraft(savedDraft ?? DEFAULT_DRAFT)");
    expect(provider).toContain("requestInput !== currentInputRef.current");
    expect(provider).toContain("generationId !== generationRef.current");
    expect(provider).toContain("older topic-based plan was retired");
  });

  it("locks setup while generation is running and preserves roadmap focus after completion", () => {
    const builder = readSource("features/planning/PlanningBuilder.tsx");
    const active = readSource("features/planning/PlanningActive.tsx");
    expect(builder).toContain("disabled={generating}");
    expect(builder).toContain("aria-disabled={generating}");
    expect(builder).toContain("if (generating) event.preventDefault()");
    expect(active).not.toContain("setOpenStep(index + 1)");
    expect(active).toContain("stepCompletionState");
    expect(active).toContain('data-completed={isComplete ? "true" : "false"}');
  });

  it("uses chapter-roadmap metadata on Planning entry routes", () => {
    expect(readSource("app/dashboard/planning/page.tsx")).toContain("complete chapter");
    expect(readSource("app/dashboard/planning/active/page.tsx")).toContain("chapter roadmap");
  });

  it("persists chapter roadmap progress on the active plan and in history", () => {
    const provider = readSource("features/planning/PlanningExperience.tsx");
    expect(provider).toContain("completedStepIndexes");
    expect(provider).toContain("writeActivePlanningPlan(userId, nextPlan)");
    expect(provider).toContain("writePlanningHistory(userId, next)");
  });

  it("defines Planning-specific dark control and typography hierarchy", () => {
    const css = readSource("features/planning/planning.module.css");
    expect(css).toMatch(/\[data-theme="dark"\]\) \.screen\s*\{[^}]*--plan-ink:[^;]+;[^}]*--plan-secondary:[^;]+;[^}]*--plan-muted:/);
    expect(css).toContain("--plan-field-text: #dce7f5");
    expect(css).toContain("--plan-field-placeholder: #78899f");
    expect(css).toMatch(/\.field\s*\{[^}]*background:\s*var\(--plan-field-bg\)[^}]*color:\s*var\(--plan-field-text\)/);
    expect(css).toContain('.field option:checked');
    expect(css).toContain(".field:hover:not(:disabled)");
    expect(css).toContain(".field:disabled");
    expect(css).toContain(".personalisePanel");
    expect(css).toContain(".inlineCheck");
    expect(css).toContain(".progressTrack");
  });

  it("keeps Planning parent-sized with one route scroll owner and no viewport units", () => {
    const css = readSource("features/planning/planning.module.css");
    expect(css).not.toMatch(/100(?:d|s|l)?vh/);
    expect(css).toMatch(/\.screen\s*\{[^}]*height:\s*100%[^}]*min-height:\s*0[^}]*overflow:\s*hidden/);
    expect(css).toMatch(/\.scroll\s*\{[^}]*height:\s*100%[^}]*min-height:\s*0[^}]*overflow-y:\s*auto/);
    expect(css.match(/overflow-y:\s*auto/g)).toHaveLength(1);
    expect(css).toContain("prefers-reduced-motion: reduce");
  });
});
