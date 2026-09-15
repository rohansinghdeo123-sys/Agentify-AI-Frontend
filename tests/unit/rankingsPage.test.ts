import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function readSource(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function rgb(hex: string) {
  return hex.match(/.{2}/g)!.map((part) => Number.parseInt(part, 16));
}

function composite(foreground: number[], background: number[], opacity: number) {
  return foreground.map((channel, index) => channel * opacity + background[index] * (1 - opacity));
}

function contrast(foreground: number[], background: number[]) {
  const luminance = (channels: number[]) => channels.map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  }).reduce((total, value, index) => total + value * [0.2126, 0.7152, 0.0722][index], 0);
  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

describe("Global Rankings UI contracts", () => {
  it("uses focused tabs, a semantic leaderboard, and the truthful Rank Chase fallback", () => {
    const page = readSource("components/rankings/RankingsPage.tsx");

    expect(page).toContain('role="tablist"');
    expect(page).toContain('role="tabpanel"');
    expect(page).toContain('hidden={activeView !== "leaderboard"}');
    expect(page).toContain('hidden={activeView !== "rival"}');
    expect(page).toContain("<table");
    expect(page).toContain("<caption");
    expect(page).toContain("Live Rank Chase");
    expect(page).toContain("Rank Chase uses live all-time standings");
    expect(page).toContain("Standings could not be reached");
    expect(page).toContain("Your class:");
    expect(page).not.toContain("dashboard-rival-");
    expect(page).not.toContain("dashboard-leaderboard-");
  });

  it("keeps Rankings parent-sized, responsive, and motion-safe", () => {
    const css = readSource("components/rankings/rankings.module.css");

    expect(css).toContain("width: 100%");
    expect(css).toContain("max-width: none");
    expect(css).toContain("min-height: 100%");
    expect(css).not.toMatch(/100(?:d|s|l|v)?vh/);
    expect(css).toContain("@media (max-width: 767px)");
    expect(css).toContain("@media (max-width: 399px)");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
  });

  it("keeps supporting copy and coral status text readable on both theme surfaces", () => {
    const css = readSource("components/rankings/rankings.module.css");
    const palettes = [...css.matchAll(/\.page\s*{([^}]+)}/g)].slice(0, 2);

    expect(palettes).toHaveLength(2);
    palettes.forEach((palette) => {
      const token = (name: string) => rgb(palette[1].match(new RegExp(`--league-${name}: #([0-9a-f]{6})`))![1]);
      const tint = palette[1].match(/--league-coral-soft: rgba\(([^)]+)\)/)![1].split(",").map(Number);
      ["surface", "surface-soft", "surface-strong"].forEach((surface) => {
        const background = token(surface);
        ["text", "muted", "faint"].forEach((name) => {
          expect(contrast(token(name), background), `${name} on ${surface}`).toBeGreaterThanOrEqual(4.5);
        });
        const badgeBackground = composite(tint.slice(0, 3), background, tint[3]);
        expect(contrast(token("coral"), badgeBackground), `coral on tinted ${surface}`).toBeGreaterThanOrEqual(4.5);
      });
    });
  });

  it("preserves the podium gradients with readable numeral highlights", () => {
    const css = readSource("components/rankings/rankings.module.css");
    const crest = css.match(/\.leaderboardRow\[data-podium\] \.rankCrest\s*{([^}]+)}/)![1];
    const number = css.match(/\.leaderboardRow\[data-podium\] \.rankCrest strong\s*{([^}]+)}/)![1];
    const ink = rgb(crest.match(/color: #([0-9a-f]{6})/)![1]);
    const highlight = number.match(/background: rgba\(([^)]+)\)/)![1].split(",").map(Number);
    const podiums = [...css.matchAll(/\.leaderboardRow\[data-podium="[123]"\] \.rankCrest\s*{([^}]+)}/g)];

    expect(podiums).toHaveLength(3);
    podiums.forEach((podium) => {
      expect(podium[1]).toContain("linear-gradient(145deg");
      const stops = [...podium[1].matchAll(/#([0-9a-f]{6})/g)].map((stop) => rgb(stop[1]));
      expect(stops).toHaveLength(2);
      for (let step = 0; step <= 10; step += 1) {
        const gradient = composite(stops[0], stops[1], step / 10);
        const background = composite(highlight.slice(0, 3), gradient, highlight[3]);
        expect(contrast(ink, background)).toBeGreaterThanOrEqual(4.5);
      }
    });
  });
});
