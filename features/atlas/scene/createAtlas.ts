import * as T from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { BokehPass } from "three/addons/postprocessing/BokehPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { DESTINATIONS, VIEW, overviewCamera, type Destination, type Point } from "./layout";
import { palette } from "./primitives";
import { book } from "./book";
import { pathway } from "./path";
import { terrain } from "./terrain";
import { atmosphere } from "./atmosphere";
import { buildings, compass } from "./architecture";
import { dressAtlas } from "./materials";
import { ATLAS_FOCUS_MS, ATLAS_INTRO_MS, ATLAS_REVEAL_MS, atlasIntroDolly, atlasPixelRatio, cinematicDelta } from "./presentation";

export type AtlasOverview = { eye: Point; target: Point; aspect: number };

export type AtlasRuntime = {
  ready: Promise<boolean>;
  reset: () => void;
  focus: (id: Destination | null) => void;
  highlight: (id: Destination | null) => void;
  recommend: (id: Destination) => void;
  readOverview: () => AtlasOverview;
  restoreOverview: (view: AtlasOverview) => void;
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
  const viewportLimit = gl.getParameter(gl.MAX_VIEWPORT_DIMS) as Int32Array;
  const maxBufferSide = Math.min(gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) as number, viewportLimit[0], viewportLimit[1]);
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
  const air = atmosphere(scene, compact, invalidate);
  const world = new T.Group();
  scene.add(world);
  world.add(entranceLights);
  const islands = terrain(world, p, compact, air.daylight);
  for (const { point, width } of islands.waterfallBases) air.mist(world, point, width);
  const spine = book(scene, p, !software);
  const road = pathway(world, p);
  road.lightRoute(1);
  const havens = buildings(world, p);
  havens.forEach((haven, index) => lamps[index].color.setHex(haven.lightColor));
  const north = compass(world, p);
  const reward = new T.Mesh(
    new T.TorusGeometry(2.83, .031, 6, 60),
    new T.MeshBasicMaterial({ color: 0xffda86, transparent: true, opacity: 0, depthWrite: false }),
  );
  reward.visible = false;
  for (const asset of [islands.group, ...spine.batches, road.group, ...havens.map(({ group }) => group), north]) {
    batchStaticPieces(asset);
    asset.traverse((object) => {
      if (object instanceof T.Mesh && object.material instanceof T.MeshStandardMaterial) {
        object.castShadow = true;
        object.receiveShadow = true;
      }
    });
  }
  const distantCompass = north.clone(true);
  distantCompass.name = "Portrait sky compass";
  distantCompass.position.set(-9.06, 12.03, -2.8);
  distantCompass.scale.setScalar(1.09);
  distantCompass.visible = false;
  world.add(distantCompass);
  north.add(reward);

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
  let recommended = -1;
  let previousOverview: AtlasOverview | null = null;
  const landmarkEnergy = new Float32Array(havens.length);
  let reduced = false;
  let paused = false;
  let ambienceUntil = 0;
  let lastFrame = 0;
  let atmosphereTime = 0;
  let masteredAt: number | null = null;
  let introElapsed: number | null = null;
  let lastMotionFrame = 0;
  let slowMotionFrames = 0;
  let motionScale = 1;
  let warming = true;
  let introRequested = false;
  let warmupTimer: number | undefined;
  let resolveReady!: (available: boolean) => void;
  const ready = new Promise<boolean>((resolve) => { resolveReady = resolve; });
  let presented = false;
  let width = 0;
  let height = 0;
  let profileRise = 1;
  let resolution = 0;
  let orbiting = false;
  let flight: { elapsed: number; fromEye: T.Vector3; fromTarget: T.Vector3; toEye: T.Vector3; toTarget: T.Vector3 } | null = null;
  let press: { id: number; x: number; y: number } | null = null;
  let coarse = false;
  let queued = 0;
  let disposed = false;
  const textures = dressAtlas(renderer,
    { rock: islands.rock, stone: p.stone, paving: road.paving, cover: spine.cover },
    { compact, software }, invalidate);

  function aim(eye: T.Vector3, look: T.Vector3) {
    camera.position.copy(eye);
    target.copy(look);
    camera.lookAt(target);
  }

  function applyIntro(elapsed: number, moveCamera = true) {
    const progress = Math.min(1, elapsed / ATLAS_REVEAL_MS);
    const open = T.MathUtils.smootherstep(progress, .02, .51);
    spine.unfold(open, T.MathUtils.smootherstep(progress, .20, .68));
    const rise = T.MathUtils.smootherstep(progress, .34, .89);
    world.visible = progress >= .34;
    world.scale.set(.65 + .35 * rise, (.035 + .965 * rise) * profileRise, .79 + .21 * rise);
    world.position.y = -2.05 * (1 - rise);
    const light = T.MathUtils.smoothstep(progress, .43, .98);
    road.lightRoute(light);
    const wick = T.MathUtils.smootherstep(progress, .16, .37);
    gutter.intensity = 12 + wick * (11 + 20 * Math.sin(Math.PI * light));
    if (!moveCamera) return;
    const sweep = T.MathUtils.smootherstep(progress, .12, .96);
    camera.position.lerpVectors(introEye, homeEye, sweep);
    camera.position.y += Math.sin(Math.PI * sweep) * 1.25;
    target.lerpVectors(introTarget, homeTarget, sweep);
    camera.position.sub(target).multiplyScalar(atlasIntroDolly(elapsed, sweep)).add(target);
    camera.lookAt(target);
  }

  function draw(now: number) {
    queued = 0;
    if (disposed || paused || document.hidden) return;
    const moving = introElapsed !== null || flight !== null;
    const interactive = moving || orbiting;
    const frameGap = lastMotionFrame ? Math.max(0, now - lastMotionFrame) : 0;
    const delta = cinematicDelta(lastMotionFrame, now, software);
    lastMotionFrame = interactive ? now : 0;
    if (interactive && !software) {
      slowMotionFrames = delta > 25 ? slowMotionFrames + 1 : Math.max(0, slowMotionFrames - 1);
      if (slowMotionFrames >= 4) {
        motionScale = Math.max(.30, motionScale * .77);
        slowMotionFrames = 0;
      }
    }
    if (introElapsed !== null) {
      // Catch up on slow frames without skipping the arrival after a GPU stall.
      introElapsed += Math.min(frameGap, 160);
      if (introElapsed >= ATLAS_INTRO_MS) finishIntro();
      else applyIntro(introElapsed);
    }
    if (flight) {
      flight.elapsed += delta;
      const time = T.MathUtils.smootherstep(flight.elapsed, 0, ATLAS_FOCUS_MS);
      camera.position.lerpVectors(flight.fromEye, flight.toEye, time);
      target.lerpVectors(flight.fromTarget, flight.toTarget, time);
      camera.lookAt(target);
      if (time === 1) {
        flight = null;
        if (selected === -1) {
          previousOverview = null;
          enterOrbit();
        }
      }
    }
    const atmospheric = !reduced && (moving || now < ambienceUntil);
    const frameSeconds = Math.min(.045, (now - (lastFrame || now)) / 1000);
    if (atmospheric) atmosphereTime += frameSeconds;
    lastFrame = now;
    islands.waterTime.value = atmosphereTime;
    air.moveClouds(atmosphereTime);
    north.rotation.y = compassAngle + Math.sin(atmosphereTime * .78) * .16;
    distantCompass.rotation.y = north.rotation.y;
    if (masteredAt !== null) {
      const pulse = reduced ? 1 : Math.min(1, (now - masteredAt) / 790);
      reward.scale.setScalar(1 + .19 * Math.sin(Math.PI * pulse));
      reward.material.opacity = .65 + .35 * Math.sin(Math.PI * pulse);
    }
    const lightEase = atmospheric ? 1 - Math.exp(-22 * frameSeconds) : 1;
    const arrivalLight = introElapsed === null ? 0 : .18 * Math.sin(Math.PI *
      T.MathUtils.smoothstep(introElapsed, ATLAS_REVEAL_MS, ATLAS_INTRO_MS));
    havens.forEach((haven, index) => {
      const strength = index === selected ? 1 : index === hovered ? .82 : index === recommended ? .60 : .16;
      const energy = T.MathUtils.lerp(landmarkEnergy[index], Math.min(1, strength + arrivalLight), lightEase);
      landmarkEnergy[index] = energy;
      haven.setLighting(energy, atmosphereTime, air.daylight.value > 0);
      lamps[index].intensity = 13 + 19 * energy;
    });
    try {
      syncResolution(introElapsed !== null || flight !== null || orbiting);
      renderScene();
      if (!presented) {
        presented = true;
        // The first render may compile shaders while the canvas is still hidden.
        lastMotionFrame = 0;
        resolveReady(true);
      }
    } catch {
      renderFailed();
      return;
    }
    if (introElapsed === null) projectLabels();
    if (introElapsed !== null || flight || atmospheric) invalidate();
  }

  function renderScene() {
    if (focusPass && selected >= 0 && !flight && !reduced) {
      camera.getWorldDirection(viewDirection);
      focusPass.render(projected.subVectors(centers[selected], camera.position).dot(viewDirection));
    } else {
      renderer.render(scene, camera);
    }
  }

  function renderFailed() {
    paused = true;
    resolveReady(false);
    onAvailabilityChange(false);
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
        x: T.MathUtils.clamp((projected.x + 1) * width / 2, 58, width - 58),
        y: T.MathUtils.clamp((1 - projected.y) * height / 2, minY, maxY),
      });
    }
    if (selected < 0) {
      positions.sort((a, b) => a.y - b.y);
      for (const [i, point] of positions.entries()) {
        for (let before = 0; before < i; before++) {
          const other = positions[before];
          if (Math.abs(other.x - point.x) < 112) point.y = Math.max(point.y, other.y + labelSpacing);
        }
      }
      for (let i = positions.length - 1; i >= 0; i--) {
        const point = positions[i];
        point.y = Math.min(point.y, maxY);
        for (let after = i + 1; after < positions.length; after++) {
          const other = positions[after];
          if (Math.abs(other.x - point.x) < 112) point.y = Math.min(point.y, other.y - labelSpacing);
        }
      }
    }
    for (const { index, x, y } of positions) {
      labels[index]?.style.setProperty("--atlas-x", x + "px");
      labels[index]?.style.setProperty("--atlas-y", y + "px");
    }
  }

  function invalidate() {
    if (!warming && !disposed && !paused && !document.hidden && !queued) queued = requestAnimationFrame(draw);
  }

  function syncResolution(moving: boolean) {
    if (!width || !height) return;
    const ratio = atlasPixelRatio(width, height, devicePixelRatio, maxBufferSide,
      { software, compact: coarse, moving, motionScale });
    if (ratio === resolution) return;
    resolution = ratio;
    renderer.setDrawingBufferSize(width, height, ratio);
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
    const portrait = width / height <= .58;
    air.setCloudPortrait(width / height < .8);
    distantCompass.visible = portrait;
    spine.group.scale.x = portrait ? 1.24 : 1;
    introEye.set(portrait ? -.5 : 1.05, portrait ? 6.2 : 7.35, portrait ? 20.6 : 24);
    introTarget.x = width / height < 1 ? 3.3 : 2.65;
    camera.aspect = width / height;
    camera.fov = framing.fov;
    camera.updateProjectionMatrix();
    coarse = matchMedia("(pointer: coarse)").matches || width < 900;
    resolution = 0;
    if (coarse && focusPass) {
      focusPass.dispose();
      focusPass = undefined;
    }
    if (introElapsed === null) {
      world.scale.y = profileRise;
      updateLandmarkBounds();
      if (newPose) renderer.shadowMap.needsUpdate = true;
    }
    if (introElapsed === null && selected < 0 && !flight && newPose) {
      aim(homeEye, homeTarget);
      enterOrbit();
    }
    if (selected >= 0 && aspectChanged && !reduced) {
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
    if (reduced || paused || introElapsed !== null) return;
    if (warming) {
      introRequested = true;
      return;
    }
    flight = null;
    selected = hovered = -1;
    previousOverview = null;
    introElapsed = 0;
    lastMotionFrame = 0;
    controls.enabled = false;
    applyIntro(0);
    invalidate();
    journey.onIntroChange(true);
  }

  function finishIntro(moveCamera = true) {
    introRequested = false;
    if (introElapsed === null) return;
    introElapsed = null;
    lastMotionFrame = 0;
    applyIntro(ATLAS_INTRO_MS, moveCamera);
    updateLandmarkBounds();
    renderer.shadowMap.needsUpdate = true;
    if (moveCamera) enterOrbit();
    projectLabels();
    invalidate();
    journey.onIntroChange(false);
  }

  function reset() {
    finishIntro();
    selected = hovered = -1;
    previousOverview = null;
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

  function currentOverview(home = false): AtlasOverview {
    return {
      eye: (home ? homeEye : camera.position).toArray(),
      target: (home ? homeTarget : target).toArray(),
      aspect: camera.aspect,
    };
  }

  function overviewPose(view: AtlasOverview | null) {
    const valid = view && Math.abs(view.aspect - camera.aspect) < .12;
    return {
      eye: valid ? new T.Vector3(...view.eye) : homeEye.clone(),
      look: valid ? new T.Vector3(...view.target) : homeTarget.clone(),
    };
  }

  function readOverview() {
    return previousOverview ?? currentOverview(introElapsed !== null);
  }

  function restoreOverview(view: AtlasOverview) {
    const pose = overviewPose(view);
    aim(pose.eye, pose.look);
    enterOrbit();
    projectLabels();
    invalidate();
  }

  function focus(id: Destination | null) {
    const next = id === null ? -1 : DESTINATIONS.findIndex((destination) => destination.id === id);
    if (selected === next) return;
    if (id && selected < 0) previousOverview ??= currentOverview(introElapsed !== null);
    finishIntro(false);
    selected = next;
    hovered = -1;
    const { eye: toEye, look: toTarget } = !id || reduced ? overviewPose(previousOverview) : focusPose(next);
    const wide = camera.aspect >= 1.12;
    if (id && wide && !coarse && !software && !reduced && !focusPass && renderer.extensions.has("EXT_color_buffer_float")) {
      focusPass = makeFocusPass(renderer, scene, camera);
      focusPass.resize(surface.clientWidth, surface.clientHeight, renderer.getPixelRatio());
    }
    controls.enabled = false;
    if (reduced) {
      aim(toEye, toTarget);
      flight = null;
      if (!id) {
        previousOverview = null;
        enterOrbit();
      }
    } else {
      lastMotionFrame = 0;
      flight = { elapsed: 0, fromEye: camera.position.clone(), fromTarget: target.clone(), toEye, toTarget };
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

  function recommend(id: Destination) {
    recommended = DESTINATIONS.findIndex((destination) => destination.id === id);
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
    air.setCloudDaylight(daylight);
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
        const pose = overviewPose(previousOverview);
        aim(pose.eye, pose.look);
        flight = null;
        if (selected === -1) {
          previousOverview = null;
          enterOrbit();
        }
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
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 8 || introElapsed !== null) return;
    const hit = hitTest(event);
    if (hit) journey.onSelect(hit);
  }

  function pointerMove(event: PointerEvent) {
    if (press || event.pointerType !== "mouse" || introElapsed !== null || flight) return;
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
    renderFailed();
  }

  function visibilityChanged() {
    lastMotionFrame = 0;
    lastFrame = 0;
    invalidate();
  }

  function present() {
    window.clearTimeout(warmupTimer);
    warming = false;
    if (disposed || paused) return;
    try {
      if (introRequested && !reduced) {
        if (!software && !document.hidden) {
          // Upload the visible world and its shadow map before the book moves.
          syncResolution(true);
          renderScene();
        }
        playIntro();
      }
      invalidate();
    } catch {
      renderFailed();
    }
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
  document.addEventListener("visibilitychange", visibilityChanged);
  controls.addEventListener("change", invalidate);
  controls.addEventListener("start", () => { orbiting = true; });
  controls.addEventListener("end", () => { orbiting = false; invalidate(); });
  const observer = new ResizeObserver(resize);
  observer.observe(surface);
  window.addEventListener("resize", invalidate);
  resize();
  reset();
  renderer.shadowMap.needsUpdate = true;
  const shaderWarmup = !software && renderer.extensions.has("KHR_parallel_shader_compile")
    ? renderer.compileAsync(scene, camera)
    : Promise.resolve();
  const warmupLimit = new Promise<void>((resolve) => { warmupTimer = window.setTimeout(resolve, 900); });
  void Promise.race([Promise.all([textures, air.textures, shaderWarmup]), warmupLimit]).then(present, present);

  return {
    ready,
    reset,
    focus,
    highlight,
    recommend,
    readOverview,
    restoreOverview,
    markMastered,
    preferences,
    playIntro,
    finishIntro,
    dispose() {
      disposed = true;
      window.clearTimeout(warmupTimer);
      resolveReady(false);
      if (queued) cancelAnimationFrame(queued);
      observer.disconnect();
      window.removeEventListener("resize", invalidate);
      controls.removeEventListener("change", invalidate);
      controls.dispose();
      canvas.removeEventListener("pointerdown", pointerDown);
      canvas.removeEventListener("pointerup", pointerUp);
      canvas.removeEventListener("pointermove", pointerMove);
      canvas.removeEventListener("pointerleave", clearPointer);
      canvas.removeEventListener("pointercancel", clearPointer);
      document.removeEventListener("visibilitychange", visibilityChanged);
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
