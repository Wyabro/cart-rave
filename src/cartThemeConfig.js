/**
 * cartThemeConfig.js — Cart theme id registry and material presets (no Three.js / cart mesh deps).
 * Shared by customization persistence, menu UI, and cartThemes.js (future visual application).
 */

/** @typedef {typeof CART_THEME_IDS[number]} CartThemeId */
/** @typedef {'wireframe' | 'solid' | 'hybrid'} FrameGeometry */
/** @typedef {'neonFull' | 'accentTint' | 'fixedBase'} ColorPolicy */
/** @typedef {'allow' | 'disable'} PatternPolicy */
/** @typedef {'standard' | 'hoverPad' | 'whitewall' | 'woodHub' | 'constructionTires'} WheelModule */
/** @typedef {'chrome' | 'welded' | 'wood' | 'brass'} HandleStyle */
/** @typedef {'default' | 'hidden' | 'themed'} FacePolicy */

/**
 * @typedef {Object} CartFrameMaterialPreset
 * @property {number} metalness
 * @property {number} roughness
 * @property {number} clearcoat
 * @property {number} clearcoatRoughness
 * @property {number} emissiveMul — multiplier applied to cart emissive intensity
 * @property {boolean} toneMapped
 */

/**
 * @typedef {Object} CartGhostMaterialPreset
 * @property {number} opacity
 * @property {number} transmission
 * @property {number} ior
 */

/**
 * @typedef {Object} CartThemeDef
 * @property {CartThemeId} id
 * @property {string} label
 * @property {FrameGeometry} frameGeometry
 * @property {ColorPolicy} colorPolicy
 * @property {PatternPolicy} patternPolicy
 * @property {WheelModule} wheelModule
 * @property {HandleStyle} handleStyle
 * @property {FacePolicy} facePolicy
 * @property {readonly string[]} propIds
 * @property {CartFrameMaterialPreset} frameMaterial
 * @property {number} baseHex — fixed body tint or menu swatch base
 * @property {number} accentHex — trim / emissive accent or menu swatch highlight
 * @property {CartGhostMaterialPreset} [ghost] — Ghost theme translucent material tuning
 */

/** Ordered list of selectable theme ids. */
export const CART_THEME_IDS = ["rave", "liminal", "tropical", "sci-fi", "ghost", "vintage", "construction", "corpo", "luxury"];

export const DEFAULT_CART_THEME = "rave";

/** @type {Record<CartThemeId, CartThemeDef>} */
export const CART_THEMES = {
  rave: {
    id: "rave",
    label: "Rave",
    frameGeometry: "wireframe",
    colorPolicy: "neonFull",
    patternPolicy: "allow",
    wheelModule: "standard",
    handleStyle: "chrome",
    facePolicy: "default",
    propIds: [],
    frameMaterial: {
      metalness: 0.55,
      roughness: 0.16,
      clearcoat: 0.25,
      clearcoatRoughness: 0.06,
      emissiveMul: 1.15,
      toneMapped: false,
    },
    baseHex: 0xff7a1a,
    accentHex: 0x22e6ff,
  },
  liminal: {
    id: "liminal",
    label: "Liminal",
    frameGeometry: "hybrid",
    colorPolicy: "accentTint",
    patternPolicy: "disable",
    wheelModule: "standard",
    handleStyle: "welded",
    facePolicy: "default",
    propIds: ["liminalProps"],
    frameMaterial: {
      metalness: 0.82,
      roughness: 0.72,
      clearcoat: 0.08,
      clearcoatRoughness: 0.55,
      emissiveMul: 0.35,
      toneMapped: true,
    },
    baseHex: 0x6b5a42,
    accentHex: 0xc8d86a,
  },
  tropical: {
    id: "tropical",
    label: "Tropical",
    frameGeometry: "solid",
    colorPolicy: "accentTint",
    patternPolicy: "disable",
    wheelModule: "woodHub",
    handleStyle: "wood",
    facePolicy: "default",
    propIds: ["tropicalProps"],
    frameMaterial: {
      metalness: 0.12,
      roughness: 0.68,
      clearcoat: 0.18,
      clearcoatRoughness: 0.35,
      emissiveMul: 0.25,
      toneMapped: true,
    },
    baseHex: 0x8b5a2b,
    accentHex: 0xff6b4a,
  },
  "sci-fi": {
    id: "sci-fi",
    label: "Sci-fi",
    frameGeometry: "hybrid",
    colorPolicy: "accentTint",
    patternPolicy: "disable",
    wheelModule: "hoverPad",
    handleStyle: "chrome",
    facePolicy: "default",
    propIds: ["cyanEdgeStrips"],
    frameMaterial: {
      metalness: 0.92,
      roughness: 0.22,
      clearcoat: 0.45,
      clearcoatRoughness: 0.12,
      emissiveMul: 0.85,
      toneMapped: false,
    },
    baseHex: 0x1a1a22,
    accentHex: 0x00e5ff,
  },
  ghost: {
    id: "ghost",
    label: "Ghost",
    frameGeometry: "wireframe",
    colorPolicy: "neonFull",
    patternPolicy: "disable",
    wheelModule: "standard",
    handleStyle: "chrome",
    facePolicy: "themed",
    propIds: ["ghostProps"],
    frameMaterial: {
      metalness: 0.15,
      roughness: 0.35,
      clearcoat: 0.1,
      clearcoatRoughness: 0.2,
      emissiveMul: 0.65,
      toneMapped: false,
    },
    baseHex: 0xb8c9e0,
    accentHex: 0xe8f4ff,
    ghost: {
      opacity: 0.55,
      transmission: 0.85,
      ior: 1.45,
    },
  },
  vintage: {
    id: "vintage",
    label: "Vintage",
    frameGeometry: "solid",
    colorPolicy: "accentTint",
    patternPolicy: "allow",
    wheelModule: "whitewall",
    handleStyle: "brass",
    facePolicy: "default",
    propIds: ["atomicFins"],
    frameMaterial: {
      metalness: 0.88,
      roughness: 0.28,
      clearcoat: 0.35,
      clearcoatRoughness: 0.18,
      emissiveMul: 0.4,
      toneMapped: true,
    },
    baseHex: 0xc9a227,
    accentHex: 0x8b5a2b,
  },
  construction: {
    id: "construction",
    label: "Construction",
    frameGeometry: "hybrid",
    colorPolicy: "accentTint",
    patternPolicy: "disable",
    wheelModule: "constructionTires",
    handleStyle: "welded",
    facePolicy: "hidden",
    propIds: ["constructionProps"],
    frameMaterial: {
      metalness: 0.75,
      roughness: 0.85,
      clearcoat: 0.05,
      clearcoatRoughness: 0.6,
      emissiveMul: 0.3,
      toneMapped: true,
    },
    baseHex: 0x5a5248,
    accentHex: 0xf4c430,
  },
  corpo: {
    id: "corpo",
    label: "Corpo",
    frameGeometry: "hybrid",
    colorPolicy: "accentTint",
    patternPolicy: "disable",
    wheelModule: "standard",
    handleStyle: "chrome",
    facePolicy: "hidden",
    propIds: ["corpoProps"],
    frameMaterial: {
      metalness: 0.92,
      roughness: 0.18,
      clearcoat: 0.55,
      clearcoatRoughness: 0.1,
      emissiveMul: 0.5,
      toneMapped: true,
    },
    baseHex: 0x181a1f,
    accentHex: 0x4a90e2,
  },
  luxury: {
    id: "luxury",
    label: "Luxury",
    frameGeometry: "solid",
    colorPolicy: "accentTint",
    patternPolicy: "disable",
    wheelModule: "whitewall",
    handleStyle: "brass",
    facePolicy: "default",
    propIds: ["luxuryProps"],
    frameMaterial: {
      metalness: 0.95,
      roughness: 0.15,
      clearcoat: 0.6,
      clearcoatRoughness: 0.08,
      emissiveMul: 0.35,
      toneMapped: true,
    },
    baseHex: 0xd4af37,
    accentHex: 0xf7e98e,
  },
};

/**
 * @param {unknown} value
 * @returns {CartThemeId}
 */
export function normalizeThemeId(value) {
  if (typeof value === "string" && CART_THEME_IDS.includes(value)) {
    return /** @type {CartThemeId} */ (value);
  }
  return DEFAULT_CART_THEME;
}

/**
 * @param {string | null | undefined} themeId
 * @returns {CartThemeDef}
 */
export function getCartTheme(themeId) {
  return CART_THEMES[normalizeThemeId(themeId)];
}

/**
 * @returns {CartThemeDef[]}
 */
export function listCartThemes() {
  return CART_THEME_IDS.map((id) => CART_THEMES[id]);
}
