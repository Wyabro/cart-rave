/**
 * utils.js — Small pure helpers with no game-state or DOM dependencies.
 */

import { CART_COLORS, PALETTE } from "./config.js";
// * Quality mode lives in utils/qualityMode.js (config imports it directly to avoid cycles).
// * Re-export only the symbols existing call sites import from `utils.js`.
export { isLowQualityMode } from "./utils/qualityMode.js";

/** Reference luminance for perceptually even cart glow (pure green channel in linear sRGB). */
const CART_EMISSIVE_REF_LUMA = 0.7152;
/**
 * Global cart frame glow scale — tuned down from raw luminance balance.
 * Re-tuned 0.575 → 0.46 after the ACESFilmic restore (5b254aa): the old value was
 * balanced against the previous tone mapping and read "super emissive" on every
 * arena in the 07-17 run-2 playtest. Run-4 verdict: no longer blown out but "hardly
 * glow at all" — split the difference, 0.46 → 0.52 (blow-out was mostly the uncapped
 * magenta/red hue boosts, which stay capped at 2.0).
 */
const CART_EMISSIVE_MASTER = 0.52;
/**
 * Cap on the per-hue luminance-normalization boost. Low-luma hues (magenta 2.5×,
 * red 3.4×) blew out under ACES + bloom while cyan (~0.9×) was near reference —
 * even bloom is not worth a 3× emissive on saturated pinks.
 */
const CART_EMISSIVE_HUE_BOOST_MAX = 2.0;

/**
 * Converts a single sRGB channel to linear light.
 * @param {number} channel 0–1
 * @returns {number}
 */
function srgbChannelToLinear(channel) {
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

/**
 * Relative luminance of a 24-bit sRGB hex (used to balance emissive intensity per hue).
 * @param {number} hex
 * @returns {number}
 */
function cartHexRelativeLuminance(hex) {
  if (!Number.isFinite(hex)) return CART_EMISSIVE_REF_LUMA;
  const r = srgbChannelToLinear(((hex >> 16) & 255) / 255);
  const g = srgbChannelToLinear(((hex >> 8) & 255) / 255);
  const b = srgbChannelToLinear((hex & 255) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Scales emissive intensity so every palette hue blooms at similar perceived brightness.
 * @param {number} hex
 * @param {number} [baseIntensity=1]
 * @returns {number}
 */
export function cartEmissiveIntensityForHex(hex, baseIntensity = 1) {
  const lum = cartHexRelativeLuminance(hex);
  if (lum < 1e-6) return baseIntensity * CART_EMISSIVE_MASTER;
  let hueBoost = Math.min(CART_EMISSIVE_REF_LUMA / lum, CART_EMISSIVE_HUE_BOOST_MAX);
  // * Hues DISTINCTLY brighter than the reference read hot under linear normalization,
  // * so they are tamed with a >1 exponent below the 0.85 gate (run-5: "yellow with no
  // * patterns is still a bit hot" — spectral yellow luma 0.928 → boost 0.77 → 0.66).
  // * ART-PALETTE-1 (08-13): the brand roster is luma-honest, so the palette members
  // * moved toward the reference — yellow 0xffe53d sits at luma 0.776 (boost 0.92, above
  // * the gate: the run-5 taming no longer applies) and blue 0x22e6ff at 0.642 (boost
  // * 1.12). Pink/orange stay capped at the 2.0 max. The gate still guards custom hues.
  if (hueBoost < 0.85) hueBoost = Math.pow(hueBoost, 1.6);
  return baseIntensity * CART_EMISSIVE_MASTER * hueBoost;
}

/**
 * @param {number} hex 24-bit RGB
 * @returns {number} hue 0–360
 */
function hexToHue(hex) {
  const r = ((hex >> 16) & 255) / 255;
  const g = ((hex >> 8) & 255) / 255;
  const b = (hex & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d < 1e-6) return 0;
  let h = 0;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h *= 60;
  if (h < 0) h += 360;
  return h;
}

/**
 * @param {number} hue 0–360
 * @returns {string}
 */
function nearestPresetForHue(hue) {
  const target = ((Math.round(hue) % 360) + 360) % 360;
  let best = PALETTE[0];
  let bestDist = Infinity;
  for (const id of PALETTE) {
    const presetHue = hexToHue(CART_COLORS[id].hex);
    const dist = Math.min(
      Math.abs(target - presetHue),
      360 - Math.abs(target - presetHue),
    );
    if (dist < bestDist) {
      bestDist = dist;
      best = id;
    }
  }
  return best;
}

/**
 * Preset hex used only for emissive-intensity / bloom balancing — keeps vivid custom
 * RGB while matching the bloom level of the nearest palette color.
 *
 * @param {number} hex Display neon hex (may be a custom vivid hue)
 * @returns {number}
 */
export function emissiveRefHexForNeonHex(hex) {
  if (!Number.isFinite(hex)) return CART_COLORS[PALETTE[0]].hex;
  for (const id of PALETTE) {
    if (CART_COLORS[id].hex === hex) return hex;
  }
  if (hex === 0xff0000) return 0xff0000;
  const presetId = nearestPresetForHue(hexToHue(hex));
  return CART_COLORS[presetId]?.hex ?? hex;
}

import { isTouchLikeDevice } from "./utils/device.js";

/**
 * Detects touch-first mobile/tablet devices (coarse pointer, narrow viewport).
 * @returns {boolean}
 */
export function isTouchDevice() {
  return isTouchLikeDevice();
}

/**
 * Clamps a numeric value to [min, max].
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/**
 * Rounds and clamps an integer to [min, max]; non-finite values return min.
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export function clampInt(value, min, max) {
  const v = Math.round(value);
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, v));
}

/**
 * Interpolates between two angles (radians) along the shortest arc.
 * @param {number} a
 * @param {number} b
 * @param {number} t 0–1
 * @returns {number}
 */
export function lerpAngle(a, b, t) {
  const delta = ((((b - a) % (Math.PI * 2)) + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  return a + delta * t;
}

/**
 * Converts a 24-bit RGB number to a CSS hex color string.
 * @param {number} rgb
 * @returns {string}
 */
function cssHexFromRgbNumber(rgb) {
  if (!Number.isFinite(rgb)) return "#888888";
  const hex = Math.floor(rgb).toString(16).padStart(6, "0");
  return `#${hex}`;
}

/**
 * Returns a CSS hex color for a netcode slot object.
 * @param {{ color?: string | number } | null | undefined} slot
 * @returns {string}
 */
function getColorForSlot(slot) {
  if (!slot || !slot.color) return "#888888";
  return cssHexFromRgbNumber(CART_COLORS[slot.color]?.hex ?? 0x888888);
}

/**
 * Returns a Three.js hex color for a netcode slot object.
 * @param {{ color?: string | number } | null | undefined} slot
 * @returns {number}
 */
function colorHexForSlot(slot) {
  if (!slot) return 0x888888;
  const c = slot.color;
  if (typeof c === "number") return c;
  return CART_COLORS[c]?.hex ?? 0x888888;
}
