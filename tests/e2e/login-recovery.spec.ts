import { expect, test } from "@playwright/test";
import { installWorkspaceMocks, WORKSPACE_TEST_BACKEND } from "./helpers/mockWorkspace";

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
    expect(requests).toBe(2);
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
  await expect(page.getByText("Profile temporarily restricted")).toBeVisible();
  failing = false;
  await page.getByRole("button", { name: "Retry loading my profile" }).click();
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 30000 });
});


test("a slow successful profile request survives the former eight-second cutoff", async ({ page }) => {
  await installWorkspaceMocks(page);
  let requests = 0;
  await page.route(`${WORKSPACE_TEST_BACKEND}/profile/me`, async (route) => {
    if (route.request().method() === "OPTIONS") return route.fallback();
    requests += 1;
    await new Promise((resolve) => setTimeout(resolve, 11000));
    return route.fallback();
  });
  await page.goto("/login");
  await expect(page.getByText("Signed in. Opening your study workspace...", { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 45000 });
  expect(requests).toBe(1);
});
