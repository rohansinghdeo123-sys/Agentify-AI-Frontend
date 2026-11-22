import * as T from "three";
import { ROUTE } from "./layout";
import { box, column, mesh, rod, type Palette } from "./primitives";

const trailVertex = `
  varying vec2 ribbonUv;
  void main() {
    ribbonUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
  }
`;

const trailFragment = `
  uniform float progress;
  varying vec2 ribbonUv;
  void main() {
    float along = ribbonUv.y / 13.;
    float edge = abs(ribbonUv.x * 2. - 1.);
    float traveled = 1. - smoothstep(progress - .012, progress + .009, along);
    float distanceToHead = (along - progress) * 50.;
    float head = exp(-distanceToHead * distanceToHead);
    float pulse = smoothstep(0., .04, progress) * (1. - smoothstep(.94, 1., progress));
    float center = 1. - smoothstep(.08, .29, edge);
    float halo = (1. - smoothstep(.12, 1., edge)) * head * pulse;
    gl_FragColor = vec4(mix(vec3(.91, .51, .13), vec3(1., .86, .49), center), .49 * traveled * center + .80 * halo);
    #include <colorspace_fragment>
  }
`;

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
      uvs.push(side === left ? 0 : 1, t * 13);
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
    point.addScaledVector(new T.Vector3(-direction.z, 0, direction.x).normalize(), side * .70);
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
  paving.color.set(0xc3a676);
  paving.emissive.set(0xe3d4a7);
  paving.emissiveIntensity = .23;
  paving.roughness = .65;
  paving.side = T.DoubleSide;
  mesh(group, ribbon(curve, -.76, .76, .023), paving);
  const lightProgress = { value: 0 };
  const trail = mesh(group, ribbon(curve, -.28, .28, .040), new T.ShaderMaterial({
    vertexShader: trailVertex, fragmentShader: trailFragment,
    uniforms: { progress: lightProgress },
    transparent: true, depthWrite: false, side: T.DoubleSide, blending: T.AdditiveBlending,
  }));
  const spark = mesh(group, new T.OctahedronGeometry(.115), p.lamp);
  trail.visible = spark.visible = false;
  const under = p.bronze.clone();
  under.side = T.DoubleSide;
  mesh(group, ribbon(curve, -.79, .79, -.18), under);
  const limestone = p.stone.clone();
  limestone.color.set(0xb39367);
  limestone.side = T.DoubleSide;
  for (const [start, end, height] of [[.19, .44, 1.28], [.52, .75, 1.26], [.77, .96, 1.1]]) {
    for (const side of [-1, 1]) mesh(group, masonry(curve, side, start, end, height), limestone);
    for (let span = 0; span <= 4; span++) {
      const fraction = T.MathUtils.lerp(start, end, span / 4);
      const point = curve.getPointAt(fraction);
      const direction = curve.getTangentAt(fraction);
      const across = new T.Vector3(-direction.z, 0, direction.x).normalize();
      for (const side of [-1, 1]) {
        const edge = point.clone().addScaledVector(across, .62 * side);
        column(group, limestone, .131, .17, height, [edge.x, point.y - height * .5, edge.z], 8);
        column(group, p.bronze, .184, .184, .07, [edge.x, point.y - .28, edge.z], 8);
      }
    }
  }
  for (const side of [-1, 1]) {
    const structure = edgeCurve(curve, side * .762, -.095);
    const illumination = edgeCurve(curve, side * .725, .035);
    mesh(group, new T.TubeGeometry(structure, 160, .091, 7, false), p.bronze);
    mesh(group, new T.TubeGeometry(illumination, 160, .030, 7, false), p.gold);
    const rail = edgeCurve(curve, side * .72, .252);
    mesh(group, new T.TubeGeometry(rail, 160, .027, 6, false), p.gold);
    for (let i = 3; i <= 42; i++) {
      const t = i / 43;
      const point = curve.getPointAt(t);
      const direction = curve.getTangentAt(t);
      point.addScaledVector(new T.Vector3(-direction.z, 0, direction.x).normalize(), side * .72);
      column(group, p.gold, .023, .038, .25, [point.x, point.y + .128, point.z], 8);
      column(group, p.bronze, .045, .057, .047, [point.x, point.y + .041, point.z], 8);
      if (i % 6 === 0) {
        mesh(group, new T.OctahedronGeometry(.052), p.lamp, [point.x, point.y + .276, point.z]);
      }
    }
  }

  for (let i = 2; i < 59; i++) {
    const progress = i / 59;
    const point = curve.getPointAt(progress);
    const tangent = curve.getTangentAt(progress);
    box(group, under, [1.39, .007, .012], [point.x, point.y + .027, point.z]).rotation.y = Math.atan2(tangent.x, tangent.z);
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
    paving,
    lightRoute(progress: number) {
      trail.visible = progress > 0;
      spark.visible = progress > 0 && progress < 1;
      lightProgress.value = progress;
      if (spark.visible) {
        curve.getPointAt(progress, spark.position).y += .17;
        spark.scale.setScalar(T.MathUtils.smoothstep(progress, 0, .06) * (1 - T.MathUtils.smoothstep(progress, .93, 1)));
      }
    },
  };
}
