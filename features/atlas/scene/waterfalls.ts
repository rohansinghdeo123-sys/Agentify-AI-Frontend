import * as T from "three";
import type { Point } from "./layout";
import { mesh } from "./primitives";

type Cascade = {
  lip: Point;
  width: number;
  drop: number;
  angle: number;
  tributary?: boolean;
};

const CASCADES: Cascade[] = [
  { lip: [-4.85, 3.98, 3.03], width: 1.18, drop: 3.88, angle: -.18 },
  { lip: [-3.90, 3.99, 3.24], width: .52, drop: 3.79, angle: .12, tributary: true },
  { lip: [6.6, 6.47, -1.34], width: .75, drop: 3, angle: .25 },
  { lip: [11.45, 6.49, -1.21], width: 1.18, drop: 4.23, angle: .26 },
  { lip: [10.55, 6.48, -1.03], width: .52, drop: 4.04, angle: -.12, tributary: true },
  { lip: [2.38, 9.24, -7.99], width: 1.34, drop: 3.04, angle: -.17 },
  { lip: [3.14, 9.28, -7.59], width: .46, drop: 2.94, angle: .02, tributary: true },
  { lip: [7.58, 1.29, 7.04], width: .55, drop: 2.3, angle: .15 },
];

const WATER_VERTEX = `
  attribute float streamSeed;
  varying vec2 vUv;
  varying float vSeed;
  void main() {
    vUv = uv;
    vSeed = streamSeed;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
  }
`;

const WATER_FRAGMENT = `
  varying vec2 vUv;
  varying float vSeed;
  uniform float time;
  uniform float daylight;

  float hash(vec2 p) {
    vec3 q = fract(vec3(p.xyx) * .1031);
    q += dot(q, q.yzx + 33.33);
    return fract((q.x + q.y) * q.z);
  }

  float noise(vec2 p) {
    vec2 i = floor(p), w = fract(p);
    w = w*w*(3. - 2.*w);
    return mix(mix(hash(i), hash(i + vec2(1., 0.)), w.x),
               mix(hash(i + vec2(0., 1.)), hash(i + 1.), w.x), w.y);
  }

  void main() {
    float depth = vUv.y;
    float current = pow(depth, .74) - time * (.39 + .22 * fract(vSeed));
    float lateral = vUv.x + .026 * sin(depth * 8.6 + vSeed);
    float body = noise(vec2(lateral * 5.4 + vSeed, current * 2.9));
    float fold = noise(vec2(lateral * 13. + body * .64, current * 4.1 + vSeed * 2.));
    float threads = noise(vec2(lateral * 29. + body * 1.6, current * 8.7 - vSeed));
    float crest = 1. - smoothstep(.02, .23, depth);
    float plume = smoothstep(.73, 1., depth);
    float ripple = smoothstep(.49, .89, fold * .56 + threads * .44);
    float foam = clamp(.09 + ripple * .53 + crest * (.25 + body * .28) + plume * .23, 0., 1.);

    vec3 trough = mix(vec3(.08,.31,.36), vec3(.19,.47,.51), daylight);
    vec3 lit = mix(vec3(.49,.80,.82), vec3(.58,.86,.88), daylight);
    vec3 spume = mix(vec3(.76,.94,.93), vec3(.94,.98,.96), daylight);
    vec3 water = mix(trough, lit, .38 + body * .27 + fold * .15);
    vec3 color = mix(water, spume, foam);

    float margin = mix(.045, .14, plume) + (body - .5) * .075;
    float edge = smoothstep(margin, margin + .16, min(vUv.x, 1. - vUv.x));
    float tail = 1. - smoothstep(.89 + fold * .06, 1., depth);
    float alpha = edge * tail * (.55 + .27 * body + .16 * foam);
    gl_FragColor = sRGBTransferEOTF(vec4(color, alpha));
    #include <colorspace_fragment>
  }
`;

const runoffReach = .71;

function waterfall(parent: T.Object3D, cascade: Cascade, material: T.Material, index: number, compact: boolean) {
  const { lip, width, drop, angle, tributary } = cascade;
  const geometry = new T.PlaneGeometry(width, drop, compact ? 7 : 12, compact ? 17 : 24);
  const positions = geometry.getAttribute("position");
  const uv = geometry.getAttribute("uv");
  const seeds = new Float32Array(positions.count).fill(2.27 * (index + 1));
  const seed = seeds[0];
  for (let i = 0; i < positions.count; i++) {
    const u = uv.getX(i);
    const t = 1 - uv.getY(i);
    const bend = T.MathUtils.smoothstep(t, 0, .24);
    const edgeRipple = .039 * Math.sin(t * 15.4 + seed);
    const spread = .91 + (tributary ? .12 : .18) * t + .43 * t ** 5 + edgeRipple;
    const sway = (Math.sin(t * 4.8 + seed) - Math.sin(seed)) * .059;
    const x = ((u - .5) * spread + sway) * width;
    // Tuck the rounded head into the shelf before the water clears the cliff.
    const z = -.27 + bend * .51 + (runoffReach - .24) * t ** 4
      + .072 * Math.sin(u * 8 + t * 10.1 + seed) * bend;
    const y = .052 - (drop + .052) * t ** 1.16;
    positions.setXYZ(i, x, y, z);
    uv.setY(i, t);
  }
  geometry.setAttribute("streamSeed", new T.BufferAttribute(seeds, 1));
  const stream = mesh(parent, geometry, material, lip);
  stream.rotation.y = angle;
}

export function waterfalls(parent: T.Object3D, compact: boolean, daylight: { value: number }) {
  const waterTime = { value: 0 };
  const water = new T.ShaderMaterial({
    vertexShader: WATER_VERTEX,
    fragmentShader: WATER_FRAGMENT,
    uniforms: { time: waterTime, daylight },
    side: T.DoubleSide,
    transparent: true,
    depthWrite: false,
    forceSinglePass: true,
  });
  CASCADES.forEach((cascade, index) => waterfall(parent, cascade, water, index, compact));
  return {
    waterTime,
    waterfallBases: CASCADES.filter((cascade) => !cascade.tributary).map(({ lip, width, drop, angle }) => ({
      point: [lip[0] + Math.sin(angle) * runoffReach, lip[1] - drop + .12, lip[2] + Math.cos(angle) * runoffReach] as Point,
      width: width * 1.10,
    })),
  };
}
