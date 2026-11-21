import * as T from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { DESTINATIONS, VIEW } from "./layout";
import { palette } from "./primitives";
import { book } from "./book";
import { pathway } from "./path";
import { terrain } from "./terrain";
import { atmosphere } from "./atmosphere";
import { buildings, compass } from "./architecture";

export type AtlasRuntime = {
  reset: () => void;
  dispose: () => void;
};

const plaqueOffsets = [
  new T.Vector3(0, .45, 1.46),
  new T.Vector3(1.35, .54, 1.67),
  new T.Vector3(0, .43, 1.60),
  new T.Vector3(0, .49, 1.62),
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
  labels: (HTMLSpanElement | null)[],
  onAvailabilityChange: (available: boolean) => void,
): AtlasRuntime {
  const renderer = new T.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
  renderer.setClearColor(0x021f24);
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.04;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  const canvas = renderer.domElement;
  canvas.setAttribute("aria-hidden", "true");

  const scene = new T.Scene();
  scene.fog = new T.FogExp2(0x265855, .012);
  let environment = makeEnvironment(renderer);
  scene.environment = environment.texture;
  scene.environmentIntensity = .43;
  scene.add(new T.HemisphereLight(0xa5ece5, 0x244441, .99));
  const key = new T.DirectionalLight(0xffd29b, 2.65);
  key.position.set(-8, 13, 10);
  key.target.position.set(1, 1.5, -1);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -19, right: 19, top: 21, bottom: -17, near: 1, far: 66 });
  key.shadow.normalBias = .045;
  key.shadow.bias = -.0008;
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
  for (const { site: [x, y, z] } of DESTINATIONS) {
    const entrance = new T.PointLight(0xffae56, 12, 5, 2);
    entrance.position.set(x, y + 1.15, z + 1.91);
    scene.add(entrance);
  }

  const p = palette();
  atmosphere(scene);
  const islands = terrain(scene, p);
  const spine = book(scene, p);
  const road = pathway(scene, p);
  const havens = buildings(scene, p);
  const north = compass(scene, p);
  for (const asset of [islands, spine, road, ...havens, north]) {
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
  let queued = 0;
  let disposed = false;
  function draw() {
    queued = 0;
    if (disposed) return;
    renderer.render(scene, camera);
    for (let i = 0; i < anchors.length; i++) {
      const label = labels[i];
      if (!label) continue;
      const centered = anchors[i].clone().project(camera);
      label.style.left = ((centered.x + 1) * 50) + "%";
      label.style.top = ((1 - centered.y) * 50) + "%";
      label.hidden = centered.x < -.97 || centered.x > .97 || centered.y < -.97 || centered.y > .97 || Math.abs(centered.z) > 1;
    }
  }

  function invalidate() {
    if (!disposed && !queued) queued = requestAnimationFrame(draw);
  }

  function resize() {
    const { clientWidth: width, clientHeight: height } = surface;
    if (!width || !height) return;
    const aspect = width / height;
    camera.aspect = aspect;
    camera.fov = aspect >= 1.69 ? VIEW.fov
      : T.MathUtils.radToDeg(2 * Math.atan(Math.tan(T.MathUtils.degToRad(VIEW.fov / 2)) * 1.69 / aspect));
    camera.updateProjectionMatrix();
    const pixelBudget = 1_800_000;
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.65, Math.sqrt(pixelBudget / (width * height))));
    renderer.setSize(width, height, false);
    invalidate();
  }

  function reset() {
    camera.position.set(...VIEW.eye);
    controls.target.set(...VIEW.target);
    controls.update();
    invalidate();
  }

  function contextLost(event: Event) {
    event.preventDefault();
    onAvailabilityChange(false);
  }

  function contextRestored() {
    environment.dispose();
    environment = makeEnvironment(renderer);
    scene.environment = environment.texture;
    renderer.shadowMap.needsUpdate = true;
    onAvailabilityChange(true);
    invalidate();
  }

  surface.appendChild(canvas);
  canvas.addEventListener("webglcontextlost", contextLost);
  canvas.addEventListener("webglcontextrestored", contextRestored);
  controls.addEventListener("change", invalidate);
  const observer = new ResizeObserver(resize);
  observer.observe(surface);
  reset();
  resize();
  renderer.shadowMap.needsUpdate = true;

  return {
    reset,
    dispose() {
      disposed = true;
      if (queued) cancelAnimationFrame(queued);
      observer.disconnect();
      controls.removeEventListener("change", invalidate);
      controls.dispose();
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
      environment.dispose();
      key.shadow.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
}
