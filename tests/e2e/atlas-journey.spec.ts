import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { installWorkspaceMocks } from "./helpers/mockWorkspace";

test.use({
  launchOptions: { args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] },
  trace: { mode: "retain-on-failure", screenshots: false, snapshots: true },
});

test("the centered 3D journey loads without flashing fallback artwork and preserves navigation", async ({ page, isMobile }, testInfo) => {
  test.setTimeout(150_000);
  const errors: string[] = [];
  const fallbackRequests: string[] = [];
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (/^\/(?:atlas-overview|learning-journey).*\.webp$/.test(path)) fallbackRequests.push(path);
  });
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && /THREE\.|WebGL/.test(message.text())) errors.push(message.text());
  });
  await installWorkspaceMocks(page, "dark", { state: "ready" });
  await page.addInitScript(() => {
    const phases = new Set<string>();
    const witness = new MutationObserver(() => {
      if (document.querySelector('[data-intro="true"]')) document.documentElement.dataset.testAtlasIntro = "observed";
      const phase = document.querySelector('[aria-labelledby="learning-journey-title"]')?.getAttribute("data-atlas");
      if (phase && !phases.has(phase)) {
        phases.add(phase);
        document.documentElement.dataset.testAtlasPhases = [...phases].join(",");
      }
    });
    witness.observe(document, { attributes: true, attributeFilter: ["data-atlas", "data-intro"], childList: true, subtree: true });
  });
  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  const scene = page.locator('section[aria-labelledby="learning-journey-title"]');
  const canvas = scene.locator("canvas");
  await expect(scene).toHaveAttribute("data-atlas", "ready", { timeout: 45_000 });
  const skip = scene.getByRole("button", { name: "Skip intro" });
  await expect(page.locator("html")).toHaveAttribute("data-test-atlas-phases", "loading,ready");
  await expect(page.locator("html")).toHaveAttribute("data-test-atlas-intro", "observed");
  const heading = scene.getByRole("heading", { name: "Your Learning Journey" });
  await expect(heading).toHaveCSS("text-align", "center");
  const insights = page.getByRole("navigation", { name: "Learning insights" });
  const headingBox = (await heading.boundingBox())!;
  const insightsBox = (await insights.boundingBox())!;
  expect(headingBox.x + headingBox.width / 2).toBeCloseTo(page.viewportSize()!.width / 2, 0);
  expect(headingBox.y).toBeGreaterThan(insightsBox.y + insightsBox.height);
  expect(headingBox.y).toBeLessThan(125);
  await expect(canvas).toBeVisible();
  const replay = scene.getByRole("button", { name: "Replay intro" });
  await expect(replay).toBeVisible();
  await page.reload();
  await expect(replay).toBeVisible();
  await expect(skip).toHaveCount(0);
  await expect(page.locator("html")).not.toHaveAttribute("data-test-atlas-intro", "observed");
  await replay.click();
  await expect(skip).toBeVisible();
  await skip.click();
  await expect(replay).toBeVisible({ timeout: 15_000 });

  const markers = scene.getByRole("list", { name: "Explore the learning path" });
  const destinations = [
    ["Planning", "Open Planning", "/dashboard/planning"],
    ["Study Lab", "Open Study Lab", "/dashboard/study"],
    ["Revision", "Start a review", "/dashboard/revision"],
    ["Exam", "Open Exam", "/dashboard/exam"],
  ] as const;
  await expect(markers.getByRole("button")).toHaveCount(4);
  const planning = markers.getByRole("button", { name: "Preview Planning" });
  await expect(planning.locator("..")).toHaveAttribute("style", /--atlas-x: /);
  if (!isMobile) {
    const start = await planning.boundingBox();
    const view = await canvas.boundingBox();
    if (!start || !view) throw new Error("Missing 3D overview bounds");
    await page.mouse.move(view.x + view.width * .50, view.y + view.height * .58);
    await page.mouse.down();
    await page.mouse.move(view.x + view.width * .57, view.y + view.height * .56, { steps: 5 });
    await page.mouse.up();
    await expect.poll(async () => (await planning.boundingBox())?.x).not.toBe(start.x);
    await scene.getByRole("button", { name: "Reset view" }).click();
    await expect.poll(async () => (await planning.boundingBox())?.x).toBeCloseTo(start.x, 0);
    const proposal = await planning.boundingBox();
    if (!proposal) throw new Error("Missing Planning label after reset");
    for (const offset of [.031, .055, .075]) {
      await page.mouse.move(proposal.x + proposal.width / 2, proposal.y - view.height * offset);
      if (await canvas.evaluate((element) => getComputedStyle(element).cursor) === "pointer") break;
    }
    await expect(canvas).toHaveCSS("cursor", "pointer");
    await page.mouse.down();
    await page.mouse.up();
    const panel = scene.locator("#workspace-preview");
    await expect(panel.getByRole("heading", { name: "Planning", exact: true })).toBeVisible();
    await panel.getByRole("button", { name: "Back to Journey" }).click();
    await scene.getByRole("button", { name: "Reset view" }).click();
  }

  await page.screenshot({ path: testInfo.outputPath("atlas-dark.png") });
  await page.getByRole("button", { name: "Dark theme" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(canvas).toHaveCSS("opacity", "1");
  const analytics = insights.getByRole("link", { name: "Analytics" });
  await expect(analytics).toHaveAttribute("href", "/dashboard/analytics");
  await expect(analytics).toHaveCSS("color", "rgb(23, 32, 51)");
  await expect(insights.getByRole("link", { name: "Global Rankings" })).toHaveAttribute("href", "/dashboard/rankings");
  await page.screenshot({ path: testInfo.outputPath("atlas-light.png") });

  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(replay).toHaveCount(0);
  const panel = scene.locator("#workspace-preview");
  for (const [name, action, route] of destinations) {
    const marker = markers.getByRole("button", { name: `Preview ${name}` });
    await marker.click();
    await expect(panel.getByRole("heading", { name, exact: true })).toBeFocused();
    await expect(panel.getByRole("link", { name: action })).toHaveAttribute("href", route);
    await expect(marker).toHaveAttribute("aria-expanded", "true");
    await panel.getByRole("button", { name: "Back to Journey" }).click();
    await expect(marker).toBeFocused();
  }

  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(axe.violations.filter(({ impact }) => impact === "serious" || impact === "critical")).toEqual([]);
  await markers.getByRole("button", { name: "Preview Exam" }).click();
  await panel.getByRole("link", { name: "Open Exam" }).click();
  await expect(page).toHaveURL(/\/dashboard\/exam$/);
  await page.getByRole("link", { name: "Return to Workspace" }).click();
  await expect(scene).toHaveAttribute("data-atlas", "ready", { timeout: 45_000 });
  await expect(skip).toHaveCount(0);
  expect(fallbackRequests).toEqual([]);
  expect(errors).toEqual([]);
});
