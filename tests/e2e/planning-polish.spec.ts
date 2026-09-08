import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { installWorkspaceMocks, WORKSPACE_TEST_BACKEND } from "./helpers/mockWorkspace";

for (const theme of ["light", "dark"] as const) {
  test(`planning selection and recoverable errors remain clear in ${theme}`, async ({ page }, testInfo) => {
    await installWorkspaceMocks(page, theme);
    await page.route(`${WORKSPACE_TEST_BACKEND}/planning/portfolio/**`, (route) => route.fulfill({
      status: 503, contentType: "application/json", body: JSON.stringify({ detail: "Planning is temporarily unavailable. Please try again." }),
    }));
    await page.goto("/dashboard/planning");
    await expect(page.getByText("Choose up to six chapters.", { exact: false })).toBeVisible();
    const chapter = page.getByRole("checkbox", { name: /Some Basic Concepts of Chemistry/ });
    await chapter.focus();
    await page.keyboard.press("Space");
    await expect(chapter).toBeChecked();
    await page.getByRole("combobox", { name: "How well do you know Some Basic Concepts of Chemistry?" }).selectOption("know_a_little");
    await page.getByRole("button", { name: "15 min", exact: true }).click();
    await expect(page.getByRole("button", { name: "15 min", exact: true })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "Build My Roadmap" }).click();
    await expect(page.getByRole("form").getByRole("alert")).toBeVisible();
    await expect(page.getByRole("button", { name: "Build My Roadmap" })).toBeEnabled();
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    expect(results.violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: testInfo.outputPath(`planning-${theme}.png`) });
  });
}
