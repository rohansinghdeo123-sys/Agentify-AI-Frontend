import * as T from "three";
import { DESTINATIONS, type Destination, type Point } from "./layout";
import { box, column, emissive, material, mesh, randomFor, ring, rod, star, type Palette } from "./primitives";

function floor(group: T.Object3D, p: Palette, width: number, depth: number) {
  for (let level = 0; level < 3; level++) {
    box(group, level === 1 ? p.bronze : p.stone,
      [width - level * .17, .12, depth - level * .12], [0, .085 + level * .11, 0]);
  }
}

function pillar(group: T.Object3D, p: Palette, x: number, z: number, height: number, y = .28, inlay = p.shadowStone) {
  box(group, p.stone, [.48, .1, .48], [x, y + .05, z]);
  column(group, p.gold, .175, .21, .07, [x, y + .13, z], 8);
  column(group, p.stone, .13, .168, height - .31, [x, y + height * .5, z], 12);
  for (let i = 0; i < 6; i++) {
    const angle = i * Math.PI / 3;
    column(group, i === 1 || i === 2 ? inlay : p.shadowStone, .014, .014, height * .68,
      [x + Math.cos(angle) * .142, y + height * .50, z + Math.sin(angle) * .142], 4);
  }
  column(group, p.gold, .207, .143, .12, [x, y + height - .15, z], 8);
  box(group, p.stone, [.45, .11, .45], [x, y + height - .045, z]);
}

function arch(group: T.Object3D, material: T.Material, radius: number, thick: number, lift: number, depth: number, point: Point) {
  const outer = radius + thick;
  const shape = new T.Shape()
    .moveTo(-outer, -lift).lineTo(-outer, 0)
    .absarc(0, 0, outer, Math.PI, 0, true).lineTo(outer, -lift)
    .lineTo(radius, -lift).lineTo(radius, 0)
    .absarc(0, 0, radius, 0, Math.PI, false).lineTo(-radius, -lift).closePath();
  return mesh(group, new T.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 22 }), material, point);
}

function lantern(group: T.Object3D, p: Palette, point: Point, size = 1) {
  const [x, y, z] = point;
  column(group, p.bronze, .043 * size, .068 * size, .44 * size, [x, y + .22 * size, z], 8);
  box(group, p.gold, [.142 * size, .045 * size, .142 * size], [x, y + .45 * size, z]);
  mesh(group, new T.CylinderGeometry(.073 * size, .065 * size, .18 * size, 6), p.lamp, [x, y + .565 * size, z]);
  column(group, p.gold, .006, .118 * size, .11 * size, [x, y + .709 * size, z], 6);
}

function banner(group: T.Object3D, p: Palette, point: Point, width: number, height: number) {
  const [x, y, z] = point;
  const shape = new T.Shape().moveTo(-width / 2, 0).lineTo(width / 2, 0)
    .lineTo(width / 2, -height * .82).lineTo(0, -height).lineTo(-width / 2, -height * .82).closePath();
  mesh(group, new T.ExtrudeGeometry(shape, { depth: .025, bevelEnabled: false }), p.gold, point);
  const cloth = mesh(group, new T.ExtrudeGeometry(shape, { depth: .027, bevelEnabled: false }), p.emerald, [x, y - .018, z + .022]);
  cloth.scale.set(.85, .96, 1);
  box(group, p.gold, [width * 1.25, .045, .068], [x, y + .015, z + .05]);
  star(group, new T.MeshBasicMaterial({ color: 0xe6be6e, side: T.DoubleSide, vertexColors: true }), width * .15, [x, y - height * .37, z + .057]);
}

const portalVertex = `
  varying vec2 vUv;
  void main() {
    vUv=uv;
    gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);
  }
`;

const portalFragment = `
  varying vec2 vUv;
  uniform vec3 accent;
  uniform float energy;
  uniform float phase;
  void main() {
    vec2 d=(vUv-.5)*2.;
    float radius=length(d);
    float a=atan(d.y, d.x);
    float glow=pow(clamp(radius,0.,1.), 5.);
    float ribbon=pow(.5+.5*sin(5.*a+9.*radius-phase), 4.);
    float rim=smoothstep(.60, .97, radius);
    float litEdge=exp(-pow((radius-.87)*19., 2.));
    vec3 center=mix(vec3(.013,.052,.058),accent*.12,.40);
    vec3 color=mix(center,accent,rim*(.70+.22*energy)+glow*.13*ribbon);
    vec3 edgeColor=mix(accent, vec3(1., .96, .88), .38);
    color=mix(color,edgeColor,litEdge*(.58+.24*energy));
    gl_FragColor=sRGBTransferEOTF(vec4(color,1.));
    #include <colorspace_fragment>
  }
`;

const haloFragment = `
  varying vec2 vUv;
  uniform vec3 accent;
  uniform float energy;
  uniform float daylight;
  void main() {
    float radius = length(vUv - .5) * 2.;
    float spill = exp(-pow((radius - .58) * 6., 2.)) * (1. - smoothstep(.72, 1., radius));
    gl_FragColor = sRGBTransferEOTF(vec4(accent,spill * (.30 + energy * .30 - daylight * .06)));
    #include <colorspace_fragment>
  }
`;

function entranceLighting(id: Destination, lightColor: number) {
  const color = new T.Color(lightColor);
  const uniforms = {
    accent: { value: color.clone().convertLinearToSRGB() },
    energy: { value: 0 },
    daylight: { value: 0 },
    phase: { value: 0 },
  };
  const pools: { material: T.MeshStandardMaterial; night: number; day: number; response: number }[] = [];
  function lightSurface(material: T.MeshStandardMaterial, night: number, day: number, response: number) {
    pools.push({ material, night, day, response });
    return material;
  }
  const inlay = lightSurface(emissive(0xb59a75, lightColor, .29), .57, .40, .85);
  inlay.color.lerp(color, .4);
  const emblem = lightSurface(emissive(lightColor, lightColor, .83), 1.08, .9, .64);
  emblem.color.lerp(new T.Color(0xfff6e3), .39);
  return {
    lightColor,
    uniforms,
    inlay,
    emblem,
    lightSurface,
    setLighting(energy: number, time: number, daylight: boolean) {
      uniforms.energy.value = energy;
      uniforms.daylight.value = Number(daylight);
      uniforms.phase.value = time * (id === "revision" ? 1.8 : .78);
      for (const { material, night, day, response } of pools) {
        material.emissiveIntensity = (daylight ? day : night) + response * energy;
      }
    },
  };
}

type EntranceLighting = ReturnType<typeof entranceLighting>;

function glyph(group: T.Object3D, line: T.MeshStandardMaterial, id: Destination) {
  const trace = (points: Point[], radius = .021) => {
    const vectors = points.map((point) => new T.Vector3(...point));
    for (let i = 1; i < vectors.length; i++) rod(group, line, vectors[i - 1], vectors[i], radius);
  };
  if (id === "planning") {
    trace([[-.23,.28,0],[-.31,.28,0],[-.31,-.32,0],[.30,-.32,0],[.30,.28,0],[.20,.28,0]], .027);
    trace([[-.14,.30,0],[-.14,.40,0],[.14,.40,0],[.14,.25,0],[-.14,.25,0],[-.14,.30,0]]);
    for (const y of [.06,-.09,-.22]) {
      trace([[-.20,y,0],[-.15,y-.041,0],[-.105,y+.03,0]]);
      trace([[.015,y,0],[.195,y,0]]);
    }
  } else if (id === "study") {
    for (const side of [-1, 1]) {
      trace([[0,-.28,0],[side*.16,-.16,0],[side*.39,-.18,0],[side*.39,.24,0],[side*.18,.26,0],[0,.16,0],[0,-.28,0]], .027);
      for (const y of [.12,.019,-.082]) trace([[side*.08,y,0],[side*.20,y+.042,0],[side*.31,y+.03,0]]);
    }
  } else if (id === "revision") {
    const folds: Point[][] = [
      [[.07,-.36,0],[.205,-.34,0],[.19,-.26,0],[.37,-.15,0],[.402,.005,0],[.305,.15,0],
        [.255,.27,0],[.09,.30,0],[-.05,.34,0],[-.165,.283,0],[-.29,.245,0],[-.38,.12,0],
        [-.396,-.016,0],[-.33,-.16,0],[-.20,-.195,0],[-.075,-.164,0],[.025,-.24,0],[.07,-.36,0]],
      [[-.31,.13,0],[-.19,.132,0],[-.144,.063,0],[-.199,-.034,0],[-.318,-.04,0]],
      [[-.145,.27,0],[-.085,.173,0],[.046,.143,0],[.115,.054,0],[.075,-.007,0],[-.043,.035,0]],
      [[.275,.209,0],[.213,.144,0],[.216,.055,0],[.292,.01,0],[.386,.027,0]],
      [[-.138,-.158,0],[-.095,-.07,0],[.042,-.089,0],[.146,-.173,0],[.253,-.124,0],[.27,-.055,0]],
    ];
    for (const fold of folds) {
      const shape = new T.CatmullRomCurve3(fold.map((point) => new T.Vector3(...point)));
      mesh(group, new T.TubeGeometry(shape, fold.length * 3, .018, 5, false), line);
    }
  } else {
    const cup = new T.LatheGeometry([
      new T.Vector2(.18,-.3), new T.Vector2(.18,-.245), new T.Vector2(.065,-.225),
      new T.Vector2(.065,-.07), new T.Vector2(.12,-.035), new T.Vector2(.21,.09),
      new T.Vector2(.253,.24), new T.Vector2(.218,.24), new T.Vector2(.165,.095), new T.Vector2(0,-.076),
    ], 24);
    mesh(group, cup, line, [0, 0, -.014]);
    ring(group, line, .14, .021, [-.245, .095, -.025]);
    ring(group, line, .14, .021, [.245, .095, -.025]);
  }
}

function portal(group: T.Object3D, p: Palette, id: Destination, point: Point, lighting: EntranceLighting, scale = 1) {
  const frame = new T.Group();
  frame.position.set(...point);
  frame.scale.setScalar(scale);
  frame.name = id + " portal";
  group.add(frame);
  const { uniforms, inlay, emblem } = lighting;
  mesh(frame, new T.PlaneGeometry(2.80, 2.80), new T.ShaderMaterial({
    vertexShader: portalVertex, fragmentShader: haloFragment, uniforms,
    transparent: true, depthWrite: false, blending: T.AdditiveBlending,
  }), [0,0,.047]);
  mesh(frame, new T.CircleGeometry(.79, 64), new T.ShaderMaterial({
    vertexShader: portalVertex, fragmentShader: portalFragment,
    uniforms,
    side: T.DoubleSide,
  }));
  ring(frame, p.bronze, .84, .091, [0, 0, .017]);
  ring(frame, p.gold, .825, .047, [0, 0, .073]);
  ring(frame, emblem, .784, .029, [0, 0, .05]);
  for (let i = 0; i < 16; i++) {
    const angle = i * Math.PI * 2 / 16;
    mesh(frame, new T.OctahedronGeometry(.032), inlay, [Math.cos(angle) * .875, Math.sin(angle) * .875, .062]);
  }
  const icon = new T.Group();
  icon.position.z = .101;
  icon.scale.setScalar(id === "exam" ? 1.48 : 1.34);
  frame.add(icon);
  glyph(icon, emblem, id);
}

function dome(group: T.Object3D, p: Palette, origin: Point, size: number, roof: T.Material, ribs = 10) {
  const [x, y, z] = origin;
  const shell = mesh(group, new T.SphereGeometry(size, 36, 15, 0, Math.PI * 2, 0, Math.PI / 2), roof, origin);
  shell.scale.y = .77;
  const skirt = ring(group, p.gold, size, .034, origin);
  skirt.rotation.x = Math.PI / 2;
  for (let i = 0; i < ribs; i++) {
    const angle = Math.PI * 2 * i / ribs;
    const points = Array.from({ length: 11 }, (_, j) => {
      const polar = Math.PI / 2 * j / 10;
      return new T.Vector3(x + Math.cos(angle) * Math.sin(polar) * size,
        y + .78 * Math.cos(polar) * size, z + Math.sin(angle) * Math.sin(polar) * size);
    });
    mesh(group, new T.TubeGeometry(new T.CatmullRomCurve3(points), 14, .015, 4, false), p.gold);
  }
  column(group, p.gold, .014, .10, .21, [x, y + size * .77 + .1, z], 8);
  mesh(group, new T.OctahedronGeometry(.085), p.goldLight, [x, y + size * .77 + .27, z]).scale.y = 1.6;
}

function stairs(group: T.Object3D, p: Palette, x: number, z: number, width: number, inlay: T.Material) {
  for (let i = 0; i < 4; i++) {
    box(group, p.stone, [width, .09 + i * .12, 1.03 - i * .23], [x, .045 + i * .05, z - i * .104]);
    box(group, inlay, [width, .018, .025], [x, .095 + i * .108, z + .5 - i * .217]);
  }
}

function glazedBay(group: T.Object3D, p: Palette, light: T.Material, point: Point, radius: number, lift: number, angle: number) {
  const glazing = new T.Shape()
    .moveTo(-radius, -lift).lineTo(radius, -lift).lineTo(radius, 0)
    .absarc(0, 0, radius, 0, Math.PI, false).lineTo(-radius, -lift).closePath();
  mesh(group, new T.ShapeGeometry(glazing, 10), light, point).rotation.y = angle;
  const [x, y, z] = point;
  box(group, p.bronze, [.024, lift + radius, .018],
    [x + Math.sin(angle) * .009, y + (radius - lift) * .5, z + Math.cos(angle) * .009]).rotation.y = angle;
}

function clerestory(group: T.Object3D, p: Palette, origin: Point, radius: number, height: number, windows: number, light: T.Material) {
  const [x,y,z] = origin;
  column(group, p.shadowStone, radius * .92, radius * .96, height, origin, 32);
  for (const edge of [-1, 1]) {
    column(group, p.stone, radius * 1.02, radius * 1.02, .14, [x,y + edge * height * .52,z], 32);
    ring(group, p.gold, radius * 1.027, .019, [x,y + edge * height * .56,z]).rotation.x = Math.PI / 2;
  }
  for (let i = 0; i < windows; i++) {
    const a = i * Math.PI * 2 / windows;
    const at: Point = [x + Math.sin(a) * radius * .945, y + height * .09, z + Math.cos(a) * radius * .945];
    const w = radius * Math.PI / windows * .65;
    glazedBay(group, p, light, [at[0] + Math.sin(a) * .015, at[1], at[2] + Math.cos(a) * .015], w, height * .257, a);
    arch(group, p.stone, w, .047, height * .26, .083, at).rotation.y = a;
    arch(group, p.gold, w + .03, .012, height * .27, .091, at).rotation.y = a;
  }
}

function planning(group: T.Object3D, p: Palette, lighting: EntranceLighting) {
  floor(group, p, 4.55, 3.28);
  stairs(group, p, 0, 1.52, 1.92, lighting.inlay);
  for (const x of [-1.37, 1.37]) for (const z of [-.68, .76]) pillar(group, p, x, z, 2.01);
  for (const x of [-1.37, 1.37]) box(group, p.stone, [.56, .24, 2.01], [x, 2.351, .02]);
  arch(group, p.stone, .96, .195, 1.12, .31, [0, 1.44, .37]);
  arch(group, p.gold, .995, .044, 1.04, .045, [0, 1.44, .693]);
  portal(group, p, "planning", [0, 1.39, .72], lighting);
  column(group, p.shadowStone, 1.07, 1.32, .34, [0,2.39,-.48], 24);
  column(group, p.gold, .91, 1.07, .12, [0,2.61,-.48], 24);
  column(group, p.bronze, .2, .52, .39, [0,2.87,-.48], 12);
  for (const side of [-1, 1]) {
    banner(group, p, [side * 1.37, 2.12, 1.01], .36, 1.14);
    lantern(group, p, [side * 1.54, .30, 1.31]);
    pillar(group, p, side * 2.06, -.78, 1.63);
    arch(group, p.stone, .42, .095, .71, .37, [side * 1.92,1.69,-.74]);
    dome(group, p, [side * 1.92,2.05,-.64], .49, p.emerald, 7);
  }
}

function library(group: T.Object3D, p: Palette, lighting: EntranceLighting) {
  floor(group, p, 5.40, 3.52);
  const x = -1.02, z = -.34;
  column(group, p.stone, 1.45, 1.55, .15, [x, .35, z], 32);
  column(group, p.blueStone, 1.2, 1.23, 1.57, [x, 1.19, z - .23], 24);
  column(group, p.stone, 1.23, 1.30, .13, [x, 1.63, z], 32);
  const windowLight = lighting.lightSurface(emissive(0xe7aa6d, 0xffaa52, .64), .64, .42, .35);
  for (let i = 0; i < 12; i++) {
    const angle = i * Math.PI * 2 / 12;
    pillar(group, p, x + Math.cos(angle) * 1.40, z + Math.sin(angle) * 1.4, 1.73, .38);
    const between = angle + Math.PI / 12;
    const bay: Point = [x + Math.cos(between) * 1.34, 1.85, z + Math.sin(between) * 1.34];
    const frame = arch(group, p.stone, .26, .095, .16, .19, bay);
    frame.rotation.y = Math.PI / 2 - between;
    if (Math.sin(between) > .25) {
      glazedBay(group, p, windowLight, [
        bay[0] + .018 * Math.cos(between), bay[1], bay[2] + .018 * Math.sin(between),
      ], .255, .156, frame.rotation.y);
    }
    const trim = arch(group, p.gold, .261, .023, .21, .04, [
      bay[0] + .19 * Math.cos(between), bay[1] - .013, bay[2] + .19 * Math.sin(between),
    ]);
    trim.rotation.y = frame.rotation.y;
  }
  column(group, p.stone, 1.51, 1.52, .22, [x, 2.18, z], 32);
  column(group, p.gold, 1.54, 1.54, .05, [x, 2.319, z], 32);
  clerestory(group, p, [x,2.80,z], 1.38, .89, 12, windowLight);
  dome(group, p, [x, 3.25, z], 1.44, p.turquoise, 16);
  clerestory(group, p, [x,4.49,z], .40, .30, 7, windowLight);
  dome(group, p, [x,4.64,z], .43, p.emerald, 8);
  const timber = material(0x55382d, .81);
  const rng = randomFor(87);
  for (const panelX of [-1.49, -.75]) {
    box(group, timber, [.63, 1.48, .155], [panelX, 1.15, 1.073]);
    for (let i = 0; i < 5; i++) {
      const shelf = .47 + i * .29;
      box(group, p.bronze, [.70, .037, .21], [panelX, shelf, 1.145]);
      for (let j = 0; j < 7; j++) {
        const height = .13 + rng() * .10;
        const cloth = [p.turquoise, p.gold, p.binding, p.parchment, p.plum][Math.floor(rng() * 5)];
        const item = box(group, cloth, [.062, height, .10], [panelX - .246 + j * .079, shelf + height / 2 + .024, 1.20]);
        if (j % 5 === 0) item.rotation.z = -.11;
      }
    }
  }
  arch(group, p.gold, .64, .052, 1.27, .061, [-1.10, 1.6, 1.29]);
  for (const side of [-1, 1]) {
    lantern(group, p, [-1.10 + side * .77, .46, 1.37], .70);
    mesh(group, new T.OctahedronGeometry(.066), p.goldLight, [-1.10 + side * .68, 1.91, 1.39]);
  }
  for (const side of [-1, 1]) lantern(group, p, [side * 2.31, .3, 1.43], 1.28);
  stairs(group, p, .65, 1.90, 2.26, lighting.inlay);
  for (const xx of [.36, 2.38]) pillar(group, p, xx, .93, 1.75);
  arch(group, p.stone, .91, .26, .79, .42, [1.35, 1.45, .80]);
  arch(group, p.gold, .915, .043, .795, .05, [1.35, 1.45, 1.223]);
  portal(group, p, "study", [1.35, 1.39, 1.281], lighting, 1.02);
  dome(group, p, [1.35, 2.46, .20], 1.11, p.turquoise, 8);
  banner(group, p, [-2.16, 2.02, 1.15], .39, 1.32);
}

function memory(group: T.Object3D, p: Palette, lighting: EntranceLighting) {
  floor(group, p, 4.35, 3.15);
  stairs(group, p, 0, 1.64, 2.25, lighting.inlay);
  for (const x of [-1.46, 1.46]) {
    for (const z of [-.83, .67]) pillar(group, p, x, z, 2.08);
    banner(group, p, [x, 2.185, .998], .38, 1.16);
    lantern(group, p, [x * 1.14, .29, 1.10]);
  }
  arch(group, p.stone, 1.081, .31, 1.17, .62, [0, 1.52, .44]);
  arch(group, p.gold, 1.12, .047, 1.17, .05, [0, 1.52, 1.066]);
  arch(group, p.plum, 1.28, .09, 1.16, .12, [0, 1.52, .89]);
  portal(group, p, "revision", [0, 1.44, 1.132], lighting, 1.15);
  dome(group, p, [0, 2.18, -.36], 1.24, p.plum, 12);
  const crystal = lighting.lightSurface(new T.MeshPhysicalMaterial({
    color: 0xc4a9fc, emissive: 0x6f4bcb, emissiveIntensity: .52,
    roughness: .19, metalness: .31, clearcoat: .73, iridescence: .22,
  }), .52, .31, .72);
  for (const side of [-1, 1]) {
    arch(group, p.emerald, .51, .13, .93, .39, [side * 1.85,1.72,-.46]);
    arch(group, p.gold, .52, .025, .95, .036, [side * 1.85,1.72,-.05]);
    const plinth = column(group, p.plum, .53, .69, .31, [side * 1.89,.44,1.03], 8);
    plinth.rotation.y = .3;
    for (let i = 0; i < 5; i++) {
      const gem = mesh(group, new T.CylinderGeometry(.023,.23,.86, 5), crystal,
        [side * 1.89 + (i-2)*.135,.92 + (i%3)*.145,1.03+(i%2)*.13]);
      gem.rotation.set(.12 * Math.sin(i), i * 1.1, (i-2)*.19);
    }
  }
  for (const [x, y, z, scale] of [[0,3.04,1,.31],[-1.68,2.70,.73,.19],[1.68,2.73,.73,.19],[-2.17,.72,.16,.16],[2.03,.63,-.15,.14]]) {
    const gem = mesh(group, new T.OctahedronGeometry(scale), crystal, [x, y, z]);
    gem.scale.y = 1.58;
    gem.rotation.y = x;
  }
}

function temple(group: T.Object3D, p: Palette, lighting: EntranceLighting) {
  floor(group, p, 5.37, 3.81);
  stairs(group, p, 0, 1.94, 2.48, lighting.inlay);
  box(group, p.blueStone, [3.38, 2.35, .40], [0, 1.43, -.85]);
  for (const x of [-1.87, -1.38, 1.38, 1.87]) for (const z of [-.74, .77]) {
    pillar(group, p, x, z, 2.45, .28, z > 0 ? lighting.inlay : p.shadowStone);
  }
  box(group, p.stone, [4.21, .21, 2.16], [0, 2.77, .10]);
  box(group, p.gold, [4.18, .058, 2.20], [0, 2.896, .10]);
  const pediment = new T.Shape().moveTo(-2.08, 0).lineTo(0, .90).lineTo(2.08, 0).closePath();
  mesh(group, new T.ExtrudeGeometry(pediment, { depth: 1.62, bevelEnabled: true, bevelSize: .035, bevelThickness: .033, bevelSegments: 2 }), p.stone, [0, 2.936, -.51]);
  rod(group, p.gold, new T.Vector3(-2.03, 2.988, 1.136), new T.Vector3(0, 3.84, 1.136), .037);
  rod(group, p.gold, new T.Vector3(0, 3.84, 1.136), new T.Vector3(2.03, 2.988, 1.136), .037);
  arch(group, p.stone, 1.073, .245, 1.32, .71, [0, 1.55, .13]);
  arch(group, p.gold, 1.102, .044, 1.22, .05, [0, 1.55, .861]);
  portal(group, p, "exam", [0, 1.52, .925], lighting, 1.20);
  const starMaterial = lighting.lightSurface(new T.MeshStandardMaterial({
    color: 0xffd688, emissive: 0xff9e42, emissiveIntensity: .74, roughness: .25,
    metalness: .63, vertexColors: true, side: T.DoubleSide,
  }), .74, .57, .81);
  star(group, starMaterial, .31, [0, 4.19, 1.104]);
  ring(group, p.bronze, .35, .036, [0,3.31,1.20]);
  star(group, starMaterial, .21, [0,3.31,1.24]);
  const windowLight = lighting.lightSurface(emissive(0xffd093, 0xff9a45, .49), .49, .31, .62);
  for (const side of [-1, 1]) {
    banner(group, p, [side * 1.65, 2.57, 1.01], .37, 1.66);
    column(group, p.stone, .30, .39, 2.15, [side * 2.22, 1.41, -1.11], 8);
    column(group, p.turquoise, .035, .36, .82, [side * 2.22, 2.82, -1.11], 8);
    mesh(group, new T.OctahedronGeometry(.065), p.lamp, [side * 2.22, 3.28, -1.11]).scale.y = 1.8;
    column(group, p.shadowStone, .51, .64, 1.94, [side * 2.40,1.24,-1.18], 8);
    clerestory(group, p, [side*2.40,2.47,-1.18], .48,.71, 7, windowLight);
    dome(group, p, [side*2.40,2.86,-1.18], .56,p.turquoise,8);
    for (const x of [1.4, 2.07]) lantern(group, p, [side * x, .32, 1.59], 1.18);
  }
}

export function buildings(parent: T.Object3D, p: Palette) {
  const render = { planning, study: library, revision: memory, exam: temple };
  return DESTINATIONS.map((destination) => {
    const group = new T.Group();
    group.position.set(...destination.site);
    group.name = destination.title;
    parent.add(group);
    const lighting = entranceLighting(destination.id, destination.accent);
    render[destination.id](group, p, lighting);
    return { group, lightColor: lighting.lightColor, setLighting: lighting.setLighting };
  });
}

export function compass(parent: T.Object3D, p: Palette) {
  const group = new T.Group();
  group.name = "Golden armillary compass";
  group.position.set(5.9, 5.26, 4.38);
  group.scale.setScalar(.43);
  group.rotation.set(.18, -.29, -.14);
  parent.add(group);
  ring(group, p.gold, 2.56, .032, [0, 0, 0]);
  ring(group, p.bronze, 2.47, .018, [0, 0, .032]);
  ring(group, p.gold, 1.86, .051, [0, 0, 0]).rotation.x = .66;
  ring(group, p.gold, 1.80, .028, [0, 0, 0]).rotation.y = .87;
  ring(group, p.gold, 2.13, .091, [0, 0, 0]).rotation.set(-1.04, -.12, .14);
  ring(group, p.goldLight, 2.137, .028, [0, .034, .02]).rotation.set(-1.04, -.12, .14);
  rod(group, p.bronze, new T.Vector3(0, -2.19, -.19), new T.Vector3(0, 2.19, .23), .027);
  for (let i = 0; i < 32; i++) {
    const angle = Math.PI * 2 * i / 32;
    mesh(group, new T.SphereGeometry(i % 8 === 0 ? .042 : .021, 6, 4),
      i % 8 === 0 ? p.lamp : p.gold, [Math.cos(angle) * 2.57, Math.sin(angle) * 2.57, .02]);
  }
  const facet = new T.MeshStandardMaterial({
    color: 0xffce71, metalness: .67, roughness: .25, vertexColors: true, side: T.DoubleSide,
    emissive: 0xf5a23a, emissiveIntensity: .44,
  });
  const compassLight = new T.MeshStandardMaterial({
    color: 0x8fffe1, emissive: 0x45d9b9, emissiveIntensity: .48,
    metalness: .39, roughness: .27, vertexColors: true, side: T.DoubleSide,
  });
  star(group, compassLight, .84, [0, 0, .13]).name = "Planning compass beacon";
  star(group, facet, .21, [0, 2.59, .02]);
  return group;
}
