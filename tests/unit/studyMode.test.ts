import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseStudyStreamFrame } from "@/features/study/api";
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

describe("focused Study Lab architecture", () => {
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
      result: { answer: "Clear answer", blocks: [], sources: undefined, socratic: undefined },
    });
    expect(parseStudyStreamFrame("data: VGVzdCBhbnN3ZXI=")).toEqual({
      kind: "answer",
      result: { answer: "Test answer", blocks: [] },
    });
  });

  it("persists the source ids needed to resume a syllabus chat on another device", () => {
    const api = source("features/study/api.ts");

    expect(api).toContain("catalog_source:");
    expect(api).toContain("selected_chapter_id:");
    expect(api).toContain("selected_topic_id:");
    expect(api).toContain("selected_chapter:");
    expect(api).toContain("selected_topic:");
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
