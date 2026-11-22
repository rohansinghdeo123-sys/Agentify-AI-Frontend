import { describe, expect, it } from "vitest";
import { atlasPixelRatio, cinematicDelta } from "@/features/atlas/scene/presentation";

describe("Atlas presentation", () => {
  it("keeps native resolution for 4K and high-density portrait views at rest", () => {
    const hardware = { software: false, compact: false, moving: false, motionScale: 1 };
    expect(atlasPixelRatio(3840, 2160, 1, 8192, hardware)).toBe(1);
    expect(atlasPixelRatio(418, 800, 4, 8192, { ...hardware, compact: true })).toBe(4);
    expect(atlasPixelRatio(1600, 900, 3, 2048, hardware)).toBeCloseTo(1.28);
  });

  it("lowers GPU load during slow motion and restores detail when it ends", () => {
    const quality = { software: false, compact: true, moving: true, motionScale: .65 };
    const moving = atlasPixelRatio(418, 800, 3, 8192, quality);
    expect(moving).toBeLessThan(3);
    expect(atlasPixelRatio(418, 800, 3, 8192, { ...quality, moving: false })).toBe(3);
  });

  it("advances at frame cadence and avoids jumping ahead after a pause", () => {
    expect(cinematicDelta(100, 116.67)).toBeCloseTo(16.67);
    expect(cinematicDelta(100, 250)).toBe(64);
    expect(cinematicDelta(100, 300, true)).toBe(160);
    expect(cinematicDelta(0, 15_000)).toBe(0);
  });
});
