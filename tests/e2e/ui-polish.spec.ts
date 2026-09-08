import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

for (const theme of ["light", "dark"] as const) {
  test(`login phone form stays readable and keyboard accessible in ${theme}`, async ({ page }, testInfo) => {
    await page.addInitScript((value) => localStorage.setItem("agentify-theme", value), theme);
    await page.goto("/login");
    await page.getByRole("button", { name: "Continue with phone" }).click();
    const phone = page.getByRole("textbox", { name: "Mobile number" });
    await expect(phone).toBeFocused();
    await phone.fill("12");
    await page.getByRole("button", { name: "Send code" }).click();
    await expect(phone).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByText("Enter your mobile number with the country code", { exact: false })).toBeVisible();
    await phone.focus();
    const violations = (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations;
    expect(violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: testInfo.outputPath(`login-${theme}.png`), fullPage: true });
  });
}
