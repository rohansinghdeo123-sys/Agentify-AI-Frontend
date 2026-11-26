import * as T from "three";
import type { Point } from "./layout";

type CloudShape = "ridge" | "crown" | "veil";
type CloudBank = [shape: CloudShape, position: Point, width: number, height: number, opacity: number];

// Successive depths separate the distant canopy, mountain skirts, and low
// banks. The open middle at each level leaves the book and route in clear air.
const BANKS: CloudBank[] = [
  ["veil", [-43, 3.5, -53], 28, 5.2, .53],
  ["ridge", [-27, 1.25, -43], 21, 6.8, .55],
  ["veil", [-10, .15, -43], 19, 4.2, .38],
  ["ridge", [11, 2, -48], 24, 6.2, .46],
  ["crown", [30, 2.75, -45], 21, 8.1, .56],
  ["veil", [51, 3.5, -55], 28, 5.7, .49],
  ["crown", [-31, .1, -22], 17, 8.5, .66],
  ["ridge", [-21, -1.7, -18], 18, 6.4, .69],
  ["veil", [-12, -1.1, -23], 15, 4.7, .56],
  ["ridge", [4, -.4, -24], 16, 5.6, .49],
  ["crown", [18, -.4, -19], 16, 6.8, .64],
  ["ridge", [32, .2, -18], 23, 7.1, .69],
  ["veil", [-32, -2.5, -8], 16, 4.8, .52],
  ["crown", [-17, -2.6, -6], 16, 6.3, .72],
  ["veil", [-8.5, -2, -4], 9.8, 3.0, .44],
  ["veil", [12, -1.9, -6.3], 10, 3.4, .51],
  ["crown", [23, -2.65, -3.6], 20, 7.6, .73],
  ["ridge", [-16, -3.85, 5.2], 17, 7.0, .84],
  ["veil", [-10.4, -3.8, 6.4], 12, 3.8, .48],
  ["ridge", [13.8, -3.3, 5.8], 13, 5.7, .75],
  ["crown", [23.5, -3.5, 6.2], 16, 6.4, .73],
];

const WIDE_BANKS: CloudBank[] = [
  ["ridge", [-54, 1, -34], 22, 7.4, .48],
  ["veil", [48, .1, -33], 23, 4.9, .53],
  ["crown", [-25, -.65, -11], 13, 6.0, .48],
  ["crown", [33, -.2, -10.5], 16, 5.9, .53],
  ["crown", [-23, -3, 5], 14, 6.1, .61],
  ["veil", [30, -2.6, 4.1], 13.5, 4.2, .62],
];

export function clouds(group: T.Object3D, compact: boolean, redraw: () => void) {
  const loader = new T.TextureLoader();
  const textures: Promise<void>[] = [];
  let daylight = false;

  // The shared maps bake optical depth and sunlight scattering through a
  // turbulent 3D density field. Spatially separated cards preserve parallax
  // without ray marching full-screen pixels on low-power devices.
  function cloudMap(shape: CloudShape) {
    const materials: T.SpriteMaterial[] = [];
    let loaded = false;
    let settle!: () => void;
    textures.push(new Promise<void>((resolve) => { settle = resolve; }));
    const map = loader.load(`/atlas/cloud-${shape}.webp`, () => {
      loaded = true;
      materials.forEach((material) => { material.visible = true; });
      settle();
      redraw();
    }, undefined, settle);
    map.colorSpace = T.SRGBColorSpace;
    return {
      materials,
      sprite(opacity: number) {
        const material = new T.SpriteMaterial({
          map, transparent: true, depthWrite: false, alphaTest: .008,
          visible: loaded, opacity, color: daylight ? 0xfffef5 : 0xc5e1db,
        });
        materials.push(material);
        return new T.Sprite(material);
      },
    };
  }

  const maps = { ridge: cloudMap("ridge"), crown: cloudMap("crown"), veil: cloudMap("veil") };

  function place([shape, position, width, height, opacity]: CloudBank, parent = group) {
    const sprite = maps[shape].sprite(opacity);
    sprite.position.set(...position);
    sprite.scale.set(width, height, 1);
    parent.add(sprite);
  }

  for (const bank of BANKS) place(bank);
  if (!compact) for (const bank of WIDE_BANKS) place(bank);

  return {
    textures: Promise.all(textures),
    setCloudDaylight(light: boolean) {
      daylight = light;
      for (const { materials } of Object.values(maps)) {
        for (const material of materials) material.color.setHex(light ? 0xfffef5 : 0xc5e1db);
      }
    },
    mist(parent: T.Object3D, [x, y, z]: Point, width: number) {
      place(["veil", [x, y, z], width * 2.3, .67, .34], parent);
      place(["crown", [x + width * .18, y - .23, z + .26], width * 3.2, .8, .27], parent);
    },
  };
}
