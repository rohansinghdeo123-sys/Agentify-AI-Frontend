import * as T from "three";
import type { Point } from "./layout";

type CloudShape = "ridge" | "crown" | "veil";
type CloudBank = [shape: CloudShape, position: Point, width: number, height: number, opacity: number];

const CLOUD_LIGHT = {
  day: { valley: 0xfff8eb, upper: 0xfffaf1, density: 1.50 },
  night: { valley: 0xe5f0ff, upper: 0x91b2c2, density: 1.55 },
};

function lightCloud(material: T.SpriteMaterial, opacity: number, upper: boolean, daylight: boolean) {
  const light = daylight ? CLOUD_LIGHT.day : CLOUD_LIGHT.night;
  material.color.setHex(upper ? light.upper : light.valley);
  material.opacity = 1 - Math.pow(1 - opacity, light.density);
}

// The upper banks have their own distant lighting. Applying the valley fog
// again at these depths flattens the sunlit caps into the surrounding sky.
const WIDE_UPPER_BANKS: CloudBank[] = [
  ["crown", [-45, 17.4, -57], 40, 14, .78],
  ["ridge", [-28, 12.2, -62], 35, 11.2, .57],
  ["veil", [-15, 21.2, -68], 34, 7.8, .48],
  ["ridge", [9, 14.1, -66], 31, 7.9, .46],
  ["crown", [30, 18.2, -64], 38, 13.5, .77],
  ["ridge", [48, 13.9, -57], 37, 11.8, .71],
  ["crown", [58, 20.6, -63], 34, 13, .64],
  ["veil", [-58, 12, -51], 31, 6.8, .51],
];

const PORTRAIT_UPPER_BANKS: CloudBank[] = [
  ["crown", [-25, 35, -40], 33, 13.3, .75],
  ["ridge", [28, 36.5, -49], 36, 11.5, .72],
  ["veil", [-7, 42, -51], 29, 8.2, .48],
  ["crown", [-17, 20, -37], 23, 9.6, .64],
  ["ridge", [19, 24, -42], 26, 9.8, .59],
  ["veil", [-2, 24.5, -52], 24, 6.9, .46],
  ["crown", [-28, 22.6, -33], 26, 10.5, .62],
];

// Loose banks bridge the distant ridges and the floating shelves. Their
// irregular heights and intervening gaps keep the waterfalls and gates legible.
const VALLEY_BANKS: CloudBank[] = [
  ["crown", [-39, 4, -52], 28, 10, .49],
  ["ridge", [-21, 2.5, -40], 23, 7.8, .57],
  ["veil", [-7, 1.2, -35], 19, 4.0, .34],
  ["ridge", [14, 1.1, -38], 25, 6.2, .53],
  ["crown", [37, 3.2, -47], 26, 10.5, .59],
  ["crown", [-24, 6.4, -43], 24, 9.6, .43],
  ["ridge", [25, 6.8, -45], 23, 7.2, .46],
  ["crown", [-30, .85, -24], 21, 10.2, .63],
  ["ridge", [-20, -1.4, -17], 19, 7.3, .72],
  ["veil", [-11, -.65, -18.4], 17, 4.3, .61],
  ["ridge", [4, -2.3, -18], 21, 6.4, .55],
  ["crown", [19, -.1, -17], 20, 8.3, .70],
  ["ridge", [32, .25, -22], 24, 7.8, .69],
  ["crown", [-17, -2.85, -5.5], 17, 6.9, .77],
  ["veil", [-8.3, -2.7, -3.6], 11.7, 3.4, .48],
  ["veil", [12, -2.7, -4.1], 13.1, 4.2, .56],
  ["crown", [24, -3.05, -3.1], 23, 8.7, .75],
  ["ridge", [-20, -3.8, .4], 19, 6.1, .54],
  ["crown", [18.6, -4.1, 1.6], 16, 6.8, .53],
];

const WIDE_BANKS: CloudBank[] = [
  ["crown", [-40, -1.9, -13], 25, 8.2, .61],
  ["ridge", [-19, -4.8, 4.2], 24, 9.7, .83],
  ["crown", [-9.8, -5.8, 3.1], 16, 7.2, .62],
  ["veil", [-.6, -5.6, 1.8], 26, 5.6, .48],
  ["ridge", [13.2, -5.55, 5], 21, 7.5, .77],
  ["crown", [27.5, -5, 7], 22, 8.7, .68],
  ["crown", [-26, -6.5, 12], 21, 7.6, .68],
  ["ridge", [-8.8, -8.6, 13.1], 18, 7.8, .52],
  ["crown", [9.2, -8.8, 13.4], 18, 7.6, .59],
  ["ridge", [26, -6.9, 13.3], 20, 8.6, .66],
];

const OUTER_BANKS: CloudBank[] = [
  ["veil", [-36, 8.4, -36], 21, 4.1, .27],
  ["ridge", [41, -2.6, -9], 25, 7.3, .58],
  ["crown", [-45, -1.8, -6], 26, 11, .57],
  ["veil", [48, 3.1, -20], 29, 6.2, .44],
];

const PORTRAIT_BANKS: CloudBank[] = [
  ["crown", [-13.6, -.4, -8.6], 12.4, 6.2, .49],
  ["ridge", [13.4, .6, -9], 12.8, 5.6, .48],
  ["ridge", [-11, -5.1, 5.8], 13.1, 5.5, .75],
  ["crown", [11, -5.1, 5.4], 14.5, 6.6, .68],
  ["veil", [-3, -7.3, 8.5], 21, 6.4, .56],
  ["crown", [-8, -8.5, 11.2], 14, 6.8, .64],
  ["ridge", [8, -8.2, 13.8], 15.7, 7.8, .65],
  ["veil", [1.8, -10, 13.3], 19.8, 5.2, .50],
  ["crown", [-5.7, -7, 13.9], 14, 6.8, .61],
  ["ridge", [6.8, -7.5, 14.5], 14.8, 7.4, .62],
];

function cloudDeck(parent: T.Object3D) {
  const daylight = { value: 0 };
  const time = { value: 0 };
  const geometry = new T.PlaneGeometry(155, 150);
  const material = new T.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { daylight, time },
    vertexShader: `
      varying vec2 field;
      void main() {
        field = position.xy;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
      }
    `,
    fragmentShader: `
      uniform float daylight;
      uniform float time;
      varying vec2 field;

      float hash(vec2 p) {
        vec3 n = fract(vec3(p.xyx) * .1031);
        n += dot(n, n.yzx + 33.33);
        return fract((n.x + n.y) * n.z);
      }

      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3. - 2. * f);
        return mix(mix(hash(i), hash(i + vec2(1., 0.)), f.x),
          mix(hash(i + vec2(0., 1.)), hash(i + 1.), f.x), f.y);
      }

      void main() {
        vec2 p = field * vec2(.12, .155) + vec2(time * .025, -time * .011);
        float broad = noise(p);
        float curls = noise(p * 2.18 + broad * .85) * .27 + noise(p * 4.5 - .4) * .09;
        float density = smoothstep(mix(.135, .175, daylight), mix(.78, .83, daylight), broad * .67 + curls);
        float shade = clamp(.18 + density * .76 + (broad - noise(p + vec2(.27, -.21))) * .63, 0., 1.);
        vec3 night = mix(vec3(.095, .22, .255), vec3(.60, .73, .79), shade);
        vec3 day = mix(vec3(.44, .64, .66), vec3(.93, .95, .91), shade);
        float fade = 1. - smoothstep(51., 73., length(field * vec2(.91, 1.)));
        float coverage = mix(.27 + density * .55, .25 + density * .54, daylight) * fade;
        gl_FragColor = sRGBTransferEOTF(vec4(mix(night, day, daylight), coverage));
        #include <colorspace_fragment>
      }
    `,
  });
  const deck = new T.Mesh(geometry, material);
  deck.name = "Clouds beneath the Atlas";
  deck.rotation.x = -Math.PI / 2;
  deck.position.y = -5.4;
  deck.renderOrder = -2;
  parent.add(deck);
  return { deck, daylight, time };
}

export function clouds(group: T.Object3D, compact: boolean, redraw: () => void) {
  const loader = new T.TextureLoader();
  const textures: Promise<void>[] = [];
  const lowClouds = cloudDeck(group);
  const wide = new T.Group();
  const portrait = new T.Group();
  group.add(wide, portrait);
  portrait.visible = false;
  let daylight = false;

  // The shared maps bake optical depth and sunlight scattering through a
  // turbulent 3D density field. Spatially separated cards preserve parallax
  // without ray marching full-screen pixels on low-power devices.
  function cloudMap(shape: CloudShape) {
    const sprites: { material: T.SpriteMaterial; opacity: number; upper: boolean }[] = [];
    let loaded = false;
    let settle!: () => void;
    textures.push(new Promise<void>((resolve) => { settle = resolve; }));
    const map = loader.load(`/atlas/cloud-${shape}.webp`, () => {
      loaded = true;
      sprites.forEach(({ material }) => { material.visible = true; });
      settle();
      redraw();
    }, undefined, settle);
    map.colorSpace = T.SRGBColorSpace;
    return {
      sprites,
      sprite(opacity: number, upper: boolean) {
        const material = new T.SpriteMaterial({
          map, transparent: true, depthWrite: false, alphaTest: .008,
          visible: loaded, fog: !upper, toneMapped: !upper,
        });
        lightCloud(material, opacity, upper, daylight);
        sprites.push({ material, opacity, upper });
        return new T.Sprite(material);
      },
    };
  }

  const maps = { ridge: cloudMap("ridge"), crown: cloudMap("crown"), veil: cloudMap("veil") };

  function place([shape, position, width, height, opacity]: CloudBank, parent = group, upper = false) {
    const sprite = maps[shape].sprite(opacity, upper);
    sprite.position.set(...position);
    sprite.scale.set(width, height, 1);
    parent.add(sprite);
    return sprite;
  }

  const drifting = [
    ...VALLEY_BANKS.map((bank) => place(bank)),
    ...WIDE_BANKS.map((bank) => place(bank, wide)),
    ...WIDE_UPPER_BANKS.map((bank) => place(bank, wide, true)),
    ...(compact ? [] : OUTER_BANKS.map((bank) => place(bank, wide))),
    ...PORTRAIT_BANKS.map((bank) => place(bank, portrait)),
    ...PORTRAIT_UPPER_BANKS.map((bank) => place(bank, portrait, true)),
  ].map((sprite, index) => {
    const phase = index * 1.83;
    const amplitude = .17 + (index % 4) * .095;
    return { sprite, x: sprite.position.x - amplitude * Math.sin(phase), phase, amplitude, speed: .104 + (index % 6) * .014 };
  });

  return {
    textures: Promise.all(textures),
    setCloudDaylight(light: boolean) {
      daylight = light;
      lowClouds.daylight.value = Number(light);
      for (const { sprites } of Object.values(maps)) {
        for (const { material, opacity, upper } of sprites) {
          lightCloud(material, opacity, upper, light);
        }
      }
    },
    setCloudPortrait(narrow: boolean) {
      wide.visible = !narrow;
      portrait.visible = narrow;
      lowClouds.deck.position.y = narrow ? -6.85 : -5.4;
    },
    moveClouds(time: number) {
      if (lowClouds.time.value === time) return;
      lowClouds.time.value = time;
      for (const { sprite, x, phase, amplitude, speed } of drifting) {
        sprite.position.x = x + amplitude * Math.sin(phase + time * speed);
      }
    },
    mist(parent: T.Object3D, [x, y, z]: Point, width: number) {
      place(["veil", [x, y, z], width * 2.6, .73, .39], parent);
      place(["crown", [x + width * .22, y - .28, z + .26], width * 3.5, .97, .28], parent);
    },
  };
}
