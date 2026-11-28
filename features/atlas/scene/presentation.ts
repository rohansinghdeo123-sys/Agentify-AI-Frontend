export const ATLAS_REVEAL_MS = 2240;
const ATLAS_ARRIVAL_MS = ATLAS_REVEAL_MS + 720;
const ATLAS_SETTLE_MS = ATLAS_ARRIVAL_MS + 320;
export const ATLAS_INTRO_MS = ATLAS_SETTLE_MS + 680;
export const ATLAS_FOCUS_MS = 540;

function easeBetween(elapsed: number, start: number, end: number) {
  const time = Math.min(1, Math.max(0, (elapsed - start) / (end - start)));
  return time * time * time * (time * (time * 6 - 15) + 10);
}

export function atlasIntroFraming(elapsed: number, overviewBlend: number) {
  const approach = easeBetween(elapsed, ATLAS_REVEAL_MS, ATLAS_ARRIVAL_MS);
  const focus = approach * (1 - easeBetween(elapsed, ATLAS_SETTLE_MS, ATLAS_INTRO_MS));
  return { focus, distance: 1 + .07 * overviewBlend * (1 - approach) - .22 * focus };
}

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
