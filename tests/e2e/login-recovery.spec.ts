import { expect, test } from "@playwright/test";
import { installWorkspaceMocks, WORKSPACE_TEST_BACKEND, WORKSPACE_TEST_USER_ID } from "./helpers/mockWorkspace";

test.use({ launchOptions: { args: ["--disable-webgl"] } });

for (const status of [401, 503]) {
  test(`restored sign-in recovers profile status ${status} without another Google login`, async ({ page }) => {
    await installWorkspaceMocks(page);
    let requests = 0;
    await page.route(`${WORKSPACE_TEST_BACKEND}/profile/me`, async (route) => {
      if (route.request().method() === "OPTIONS") return route.fallback();
      requests += 1;
      if (requests === 1) return route.fulfill({ status, contentType: "application/json",
        headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ detail: "Starting" }) });
      return route.fallback();
    });
    await page.goto("/login");
    await expect(page).toHaveURL(/\/dashboard$/, { timeout: 30000 });
    await expect.poll(() => requests).toBe(2);
    await expect(page.getByText("Connecting to your study profile…")).toHaveCount(0);
  });

}

test("profile failure explains the error and supports retry with the existing session", async ({ page }) => {
  await installWorkspaceMocks(page);
  let failing = true;
  await page.route(`${WORKSPACE_TEST_BACKEND}/profile/me`, async (route) => {
    if (route.request().method() === "OPTIONS" || !failing) return route.fallback();
    return route.fulfill({ status: 403, contentType: "application/json",
      headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ detail: "Profile temporarily restricted" }) });
  });
  await page.goto("/login");
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByText("Profile temporarily restricted")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Your Learning Journey" })).toHaveCount(0);
  failing = false;
  await page.getByRole("button", { name: "Retry connection" }).click();
  await expect(page.getByRole("heading", { name: "Your Learning Journey" })).toBeVisible();
});


test("the journey opens during a slow profile request and private pages wait for verification", async ({ page }) => {
  await installWorkspaceMocks(page);
  let requests = 0;
  await page.route(`${WORKSPACE_TEST_BACKEND}/profile/me`, async (route) => {
    if (route.request().method() === "OPTIONS") return route.fallback();
    requests += 1;
    await new Promise((resolve) => setTimeout(resolve, 11000));
    return route.fallback();
  });
  await page.goto("/login");
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: "Your Learning Journey" })).toBeVisible();
  await expect(page.getByText("Connecting to your study profile…")).toBeVisible();
  await page.getByRole("link", { name: "Analytics", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard\/analytics$/);
  await expect(page.getByText("Connecting to your study profile…")).toBeVisible();
  await expect(page.getByText("Connecting to your study profile…")).toHaveCount(0, { timeout: 25_000 });
  expect(requests).toBe(1);
});

test("a new profile still needs onboarding after Firebase sign-in", async ({ page }) => {
  await installWorkspaceMocks(page);
  await page.route(`${WORKSPACE_TEST_BACKEND}/profile/me`, (route) => {
    if (route.request().method() === "OPTIONS") return route.fallback();
    return route.fulfill({ json: {
      user_id: WORKSPACE_TEST_USER_ID,
      email: "learner@example.test",
      display_name: "Aarav Sharma",
      class_level: "",
      onboarding_completed: false,
      created_at: "2026-09-08T09:00:00.000Z",
      updated_at: "2026-09-08T09:00:00.000Z",
    } });
  });
  await page.goto("/login");
  await expect(page).toHaveURL(/\/onboarding$/);
});

test("a returning student opens the dashboard while the profile server is still pending", async ({ page }) => {
  await installWorkspaceMocks(page);
  await page.goto("/login");
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("button", { name: "Preview Planning" })).toBeVisible();
  await expect(page.getByText("Connecting to your study profile…")).toHaveCount(0);

  let requests = 0;
  let unblock!: () => void;
  const paused = new Promise<void>((resolve) => { unblock = resolve; });
  await page.route(`${WORKSPACE_TEST_BACKEND}/profile/me`, async (route) => {
    if (route.request().method() === "OPTIONS") return route.fallback();
    requests++;
    await paused;
    return route.fallback();
  });
  try {
    await page.goto("/login");
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole("heading", { name: "Your Learning Journey" })).toBeVisible();
    await expect.poll(() => requests).toBe(1);
  } finally {
    unblock();
  }
});
