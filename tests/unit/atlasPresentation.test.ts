import { describe, expect, it } from "vitest";
import { ATLAS_INTRO_MS, ATLAS_REVEAL_MS, atlasIntroFraming, atlasPixelRatio, cinematicDelta } from "@/features/atlas/scene/presentation";

describe("Atlas presentation", () => {
  it("pushes in after the book opens, holds on the destinations, then settles at the overview", () => {
    expect(atlasIntroFraming(0, 0)).toEqual({ distance: 1, focus: 0 });
    expect(atlasIntroFraming(ATLAS_REVEAL_MS, 1)).toEqual({ distance: 1.07, focus: 0 });
    expect(atlasIntroFraming(ATLAS_REVEAL_MS + 360, 1).distance).toBeCloseTo(.925);
    expect(atlasIntroFraming(ATLAS_REVEAL_MS + 720, 1)).toEqual({ distance: .78, focus: 1 });
    expect(atlasIntroFraming(ATLAS_REVEAL_MS + 960, 1)).toEqual({ distance: .78, focus: 1 });
    expect(atlasIntroFraming(ATLAS_INTRO_MS - 340, 1).distance).toBeCloseTo(.89);
    expect(atlasIntroFraming(ATLAS_INTRO_MS, 1)).toEqual({ distance: 1, focus: 0 });
  });

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
