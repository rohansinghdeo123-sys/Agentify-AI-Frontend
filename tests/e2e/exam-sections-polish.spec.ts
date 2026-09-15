import { expect, test, type Locator, type Page, type Route, type TestInfo } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import type { ExamQuestion, PaperOut, ProbableQuestionSet } from "../../features/exam/contracts";
import { getMcqDraftKey } from "../../features/exam/mcq/draft";
import { installWorkspaceMocks, WORKSPACE_TEST_BACKEND } from "./helpers/mockWorkspace";

const scope = "chapter=hydrocarbon&topic=alkanes";
const fixtureDate = "2026-09-08T09:00:00.000Z";
const mcqQuestions: ExamQuestion[] = [
  { id: "mcq-1", question: "Which bonds connect carbon atoms in an alkane?", options: ["Single bonds", "Double bonds", "Triple bonds", "Ionic bonds"], correct: "A", explanation: "Alkanes are saturated hydrocarbons with only single carbon-carbon bonds.", source: "Hydrocarbons / Alkanes / page 3" },
  { id: "mcq-2", question: "What is the molecular formula of methane?", options: ["C2H6", "CH4", "C3H8", "C2H4"], correct: "B", explanation: "Methane has one carbon atom bonded to four hydrogen atoms, giving CH4.", source: "Hydrocarbons / Alkanes / page 4" },
  { id: "mcq-3", question: "Which formula represents propane?", options: ["CH4", "C2H6", "C3H8", "C4H10"], correct: "C", explanation: "Propane has three carbon atoms and eight hydrogen atoms.", source: "Hydrocarbons / Alkanes / page 4" },
  { id: "mcq-4", question: "Which reaction can replace a hydrogen atom in an alkane?", options: ["Hydration", "Substitution", "Addition polymerization", "Neutralization"], correct: "B", explanation: "In a substitution reaction, another atom replaces a hydrogen atom.", source: "Hydrocarbons / Alkanes / page 5" },
  { id: "mcq-5", question: "What forms during complete combustion of an alkane?", options: ["Carbon only", "Hydrogen only", "Carbon monoxide only", "Carbon dioxide and water"], correct: "D", explanation: "With sufficient oxygen, complete combustion produces carbon dioxide and water.", source: "Hydrocarbons / Alkanes / page 6" },
];

const readyPaper: PaperOut = {
  id: 41, class_level: "Class 11", subject: "Chemistry", chapter_id: 2, chapter_name: "Hydrocarbons",
  exam_type: "unit_test", paper_title: "Hydrocarbons practice paper", file_name: "hydrocarbons.txt",
  file_type: "txt", file_size: 2048, upload_status: "uploaded", parse_status: "analyzed",
  uploaded_at: fixtureDate, parsed_at: fixtureDate, extraction_confidence: 0.96,
  extracted_question_count: 5, warnings: [], created_at: fixtureDate, updated_at: fixtureDate,
};
const papers: PaperOut[] = [
  readyPaper,
  { ...readyPaper, id: 42, paper_title: "Scanned chemistry paper", file_name: "scan.pdf", file_type: "pdf", parse_status: "needs_ocr", extraction_confidence: 0, extracted_question_count: 0, parsed_at: null, warnings: ["OCR is required."] },
  { ...readyPaper, id: 43, paper_title: "Unreadable chemistry paper", file_name: "unreadable.pdf", file_type: "pdf", parse_status: "failed", extraction_confidence: 0, extracted_question_count: 0, parsed_at: null, warnings: ["No readable text found."] },
];
const probableSet: ProbableQuestionSet = {
  id: 71, class_level: "Class 11", subject: "Chemistry", chapter_id: 2, chapter_name: "Hydrocarbons",
  source_analysis_ids: [], generation_mode: "mixed",
  probable_questions: mcqQuestions.map((question, index) => ({
    id: `probable-${index + 1}`, question: `Explain: ${question.question}`, marks: index < 2 ? 3 : 5,
    question_type: "short_answer", intent: "explain", topic: "Alkanes",
    priority: index < 2 ? "high" : index < 4 ? "medium" : "low",
    based_on: "This concept appears in the uploaded practice paper.", source: "Hydrocarbons practice paper / question 1",
  })),
  priority_topics: [{ topic: "Alkanes", reason: "Repeated in the source paper", weight: "high" }],
  strategy_summary: "Review saturated hydrocarbons before practising reactions.",
  disclaimer: "Practice guidance based on available evidence, not a guarantee of the actual exam paper.",
  confidence_score: 0.82, created_at: fixtureDate,
};

function deferred() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => { release = resolve; });
  return { promise, release };
}

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status, contentType: "application/json",
    headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "Authorization, Content-Type" },
    body: JSON.stringify(body),
  });
}

async function installPaperSources(page: Page) {
  await page.route(`${WORKSPACE_TEST_BACKEND}/exam/papers?*`, (route) => json(route, { total: papers.length, papers }));
  await page.route(`${WORKSPACE_TEST_BACKEND}/exam/pattern/summary`, (route) => json(route, {
    papers_total: papers.length, papers_analyzed: 1, subjects: ["Chemistry"], latest_analysis: null, analyses: [],
  }));
  await page.route(`${WORKSPACE_TEST_BACKEND}/exam/probable-questions?*`, (route) => json(route, { total: 0, sets: [] }));
}

function watchPageErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

async function auditAndCapture(page: Page, testInfo: TestInfo, name: string) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  const audit = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(audit.violations.filter((violation) => violation.impact === "serious" || violation.impact === "critical")).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath(`${name}.png`), fullPage: true, animations: "disabled" });
}

async function expectFitsViewport(locator: Locator) {
  // Outer overflow:hidden must not disguise clipped cards or off-screen actions.
  await expect.poll(() => locator.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return Math.max(0, -bounds.left, bounds.right - window.innerWidth);
  })).toBeLessThanOrEqual(1);
}

test.beforeAll(async ({ request }) => {
  for (const path of ["/dashboard/exam", "/dashboard/exam/mcq", "/dashboard/exam/papers", "/dashboard/exam/probable"]) {
    await request.get(path);
  }
});

for (const theme of ["light", "dark"] as const) {
  test(`MCQ keeps five-question progress, stage focus and truthful save status in ${theme}`, async ({ page, isMobile }, testInfo) => {
    const errors = watchPageErrors(page);
    const workspace = await installWorkspaceMocks(page, theme);
    let generatedPacks = 0;
    let submitted: Record<string, unknown> | undefined;
    const saveGate = deferred();
    await page.route(`${WORKSPACE_TEST_BACKEND}/generate-mcqs`, (route) => {
      if (route.request().method() === "OPTIONS") return route.fallback();
      expect(route.request().postDataJSON()).toMatchObject({ count: 5, difficulty: "medium", strict_grounding: true, fallback_to_general_knowledge: false });
      generatedPacks += 1;
      return json(route, { questions: generatedPacks === 1 ? mcqQuestions.slice(0, 4) : mcqQuestions });
    });
    await page.route(`${WORKSPACE_TEST_BACKEND}/submit-session`, async (route) => {
      if (route.request().method() === "OPTIONS") return route.fallback();
      submitted = route.request().postDataJSON();
      await saveGate.promise;
      await json(route, { saved: true });
    });
    await page.goto(`/dashboard/exam/mcq?${scope}`);
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    const generate = page.getByRole("button", { name: "Generate MCQ test", exact: true });
    await generate.click();
    await expect(page.getByRole("main").getByRole("alert")).toContainText("did not support a complete grounded pack");
    await expect(page.getByRole("progressbar", { name: "Questions answered" })).toHaveCount(0);
    await expect(generate).toBeEnabled();
    await generate.click();

    const progress = page.getByRole("progressbar", { name: "Questions answered" });
    const questionHeading = (index: number) => page.getByRole("heading", { name: `Question ${index + 1} of 5: ${mcqQuestions[index].question}`, exact: true });
    await expect(questionHeading(0)).toBeFocused();
    await expectFitsViewport(page.getByRole("article"));
    await expectFitsViewport(page.getByRole("button", { name: "Next question", exact: true }));
    await expect(progress).toHaveAttribute("aria-valuemin", "0");
    await expect(progress).toHaveAttribute("aria-valuemax", "5");
    await expect(progress).toHaveAttribute("aria-valuenow", "0");
    await page.getByRole("button", { name: "Next question", exact: true }).click();
    await expect(questionHeading(1)).toBeFocused();
    await page.getByRole("button", { name: "Submit and review" }).click();
    await expect(questionHeading(0)).toBeFocused();
    await expect(page.getByText("Answer question 1 before submitting.", { exact: true })).toBeVisible();
    expect(submitted).toBeUndefined();

    const selectedOptionIndexes = [0, 0, 2, 1, 3]; // Four correct answers and one useful review case.
    for (let index = 0; index < mcqQuestions.length; index += 1) {
      await expect(questionHeading(index)).toBeFocused();
      await page.getByRole("radio", { name: mcqQuestions[index].options[selectedOptionIndexes[index]], exact: true }).check();
      await expect(progress).toHaveAttribute("aria-valuenow", String(index + 1));
      await expect(progress).toHaveAttribute("aria-valuetext", `${index + 1} of 5 questions answered`);
      await expect(page.getByRole("button", { name: `Question ${index + 1}, answered`, exact: true })).toHaveAttribute("aria-current", "step");
      if (index < mcqQuestions.length - 1) await page.getByRole("button", { name: "Next question", exact: true }).click();
    }
    if (isMobile) await page.setViewportSize({ width: 320, height: 851 });
    await expectFitsViewport(page.getByRole("article"));
    await expectFitsViewport(page.getByRole("button", { name: "Submit and review", exact: true }));
    await auditAndCapture(page, testInfo, `mcq-attempt-${theme}`);
    const draftKey = getMcqDraftKey(workspace.userId, "hydrocarbon", "alkanes");
    await expect.poll(() => page.evaluate((key) => sessionStorage.getItem(key), draftKey)).not.toBeNull();
    await page.getByRole("button", { name: "Submit and review" }).click();
    await expect(page.getByRole("heading", { name: "Strong work — your understanding is exam-ready.", exact: true })).toBeFocused();
    await expect(page.getByText("Saving result", { exact: true })).toBeVisible();
    await expect(page.getByText("Your review is ready while history updates", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "New MCQ test", exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Review question 2, incorrect", exact: true })).toHaveAttribute("aria-current", "step");
    await expect.poll(() => submitted).toMatchObject({ score: 4, total_questions: 5, xp_earned: 40, session_type: "study_exam" });
    expect(await page.evaluate((key) => sessionStorage.getItem(key), draftKey)).not.toBeNull();
    saveGate.release();
    await expect(page.getByText("Saved to history", { exact: true })).toBeVisible();
    await expect.poll(() => page.evaluate((key) => sessionStorage.getItem(key), draftKey)).toBeNull();
    await expect(page.getByRole("button", { name: "New MCQ test", exact: true })).toBeEnabled();
    await expect(page.getByText("A. C2H6", { exact: true })).toBeVisible();
    await expect(page.getByText("B. CH4", { exact: true })).toBeVisible();
    await expectFitsViewport(page.getByRole("article"));
    await auditAndCapture(page, testInfo, `mcq-results-${theme}`);

    await page.getByRole("button", { name: "Review question 3, correct", exact: true }).click();
    await expect(page.getByRole("heading", { name: `Review question 3 of 5: ${mcqQuestions[2].question}`, exact: true })).toBeFocused();
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await expect(page.getByRole("heading", { name: `Review question 4 of 5: ${mcqQuestions[3].question}`, exact: true })).toBeFocused();
    await page.getByRole("button", { name: "New MCQ test", exact: true }).click();
    await expect(page.getByRole("heading", { name: "One clear test. No competing tools.", exact: true })).toBeFocused();
    expect(generatedPacks).toBe(2);
    expect(workspace.unhandledRequests).toEqual([]);
    expect(errors).toEqual([]);
  });

  test(`Exam hub and paper readiness remain clear in ${theme}`, async ({ page }, testInfo) => {
    const errors = watchPageErrors(page);
    const workspace = await installWorkspaceMocks(page, theme);
    await installPaperSources(page);
    await page.goto(`/dashboard/exam?${scope}`);
    await expect(page.getByRole("heading", { name: "One clear workspace for every exam task.", exact: true })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    const destinations = page.getByRole("region", { name: "Exam Lab workspaces" });
    await expect(destinations.getByRole("link")).toHaveCount(4);
    for (const route of ["mcq", "probable", "papers", "workspace"]) {
      await expect(destinations.locator(`a[href="/dashboard/exam/${route}?${scope}"]`)).toHaveCount(1);
    }
    await auditAndCapture(page, testInfo, `exam-hub-${theme}`);
    await destinations.getByRole("link", { name: /Question Paper Lab/ }).click();
    await expect(page.getByRole("heading", { name: "Turn past papers into usable exam intelligence.", exact: true })).toBeVisible();
    const library = page.getByRole("region", { name: "Paper library", exact: true });
    await expect(library.getByRole("link")).toHaveCount(3);
    await expect(library.getByText("OCR needed", { exact: true })).toBeVisible();
    await expect(library.getByText("Could not read", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Upload and analyze", exact: true })).toBeDisabled();
    await auditAndCapture(page, testInfo, `exam-papers-${theme}`);
    const ready = page.getByRole("button", { name: "Ready", exact: true });
    await ready.click();
    await expect(ready).toHaveAttribute("aria-pressed", "true");
    await expect(library.getByRole("link")).toHaveCount(1);
    await expect(library.getByRole("link", { name: /Hydrocarbons practice paper/ })).toBeVisible();
    const attention = page.getByRole("button", { name: "Needs attention", exact: true });
    await attention.click();
    await expect(attention).toHaveAttribute("aria-pressed", "true");
    await expect(library.getByRole("link")).toHaveCount(2);
    await page.getByRole("textbox", { name: "Search papers", exact: true }).fill("missing paper");
    await expect(page.getByRole("heading", { name: "No papers match this view", exact: true })).toBeVisible();
    expect(workspace.unhandledRequests).toEqual([]);
    expect(errors).toEqual([]);
  });

  test(`Probable questions hold their evidence scope while generating in ${theme}`, async ({ page }, testInfo) => {
    const errors = watchPageErrors(page);
    const workspace = await installWorkspaceMocks(page, theme);
    await installPaperSources(page);
    const generationGate = deferred();
    let generated: Record<string, unknown> | undefined;
    await page.route(`${WORKSPACE_TEST_BACKEND}/exam/probable-questions/generate`, async (route) => {
      if (route.request().method() === "OPTIONS") return route.fallback();
      generated = route.request().postDataJSON();
      await generationGate.promise;
      await json(route, probableSet);
    });
    await page.goto(`/dashboard/exam/probable?${scope}`);
    await expect(page.getByRole("heading", { name: "Practice what the evidence says matters most.", exact: true })).toBeVisible();
    const generate = page.getByRole("button", { name: "Generate questions", exact: true });
    await expect(generate).toBeEnabled();
    await page.getByRole("combobox", { name: "Questions", exact: true }).selectOption("5");
    await generate.click();
    await expect(page.getByRole("button", { name: /Syllabus Use selected material/ })).toBeDisabled();
    for (const name of ["Chapter", "Topic", "Pattern source", "Question mix", "Questions"]) {
      await expect(page.getByRole("combobox", { name, exact: true })).toBeDisabled();
    }
    await expect.poll(() => generated).toMatchObject({ paper_ids: [41], chapter_name: "Hydrocarbons", count: 5, use_syllabus_grounding: true });
    generationGate.release();
    await expect(page.getByRole("heading", { name: "5 focused questions", exact: true })).toBeVisible();
    await expect(generate).toBeEnabled();
    await expect(page.getByRole("heading", { name: probableSet.probable_questions[0].question, exact: true })).toBeVisible();
    await expect(page.getByText("82%", { exact: true })).toBeVisible();
    await expect(page.getByText(probableSet.disclaimer, { exact: true })).toBeVisible();
    await auditAndCapture(page, testInfo, `exam-probable-ready-${theme}`);
    await page.getByRole("button", { name: new RegExp(probableSet.probable_questions[4].question.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) }).click();
    await expect(page.getByRole("heading", { name: probableSet.probable_questions[4].question, exact: true })).toBeVisible();

    await page.getByRole("combobox", { name: "Chapter", exact: true }).selectOption("some_basic_concepts_of_chemistry");
    await expect(page.getByText("No analyzed papers for this chapter", { exact: true })).toBeVisible();
    await expect(generate).toBeDisabled();
    await expect(page.getByRole("heading", { name: "Build from real paper evidence", exact: true })).toBeVisible();
    await auditAndCapture(page, testInfo, `exam-probable-no-source-${theme}`);
    const syllabus = page.getByRole("button", { name: /Syllabus Use selected material/ });
    await syllabus.click();
    await expect(syllabus).toHaveAttribute("aria-pressed", "true");
    await expect(generate).toBeEnabled();
    await expect(page.getByRole("heading", { name: "Build from your selected material", exact: true })).toBeVisible();
    expect(workspace.unhandledRequests).toEqual([]);
    expect(errors).toEqual([]);
  });
}
