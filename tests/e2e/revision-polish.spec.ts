import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { installWorkspaceMocks, WORKSPACE_TEST_BACKEND } from "./helpers/mockWorkspace";

const chapter = "some_basic_concepts_of_chemistry";
test.beforeAll(async ({ request }) => {
  await request.get(`/dashboard/revision/${chapter}?topic=chemistry-foundations`);
});

for (const theme of ["light", "dark"] as const) {
  test(`Revision keeps lessons and recall usable in ${theme}`, async ({ page }, testInfo) => {
    await installWorkspaceMocks(page, theme);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route(`${WORKSPACE_TEST_BACKEND}/revision/queue/**`, (route) => route.fulfill({
      contentType: "application/json", body: JSON.stringify({
        user_id: "workspace-visual-test-user", generated_at: new Date().toISOString(),
        summary: { overdue: 0, due: 0, strengthen: 0, fresh: 0, top_pick: null, message: "No urgent topics" }, queue: [],
      }),
    }));
    await page.route(`${WORKSPACE_TEST_BACKEND}/section-ai`, (route) => route.fulfill({
      contentType: "application/json", body: JSON.stringify({ answer: "Matter has mass and occupies space.\n\n- A pure substance has a fixed composition.\n- Mixtures contain two or more substances.\n- Physical properties can be observed without changing chemical identity.\n- Use a familiar example to explain each kind of matter." }),
    }));
    await page.goto("/dashboard/revision");
    await expect(page.getByRole("heading", { name: "Strengthen what matters next." })).toBeVisible();
    await expect(page.getByText("No urgent topics right now")).toBeVisible();
    await page.getByRole("combobox", { name: "Chapter", exact: true }).selectOption(chapter);
    let audit = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    expect(audit.violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual([]);
    const topic = page.getByRole("button", { name: /Chemistry foundations/ });
    await topic.click();
    await expect(topic).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("link", { name: "Start Real Revision" }).click();
    const explanation = page.getByRole("textbox", { name: "Your explanation" });
    await expect(explanation).toBeVisible({ timeout: 30_000 });
    await explanation.fill("Matter has mass and occupies space. A mixture can contain several substances.");
    await expect(page.getByRole("heading", { name: "Notes worth carrying into the exam" })).toBeVisible();
    audit = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    expect(audit.violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    expect(errors).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`revision-${theme}.png`) });
  });
}
