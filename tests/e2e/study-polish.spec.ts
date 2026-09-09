import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { installWorkspaceMocks, WORKSPACE_TEST_BACKEND, WORKSPACE_TEST_USER_ID } from "./helpers/mockWorkspace";

test.beforeAll(async ({ request }) => {
  // Compile the rich workspace once before timing client-side interactions.
  await request.get("/dashboard/study/session/compile-fixture?fresh=1", { timeout: 120_000 });
});

for (const theme of ["light", "dark"] as const) {
  test(`Study history and tutor stay readable and recoverable in ${theme}`, async ({ page }, testInfo) => {
    await installWorkspaceMocks(page, theme, { state: "empty" });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    let historyOffline = true;
    await page.route(`${WORKSPACE_TEST_BACKEND}/coach/conversations/${WORKSPACE_TEST_USER_ID}`, (route) => route.fulfill({
      status: historyOffline ? 503 : 200,
      contentType: "application/json",
      body: JSON.stringify(historyOffline ? { detail: "Temporary sync outage" } : []),
    }));
    await page.goto("/dashboard/study");
    await expect(page.getByText("Your history could not sync")).toBeVisible();
    historyOffline = false;
    await page.getByRole("button", { name: "Retry sync" }).click();
    await expect(page.getByText("Your first conversation starts here")).toBeVisible();
    let audit = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    expect(audit.violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual([]);
    await page.getByRole("button", { name: /Ask AI directly/ }).click();
    const input = page.getByRole("textbox", { name: "Message your AI tutor" });
    // The first navigation compiles the rich tutor workspace in the dev server.
    await expect(input).toBeVisible({ timeout: 45_000 });
    expect(await input.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);
    await page.getByRole("button", { name: "Open tutor tools" }).click();
    const guide = page.getByRole("button", { name: /Guide me step by step/ });
    await expect(guide).toBeVisible();
    const before = await guide.getAttribute("aria-pressed");
    await guide.click();
    await expect(guide).toHaveAttribute("aria-pressed", before === "true" ? "false" : "true");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: "Open tutor tools" })).toBeFocused();
    await page.route(`${WORKSPACE_TEST_BACKEND}/coach/chat/stream`, (route) => route.fulfill({
      contentType: "text/event-stream",
      body: `data: ${JSON.stringify({ type: "turn_event", event: "answer.completed", answer: "The mole connects particles to a measurable amount.\n\n```text\nn = mass / molar_mass\n```\n\n| Quantity | Unit |\n| --- | --- |\n| Amount of substance | mol |", blocks: [] })}\n\ndata: [DONE]\n\n`,
    }));
    await input.fill("Explain the mole concept with units.");
    await page.getByRole("button", { name: "Send message" }).click();
    await expect(page.getByText("The mole connects particles to a measurable amount.")).toBeVisible();
    await expect(page.getByRole("table")).toBeVisible();
    await input.fill("How do I apply this formula?");
    expect(await input.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgba(0, 0, 0, 0)");
    audit = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    expect(audit.violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    expect(errors).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`study-${theme}.png`) });
  });
}
