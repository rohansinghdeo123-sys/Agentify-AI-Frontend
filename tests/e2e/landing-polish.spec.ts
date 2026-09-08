import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { installWorkspaceMocks } from "./helpers/mockWorkspace";

for (const theme of ["light", "dark"] as const) {
  test(`landing preserves four readable destinations in ${theme}`, async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await installWorkspaceMocks(page, theme);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/dashboard");
    const route = page.getByRole("list", { name: "Planning, Study, Revision, and Exam learning route" });
    await expect(route.getByRole("link")).toHaveCount(4);
    for (const link of await route.getByRole("link").all()) {
      await link.scrollIntoViewIfNeeded();
      await expect(link).toBeVisible();
      const fits = await link.evaluate((element) => {
        const box = element.getBoundingClientRect();
        return Array.from(element.querySelectorAll("h2, [id]")).every((child) => child.getBoundingClientRect().bottom <= box.bottom + 1);
      });
      expect(fits).toBe(true);
    }
    const themeButton = page.getByRole("button", { name: "Dark theme" });
    await themeButton.focus();
    await page.keyboard.press("Escape");
    await expect(themeButton).toBeFocused();
    const account = page.getByLabel("Open account menu for Aarav Sharma");
    await account.click();
    await expect(page.getByRole("button", { name: "Log out" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(account).toBeFocused();
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    expect(results.violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    expect(errors).toEqual([]);
    await page.locator("#main-content").evaluate((element) => element.scrollTo(0, 0));
    await page.screenshot({ path: testInfo.outputPath(`landing-${theme}.png`), fullPage: true });
  });
}
