import * as T from "three";
import type { Point } from "./layout";
import { mesh, randomFor } from "./primitives";

type Summit = [x: number, z: number, height: number, xRadius: number, zRadius: number];

type Range = {
  position: Point;
  width: number;
  depth: number;
  distant: boolean;
  seed: number;
  summits: Summit[];
};

const ranges: Range[] = [
  {
    position: [-41, -11.5, -47], width: 43, depth: 23, distant: true, seed: 107,
    summits: [[-.56, .03, 14.5, .51, .76], [-.16, -.17, 22, .56, .82], [.21, .12, 16.3, .53, .78], [.59, -.1, 11.9, .43, .70]],
  },
  {
    position: [46, -12, -50], width: 44, depth: 25, distant: true, seed: 191,
    summits: [[-.63, -.14, 12, .43, .69], [-.27, .05, 17.1, .51, .71], [.18, -.11, 22, .58, .82], [.58, .12, 16, .50, .72]],
  },
  {
    position: [-26, -9, -24], width: 27, depth: 20, distant: false, seed: 231,
    summits: [[-.55, -.22, 10.6, .49, .64], [-.23, .12, 11.8, .56, .72], [.09, -.06, 15.9, .55, .82], [.51, .04, 8.6, .42, .65]],
  },
  {
    position: [31, -9, -24], width: 28, depth: 21, distant: false, seed: 339,
    summits: [[-.62, .07, 8.6, .42, .65], [-.11, -.07, 17.2, .56, .83], [.26, .21, 11.2, .49, .71], [.60, -.18, 13.1, .44, .73]],
  },
];

function grain(x: number, z: number, seed: number) {
  const hash = Math.imul(x + seed, 0x1b873593) ^ Math.imul(z, 0x85ebca77);
  return ((hash ^ (hash >>> 15)) >>> 0) / 4294967296;
}

function noise(x: number, z: number, seed: number) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = T.MathUtils.smoothstep(x - ix, 0, 1);
  const fz = T.MathUtils.smoothstep(z - iz, 0, 1);
  const a = T.MathUtils.lerp(grain(ix, iz, seed), grain(ix + 1, iz, seed), fx);
  const b = T.MathUtils.lerp(grain(ix, iz + 1, seed), grain(ix + 1, iz + 1, seed), fx);
  return T.MathUtils.lerp(a, b, fz);
}

function rangeGeometry(range: Range, compact: boolean) {
  const { width, depth, distant, seed, summits } = range;
  const columns = compact ? (distant ? 42 : 60) : distant ? 72 : 112;
  const rows = compact ? (distant ? 23 : 34) : distant ? 38 : 62;
  const random = randomFor(seed);
  const profiles = summits.map(([x, z, height, rx, rz]) => ({
    x, z, height, rx, rz, phase: random() * Math.PI * 2,
    skew: (random() - .5) * .64,
  }));
  const geometry = new T.PlaneGeometry(width, depth, columns, rows).rotateX(-Math.PI / 2);
  const points = geometry.attributes.position;

  for (let i = 0; i < points.count; i++) {
    const vx = points.getX(i);
    const vz = points.getZ(i);
    const x = vx * 2 / width;
    const z = vz * 2 / depth;
    const exit = T.MathUtils.smoothstep(Math.min(1 - Math.abs(x), 1 - Math.abs(z)), 0, .19);
    const coarse = noise(vx * .28, vz * .28, seed);
    const fractured = noise(vx * .86 + coarse, vz * .73, seed + 17);
    const fine = noise(vx * 2.4, vz * 2.4, seed + 49);
    let elevation = 0;

    for (const peak of profiles) {
      const dz = (z - peak.z) / peak.rz;
      const dx = (x - peak.x) / peak.rx + dz * peak.skew;
      const angle = Math.atan2(dz, dx);
      const radius = Math.hypot(dx, dz);
      // Angular buttresses continue down the mountain and split into smaller spurs at the base.
      const fold = .17 * Math.cos(5 * angle + peak.phase - 1.6 * radius) +
        .12 * Math.sin(8 * angle + 2.7 * radius) + .066 * Math.cos(13 * angle + peak.phase);
      const slope = 1 - radius / (1 + fold + (coarse - .5) * .22);
      if (slope <= 0) continue;
      const steepness = 1.08 + .32 * Math.cos(angle + peak.phase);
      const relief = peak.height * Math.pow(slope, steepness) + Math.sin(radius * 23 + coarse * 5) * .48 * radius;
      const saddle = Math.max(1.7 - Math.abs(elevation - relief), 0) / 1.7;
      elevation = Math.max(elevation, relief) + saddle * saddle * .425;
    }

    const foothill = T.MathUtils.smoothstep(elevation, .0, 5);
    const erosion = (coarse - .5) * 1.9 + (fractured - .5) * 1.62 + (fine - .5) * .42;
    points.setY(i, (elevation + erosion * foothill) * exit - 1.8 * (1 - exit));
  }

  geometry.computeVertexNormals();
  const normals = geometry.attributes.normal;
  const colors = new Float32Array(points.count * 4);
  const shale = new T.Color(distant ? 0x37605f : 0x23353d);
  const exposed = new T.Color(distant ? 0x5d7a7c : 0x597577);
  const lichen = new T.Color(distant ? 0x45665d : 0x506656);
  const shade = new T.Color();
  for (let i = 0; i < points.count; i++) {
    const x = points.getX(i);
    const y = points.getY(i);
    const z = points.getZ(i);
    const slope = 1 - normals.getY(i);
    const mineral = noise(x * .48 + y * .56, z * .44 - y * .2, seed + 21);
    const ledges = (.5 + .5 * Math.sin(y * 2.4 + x * .53 + z * .26 + mineral * 2.5)) ** 3;
    const relief = .11 + .26 * mineral + .23 * ledges + .18 * slope;
    const moss = T.MathUtils.smoothstep(normals.getY(i), .48, .96) *
      T.MathUtils.smoothstep(mineral, .47, .89) * (1 - T.MathUtils.smoothstep(y, 9, 15));
    shade.copy(shale).lerp(exposed, relief).lerp(lichen, moss * .62);
    shade.multiplyScalar(.82 + mineral * .22 + .15 * T.MathUtils.smoothstep(y, 5, 15));
    shade.toArray(colors, i * 4);
    // Let the lowest slopes dissolve into the valley rather than ending as a flat mesh edge.
    colors[i * 4 + 3] = T.MathUtils.smoothstep(y, .8, distant ? 5.7 : 4.5);
  }
  geometry.setAttribute("color", new T.BufferAttribute(colors, 4));
  return geometry;
}

function stoneMaterial(compact: boolean) {
  const stone = new T.MeshStandardMaterial({
    vertexColors: true, roughness: .96, transparent: true, alphaTest: .012,
  });
  if (compact) return stone;

  // Keep close-range rock grain sharp without downloading extra texture maps.
  stone.onBeforeCompile = (shader) => {
    shader.vertexShader = `varying vec3 vMountainStone;\n${shader.vertexShader}`.replace(
      "#include <begin_vertex>",
      "#include <begin_vertex>\n vMountainStone = position;",
    );
    shader.fragmentShader = `
      varying vec3 vMountainStone;
      float stoneNoise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        vec4 q = fract(sin(vec4(dot(i, vec2(19.7,47.1))) +
          vec4(0.0,19.7,47.1,66.8)) * 47823.17);
        return mix(mix(q.x,q.y,f.x),mix(q.z,q.w,f.x),f.y);
      }
      ${shader.fragmentShader}
    `.replace("#include <color_fragment>", `
      #include <color_fragment>
      vec2 stoneFace = vec2(vMountainStone.x + vMountainStone.z * .47,
        vMountainStone.y + .27 * vMountainStone.z);
      float flecks = stoneNoise(stoneFace * 16.0);
      float grains = stoneNoise(stoneFace * 5.0 + flecks * .3);
      float beds = sin(dot(vMountainStone, vec3(-.8, 12.9, 1.1)) + grains * 2.6);
      float layer = mix(.5 + .5 * beds, .5, smoothstep(.15, 1.8, fwidth(beds)));
      diffuseColor.rgb *= .87 + .14 * grains + .09 * layer + .07 * flecks;
    `);
  };
  return stone;
}

export function addMountainRanges(parent: T.Object3D, compact: boolean) {
  const material = stoneMaterial(compact);
  for (const range of ranges) {
    const mountain = mesh(parent, rangeGeometry(range, compact), material, range.position);
    mountain.name = range.distant ? "Distant mountain range" : "Slate mountain range";
    // Mountains contribute depth bounds before the see-through cloud banks.
    mountain.renderOrder = -4;
  }
}
