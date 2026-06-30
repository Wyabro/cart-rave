/**
 * cartPreviewGltf.js — Menu preview adapter for the shared rave GLTF cart (`cartRaveGltf.js`).
 */

import { DEFAULT_CART_THEME, normalizeThemeId } from "../cartThemeConfig.js";
import { applyThemeColorToCache } from "../cartThemes.js";
import { cartEmissiveIntensityForHex, emissiveRefHexForNeonHex } from "../utils.js";
import {
  RAVE_GLTF_URL,
  RAVE_GLTF_URL_DRACO,
  buildRaveGltfMaterialCache,
  createRaveGltfCartInstance,
  disposeRaveGltfInstance,
  isRaveGltfSourceReady,
  prefetchRaveGltf,
  prepareRaveGltfCart,
} from "../cartRaveGltf.js";

/** @typedef {import("../cartThemes.js").CartThemeMaterialCache} CartThemeMaterialCache */

export const PREVIEW_GLTF_DEFAULT = {
  url: RAVE_GLTF_URL,
  urlFallback: RAVE_GLTF_URL_DRACO,
  scale: 1,
  rotationY: 0,
  frameMeshName: "tripo_part_0",
  accentMeshNames: [],
};

/** @type {Partial<Record<string, typeof PREVIEW_GLTF_DEFAULT>>} */
export const PREVIEW_GLTF_BY_THEME = {};

/**
 * @param {string} themeId
 * @returns {typeof PREVIEW_GLTF_DEFAULT}
 */
export function resolvePreviewGltfDef(themeId) {
  const id = normalizeThemeId(themeId);
  return { ...PREVIEW_GLTF_DEFAULT, ...PREVIEW_GLTF_BY_THEME[id] };
}

/**
 * @param {string} [themeId]
 * @returns {Promise<unknown>}
 */
export function prefetchPreviewCartGltf(themeId = DEFAULT_CART_THEME) {
  if (normalizeThemeId(themeId) !== "rave") return Promise.resolve(null);
  return prefetchRaveGltf();
}

/**
 * @param {string} [themeId]
 * @returns {boolean}
 */
export function isPreviewGltfCached(themeId = DEFAULT_CART_THEME) {
  return normalizeThemeId(themeId) === "rave" && isRaveGltfSourceReady();
}

/**
 * @param {string} themeId
 * @param {string | null | undefined} [sunglassesStyle] — SunglassesStyleDef id forwarded to the GLTF instance; defaults to silver mirror when omitted.
 * @returns {Promise<import("three").Group>}
 */
export async function loadPreviewCartGltf(themeId, sunglassesStyle) {
  if (normalizeThemeId(themeId) !== "rave") {
    throw new Error("[CartPreviewGltf] GLTF preview is only used for the rave theme.");
  }

  await prefetchRaveGltf();
  const root = createRaveGltfCartInstance(sunglassesStyle);
  const def = resolvePreviewGltfDef(themeId);

  if (def.scale !== 1) root.scale.setScalar(def.scale);
  if (def.rotationY) root.rotation.y = def.rotationY;

  return root;
}

/**
 * @param {import("three").Object3D} root
 * @param {string} themeId
 * @param {number} neonHex
 * @param {string} patternId
 * @returns {CartThemeMaterialCache}
 */
export function preparePreviewCartGltf(root, themeId, neonHex, patternId) {
  const id = normalizeThemeId(themeId);
  if (id !== "rave") {
    throw new Error("[CartPreviewGltf] preparePreviewCartGltf expects rave theme.");
  }

  return prepareRaveGltfCart(root, neonHex, patternId);
}

/**
 * @param {import("three").Object3D} root
 * @param {typeof PREVIEW_GLTF_DEFAULT} _def
 * @returns {CartThemeMaterialCache}
 */
export function buildPreviewGltfMaterialCache(root, _def) {
  return buildRaveGltfMaterialCache(root);
}

/**
 * @param {THREE.MeshStandardMaterial} mat
 * @param {number} neonHex
 */
export function applyPreviewPlaceholderColor(mat, neonHex) {
  if (!mat) return;
  const refHex = emissiveRefHexForNeonHex(neonHex);
  mat.color.setHex(neonHex);
  mat.emissive.setHex(neonHex);
  mat.emissiveIntensity = cartEmissiveIntensityForHex(refHex, 1.15);
  mat.needsUpdate = true;
}

/** @param {import("three").Object3D | null | undefined} root */
export function disposePreviewCartGltf(root) {
  disposeRaveGltfInstance(root);
}

/** Re-export for callers that tint via applyThemeColorToCache after prepare. */
export { applyThemeColorToCache };
