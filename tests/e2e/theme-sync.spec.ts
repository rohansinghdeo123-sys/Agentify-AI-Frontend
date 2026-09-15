import { expect, test } from "@playwright/test";

test("theme stays synchronized between open tabs", async ({ page, context }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/login");
  const firstToggle = page.getByRole("button", { name: "Dark theme", exact: true });
  // Finish the first tab's auth bootstrap before backgrounding it.
  await expect(firstToggle).toHaveAttribute("aria-pressed", "false");
  const other = await context.newPage();
  other.on("pageerror", (error) => errors.push(error.message));
  await other.goto("/login");

  const otherToggle = other.getByRole("button", { name: "Dark theme", exact: true });
  await expect(otherToggle).toHaveAttribute("aria-pressed", "false");
  await otherToggle.click();
  await expect(otherToggle).toHaveAttribute("aria-pressed", "true");
  await page.bringToFront();
  await expect(firstToggle).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(other.locator("html")).toHaveAttribute("data-theme", "dark");
  await firstToggle.click();
  await expect(firstToggle).toHaveAttribute("aria-pressed", "false");
  await other.bringToFront();
  await expect(otherToggle).toHaveAttribute("aria-pressed", "false");
  await expect(other.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  expect(errors).toEqual([]);
  await other.close();
});
