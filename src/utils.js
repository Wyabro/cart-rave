/**
 * utils.js — Small pure helpers with no game-state or DOM dependencies.
 */

import { CART_COLORS } from "./config.js";

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
export function cartHexRelativeLuminance(hex) {
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
 * Applies cart frame albedo + emissive with luminance-balanced intensity.
 * @param {{ color?: import("three").Color, emissive?: import("three").Color, emissiveIntensity?: number, envMapIntensity?: number, metalness?: number, roughness?: number } | null | undefined} mat
 * @param {number} hex
 * @param {number} [intensityMul=1]
 */
export function applyCartFrameGlow(mat, hex, intensityMul = 1) {
  if (!mat) return;
  if (mat.color) mat.color.setHex(hex);
  if (mat.emissive) mat.emissive.setHex(hex);
  if (typeof mat.emissiveIntensity === "number") {
    mat.emissiveIntensity = cartEmissiveIntensityForHex(hex, intensityMul);
  }
  if (typeof mat.metalness === "number") mat.metalness = 0.7;
  if (typeof mat.roughness === "number") mat.roughness = 0.3;
  if (typeof mat.envMapIntensity === "number") mat.envMapIntensity = 0.15;
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
 * Converts a 24-bit RGB number to a CSS hex color string.
 * @param {number} rgb
 * @returns {string}
 */
export function cssHexFromRgbNumber(rgb) {
  if (!Number.isFinite(rgb)) return "#888888";
  const hex = Math.floor(rgb).toString(16).padStart(6, "0");
  return `#${hex}`;
}

/**
 * Returns a CSS hex color for a netcode slot object.
 * @param {{ color?: string | number } | null | undefined} slot
 * @returns {string}
 */
export function getColorForSlot(slot) {
  if (!slot || !slot.color) return "#888888";
  return cssHexFromRgbNumber(CART_COLORS[slot.color]?.hex ?? 0x888888);
}

/**
 * Returns a Three.js hex color for a netcode slot object.
 * @param {{ color?: string | number } | null | undefined} slot
 * @returns {number}
 */
export function colorHexForSlot(slot) {
  if (!slot) return 0x888888;
  const c = slot.color;
  if (typeof c === "number") return c;
  return CART_COLORS[c]?.hex ?? 0x888888;
}
