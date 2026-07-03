/**
 * utils.js — Small pure helpers with no game-state or DOM dependencies.
 */

import { CART_COLORS, PALETTE } from "./config.js";

/** Reference luminance for perceptually even cart glow (pure green channel in linear sRGB). */
const CART_EMISSIVE_REF_LUMA = 0.7152;
/** Global cart frame glow scale — tuned down from raw luminance balance. */
const CART_EMISSIVE_MASTER = 0.575;

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
  return baseIntensity * CART_EMISSIVE_MASTER * (CART_EMISSIVE_REF_LUMA / lum);
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

/**
 * Detects touch-first mobile/tablet devices (coarse pointer, narrow viewport).
 * @returns {boolean}
 */
export function isTouchDevice() {
  try {
    if (typeof window === "undefined") return false;
    const hasTouch =
      ("ontouchstart" in window) ||
      (navigator.maxTouchPoints || 0) > 0;
    const coarsePointer = window.matchMedia?.("(pointer: coarse)")?.matches ?? hasTouch;
    return hasTouch && coarsePointer && (window.innerWidth || 0) < 1024;
  } catch {
    return false;
  }
}

import { settingsStore } from "./stores/settingsStore.js";

/**
 * Returns true when low-quality mode is active — explicit settingsStore flag or
 * auto-detected touch device as a fallback.
 * @returns {boolean}
 */
export function isLowQualityMode() {
  const lowQuality = settingsStore.getState().lowQuality;
  if (lowQuality !== undefined && lowQuality !== null) return lowQuality;
  return isTouchDevice();
}

/**
 * Persists the low-quality mode preference to settingsStore.
 * @param {boolean} bool
 */
export function setLowQualityMode(bool) {
  settingsStore.getState().setLowQuality(bool);
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
function clampInt(value, min, max) {
  const v = Math.round(value);
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, v));
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
