export type Point = [number, number, number];
export type Destination = "planning" | "study" | "revision" | "exam";

export const VIEW = {
  eye: [1, 13.2, 33.5] as Point,
  target: [-3.03, 4.76, .9] as Point,
  fov: 39,
};

export const DESTINATIONS: { id: Destination; title: string; site: Point; shelf: Point; size: [number, number, number]; accent: number }[] = [
  { id: "planning", title: "Planning", site: [5.9, 1.4, 4.85], shelf: [5.65, 1.28, 4.3], size: [4.4, 3, 4.2], accent: 0x43d6b3 },
  { id: "study", title: "Study", site: [-1.8, 4.15, -.15], shelf: [-2, 4.03, -.45], size: [5.2, 3.6, 4.8], accent: 0x44d5ca },
  { id: "revision", title: "Revision", site: [8.5, 6.65, -4.5], shelf: [8.4, 6.53, -5.4], size: [4.6, 3.15, 5.1], accent: 0xa591fa },
  { id: "exam", title: "Exam", site: [5.55, 9.55, -11.4], shelf: [5.45, 9.43, -11.9], size: [5.25, 3.35, 5.8], accent: 0x7eeac7 },
];

// Coordinates run continuously from the book's spine to the Exam stair.
export const ROUTE: Point[] = [
  [-.75, .19, 11.2],
  [-.7, .45, 9.55],
  [.05, .84, 7.05],
  [2.55, 1.65, 5.95],
  [3.6, 2.05, 4.4],
  [2.7, 2.85, 3.05],
  [.3, 3.98, 3.85],
  [-2.25, 4.32, 3.1],
  [-2.45, 4.44, 1.68],
  [-.9, 4.65, .96],
  [2.2, 5.34, .12],
  [5.75, 6.17, -.95],
  [7.5, 6.77, -2.35],
  [7, 7.13, -3.5],
  [4.65, 8.53, -4.2],
  [3.05, 9.26, -5.45],
  [3.71, 9.72, -7.12],
  [4.91, 9.75, -8.28],
  [5.55, 9.74, -9.58],
];
