import * as T from "three";

// CC0 textures from Poly Haven: mossy_rock, old_sandstone_02 and brown_leather.
// Keep them on the app origin and share the texture objects between materials.
export function dressAtlas(
  renderer: T.WebGLRenderer,
  surfaces: { rock: T.MeshStandardMaterial; stone: T.MeshStandardMaterial; paving: T.MeshStandardMaterial; cover: T.MeshStandardMaterial },
  quality: { compact: boolean; software: boolean },
  redraw: () => void,
) {
  const loader = new T.TextureLoader();
  const pending: Promise<void>[] = [];
  function load(name: string, color = false) {
    let settle!: () => void;
    pending.push(new Promise<void>((resolve) => { settle = resolve; }));
    const texture = loader.load("/atlas/" + name + ".webp", () => {
      settle();
      redraw();
    }, undefined, settle);
    texture.colorSpace = color ? T.SRGBColorSpace : T.NoColorSpace;
    texture.wrapS = texture.wrapT = T.RepeatWrapping;
    texture.anisotropy = Math.min(quality.compact ? 4 : 12, renderer.capabilities.getMaxAnisotropy());
    return texture;
  }
  const { rock, stone, paving, cover } = surfaces;
  rock.map = load("rock-color", true);
  stone.map = paving.map = load("stone-color", true);
  stone.color.setHex(0xcfbda3);
  paving.color.setHex(0xffedcc);
  cover.map = load("leather-color", true);
  cover.color.setHex(0xb2a081);
  if (!quality.software) {
    rock.normalMap = load("rock-normal");
    rock.normalScale.setScalar(.78);
    stone.normalMap = paving.normalMap = load("stone-normal");
    stone.normalScale.setScalar(.42);
    paving.normalScale.setScalar(.34);
  }
  if (!quality.compact) {
    rock.roughnessMap = rock.aoMap = load("rock-surface");
    rock.aoMapIntensity = .75;
    cover.normalMap = load("leather-normal");
    cover.normalScale.setScalar(.54);
  }
  return Promise.all(pending);
}
