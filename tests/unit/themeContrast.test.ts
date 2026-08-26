import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function luminance(hex: string) {
  const channels = hex.match(/.{2}/g)?.map((part) => Number.parseInt(part, 16) / 255) ?? [];
  const linear = channels.map((value) =>
    value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrast(foreground: string, background: string) {
  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

function tokens(block: string) {
  return Object.fromEntries(
    [...block.matchAll(/--([\w-]+):\s*#([0-9a-f]{6});/gi)].map((match) => [match[1], match[2]]),
  );
}

describe("theme text contrast", () => {
  const css = readFileSync(join(process.cwd(), "app/styles/design-system.css"), "utf8");
  const lightBlock = css.match(/:root\s*{([\s\S]*?)}\s*\[data-theme="dark"\]/)?.[1] ?? "";
  const darkBlock = css.match(/\[data-theme="dark"\]\s*{([\s\S]*?)}/)?.[1] ?? "";

  it("keeps semantic light-theme text above WCAG AA normal-text contrast", () => {
    const light = tokens(lightBlock);
    for (const name of [
      "ds-text-primary",
      "ds-text-secondary",
      "ds-text-muted",
      "ds-accent-teal",
      "ds-accent-gold-strong",
      "ds-success",
      "ds-warning",
      "ds-danger",
    ]) {
      expect(contrast(light[name], "ffffff"), name).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("keeps semantic dark-theme text above WCAG AA normal-text contrast", () => {
    const dark = tokens(darkBlock);
    for (const name of [
      "ds-text-primary",
      "ds-text-secondary",
      "ds-text-muted",
      "ds-accent-teal",
      "ds-accent-gold-strong",
      "ds-success",
      "ds-warning",
      "ds-danger",
    ]) {
      expect(contrast(dark[name], "0d1726"), name).toBeGreaterThanOrEqual(4.5);
    }
  });
});
