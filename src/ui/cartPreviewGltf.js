/**
 * cartPreviewGltf.js — Menu preview adapter for the shared rave GLTF cart (`cartRaveGltf.js`).
 */

import { DEFAULT_CART_THEME, normalizeThemeId } from "../cartThemeConfig.js";
import { cartEmissiveIntensityForHex, emissiveRefHexForNeonHex } from "../utils.js";
import {
  createRaveGltfCartInstance,
  disposeRaveGltfInstance,
  isRaveGltfSourceReady,
  prefetchRaveGltf,
  prepareRaveGltfCart,
} from "../cartRaveGltf.js";

/** @typedef {import("../cartThemes.js").CartThemeMaterialCache} CartThemeMaterialCache */

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
