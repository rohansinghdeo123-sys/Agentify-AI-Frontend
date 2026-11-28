import { expect, type Locator } from "@playwright/test";

export async function expectDistinctJourneyMarkers(path: Locator) {
  const markers = path.getByRole("button");
  await expect(markers).toHaveCount(4);
  await expect.poll(() => markers.evaluateAll((buttons) => {
    const bounds = buttons.map((button) => button.getBoundingClientRect());
    const icons = buttons.map((button) => button.querySelector("svg")!);
    return {
      fullTouchTargets: bounds.every(({ width, height, left, right, top, bottom }) =>
        width >= 112 && height >= 48 && left >= 0 && right <= innerWidth && top >= 0 && bottom <= innerHeight),
      noOverlap: bounds.every((box, index) => bounds.slice(index + 1).every((next) =>
        box.right <= next.left || next.right <= box.left || box.bottom <= next.top || next.bottom <= box.top)),
      distinctColors: new Set(icons.map((icon) => getComputedStyle(icon).color)).size,
      largeIcons: icons.every((icon) => icon.getBoundingClientRect().width >= 24),
    };
  })).toEqual({ fullTouchTargets: true, noOverlap: true, distinctColors: 4, largeIcons: true });
}
