import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getPlanningFocusAreas,
  getPlanningGuidanceSteps,
  isChapterPlanningMission,
  isRetiredTopicPlanningSnapshot,
  normalizePlanningDraft,
  normalizePlanningPlan,
  type AutonomousMission,
  type PlanningPlan,
} from "@/features/planning/contracts";
import { PLANNING_ROUTES } from "@/features/planning/routes";
import { fetchPlanningCatalog, generatePlanningMission } from "@/features/planning/api";
import { resetApiClientForTests } from "@/lib/apiClient";

function readSource(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

const mission: AutonomousMission = {
  mission_id: "mission_focus",
  status: "ready",
  subject: "Chemistry",
  chapter: "matter",
  target_topic: "Basic Concepts of Chemistry",
  target_source: "selected_chapter",
  plan_scope: "chapter",
  brief_version: "chapter_focus_v1",
  chapter_summary: "Prioritise the core models, then connect them through standard applications.",
  focus_areas: [
    {
      focus_area_id: "area-foundations",
      unit_ids: ["matter-model"],
      unit_id: "matter-model",
      unit_titles: ["Matter model"],
      title: "Matter and measurement",
      subtopics: ["Nature of matter", "Units and measurement"],
      focus_level: "high",
      reason: "These ideas support every later calculation.",
      guidance: "Explain the model, then solve one unit-conversion example.",
    },
    {
      focus_area_id: "area-laws",
      unit_ids: ["chemical-laws"],
      unit_id: "chemical-laws",
      unit_titles: ["Chemical laws"],
      title: "Chemical laws",
      subtopics: ["Conservation of mass"],
      focus_level: "medium",
      reason: "The laws connect observations to calculations.",
      guidance: "Match each law to one familiar example.",
    },
    {
      focus_area_id: "area-context",
      unit_ids: ["chemistry-context"],
      unit_id: "chemistry-context",
      unit_titles: ["Chemistry context"],
      title: "Chemistry in context",
      subtopics: ["Role of chemistry"],
      focus_level: "light",
      reason: "This is useful context but needs less problem-solving time.",
      guidance: "Read once and recall two everyday applications.",
    },
  ],
  guidance_steps: [
    {
      sequence: 1,
      title: "Build the base",
      instruction: "Learn the matter model before moving to relationships.",
      focus_unit_ids: ["matter-model"],
    },
    {
      sequence: 2,
      title: "Connect the rules",
      instruction: "Use one example to connect the chemical laws.",
      focus_unit_ids: ["chemical-laws"],
    },
    {
      sequence: 3,
      title: "Finish the quick scan",
      instruction: "Review the context once and explain the chapter aloud.",
      focus_unit_ids: ["chemistry-context"],
    },
  ],
  completion_signal: "You can explain the core model and solve one standard application without notes.",
  coverage: {
    status: "complete",
    included_unit_ids: ["matter-model", "chemical-laws", "chemistry-context"],
    unit_count: 3,
  },
};

function plan(): PlanningPlan {
  return {
    mission,
    scope: {
      chapter: "matter",
      chapterLabel: "Basic Concepts of Chemistry",
      subject: "Chemistry",
      classLevel: "Class 11",
    },
  };
}

describe("compact Planning focus brief", () => {
  beforeEach(() => {
    resetApiClientForTests();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps only the selector and focus-brief routes in visible navigation", () => {
    expect(PLANNING_ROUTES).toEqual({
      home: "/dashboard/planning",
      active: "/dashboard/planning/active",
    });
    ["new", "checkpoint", "review", "history"].forEach((leaf) => {
      const source = readSource(`app/dashboard/planning/${leaf}/page.tsx`);
      expect(source).toContain('redirect("/dashboard/planning")');
    });
  });

  it("renders Class, Subject, Chapter and one generate action on the landing screen", () => {
    const home = readSource("features/planning/PlanningHome.tsx");
    expect(home).toContain('label="Class"');
    expect(home).toContain('label="Subject"');
    expect(home).toContain('label="Chapter"');
    expect(home).toContain("Show my focus plan");
    expect(home).toContain("setClassLevel(value)");
    expect(home).toContain("setSubject(value)");
    expect(home).toContain("setChapter(value)");
    expect(home).not.toContain("Device history");
    expect(home).not.toContain("Personalise");
    expect(home).not.toContain("Available time");
    expect(home).not.toContain("Exam target");
  });

  it("requests a brief using exactly chapter, subject, and class context", () => {
    const api = readSource("features/planning/api.ts");
    expect(api).toContain("current_chapter: scope.chapter");
    expect(api).toContain("subject: scope.subject");
    expect(api).toContain("class_level: scope.classLevel");
    expect(api).not.toContain("current_topic");
    expect(api).not.toContain("current_knowledge");
    expect(api).not.toContain("learning_goal");
    expect(api).not.toContain("preferred_style");
    expect(api).not.toContain("prerequisite_confidence");
  });

  it("sends only the three visible selections in the generation payload", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(mission), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(generatePlanningMission({
      backendURL: "https://planning.test",
      getAuthHeaders: async () => ({ Authorization: "Bearer test" }),
      userId: "student-1",
    }, {
      chapter: "matter",
      chapterLabel: "Basic Concepts of Chemistry",
      subject: "Chemistry",
      classLevel: "Class 11",
    })).resolves.toEqual(mission);

    const [, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(request.body))).toEqual({
      current_chapter: "matter",
      subject: "Chemistry",
      class_level: "Class 11",
    });
  });

  it("flattens all class and subject groups without a built-in fallback", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      source: "published",
      subjects: [
        {
          class_level: "Class 10",
          subject: "Science",
          chapters: [{ slug: "light", name: "Light", chapter_number: 10 }],
        },
        {
          class_level: "Class 11",
          subject: "Chemistry",
          chapters: [{ slug: "matter", name: "Basic Concepts", chapter_number: 1 }],
        },
      ],
    }), { status: 200, headers: { "Content-Type": "application/json" } })));

    await expect(fetchPlanningCatalog({
      backendURL: "https://planning.test",
      getAuthHeaders: async () => ({}),
      userId: "student-1",
    })).resolves.toEqual({
      chapters: [
        { label: "Light", value: "light", subject: "Science", classLevel: "Class 10", order: 10 },
        { label: "Basic Concepts", value: "matter", subject: "Chemistry", classLevel: "Class 11", order: 1 },
      ],
    });
  });

  it("loads every catalog group and resets dependent selections", () => {
    const api = readSource("features/planning/api.ts");
    const provider = readSource("features/planning/PlanningExperience.tsx");
    expect(api).toContain("payload.subjects.forEach");
    expect(api).toContain("rawGroup.class_level");
    expect(api).toContain("rawChapter.chapter_number");
    expect(provider).toContain('changeSetup({ classLevel, subject: "", chapter: "" })');
    expect(provider).toContain('changeSetup({ classLevel: draft.classLevel, subject, chapter: "" })');
    expect(provider).toContain("availableSubjects.length === 1");
    expect(provider).toContain("availableChapters.length === 1");
    expect(provider).not.toContain("BUILTIN_CHAPTERS");
  });

  it("disables cascading controls while loading and offers one retry path", () => {
    const home = readSource("features/planning/PlanningHome.tsx");
    expect(home).toContain('aria-busy={!catalogSettled || generating}');
    expect(home).toContain('disabled={!catalogSettled || generating || !classOptions.length}');
    expect(home).toContain('disabled={!catalogSettled || !classSelected || generating}');
    expect(home).toContain('disabled={!catalogSettled || !subjectSelected || generating}');
    expect(home).toContain('role="alert"');
    expect(home).toContain('onClick={retryCatalog}');
  });

  it("ignores stale generation results and retires plans that no longer match the catalog", () => {
    const provider = readSource("features/planning/PlanningExperience.tsx");
    expect(provider).toContain("generationId !== generationRef.current");
    expect(provider).toContain("requestInput !== currentInputRef.current");
    expect(provider).toContain("signal?.aborted");
    expect(provider).toContain("planStillMatches");
    expect(provider).toContain("clearActivePlanningPlan(userId)");
  });

  it("accepts only complete, bounded, grounded focus briefs", () => {
    expect(isChapterPlanningMission(mission)).toBe(true);
    expect(getPlanningFocusAreas(mission)).toHaveLength(3);
    expect(getPlanningGuidanceSteps(mission)).toHaveLength(3);

    const sixAreas = Array.from({ length: 6 }, (_, index) => ({
      ...mission.focus_areas[0],
      focus_area_id: `area-${index}`,
      unit_ids: [`unit-${index}`],
      unit_id: `unit-${index}`,
      unit_titles: [`Unit ${index}`],
    }));
    const oversizedMission = {
      ...mission,
      focus_areas: sixAreas,
      guidance_steps: mission.guidance_steps.map((step, index) => ({
        ...step,
        focus_unit_ids: index === 2
          ? ["unit-2", "unit-3", "unit-4", "unit-5"]
          : [`unit-${index}`],
      })),
      coverage: {
        status: "complete" as const,
        included_unit_ids: sixAreas.flatMap((area) => area.unit_ids),
        unit_count: sixAreas.length,
      },
    };
    expect(isChapterPlanningMission(oversizedMission)).toBe(false);
    expect(isChapterPlanningMission({
      ...mission,
      coverage: { ...mission.coverage!, included_unit_ids: [...mission.coverage!.included_unit_ids, "chemistry-context"] },
    })).toBe(false);
    expect(isChapterPlanningMission({
      ...mission,
      focus_areas: mission.focus_areas?.map((area, index) => index === 0 ? { ...area, subtopics: [] } : area),
    })).toBe(false);
    expect(isChapterPlanningMission({
      ...mission,
      guidance_steps: mission.guidance_steps?.map((step) => ({ ...step, focus_unit_ids: ["unknown-unit"] })),
    })).toBe(false);
    expect(isChapterPlanningMission({
      ...mission,
      focus_areas: mission.focus_areas.map((area) => ({ ...area, focus_level: "high" })),
    })).toBe(false);
  });

  it("retires old detailed plans instead of relabelling or expanding them", () => {
    const oldMission = {
      ...mission,
      brief_version: undefined,
      focus_areas: undefined,
      guidance_steps: undefined,
      coverage: undefined,
      study_plan: [{
        sequence: 1,
        unit_id: "old-unit",
        title: "Old detailed step",
        duration: "45 min",
        detail: "Legacy detail",
        focus: "Legacy focus",
      }],
    };
    const oldPlan = { ...plan(), mission: oldMission };
    expect(normalizePlanningPlan(oldPlan)).toBeNull();
    expect(isRetiredTopicPlanningSnapshot(oldPlan)).toBe(true);
  });

  it("drops retired hidden setup fields from device drafts", () => {
    const draft = normalizePlanningDraft({
      classLevel: "Class 11",
      subject: "Chemistry",
      chapter: "matter",
      topic: "atomic-mass",
      profile: { learningGoal: "quick_revision" },
      availableMinutes: 120,
      examTarget: "school_exam",
    });
    expect(draft).toEqual({ classLevel: "Class 11", subject: "Chemistry", chapter: "matter" });
  });

  it("drops retired profile and workspace data from current plan snapshots", () => {
    const normalized = normalizePlanningPlan({
      ...plan(),
      profile: {
        currentKnowledge: "some_idea",
        learningGoal: "quick_revision",
        preferredStyle: "examples_first",
        prerequisiteConfidence: "medium",
      },
      study_plan: [{ title: "Legacy workspace step" }],
      diagnostic_question: { question: "Legacy check" },
    });
    expect(normalized).not.toBeNull();
    expect(normalized).not.toHaveProperty("profile");
    expect(normalized).not.toHaveProperty("study_plan");
    expect(normalized).not.toHaveProperty("diagnostic_question");
  });

  it("normalizes a current brief without restoring progress, timing, or checkpoint state", () => {
    const normalized = normalizePlanningPlan({
      ...plan(),
      completedStepIndexes: [0, 1],
      checkpoint: { correct: true },
      requestedMinutes: 120,
    });
    expect(normalized).not.toBeNull();
    expect(normalized).not.toHaveProperty("completedStepIndexes");
    expect(normalized).not.toHaveProperty("checkpoint");
    expect(normalized).not.toHaveProperty("requestedMinutes");
  });

  it("renders a priority-first artifact journey with concise ordered guidance", () => {
    const active = readSource("features/planning/PlanningActive.tsx");
    expect(active).toContain('high: "Deep focus"');
    expect(active).toContain('medium: "Learn well"');
    expect(active).toContain('light: "Quick scan"');
    expect(active.indexOf('level: "high"')).toBeLessThan(active.indexOf('level: "medium"'));
    expect(active.indexOf('level: "medium"')).toBeLessThan(active.indexOf('level: "light"'));
    expect(active).toContain("firstDeepFocusId");
    expect(active).toContain("const primarySubtopic = area.subtopics[0] || area.title");
    expect(active).toContain("area.subtopics.slice(1)");
    expect(active).toContain('className={styles.artifactSubtopicPreview}');
    expect(active).toContain('<ol className={styles.artifactGrid}>');
    expect(active).toContain('className={styles.artifactSummary}');
    expect(active).toContain('aria-expanded={isOpen}');
    expect(active).toContain('aria-controls={panelId}');
    expect(active).toContain('type="button"');
    expect(active).toContain('<ol className={styles.guidanceList}>');
    expect(active).toContain("mission.completion_signal");
    expect(active).not.toContain("<details");
    expect(active).not.toContain("duration");
    expect(active).not.toContain("progress");
    expect(active).not.toContain("checkpoint");
    expect(active).not.toContain("togglePlanStep");
  });

  it("defines readable focus contrast, mobile collapse, and reduced motion", () => {
    const css = readSource("features/planning/planning.module.css");
    expect(css).toContain('.priorityBand[data-level="high"]');
    expect(css).toContain('.priorityBand[data-level="medium"]');
    expect(css).toContain('.priorityBand[data-level="light"]');
    expect(css).toContain(".selectionControl:focus-visible");
    expect(css).toMatch(/\.selectionControl\s*\{[^}]*min-height:\s*3rem/);
    expect(css).toMatch(/\.artifactSummary\s*\{[^}]*min-height:\s*4\.75rem/);
    expect(css).toMatch(/\.artifactGrid\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
    expect(css).toContain(".artifactSummary:focus-visible");
    expect(css).toContain("@media (max-width: 48rem)");
    expect(css).toContain("@media (max-width: 22rem)");
    expect(css).toMatch(/\.artifactSubtopicPreview li\s*\{[^}]*font-size:\s*0\.8125rem[^}]*overflow-wrap:\s*anywhere/);
    expect(css).not.toContain("line-clamp");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
  });

  it("keeps one parent-sized scroll owner and avoids nested main landmarks", () => {
    const css = readSource("features/planning/planning.module.css");
    const active = readSource("features/planning/PlanningActive.tsx");
    expect(css).not.toMatch(/100(?:d|s|l)?vh/);
    expect(css).toMatch(/\.screen\s*\{[^}]*height:\s*100%[^}]*min-height:\s*0[^}]*overflow:\s*hidden/);
    expect(css).toMatch(/\.scroll\s*\{[^}]*height:\s*100%[^}]*min-height:\s*0[^}]*overflow-y:\s*auto/);
    expect(active).not.toContain("<main");
  });
});
