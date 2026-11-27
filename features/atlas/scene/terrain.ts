import * as T from "three";
import { DESTINATIONS, type Point } from "./layout";
import { material, mesh, randomFor, rod, type Palette } from "./primitives";
import { waterfalls } from "./waterfalls";

function rockShelf(parent: T.Object3D, rocky: T.Material, position: Point, size: Point, seed: number) {
  const random = randomFor(seed);
  const count = size[0] > 2 ? 72 : 36;
  const points: number[] = [];
  const colors: number[] = [];
  const uv: number[] = [];
  const indices: number[] = [];
  const ridges = Array.from({ length: count }, () => .94 + .12 * random());
  const stone = new T.Color(0x9b9784);
  const vegetation = new T.Color(0x81965c);
  const moss = new T.Color(0x5a7048);
  const tone = new T.Color();
  const angleOffset = random() * 5;
  const tilt = (random() - .5) * .29;
  // Broad, staggered beds form a single cliff body below each grass shelf.
  const layers = [[0,-1.03],[.30,-1.1],[.49,-.97],[.62,-.81],[.66,-.67],[.76,-.59],
    [.72,-.53],[.83,-.40],[.89,-.30],[.84,-.25],[.95,-.18],[.93,-.12],
    [1,-.076],[.94,0],[.73,.024],[.45,.041],[.21,.056],[0,.06]];
  layers.forEach(([scale, elevation], layer) => {
    for (let i = 0; i <= count; i++) {
      const idx = i % count;
      const angle = idx * Math.PI * 2 / count;
      const erosion = .64 * Math.sin(angle * 5 + angleOffset + elevation * 2.7) +
        .36 * Math.sin(angle * 11 - elevation * 5 + seed);
      const seam = .5 + .5 * Math.cos(elevation * 36 + angle * 2 + erosion * 2.5);
      const profile = scale * (ridges[idx] + erosion * .08) * (1 + .09 * Math.sin(angle * 3 + seed));
      const edge = layer >= layers.length - 5;
      const strata = Math.sin(angle * 2 + angleOffset) * .11 + erosion * .072;
      const height = size[1] * (elevation + scale * strata * (edge ? .23 : 1)) +
        (random() - .5) * (edge ? .03 : .065) * scale;
      points.push(size[0] * (Math.cos(angle) * profile + elevation * tilt), height, Math.sin(angle) * size[2] * profile);
      const shade = .86 + random() * .13 + erosion * .12;
      const grass = T.MathUtils.smoothstep(elevation, -.26, .028);
      tone.copy(stone).lerp(moss, grass * .66 + seam * .13).lerp(vegetation, grass * .68);
      tone.multiplyScalar(shade * (.68 + .32 * T.MathUtils.smoothstep(elevation, -1.1, -.24)) *
        (.83 + .17 * seam));
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

function shelfSurface(shelf: T.Mesh, x: number, z: number, ray: T.Raycaster): Point {
  const center = shelf.position;
  for (let factor = 1; factor > .55; factor *= .88) {
    ray.ray.origin.set(T.MathUtils.lerp(center.x, x, factor), center.y + 2, T.MathUtils.lerp(center.z, z, factor));
    const ground = ray.intersectObject(shelf, false)[0]?.point;
    if (ground && ground.y >= center.y - .14) return ground.toArray();
  }
  return [T.MathUtils.lerp(center.x, x, .55), center.y, T.MathUtils.lerp(center.z, z, .55)];
}

type Foliage = { center: T.Vector3; scale: T.Vector3; color: T.Color; rotation: number };

function tree(parent: T.Object3D, p: Palette, foliage: Foliage[], origin: Point, size: number, seed: number, pink = false) {
  const rng = randomFor(seed);
  const root = new T.Vector3(...origin);
  const tall = !pink && seed % 4 === 0;
  const height = size * (tall ? 1.40 : 1.12);
  const angle = rng() * Math.PI * 2;
  const lean = size * (.10 + rng() * .24);
  const bend = root.clone().add(new T.Vector3(Math.cos(angle) * lean * .32, height * .49, Math.sin(angle) * lean * .32));
  const crown = root.clone().add(new T.Vector3(Math.cos(angle) * lean, height, Math.sin(angle) * lean));
  const tints = pink ? [0x9d6d87, 0xb38497, 0x845d77] :
    tall ? [0x385b48, 0x496a55, 0x365347] : [0x506b43, 0x60794e, 0x3e5e44];
  const foliageLobe = (center: T.Vector3, width: number, depth: number, orientation: number, tint: number) => {
    foliage.push({
      center,
      scale: new T.Vector3(size * width, size * depth, size * width * (.78 + rng() * .16)),
      color: new T.Color(tints[tint]),
      rotation: orientation,
    });
  };
  rod(parent, p.trunk, root.clone().add(new T.Vector3(0, -.046 * size, 0)), bend, .095 * size, .058 * size);
  rod(parent, p.trunk, bend, crown, .058 * size, .021 * size);
  foliageLobe(crown, tall ? .33 : .57, tall ? .34 : .33, angle, 1);
  for (let i = 0; i < 5; i++) {
    const direction = angle + i * 2.39996 + (rng() - .5) * .52;
    const level = tall ? .02 + i * .15 : .16 + rng() * .55;
    const length = size * (tall ? .59 - .071 * i : .32 + rng() * .30);
    const shoulder = bend.clone().lerp(crown, level);
    const branch = shoulder.clone().add(new T.Vector3(Math.cos(direction) * length,
      size * (.19 + rng() * .20), Math.sin(direction) * length));
    rod(parent, p.trunk, shoulder, branch, .039 * size, .012 * size);
    foliageLobe(branch, (tall ? .29 : .37) + rng() * .13, .20 + rng() * .11, direction, i % 3);
  }
}

function leafTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#dededb";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const rng = randomFor(1717);
  for (let i = 0; i < 670; i++) {
    const shade = Math.round(177 + rng() * 77);
    ctx.fillStyle = `rgb(${shade}, ${shade}, ${shade})`;
    ctx.beginPath();
    ctx.ellipse(rng() * 128, rng() * 128, 1 + rng() * 4.2, .35 + rng() * 1.5, rng() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  return texture;
}

function plant(parent: T.Object3D, items: Foliage[], compact: boolean) {
  const geometry = new T.IcosahedronGeometry(1, compact ? 2 : 4);
  const positions = geometry.getAttribute("position");
  const colors: number[] = [];
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
    const lobes = Math.cos(6 * x + 5 * y) * Math.sin(7 * z - 2 * y);
    const tips = Math.sin(21 * x - 15 * z + 17 * y) * Math.cos(17 * z + 12 * y);
    const irregularity = 1 + .16 * lobes + .06 * tips;
    positions.setXYZ(i, x * irregularity, y * irregularity, z * irregularity);
    const shade = .62 + .35 * T.MathUtils.smoothstep(y, -.73, .90) + .11 * lobes + .078 * tips;
    colors.push(shade, shade, shade);
  }
  geometry.computeVertexNormals();
  geometry.setAttribute("color", new T.Float32BufferAttribute(colors, 3));
  const normals = geometry.getAttribute("normal");
  const smooth = new T.Vector3(), face = new T.Vector3();
  for (let i = 0; i < positions.count; i++) {
    smooth.fromBufferAttribute(positions, i).normalize().lerp(face.fromBufferAttribute(normals, i), .25).normalize();
    normals.setXYZ(i, smooth.x, smooth.y, smooth.z);
  }
  const foliageMaterial = material(0xffffff, .91);
  foliageMaterial.map = leafTexture();
  foliageMaterial.vertexColors = true;
  const canopy = new T.InstancedMesh(geometry, foliageMaterial, items.length);
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

export function terrain(parent: T.Object3D, p: Palette, compact: boolean, daylight = { value: 0 }) {
  const group = new T.Group();
  group.name = "Floating islands and forest";
  parent.add(group);
  const rough = new T.MeshStandardMaterial({
    color: 0xffffff, vertexColors: true, side: T.DoubleSide, roughness: .98,
  });
  const crowns: Foliage[] = [];
  const groundRay = new T.Raycaster(new T.Vector3(), new T.Vector3(0, -1, 0));
  const rings: [Point, Point][] = [
    [[2.7, 1.02, 5.1], [2, 2.3, 2.25]],
    [[2.9, 4.12, .25], [2.3, 2.7, 2.1]],
    [[5.2, 6.11, -2], [2.4, 2.3, 1.75]],
    [[2.8, 7.32, -6.1], [2.4, 4.1, 3.8]],
    [[8.5, 8.65, -9], [2.3, 3.7, 3.1]],
  ];
  rings.forEach(([position, size], index) => rockShelf(group, rough, position, size, 61 + index * 17));
  DESTINATIONS.forEach((destination, index) => {
    const shelf = rockShelf(group, rough, destination.shelf, destination.size, 85 + index * 35);
    shelf.updateMatrixWorld();
    const [x, , z] = destination.shelf;
    const [rx, , rz] = destination.size;
    const rng = randomFor(180 + index);
    const trees = [[-.8,.08],[-.7,-.53],[.71,.37],[.73,-.4],[.42,-.75],[-.42,-.68],[.78,.62],[-.7,.62],
      [-.84,-.22],[.85,-.14],[-.26,-.83],[.49,.68],[.6,-.57]];
    trees.forEach(([dx, dz], i) => {
      const seat = shelfSurface(shelf, x + rx * dx, z + rz * dz, groundRay);
      tree(group, p, crowns, seat, .42 + rng() * .50, 200 + index * 37 + i, index === 2 && i < 3);
    });
    for (let i = 0; i < 15; i++) {
      const angle = i * 2.39996 + rng() * .23;
      const radius = .63 + rng() * .18;
      const bush = .20 + rng() * .20;
      const seat = shelfSurface(shelf, x + Math.cos(angle) * rx * radius, z + Math.sin(angle) * rz * radius, groundRay);
      crowns.push({
        center: new T.Vector3(seat[0], seat[1] + bush * .26, seat[2]),
        scale: new T.Vector3(bush * 1.4, bush * .56, bush),
        color: new T.Color(index === 2 && i % 4 === 1 ? 0x9d6792 : 0x436c42),
        rotation: angle,
      });
    }
  });

  for (const [i, [x, y, z, size]] of [
    [15, 8.45, -14, 1.08], [13.8, 6., -22, .68], [-9.0, 1.45, -2.5, .71],
    [17.4, 5.4, -28, .64], [-9.8, 3.2, -12, .58],
  ].entries()) {
    const shelf = rockShelf(group, rough, [x, y, z], [size, size * 1.28, size * .78], 119 + i);
    shelf.updateMatrixWorld();
    tree(group, p, crowns, shelfSurface(shelf, x, z, groundRay), size * .77, 258 + i);
  }
  plant(group, crowns, compact);
  return { group, rock: rough, ...waterfalls(group, compact, daylight) };
}
