import * as T from "three";
import { DESTINATIONS, type Point } from "./layout";
import { material, mesh, randomFor, rod, type Palette } from "./primitives";

export function taperedRock(parent: T.Object3D, rocky: T.Material, position: Point, size: Point, seed: number, mountain = false) {
  const random = randomFor(seed);
  const count = mountain ? 48 : size[0] > 2 ? 78 : 32;
  const points: number[] = [];
  const colors: number[] = [];
  const uv: number[] = [];
  const indices: number[] = [];
  const ridges = Array.from({ length: count }, () => .85 + .26 * random());
  const stone = new T.Color(mountain ? 0x3a505d : 0x859585);
  const vegetation = new T.Color(mountain ? 0x1d3f34 : 0x81965c);
  const angleOffset = random() * 5;
  const tilt = random() - .5;
  const layers = mountain
    ? [[1, -.08], [.91,.08], [.78,.24], [.70,.32], [.49,.48], [.44,.61], [.28,.72], [.20,.87], [.055,.95], [0,1]]
    : [[.025,-1.51],[.17,-1.28],[.28,-1.19],[.40,-1.05],[.46,-.92],[.59,-.81],[.54,-.70],
      [.71,-.56],[.79,-.39],[.77,-.31],[.95,-.24],[.9,-.21],[.97,-.15],[1,-.076],[.93,0],[.73,.024],[.45,.041],[.21,.056],[0,.06]];
  layers.forEach(([scale, elevation], layer) => {
    for (let i = 0; i <= count; i++) {
      const idx = i % count;
      const angle = idx * Math.PI * 2 / count;
      const fracture = Math.sin(angle * 7 + angleOffset) * Math.sin(angle * 3 - elevation * 2)
        + .38 * Math.cos(angle * 17 + elevation * 3 + seed);
      const strata = 1 + .035 * Math.sin(elevation * 65 + angle * 4);
      const profile = strata * scale * (ridges[idx] + fracture * .13) * (1 + .15 * Math.sin(angle * 3 + seed));
      const edge = layer >= layers.length - 5 && !mountain;
      const bump = (random() - .5) * (edge ? .04 : .12) * (scale === 0 ? 0 : 1);
      const height = size[1] * (elevation + (edge ? .025 : .11) * scale * fracture) + bump;
      points.push(size[0] * (Math.cos(angle) * profile + elevation * tilt * .33), height, Math.sin(angle) * size[2] * profile);
      const tone = (edge ? vegetation : stone).clone().multiplyScalar((.74 + random() * .36 + fracture * .18) * (layer < 2 && !mountain ? .51 : 1));
      colors.push(tone.r, tone.g, tone.b);
      uv.push(i / count * (size[0] * .82 + 1), elevation * Math.max(1.15, size[1] * .72));
      if (layer && i) {
        const a = layer * (count + 1) + i;
        indices.push(a, a - count - 2, a - 1, a, a - count - 1, a - count - 2);
      }
    }
  });
  const geometry = new T.BufferGeometry();
  geometry.setAttribute("position", new T.Float32BufferAttribute(points, 3));
  geometry.setAttribute("color", new T.Float32BufferAttribute(colors, 3));
  geometry.setAttribute("uv", new T.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return mesh(parent, geometry, rocky, position);
}

const WATER_VERTEX = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
  }
`;

const WATER_FRAGMENT = `
  varying vec2 vUv;
  uniform float time;
  void main() {
    float flow = vUv.y + time * .46;
    float stripe = pow(.5 + .5*sin(vUv.x*103. + flow*17. + sin(flow*9.+vUv.x*23.)*2.2), 4.);
    float currents = pow(.5 + .5*sin(vUv.x*48. + sin(flow*14.+vUv.x*8.)*1.9), 3.);
    float foam = pow(.5 + .5*sin(vUv.x*270. + flow*29.+sin(flow*19.)*3.), 8.);
    vec3 color = mix(vec3(.07,.33,.36), vec3(.80,.98,.96), .18+stripe*.31+currents*.29+foam*.16);
    float outline = smoothstep(0.,.22,vUv.x)*smoothstep(0.,.22,1.-vUv.x);
    float alpha = outline * (.33 + stripe*.30 + currents*.24 + foam*.13) * smoothstep(0.,.18,vUv.y);
    gl_FragColor = sRGBTransferEOTF(vec4(color, alpha));
    #include <colorspace_fragment>
  }
`;

function falls(parent: T.Object3D, position: Point, width: number, height: number, angle: number, material: T.Material) {
  const group = new T.Group();
  group.position.set(...position);
  group.rotation.y = angle;
  parent.add(group);
  const geometry = new T.PlaneGeometry(width, height, 28, 25);
  const positions = geometry.getAttribute("position");
  const uv = geometry.getAttribute("uv");
  for (let i = 0; i < positions.count; i++) {
    const horizontal = uv.getX(i), level = uv.getY(i);
    const crest = Math.pow(level, 12) * -.18;
    const z = crest + Math.pow(1 - level, 3) * .63 + .075 * Math.sin(horizontal * 25 + level * 11);
    positions.setXYZ(i, positions.getX(i) * (.89 + .22 * (1 - level)), (level - 1) * height, z);
  }
  mesh(group, geometry, material);
}

type Foliage = { center: T.Vector3; scale: T.Vector3; color: T.Color; rotation: number };

function tree(parent: T.Object3D, p: Palette, foliage: Foliage[], origin: Point, size: number, seed: number, pink = false) {
  const rng = randomFor(seed);
  const root = new T.Vector3(...origin);
  const crown = root.clone().add(new T.Vector3((rng() - .5) * size * .44, size * .82, (rng() - .5) * size * .27));
  rod(parent, p.trunk, root, crown, .076 * size, .04 * size);
  for (let i = 0; i < 5; i++) {
    const angle = i * 2.4 + rng() * .45;
    const length = (.35 + rng() * .30) * size;
    const branch = crown.clone().add(new T.Vector3(Math.cos(angle) * length, size * (.17 + rng() * .33), Math.sin(angle) * length));
    rod(parent, p.trunk, crown, branch, .038 * size, .017 * size);
    for (let j = 0; j < 8; j++) {
      const tint = pink
        ? [0xc18aaf, 0x8f658b, 0xd79bc0, 0xa878a0][Math.floor(rng() * 4)]
        : [0x51763d, 0x39674f, 0x6e8652, 0x264d3b][Math.floor(rng() * 4)];
      foliage.push({
        center: branch.clone().add(new T.Vector3((rng() - .5) * size * .63, rng() * size * .38, (rng() - .5) * size * .60)),
        scale: new T.Vector3((.21 + rng() * .28) * size, (.13 + rng() * .18) * size, (.21 + rng() * .27) * size),
        color: new T.Color(tint),
        rotation: rng() * Math.PI,
      });
    }
  }
}

function plant(parent: T.Object3D, items: Foliage[], compact: boolean) {
  const geometry = new T.IcosahedronGeometry(1, compact ? 1 : 2);
  const positions = geometry.getAttribute("position");
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
    const irregularity = 1 + .09 * Math.cos(17 * x + 23 * y) * Math.sin(19 * z - 6 * y);
    positions.setXYZ(i, x * irregularity, y * irregularity, z * irregularity);
  }
  geometry.computeVertexNormals();
  const normals = geometry.getAttribute("normal");
  const smooth = new T.Vector3(), face = new T.Vector3();
  for (let i = 0; i < positions.count; i++) {
    smooth.fromBufferAttribute(positions, i).normalize().lerp(face.fromBufferAttribute(normals, i), .25).normalize();
    normals.setXYZ(i, smooth.x, smooth.y, smooth.z);
  }
  const canopy = new T.InstancedMesh(geometry, material(0xffffff, .94), items.length);
  const transform = new T.Object3D();
  items.forEach((item, i) => {
    transform.position.copy(item.center);
    transform.scale.copy(item.scale);
    transform.rotation.set(.25, item.rotation, item.rotation * .18);
    transform.updateMatrix();
    canopy.setMatrixAt(i, transform.matrix);
    canopy.setColorAt(i, item.color);
  });
  parent.add(canopy);
}

export function terrain(parent: T.Object3D, p: Palette, compact: boolean) {
  const group = new T.Group();
  group.name = "Floating islands and forest";
  parent.add(group);
  const rough = new T.MeshStandardMaterial({
    color: 0xffffff, vertexColors: true, side: T.DoubleSide, roughness: .98,
  });
  const water = new T.ShaderMaterial({
    vertexShader: WATER_VERTEX, fragmentShader: WATER_FRAGMENT,
    uniforms: { time: { value: 0 } },
    side: T.DoubleSide, transparent: true, depthWrite: false,
  });
  const crowns: Foliage[] = [];
  const rings: [Point, Point][] = [
    [[2.7, 1.02, 5.1], [2, 2.3, 2.25]],
    [[2.9, 4.12, .25], [2.3, 2.7, 2.1]],
    [[5.2, 6.11, -2], [2.4, 2.3, 1.75]],
    [[2.8, 7.32, -6.1], [2.4, 4.1, 3.8]],
    [[8.5, 8.65, -9], [2.3, 3.7, 3.1]],
  ];
  rings.forEach(([position, size], index) => taperedRock(group, rough, position, size, 61 + index * 17));
  DESTINATIONS.forEach((destination, index) => {
    taperedRock(group, rough, destination.shelf, destination.size, 85 + index * 35);
    const [x, y, z] = destination.shelf;
    const [rx, depth, rz] = destination.size;
    const rng = randomFor(180 + index);
    for (let ridge = 0; ridge < 11; ridge++) {
      const azimuth = (ridge + .2 + rng() * .62) * Math.PI * 2 / 11;
      const inset = .67 + rng() * .14;
      const point: Point = [x + Math.cos(azimuth) * rx * inset, y - .27, z + Math.sin(azimuth) * rz * inset];
      const scale: Point = [.37 + rng() * .48, depth * (.47 + rng() * .49), .36 + rng() * .49];
      taperedRock(group, rough, point, scale, 1556 + index * 18 + ridge);
    }
    const trees = [[-.8,.08],[-.7,-.53],[.71,.37],[.73,-.4],[.42,-.75],[-.42,-.68],[.78,.62],[-.7,.62],
      [-.84,-.22],[.85,-.14],[-.26,-.83],[.49,.68],[.6,-.57]];
    trees.forEach(([dx, dz], i) => {
      tree(group, p, crowns, [x + rx * dx, y + .025, z + rz * dz], .36 + rng() * .57, 200 + index * 37 + i, index === 2 && i < 3);
    });
    for (let i = 0; i < 15; i++) {
      const angle = i * 2.39996 + rng() * .23;
      const radius = .63 + rng() * .18;
      const bush = .20 + rng() * .20;
      crowns.push({
        center: new T.Vector3(x + Math.cos(angle) * rx * radius, y + .09, z + Math.sin(angle) * rz * radius),
        scale: new T.Vector3(bush * 1.4, bush * .56, bush),
        color: new T.Color(index === 2 && i % 4 === 1 ? 0x9d6792 : 0x436c42),
        rotation: angle,
      });
    }
  });

  const cascades: [Point, number, number, number][] = [
    [[-4.85, 3.98, 3.03], 1.18, 3.88, -.18],
    [[-3.90, 3.99, 3.24], .54, 3.43, .12],
    [[6.6, 6.47, -1.34], .75, 3.00, .25],
    [[11.45, 6.49, -1.21], 1.18, 4.23, .26],
    [[10.55, 6.48, -1.03], .57, 3.09, -.12],
    [[2.38, 9.24, -7.99], 1.34, 3.04, -.17],
    [[3.14, 9.28, -7.59], .46, 2.78, .02],
    [[7.58, 1.29, 7.04], .55, 2.3, .15],
  ];
  cascades.forEach(([point, width, height, angle]) => falls(group, point, width, height, angle, water));
  for (const [i, [x, y, z, size]] of [
    [15, 8.45, -14, 1.08], [13.8, 6., -22, .68], [-9.0, 1.45, -2.5, .71],
    [17.4, 5.4, -28, .64], [-9.8, 3.2, -12, .58],
  ].entries()) {
    taperedRock(group, rough, [x, y, z], [size, size * 1.28, size * .78], 119 + i);
    tree(group, p, crowns, [x, y, z], size * .77, 258 + i);
  }
  plant(group, crowns, compact);
  return { group, rock: rough, waterTime: water.uniforms.time,
    waterfallBases: cascades.filter((_, index) => index % 2 === 0).map(([point, width, height]) => ({
      point: [point[0], point[1] - height + .16, point[2] + .30] as Point, width,
    })),
  };
}
