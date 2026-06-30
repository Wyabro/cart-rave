/**
 * cartThemes.js — Runtime cart theme application (materials, wheel modules, props).
 *
 * Flow:
 * 1. `buildCart(colorHex)` creates the wireframe skeleton (cart.js).
 * 2. `applyCartTheme(root, themeId, neonHex)` applies theme presets, modules, and props.
 * 3. `buildCartThemeMaterialCache(mesh)` tags frame vs accent mats for sync.
 * 4. `applyThemeColorToCache(cache, themeId, neonHex)` re-tints without clobbering theme PBR.
 */

import * as THREE from "three";
import { createPhysicalMaterial, getMaterialEnvMapIntensity } from "./scene.js";
import { getCartTheme, normalizeThemeId } from "./cartThemeConfig.js";
import { cartEmissiveIntensityForHex, emissiveRefHexForNeonHex } from "./utils.js";
import { applyRaveGltfColorToCache, applyRaveGltfLeaderGlow, buildRaveGltfMaterialCache } from "./cartRaveGltf.js";

/** @typedef {import("./cartThemeConfig.js").CartThemeId} CartThemeId */
/** @typedef {import("./cartThemeConfig.js").CartThemeDef} CartThemeDef */

const PROPS_GROUP_NAME = "CartThemeProps";

const CHROME_ENV_SCALE = 1.35;
/**
 * @typedef {Object} CartThemeMaterialCache
 * @property {THREE.Material[]} frameMats — all tintable body/accent materials
 * @property {THREE.Material[]} frameBodyMats — basket/chassis frame
 * @property {THREE.Material[]} accentMats — hubs, pads, emissive trim
 * @property {THREE.Material[]} frameGlowMats — materials with emissive (leader/boost loop)
 */

/**
 * @param {THREE.Material | THREE.Material[] | null | undefined} material
 * @param {(m: THREE.Material) => void} add
 */
function forEachMaterial(material, add) {
  if (!material) return;
  if (Array.isArray(material)) {
    material.forEach((m) => m && add(m));
    return;
  }
  add(material);
}

/**
 * @param {THREE.Object3D} root
 * @param {string} name
 * @returns {THREE.Object3D | null}
 */
function getNamedChild(root, name) {
  if (!root) return null;
  return root.getObjectByName(name);
}

/**
 * @param {THREE.Object3D} root
 * @param {string} name
 */
function removeNamedGroup(root, name) {
  const existing = getNamedChild(root, name);
  if (!existing) return;
  disposeThemeSubtree(existing);
  root.remove(existing);
}

const MATERIAL_TEXTURE_SLOTS = ["map", "emissiveMap", "normalMap", "roughnessMap"];

/**
 * Disposes every GPU-backed texture slot on a material exactly once.
 *
 * @param {THREE.Material} mat
 * @param {Set<THREE.Texture>} [disposedTextures]
 */
function disposeMaterialTextures(mat, disposedTextures) {
  if (!mat) return;
  const seen = disposedTextures ?? new Set();
  for (const slot of MATERIAL_TEXTURE_SLOTS) {
    /** @type {THREE.Texture | null | undefined} */
    const tex = /** @type {any} */ (mat)[slot];
    if (!tex || seen.has(tex)) continue;
    seen.add(tex);
    tex.dispose?.();
  }
}

/**
 * Replaces a single texture slot on a material, disposing the previous texture
 * if it is about to be orphaned. Returns true when an old texture was disposed.
 *
 * @param {THREE.Material} mat
 * @param {"map" | "emissiveMap" | "normalMap" | "roughnessMap"} slot
 * @param {THREE.Texture | null | undefined} newTex
 * @returns {boolean}
 */
function replaceMaterialMap(mat, slot, newTex) {
  const oldTex = /** @type {any} */ (mat)[slot];
  if (oldTex && oldTex !== newTex) {
    oldTex.dispose?.();
    return true;
  }
  /** @type {any} */ (mat)[slot] = newTex;
  return false;
}

/**
 * @param {THREE.Material | THREE.Material[] | null | undefined} material
 * @param {Set<THREE.Material>} disposedMats
 * @param {Set<THREE.Texture>} [disposedTextures]
 */
function disposeMaterialOnce(material, disposedMats, disposedTextures) {
  const mats = Array.isArray(material) ? material : [material];
  for (const mat of mats) {
    if (!mat || disposedMats.has(mat)) continue;
    disposedMats.add(mat);
    disposeMaterialTextures(mat, disposedTextures);
    mat.dispose?.();
  }
}

/**
 * @param {THREE.Object3D} node
 */
function disposeThemeSubtree(node) {
  const disposedGeos = new Set();
  const disposedMats = new Set();
  const disposedTextures = new Set();
  node.traverse((child) => {
    if (!child.isMesh) return;
    if (child.userData?.isSharedGeometry) return;
    if (child.userData?.isThemeGeometry && child.geometry) {
      if (!disposedGeos.has(child.geometry)) {
        disposedGeos.add(child.geometry);
        child.geometry.dispose?.();
      }
    }
    if (child.userData?.isThemeProp && child.material) {
      disposeMaterialOnce(child.material, disposedMats, disposedTextures);
    }
  });
}

/**
 * @param {THREE.Material | null | undefined} mat
 * @param {import("./cartThemeConfig.js").CartFrameMaterialPreset} preset
 * @param {import("./cartThemeConfig.js").CartGhostMaterialPreset} [ghost]
 */
function applyFrameMaterialPreset(mat, preset, ghost) {
  if (!mat) return;
  mat.userData.themeLocked = true;
  if (typeof mat.metalness === "number") mat.metalness = preset.metalness;
  if (typeof mat.roughness === "number") mat.roughness = preset.roughness;
  if (typeof mat.clearcoat === "number") mat.clearcoat = preset.clearcoat;
  if (typeof mat.clearcoatRoughness === "number") mat.clearcoatRoughness = preset.clearcoatRoughness;
  if (typeof mat.toneMapped === "boolean") mat.toneMapped = preset.toneMapped;
  if (typeof mat.envMapIntensity === "number") {
    mat.envMapIntensity = getMaterialEnvMapIntensity() * (preset.metalness > 0.7 ? CHROME_ENV_SCALE : 0.85);
  }
  if (ghost && "transmission" in mat) {
    const phys = /** @type {THREE.MeshPhysicalMaterial} */ (mat);
    phys.transparent = true;
    phys.opacity = ghost.opacity;
    phys.transmission = ghost.transmission;
    phys.ior = ghost.ior;
    phys.thickness = 0.35;
    phys.depthWrite = false;
  }
}

/**
 * @param {THREE.Material | null | undefined} mat
 * @param {number} hex
 * @param {CartThemeDef} theme
 * @param {number} [intensityMul=1]
 */
function applyTintToMaterial(mat, hex, theme, intensityMul = 1) {
  if (!mat) return;
  const refHex = emissiveRefHexForNeonHex(hex);
  const emMul = (theme.frameMaterial.emissiveMul ?? 1) * intensityMul;
  if (mat.color) mat.color.setHex(hex);
  if (mat.emissive) mat.emissive.setHex(hex);
  if (typeof mat.emissiveIntensity === "number") {
    mat.emissiveIntensity = cartEmissiveIntensityForHex(refHex, emMul);
  }
}

/**
 * @param {THREE.Object3D} root
 */
function tagFrameAndAccentMeshes(root) {
  const frameMesh = getNamedChild(root, "CartFrame");
  if (frameMesh) {
    frameMesh.traverse((child) => {
      if (child.isMesh) child.userData.cartMatRole = "frame";
    });
  }

  const cartVisual = root.userData.cartVisual;
  const pitchGroups = cartVisual?.wheelPitchObjects || [];
  for (const pitchGroup of pitchGroups) {
    pitchGroup?.traverse((child) => {
      if (!child.isMesh || child.userData?.isWheel) return;
      child.userData.cartMatRole = "accent";
    });
  }

  root.traverse((child) => {
    if (!child.isMesh) return;
    if (child.userData?.receivesPlayerAccent || child.userData?.cartMatRole === "accent") {
      child.userData.cartMatRole = "accent";
    }
  });
}

/**
 * @param {THREE.Object3D} root
 * @param {CartThemeDef} theme
 */
function applyHandleStyle(root, theme) {
  const handleMesh = getNamedChild(root, "CartHandle");
  if (!handleMesh?.isMesh || !handleMesh.material) return;

  /** @type {THREE.MeshPhysicalMaterial} */
  const mat = createPhysicalMaterial({
    color: 0x18181f,
    metalness: 0.95,
    roughness: 0.28,
    clearcoat: 0.55,
    clearcoatRoughness: 0.12,
    envMapIntensity: getMaterialEnvMapIntensity() * CHROME_ENV_SCALE,
  });
  mat.userData.themeLocked = true;
  const oldMat = handleMesh.material;
  handleMesh.material = mat;
  // ! Route through disposeMaterialOnce so theme-applied textures on the
  // ! previous handle material (wood/grip/rust) are freed alongside it.
  if (oldMat && !Array.isArray(oldMat) && oldMat !== mat) {
    disposeMaterialOnce(oldMat, new Set(), new Set());
  }
}

// === Wheel Modules ===

/**
 * @param {THREE.Object3D} root
 * @param {boolean} visible
 */
function setCasterVisualVisibility(root, visible) {
  root.traverse((child) => {
    if (!child.isMesh) return;
    if (child.userData?.isWheel) child.visible = visible;
  });

  const cartVisual = root.userData.cartVisual;
  for (const pitchGroup of cartVisual?.wheelPitchObjects || []) {
    for (const child of pitchGroup.children) {
      if (child.isMesh && !child.userData?.isWheel) {
        child.visible = visible;
      }
    }
  }
}

/**
 * Applies the standard wheel setup. Rave carts use standard casters;
 * GLTF carts handle their own wheel visuals.
 *
 * @param {THREE.Object3D} root
 * @param {CartThemeDef} theme
 * @param {number} neonHex
 */
function applyWheelModule(root, theme, neonHex) {
  setCasterVisualVisibility(root, true);
  void theme;
  void neonHex;
}

/**
 * @param {THREE.Object3D} root
 * @param {CartThemeDef} theme
 */
function applyFacePolicy(root, theme) {
  // * Rave GLTF carts parent their sunglasses assembly under "RaveGltfFaceGroup"
  // * (see groupRaveGltfFaceAssembly in cartRaveGltf.js); procedural carts use
  // * "BasketFace" (see cart.js). Look up both so the policy applies on either path.
  const faceGroup = getNamedChild(root, "RaveGltfFaceGroup")
    ?? getNamedChild(root, "BasketFace");
  if (!faceGroup) return;

  const hideFace = theme.facePolicy === "hidden" || theme.facePolicy === "themed";
  faceGroup.visible = !hideFace;
}

/**
 * @param {THREE.Object3D} root
 * @param {THREE.Group} group
 * @param {CartThemeDef} theme
 * @param {number} neonHex
 */
function buildThemeProps(root, group, theme, neonHex) {
  for (const propId of theme.propIds) {
    switch (propId) {
      default:
        break;
    }
  }

  void root;
  void group;
  void neonHex;
}

/**
 * @param {THREE.Object3D} root
 * @param {CartThemeDef} theme
 * @param {number} neonHex
 */
function rebuildThemeProps(root, theme, neonHex) {
  removeNamedGroup(root, PROPS_GROUP_NAME);
  if (!theme.propIds.length) return;

  const group = new THREE.Group();
  group.name = PROPS_GROUP_NAME;
  buildThemeProps(root, group, theme, neonHex);
  root.add(group);
}

/**
 * @param {THREE.Object3D} root
 * @param {CartThemeDef} theme
 */
function applyPatternPolicy(root, theme) {
  if (theme.patternPolicy !== "disable") return;
  const patternMesh = getNamedChild(root, "CartFramePattern");
  if (patternMesh) patternMesh.visible = false;
}

/**
 * @param {THREE.Object3D} cartMesh
 * @returns {CartThemeMaterialCache}
 */
export function buildCartThemeMaterialCache(cartMesh) {
  if (cartMesh?.userData?.isRaveGltf) {
    return buildRaveGltfMaterialCache(cartMesh);
  }

  const frameMats = [];
  const frameBodyMats = [];
  const accentMats = [];
  const frameGlowMats = [];
  const seen = new Set();

  cartMesh.traverse((child) => {
    if (!child.isMesh || !child.material) return;
    const ud = child.userData || {};
    if (ud.isFace || ud.isHandle || ud.isWheel || ud.isCartPatternLayer) return;
    if (ud.isThemeProp && ud.cartMatRole !== "accent" && !ud.receivesPlayerAccent) return;

    forEachMaterial(child.material, (mat) => {
      if (seen.has(mat)) return;
      seen.add(mat);
      if (ud.cartMatRole === "accent") accentMats.push(mat);
      else frameBodyMats.push(mat);
      frameMats.push(mat);
      if (mat.emissive) frameGlowMats.push(mat);
    });
  });

  return { frameMats, frameBodyMats, accentMats, frameGlowMats };
}

/**
 * Theme-aware color tint — does not overwrite theme-owned PBR params.
 *
 * @param {CartThemeMaterialCache | null | undefined} cache
 * @param {CartThemeId | string} themeId
 * @param {number} neonHex
 * @param {number} [intensityMul=1]
 */
export function applyThemeColorToCache(cache, themeId, neonHex, intensityMul = 1) {
  if (!cache) return;

  if (cache.isRaveGltf) {
    applyRaveGltfColorToCache(cache, neonHex, intensityMul);
    return;
  }

  const theme = getCartTheme(themeId);
  const { colorPolicy, baseHex, accentHex } = theme;
  const bodyMul = intensityMul;
  const accentMul = intensityMul;

  if (colorPolicy === "neonFull") {
    for (const mat of cache.frameMats) applyTintToMaterial(mat, neonHex, theme, bodyMul);
    return;
  }

  const bodyEmMul = bodyMul * 0.3;
  for (const mat of cache.frameBodyMats) applyTintToMaterial(mat, baseHex, theme, bodyEmMul);

  if (colorPolicy === "accentTint") {
    for (const mat of cache.accentMats) applyTintToMaterial(mat, neonHex, theme, accentMul);
  } else if (colorPolicy === "fixedBase") {
    for (const mat of cache.accentMats) applyTintToMaterial(mat, accentHex, theme, accentMul * 0.5);
  }
}

/**
 * Leader pulse that respects theme color roles.
 *
 * @param {CartThemeMaterialCache} cache
 * @param {CartThemeId | string} themeId
 * @param {number} neonHex
 * @param {number} glowPulse 0–1
 * @param {number} glowIntensity
 */
export function applyThemeLeaderGlow(cache, themeId, neonHex, glowPulse, glowIntensity) {
  const theme = getCartTheme(themeId);
  const whiteMix = glowPulse ** 3;
  const baseIntensity = cartEmissiveIntensityForHex(emissiveRefHexForNeonHex(neonHex));

  const pulseMat = (mat, hex) => {
    if (!mat?.emissive) return;
    const r = ((hex >> 16) & 255) / 255;
    const g = ((hex >> 8) & 255) / 255;
    const b = (hex & 255) / 255;
    mat.emissive.setRGB(
      r + (1 - r) * whiteMix,
      g + (1 - g) * whiteMix,
      b + (1 - b) * whiteMix,
    );
    if (mat.color) mat.color.setHex(hex);
    if (typeof mat.emissiveIntensity === "number") {
      mat.emissiveIntensity = baseIntensity * (1 - whiteMix) + glowIntensity * whiteMix;
    }
  };

  if (cache.isRaveGltf) {
    applyRaveGltfLeaderGlow(cache, neonHex, glowPulse, glowIntensity);
    return;
  }

  if (theme.colorPolicy === "neonFull") {
    for (const mat of cache.frameGlowMats) pulseMat(mat, neonHex);
    return;
  }

  for (const mat of cache.frameBodyMats) pulseMat(mat, theme.baseHex);
  const accentHex = theme.colorPolicy === "fixedBase" ? theme.accentHex : neonHex;
  for (const mat of cache.accentMats) pulseMat(mat, accentHex);
}

/**
 * @param {THREE.Object3D | null | undefined} root
 * @param {CartThemeId | string} themeId
 * @param {number} neonHex
 */
export function applyCartTheme(root, themeId, neonHex) {
  if (!root) return;

  const theme = getCartTheme(themeId);
  const id = normalizeThemeId(themeId);
  root.userData.cartThemeId = id;

  const frameMesh = getNamedChild(root, "CartFrame");
  if (frameMesh?.isMesh && frameMesh.material) {
    forEachMaterial(frameMesh.material, (mat) => {
      applyFrameMaterialPreset(mat, theme.frameMaterial, theme.ghost);
    });
  }

  applyHandleStyle(root, theme);
  applyWheelModule(root, theme, neonHex);
  rebuildThemeProps(root, theme, neonHex);
  applyFacePolicy(root, theme);
  applyPatternPolicy(root, theme);
  tagFrameAndAccentMeshes(root);

  const cache = buildCartThemeMaterialCache(root);
  applyThemeColorToCache(cache, id, neonHex);
}

/**
 * Disposes per-cart theme-only geometries/materials (props, pads, whitewalls).
 * Also disposes theme-applied textures on the CartFrame body materials so the
 * GPU memory is released when the cart is destroyed.
 * @param {THREE.Object3D | null | undefined} mesh
 */
export function disposeCartThemeResources(mesh) {
  if (!mesh) return;
  const propsGroup = getNamedChild(mesh, PROPS_GROUP_NAME);
  if (propsGroup) {
    disposeThemeSubtree(propsGroup);
    mesh.remove(propsGroup);
  }

  const disposedTex = new Set();
  const frameMesh = getNamedChild(mesh, "CartFrame");
  if (frameMesh) {
    frameMesh.traverse((child) => {
      if (!child.isMesh || !child.material) return;
      forEachMaterial(child.material, (mat) => {
        disposeMaterialTextures(mat, disposedTex);
      });
    });
  }
}
