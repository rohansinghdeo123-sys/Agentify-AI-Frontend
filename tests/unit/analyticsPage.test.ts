import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const page = readFileSync(join(process.cwd(), "components/analytics/AnalyticsPage.tsx"), "utf8");
const css = readFileSync(join(process.cwd(), "components/analytics/analytics-theme.module.css"), "utf8");

function contrast(foreground: string, background: string) {
  const luminance = (hex: string) => {
    const linear = hex.match(/.{2}/g)!.map((part) => {
      const channel = Number.parseInt(part, 16) / 255;
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
    return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
  };
  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

describe("Analytics UI contracts", () => {
  it("keeps chart labels and the XP line legible in both themes", () => {
    const palettes = [...css.matchAll(/\.chartPalette\s*{([^}]+)}/g)];
    expect(palettes).toHaveLength(2);
    palettes.forEach((palette, index) => {
      const token = (name: string) => palette[1].match(new RegExp(`--analytics-chart-${name}: #([0-9a-f]{6})`))![1];
      const backgrounds = index === 0 ? ["050a0d", "0d1726"] : ["ffffff", "f0f7f6"];
      backgrounds.forEach((background) => {
        expect(contrast(token("label"), background)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(token("line"), background)).toBeGreaterThanOrEqual(3);
      });
    });
    expect(page).toContain('fill="var(--analytics-chart-label)"');
    expect(page).toContain('stroke="var(--analytics-chart-line)"');
    expect(page).not.toContain('fill="#8190A6"');
    expect(page).not.toContain('fill="#718096"');
  });

  it("exposes topic row and column relationships and keyboard-scrollable detailed data", () => {
    expect(page).toContain("<table className={styles.matrixTable}>");
    expect(page).toContain("<caption");
    expect(page.match(/<th scope="col"/g)).toHaveLength(6);
    expect(page).toContain('<th scope="row"');
    expect(page).toContain('aria-label="Topic matrix, scroll to see all columns" tabIndex={0}');
    expect(page).toContain('aria-label="XP velocity chart" tabIndex={0}');
    expect(css).toContain(".scrollRegion:focus-visible");
  });

  it("announces loading and level progress while preserving the range keyboard control", () => {
    expect(page).toContain('aria-label="Loading analytics"');
    expect(page).toContain('role="progressbar" aria-label="Progress to next level"');
    expect(page).toContain('aria-valuetext={`${xpToNext} XP to next level`}');
    expect(page).toContain('role="radiogroup" aria-label="Trend range"');
    expect(page).toContain("onKeyDown={(event) => handleKeyDown(event, item)}");
    expect(page).toContain("Number.isFinite(value)");
  });

  it("lets panel controls wrap and keeps study bars usable on narrow screens", () => {
    expect(page).toContain("progress-panel-header flex flex-wrap");
    expect(page).not.toMatch(/grid-cols-\[[^\]]*_(?:420|440|540)px\]/);
    expect(page).toContain("className={styles.weeklyRow}");
    expect(css).toContain("@media (max-width: 639px)");
    expect(css).toContain("grid-column: 1 / -1");
    expect(css).toContain("overflow-wrap: anywhere");
  });
});
