/**
 * cartThemeConfig.js — Cart theme registry + sunglasses style presets (no Three.js / cart mesh deps).
 * Shared by customization persistence, menu UI, cartThemes.js, and cartRaveGltf.js.
 *
 * The themed-cart picker has been removed. "rave" is the sole permanent base configuration for
 * the GLTF cart; the only player-selectable cosmetic is the sunglasses "Mirror Finish" style.
 */

/** @typedef {"rave"} CartThemeId */
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
 * @typedef {Object} SunglassesStyleDef
 * @property {string} id — stable programmatic key (used by resolveSunglassesStyle)
 * @property {string} label — display name shown in the picker UI
 * @property {number} color — legacy single hex; still the menu chip glow + emissive tint base
 * @property {number} frameColor — solid frame colour coordinated with the lens palette
 * @property {readonly string[]} gradient — mirror gradient stops (CSS hex), hot core → cool
 *   edge. Drives the per-style reflection env map (cartRaveGltf getSunglassesStyleEnvMap)
 *   and the picker swatch sweep — the "Pit Viper" iridescent read (Wyatt reference
 *   2026-07-16: orange core melting through gold/cyan to deep blue at the rim).
 * @property {number} metalness
 * @property {number} roughness
 * @property {number} clearcoat
 * @property {number} envMapIntensity — environment map reflectivity multiplier for mirror finish
 */

/**
 * @typedef {typeof SUNGLASSES_STYLES[number]["id"]} SunglassesStyleId
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
 * @property {number} baseHex - fixed body tint or menu swatch base
 * @property {number} accentHex - trim / emissive accent or menu swatch highlight
 * @property {CartGhostMaterialPreset} [ghost] - Ghost theme translucent material tuning
 */

/**
 * * Selectable theme ids. The theme picker UI has been removed — "rave" is the sole permanent
 * * base configuration for the GLTF cart. The registry + helpers remain so cartThemes.js and
 * * the spawn path can still resolve a CartThemeDef by id.
 */
export const DEFAULT_CART_THEME = "rave";

/**
 * * Six "Mirror Finish" sunglasses styles. Each is a metallic mirrored lens color
 * * applied to the GLB face assembly (solid frame + procedural lenses) in cartRaveGltf.js.
 * @type {ReadonlyArray<SunglassesStyleDef>}
 */
export const SUNGLASSES_STYLES = Object.freeze([
  { id: "silverMirror", label: "Silver", color: 0xc8c8d0, frameColor: 0x8d96a6, gradient: Object.freeze(["#f4f7ff", "#c5d0df", "#5b6677", "#070b13"]), metalness: 1.0, roughness: 0.02, clearcoat: 1.0, envMapIntensity: 1.5 },
  { id: "goldMirror", label: "Gold", color: 0xd4af37, frameColor: 0xb98223, gradient: Object.freeze(["#ff6a00", "#ffd23a", "#2ee6c8", "#1a4fd6"]), metalness: 1.0, roughness: 0.02, clearcoat: 1.0, envMapIntensity: 1.5 },
  { id: "blueMirror", label: "Blue", color: 0x2a6cff, frameColor: 0x245fc4, gradient: Object.freeze(["#d9f4ff", "#38b6ff", "#2a6cff", "#141fa8"]), metalness: 1.0, roughness: 0.02, clearcoat: 1.0, envMapIntensity: 1.5 },
  { id: "redMirror", label: "Red", color: 0xff1f3a, frameColor: 0xc52f49, gradient: Object.freeze(["#ffd23a", "#ff5a2e", "#ff1f3a", "#8f1290"]), metalness: 1.0, roughness: 0.02, clearcoat: 1.0, envMapIntensity: 1.5 },
  { id: "greenMirror", label: "Green", color: 0x19e07a, frameColor: 0x15966b, gradient: Object.freeze(["#f2ff6a", "#3aff9e", "#19e07a", "#0a7fa8"]), metalness: 1.0, roughness: 0.02, clearcoat: 1.0, envMapIntensity: 1.5 },
  { id: "purpleMirror", label: "Purple", color: 0x9b3cff, frameColor: 0x7245ad, gradient: Object.freeze(["#ff5ad6", "#b455ff", "#9b3cff", "#2a1e9e"]), metalness: 1.0, roughness: 0.02, clearcoat: 1.0, envMapIntensity: 1.5 },
  { id: "obsidianMirror", label: "Obsidian", color: 0x3a4757, frameColor: 0x1a2029, gradient: Object.freeze(["#3a4757", "#1c242e", "#0d1219", "#010204"]), metalness: 1.0, roughness: 0.02, clearcoat: 1.0, envMapIntensity: 1.5 },
  { id: "hazardMirror", label: "Hazard", color: 0xbaff00, frameColor: 0x3a4a00, gradient: Object.freeze(["#f7ff4a", "#baff00", "#557a00", "#080c00"]), metalness: 1.0, roughness: 0.02, clearcoat: 1.0, envMapIntensity: 1.5 },
  { id: "pearlMirror", label: "Pearl", color: 0xe8f5ff, frameColor: 0xf0e7ee, gradient: Object.freeze(["#ffffff", "#ffd8f3", "#bcefff", "#d8c9ff"]), metalness: 1.0, roughness: 0.02, clearcoat: 1.0, envMapIntensity: 1.5 },
]);

/** Stable fallback when no sunglasses style is supplied to the GLTF material pipeline. */
export const DEFAULT_SUNGLASSES_STYLE = "silverMirror";

/**
 * * Cart theme registry. Only "rave" remains — it is the permanent base configuration for the
 * * GLTF cart (frame material preset, color/pattern/face policies, base/accent swatch hexes).
 * * The themed-cart picker was removed; non-rave branches in cartThemes.js are now dead code
 * * that never executes because normalizeThemeId() always resolves to "rave".
 *
 * @type {Record<CartThemeId, CartThemeDef>}
 */
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
};

/**
 * @param {unknown} value
 * @returns {CartThemeId}
 */
export function normalizeThemeId(value) {
  if (typeof value === "string" && value === DEFAULT_CART_THEME) {
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
 * * Resolves a sunglasses style id to its {@link SunglassesStyleDef}, falling back to
 * * {@link DEFAULT_SUNGLASSES_STYLE} when the id is missing or unknown.
 *
 * @param {string | null | undefined} styleId
 * @returns {SunglassesStyleDef}
 */
export function resolveSunglassesStyle(styleId) {
  const id = typeof styleId === "string"
    ? styleId
    : DEFAULT_SUNGLASSES_STYLE;
  return SUNGLASSES_STYLES.find((s) => s.id === id)
    ?? SUNGLASSES_STYLES.find((s) => s.id === DEFAULT_SUNGLASSES_STYLE)
    ?? SUNGLASSES_STYLES[0];
}
