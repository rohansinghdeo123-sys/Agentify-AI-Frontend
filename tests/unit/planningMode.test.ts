import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getPlanningLearningUnits,
  isPlanningRoadmap,
  isRetiredPlanningSnapshot,
  normalizePlanningDraft,
  normalizePlanningPlan,
  normalizePlanningRoadmap,
  type PlanningLearningUnit,
  type PlanningPlan,
  type PlanningRoadmap,
  type PlanningStudyTime,
} from "@/features/planning/contracts";
import { PLANNING_ROUTES } from "@/features/planning/routes";
import { planningMcqHref, readPlanningMcqScope } from "@/features/exam/mcq/planningScope";
import {
  fetchPlanningCatalog,
  generatePlanningRoadmap,
  isPlanningPlanSupported,
  type PlanningCatalogChapter,
} from "@/features/planning/api";
import {
  readActivePlanningPlanState,
  readPlanningDraft,
  writeActivePlanningPlan,
} from "@/features/planning/storage";
import { resetApiClientForTests } from "@/lib/apiClient";
import { BUILTIN_CHAPTERS, findCatalogChapter, reconcileSelection } from "@/lib/catalog";

function readSource(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

const UNIT_IDENTITIES = [
  ["chem11_u01_lu01_chemistry_and_its_importance", "Chemistry and Why It Matters", "importance_of_chemistry"],
  ["chem11_u01_lu02_nature_of_matter", "Understanding Matter", "nature_of_matter"],
  ["chem11_u01_lu03_measuring_matter", "Measuring Matter", "si_units"],
  ["chem11_u01_lu04_uncertainty_and_data", "Working with Measured Data", "significant_figures"],
  ["chem11_u01_lu05_laws_of_combination", "How Elements Combine", "law_of_conservation_of_mass"],
  ["chem11_u01_lu06_daltons_atomic_theory", "Dalton's Atomic Model", "daltons_atomic_theory"],
  ["chem11_u01_lu07_atomic_and_molecular_masses", "Masses of Atoms and Molecules", "atomic_mass"],
  ["chem11_u01_lu08_mole_and_molar_mass", "The Mole and Molar Mass", "mole_concept"],
  ["chem11_u01_lu09_composition_and_formulae", "Composition and Chemical Formulae", "percentage_composition"],
  ["chem11_u01_lu10_stoichiometry_and_solutions", "Stoichiometry and Solution Calculations", "stoichiometric_relationships"],
] as const;

function unit(index: number): PlanningLearningUnit {
  const [id, title, primaryTopicId] = UNIT_IDENTITIES[index];
  const status = index === 0 ? "learning" : "not_started";
  return {
    id,
    order: index + 1,
    title,
    short_description: `A clear learning unit for ${title}.`,
    ncert_sections: [{ id: index === 0 ? "intro.development_of_chemistry" : `1.${index + 1}`, title }],
    concepts: [{ id: `${primaryTopicId}_concept`, title: `${title} concept`, status, evidence_count: 0 }],
    skills: index >= 2 ? [`Apply ${title}`] : [],
    practice: index >= 2 ? [`One ${title} check`] : [],
    learning_route: [`Understand ${title}`, `Check ${title}`],
    importance: index >= 7 ? "very_high" : index >= 4 ? "high" : index >= 1 ? "moderate" : "low",
    difficulty: index >= 7 ? "challenging" : index >= 2 ? "steady" : "foundation",
    estimated_minutes: { min: 20 + index * 2, max: 30 + index * 2 },
    prerequisite_unit_ids: index ? [UNIT_IDENTITIES[index - 1][0]] : [],
    dependent_unit_ids: index < UNIT_IDENTITIES.length - 1 ? [UNIT_IDENTITIES[index + 1][0]] : [],
    learning_types: index >= 7 ? ["Concept", "Calculation", "Practice"] : ["Theory/Concept"],
    depth: index >= 7 ? "mastery" : index >= 2 ? "working" : "overview",
    exam_relevance: index >= 7 ? "very_high" : "moderate",
    conceptual_importance: index >= 4 ? "very_high" : "moderate",
    why_it_matters: `${title} supports the next idea in the NCERT sequence.`,
    mastery_criteria: [`Explain ${title} clearly without notes.`],
    status,
    primary_topic_id: primaryTopicId,
  };
}

function roadmap(time: PlanningStudyTime = "30"): PlanningRoadmap {
  const learningUnits = UNIT_IDENTITIES.map((_identity, index) => unit(index));
  return {
    roadmap_version: "planning_roadmap_v2",
    class_level: "Class 11",
    subject: "Chemistry",
    chapter: "Some Basic Concepts of Chemistry",
    chapter_slug: "some_basic_concepts_of_chemistry",
    study_time_today: time,
    curriculum: {
      key: "ncert_class_11_chemistry_unit_1",
      source: "NCERT Class XI Chemistry",
      edition: "2025-26",
      chapter_number: 1,
      content_order_locked: true,
    },
    learning_units: learningUnits,
    next_step: {
      unit_id: learningUnits[0].id,
      title: learningUnits[0].title,
      reason: "Begin with the first incomplete NCERT learning unit.",
      estimated_minutes: learningUnits[0].estimated_minutes,
    },
    daily_route: {
      time_preference: time,
      budget_minutes: time === "no_limit" ? null : time === "120_plus" ? 120 : Number(time),
      total_minutes: time === "15" ? 15 : 20,
      items: [{
        unit_id: learningUnits[0].id,
        title: learningUnits[0].title,
        activity: "Understand the core idea and recall it once.",
        minutes: time === "15" ? 15 : 20,
        scope: time === "15" ? "partial" : "complete",
      }],
    },
    progress: {
      mastered_units: 0,
      learning_units: 1,
      practising_units: 0,
      needs_review_units: 0,
      total_units: learningUnits.length,
      percentage: 0,
    },
    completion_criteria: ["Explain every major idea and solve the chapter's standard numerical patterns."],
    coverage: {
      status: "complete",
      included_unit_ids: learningUnits.map((item) => item.id),
      unit_count: learningUnits.length,
    },
  };
}

function plan(): PlanningPlan {
  return {
    roadmap: roadmap(),
    scope: {
      chapter: "some_basic_concepts_of_chemistry",
      chapterLabel: "Some Basic Concepts of Chemistry",
      subject: "Chemistry",
      classLevel: "Class 11",
      studyTimeToday: "30",
    },
  };
}

function supportedPlanningCatalog(): PlanningCatalogChapter[] {
  return [{
    label: "Some Basic Concepts of Chemistry",
    value: "some_basic_concepts_of_chemistry",
    subject: "Chemistry",
    classLevel: "Class 11",
    order: 1,
    aliases: ["matter"],
    planningSupported: true,
    roadmapVersion: "planning_roadmap_v2",
  }];
}

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    clear: () => values.clear(),
    key: (index: number) => Array.from(values.keys())[index] ?? null,
    get length() { return values.size; },
  };
}

describe("NCERT-ordered Planning roadmap", () => {
  beforeEach(() => resetApiClientForTests());

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("keeps one simple selector route and one roadmap route", () => {
    expect(PLANNING_ROUTES).toEqual({
      home: "/dashboard/planning",
      active: "/dashboard/planning/active",
    });
    ["new", "checkpoint", "review", "history"].forEach((leaf) => {
      expect(readSource(`app/dashboard/planning/${leaf}/page.tsx`)).toContain('redirect("/dashboard/planning")');
    });
  });

  it("keeps Class, Subject, Chapter and one optional today-time choice on the landing screen", () => {
    const home = readSource("features/planning/PlanningHome.tsx");
    expect(home).toContain('label="Class"');
    expect(home).toContain('label="Subject"');
    expect(home).toContain('label="Chapter"');
    expect(home).toContain("How much time would you like to study today?");
    expect(home).toContain("{selectedChapter ? (");
    ["15 min", "30 min", "1 hour", "2+ hours", "No limit"].forEach((label) => {
      expect(readSource("features/planning/contracts.ts")).toContain(`label: "${label}"`);
    });
    expect(home).toContain("aria-pressed={selected}");
    expect(home).toContain("Build my roadmap");
    expect(home).not.toContain("Exam target");
    expect(home).not.toContain("Personalise");
  });

  it("sends optional study time as today's guidance, never chapter-duration input", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(roadmap("30")), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(generatePlanningRoadmap({
      backendURL: "https://planning.test",
      getAuthHeaders: async () => ({ Authorization: "Bearer test" }),
      userId: "student-1",
    }, plan().scope)).resolves.toEqual(roadmap("30"));

    const [, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(request.body))).toEqual({
      current_chapter: "some_basic_concepts_of_chemistry",
      subject: "Chemistry",
      class_level: "Class 11",
      study_time_today: "30",
    });
  });

  it("omits study_time_today when the student leaves the optional choice untouched", async () => {
    const response = roadmap("no_limit");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(response), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })));
    await generatePlanningRoadmap({
      backendURL: "https://planning.test",
      getAuthHeaders: async () => ({}),
      userId: "student-1",
    }, { ...plan().scope, studyTimeToday: "" });
    const fetchMock = vi.mocked(fetch);
    const [, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(request.body))).not.toHaveProperty("study_time_today");
  });

  it("loads only the independent Planning manifest and ignores shared Study/Exam chapters", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      source: "published",
      planning_chapters: [{
        supported: true,
        roadmap_version: "planning_roadmap_v2",
        class_level: "Class 11",
        subject: "Chemistry",
        canonical_slug: "some_basic_concepts_of_chemistry",
        name: "Some Basic Concepts of Chemistry",
        chapter_number: 1,
        aliases: ["matter"],
      }],
      subjects: [
        { class_level: "Class 10", subject: "Science", chapters: [{ slug: "light", name: "Light", chapter_number: 10 }] },
        { class_level: "Class 11", subject: "Chemistry", chapters: [{ slug: "matter", name: "Basic Concepts of Chemistry", chapter_number: 1 }] },
      ],
    }), { status: 200, headers: { "Content-Type": "application/json" } })));
    await expect(fetchPlanningCatalog({
      backendURL: "https://planning.test",
      getAuthHeaders: async () => ({}),
      userId: "student-1",
    })).resolves.toEqual({ chapters: [
      {
        label: "Some Basic Concepts of Chemistry",
        value: "some_basic_concepts_of_chemistry",
        subject: "Chemistry",
        classLevel: "Class 11",
        order: 1,
        aliases: ["matter"],
        planningSupported: true,
        roadmapVersion: "planning_roadmap_v2",
      },
    ] });
  });

  it("uses only the known canonical fallback when an older catalog has no Planning capabilities", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      source: "published",
      subjects: [
        { class_level: "Class 10", subject: "Science", chapters: [{ slug: "light", name: "Light" }] },
        { class_level: "Class 11", subject: "Chemistry", chapters: [
          { slug: "hydrocarbon", name: "Hydrocarbons", planning_supported: true },
          { slug: "matter", name: "Basic Concepts of Chemistry", chapter_number: 1 },
        ] },
      ],
    }), { status: 200, headers: { "Content-Type": "application/json" } })));
    const catalog = await fetchPlanningCatalog({
      backendURL: "https://planning.test",
      getAuthHeaders: async () => ({}),
      userId: "student-1",
    });
    expect(catalog.chapters).toHaveLength(1);
    expect(catalog.chapters[0]).toMatchObject({
      value: "some_basic_concepts_of_chemistry",
      classLevel: "Class 11",
      subject: "Chemistry",
      planningSupported: true,
    });
    expect(catalog.chapters[0].aliases).toContain("matter");
  });

  it("preserves the pre-existing shared Study and Exam topic taxonomy", () => {
    const chapter = findCatalogChapter(BUILTIN_CHAPTERS, "matter");
    expect(chapter?.value).toBe("matter");
    expect(chapter?.topics).toHaveLength(12);
    expect(reconcileSelection(BUILTIN_CHAPTERS, "matter", "gaseous_state")).toEqual({
      chapter: "matter",
      topic: "gaseous_state",
      changed: false,
    });
  });

  it("never restores a valid-looking v2 roadmap outside the supported Planning manifest", () => {
    expect(isPlanningPlanSupported(plan(), supportedPlanningCatalog())).toBe(true);
    const unsupported = plan();
    unsupported.scope = {
      ...unsupported.scope,
      chapter: "hydrocarbon",
      chapterLabel: "Hydrocarbons",
    };
    unsupported.roadmap = {
      ...unsupported.roadmap,
      chapter: "Hydrocarbons",
      chapter_slug: "hydrocarbon",
    };
    expect(isPlanningPlanSupported(unsupported, supportedPlanningCatalog())).toBe(false);
    const provider = readSource("features/planning/PlanningExperience.tsx");
    expect(provider).toContain("isPlanningPlanSupported(activePlan, catalogChapters)");
    expect(provider).toContain("activePlan && catalogSettled && isPlanningPlanSupported");
  });

  it.each([
    [UNIT_IDENTITIES[7][2], UNIT_IDENTITIES[7][1]],
    [UNIT_IDENTITIES[9][2], UNIT_IDENTITIES[9][1]],
  ])("hands Planning unit %s to MCQ without global-catalog fallback", (topic, topicLabel) => {
    const href = planningMcqHref({
      classLevel: "Class 11",
      subject: "Chemistry",
      chapter: "some_basic_concepts_of_chemistry",
      chapterLabel: "Some Basic Concepts of Chemistry",
      topic,
      topicLabel,
    });
    const url = new URL(href, "https://agentifyai.in");
    expect(readPlanningMcqScope(url.searchParams)).toEqual({
      source: "planning",
      catalogSource: "planning_manifest",
      classLevel: "Class 11",
      subject: "Chemistry",
      chapter: "some_basic_concepts_of_chemistry",
      chapterLabel: "Some Basic Concepts of Chemistry",
      topic,
      topicLabel,
    });
    expect(url.searchParams.get("source")).toBe("planning");
    const mcqSource = readSource("app/dashboard/exam/mcq/page.tsx");
    expect(mcqSource).toContain("topic: planningScope ? activeTopicValue : activeTopicLabel");
    expect(mcqSource).toContain("catalog_source: planningScope.catalogSource");
  });

  it("accepts only complete v2 roadmaps with grounded references and separate metadata dimensions", () => {
    expect(isPlanningRoadmap(roadmap())).toBe(true);
    const value = roadmap();
    expect(isPlanningRoadmap({ ...value, next_step: { ...value.next_step, unit_id: "unknown" } })).toBe(false);
    expect(isPlanningRoadmap({ ...value, coverage: { ...value.coverage, unit_count: 9 } })).toBe(false);
    expect(isPlanningRoadmap({
      ...value,
      learning_units: value.learning_units.map((item, index) => index === 0
        ? { ...item, concepts: ["unstructured concept"] }
        : item),
    })).toBe(false);
    expect(isPlanningRoadmap({ ...value, daily_route: null })).toBe(false);
    expect(isPlanningRoadmap({
      ...value,
      learning_units: value.learning_units.map((item, index) => index === 0
        ? { ...item, concepts: [{ ...item.concepts[0], evidence_count: -1 }] }
        : item),
    })).toBe(false);
    expect(isPlanningRoadmap({
      ...value,
      learning_units: value.learning_units.map((item, index) => index === 0
        ? { ...item, learning_route: [] }
        : item),
    })).toBe(false);
    expect(isPlanningRoadmap({
      ...value,
      learning_units: value.learning_units.map((item, index) => index === 3
        ? { ...item, prerequisite_unit_ids: ["unknown"] }
        : item),
    })).toBe(false);
    expect(value.learning_units[7].importance).toBe("very_high");
    expect(value.learning_units[7].difficulty).toBe("challenging");
    expect(value.learning_units[7].exam_relevance).toBe("very_high");
  });

  it("rejects forward dependencies, cycles, reverse-edge mismatches, and dishonest progress", () => {
    const value = roadmap();
    expect(isPlanningRoadmap({
      ...value,
      learning_units: value.learning_units.map((item, index) => index === 0
        ? { ...item, prerequisite_unit_ids: [value.learning_units[1].id] }
        : item),
    })).toBe(false);
    expect(isPlanningRoadmap({
      ...value,
      learning_units: value.learning_units.map((item, index) => index === 0
        ? { ...item, dependent_unit_ids: [] }
        : item),
    })).toBe(false);
    expect(isPlanningRoadmap({
      ...value,
      progress: { ...value.progress, mastered_units: 1, percentage: 10 },
    })).toBe(false);
    expect(isPlanningRoadmap({
      ...value,
      next_step: {
        ...value.next_step,
        unit_id: value.learning_units[1].id,
        title: value.learning_units[1].title,
      },
    })).toBe(false);
  });

  it("rejects reordered, duplicated, over-budget, and arithmetically inconsistent daily routes", () => {
    const value = roadmap("30");
    const first = value.daily_route!.items[0];
    const second = {
      unit_id: value.learning_units[1].id,
      title: value.learning_units[1].title,
      activity: "Continue in NCERT order.",
      reason: "This follows the first unit.",
      minutes: 10,
      scope: "partial" as const,
    };
    const validRoute = { ...value.daily_route!, total_minutes: 30, items: [first, second] };
    expect(isPlanningRoadmap({ ...value, daily_route: validRoute })).toBe(true);
    expect(isPlanningRoadmap({ ...value, daily_route: { ...validRoute, items: [second, first] } })).toBe(false);
    expect(isPlanningRoadmap({ ...value, daily_route: { ...validRoute, items: [first, first] } })).toBe(false);
    expect(isPlanningRoadmap({ ...value, daily_route: { ...validRoute, total_minutes: 29 } })).toBe(false);
    expect(isPlanningRoadmap({ ...value, daily_route: { ...validRoute, budget_minutes: 15 } })).toBe(false);
    expect(isPlanningRoadmap({
      ...value,
      daily_route: { ...validRoute, items: [{ ...first, minutes: 25 }, second], total_minutes: 35 },
    })).toBe(false);
  });

  it("sorts presentation strictly by unit.order rather than importance", () => {
    const value = roadmap();
    const reversed = { ...value, learning_units: [...value.learning_units].reverse() };
    const normalized = normalizePlanningRoadmap(reversed);
    expect(normalized).not.toBeNull();
    expect(getPlanningLearningUnits(normalized).map((item) => item.order)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(getPlanningLearningUnits(normalized)[0].importance).toBe("low");
    expect(getPlanningLearningUnits(normalized)[7].importance).toBe("very_high");
  });

  it("retires a v1 focus snapshot instead of fabricating missing v2 curriculum metadata", () => {
    const legacy = {
      mission: { brief_version: "chapter_focus_v1", plan_scope: "chapter", focus_areas: [] },
      scope: plan().scope,
    };
    expect(normalizePlanningPlan(legacy)).toBeNull();
    expect(isRetiredPlanningSnapshot(legacy)).toBe(true);
  });

  it("preserves a v3 class-subject-chapter draft while moving storage to v4", () => {
    const userId = "student-1";
    const oldKey = `agentify:planning:v3:${encodeURIComponent(userId)}:draft`;
    const storage = memoryStorage({
      [oldKey]: JSON.stringify({ classLevel: "Class 11", subject: "Chemistry", chapter: "matter", availableMinutes: 120 }),
    });
    vi.stubGlobal("window", { localStorage: storage });
    expect(readPlanningDraft(userId)).toEqual({
      classLevel: "Class 11",
      subject: "Chemistry",
      chapter: "matter",
      studyTimeToday: "",
    });
    expect(storage.getItem(`agentify:planning:v4:${encodeURIComponent(userId)}:draft`)).toBeTruthy();
  });

  it("reports a v1 active snapshot as retired during v4 restoration", () => {
    const userId = "student-1";
    const oldKey = `agentify:planning:v3:${encodeURIComponent(userId)}:active`;
    vi.stubGlobal("window", { localStorage: memoryStorage({
      [oldKey]: JSON.stringify({ mission: { brief_version: "chapter_focus_v1" }, scope: plan().scope }),
    }) });
    expect(readActivePlanningPlanState(userId)).toEqual({ plan: null, retired: true, invalid: false });
  });

  it("replaces a saved snapshot atomically when refreshed evidence advances the next unit", () => {
    const userId = "student-1";
    vi.stubGlobal("window", { localStorage: memoryStorage() });
    const initial = plan();
    initial.roadmap = {
      ...initial.roadmap,
      learning_units: initial.roadmap.learning_units.map((item, index) => index === 0
        ? { ...item, status: "not_started", concepts: item.concepts.map((concept) => ({ ...concept, status: "not_started" })) }
        : item),
      progress: { ...initial.roadmap.progress, learning_units: 0 },
    };
    expect(isPlanningRoadmap(initial.roadmap)).toBe(true);
    writeActivePlanningPlan(userId, initial);

    const refreshed = structuredClone(initial);
    refreshed.roadmap.learning_units[0].status = "mastered";
    refreshed.roadmap.learning_units[0].concepts = refreshed.roadmap.learning_units[0].concepts
      .map((concept) => ({ ...concept, status: "mastered", evidence_count: 1 }));
    refreshed.roadmap.learning_units[1].status = "learning";
    refreshed.roadmap.next_step = {
      unit_id: refreshed.roadmap.learning_units[1].id,
      title: refreshed.roadmap.learning_units[1].title,
      reason: "Your latest assessment mastered unit one, so continue in NCERT order.",
      estimated_minutes: refreshed.roadmap.learning_units[1].estimated_minutes,
    };
    refreshed.roadmap.daily_route = {
      ...refreshed.roadmap.daily_route!,
      total_minutes: 20,
      items: [{
        unit_id: refreshed.roadmap.learning_units[1].id,
        title: refreshed.roadmap.learning_units[1].title,
        activity: "Begin the next concept in the chapter sequence.",
        reason: "Unit one is now mastered.",
        minutes: 20,
        scope: "partial",
      }],
    };
    refreshed.roadmap.progress = {
      mastered_units: 1,
      learning_units: 1,
      practising_units: 0,
      needs_review_units: 0,
      total_units: 10,
      percentage: 10,
    };
    expect(isPlanningRoadmap(refreshed.roadmap)).toBe(true);

    writeActivePlanningPlan(userId, refreshed);
    expect(readActivePlanningPlanState(userId).plan?.roadmap).toMatchObject({
      next_step: { unit_id: UNIT_IDENTITIES[1][0] },
      progress: { mastered_units: 1, percentage: 10 },
    });
    const provider = readSource("features/planning/PlanningExperience.tsx");
    const active = readSource("features/planning/PlanningActive.tsx");
    expect(provider).toContain("writeActivePlanningPlan(userId, refreshedPlan)");
    expect(provider).toContain("refreshInFlightRef.current");
    expect(active).toContain('document.addEventListener("visibilitychange"');
    expect(active).toContain("Refreshing your latest learning progress");
  });

  it("normalizes only the four current draft fields", () => {
    expect(normalizePlanningDraft({
      classLevel: "Class 11",
      subject: "Chemistry",
      chapter: "some_basic_concepts_of_chemistry",
      studyTimeToday: "60",
      examTarget: "school_exam",
      learningGoal: "deep_learning",
    })).toEqual({
      classLevel: "Class 11",
      subject: "Chemistry",
      chapter: "some_basic_concepts_of_chemistry",
      studyTimeToday: "60",
    });
  });

  it("renders one next step, optional daily route, honest progress, and progressively disclosed NCERT cards", () => {
    const active = readSource("features/planning/PlanningActive.tsx");
    expect(active).toContain("Your next step");
    expect(active).toContain("showTodayRoute");
    expect(active).toContain("Start today’s route");
    expect(active).toContain("item.reason");
    expect(active).toContain('role="progressbar"');
    expect(active).toContain("Progress changes with learning and practice—not simply opening a card.");
    expect(active).toContain("getPlanningLearningUnits(roadmap)");
    expect(active).toContain("aria-expanded={isOpen}");
    expect(active).toContain("Why this matters");
    expect(active).toContain("Before you start");
    expect(active).toContain("NCERT coverage");
    expect(active).toContain("ncertSectionLabel(section.id, section.title)");
    expect(active).toContain("Opening context ·");
    expect(active).toContain("Learning route");
    expect(active).toContain("unit.learning_route.map");
    expect(active).toContain('title="Unlocks"');
    expect(active).toContain("Done when");
    expect(active).toContain("concept.title");
    expect(active).toContain("STATUS_LABELS[concept.status]");
    expect(active).toContain("unit.learning_types.map(learningTypeLabel)");
    expect(active).not.toContain('unit.learning_types.join(" + ")');
    expect(active).toContain("Start Learning");
    expect(active).toContain("Practice");
    expect(active).toContain("Ask AI");
    expect(active).not.toContain("FOCUS_JOURNEY");
    expect(active).not.toContain("focusAreas.filter");
  });

  it("uses restrained importance accents, responsive detail layout, and reduced motion", () => {
    const css = readSource("features/planning/planning.module.css");
    expect(css).toContain('.roadmapUnit[data-importance="very_high"]');
    expect(css).toContain('.roadmapUnit[data-importance="high"]');
    expect(css).toContain('.roadmapUnit[data-importance="moderate"]');
    expect(css).toContain('.roadmapUnit[data-importance="low"]');
    expect(css).toContain("border-left: 4px solid var(--unit-accent)");
    expect(css).toContain(".unitSummary:focus-visible");
    expect(css).toContain("@media (max-width: 48rem)");
    expect(css).toContain("@media (max-width: 22rem)");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
  });

  it("keeps one parent-sized scroll owner", () => {
    const css = readSource("features/planning/planning.module.css");
    expect(css).not.toMatch(/100(?:d|s|l)?vh/);
    expect(css).toMatch(/\.screen\s*\{[^}]*height:\s*100%[^}]*min-height:\s*0[^}]*overflow:\s*hidden/);
    expect(css).toMatch(/\.scroll\s*\{[^}]*height:\s*100%[^}]*min-height:\s*0[^}]*overflow-y:\s*auto/);
  });
});
