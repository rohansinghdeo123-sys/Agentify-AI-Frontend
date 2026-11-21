import * as T from "three";
import { mesh, randomFor, type Palette } from "./primitives";

const WIDTH = 10.4;
const DEPTH = 5.9;
const base = new T.Vector3(-.8, -.48, 8.25);

function pagePoint(side: number, u: number, v: number, level: number, extra = 0) {
  const x = side * (.09 + (WIDTH + extra) * u);
  const z = (v - .5) * (DEPTH + extra) + .20 * Math.sin(Math.PI * u);
  const curl = 1.59 * (1 - Math.exp(-u * 6.1)) * Math.pow(1 - u, .9) + .19 * u;
  const curlBack = .18 * Math.sin(v * Math.PI) * Math.sin(u * Math.PI);
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
  paper.addColorStop(0, "#cbb181");
  paper.addColorStop(.11, "#faedca");
  paper.addColorStop(.52, "#fff4d8");
  paper.addColorStop(1, "#e3cda4");
  ink.fillStyle = paper;
  ink.fillRect(0, 0, 768, 512);
  ink.fillStyle = "rgba(100,76,43,.06)";
  for (let i = 0; i < 5200; i++) ink.fillRect(rng() * 767, rng() * 511, 1 + rng() * 2, 1);
  ink.strokeStyle = "#a2875e";
  ink.lineWidth = 1.5;
  ink.strokeRect(90, 52, 570, 411);
  ink.strokeRect(98, 60, 554, 395);
  ink.fillStyle = "#9e8058";
  for (const x of [120, 391]) {
    for (let i = 0; i < 19; i++) {
      const y = 99 + i * 17;
      const stop = x + (i % 5 === 4 ? 180 : 236);
      for (let cursor = x; cursor < stop; cursor += 9 + rng() * 16) {
        ink.fillRect(cursor, y, 5 + rng() * 12, .65 + rng() * 1.15);
      }
    }
  }
  ink.fillStyle = "#95754c";
  ink.fillRect(310, 74, 132, 2);
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

export function book(parent: T.Object3D, p: Palette) {
  const group = new T.Group();
  group.name = "Open book";
  group.position.copy(base);
  parent.add(group);
  const page = new T.MeshStandardMaterial({ map: pageInk(), roughness: .90, side: T.DoubleSide });
  const sheets = [p.parchment, p.paper, p.bronze, p.parchment].map((material) => {
    const copy = material.clone();
    copy.side = T.DoubleSide;
    return copy;
  });
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
      for (let layer = 0; layer < 25; layer++) {
        const current = .035 + .0214 * layer;
        mesh(stack, edge(side, kind, current, current + .022), sheets[layer % sheets.length]);
      }
    }
  }
  mesh(leaf, sheet(-1, .57), page);
  const crest = new T.Mesh(new T.TorusGeometry(.86, .037, 5, 44), trim);
  crest.position.set(-5.2, -.18 + 1.07, 0);
  crest.rotation.x = Math.PI / 2;
  left.add(crest);

  return {
    group,
    batches: [left, right, leaf],
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
