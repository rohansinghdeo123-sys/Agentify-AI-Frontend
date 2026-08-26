import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  planningExamDestinationHref,
  planningExamHubHref,
  readPlanningExamScope,
} from "@/features/exam/mcq/planningScope";
import { EXAM_ROUTES } from "@/features/exam/routes";
import { describe, expect, it } from "vitest";

function source(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

describe("focused Exam Lab architecture", () => {
  const routes = [
    "app/dashboard/exam/page.tsx",
    "app/dashboard/exam/mcq/page.tsx",
    "app/dashboard/exam/probable/page.tsx",
    "app/dashboard/exam/papers/page.tsx",
    "app/dashboard/exam/papers/[paperId]/page.tsx",
    "app/dashboard/exam/workspace/page.tsx",
    "app/dashboard/exam/workspace/history/page.tsx",
    "app/dashboard/exam/workspace/attempts/[attemptId]/page.tsx",
  ];

  it("ships a real route for every focused workspace and secondary detail screen", () => {
    routes.forEach((route) => expect(existsSync(join(process.cwd(), route)), route).toBe(true));
  });

  it("keeps the Exam landing page as a four-destination launcher", () => {
    const hub = source("app/dashboard/exam/page.tsx");

    expect(hub).toContain("EXAM_ROUTES.mcq");
    expect(hub).toContain("EXAM_ROUTES.probable");
    expect(hub).toContain("EXAM_ROUTES.papers");
    expect(hub).toContain("EXAM_ROUTES.workspace");
    expect(hub.match(/route: EXAM_ROUTES\./g)).toHaveLength(4);
    expect(hub).not.toContain("activePanel");
    expect(hub).not.toContain("generate-mcqs");
  });

  it("offers one honest Planning handoff without inventing a default recommendation", () => {
    const planningScope = {
      classLevel: "Class 11",
      subject: "Chemistry",
      chapter: "some_basic_concepts_of_chemistry",
      chapterLabel: "Some Basic Concepts of Chemistry",
      topic: "mole_concept",
      topicLabel: "Mole Concept",
    };
    const hubHref = planningExamHubHref(planningScope);
    const hubParams = new URL(hubHref, "https://agentifyai.test").searchParams;

    expect(readPlanningExamScope(hubParams)).toEqual({
      source: "planning",
      catalogSource: "planning_manifest",
      ...planningScope,
    });
    expect(readPlanningExamScope(new URLSearchParams({ source: "planning", chapter: planningScope.chapter }))).toBeNull();

    [EXAM_ROUTES.mcq, EXAM_ROUTES.probable, EXAM_ROUTES.papers, EXAM_ROUTES.workspace].forEach((route) => {
      const destination = planningExamDestinationHref(route, planningScope);
      expect(destination.startsWith(`${route}?`)).toBe(true);
      expect(readPlanningExamScope(new URL(destination, "https://agentifyai.test").searchParams)).toEqual({
        source: "planning",
        catalogSource: "planning_manifest",
        ...planningScope,
      });
    });

    const hub = source("app/dashboard/exam/page.tsx");
    expect(hub).toContain("const planningScope = readPlanningExamScope(searchParams)");
    expect(hub).toContain("{planningScope ? (");
    expect(hub).toContain("From your Planning roadmap");
    expect(hub).toContain("planningMcqHref(planningScope)");
    expect(hub).toContain("chapter: planningScope.chapterLabel");
    expect(hub).toContain("topic: planningScope.topicLabel");
    expect(hub).toContain("planningExamDestinationHref(destination.route, planningScope)");
    expect(hub).toContain("examHref(destination.route, activeScope)");

    [
      "app/dashboard/exam/probable/page.tsx",
      "app/dashboard/exam/papers/page.tsx",
      "app/dashboard/exam/workspace/page.tsx",
    ].forEach((file) => {
      const contents = source(file);
      expect(contents, file).toContain("readPlanningExamScope(searchParams)");
      expect(contents, file).toContain("planningExamCatalogChapter(planningScope)");
      expect(contents, file).toContain("planningExamQuery(planningScope)");
      expect(contents, file).toContain("Boolean(planningScope)");
    });
  });

  it("keeps AppShell as the only main landmark and restores focus to route headings", () => {
    const examSurfaces = [
      "app/dashboard/exam/page.tsx",
      "components/exam/ExamScreen.tsx",
      "app/dashboard/exam/workspace/page.tsx",
      "app/dashboard/exam/workspace/history/page.tsx",
      "app/dashboard/exam/workspace/attempts/[attemptId]/page.tsx",
    ];

    examSurfaces.forEach((file) => {
      const contents = source(file);
      expect(contents, file).not.toMatch(/<main\b/);
      expect(contents, file).toContain("useRouteHeadingFocus");
      expect(contents, file).toContain("tabIndex={-1}");
    });

    const focusHook = source("components/exam/useRouteHeadingFocus.ts");
    expect(focusHook).toContain("usePathname");
    expect(focusHook).toContain("requestAnimationFrame");
    expect(focusHook).toContain("headingRef.current?.focus()");
  });

  it("keeps primary Exam interactions at least 44px tall", () => {
    const screenCss = source("components/exam/exam-screen.module.css");
    const mcqCss = source("app/dashboard/exam/mcq/mcq.module.css");
    const probableCss = source("app/dashboard/exam/probable/probable.module.css");
    const papersCss = source("app/dashboard/exam/papers/papers.module.css");
    const workspaceCss = source("app/dashboard/exam/workspace/workspace.module.css");

    expect(screenCss).toMatch(/\.backLink \{[\s\S]*?min-height: 2\.75rem;/);
    expect(mcqCss).toMatch(/\.quietLink,\s*\.quietButton \{\s*min-height: 44px;/);
    expect(mcqCss).toMatch(/\.questionGrid button \{[\s\S]*?min-height: 44px;/);
    expect(mcqCss).toMatch(/\.retrySaveButton \{\s*min-height: 44px;/);
    expect(mcqCss).toContain("--exam-teal-ink: #075f73");
    expect(mcqCss).toContain("--exam-teal-ink: #5eead4");
    expect(mcqCss).toContain("linear-gradient(135deg, #0f766e, #0e7490)");
    expect(probableCss).toMatch(/\.emptyResults a \{[\s\S]*?min-height: 44px;/);
    expect(probableCss).toContain("linear-gradient(135deg, #0e7490, #0f766e)");
    expect(papersCss).toMatch(/\.filterGroup button \{[\s\S]*?min-height: 44px;/);
    expect(papersCss).toContain("--exam-functional-danger-ink: #a9213a");
    expect(workspaceCss).toMatch(/\.historyLink,\s*\.quietButton \{\s*min-height: 2\.75rem;/);
    expect(workspaceCss).toMatch(/\.filterGroup button \{\s*min-height: 2\.75rem;/);
    expect(workspaceCss).toContain("--exam-functional-teal-ink: #0f766e");
    expect(workspaceCss).toContain("--exam-functional-teal-ink: #5eead4");
  });

  it("does not couple MCQ generation to probable-question generation", () => {
    const mcq = source("app/dashboard/exam/mcq/page.tsx");

    expect(mcq).toContain('"/generate-mcqs"');
    expect(mcq).toContain('"/submit-session"');
    expect(mcq).not.toContain("generate-probable-questions");
    expect(mcq).toContain('type="radio"');
    expect(mcq).toContain('"beforeunload"');
  });

  it("keeps the completed MCQ draft recoverable until history saving succeeds", () => {
    const mcq = source("app/dashboard/exam/mcq/page.tsx");
    const saveBlock = mcq.slice(mcq.indexOf("const persistResult"), mcq.indexOf("const submitAttempt"));

    expect(saveBlock.indexOf("await examApiRequest")).toBeGreaterThanOrEqual(0);
    expect(saveBlock.indexOf("clearMcqDraft(draftKey)")).toBeGreaterThan(saveBlock.indexOf("await examApiRequest"));
    expect(mcq).toContain("Retry save");
  });

  it("protects Exam mutations from automatic replay", () => {
    const api = source("features/exam/api.ts");

    expect(api).toContain("options.retries ?? (isRead ? 1 : 0)");
    expect(api).toContain("options.retries ?? 0");
    expect(api).toContain("invalidateExamCaches(options.invalidate)");
  });

  it("keeps answer writing, history, and feedback in separate route files", () => {
    const workspace = source("app/dashboard/exam/workspace/page.tsx");
    const history = source("app/dashboard/exam/workspace/history/page.tsx");
    const feedback = source("app/dashboard/exam/workspace/attempts/[attemptId]/page.tsx");

    expect(workspace).toContain('type WorkspaceStage = "setup" | "write" | "feedback"');
    expect(workspace).toContain("agentifyai:exam:written:v1:");
    expect(history).toContain("fetchWrittenHistory");
    expect(feedback).toContain("fetchAttemptFeedback");
  });
});
