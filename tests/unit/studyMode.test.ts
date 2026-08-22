import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  parseStudyStreamFrame,
  recordPlanningStudyEvidence,
  streamCoachTurn,
} from "@/features/study/api";
import { catalogCacheKey, findCatalogTopic, reconcileSelection } from "@/lib/catalog";
import {
  legacyStudyHandoff,
  openStudyScope,
  readStudyScope,
  studySessionHref,
  syllabusStudyScope,
} from "@/features/study/routes";

function source(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function coachTurnPayload(): Parameters<typeof streamCoachTurn>[1] {
  return {
    userId: "student-1",
    conversationId: "study-1",
    prompt: "Explain matter",
    groundingContextPrompt: "Explain matter",
    scope: openStudyScope(),
    attachments: [],
    directAnswer: false,
    socraticMode: true,
    strictAttachmentGrounding: false,
    intent: "concept",
    mentorDirective: "Teach clearly.",
    systemGuardrail: "Be accurate.",
    studentState: {},
    adaptiveStrategy: {},
    learningContext: {},
    requiredNotFoundResponse: "Material unavailable.",
  };
}

describe("focused Study Lab architecture", () => {
  afterEach(() => vi.unstubAllGlobals());

  const routes = [
    "app/dashboard/study/page.tsx",
    "app/dashboard/study/history/page.tsx",
    "app/dashboard/study/session/[conversationId]/page.tsx",
  ];

  it("ships independent home, session, and history routes", () => {
    routes.forEach((route) => expect(existsSync(join(process.cwd(), route)), route).toBe(true));

    expect(source(routes[0])).toContain("Start a focused session");
    expect(source(routes[1])).toContain("Conversation library");
    expect(source(routes[2])).toContain("StudySessionWorkspace");
  });

  it("remounts session state when the conversation route changes", () => {
    const workspace = source("components/study/StudySessionWorkspace.tsx");

    expect(workspace).toContain("<StudySessionRoom key={conversationId} conversationId={conversationId} />");
  });

  it("keeps revision and exam generation out of the active Study workspace", () => {
    const activeStudy = [
      ...routes.map(source),
      source("components/study/StudySessionWorkspace.tsx"),
      source("features/study/api.ts"),
      source("features/study/studyConfig.ts"),
    ].join("\n");

    [
      "RevisionModeTabs",
      "ArtifactCanvas",
      "REVISION_TOOLS",
      "EXAM_TABS",
      "STUDY_MODES",
      "Deep Dive",
      "Quick Recall",
      "/artifacts/generate",
      "generate-mcqs",
      "generate-probable-questions",
    ].forEach((legacyContract) => expect(activeStudy).not.toContain(legacyContract));
  });

  it("round-trips the exact visible syllabus scope and marks new sessions as fresh", () => {
    const chapter = {
      value: "chemical_bonding",
      label: "Chemical Bonding",
      subject: "Chemistry",
      classLevel: "Class 11",
      topics: [{ value: "vsepr_theory", label: "VSEPR Theory" }],
    };
    const scope = syllabusStudyScope(chapter, chapter.topics[0], "published");
    const href = studySessionHref("study-1", scope, { fresh: true });
    const url = new URL(href, "https://agentifyai.in");

    expect(url.searchParams.get("fresh")).toBe("1");
    expect(readStudyScope(url.searchParams)).toEqual(scope);
    expect(studySessionHref("open-1", openStudyScope(), { fresh: true })).toBe(
      "/dashboard/study/session/open-1?fresh=1",
    );
  });

  it("preserves Planning manifest source and class through a Study deep link and tutor request", async () => {
    const planningScope = {
      source: "syllabus" as const,
      catalogSource: "planning_manifest" as const,
      classLevel: "Class 11",
      subject: "Chemistry",
      chapterId: "some_basic_concepts_of_chemistry",
      chapterLabel: "Some Basic Concepts of Chemistry",
      topicId: "mole_concept",
      topicLabel: "The Mole and Molar Mass",
    };
    const href = studySessionHref("planning-study", planningScope, { fresh: true });
    const url = new URL(href, "https://agentifyai.in");
    expect(readStudyScope(url.searchParams)).toEqual(planningScope);

    const responseText = [
      'data: {"type":"turn_event","event":"answer.completed","answer":"Grounded answer","blocks":[],"interaction_id":"planning-receipt-1"}',
      "",
      "data: [DONE]",
      "",
    ].join("\n");
    const fetchMock = vi.fn().mockResolvedValue(new Response(responseText, {
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
    }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await streamCoachTurn(
      { backendURL: "https://backend.test", headers: {} },
      { ...coachTurnPayload(), scope: planningScope },
    );
    expect(result.interactionId).toBe("planning-receipt-1");
    const [, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(request.body));
    expect(body.learning_context).toMatchObject({
      catalog_source: "planning_manifest",
      class_level: "Class 11",
      selected_chapter_id: "some_basic_concepts_of_chemistry",
      selected_topic_id: "mole_concept",
    });
  });

  it("hands legacy revision and exam deep links to their dedicated labs", () => {
    expect(legacyStudyHandoff(new URLSearchParams("mode=revision&chapter=matter&topic=mass"))).toBe(
      "/dashboard/revision?chapter=matter&topic=mass",
    );
    expect(legacyStudyHandoff(new URLSearchParams("mode=exam&chapter=matter"))).toBe(
      "/dashboard/exam?chapter=matter",
    );
    expect(legacyStudyHandoff(new URLSearchParams("mode=coach"))).toBe("");
  });

  it("parses semantic stages, streaming deltas, completion frames, and legacy base64", () => {
    expect(parseStudyStreamFrame('data: {"type":"agent_stage","stage":"drafting","status":"active"}\r\n\r\n')).toMatchObject({
      kind: "stage",
      stage: { stage: "drafting", status: "active" },
    });
    expect(parseStudyStreamFrame('data: {"type":"answer_delta","delta":"Clear "}\n\n')).toEqual({
      kind: "delta",
      delta: "Clear ",
    });
    expect(parseStudyStreamFrame('data: {"type":"turn_event","event":"answer.completed","answer":"Clear answer","blocks":[]}')).toEqual({
      kind: "answer",
      result: { answer: "Clear answer", blocks: [], sources: undefined, socratic: undefined, interactionId: undefined },
      semantic: true,
    });
    expect(parseStudyStreamFrame("data: VGVzdCBhbnN3ZXI=")).toEqual({
      kind: "answer",
      result: { answer: "Test answer", blocks: [] },
      semantic: false,
    });
  });

  it("keeps the Study request connected through the full SSE answer", async () => {
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        [
          'data: {"type":"agent_stage","stage":"drafting","status":"active"}\n\n',
          'data: {"type":"answer_delta","delta":"Working answer"}\n\n',
          'data: {"type":"turn_event","event":"answer.completed","answer":"Complete answer","blocks":[]}\n\n',
          "data: [DONE]\n\n",
        ].forEach((frame) => controller.enqueue(encoder.encode(frame)));
        controller.close();
      },
    });
    const fetchMock = vi.fn().mockResolvedValue(new Response(body, {
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
    }));
    vi.stubGlobal("fetch", fetchMock);
    const deltas: string[] = [];

    const result = await streamCoachTurn(
      { backendURL: "https://backend.test", headers: { Authorization: "Bearer test" } },
      coachTurnPayload(),
      { onDelta: (delta) => deltas.push(delta) },
    );

    expect(result.answer).toBe("Complete answer");
    expect(deltas.join("")).toBe("Working answer");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://backend.test/coach/chat/stream",
      expect.objectContaining({ method: "POST", signal: expect.any(AbortSignal) }),
    );
  });

  it("records a server-issued Planning answer receipt idempotently without client-authored mastery", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      recorded: true,
      idempotent: false,
      event_count: 1,
      status: "learning",
      curriculum_key: "ncert_class_11_chemistry_unit_1",
      unit_id: "chem11_u01_lu08_mole_and_molar_mass",
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    await recordPlanningStudyEvidence(
      { backendURL: "https://backend.test", headers: { Authorization: "Bearer test" } },
      "planning-receipt-1",
    );

    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://backend.test/planning/learning-events");
    expect(JSON.parse(String(request.body))).toEqual({
      interaction_id: "planning-receipt-1",
      event_type: "study_answer",
    });
    expect(String(request.body)).not.toContain("mastered");
  });

  it("finishes on the backend DONE frame while the socket is open and preserves the semantic answer", async () => {
    const encoder = new TextEncoder();
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode([
          'data: {"type":"answer_delta","delta":"Draft answer"}\n\n',
          'data: {"type":"turn_event","event":"answer.completed","answer":"Rich final answer","blocks":[{"kind":"explanation","title":"Why","content":"Grounded detail"}],"sources":{"grounded":true,"citations":[]}}\n\n',
          "data: TGVnYWN5IGFuc3dlciB0aGF0IG11c3Qgbm90IHdpbg==\n\n",
          "data: [DONE]\n\n",
        ].join("")));
        // The production backend may keep the HTTP socket open briefly after [DONE].
      },
      cancel,
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body, {
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
    })));

    const result = await streamCoachTurn(
      { backendURL: "https://backend.test", headers: { Authorization: "Bearer test" } },
      coachTurnPayload(),
    );

    expect(result.answer).toBe("Rich final answer");
    expect(result.blocks).toEqual([{ kind: "explanation", title: "Why", content: "Grounded detail" }]);
    expect(result.sources).toEqual({ grounded: true, citations: [] });
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it("persists the source ids needed to resume a syllabus chat on another device", () => {
    const api = source("features/study/api.ts");

    expect(api).toContain("catalog_source:");
    expect(api).toContain("selected_chapter_id:");
    expect(api).toContain("selected_topic_id:");
    expect(api).toContain("selected_chapter:");
    expect(api).toContain("selected_topic:");
    expect(api).toContain("class_level:");
    const workspace = source("components/study/StudySessionWorkspace.tsx");
    expect(workspace).toContain('searchParams.get("entry") === "ask_ai"');
    expect(workspace).toContain("planningAskTopic");
    expect(workspace).toContain('scope.catalogSource === "planning_manifest" && result.interactionId');
    expect(workspace).toContain("recordPlanningStudyEvidence");
    expect(workspace).toContain('scope.catalogSource === "planning_manifest"');
    expect(workspace).toContain('"NCERT roadmap"');
  });

  it("isolates authenticated catalog caches by account and normalized class", () => {
    expect(catalogCacheKey("student-a", "Class 11")).toBe("catalog:v2:student-a:11");
    expect(catalogCacheKey("student-b", "11")).toBe("catalog:v2:student-b:11");
    expect(catalogCacheKey("student-a", "Class 11")).not.toBe(catalogCacheKey("student-b", "Class 11"));

    const catalog = source("lib/catalog.ts");
    expect(catalog).toContain("setChapters(BUILTIN_CHAPTERS)");
    expect(catalog).toContain('setSource("builtin")');
  });

  it("maps legacy microtopic selections to their current learning unit", () => {
    const chapter = {
      value: "matter",
      label: "Matter",
      subject: "Chemistry",
      topics: [
        {
          value: "unit_matter_abc",
          label: "States and properties of matter",
          memberIds: ["solid_state", "liquid_state", "gaseous_state"],
        },
      ],
    };

    expect(findCatalogTopic(chapter, "Liquid State")?.value).toBe("unit_matter_abc");
    expect(reconcileSelection([chapter], "matter", "gaseous_state")).toEqual({
      chapter: "matter",
      topic: "unit_matter_abc",
      changed: true,
    });
  });

  it("keeps Study route styles free of viewport-height scroll traps", () => {
    const css = [
      "app/dashboard/study/home.module.css",
      "app/dashboard/study/history/history.module.css",
      "components/study/study-screen.module.css",
      "components/study/study-session.module.css",
    ].map(source).join("\n");

    expect(css).not.toMatch(/\b\d+(?:\.\d+)?(?:d|s|l)?vh\b/i);
    expect(source("components/study/study-session.module.css")).toContain("overflow-y: auto");
  });

  it("keeps the rounded Study composer and history search transparent in light mode", () => {
    const sessionCss = source("components/study/study-session.module.css");
    const historyCss = source("app/dashboard/study/history/history.module.css");

    expect(sessionCss).toContain("background-color: transparent !important");
    expect(sessionCss).toContain("color: var(--study-muted) !important");
    expect(sessionCss).toContain("box-shadow: none !important");
    expect(historyCss).toContain("background-color: transparent !important");
  });
});
