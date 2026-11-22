import * as T from "three";
import { mesh, randomFor, type Palette } from "./primitives";

const WIDTH = 7.45;
const DEPTH = 5.55;
const base = new T.Vector3(-.8, -.52, 8.24);

function pagePoint(side: number, u: number, v: number, level: number, extra = 0) {
  const wave = Math.sin(v * Math.PI * 3.4 + side) * .052;
  const x = side * (.09 + (WIDTH + extra + wave) * u);
  const z = (v - .5) * (DEPTH + extra) + .23 * Math.sin(Math.PI * u);
  const curl = 1.36 * (1 - Math.exp(-u * 7.4)) * Math.pow(1 - u, 1.13) + .17 * u;
  const curlBack = .22 * Math.sin(v * Math.PI) * Math.sin(u * Math.PI);
  return new T.Vector3(x, level + curl + curlBack, z);
}

function sheet(side: number, level: number, extra = 0) {
  const geometry = new T.PlaneGeometry(1, 1, 40, 14);
  geometry.rotateX(-Math.PI / 2);
  const position = geometry.getAttribute("position");
  const uv = geometry.getAttribute("uv");
  for (let i = 0; i < position.count; i++) {
    const u = side > 0 ? uv.getX(i) : 1 - uv.getX(i);
    const point = pagePoint(side, u, 1 - uv.getY(i), level, extra);
    position.setXYZ(i, point.x, point.y, point.z);
  }
  geometry.computeVertexNormals();
  return geometry;
}

function pageInk() {
  const canvas = document.createElement("canvas");
  canvas.width = 768;
  canvas.height = 512;
  const ink = canvas.getContext("2d")!;
  const rng = randomFor(41);
  const paper = ink.createLinearGradient(0, 0, 768, 0);
  paper.addColorStop(0, "#94704c");
  paper.addColorStop(.07, "#d9b982");
  paper.addColorStop(.37, "#e5cda0");
  paper.addColorStop(.78, "#e9d2a9");
  paper.addColorStop(1, "#b89460");
  ink.fillStyle = paper;
  ink.fillRect(0, 0, 768, 512);
  for (let i = 0; i < 28_000; i++) {
    ink.fillStyle = i % 2 ? "rgba(88,53,32,.075)" : "rgba(250,223,163,.12)";
    ink.fillRect(rng() * 767, rng() * 511, 1 + rng() * 2, 1);
  }
  ink.strokeStyle = "#a2875e";
  ink.lineWidth = 1.5;
  ink.strokeRect(90, 52, 570, 411);
  ink.strokeRect(98, 60, 554, 395);
  ink.fillStyle = "#9e8058";
  for (const x of [120, 391]) {
    for (let i = 0; i < 19; i++) {
      const y = 125 + i * 15;
      const stop = x + (i % 5 === 4 ? 180 : 236);
      for (let cursor = x; cursor < stop; cursor += 9 + rng() * 16) {
        ink.fillRect(cursor, y, 5 + rng() * 12, .65 + rng() * 1.15);
      }
    }
  }
  ink.fillStyle = "#7f5d39";
  ink.font = "21px Georgia";
  ink.textAlign = "center";
  ink.fillText("Atlas of Knowledge", 384, 96);
  for (const x of [93, 657]) for (const y of [55, 460]) {
    ink.beginPath();
    ink.arc(x, y, 6, 0, Math.PI * 2);
    ink.stroke();
  }
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function edge(side: number, type: "front" | "back" | "outside", low: number, high: number, extra = 0) {
  const geometry = new T.PlaneGeometry(1, 1, 48, 1);
  const position = geometry.getAttribute("position");
  const uv = geometry.getAttribute("uv");
  for (let i = 0; i < position.count; i++) {
    const t = uv.getX(i);
    const level = low + (high - low) * uv.getY(i);
    const point = pagePoint(side, type === "outside" ? 1 : t, type === "outside" ? t : Number(type === "front"), level, extra);
    position.setXYZ(i, point.x, point.y, point.z);
  }
  geometry.computeVertexNormals();
  return geometry;
}

function coverEmboss(stack: T.Group, trim: T.Material, side: number) {
  const trace = (points: T.Vector3[], thickness: number) => mesh(stack,
    new T.TubeGeometry(new T.CatmullRomCurve3(points), points.length * 3, thickness, 5, false), trim);
  for (const inset of [0, .028]) {
    const sides = [[.10 + inset,.09 + inset],[.91 - inset,.09 + inset],[.91 - inset,.91 - inset],[.10 + inset,.91 - inset]];
    for (let i = 0; i < sides.length; i++) {
      const [u, v] = sides[i], [endU, endV] = sides[(i + 1) % sides.length];
      trace(Array.from({length: 21}, (_, j) => pagePoint(side, T.MathUtils.lerp(u,endU,j/20),
        T.MathUtils.lerp(v,endV,j/20), -.177, .42)), .013);
    }
  }
  for (const radius of [.116, .135]) {
    trace(Array.from({length: 49}, (_, i) => {
      const angle = i * Math.PI / 24;
      return pagePoint(side, .52 + Math.cos(angle) * radius * .72, .5 + Math.sin(angle) * radius, -.177, .42);
    }), .017);
  }
  trace(Array.from({length: 9}, (_, i) => {
    const angle = i * Math.PI / 4, radius = i % 2 ? .033 : .18;
    return pagePoint(side, .52 + Math.cos(angle) * radius * .68, .5 + Math.sin(angle) * radius, -.186, .42);
  }), .019);
}

export function book(parent: T.Object3D, p: Palette) {
  const group = new T.Group();
  group.name = "Open book";
  group.position.copy(base);
  parent.add(group);
  const ink = pageInk();
  const page = new T.MeshStandardMaterial({ color: 0xf4e7d1, map: ink, roughness: .92, side: T.DoubleSide });
  const sheets = [0xb19266, 0xc7a673, 0xa18258, 0xd0b383, 0x806340].map((color) =>
    new T.MeshStandardMaterial({ color, roughness: .94, side: T.DoubleSide }));
  const cover = p.binding.clone();
  cover.side = T.DoubleSide;
  const trim = p.gold.clone();
  trim.side = T.DoubleSide;

  const leftHinge = new T.Group();
  group.add(leftHinge);
  const left = new T.Group(), right = new T.Group(), leaf = new T.Group();
  leftHinge.add(left);
  group.add(right, leaf);
  for (const [side, stack] of [[-1, left], [1, right]] as const) {
    mesh(stack, sheet(side, -.15, .46), cover);
    mesh(stack, sheet(side, -.045, .44), cover);
    mesh(stack, sheet(side, side === -1 ? .535 : .57), page);
    for (const kind of ["front", "back", "outside"] as const) {
      mesh(stack, edge(side, kind, -.16, -.02, .46), cover);
      mesh(stack, edge(side, kind, -.006, .028, .4), trim);
      for (let layer = 0; layer < 35; layer++) {
        const current = .028 + .0155 * layer;
        mesh(stack, edge(side, kind, current, current + .0165, .015 * Math.sin(layer * 2.4)), sheets[layer % sheets.length]);
      }
    }
    coverEmboss(stack, trim, side);
  }
  mesh(leaf, sheet(-1, .57), page);
  const binding = mesh(group, new T.CylinderGeometry(.16, .16, DEPTH + .37, 16), cover, [0, -.02, 0]);
  binding.rotation.x = Math.PI / 2;
  for (const z of [-2.78, -1.61, 1.61, 2.78]) mesh(group, new T.TorusGeometry(.164, .027, 7, 24), trim, [0, -.02, z]);

  return {
    group,
    batches: [left, right, leaf],
    cover,
    unfold(progress: number, pageTurn: number) {
      leftHinge.rotation.z = -Math.PI * (1 - progress);
      leftHinge.position.y = .68 * (1 - progress);
      left.scale.y = T.MathUtils.lerp(.24, 1, progress);
      right.scale.y = T.MathUtils.lerp(.32, 1, progress);
      leaf.rotation.z = -Math.PI * (1 - pageTurn);
      leaf.position.y = .74 * (1 - pageTurn);
      leaf.scale.y = T.MathUtils.lerp(.24, 1, pageTurn);
      leaf.visible = pageTurn > .04 || progress === 1;
    },
  };
}
