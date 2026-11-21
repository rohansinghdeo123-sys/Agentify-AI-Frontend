import * as T from "three";
import { ROUTE } from "./layout";
import { box, column, mesh, rod, type Palette } from "./primitives";

function ribbon(curve: T.CatmullRomCurve3, left: number, right: number, offset: number) {
  const positions: number[] = [];
  const uvs: number[] = [];
  const faces: number[] = [];
  for (let i = 0; i <= 164; i++) {
    const t = i / 164;
    const center = curve.getPointAt(t);
    const tangent = curve.getTangentAt(t);
    const across = new T.Vector3(-tangent.z, 0, tangent.x).normalize();
    for (const side of [left, right]) {
      const edge = center.clone().addScaledVector(across, side);
      positions.push(edge.x, edge.y + offset, edge.z);
      uvs.push(side === left ? 0 : 1, t * 18);
    }
    if (i) {
      const k = i * 2;
      faces.push(k - 2, k - 1, k, k - 1, k + 1, k);
    }
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new T.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(faces);
  geometry.computeVertexNormals();
  return geometry;
}

function edgeCurve(curve: T.CatmullRomCurve3, width: number, offset: number) {
  const vertices = Array.from({ length: 105 }, (_, i) => {
    const t = i / 104, center = curve.getPointAt(t), tangent = curve.getTangentAt(t);
    const across = new T.Vector3(-tangent.z, 0, tangent.x).normalize();
    center.y += offset;
    return center.addScaledVector(across, width);
  });
  return new T.CatmullRomCurve3(vertices);
}

function masonry(curve: T.CatmullRomCurve3, side: number, start: number, end: number, height: number) {
  const positions: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i <= 96; i++) {
    const t = i / 96;
    const fraction = T.MathUtils.lerp(start, end, t);
    const point = curve.getPointAt(fraction);
    const direction = curve.getTangentAt(fraction);
    point.addScaledVector(new T.Vector3(-direction.z, 0, direction.x).normalize(), side * .58);
    const arch = Math.pow(Math.abs(Math.sin(t * Math.PI * 4)), .55);
    positions.push(point.x, point.y - .075, point.z, point.x, point.y - height + (height - .24) * arch, point.z);
    if (i) {
      const k = i * 2;
      indices.push(k - 2, k, k - 1, k - 1, k, k + 1);
    }
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export function pathway(parent: T.Object3D, p: Palette) {
  const group = new T.Group();
  group.name = "Continuous golden causeway";
  parent.add(group);
  const curve = new T.CatmullRomCurve3(ROUTE.map((point) => new T.Vector3(...point)));
  const paving = p.parchment.clone();
  paving.color.set(0xeac186);
  paving.emissive.set(0xe8a240);
  paving.emissiveIntensity = .32;
  paving.roughness = .49;
  paving.side = T.DoubleSide;
  mesh(group, ribbon(curve, -.64, .64, .023), paving);
  const trailGeometry = ribbon(curve, -.079, .079, .039);
  const trail = mesh(group, trailGeometry, new T.MeshBasicMaterial({ color: 0xffdf93, side: T.DoubleSide }));
  const spark = mesh(group, new T.OctahedronGeometry(.115), p.lamp);
  trail.visible = spark.visible = false;
  const under = p.bronze.clone();
  under.side = T.DoubleSide;
  mesh(group, ribbon(curve, -.68, .68, -.15), under);
  const limestone = p.stone.clone();
  limestone.color.set(0xaa8355);
  limestone.side = T.DoubleSide;
  for (const [start, end, height] of [[.19, .44, 1.28], [.52, .75, 1.26], [.77, .96, 1.1]]) {
    for (const side of [-1, 1]) mesh(group, masonry(curve, side, start, end, height), limestone);
    for (let span = 0; span <= 4; span++) {
      const fraction = T.MathUtils.lerp(start, end, span / 4);
      const point = curve.getPointAt(fraction);
      const direction = curve.getTangentAt(fraction);
      const across = new T.Vector3(-direction.z, 0, direction.x).normalize();
      for (const side of [-1, 1]) {
        const edge = point.clone().addScaledVector(across, .51 * side);
        column(group, limestone, .131, .17, height, [edge.x, point.y - height * .5, edge.z], 8);
        column(group, p.bronze, .184, .184, .07, [edge.x, point.y - .28, edge.z], 8);
      }
    }
  }
  for (const side of [-1, 1]) {
    const structure = edgeCurve(curve, side * .658, -.058);
    const illumination = edgeCurve(curve, side * .622, .043);
    mesh(group, new T.TubeGeometry(structure, 160, .097, 7, false), p.bronze);
    mesh(group, new T.TubeGeometry(illumination, 160, .031, 7, false), p.goldLight);
    const rail = edgeCurve(curve, side * .621, .221);
    mesh(group, new T.TubeGeometry(rail, 160, .027, 6, false), p.gold);
    for (let i = 3; i <= 42; i++) {
      const t = i / 43;
      const point = curve.getPointAt(t);
      const direction = curve.getTangentAt(t);
      point.addScaledVector(new T.Vector3(-direction.z, 0, direction.x).normalize(), side * .621);
      column(group, p.gold, .025, .036, .21, [point.x, point.y + .12, point.z], 6);
      if (i % 6 === 0) {
        mesh(group, new T.OctahedronGeometry(.052), p.lamp, [point.x, point.y + .276, point.z]);
      }
    }
  }

  for (let i = 2; i < 59; i++) {
    const progress = i / 59;
    const point = curve.getPointAt(progress);
    const tangent = curve.getTangentAt(progress);
    box(group, under, [1.18, .007, .016], [point.x, point.y + .027, point.z]).rotation.y = Math.atan2(tangent.x, tangent.z);
  }

  // Short landings meet each set of entrance stairs.
  for (const [from, to] of [
    [[3.04, 1.85, 5.93], [5.78, 1.64, 6.49]],
    [[-.98, 4.62, 1.00], [-1.17, 4.43, 1.89]],
    [[7.51, 6.76, -2.35], [8.49, 6.89, -2.86]],
  ] as [[number, number, number], [number, number, number]][]) {
    const start = new T.Vector3(...from), end = new T.Vector3(...to);
    const direction = end.clone().sub(start);
    const middle = start.clone().add(end).multiplyScalar(.5);
    const landing = box(group, paving, [1.09, .15, direction.length()], middle.toArray());
    landing.rotation.y = Math.atan2(direction.x, direction.z);
    const across = new T.Vector3(direction.z, 0, -direction.x).normalize().multiplyScalar(.53);
    for (const side of [-1, 1]) rod(group, p.goldLight, start.clone().addScaledVector(across, side).add(new T.Vector3(0, .075, 0)),
      end.clone().addScaledVector(across, side).add(new T.Vector3(0, .075, 0)), .026);
  }
  return {
    group,
    lightRoute(progress: number) {
      trail.visible = progress > 0;
      spark.visible = progress > 0 && progress < 1;
      trailGeometry.setDrawRange(0, Math.round(164 * progress) * 6);
      curve.getPointAt(progress, spark.position).y += .21;
    },
  };
}
