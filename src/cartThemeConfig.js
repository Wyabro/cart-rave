/**
 * cartThemeConfig.js — Cart theme registry + sunglasses style presets (no Three.js / cart mesh deps).
 * Shared by customization persistence, menu UI, cartThemes.js, and cartRaveGltf.js.
 *
 * The themed-cart picker has been removed. "rave" is the sole permanent base configuration for
 * the GLTF cart; the only player-selectable cosmetic is the sunglasses "Mirror Finish" style.
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
 * @typedef {Object} SunglassesStyleDef
 * @property {string} id — stable programmatic key (used by resolveSunglassesStyle)
 * @property {string} label — display name shown in the picker UI
 * @property {number} color — lens + accent albedo hex
 * @property {number} metalness
 * @property {number} roughness
 * @property {number} clearcoat
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
 * @property {number} baseHex — fixed body tint or menu swatch base
 * @property {number} accentHex — trim / emissive accent or menu swatch highlight
 * @property {CartGhostMaterialPreset} [ghost] — Ghost theme translucent material tuning
 */

/**
 * * Selectable theme ids. The theme picker UI has been removed — "rave" is the sole permanent
 * * base configuration for the GLTF cart. The registry + helpers remain so cartThemes.js and
 * * the spawn path can still resolve a CartThemeDef by id.
 *
 * @type {readonly ["rave"]}
 */
export const CART_THEME_IDS = Object.freeze(["rave"]);

export const DEFAULT_CART_THEME = "rave";

/**
 * * Six "Mirror Finish" sunglasses styles. Each is a metallic mirrored lens color
 * * applied to the GLB face assembly (frame + lenses + accent) in cartRaveGltf.js.
 * @type {ReadonlyArray<SunglassesStyleDef>}
 */
export const SUNGLASSES_STYLES = Object.freeze([
  { id: "silverMirror", label: "Silver Mirror", color: 0xc8c8d0, metalness: 1.0, roughness: 0.05, clearcoat: 1.0 },
  { id: "goldMirror", label: "Gold Mirror", color: 0xd4af37, metalness: 1.0, roughness: 0.05, clearcoat: 1.0 },
  { id: "blueMirror", label: "Blue Mirror", color: 0x2a6cff, metalness: 1.0, roughness: 0.05, clearcoat: 1.0 },
  { id: "redMirror", label: "Red Mirror", color: 0xff1f3a, metalness: 1.0, roughness: 0.05, clearcoat: 1.0 },
  { id: "greenMirror", label: "Green Mirror", color: 0x19e07a, metalness: 1.0, roughness: 0.05, clearcoat: 1.0 },
  { id: "purpleMirror", label: "Purple Mirror", color: 0x9b3cff, metalness: 1.0, roughness: 0.05, clearcoat: 1.0 },
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

/**
 * @returns {CartThemeDef[]}
 */
export function listCartThemes() {
  return CART_THEME_IDS.map((id) => CART_THEMES[id]);
}
