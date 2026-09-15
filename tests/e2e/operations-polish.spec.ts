import { expect, test, type Page, type TestInfo } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { installWorkspaceMocks } from "./helpers/mockWorkspace";
import { installOperationsMocks } from "./helpers/operationsFixtures";

function watchPageErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

async function expectNoDocumentOverflow(page: Page) {
  await expect.poll(() => page.evaluate(() => (
    document.documentElement.scrollWidth - window.innerWidth
  )), { message: "The document must fit the viewport; wide data belongs in its own scroll region." }).toBeLessThanOrEqual(1);
}

async function captureAndAudit(page: Page, testInfo: TestInfo, name: string) {
  await expectNoDocumentOverflow(page);
  await page.screenshot({ path: testInfo.outputPath(`${name}.png`), fullPage: true, animations: "disabled" });
  const audit = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(audit.violations.filter((violation) => (
    violation.impact === "serious" || violation.impact === "critical"
  ))).toEqual([]);
}

async function captureNarrowMobile(page: Page, testInfo: TestInfo, name: string) {
  await page.setViewportSize({ width: 320, height: 851 });
  await expectNoDocumentOverflow(page);
  await page.screenshot({ path: testInfo.outputPath(`${name}-320px.png`), fullPage: true, animations: "disabled" });
}

for (const theme of ["light", "dark"] as const) {
  test(`Admin exposes verified chapter and activity evidence in ${theme}`, async ({ page, isMobile }, testInfo) => {
    const errors = watchPageErrors(page);
    const workspace = await installWorkspaceMocks(page, theme, { state: "ready", founder: true });
    const operations = await installOperationsMocks(page);
    await page.goto("/dashboard/internal/admin");
    await expect(page.getByRole("heading", { name: "Know what every learning agent is doing." })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    await expect(page.getByRole("heading", { name: "Study Coach", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Export evidence" })).toBeEnabled();

    const activity = page.getByRole("region", { name: "Recent grounded activity" }).locator("details").first();
    await activity.locator("summary").focus();
    await page.keyboard.press("Enter");
    await expect(activity).toHaveJSProperty("open", true);
    await expect(activity.getByText("Quality gate passed", { exact: true })).toBeVisible();
    await expect(activity.getByText("3 page refs", { exact: true })).toBeVisible();
    await expect(activity.getByText("Pages 1, 2, 3", { exact: true })).toBeVisible();

    await page.getByRole("link", { name: "02 · Curriculum Evidence" }).click();
    const chapterName = "Some Basic Concepts of Chemistry";
    const chapter = page.locator("details").filter({
      has: page.getByRole("heading", { name: chapterName, exact: true }),
    });
    await expect(chapter).toHaveJSProperty("open", false);
    await chapter.locator("summary").focus();
    await page.keyboard.press("Space");
    await expect(chapter).toHaveJSProperty("open", true);
    const sourceEvidence = chapter.getByRole("region", { name: `Subtopic evidence for ${chapterName}` });
    await expect(sourceEvidence.getByRole("article")).toHaveCount(3);
    await expect(sourceEvidence.getByRole("heading", { name: "Chemistry foundations", exact: true })).toBeVisible();
    await expect(sourceEvidence.getByText("Verified source pages", { exact: true })).toHaveCount(3);
    await expect(chapter.getByText("Published hash matches source", { exact: true })).toBeVisible();
    await expect(chapter.getByText("Pages 1–9", { exact: true })).toBeVisible();
    await expect(chapter.getByText("Stored dimensions: 1536", { exact: true })).toBeVisible();
    expect(operations.handledRequests).toContain("GET /admin/evidence/content/101");

    await captureAndAudit(page, testInfo, `admin-evidence-${theme}`);
    if (isMobile) await captureNarrowMobile(page, testInfo, `admin-evidence-${theme}`);
    expect(workspace.unhandledRequests).toEqual([]);
    expect(errors).toEqual([]);
  });

  test(`Analytics makes timeframe and topic performance accessible in ${theme}`, async ({ page, isMobile }, testInfo) => {
    const errors = watchPageErrors(page);
    const workspace = await installWorkspaceMocks(page, theme, { state: "ready", founder: true });
    await installOperationsMocks(page);
    await page.goto("/dashboard/analytics");
    await expect(page.getByRole("heading", { name: "Learning intelligence", exact: true })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    await expect(page.getByRole("button", { name: "Export Download CSV" })).toBeEnabled();

    const ranges = page.getByRole("radiogroup", { name: "Trend range" });
    const daily = ranges.getByRole("radio", { name: "14 days", exact: true });
    const weekly = ranges.getByRole("radio", { name: "8 weeks", exact: true });
    const chart = page.getByRole("region", { name: "XP velocity chart", exact: true });
    await expect(daily).toBeChecked();
    await expect(chart.getByRole("img")).toHaveAccessibleName(/across 14 periods/);
    await daily.focus();
    await page.keyboard.press("ArrowRight");
    await expect(weekly).toBeChecked();
    await expect(weekly).toBeFocused();
    await expect(daily).toHaveAttribute("tabindex", "-1");
    await expect(chart.getByRole("img")).toHaveAccessibleName(/across 8 periods/);
    await page.keyboard.press("Home");
    await expect(daily).toBeChecked();
    await expect(daily).toBeFocused();
    await page.keyboard.press("End");
    await expect(weekly).toBeChecked();
    await expect(chart.getByRole("img")).toHaveAccessibleName(/across 8 periods/);

    const matrix = page.getByRole("region", { name: "Topic matrix, scroll to see all columns" });
    const table = matrix.getByRole("table", { name: "Topic performance, study time, and recent accuracy trends" });
    await expect(table.getByRole("columnheader")).toHaveCount(6);
    await expect(table.getByRole("row")).toHaveCount(7);
    await expect(table.getByRole("rowheader", { name: "Chemistry foundations", exact: true })).toBeVisible();
    await expect(table.getByRole("rowheader", { name: "Alkynes", exact: true })).toBeVisible();
    await matrix.focus();
    await expect(matrix).toBeFocused();
    const activity = page.getByRole("list", { name: "Study sessions during the last 35 days" });
    await expect(activity.getByRole("listitem")).toHaveCount(35);
    await expect(page.getByRole("region", { name: "Today's revision", exact: true }).getByRole("button", { name: "REVISE NOW" })).toHaveCount(3);

    await captureAndAudit(page, testInfo, `analytics-${theme}`);
    if (isMobile) {
      await captureNarrowMobile(page, testInfo, `analytics-${theme}`);
      await expect.poll(() => matrix.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeGreaterThan(0);
      await matrix.focus();
      await page.keyboard.press("ArrowRight");
      await expect.poll(() => matrix.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
      await expectNoDocumentOverflow(page);
    }
    expect(workspace.unhandledRequests).toEqual([]);
    expect(errors).toEqual([]);
  });

  test(`Rankings keeps standings and rival details usable in ${theme}`, async ({ page, isMobile }, testInfo) => {
    const errors = watchPageErrors(page);
    const workspace = await installWorkspaceMocks(page, theme, { state: "ready", founder: true });
    const operations = await installOperationsMocks(page);
    await page.goto("/dashboard/rankings");
    await expect(page.getByRole("heading", { name: "Global Learning League", exact: true })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    const tabs = page.getByRole("tablist", { name: "Global rankings views" });
    const leaderboardTab = tabs.getByRole("tab", { name: "Leaderboard", exact: true });
    const rivalTab = tabs.getByRole("tab", { name: /Rival Arena/ });
    const standings = page.getByRole("tabpanel", { name: "Leaderboard", exact: true });
    const leaderboard = standings.getByRole("table", { name: /AgentifyAI global learner rankings/ });
    await expect(leaderboardTab).toHaveAttribute("aria-selected", "true");
    await expect(leaderboard.getByRole("row")).toHaveCount(operations.fixtures.leaderboard.leaderboard.length + 1);
    const currentRow = leaderboard.getByRole("row").filter({
      has: page.getByRole("rowheader", { name: /Aarav Sharma/ }),
    });
    await expect(currentRow).toHaveAttribute("data-current", "true");
    await expect(currentRow.getByRole("cell").first()).toHaveText("4");
    await expect(leaderboard.getByRole("rowheader", { name: /Ishita Rao/ })).toBeVisible();
    await captureAndAudit(page, testInfo, `rankings-leaderboard-${theme}`);
    if (isMobile) await captureNarrowMobile(page, testInfo, `rankings-leaderboard-${theme}`);

    await leaderboardTab.focus();
    await page.keyboard.press("ArrowRight");
    await expect(rivalTab).toBeFocused();
    await expect(rivalTab).toHaveAttribute("aria-selected", "true");
    await expect(leaderboardTab).toHaveAttribute("tabindex", "-1");
    await expect(standings).toBeHidden();
    await expect(page).toHaveURL(/\/dashboard\/rankings\?view=rival$/);
    const arena = page.getByRole("tabpanel", { name: /Rival Arena/ });
    await expect(arena.getByRole("heading", { name: "Ananya Sen", exact: true })).toBeVisible();
    await expect(arena.getByText("30 XP gap", { exact: true })).toBeVisible();
    await expect(arena.getByRole("progressbar", { name: "Weekly XP momentum", exact: true })).toHaveAttribute(
      "aria-valuetext",
      `You have ${operations.fixtures.challenge.me.week_xp} XP and Ananya Sen has ${operations.fixtures.challenge.rival.week_xp} XP`,
    );
    const battleDetails = arena.locator("details").filter({ hasText: "Battle details" });
    await battleDetails.locator("summary").focus();
    await page.keyboard.press("Enter");
    await expect(battleDetails).toHaveJSProperty("open", true);
    await expect(battleDetails.getByRole("heading", { name: "This week's objectives", exact: true })).toBeVisible();
    await expect(battleDetails.getByRole("progressbar", { name: "Build a five-day streak: 100% complete", exact: true })).toHaveAttribute("aria-valuenow", "100");
    await expect(battleDetails.getByRole("list", { name: "Recent rival activity" }).getByRole("listitem")).toHaveCount(3);
    await captureAndAudit(page, testInfo, `rankings-rival-${theme}`);

    await rivalTab.focus();
    await page.keyboard.press("ArrowLeft");
    await expect(leaderboardTab).toBeFocused();
    await expect(leaderboardTab).toHaveAttribute("aria-selected", "true");
    await expect(standings).toBeVisible();
    await expect(page).toHaveURL(/\/dashboard\/rankings$/);
    await expectNoDocumentOverflow(page);
    expect(workspace.unhandledRequests).toEqual([]);
    expect(errors).toEqual([]);
  });
}
