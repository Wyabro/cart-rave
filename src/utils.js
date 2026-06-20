/**
 * utils.js — Small pure helpers with no game-state or DOM dependencies.
 */

import { CART_COLORS } from "./config.js";

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
