import * as T from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { BokehPass } from "three/addons/postprocessing/BokehPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { DESTINATIONS, VIEW, overviewCamera, type Destination } from "./layout";
import { palette } from "./primitives";
import { book } from "./book";
import { pathway } from "./path";
import { terrain } from "./terrain";
import { atmosphere } from "./atmosphere";
import { buildings, compass } from "./architecture";
import { dressAtlas } from "./materials";

export type AtlasRuntime = {
  reset: () => void;
  focus: (id: Destination | null) => void;
  highlight: (id: Destination | null) => void;
  markMastered: (mastered: boolean) => void;
  preferences: (daylight: boolean, reducedMotion: boolean) => void;
  playIntro: () => void;
  finishIntro: () => void;
  dispose: () => void;
};

type JourneyOptions = {
  onIntroChange: (playing: boolean) => void;
  onSelect: (id: Destination) => void;
};

function makeFocusPass(renderer: T.WebGLRenderer, scene: T.Scene, camera: T.PerspectiveCamera) {
  const composer = new EffectComposer(renderer);
  const depth = new BokehPass(scene, camera, { focus: 12, aperture: .0014, maxblur: .008 });
  const output = new OutputPass();
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(depth);
  composer.addPass(output);
  return {
    render(distance: number) {
      depth.materialBokeh.uniforms.focus.value = distance;
      composer.render(0);
    },
    resize(width: number, height: number, ratio: number) {
      composer.setPixelRatio(ratio);
      composer.setSize(width, height);
    },
    dispose() {
      depth.dispose();
      output.dispose();
      composer.dispose();
    },
  };
}

const plaqueOffsets = [
  new T.Vector3(0, .26, 2.03),
  new T.Vector3(1.35, .31, 2.33),
  new T.Vector3(0, .30, 2.22),
  new T.Vector3(0, .38, 2.14),
];

function makeEnvironment(renderer: T.WebGLRenderer) {
  const pmrem = new T.PMREMGenerator(renderer);
  const studio = new RoomEnvironment();
  try {
    return pmrem.fromScene(studio, .08, .05, 70);
  } finally {
    studio.dispose();
    pmrem.dispose();
  }
}

// Batch repeated structural pieces within each asset. Individual destinations
// keep independent origins, portals and labels for the later integration.
function batchStaticPieces(group: T.Group) {
  group.updateMatrixWorld(true);
  const local = group.matrixWorld.clone().invert();
  const buckets = new Map<string, T.Mesh[]>();
  group.traverse((object) => {
    if (!(object instanceof T.Mesh) || object instanceof T.InstancedMesh) return;
    if (!(object.material instanceof T.MeshStandardMaterial) || object.material.transparent) return;
    const geometry = object.geometry as T.BufferGeometry;
    const key = object.material.uuid + ":" + Object.keys(geometry.attributes).sort().join(",");
    const bucket = buckets.get(key) ?? [];
    bucket.push(object);
    buckets.set(key, bucket);
  });

  for (const meshes of buckets.values()) {
    if (meshes.length < 3) continue;
    const parts = meshes.map((object) => {
      const source = object.geometry as T.BufferGeometry;
      const part = source.index ? source.toNonIndexed() : source.clone();
      return part.applyMatrix4(local.clone().multiply(object.matrixWorld));
    });
    const combined = mergeGeometries(parts);
    parts.forEach((part) => part.dispose());
    if (!combined) continue;
    for (const object of meshes) {
      object.removeFromParent();
      object.geometry.dispose();
    }
    const batch = new T.Mesh(combined, meshes[0].material);
    batch.castShadow = true;
    batch.receiveShadow = true;
    group.add(batch);
  }
}

export function createAtlas(
  surface: HTMLElement,
  labels: (HTMLElement | null)[],
  onAvailabilityChange: (available: boolean) => void,
  journey: JourneyOptions,
): AtlasRuntime {
  const renderer = new T.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
  const gl = renderer.getContext();
  const debug = gl.getExtension("WEBGL_debug_renderer_info");
  const gpu = debug ? String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)) : "";
  const software = /swiftshader|llvmpipe|software rasterizer/i.test(gpu);
  const compact = software || matchMedia("(pointer: coarse)").matches || surface.clientWidth < 900;
  renderer.setClearColor(0x021f24);
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.04;
  renderer.shadowMap.enabled = !software;
  renderer.shadowMap.type = T.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  const canvas = renderer.domElement;
  canvas.setAttribute("aria-hidden", "true");

  const scene = new T.Scene();
  scene.fog = new T.FogExp2(0x265855, .012);
  let environment = software ? null : makeEnvironment(renderer);
  scene.environment = environment?.texture ?? null;
  scene.environmentIntensity = .57;
  const fill = new T.HemisphereLight(0xb2f0dc, 0x243a35, 1.18);
  scene.add(fill);
  const key = new T.DirectionalLight(0xffd29b, 2.45);
  key.position.set(-8, 13, 10);
  key.target.position.set(1, 1.5, -1);
  key.castShadow = true;
  key.shadow.mapSize.setScalar(compact ? 768 : 2048);
  Object.assign(key.shadow.camera, { left: -19, right: 19, top: 21, bottom: -17, near: 1, far: 66 });
  key.shadow.normalBias = .029;
  key.shadow.bias = -.00038;
  key.shadow.radius = 2.1;
  scene.add(key, key.target);
  const rim = new T.DirectionalLight(0x86ffdc, 1.65);
  rim.position.set(14, 11, -13);
  scene.add(rim);
  const gutter = new T.PointLight(0xffb955, 23, 8, 2);
  gutter.position.set(-.77, .89, 10.35);
  scene.add(gutter);
  const bookRim = new T.PointLight(0x43ddc3, 14, 13, 2);
  bookRim.position.set(-10, 3, 4);
  scene.add(bookRim);
  const entranceLights = new T.Group();
  const lamps = DESTINATIONS.map(({ site: [x, y, z] }) => {
    const entrance = new T.PointLight(0xffbe79, 15, 4.1, 2);
    entrance.position.set(x, y + 1.15, z + 1.91);
    entranceLights.add(entrance);
    return entrance;
  });

  const p = palette();
  if (software) {
    p.gold.metalness = .33;
    p.bronze.metalness = .26;
  }
  const air = atmosphere(scene, compact);
  const world = new T.Group();
  scene.add(world);
  world.add(entranceLights);
  const islands = terrain(world, p, compact);
  for (const { point, width } of islands.waterfallBases) air.mist(world, point, width);
  const spine = book(scene, p);
  const road = pathway(world, p);
  road.lightRoute(1);
  const havens = buildings(world, p);
  const north = compass(world, p);
  const reward = new T.Mesh(
    new T.TorusGeometry(2.83, .031, 6, 60),
    new T.MeshBasicMaterial({ color: 0xffda86, transparent: true, opacity: 0, depthWrite: false }),
  );
  reward.visible = false;
  north.add(reward);
  for (const asset of [islands.group, ...spine.batches, road.group, ...havens.map(({ group }) => group), north]) {
    batchStaticPieces(asset);
    asset.traverse((object) => {
      if (object instanceof T.Mesh && object.material instanceof T.MeshStandardMaterial) {
        object.castShadow = true;
        object.receiveShadow = true;
      }
    });
  }

  const camera = new T.PerspectiveCamera(VIEW.fov, 1, .3, 330);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = false;
  controls.enablePan = false;
  controls.minDistance = 18;
  controls.maxDistance = 55;
  controls.minPolarAngle = .64;
  controls.maxPolarAngle = 1.48;
  controls.minAzimuthAngle = -.67;
  controls.maxAzimuthAngle = .67;
  controls.rotateSpeed = .56;
  controls.zoomSpeed = .65;

  const anchors = DESTINATIONS.map((destination, index) => new T.Vector3(...destination.site).add(plaqueOffsets[index]));
  const centers = anchors.map(() => new T.Vector3());
  const homeEye = new T.Vector3(...VIEW.eye);
  const homeTarget = new T.Vector3(...VIEW.target);
  const introEye = new T.Vector3(1.05, 7.35, 24);
  const introTarget = new T.Vector3(2.65, .54, 8.25);
  const target = homeTarget.clone();
  const projected = new T.Vector3();
  const viewDirection = new T.Vector3();
  const ray = new T.Raycaster();
  const pointer = new T.Vector2();
  scene.updateMatrixWorld(true);
  const boxes = havens.map(({ group }) => new T.Box3().setFromObject(group));
  const meshes = havens.map(({ group }) => {
    const pickable: T.Mesh[] = [];
    group.traverse((object) => { if (object instanceof T.Mesh) pickable.push(object); });
    return pickable;
  });
  const compassAngle = north.rotation.y;
  let focusPass: ReturnType<typeof makeFocusPass> | undefined;
  let selected = -1;
  let hovered = -1;
  let reduced = false;
  let paused = false;
  let ambienceUntil = 0;
  let lastFrame = 0;
  let atmosphereTime = 0;
  let masteredAt: number | null = null;
  let introStart: number | null = null;
  let width = 0;
  let height = 0;
  let profileRise = 1;
  let resolution = 0;
  let orbiting = false;
  let flight: { start: number; fromEye: T.Vector3; fromTarget: T.Vector3; toEye: T.Vector3; toTarget: T.Vector3 } | null = null;
  let press: { id: number; x: number; y: number } | null = null;
  let coarse = false;
  let queued = 0;
  let disposed = false;
  dressAtlas(renderer, { rock: islands.rock, stone: p.stone, paving: road.paving, cover: spine.cover }, { compact, software }, invalidate);

  function aim(eye: T.Vector3, look: T.Vector3) {
    camera.position.copy(eye);
    target.copy(look);
    camera.lookAt(target);
  }

  function applyIntro(progress: number) {
    const open = T.MathUtils.smootherstep(progress, .03, .48);
    spine.unfold(open, T.MathUtils.smootherstep(progress, .22, .64));
    const rise = T.MathUtils.smootherstep(progress, .30, .83);
    world.visible = rise > .002;
    world.scale.set(.72 + .28 * rise, Math.max(.01, rise) * profileRise, .86 + .14 * rise);
    world.position.y = -1.65 * (1 - rise);
    const light = T.MathUtils.smootherstep(progress, .48, .97);
    road.lightRoute(light);
    gutter.intensity = 14 + 29 * Math.sin(Math.PI * light) + 9 * light;
    const sweep = T.MathUtils.smootherstep(progress, .09, .89);
    camera.position.lerpVectors(introEye, homeEye, sweep);
    target.lerpVectors(introTarget, homeTarget, sweep);
    camera.lookAt(target);
  }

  function draw(now: number) {
    queued = 0;
    if (disposed || paused || document.hidden) return;
    const moving = introStart !== null || flight !== null;
    if (introStart !== null) {
      if (introStart < 0) introStart = now;
      const progress = Math.min((now - introStart) / 3300, 1);
      applyIntro(progress);
      if (progress === 1) finishIntro();
    }
    if (flight) {
      const time = T.MathUtils.smootherstep(now - flight.start, 0, 840);
      camera.position.lerpVectors(flight.fromEye, flight.toEye, time);
      target.lerpVectors(flight.fromTarget, flight.toTarget, time);
      camera.lookAt(target);
      if (time === 1) {
        flight = null;
        if (selected === -1) enterOrbit();
      }
    }
    const atmospheric = !reduced && (moving || now < ambienceUntil);
    if (atmospheric) atmosphereTime += Math.min(.045, (now - (lastFrame || now)) / 1000);
    lastFrame = now;
    islands.waterTime.value = atmosphereTime;
    north.rotation.y = compassAngle + Math.sin(atmosphereTime * .78) * .16;
    if (masteredAt !== null) {
      const pulse = reduced ? 1 : Math.min(1, (now - masteredAt) / 790);
      reward.scale.setScalar(1 + .19 * Math.sin(Math.PI * pulse));
      reward.material.opacity = .65 + .35 * Math.sin(Math.PI * pulse);
    }
    havens.forEach(({ glow }, index) => {
      glow.value = index === selected ? .92 + .08 * Math.sin(atmosphereTime * 3) : index === hovered ? .73 : 0;
      lamps[index].intensity = index === selected ? 31 : index === hovered ? 22 : 15;
    });
    syncResolution(moving || orbiting);
    try {
      if (focusPass && selected >= 0 && !flight && !reduced) {
        camera.getWorldDirection(viewDirection);
        focusPass.render(projected.subVectors(centers[selected], camera.position).dot(viewDirection));
      } else {
        renderer.render(scene, camera);
      }
    } catch {
      paused = true;
      onAvailabilityChange(false);
      return;
    }
    projectLabels();
    if (introStart !== null || flight || atmospheric) invalidate();
  }

  function projectLabels() {
    camera.updateMatrixWorld();
    world.updateWorldMatrix(true, false);
    const positions: { index: number; x: number; y: number }[] = [];
    const minY = 82;
    const maxY = height - 44;
    const labelSpacing = 48;
    for (let i = 0; i < anchors.length; i++) {
      projected.copy(anchors[i]).applyMatrix4(world.matrixWorld).project(camera);
      positions.push({
        index: i,
        x: T.MathUtils.clamp((projected.x + 1) * width / 2, 43, width - 43),
        y: T.MathUtils.clamp((1 - projected.y) * height / 2, minY, maxY),
      });
    }
    if (selected < 0) {
      positions.sort((a, b) => a.y - b.y);
      for (const [i, point] of positions.entries()) {
        for (let before = 0; before < i; before++) {
          const other = positions[before];
          if (Math.abs(other.x - point.x) < 101) point.y = Math.max(point.y, other.y + labelSpacing);
        }
      }
      for (let i = positions.length - 1; i >= 0; i--) {
        const point = positions[i];
        point.y = Math.min(point.y, maxY);
        for (let after = i + 1; after < positions.length; after++) {
          const other = positions[after];
          if (Math.abs(other.x - point.x) < 101) point.y = Math.min(point.y, other.y - labelSpacing);
        }
      }
    }
    for (const { index, x, y } of positions) {
      labels[index]?.style.setProperty("--atlas-x", x + "px");
      labels[index]?.style.setProperty("--atlas-y", y + "px");
    }
  }

  function invalidate() {
    if (!disposed && !paused && !document.hidden && !queued) queued = requestAnimationFrame(draw);
  }

  function syncResolution(moving: boolean) {
    if (!width || !height) return;
    const pixelBudget = software ? (moving ? 300_000 : 560_000)
      : coarse ? (moving ? 980_000 : 2_550_000) : (moving ? 2_500_000 : 4_400_000);
    const ratio = Math.min(devicePixelRatio, coarse ? 2.8 : 2.5, Math.sqrt(pixelBudget / (width * height)));
    if (ratio === resolution) return;
    resolution = ratio;
    renderer.setPixelRatio(ratio);
    renderer.setSize(width, height, false);
    focusPass?.resize(width, height, ratio);
  }

  function resize() {
    width = surface.clientWidth;
    height = surface.clientHeight;
    if (!width || !height) return;
    const framing = overviewCamera(width, height);
    const newPose = !homeEye.equals(projected.set(...framing.eye)) || profileRise !== framing.rise;
    const aspectChanged = Math.abs(camera.aspect - width / height) > .02;
    homeEye.set(...framing.eye);
    homeTarget.set(...framing.target);
    profileRise = framing.rise;
    spine.group.scale.x = width / height <= .58 ? .89 : 1;
    introTarget.x = width / height < 1 ? 3.3 : 2.65;
    camera.aspect = width / height;
    camera.fov = framing.fov;
    camera.updateProjectionMatrix();
    coarse = matchMedia("(pointer: coarse)").matches || width < 900;
    resolution = 0;
    syncResolution(false);
    if (coarse && focusPass) {
      focusPass.dispose();
      focusPass = undefined;
    }
    if (introStart === null) {
      world.scale.y = profileRise;
      updateLandmarkBounds();
    }
    if (introStart === null && selected < 0 && !flight && newPose) {
      aim(homeEye, homeTarget);
      enterOrbit();
    }
    if (selected >= 0 && aspectChanged) {
      const { eye, look } = focusPose(selected);
      flight = null;
      aim(eye, look);
    }
    invalidate();
  }

  function enterOrbit() {
    controls.target.copy(target);
    controls.enabled = true;
    controls.update();
  }

  function playIntro() {
    if (reduced || paused || introStart !== null) return;
    flight = null;
    selected = hovered = -1;
    introStart = -1;
    controls.enabled = false;
    applyIntro(0);
    renderer.shadowMap.needsUpdate = true;
    invalidate();
    journey.onIntroChange(true);
  }

  function finishIntro() {
    if (introStart === null) return;
    introStart = null;
    applyIntro(1);
    updateLandmarkBounds();
    renderer.shadowMap.needsUpdate = true;
    enterOrbit();
    projectLabels();
    invalidate();
    journey.onIntroChange(false);
  }

  function reset() {
    finishIntro();
    selected = hovered = -1;
    flight = null;
    aim(homeEye, homeTarget);
    enterOrbit();
    projectLabels();
    invalidate();
  }

  function updateLandmarkBounds() {
    world.updateWorldMatrix(true, true);
    havens.forEach(({ group }, index) => {
      boxes[index].setFromObject(group);
      boxes[index].getCenter(centers[index]);
    });
  }

  function focusPose(index: number) {
    const site = centers[index];
    if (!site) return { eye: homeEye.clone(), look: homeTarget.clone() };
    const wide = camera.aspect >= 1.12;
    const halfView = Math.tan(T.MathUtils.degToRad(camera.fov / 2));
    const size = boxes[index].getSize(projected);
    const distance = size.z * .65 + Math.max(size.x / (halfView * camera.aspect * (wide ? .72 : 1.5)),
      size.y / (halfView * (wide ? 1.12 : .86)));
    return {
      look: site.clone().add(new T.Vector3(wide ? -distance * halfView * .3 : 0,
        wide ? .16 : -distance * halfView * .14, 0)),
      eye: site.clone().add(new T.Vector3(wide ? 2.6 : -.9, 2.52, distance)),
    };
  }

  function focus(id: Destination | null) {
    finishIntro();
    const next = id === null ? -1 : DESTINATIONS.findIndex((destination) => destination.id === id);
    if (selected === next && id !== null) return;
    selected = next;
    hovered = -1;
    if (!id && reduced) {
      reset();
      return;
    }
    const { eye: toEye, look: toTarget } = focusPose(next);
    const wide = camera.aspect >= 1.12;
    if (id && wide && !coarse && !software && !reduced && !focusPass && renderer.extensions.has("EXT_color_buffer_float")) {
      focusPass = makeFocusPass(renderer, scene, camera);
      focusPass.resize(surface.clientWidth, surface.clientHeight, renderer.getPixelRatio());
    }
    controls.enabled = false;
    if (reduced) {
      aim(toEye, toTarget);
      flight = null;
      if (!id) enterOrbit();
    } else {
      flight = { start: performance.now(), fromEye: camera.position.clone(), fromTarget: target.clone(), toEye, toTarget };
      ambienceUntil = performance.now() + 1140;
    }
    invalidate();
  }

  function highlight(id: Destination | null) {
    const next = DESTINATIONS.findIndex((destination) => destination.id === id);
    if (next === hovered) return;
    hovered = next;
    ambienceUntil = performance.now() + 850;
    invalidate();
  }

  function markMastered(mastered: boolean) {
    if (mastered === reward.visible) return;
    reward.visible = mastered;
    masteredAt = mastered ? performance.now() : null;
    if (mastered) ambienceUntil = performance.now() + 820;
    invalidate();
  }

  function preferences(daylight: boolean, reducedMotion: boolean) {
    air.daylight.value = Number(daylight);
    air.starField.visible = !daylight;
    fill.intensity = daylight ? 1.65 : 1.18;
    fill.color.setHex(daylight ? 0xfcfff2 : 0xa5ece5);
    fill.groundColor.setHex(daylight ? 0x77afa0 : 0x244441);
    scene.fog!.color.setHex(daylight ? 0xbddbd2 : 0x265855);
    key.color.setHex(daylight ? 0xffe5b7 : 0xffd29b);
    renderer.toneMappingExposure = daylight ? 1.09 : 1.02;
    reduced = reducedMotion;
    if (reduced) {
      finishIntro();
      if (flight) {
        aim(flight.toEye, flight.toTarget);
        flight = null;
        if (selected === -1) enterOrbit();
      }
    }
    invalidate();
  }

  function hitTest(event: PointerEvent) {
    const bounds = canvas.getBoundingClientRect();
    pointer.set((event.clientX - bounds.x) / bounds.width * 2 - 1, 1 - (event.clientY - bounds.y) / bounds.height * 2);
    ray.setFromCamera(pointer, camera);
    let nearest = Infinity;
    let hit = -1;
    boxes.forEach((box, index) => {
      if (!ray.ray.intersectsBox(box)) return;
      const distance = ray.intersectObjects(meshes[index], false)[0]?.distance ?? Infinity;
      if (distance < nearest) {
        nearest = distance;
        hit = index;
      }
    });
    return DESTINATIONS[hit]?.id ?? null;
  }

  function pointerDown(event: PointerEvent) {
    if (event.isPrimary && event.button === 0) press = { id: event.pointerId, x: event.clientX, y: event.clientY };
  }

  function pointerUp(event: PointerEvent) {
    if (press?.id !== event.pointerId) return;
    const start = press;
    press = null;
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 8 || introStart !== null || flight) return;
    const hit = hitTest(event);
    if (hit) journey.onSelect(hit);
  }

  function pointerMove(event: PointerEvent) {
    if (press || event.pointerType !== "mouse" || introStart !== null || flight) return;
    const hit = hitTest(event);
    canvas.style.cursor = hit ? "pointer" : "";
    highlight(hit);
  }

  function clearPointer() {
    press = null;
    canvas.style.cursor = "";
    highlight(null);
  }

  function contextLost(event: Event) {
    event.preventDefault();
    paused = true;
    onAvailabilityChange(false);
  }

  function contextRestored() {
    focusPass?.dispose();
    focusPass = undefined;
    environment?.dispose();
    environment = software ? null : makeEnvironment(renderer);
    scene.environment = environment?.texture ?? null;
    renderer.shadowMap.needsUpdate = true;
    paused = false;
    onAvailabilityChange(true);
    invalidate();
  }

  surface.appendChild(canvas);
  canvas.addEventListener("webglcontextlost", contextLost);
  canvas.addEventListener("webglcontextrestored", contextRestored);
  canvas.addEventListener("pointerdown", pointerDown);
  canvas.addEventListener("pointerup", pointerUp);
  canvas.addEventListener("pointermove", pointerMove);
  canvas.addEventListener("pointerleave", clearPointer);
  canvas.addEventListener("pointercancel", clearPointer);
  document.addEventListener("visibilitychange", invalidate);
  controls.addEventListener("change", invalidate);
  controls.addEventListener("start", () => { orbiting = true; });
  controls.addEventListener("end", () => { orbiting = false; invalidate(); });
  const observer = new ResizeObserver(resize);
  observer.observe(surface);
  resize();
  reset();
  renderer.shadowMap.needsUpdate = true;

  return {
    reset,
    focus,
    highlight,
    markMastered,
    preferences,
    playIntro,
    finishIntro,
    dispose() {
      disposed = true;
      if (queued) cancelAnimationFrame(queued);
      observer.disconnect();
      controls.removeEventListener("change", invalidate);
      controls.dispose();
      canvas.removeEventListener("pointerdown", pointerDown);
      canvas.removeEventListener("pointerup", pointerUp);
      canvas.removeEventListener("pointermove", pointerMove);
      canvas.removeEventListener("pointerleave", clearPointer);
      canvas.removeEventListener("pointercancel", clearPointer);
      document.removeEventListener("visibilitychange", invalidate);
      canvas.removeEventListener("webglcontextlost", contextLost);
      canvas.removeEventListener("webglcontextrestored", contextRestored);
      const released = new Set<T.Material | T.Texture | T.BufferGeometry>();
      scene.traverse((object) => {
        if (object instanceof T.Mesh || object instanceof T.Points || object instanceof T.Sprite) {
          if ("geometry" in object && object.geometry && !released.has(object.geometry)) {
            object.geometry.dispose();
            released.add(object.geometry);
          }
          for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
            if (released.has(material)) continue;
            for (const value of Object.values(material)) {
              if (value instanceof T.Texture && !released.has(value)) {
                value.dispose();
                released.add(value);
              }
            }
            material.dispose();
            released.add(material);
          }
        }
      });
      environment?.dispose();
      focusPass?.dispose();
      key.shadow.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
}
