import { expect, test } from "@playwright/test";
import fixture from "./fixtures/planned-learning.json";
import { installWorkspaceMocks, WORKSPACE_TEST_BACKEND } from "./helpers/mockWorkspace";

test.beforeAll(async ({ request }) => {
  await request.get("/dashboard/study?planned=1", { timeout: 120000 });
  await request.get("/dashboard/study/session/compile-fixture?fresh=1", { timeout: 120000 });
});

test("planned notes, saved session, quick check and return to Planning", async ({ page }) => {
  await installWorkspaceMocks(page, "light");
  let context: typeof fixture.context | typeof fixture.nextContext = structuredClone(fixture.context);
  const savedRoute = structuredClone(fixture.route);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const headers = { "access-control-allow-origin": "*", "access-control-allow-headers": "Authorization, Content-Type" };
  await page.route(`${WORKSPACE_TEST_BACKEND}/coach/study-lab/context/**`, (route) => route.fulfill({ json: context, headers }));
  await page.route(`${WORKSPACE_TEST_BACKEND}/planning/route/**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() === "OPTIONS") return route.fulfill({ headers });
    if (path.includes("heartbeat")) {
      context.last_position = { ...context.last_position, ...route.request().postDataJSON().last_position };
      return route.fulfill({ json: savedRoute, headers });
    }
    if (path.includes("check")) return route.fulfill({ headers, json: { id: "check-1", unit_id: context.current_unit_id,
      questions: [{ id: "Q1", question: "Which statement describes matter?", options: ["A. Has mass and occupies space", "B. Has no mass", "C. Has no volume", "D. Is only solid"] }] } });
    return route.fulfill({ json: savedRoute, headers });
  });
  await page.route(`${WORKSPACE_TEST_BACKEND}/coach/study-lab/complete-unit/**`, (route) => {
    if (route.request().method() === "OPTIONS") return route.fulfill({ headers });
    context = structuredClone(fixture.nextContext);
    Object.assign(savedRoute, fixture.completion.route);
    return route.fulfill({ json: fixture.completion, headers });
  });
  await page.goto("/dashboard/study?planned=1");
  await expect(page.getByRole("heading", { name: "Today you'll learn" })).toBeVisible();
  await expect(page.getByText(context.key_notes[0], { exact: true })).toBeVisible();
  await expect(page.getByText(`Today's route · ${context.step_label}`, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Start learning", exact: true }).first().click();
  await expect(page.getByRole("textbox", { name: "Message your AI tutor" })).toBeVisible({ timeout: 45000 });
  const firstURL = page.url();
  await expect.poll(() => Object.keys(context.last_position)).toContain("conversation_id");
  await page.getByRole("button", { name: "Start / resume quick check" }).click();
  await page.getByRole("radio", { name: "A. Has mass and occupies space" }).check();
  await expect(page.getByRole("button", { name: "Check answers and update plan" })).toBeEnabled();
  await page.reload();
  await page.getByRole("button", { name: "Start / resume quick check" }).click();
  await expect(page.getByRole("radio", { name: "A. Has mass and occupies space" })).toBeChecked();
  await page.getByRole("link", { name: "Study Home", exact: true }).click();
  await page.getByRole("button", { name: "Continue learning", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(new URL(firstURL).pathname));
  await page.getByRole("button", { name: "Start / resume quick check" }).click();
  await page.getByRole("button", { name: "Check answers and update plan" }).click();
  await expect(page.getByText(/mastery demonstrated/, { exact: false })).toBeVisible();
  await page.getByRole("link", { name: "Return to Planning", exact: true }).click();
  await expect(page.getByRole("region", { name: "Current learning progress" })).toBeVisible();
  expect(errors).toEqual([]);
});
