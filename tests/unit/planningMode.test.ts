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
  PLANNING_PROFICIENCY_OPTIONS,
  PLANNING_STUDY_TIME_OPTIONS,
  type PlanningChapterProficiency,
  type PlanningLearningUnit,
  type PlanningPlan,
  type PlanningRoadmap,
  type PlanningStudyTime,
} from "@/features/planning/contracts";
import { PLANNING_ROUTES } from "@/features/planning/routes";
import { planningMcqHref, readPlanningMcqScope } from "@/features/exam/mcq/planningScope";
import {
  BUILTIN_PLANNING_CHAPTERS,
  fetchPlanningCatalog,
  generatePlanningRoadmap,
  isPlanningPlanSupported,
  type PlanningCatalogChapter,
} from "@/features/planning/api";
import {
  readActivePlanningPlanState,
  readPlanningDraft,
  writeActivePlanningPlan,
  writePlanningDraft,
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
  const status = index === 0 ? "recommended" : "not_started";
  const sectionId = index === 0 ? "intro.development_of_chemistry" : `1.${index + 1}`;
  return {
    id,
    order: index + 1,
    title,
    short_description: `A clear learning unit for ${title}.`,
    ncert_sections: [{ id: sectionId, title }],
    ncert_subtopics: [{ id: `${primaryTopicId}_ncert`, title: `${title} NCERT focus`, section_id: sectionId }],
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

function roadmap({
  proficiency = "new_to_it",
  studyTimeToday = null,
  sessionDurationMinutes = null,
  chapter = "Some Basic Concepts of Chemistry",
  chapterSlug = "some_basic_concepts_of_chemistry",
  chapterNumber = 1,
}: {
  proficiency?: PlanningChapterProficiency;
  studyTimeToday?: PlanningStudyTime | null;
  sessionDurationMinutes?: number | null;
  chapter?: string;
  chapterSlug?: string;
  chapterNumber?: number;
} = {}): PlanningRoadmap {
  const learningUnits = UNIT_IDENTITIES.map((_identity, index) => unit(index));
  const selectedBudget: Record<PlanningStudyTime, number | null> = {
    "15": 15,
    "30": 30,
    "60": 60,
    "120_plus": 120,
    no_limit: null,
  };
  const routeSource = studyTimeToday !== null
    ? "student_choice" as const
    : sessionDurationMinutes !== null
      ? "session_state" as const
      : "default_focus" as const;
  const routeBudget = studyTimeToday !== null
    ? selectedBudget[studyTimeToday]
    : sessionDurationMinutes !== null
      ? Math.floor(sessionDurationMinutes / 5) * 5
      : 30;
  const shortRoute = routeBudget === 15;
  const dailyRoute = {
    source: routeSource,
    budget_minutes: routeBudget,
    estimated_minutes: shortRoute ? { min: 15, max: 15 } : { min: 20, max: 30 },
    total_minutes: shortRoute ? 15 : 25,
    items: [
      {
        unit_id: learningUnits[0].id,
        title: learningUnits[0].title,
        activity: "Understand the core idea through one guided example.",
        reason: "This is the first incomplete prerequisite in NCERT order.",
        role: "main_focus" as const,
        minutes: shortRoute ? 10 : 20,
        scope: "partial" as const,
      },
      {
        unit_id: learningUnits[0].id,
        title: learningUnits[0].title,
        activity: "Recall the key idea without notes.",
        reason: "A short retrieval check makes the new learning durable.",
        role: "quick_check" as const,
        minutes: 5,
        scope: "partial" as const,
      },
    ],
  };
  return {
    roadmap_version: "planning_roadmap_v2",
    class_level: "Class 11",
    subject: "Chemistry",
    chapter,
    chapter_slug: chapterSlug,
    chapter_proficiency: proficiency,
    study_time_today: studyTimeToday,
    session_duration_minutes: sessionDurationMinutes,
    curriculum: {
      key: `ncert_class_11_chemistry_unit_${chapterNumber}`,
      source: "NCERT Class XI Chemistry",
      source_reference: { document: `Class XI Chemistry Chapter ${chapterNumber}` },
      edition: "2025-26",
      chapter_number: chapterNumber,
      content_order_locked: true,
    },
    learning_units: learningUnits,
    next_step: {
      unit_id: learningUnits[0].id,
      title: learningUnits[0].title,
      reason: "Begin with the first incomplete NCERT learning unit.",
      estimated_minutes: dailyRoute.estimated_minutes,
      importance: learningUnits[0].importance,
      learning_types: learningUnits[0].learning_types,
      approach: ["Understand the NCERT idea.", "Try one guided example.", "Finish with a quick recall check."],
      outcome: `Explain ${learningUnits[0].title} and use it in a simple example.`,
    },
    daily_route: dailyRoute,
    progress: {
      mastered_units: 0,
      learning_units: 0,
      practising_units: 0,
      needs_review_units: 0,
      recommended_units: 1,
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
      chapterProficiency: "new_to_it",
      studyTimeToday: "",
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

  it("keeps Class → Subject → Chapter → Proficiency → optional Time → Build My Roadmap", () => {
    const home = readSource("features/planning/PlanningHome.tsx");
    const setupMarkers = [
      'label="Class"',
      'label="Subject"',
      'label="Chapter"',
      "How well do you know this chapter?",
      "How much time would you like to study today?",
      "Build My Roadmap",
    ];
    setupMarkers.reduce((previousIndex, marker) => {
      const index = home.indexOf(marker);
      expect(index, `${marker} is present after the previous setup step`).toBeGreaterThan(previousIndex);
      return index;
    }, -1);
    expect(home).toContain("{selectedChapter ? (");
    expect(home).toContain("This helps Agentify personalize your route.");
    expect(home).toContain('role="radiogroup" aria-label="Chapter proficiency"');
    expect(home).toContain('role="group" aria-label="Study time today"');
    expect(home).toContain("setStudyTimeToday(selected ? \"\" : option.value)");
    const generateGate = home.slice(home.indexOf("const canGenerate"), home.indexOf("const buildPlan"));
    expect(generateGate).not.toContain("studyTimeToday");
    expect(home).not.toMatch(/Available Time|Exam Target/i);
    expect(home).not.toMatch(/Weak Basics|Fast Track|Quick Revision|Visual Intuition/i);
  });

  it("offers exactly the four student-friendly proficiency choices", () => {
    expect(PLANNING_PROFICIENCY_OPTIONS).toEqual([
      { value: "new_to_it", label: "New to It", description: "I haven’t studied this chapter before." },
      { value: "know_a_little", label: "Know a Little", description: "I’ve seen it, but I’m not confident." },
      { value: "know_the_basics", label: "Know the Basics", description: "I understand the fundamentals but need stronger practice." },
      { value: "mostly_confident", label: "Mostly Confident", description: "I mainly need revision, practice and gap-finding." },
    ]);
  });

  it("offers exactly five optional, student-friendly time choices", () => {
    expect(PLANNING_STUDY_TIME_OPTIONS).toEqual([
      { value: "15", label: "15 min" },
      { value: "30", label: "30 min" },
      { value: "60", label: "1 hour" },
      { value: "120_plus", label: "2+ hours" },
      { value: "no_limit", label: "No limit" },
    ]);
  });

  it.each(PLANNING_PROFICIENCY_OPTIONS)("sends $label proficiency without removed setup fields", async ({ value }) => {
    const response = roadmap({ proficiency: value });
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(response), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(generatePlanningRoadmap({
      backendURL: "https://planning.test",
      getAuthHeaders: async () => ({ Authorization: "Bearer test" }),
      userId: "student-1",
    }, { ...plan().scope, chapterProficiency: value })).resolves.toEqual(response);

    const [, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(request.body))).toEqual({
      current_chapter: "some_basic_concepts_of_chemistry",
      subject: "Chemistry",
      class_level: "Class 11",
      chapter_proficiency: value,
    });
  });

  it("accepts optional 60-minute ambient session context", async () => {
    const response = roadmap({ proficiency: "know_the_basics", sessionDurationMinutes: 60 });
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(response), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(generatePlanningRoadmap({
      backendURL: "https://planning.test",
      getAuthHeaders: async () => ({}),
      userId: "student-1",
    }, { ...plan().scope, chapterProficiency: "know_the_basics", sessionDurationMinutes: 60 })).resolves.toEqual(response);

    const [, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(request.body))).toEqual({
      current_chapter: "some_basic_concepts_of_chemistry",
      subject: "Chemistry",
      class_level: "Class 11",
      chapter_proficiency: "know_the_basics",
      session_duration_minutes: 60,
    });
    expect(response.daily_route).toMatchObject({
      source: "session_state",
      budget_minutes: 60,
      estimated_minutes: { min: 20, max: 30 },
      total_minutes: 25,
    });
  });

  it.each(PLANNING_STUDY_TIME_OPTIONS)("sends the selected $label preference", async ({ value }) => {
    const response = roadmap({ studyTimeToday: value });
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(response), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(generatePlanningRoadmap({
      backendURL: "https://planning.test",
      getAuthHeaders: async () => ({}),
      userId: "student-1",
    }, { ...plan().scope, studyTimeToday: value })).resolves.toEqual(response);

    const [, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(request.body))).toMatchObject({ study_time_today: value });
  });

  it("omits study_time_today when the optional choice is untouched", async () => {
    const response = roadmap();
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(response), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    await generatePlanningRoadmap({
      backendURL: "https://planning.test",
      getAuthHeaders: async () => ({}),
      userId: "student-1",
    }, plan().scope);

    const [, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(request.body))).not.toHaveProperty("study_time_today");
  });

  it("accepts a 15-minute ambient session when no explicit choice exists", async () => {
    const response = roadmap({ sessionDurationMinutes: 15 });
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(response), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(generatePlanningRoadmap({
      backendURL: "https://planning.test",
      getAuthHeaders: async () => ({}),
      userId: "student-1",
    }, { ...plan().scope, sessionDurationMinutes: 15 })).resolves.toEqual(response);
    const [, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(request.body))).toMatchObject({ session_duration_minutes: 15 });
    expect(response.daily_route).toMatchObject({ source: "session_state", budget_minutes: 15, total_minutes: 15 });
  });

  it.each([48, 49])("floors a %i-minute ambient session to a safe 45-minute route budget", (minutes) => {
    const response = roadmap({ sessionDurationMinutes: minutes });
    expect(response.daily_route.budget_minutes).toBe(45);
    expect(isPlanningRoadmap(response)).toBe(true);
    expect(isPlanningRoadmap({
      ...response,
      daily_route: { ...response.daily_route, budget_minutes: 50 },
    })).toBe(false);
  });

  it("lets an explicit 15-minute choice override ambient 60-minute context", async () => {
    const response = roadmap({ studyTimeToday: "15", sessionDurationMinutes: 60 });
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(response), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(generatePlanningRoadmap({
      backendURL: "https://planning.test",
      getAuthHeaders: async () => ({}),
      userId: "student-1",
    }, { ...plan().scope, studyTimeToday: "15", sessionDurationMinutes: 60 })).resolves.toEqual(response);
    expect(response.daily_route).toMatchObject({
      source: "student_choice",
      budget_minutes: 15,
      total_minutes: 15,
    });

    const [, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(request.body))).toMatchObject({
      study_time_today: "15",
      session_duration_minutes: 60,
    });
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
      }, {
        supported: true,
        roadmap_version: "planning_roadmap_v2",
        class_level: "Class 11",
        subject: "Chemistry",
        canonical_slug: "structure_of_atom",
        name: "Structure of Atom",
        chapter_number: 2,
        aliases: ["Atomic Structure"],
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
      {
        label: "Structure of Atom",
        value: "structure_of_atom",
        subject: "Chemistry",
        classLevel: "Class 11",
        order: 2,
        aliases: ["Atomic Structure"],
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
    expect(provider).toContain("isPlanningPlanSupported(activePlan, supportCatalog)");
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

  it("keeps dynamic Next Step timing consistent with the route without inflating the unit card", () => {
    const fifteenMinutePlan = roadmap({ studyTimeToday: "15" });
    expect(isPlanningRoadmap(fifteenMinutePlan)).toBe(true);
    expect(fifteenMinutePlan.next_step.estimated_minutes).toEqual({ min: 15, max: 15 });
    expect(fifteenMinutePlan.daily_route.estimated_minutes).toEqual({ min: 15, max: 15 });
    expect(fifteenMinutePlan.learning_units[0].estimated_minutes).toEqual({ min: 20, max: 30 });
    expect(isPlanningRoadmap({
      ...fifteenMinutePlan,
      next_step: {
        ...fifteenMinutePlan.next_step,
        estimated_minutes: fifteenMinutePlan.learning_units[0].estimated_minutes,
      },
    })).toBe(false);
  });

  it("rejects a route that pads today with a later learning unit", () => {
    const value = roadmap({ studyTimeToday: "60" });
    const laterUnit = value.learning_units[1];
    expect(isPlanningRoadmap({
      ...value,
      daily_route: {
        ...value.daily_route,
        items: value.daily_route.items.map((item, index) => (
          index === value.daily_route.items.length - 1
            ? { ...item, unit_id: laterUnit.id, title: laterUnit.title }
            : item
        )),
      },
    })).toBe(false);
  });

  it("keeps Recommended, Next Step, Today’s Route, and progress on one consistent source of truth", () => {
    const value = roadmap();
    const recommended = value.learning_units[0];

    expect(isPlanningRoadmap(value)).toBe(true);
    expect(value.session_duration_minutes).toBeNull();
    expect(value.daily_route).toMatchObject({
      source: "default_focus",
      budget_minutes: 30,
      estimated_minutes: { min: 20, max: 30 },
      total_minutes: 25,
    });
    expect(recommended.status).toBe("recommended");
    expect(value.progress).toMatchObject({ recommended_units: 1, mastered_units: 0, percentage: 0 });
    expect(value.next_step).toMatchObject({
      unit_id: recommended.id,
      title: recommended.title,
      estimated_minutes: recommended.estimated_minutes,
      importance: recommended.importance,
      learning_types: recommended.learning_types,
    });
    expect(value.next_step.approach).toHaveLength(3);
    expect(value.next_step.outcome).toContain(recommended.title);
    expect(value.daily_route.items[0]).toMatchObject({
      unit_id: recommended.id,
      role: "main_focus",
    });
    expect(value.daily_route.items.map((item) => item.role)).toEqual(["main_focus", "quick_check"]);
    expect(value.daily_route.items.some((item) => /complete/i.test(item.activity))).toBe(false);
  });

  it("preserves detailed NCERT subsection mapping beneath every scannable learning unit", () => {
    const value = roadmap();
    expect(value.learning_units).toHaveLength(10);
    value.learning_units.forEach((learningUnit) => {
      expect(learningUnit.ncert_subtopics.length).toBeGreaterThan(0);
      learningUnit.ncert_subtopics.forEach((subtopic) => {
        expect(learningUnit.ncert_sections.map((section) => section.id)).toContain(subtopic.section_id);
      });
    });
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
    const value = roadmap();
    const [first, second] = value.daily_route.items;
    const validRoute = value.daily_route;
    expect(isPlanningRoadmap(value)).toBe(true);
    expect(isPlanningRoadmap({ ...value, daily_route: { ...validRoute, items: [second, first] } })).toBe(false);
    expect(isPlanningRoadmap({ ...value, daily_route: { ...validRoute, items: [first, first] } })).toBe(false);
    expect(isPlanningRoadmap({ ...value, daily_route: { ...validRoute, total_minutes: 24 } })).toBe(false);
    expect(isPlanningRoadmap({ ...value, daily_route: { ...validRoute, budget_minutes: 20 } })).toBe(false);
    expect(isPlanningRoadmap({
      ...value,
      daily_route: { ...validRoute, items: [{ ...first, minutes: 30 }, second], total_minutes: 35 },
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

  it("restores roadmap scope from one canonical source of truth", () => {
    const saved = plan();
    saved.scope = {
      chapter: "structure_of_atom",
      chapterLabel: "Structure of Atom",
      subject: "Physics",
      classLevel: "Class 12",
      chapterProficiency: "mostly_confident",
      studyTimeToday: "60",
      sessionDurationMinutes: 60,
    };

    expect(normalizePlanningPlan(saved)?.scope).toEqual({
      chapter: saved.roadmap.chapter_slug,
      chapterLabel: saved.roadmap.chapter,
      subject: saved.roadmap.subject,
      classLevel: saved.roadmap.class_level,
      chapterProficiency: saved.roadmap.chapter_proficiency,
      studyTimeToday: "",
    });
  });

  it("preserves saved roadmaps through catalog retries and resets proficiency on replacement", () => {
    const provider = readSource("features/planning/PlanningExperience.tsx");
    expect(provider).toContain("const [catalogLoaded, setCatalogLoaded]");
    expect(provider).toContain("if (!catalogLoaded || !activePlan || !catalogChapters.length) return;");
    expect(provider).toContain("return { ...current, classLevel, subject, chapter, chapterProficiency: \"\" };");
    expect(provider).toContain("next.studyTimeToday === draft.studyTimeToday");
    expect(provider).toContain("currentInputRef.current = JSON.stringify({ userId, scope })");
    expect(isPlanningPlanSupported(plan(), BUILTIN_PLANNING_CHAPTERS)).toBe(true);
    const unsupported = plan();
    unsupported.roadmap = {
      ...unsupported.roadmap,
      chapter: "Hydrocarbons",
      chapter_slug: "hydrocarbons",
    };
    expect(isPlanningPlanSupported(unsupported, BUILTIN_PLANNING_CHAPTERS)).toBe(false);
  });

  it("preserves a v3 class-subject-chapter draft while moving storage to v6", () => {
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
      chapterProficiency: "",
      studyTimeToday: "",
    });
    expect(storage.getItem(`agentify:planning:v6:${encodeURIComponent(userId)}:draft`)).toBeTruthy();
  });

  it("migrates a selected v4 time preference and a no-time v5 draft into v6", () => {
    const selectedUser = "student-selected";
    const noTimeUser = "student-no-time";
    const storage = memoryStorage({
      [`agentify:planning:v4:${encodeURIComponent(selectedUser)}:draft`]: JSON.stringify({
        classLevel: "Class 11",
        subject: "Chemistry",
        chapter: "structure_of_atom",
        chapterProficiency: "know_a_little",
        studyTimeToday: "30",
      }),
      [`agentify:planning:v5:${encodeURIComponent(noTimeUser)}:draft`]: JSON.stringify({
        classLevel: "Class 11",
        subject: "Chemistry",
        chapter: "structure_of_atom",
        chapterProficiency: "know_the_basics",
      }),
    });
    vi.stubGlobal("window", { localStorage: storage });

    expect(readPlanningDraft(selectedUser)?.studyTimeToday).toBe("30");
    expect(readPlanningDraft(noTimeUser)?.studyTimeToday).toBe("");
    expect(storage.getItem(`agentify:planning:v6:${encodeURIComponent(selectedUser)}:draft`)).toBeTruthy();
    expect(storage.getItem(`agentify:planning:v6:${encodeURIComponent(noTimeUser)}:draft`)).toBeTruthy();
  });

  it("upgrades a pre-time V2 roadmap without losing the active plan", () => {
    const legacy = structuredClone(plan()) as unknown as Record<string, unknown>;
    const legacyRoadmap = legacy.roadmap as Record<string, unknown>;
    delete legacyRoadmap.study_time_today;
    legacyRoadmap.daily_route = {
      ...(legacyRoadmap.daily_route as Record<string, unknown>),
      budget_minutes: 25,
    };

    const migrated = normalizePlanningPlan(legacy);
    expect(migrated?.roadmap.study_time_today).toBeNull();
    expect(migrated?.roadmap.daily_route.budget_minutes).toBe(30);
    expect(migrated?.roadmap.next_step.estimated_minutes).toEqual(
      migrated?.roadmap.daily_route.estimated_minutes,
    );
  });

  it("persists chapter proficiency and optional time choice on refresh", () => {
    const userId = "student-1";
    const storage = memoryStorage();
    vi.stubGlobal("window", { localStorage: storage });
    writePlanningDraft(userId, {
      classLevel: "Class 11",
      subject: "Chemistry",
      chapter: "structure_of_atom",
      chapterProficiency: "mostly_confident",
      studyTimeToday: "15",
    });
    expect(readPlanningDraft(userId)).toEqual({
      classLevel: "Class 11",
      subject: "Chemistry",
      chapter: "structure_of_atom",
      chapterProficiency: "mostly_confident",
      studyTimeToday: "15",
    });
  });

  it("reports a v1 active snapshot as retired during v6 restoration", () => {
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
    expect(isPlanningRoadmap(initial.roadmap)).toBe(true);
    writeActivePlanningPlan(userId, initial);

    const refreshed = structuredClone(initial);
    refreshed.roadmap.learning_units[0].status = "mastered";
    refreshed.roadmap.learning_units[0].concepts = refreshed.roadmap.learning_units[0].concepts
      .map((concept) => ({ ...concept, status: "mastered", evidence_count: 1 }));
    refreshed.roadmap.learning_units[1].status = "recommended";
    refreshed.roadmap.learning_units[1].concepts = refreshed.roadmap.learning_units[1].concepts
      .map((concept) => ({ ...concept, status: "recommended" }));
    refreshed.roadmap.next_step = {
      unit_id: refreshed.roadmap.learning_units[1].id,
      title: refreshed.roadmap.learning_units[1].title,
      reason: "Your latest assessment mastered unit one, so continue in NCERT order.",
      estimated_minutes: refreshed.roadmap.daily_route.estimated_minutes,
      importance: refreshed.roadmap.learning_units[1].importance,
      learning_types: refreshed.roadmap.learning_units[1].learning_types,
      approach: ["Scan the concept.", "Try one example.", "Check recall."],
      outcome: `Explain ${refreshed.roadmap.learning_units[1].title} without notes.`,
    };
    refreshed.roadmap.daily_route = {
      ...refreshed.roadmap.daily_route,
      total_minutes: 25,
      items: [
        {
          unit_id: refreshed.roadmap.learning_units[1].id,
          title: refreshed.roadmap.learning_units[1].title,
          activity: "Begin the next concept in the chapter sequence.",
          reason: "Unit one is now mastered.",
          role: "main_focus",
          minutes: 20,
          scope: "partial",
        },
        {
          unit_id: refreshed.roadmap.learning_units[1].id,
          title: refreshed.roadmap.learning_units[1].title,
          activity: "Recall the new idea once.",
          reason: "A quick check confirms the next step has landed.",
          role: "quick_check",
          minutes: 5,
          scope: "partial",
        },
      ],
    };
    refreshed.roadmap.progress = {
      mastered_units: 1,
      learning_units: 0,
      practising_units: 0,
      needs_review_units: 0,
      recommended_units: 1,
      total_units: 10,
      percentage: 10,
    };
    expect(isPlanningRoadmap(refreshed.roadmap)).toBe(true);

    writeActivePlanningPlan(userId, refreshed);
    expect(readActivePlanningPlanState(userId).plan?.roadmap).toMatchObject({
      next_step: { unit_id: UNIT_IDENTITIES[1][0] },
      progress: { mastered_units: 1, percentage: 10 },
    });
    expect(readActivePlanningPlanState(userId).plan?.scope.chapterProficiency).toBe("new_to_it");
    const provider = readSource("features/planning/PlanningExperience.tsx");
    const active = readSource("features/planning/PlanningActive.tsx");
    expect(provider).toContain("writeActivePlanningPlan(userId, refreshedPlan)");
    expect(provider).toContain("refreshInFlightRef.current");
    expect(active).toContain('document.addEventListener("visibilitychange"');
    expect(active).toContain("Refreshing your latest learning progress");
  });

  it("normalizes the five current setup fields and drops obsolete target/style fields", () => {
    expect(normalizePlanningDraft({
      classLevel: "Class 11",
      subject: "Chemistry",
      chapter: "some_basic_concepts_of_chemistry",
      chapterProficiency: "know_the_basics",
      studyTimeToday: "60",
      availableTime: "60",
      examTarget: "school_exam",
      currentKnowledge: "weak_basics",
      learningGoal: "deep_learning",
      preferredStyle: "visual_intuition",
    })).toEqual({
      classLevel: "Class 11",
      subject: "Chemistry",
      chapter: "some_basic_concepts_of_chemistry",
      chapterProficiency: "know_the_basics",
      studyTimeToday: "60",
    });
  });

  it.each(["Fast Track", "Quick Revision"])("migrates legacy %s intent to Mostly Confident", (legacyGoal) => {
    expect(normalizePlanningDraft({
      classLevel: "Class 11",
      subject: "Chemistry",
      chapter: "some_basic_concepts_of_chemistry",
      planGoal: legacyGoal,
    })).toEqual({
      classLevel: "Class 11",
      subject: "Chemistry",
      chapter: "some_basic_concepts_of_chemistry",
      chapterProficiency: "mostly_confident",
      studyTimeToday: "",
    });
  });

  it("renders one next step, optional daily route, honest progress, and progressively disclosed NCERT cards", () => {
    const active = readSource("features/planning/PlanningActive.tsx");
    expect(active).toContain("Your next step");
    expect(active).toContain("showTodayRoute");
    expect(active).toContain("Start today’s route");
    expect(active).toContain("item.reason");
    expect(active).toContain('item.role === "main_focus" ? "Main focus" : "Quick check"');
    expect(active).not.toContain('item.role === "main_focus" ? "Complete"');
    expect(active).toContain('role="progressbar"');
    expect(active).toContain("Mastery comes from learning, recall and demonstrated practice—not simply opening a card.");
    expect(active).toContain("Your first win starts with one clear step");
    expect(active).toContain("How to approach it");
    expect(active).toContain("roadmap.next_step.approach.map");
    expect(active).toContain("Afterward:");
    expect(active).toContain("roadmap.next_step.outcome");
    expect(active).toContain("Continue");
    expect(active).toContain("Done for Today");
    expect(active).toContain("getPlanningLearningUnits(roadmap)");
    expect(active).toContain("aria-expanded={isOpen}");
    expect(active).toContain("Why this topic?");
    expect(active).toContain("Prerequisites");
    expect(active).toContain("NCERT coverage");
    expect(active).toContain("NCERT subtopics");
    expect(active).toContain("unit.ncert_subtopics.map");
    expect(active).toContain("ncertSectionLabel(section.id, section.title)");
    expect(active).toContain("Opening context ·");
    expect(active).toContain("How to study it");
    expect(active).toContain("unit.learning_route.map");
    expect(active).toContain('title="Unlocks"');
    expect(active).toContain("Mastery criteria");
    expect(active).toContain("Practice requirements");
    expect(active).toContain("Depth required");
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
    expect(css).toMatch(/\.timeOption\s*\{[^}]*min-height:\s*2\.75rem/);
    expect(css).toContain(".timeOption:focus-visible");
    expect(css).toMatch(/\.timeOptions\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
    expect(css).toMatch(/@media \(max-width: 22rem\)[\s\S]*\.timeOptions\s*\{[^}]*grid-template-columns:\s*1fr/);
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
