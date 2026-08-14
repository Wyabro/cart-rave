/**
 * cartThemes.js — Runtime cart theme application (materials, wheel modules, props).
 *
 * Flow:
 * 1. `buildCart(colorHex)` creates the wireframe skeleton (cart.js).
 * 2. `applyCartTheme(root, themeId, neonHex)` applies theme presets and modules.
 * 3. `buildCartThemeMaterialCache(mesh)` tags frame vs accent mats for sync.
 * 4. `applyThemeColorToCache(cache, themeId, neonHex)` re-tints without clobbering theme PBR.
 */

import * as THREE from "three";
import { createPhysicalMaterial, getMaterialEnvMapIntensity } from "../scene.js";
import { getCartTheme, normalizeThemeId } from "./cartThemeConfig.js";
import { cartEmissiveIntensityForHex, emissiveRefHexForNeonHex } from "../utils.js";
import {
  applyRaveGltfColorToCache,
  applyRaveGltfLeaderGlow,
  buildRaveGltfMaterialCache,
  setEmissiveTrimMul,
} from "./cartRaveGltf.js";
import { applyCartPattern } from "./cartPatterns.js";

/** @typedef {import("./cartThemeConfig.js").CartThemeId} CartThemeId */
/** @typedef {import("./cartThemeConfig.js").CartThemeDef} CartThemeDef */

const PROPS_GROUP_NAME = "CartThemeProps";

const CHROME_ENV_SCALE = 1.35;
/**
 * @typedef {Object} CartThemeMaterialCache
 * @property {boolean} [isRaveGltf] - true for GLTF cart material caches
 * @property {THREE.MeshStandardMaterial[]} frameMats - all tintable body/accent materials
 * @property {THREE.MeshStandardMaterial[]} frameBodyMats - basket/chassis frame
 * @property {THREE.MeshStandardMaterial[]} accentMats - hubs, pads, emissive trim
 * @property {THREE.MeshStandardMaterial[]} frameGlowMats - materials with emissive (leader/boost loop)
 * @property {number} [emissiveTrimMul] - FIX-EMISSIVE trim for a cart with no pattern (default 1).
 *   Lives on the CACHE, not on a call argument, because the every-frame leader-glow loop rewrites
 *   these materials with an implicit `intensityMul = 1`. Written by `setEmissiveTrimMul`.
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

const MATERIAL_TEXTURE_SLOTS = ["map", "emissiveMap", "normalMap", "roughnessMap"];

/**
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
    const c = /** @type {any} */ (child);
    if (!c.isMesh) return;
    if (c.userData?.isSharedGeometry) return;
    if (c.userData?.isThemeGeometry && c.geometry) {
      if (!disposedGeos.has(c.geometry)) {
        disposedGeos.add(c.geometry);
        c.geometry.dispose?.();
      }
    }
    if (c.userData?.isThemeProp && c.material) {
      disposeMaterialOnce(c.material, disposedMats, disposedTextures);
    }
  });
}

/**
 * @param {THREE.Material | null | undefined} mat
 * @param {import("./cartThemeConfig.js").CartFrameMaterialPreset} preset
 */
function applyFrameMaterialPreset(mat, preset) {
  if (!mat) return;
  mat.userData.themeLocked = true;
  // @ts-expect-error THREE duck-typing suppress
  if (typeof mat.metalness === "number") mat.metalness = preset.metalness;
  // @ts-expect-error THREE duck-typing suppress
  if (typeof mat.roughness === "number") mat.roughness = preset.roughness;
  // @ts-expect-error THREE duck-typing suppress
  if (typeof mat.clearcoat === "number") mat.clearcoat = preset.clearcoat;
  // @ts-expect-error THREE duck-typing suppress
  if (typeof mat.clearcoatRoughness === "number") mat.clearcoatRoughness = preset.clearcoatRoughness;
  if (typeof mat.toneMapped === "boolean") mat.toneMapped = preset.toneMapped;
  // @ts-expect-error THREE duck-typing suppress
  if (typeof mat.envMapIntensity === "number") {
    // @ts-expect-error THREE duck-typing suppress
    mat.envMapIntensity = getMaterialEnvMapIntensity() * (preset.metalness > 0.7 ? CHROME_ENV_SCALE : 0.85);
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
  // @ts-expect-error THREE duck-typing suppress
  if (mat.color) mat.color.setHex(hex);
  // @ts-expect-error THREE duck-typing suppress
  if (mat.emissive) mat.emissive.setHex(hex);
  // @ts-expect-error THREE duck-typing suppress
  if (typeof mat.emissiveIntensity === "number") {
    // @ts-expect-error THREE duck-typing suppress
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
      const c = /** @type {any} */ (child);
      if (c.isMesh) c.userData.cartMatRole = "frame";
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
    const c = /** @type {any} */ (child);
    if (!c.isMesh) return;
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
  void theme;
  const handleMesh = getNamedChild(root, "CartHandle");
  const hm = /** @type {any} */ (handleMesh);
  if (!hm?.isMesh || !hm.material) return;

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
  const oldMat = hm.material;
  hm.material = mat;
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
    const c = /** @type {any} */ (child);
    if (!c.isMesh) return;
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
 * @param {THREE.Object3D} root
 */
function applyWheelModule(root) {
  setCasterVisualVisibility(root, true);
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
 * @param {CartThemeDef} theme
 */
function applyPatternPolicy(root, theme) {
  if (theme.patternPolicy !== "disable") return;
  // * Pattern lives in the CartFrame body material now — disable it by clearing to "classic".
  applyCartPattern(root, "classic");
  // * FIX-EMISSIVE, defensive only: no shipped theme sets "disable", so this branch is currently
  // * unreachable. Stamped anyway so a future theme cannot go classic without the trim.
  setEmissiveTrimMul(null, "classic", root);
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
    const c = /** @type {any} */ (child);
    if (!c.isMesh || !c.material) return;
    const ud = c.userData || {};
    if (ud.isFace || ud.isHandle || ud.isWheel) return;
    if (ud.isThemeProp && ud.cartMatRole !== "accent" && !ud.receivesPlayerAccent) return;

    forEachMaterial(c.material, (mat) => {
      if (seen.has(mat)) return;
      seen.add(mat);
      if (ud.cartMatRole === "accent") accentMats.push(mat);
      else frameBodyMats.push(mat);
      frameMats.push(mat);
      const m = /** @type {any} */ (mat);
      if (m.emissive) frameGlowMats.push(mat);
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

  const c = /** @type {any} */ (cache);
  if (c.isRaveGltf) {
    applyRaveGltfColorToCache(cache, neonHex, intensityMul);
    return;
  }

  const theme = getCartTheme(themeId);
  const emMul = (theme.frameMaterial.emissiveMul ?? 1) * intensityMul;
  for (const mat of cache.frameMats) applyTintToMaterial(mat, neonHex, theme, emMul);
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
  void themeId;
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

  const c = /** @type {any} */ (cache);
  if (c.isRaveGltf) {
    applyRaveGltfLeaderGlow(cache, neonHex, glowPulse, glowIntensity);
    return;
  }

  for (const mat of cache.frameGlowMats) pulseMat(mat, neonHex);
}

/**
 * Charge-boost 3D telegraph: ramps frame emissive with charge 0..1 (smoothstep).
 * Near full charge, a low white-mix pulse signals "ready" without matching leader glow.
 *
 * @param {CartThemeMaterialCache | null | undefined} cache
 * @param {CartThemeId | string} themeId
 * @param {number} neonHex
 * @param {number} charge01 0..1 charge progress
 * @param {number} [nowMs=0] performance.now() for ready pulse
 * @param {{
 *   glowPeakIntensityMul?: number,
 *   glowReadyThreshold?: number,
 *   glowReadyWhiteMixMin?: number,
 *   glowReadyWhiteMixMax?: number,
 *   glowReadyPulseHz?: number,
 * }} [glowCfg]
 * @returns {void}
 */
export function applyThemeChargeGlow(
  cache,
  themeId,
  neonHex,
  charge01,
  nowMs = 0,
  glowCfg = {},
) {
  if (!cache) return;

  const t = Math.min(Math.max(Number(charge01) || 0, 0), 1);
  // * Smoothstep so early charge is subtle and the last third ramps hard.
  const s = t * t * (3 - 2 * t);
  if (s <= 0.001) {
    applyThemeColorToCache(cache, themeId, neonHex, 1);
    return;
  }

  const peakMul = Number(glowCfg.glowPeakIntensityMul) > 0
    ? Number(glowCfg.glowPeakIntensityMul)
    : 1.95;
  const readyThreshold = Number.isFinite(glowCfg.glowReadyThreshold)
    ? /** @type {number} */ (glowCfg.glowReadyThreshold)
    : 0.92;
  const whiteMin = Number.isFinite(glowCfg.glowReadyWhiteMixMin)
    ? /** @type {number} */ (glowCfg.glowReadyWhiteMixMin)
    : 0.08;
  const whiteMax = Number.isFinite(glowCfg.glowReadyWhiteMixMax)
    ? /** @type {number} */ (glowCfg.glowReadyWhiteMixMax)
    : 0.26;
  const pulseHz = Number(glowCfg.glowReadyPulseHz) > 0
    ? Number(glowCfg.glowReadyPulseHz)
    : 6;

  const intensityMul = 1 + s * (peakMul - 1);

  if (s >= readyThreshold && nowMs > 0) {
    const readyWave = (Math.sin(nowMs * 0.001 * Math.PI * 2 * pulseHz) + 1) / 2;
    const whiteMix = whiteMin + (whiteMax - whiteMin) * readyWave;
    // * Leader glow uses whiteMix = glowPulse ** 3 — invert so we control mix directly.
    const glowPulse = Math.cbrt(Math.min(Math.max(whiteMix, 0), 1));
    const baseIntensity = cartEmissiveIntensityForHex(emissiveRefHexForNeonHex(neonHex));
    const glowIntensity = baseIntensity * intensityMul;
    applyThemeLeaderGlow(cache, themeId, neonHex, glowPulse, glowIntensity);
    return;
  }

  applyThemeColorToCache(cache, themeId, neonHex, intensityMul);
}

/**
 * Normalized charge progress for a cart currently holding boost charge.
 *
 * @param {boolean} isCharging
 * @param {number} startedAtMs
 * @param {number} nowMs
 * @param {number} chargeTimeMs
 * @returns {number} 0..1
 */
export function boostChargeProgress01(isCharging, startedAtMs, nowMs, chargeTimeMs) {
  if (!isCharging) return 0;
  const dur = chargeTimeMs > 0 ? chargeTimeMs : 1500;
  // * Use nullish so startedAtMs === 0 is a valid timestamp (|| would treat 0 as missing).
  const start = startedAtMs ?? nowMs;
  const elapsed = nowMs - start;
  if (!(elapsed > 0)) return 0;
  return Math.min(elapsed / dur, 1);
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
  const fm = /** @type {any} */ (frameMesh);
  if (fm?.isMesh && fm.material) {
    forEachMaterial(fm.material, (mat) => {
      applyFrameMaterialPreset(mat, theme.frameMaterial);
    });
  }

  applyHandleStyle(root, theme);
  applyWheelModule(root);
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
      const c = /** @type {any} */ (child);
      if (!c.isMesh || !c.material) return;
      forEachMaterial(c.material, (mat) => {
        disposeMaterialTextures(mat, disposedTex);
      });
    });
  }
}
