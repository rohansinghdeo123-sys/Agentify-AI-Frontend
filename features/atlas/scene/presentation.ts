export const ATLAS_INTRO_MS = 2240;
export const ATLAS_FOCUS_MS = 540;

export function cinematicDelta(previous: number, now: number, software = false) {
  return previous ? Math.max(0, Math.min(now - previous, software ? 160 : 64)) : 0;
}

export function atlasPixelRatio(
  width: number,
  height: number,
  deviceRatio: number,
  maxBufferSide: number,
  quality: { software: boolean; compact: boolean; moving: boolean; motionScale: number },
) {
  const { software, compact, moving, motionScale } = quality;
  const budget = software ? (moving ? 190_000 : 560_000)
    : compact ? (moving ? 2_350_000 * motionScale : 5_900_000)
      : (moving ? 3_450_000 * motionScale : 9_000_000);
  return Math.min(deviceRatio, maxBufferSide / Math.max(width, height), Math.sqrt(budget / (width * height)));
}
