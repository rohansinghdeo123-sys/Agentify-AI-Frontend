import * as T from "three";
import type { Point } from "./layout";

export function randomFor(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

export function mesh(parent: T.Object3D, geometry: T.BufferGeometry, material: T.Material, point: Point = [0, 0, 0]) {
  const object = new T.Mesh(geometry, material);
  object.position.set(...point);
  parent.add(object);
  return object;
}

export function box(parent: T.Object3D, material: T.Material, size: Point, point: Point = [0, 0, 0]) {
  return mesh(parent, new T.BoxGeometry(...size), material, point);
}

export function column(parent: T.Object3D, material: T.Material, top: number, base: number, height: number, point: Point, sides = 12) {
  return mesh(parent, new T.CylinderGeometry(top, base, height, sides), material, point);
}

export function ring(parent: T.Object3D, material: T.Material, radius: number, tube: number, point: Point, arc = Math.PI * 2) {
  return mesh(parent, new T.TorusGeometry(radius, tube, 8, 48, arc), material, point);
}

export function rod(parent: T.Object3D, material: T.Material, from: T.Vector3, to: T.Vector3, base: number, tip = base) {
  const direction = to.clone().sub(from);
  const middle = from.clone().addScaledVector(direction, .5);
  const object = column(parent, material, tip, base, direction.length(), middle.toArray(), 6);
  object.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), direction.normalize());
  return object;
}

export function star(parent: T.Object3D, material: T.Material, size: number, point: Point) {
  const rim = [
    [0, size], [size * .17, size * .16], [size * .8, 0], [size * .17, -size * .16],
    [0, -size], [-size * .17, -size * .16], [-size * .8, 0], [-size * .17, size * .16],
  ];
  const vertices: number[] = [];
  const colors: number[] = [];
  for (let i = 0; i < rim.length; i++) {
    const [x, y] = rim[i];
    const [nx, ny] = rim[(i + 1) % rim.length];
    vertices.push(0, 0, size * .19, nx, ny, 0, x, y, 0);
    const lightness = .66 + (i % 4) * .10;
    for (let j = 0; j < 3; j++) colors.push(lightness, lightness, lightness);
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute("position", new T.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute("color", new T.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return mesh(parent, geometry, material, point);
}

export function material(color: number, roughness = .65, metalness = 0) {
  return new T.MeshStandardMaterial({ color, roughness, metalness });
}

export function emissive(color: number, emission: number, intensity: number) {
  return new T.MeshStandardMaterial({ color, emissive: emission, emissiveIntensity: intensity, metalness: .18, roughness: .31 });
}

export function palette() {
  return {
    stone: material(0xd7c5a1, .73),
    shadowStone: material(0x526d5d, .87),
    blueStone: material(0x183f43, .78),
    gold: material(0xe6ab50, .31, .68),
    bronze: material(0x75502e, .48, .59),
    goldLight: emissive(0xffd389, 0xffa023, 1.0),
    lamp: emissive(0xffdfad, 0xffbd58, 2.0),
    turquoise: material(0x176f73, .36, .37),
    emerald: material(0x1c514d, .40, .22),
    plum: material(0x423959, .50, .22),
    glass: emissive(0x68eee2, 0x24dbd0, .75),
    parchment: material(0xe8d3a4, .89),
    paper: material(0xf9e8c0, .91),
    binding: material(0x0d332f, .65),
    ink: material(0x896e52, .85),
    trunk: material(0x504735, .9),
  };
}

export type Palette = ReturnType<typeof palette>;
