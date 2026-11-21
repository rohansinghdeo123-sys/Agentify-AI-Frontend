import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { installWorkspaceMocks } from "./helpers/mockWorkspace";

for (const theme of ["light", "dark"] as const) {
  test(`landing preserves four readable destinations in ${theme}`, async ({ page, isMobile }, testInfo) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await installWorkspaceMocks(page, theme, { state: "ready" });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/dashboard");
    const route = page.getByRole("list", { name: "Planning, Study, Revision, and Exam learning route" });
    await expect(route.getByRole("link")).toHaveCount(4);
    const path = page.getByRole("list", { name: "Explore the learning path" });
    await expect(path.getByRole("button")).toHaveCount(4);
    await expect(page.getByRole("link", { name: "Global Rankings" })).toHaveAttribute("href", "/dashboard/rankings");
    await expect(page.getByRole("link", { name: "Analytics" })).toHaveAttribute("href", "/dashboard/analytics");
    await expect(page.getByRole("link", { name: "View analytics" })).toHaveCount(0);
    await expect(path.getByRole("button", { name: "Preview Revision" })).toHaveAttribute("aria-pressed", "true");

    const panel = page.locator("#workspace-preview");
    const destinations = [
      { title: "Planning", href: "/dashboard/planning", action: "Open Planning" },
      { title: "Study Lab", href: "/dashboard/study", action: "Open Study Lab" },
      { title: "Revision", href: "/dashboard/revision", action: "Start a review" },
      { title: "Exam", href: "/dashboard/exam", action: "Open Exam" },
    ];
    for (const destination of destinations) {
      await expect(route.getByRole("link", { name: destination.title })).toHaveAttribute("href", destination.href);
      const pin = path.getByRole("button", { name: `Preview ${destination.title}` });
      if (!isMobile && destination.title === "Study Lab") {
        await pin.focus();
        await page.keyboard.press("Enter");
        await expect(pin).toBeFocused();
      } else {
        await pin.click();
      }
      await expect(path.getByRole("button", { pressed: true })).toHaveCount(1);
      await expect(pin).toHaveAttribute("aria-pressed", "true");
      await expect(panel.getByRole("heading", { name: destination.title, exact: true })).toBeVisible();
      await expect(panel.getByRole("link", { name: destination.action })).toHaveAttribute("href", destination.href);
    }
    const themeButton = page.getByRole("button", { name: "Dark theme" });
    await themeButton.focus();
    await page.keyboard.press("Escape");
    await expect(themeButton).toBeFocused();
    const account = page.getByLabel("Open account menu for Aarav Sharma");
    await account.click();
    await expect(page.getByRole("button", { name: "Log out" })).toBeVisible();
    const motion = page.getByRole("switch", { name: "Reduce motion" });
    await motion.click();
    await expect(motion).toHaveAttribute("aria-checked", "true");
    await expect(page.locator("html")).toHaveAttribute("data-motion", "reduced");
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-motion", "reduced");
    await account.click();
    await page.keyboard.press("Escape");
    await expect(account).toBeFocused();
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    expect(results.violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    expect(errors).toEqual([]);
    await page.locator("#main-content").evaluate((element) => element.scrollTo(0, 0));
    await page.screenshot({ path: testInfo.outputPath(`landing-${theme}.png`), fullPage: true });
    if (isMobile) {
      await page.setViewportSize({ width: 320, height: 780 });
      const links = page.getByRole("navigation", { name: "Learning insights" }).getByRole("link");
      for (const link of await links.all()) {
        const box = await link.boundingBox();
        expect(box && box.x >= 0 && box.x + box.width <= 320).toBe(true);
      }
      expect(await route.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
      await expect(path.getByRole("button", { name: "Preview Exam" })).toBeVisible();
    }
  });
}
