import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const publicRoutes = [
  { path: "/login", heading: /your personal ai agent/i },
  { path: "/terms", heading: "Terms of Service" },
  { path: "/privacy", heading: "Privacy Policy" },
  { path: "/this-page-does-not-exist", heading: "This study space does not exist." },
] as const;

const protectedRoutes = [
  "/dashboard",
  "/dashboard/planning",
  "/dashboard/study",
  "/dashboard/revision",
  "/dashboard/exam",
  "/dashboard/analytics",
  "/dashboard/rankings",
  "/dashboard/progress",
  "/dashboard/mission",
  "/analytics",
  "/onboarding",
  "/dashboard/admin",
  "/dashboard/internal/admin",
  "/dashboard/internal/ops",
] as const;

async function gotoAppRoute(page: Page, path: string) {
  await page.goto(path, { waitUntil: "domcontentloaded" });
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => ({
    documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    bodyOverflow: document.body.scrollWidth - document.body.clientWidth,
  }));

  expect(overflow.documentOverflow).toBeLessThanOrEqual(1);
  expect(overflow.bodyOverflow).toBeLessThanOrEqual(1);
}

async function expectVisibleControlsInsideViewport(page: Page) {
  const clipped = await page.evaluate(() => {
    const viewportWidth = document.documentElement.clientWidth;
    return Array.from(document.querySelectorAll<HTMLElement>("h1, a, button, input, select, textarea"))
      .filter((element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0;
      })
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          label: element.getAttribute("aria-label") || element.textContent?.trim().slice(0, 60) || element.tagName,
          left: rect.left,
          right: rect.right,
        };
      })
      .filter(({ left, right }) => left < -1 || right > viewportWidth + 1);
  });

  expect(clipped).toEqual([]);
}

async function expectLoginReady(page: Page) {
  await expect(page.getByRole("heading", { name: /your personal ai agent/i })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByRole("button", { name: /continue with google/i })).toBeVisible();
}

test.describe("public routes", () => {
  for (const route of publicRoutes) {
    test(`${route.path} renders on desktop and mobile without layout overflow`, async ({ page }) => {
      await gotoAppRoute(page, route.path);

      if (route.path === "/login") {
        await expectLoginReady(page);
      } else {
        await expect(page.getByRole("heading", { name: route.heading })).toBeVisible();
      }
      await expectNoHorizontalOverflow(page);
    });
  }

  test("login terms link reaches Terms", async ({ page }) => {
    await gotoAppRoute(page, "/login");
    await expectLoginReady(page);

    const termsLink = page.getByRole("link", { name: "Terms" });
    await expect(termsLink).toHaveAttribute("href", "/terms");
    await termsLink.scrollIntoViewIfNeeded();
    await Promise.all([
      page.waitForURL(/\/terms$/, { timeout: 15_000 }),
      termsLink.click(),
    ]);
    await expect(page.getByRole("heading", { name: "Terms of Service" })).toBeVisible();
  });

  test("login privacy link reaches Privacy Policy", async ({ page }) => {
    await gotoAppRoute(page, "/login");
    await expectLoginReady(page);

    const privacyLink = page.getByRole("link", { name: "Privacy Policy" });
    await expect(privacyLink).toHaveAttribute("href", "/privacy");
    await privacyLink.scrollIntoViewIfNeeded();
    await Promise.all([
      page.waitForURL(/\/privacy$/, { timeout: 15_000 }),
      privacyLink.click(),
    ]);
    await expect(page.getByRole("heading", { name: "Privacy Policy" })).toBeVisible();
  });

  test("theme toggle applies dark and light theme states", async ({ page }) => {
    await gotoAppRoute(page, "/login");

    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    const themeToggle = page.getByRole("button", { name: "Dark theme" });
    await expect(themeToggle).toHaveAttribute("aria-pressed", "false");
    await themeToggle.click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(themeToggle).toHaveAttribute("aria-pressed", "true");

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

    await page.getByRole("button", { name: "Dark theme" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  });

  test("semantic design tokens resolve in light and dark themes", async ({ page }) => {
    await gotoAppRoute(page, "/login");

    for (const theme of ["light", "dark"]) {
      await page.evaluate((nextTheme) => {
        document.documentElement.setAttribute("data-theme", nextTheme);
      }, theme);

      const tokenValues = await page.evaluate(() => {
        const styles = getComputedStyle(document.documentElement);

        return {
          appBackground: styles.getPropertyValue("--ds-bg-app").trim(),
          surface: styles.getPropertyValue("--ds-surface").trim(),
          primaryText: styles.getPropertyValue("--ds-text-primary").trim(),
          tealAccent: styles.getPropertyValue("--ds-accent-teal").trim(),
          radius: styles.getPropertyValue("--ds-radius-md").trim(),
          overlay: styles.getPropertyValue("--ds-z-overlay").trim(),
        };
      });

      expect(Object.values(tokenValues).every(Boolean)).toBe(true);

      await page.evaluate(() => {
        let smokeFixture = document.querySelector<HTMLElement>("[data-ds-smoke]");

        if (!smokeFixture) {
          smokeFixture = document.createElement("section");
          smokeFixture.setAttribute("data-ds-smoke", "true");
          smokeFixture.innerHTML = `
            <article id="ds-smoke-card" class="ds-card" style="padding: 16px;">
              <button id="ds-smoke-button" class="ds-button ds-button-primary">Continue</button>
              <input id="ds-smoke-field" class="ds-field" placeholder="Course goal" />
              <span id="ds-smoke-badge" class="ds-badge">Ready</span>
            </article>
          `;
          document.body.append(smokeFixture);
        }
      });

      await page.locator("#ds-smoke-button").focus();

      const primitiveStyles = await page.evaluate(() => {
        const card = getComputedStyle(document.querySelector("#ds-smoke-card")!);
        const button = getComputedStyle(document.querySelector("#ds-smoke-button")!);
        const field = getComputedStyle(document.querySelector("#ds-smoke-field")!);
        const badge = getComputedStyle(document.querySelector("#ds-smoke-badge")!);

        return {
          cardShadow: card.boxShadow,
          buttonRadius: button.borderRadius,
          buttonFocusShadow: button.boxShadow,
          fieldBackground: field.backgroundColor,
          badgeRadius: badge.borderRadius,
        };
      });

      expect(primitiveStyles.cardShadow).not.toBe("none");
      expect(primitiveStyles.buttonRadius).not.toBe("0px");
      expect(primitiveStyles.buttonFocusShadow).not.toBe("none");
      expect(primitiveStyles.fieldBackground).not.toBe("rgba(0, 0, 0, 0)");
      expect(primitiveStyles.badgeRadius).not.toBe("0px");
    }
  });

  test("critical public pages have no critical axe violations", async ({ page }) => {
    test.setTimeout(180_000);

    for (const route of publicRoutes) {
      await gotoAppRoute(page, route.path);
      await page.getByRole("heading", { name: route.heading }).waitFor();

      const results = await new AxeBuilder({ page }).analyze();
      const highImpactViolations = results.violations.filter(
        (violation) => violation.impact === "critical" || violation.impact === "serious",
      );

      expect(highImpactViolations, `${route.path} serious or critical axe violations`).toEqual([]);
    }
  });

  test("public UI stays fully reachable at 320px", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });

    for (const route of publicRoutes) {
      await gotoAppRoute(page, route.path);
      await expect(page.getByRole("heading", { name: route.heading })).toBeVisible();
      await expectNoHorizontalOverflow(page);
      await expectVisibleControlsInsideViewport(page);
    }
  });
});

test.describe("protected routes", () => {
  test("/admin shortcut does not expose the founder console unauthenticated", async ({ page }) => {
    await gotoAppRoute(page, "/admin");
    await page.waitForURL(/\/(admin|dashboard\/internal\/admin|login)$/, { timeout: 15_000 });

    await expect(page.getByText(/AGENTIFYOPS/i)).toHaveCount(0);
    await expect(page.getByText(/Model traces/i)).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
  });

  for (const route of protectedRoutes) {
    test(`${route} keeps unauthenticated students out of private UI`, async ({ page }) => {
      await gotoAppRoute(page, route);

      await expect(page).toHaveURL(/\/login$/, { timeout: 30_000 });
      await expectLoginReady(page);
      await expect(page.getByText(/private study content/i)).toHaveCount(0);
      await expectNoHorizontalOverflow(page);
    });
  }
});
