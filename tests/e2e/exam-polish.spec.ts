import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { installWorkspaceMocks, WORKSPACE_TEST_BACKEND } from "./helpers/mockWorkspace";

test.beforeAll(async ({ request }) => {
  await request.get("/dashboard/exam/workspace");
});

for (const theme of ["light", "dark"] as const) {
  test(`Exam holds submitted settings and recovers the answer draft in ${theme}`, async ({ page }, testInfo) => {
    await installWorkspaceMocks(page, theme);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    let releaseQuestion!: () => void;
    const questionGate = new Promise<void>((resolve) => { releaseQuestion = resolve; });
    await page.route(`${WORKSPACE_TEST_BACKEND}/exam/written-practice/start`, async (route) => {
      await questionGate;
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ id: 1, class_level: "Class 11", subject: "Chemistry", chapter_id: 2, chapter_name: "Hydrocarbons", topic: "Alkanes", marks_focus: "5", session_status: "active", started_at: new Date().toISOString(), completed_at: null, attempt_count: 0 }) });
    });
    await page.route(`${WORKSPACE_TEST_BACKEND}/exam/written-practice/question`, (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ attempt_id: 1, session_id: 1, question_text: "Explain why alkanes are saturated hydrocarbons.", question_type: "long_answer", marks_total: 5, topic: "Alkanes", command_word: "explain", evaluation_status: "awaiting_answer" }) }));
    let releaseEvaluation!: () => void;
    const evaluationGate = new Promise<void>((resolve) => { releaseEvaluation = resolve; });
    await page.route(`${WORKSPACE_TEST_BACKEND}/exam/written-practice/submit`, async (route) => {
      await evaluationGate;
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ detail: "Evaluation temporarily unavailable. Please retry." }) });
    });
    await page.goto("/dashboard/exam/workspace");
    const generated = page.getByRole("button", { name: /Generated question/ });
    await generated.click();
    await expect(generated).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "Generate question", exact: true }).click();
    await expect(generated).toBeDisabled();
    await expect(page.getByRole("spinbutton", { name: "Marks" })).toBeDisabled();
    await expect(page.getByRole("combobox", { name: "Question style" })).toBeDisabled();
    releaseQuestion();
    const answer = page.getByRole("textbox", { name: "Answer", exact: true });
    await expect(answer).toBeVisible();
    const draft = "Alkanes contain only single carbon-carbon bonds and the maximum number of hydrogen atoms.";
    await answer.fill(draft);
    await page.getByRole("button", { name: "Submit for evaluation" }).click();
    await expect(answer).toBeDisabled();
    await expect(page.getByRole("button", { name: "Start over" })).toBeDisabled();
    releaseEvaluation();
    await expect(page.getByRole("main").getByRole("alert")).toBeVisible();
    await expect(answer).toBeEnabled();
    await expect(answer).toHaveValue(draft);
    const audit = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    expect(audit.violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    expect(errors).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`exam-${theme}.png`) });
  });
}
