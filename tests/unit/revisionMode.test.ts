import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  readRevisionScope,
  revisionHandoffHref,
  revisionHomeHref,
  revisionLessonHref,
  revisionToolsHref,
} from "@/features/revision/routes";
import {
  REVISION_MATERIAL_NOT_FOUND,
  buildRevisionNotes,
  generateRevisionLesson,
} from "@/features/revision/api";

function source(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

describe("focused Revision Lab architecture", () => {
  const routes = [
    "app/dashboard/revision/page.tsx",
    "app/dashboard/revision/[chapterSlug]/page.tsx",
    "app/dashboard/revision/[chapterSlug]/tools/page.tsx",
  ];

  it("ships independent routes for home, Real Revision, and Study Tools", () => {
    routes.forEach((route) => expect(existsSync(join(process.cwd(), route)), route).toBe(true));

    const home = source(routes[0]);
    const session = source(routes[1]);
    const tools = source(routes[2]);
    const visibleProduct = [home, session, tools].join("\n");

    expect(home).not.toContain('from "../study/page"');
    expect(home).toContain("Start Real Revision");
    expect(home).toContain("Study Tools");
    expect(visibleProduct).not.toContain("Deep Dive");
    expect(visibleProduct).not.toContain("Quick Recall");
  });

  it("keeps lesson and tool generation separated by route", () => {
    const session = source(routes[1]);
    const tools = source(routes[2]);

    expect(session).toContain("generateRevisionLesson");
    expect(session).not.toContain("generateRevisionArtifacts");
    expect(tools).toContain("generateRevisionArtifacts");
    expect(tools).not.toContain("generateRevisionLesson");
  });

  it("protects AI generation from automatic mutation retries", () => {
    const api = source("features/revision/api.ts");

    expect(api.match(/retries:\s*0/g)?.length).toBe(2);
    expect(api).toContain('mode: "explain"');
    expect(api).not.toContain('mode: "summary"');
    expect(api).toContain("buildRevisionNotes(explanation)");
    expect(api).not.toContain("Promise.allSettled");
    expect(api.match(/\/section-ai/g)?.length).toBe(1);
  });

  it("preserves published-only deep links until the catalog has settled", () => {
    const session = source(routes[1]);
    const tools = source(routes[2]);

    expect(session).toContain("const catalogPending = !catalogSettled && !requestedExists");
    expect(session).toContain("if (catalogPending || !selectedChapter || !selectedTopic) return");
    expect(tools).toContain("const catalogPending = !catalogSettled && !requestedExists");
    expect(tools).not.toContain("autoRequestedRef");
  });

  it("exposes every supported study tool only through the dedicated viewer", () => {
    const viewer = source("components/revision/RevisionArtifactWorkspace.tsx");

    expect(viewer).toContain('id: "concept_map"');
    expect(viewer).toContain('id: "flip_cards"');
    expect(viewer).toContain('id: "formula_lab"');
    expect(viewer).toContain('id: "mistake_cards"');
    expect(viewer).toContain("artifactHasContent");
  });

  it("keeps progress claims honest and device-scoped", () => {
    const home = source(routes[0]);
    const session = source(routes[1]);
    const storage = source("features/revision/storage.ts");

    expect(home).toContain("saved on this device");
    expect(session).toContain("not verified mastery");
    expect(storage).toContain("window.localStorage");
    expect(storage).toContain("window.sessionStorage");
  });

  it("keeps recommendations recoverable and hands scoped topics to Study and Exam", () => {
    const home = source(routes[0]);

    expect(home).toContain("retryRecommendations");
    expect(home).toContain("Try recommendations again");
    expect(home).toContain("recommendationRetryRef");
    expect(home).toContain("focus({ preventScroll: true })");
    expect(home).toContain('revisionHandoffHref("study", actionScope)');
    expect(home).toContain('revisionHandoffHref("exam", actionScope)');
    expect(home).toContain("recommendation.entry.reason");
    expect(home).toContain("suggested_minutes");
  });

  it("keeps Revision controls readable, touch-safe, and contained on mobile", () => {
    const hubCss = source("app/dashboard/revision/hub.module.css");
    const screenCss = source("components/revision/revision-screen.module.css");

    expect(hubCss).toContain("color-scheme: light");
    expect(hubCss).toContain("color-scheme: dark");
    expect(hubCss).toMatch(/\.queueRetry\s*\{[^}]*min-height:\s*2\.75rem/);
    expect(hubCss).toMatch(/\.handoffRow a\s*\{[^}]*min-height:\s*2\.75rem/);
    expect(hubCss).toContain("overflow-wrap: anywhere");
    expect(screenCss).toMatch(/\.backLink\s*\{[^}]*min-height:\s*2\.75rem/);
    expect(screenCss).toMatch(/\.actions :where\(a, button\)\s*\{[^}]*min-height:\s*2\.75rem/);
  });
});

describe("Revision note extraction", () => {
  it("derives notes only from the grounded explanation without a second AI call", () => {
    const explanation = [
      "## The core picture",
      "Matter has mass and occupies space, which gives the concept its testable definition.",
      "",
      "## What to remember",
      "- Solids retain a fixed shape because their particles remain closely arranged.",
      "- Liquids retain volume but take the shape of their container.",
      "- Gases expand to fill the available space.",
      "- Temperature can drive interconversion between physical states.",
    ].join("\n");

    const notes = buildRevisionNotes(explanation);

    expect(notes).toContain("Solids retain a fixed shape");
    expect(notes).toContain("Liquids retain volume");
    expect(notes).toContain("Gases expand");
    expect(notes).toContain("Temperature can drive interconversion");
    expect(notes.split("\n")).toHaveLength(4);
  });
});

describe("Revision API failure handling", () => {
  afterEach(() => vi.unstubAllGlobals());

  const context = {
    backendURL: "https://backend.example",
    getAuthHeaders: async () => ({ Authorization: "Bearer test" }),
    userId: "student-1",
  };
  const scope = {
    subject: "Chemistry",
    chapterId: "published-chapter",
    chapterLabel: "Some Basic Concepts of Chemistry",
    topicId: "atomic_mass",
    topicLabel: "Atomic Mass of an Element",
  };

  it("does not mislabel a provider outage as missing study material", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify({ answer: "AI service encountered an error. Please try again." }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    )));

    await expect(generateRevisionLesson(context, scope)).rejects.toMatchObject({
      code: "service_unavailable",
      status: 503,
    });
  });

  it("keeps the published-material error specific to a true retrieval miss", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify({ answer: REVISION_MATERIAL_NOT_FOUND }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    )));

    await expect(generateRevisionLesson(context, scope)).rejects.toMatchObject({
      code: "material_missing",
      status: 404,
    });
  });
});

describe("Revision route scope", () => {
  it("builds stable, normalized deep links", () => {
    const scope = { chapter: "Basic Concepts", topic: "States of Matter" };

    expect(revisionHomeHref(scope)).toBe("/dashboard/revision?chapter=basic_concepts&topic=states_of_matter");
    expect(revisionLessonHref(scope)).toBe("/dashboard/revision/basic_concepts?topic=states_of_matter");
    expect(revisionToolsHref(scope)).toBe("/dashboard/revision/basic_concepts/tools?topic=states_of_matter");
    expect(revisionHandoffHref("study", scope)).toBe("/dashboard/study?chapter=basic_concepts&topic=states_of_matter");
    expect(revisionHandoffHref("exam", scope)).toBe("/dashboard/exam?chapter=basic_concepts&topic=states_of_matter");
  });

  it("reads a chapter segment and topic query without stale UI state", () => {
    const params = new URLSearchParams("topic=properties_of_matter");

    expect(readRevisionScope(params, "matter")).toEqual({
      chapter: "matter",
      topic: "properties_of_matter",
    });
  });
});
