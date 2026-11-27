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
  const curlBack = Math.sin(u * Math.PI) * (.22 * Math.sin(v * Math.PI) + .085 * Math.cos((v - .12) * Math.PI));
  return new T.Vector3(x, level + curl + curlBack, z);
}

function sheet(side: number, level: number, extra = 0, shaded = false) {
  const geometry = new T.PlaneGeometry(1, 1, 40, 14);
  geometry.rotateX(-Math.PI / 2);
  const position = geometry.getAttribute("position");
  const uv = geometry.getAttribute("uv");
  const colors: number[] = [];
  for (let i = 0; i < position.count; i++) {
    const u = side > 0 ? uv.getX(i) : 1 - uv.getX(i);
    const point = pagePoint(side, u, 1 - uv.getY(i), level, extra);
    position.setXYZ(i, point.x, point.y, point.z);
    if (shaded) {
      const spine = T.MathUtils.smoothstep(u, 0, .24);
      const rim = T.MathUtils.smoothstep(u, .86, 1);
      colors.push(.65 + .35 * spine - .15 * rim, .52 + .48 * spine - .19 * rim, .38 + .62 * spine - .23 * rim);
    }
  }
  if (shaded) geometry.setAttribute("color", new T.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function pageInk(detailed: boolean) {
  const canvas = document.createElement("canvas");
  const scale = detailed ? 2 : 1;
  canvas.width = 768 * scale;
  canvas.height = 512 * scale;
  const ink = canvas.getContext("2d")!;
  ink.scale(scale, scale);
  const rng = randomFor(41);
  const paper = ink.createLinearGradient(0, 0, 768, 0);
  paper.addColorStop(0, "#bd9865");
  paper.addColorStop(.09, "#eedbb5");
  paper.addColorStop(.36, "#f4e9d1");
  paper.addColorStop(.74, "#f4e9cf");
  paper.addColorStop(.91, "#eedbb5");
  paper.addColorStop(1, "#b99464");
  ink.fillStyle = paper;
  ink.fillRect(0, 0, 768, 512);
  for (const color of ["rgba(88,53,32,.11)", "rgba(255,247,220,.36)"]) {
    ink.fillStyle = color;
    for (let i = 0; i < 5200; i++) {
      ink.fillRect(rng() * 768, rng() * 512, .7 + rng() * 3.6, .34 + rng() * .6);
    }
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
  texture.anisotropy = detailed ? 8 : 4;
  return texture;
}

function pageEdges() {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 256;
  const ink = canvas.getContext("2d")!;
  const grain = randomFor(87);
  const base = ink.createLinearGradient(0, 0, 0, 256);
  base.addColorStop(0, "#ead5ab");
  base.addColorStop(.23, "#dbc297");
  base.addColorStop(.74, "#c6aa7b");
  base.addColorStop(1, "#94724d");
  ink.fillStyle = base;
  ink.fillRect(0, 0, 512, 256);
  for (let y = 4; y < 253; y += 4 + grain() * 3.8) {
    const rise = grain() * 3 - 1.5;
    ink.lineWidth = .65 + grain() * 1.2;
    ink.strokeStyle = grain() < .75 ? "rgba(80,48,22,.48)" : "rgba(255,241,203,.57)";
    ink.beginPath();
    ink.moveTo(0, y);
    ink.bezierCurveTo(158, y + rise, 370, y - rise * 1.7, 512, y + rise * .45);
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

export function book(parent: T.Object3D, p: Palette, detailed: boolean) {
  const group = new T.Group();
  group.name = "Open book";
  group.position.copy(base);
  parent.add(group);
  const ink = pageInk(detailed);
  const page = new T.MeshStandardMaterial({ color: 0xfff5dd, map: ink, roughness: .92, side: T.DoubleSide, vertexColors: true });
  const sheets = new T.MeshStandardMaterial({ map: pageEdges(), roughness: .94, side: T.DoubleSide });
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
    const pageTop = side === -1 ? .535 : .57;
    mesh(stack, sheet(side, pageTop, 0, true), page);
    for (const kind of ["front", "back", "outside"] as const) {
      mesh(stack, edge(side, kind, -.16, -.02, .46), cover);
      mesh(stack, edge(side, kind, -.006, .028, .4), trim);
      mesh(stack, edge(side, kind, .028, pageTop), sheets);
    }
    coverEmboss(stack, trim, side);
  }
  const pageGeometry = sheet(-1, .57, 0, true);
  const bentPage = pageGeometry.clone();
  const bentVertices = bentPage.getAttribute("position");
  const uv = bentPage.getAttribute("uv");
  for (let i = 0; i < bentVertices.count; i++) {
    const distanceFromHinge = 1 - uv.getX(i);
    const flex = Math.sin(distanceFromHinge * Math.PI * .71) *
      (1 + .18 * Math.sin(uv.getY(i) * Math.PI) + .17 * (uv.getY(i) - .5));
    bentVertices.setX(i, bentVertices.getX(i) + .46 * flex);
    bentVertices.setY(i, bentVertices.getY(i) + 1.22 * flex);
  }
  bentPage.computeVertexNormals();
  pageGeometry.morphAttributes.position = [bentVertices];
  pageGeometry.morphAttributes.normal = [bentPage.getAttribute("normal")];
  bentPage.dispose();
  const turningPage = mesh(leaf, pageGeometry, page);
  const binding = mesh(group, new T.CylinderGeometry(.16, .16, DEPTH + .37, 16), cover, [0, -.02, 0]);
  binding.rotation.x = Math.PI / 2;
  for (const z of [-2.78, -1.61, 1.61, 2.78]) {
    const band = mesh(group, new T.CylinderGeometry(.179, .179, .098, 16), cover, [0, -.02, z]);
    band.rotation.x = Math.PI / 2;
    for (const offset of [-.043, .043]) {
      mesh(group, new T.TorusGeometry(.174, .013, 6, 20), trim, [0, -.02, z + offset]);
    }
  }

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
      turningPage.morphTargetInfluences![0] = Math.sin(Math.PI * pageTurn) ** 2;
    },
  };
}
