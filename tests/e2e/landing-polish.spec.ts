import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { expectDistinctJourneyMarkers } from "./helpers/journeyMarkers";
import { installWorkspaceMocks } from "./helpers/mockWorkspace";

test.use({ launchOptions: { args: ["--disable-webgl"] } });

const destinations = [
  { title: "Planning", href: "/dashboard/planning", action: "Open Planning" },
  { title: "Study Lab", href: "/dashboard/study", action: "Open Study Lab" },
  { title: "Revision", href: "/dashboard/revision", action: "Start a review" },
  { title: "Exam", href: "/dashboard/exam", action: "Open Exam" },
];

for (const theme of ["light", "dark"] as const) {
  test(`full-screen journey opens all four destinations in ${theme}`, async ({ page, isMobile }, testInfo) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await installWorkspaceMocks(page, theme, { state: "ready" });
    const lightArtwork = "/atlas-overview-light.webp";
    const darkArtwork = "/atlas-overview-dark.webp";
    const initialArtwork = theme === "light" ? lightArtwork : darkArtwork;
    const alternateArtwork = theme === "light" ? darkArtwork : lightArtwork;
    const artworkLoads: string[] = [];
    page.on("request", (request) => {
      const path = new URL(request.url()).pathname;
      if (/\/(?:atlas-overview|learning-journey).*\.webp$/.test(path)) artworkLoads.push(path);
    });
    const imageLoaded = page.waitForResponse((response) =>
      new URL(response.url()).pathname === initialArtwork && response.ok(),
    );
    await page.goto("/dashboard");
    await imageLoaded;
    const heading = page.getByRole("heading", { name: "Your Learning Journey" });
    await expect(heading).toBeVisible();
    const scene = page.getByRole("region", { name: "Your Learning Journey" });
    await expect(scene).toHaveAttribute("data-atlas", "fallback");
    const artwork = scene.locator('[class*="__art"]');
    await expect(artwork).toHaveCSS("background-image", new RegExp(initialArtwork));
    await expect(heading).toHaveCSS("color", theme === "light" ? "rgb(24, 46, 43)" : "rgb(255, 249, 237)");
    expect([...new Set(artworkLoads)]).toEqual([initialArtwork]);
    const panel = page.locator("#workspace-preview");
    const path = page.getByRole("list", { name: "Explore the learning path" });
    await expectDistinctJourneyMarkers(path);
    await expect(path.getByRole("button", { name: "Preview Revision" })).toHaveAccessibleDescription("Suggested next step");
    await expect(panel).toHaveCount(0);
    await expect(scene.getByRole("heading")).toHaveCount(1);
    await expect(scene.getByText("Learning workspaces")).toHaveCount(0);
    const utilities = page.getByRole("navigation", { name: "Learning insights" });
    await expect(utilities.getByRole("link", { name: "Analytics" })).toHaveAttribute("href", "/dashboard/analytics");
    await expect(utilities.getByRole("link", { name: "Global Rankings" })).toHaveAttribute("href", "/dashboard/rankings");
    expect(await scene.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      return bounds.x === 0 && bounds.y === 0 && bounds.width === innerWidth && bounds.height === innerHeight;
    })).toBe(true);

    await page.emulateMedia({ reducedMotion: "reduce" });
    for (const destination of destinations) {
      const pin = path.getByRole("button", { name: `Preview ${destination.title}` });
      if (!isMobile && destination.title === "Study Lab") {
        await pin.focus();
        await page.keyboard.press("Enter");
      } else {
        await pin.click();
      }
      await expect(pin).toHaveAttribute("aria-expanded", "true");
      await expect(panel.getByRole("heading", { name: destination.title, exact: true })).toBeFocused();
      await expect(panel.getByRole("link", { name: destination.action })).toHaveAttribute("href", destination.href);
      if (destination.title === "Exam") {
        const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
        expect(results.violations.filter((violation) => violation.impact === "serious" || violation.impact === "critical")).toEqual([]);
      }
      if (isMobile) {
        await panel.getByRole("button", { name: "Close workspace preview" }).click();
      } else {
        await page.keyboard.press("Escape");
      }
      await expect(panel).toHaveCount(0);
      await expect(pin).toBeFocused();
    }

    const preview = path.getByRole("button", { name: "Preview Revision" });
    await preview.click();
    await expect(panel.getByRole("heading", { name: "Revision" })).toBeVisible();
    const themeToggle = page.getByRole("button", { name: "Dark theme" });
    await themeToggle.click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme === "light" ? "dark" : "light");
    await expect(artwork).toHaveCSS("background-image", new RegExp(alternateArtwork));
    await expect(preview).toHaveAttribute("aria-expanded", "true");
    await expect(panel.getByRole("link", { name: "Start a review" })).toHaveAttribute("href", "/dashboard/revision");
    await themeToggle.click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    await expect(artwork).toHaveCSS("background-image", new RegExp(initialArtwork));
    await panel.getByRole("button", { name: "Close workspace preview" }).click();

    const account = page.getByLabel("Open account menu for Aarav Sharma");
    await account.click();
    await expect(page.getByRole("button", { name: "Log out" })).toBeVisible();
    const motion = page.getByRole("switch", { name: "Reduce motion" });
    await motion.click();
    await expect(motion).toHaveAttribute("aria-checked", "true");
    await expect(page.locator("html")).toHaveAttribute("data-motion", "reduced");
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-motion", "reduced");
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await expect(scene).toHaveAttribute("data-atlas", "fallback");
    await page.screenshot({ path: testInfo.outputPath(`journey-${theme}.png`) });
    if (isMobile) {
      await page.setViewportSize({ width: 320, height: 620 });
      await expectDistinctJourneyMarkers(path);
      for (const target of await utilities.getByRole("link").all()) {
        const box = await target.boundingBox();
        expect(box && box.x >= 0 && box.x + box.width <= 320 && box.y >= 0 && box.y + box.height <= 620).toBe(true);
      }
    } else {
      await page.setViewportSize({ width: 900, height: 370 });
      await expectDistinctJourneyMarkers(path);
    }
    expect(errors).toEqual([]);

    await path.getByRole("button", { name: "Preview Exam" }).click();
    await panel.getByRole("link", { name: "Open Exam" }).click();
    await expect(page).toHaveURL(/\/dashboard\/exam$/);
  });
}
