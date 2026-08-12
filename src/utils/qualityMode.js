/**
 * qualityMode.js — graphics quality tier ("low" | "medium" | "high-lite" | "high").
 *
 * Kept separate from utils.js so config.js can read quality without a circular
 * import (utils.js imports CART_COLORS from config.js).
 *
 * Tier resolution order: menu-preview LOD (forced low) → session auto-quality
 * override → persisted user setting (settingsStore, with touch-device default).
 * `isLowQualityMode()` remains as a compat shim (`tier === "low"`) for call
 * sites that only need the binary distinction.
 */

import { settingsStore } from "../stores/settingsStore.js";

/** @typedef {"low" | "medium" | "high-lite" | "high"} QualityTier */

/** Ordered worst→best; used by the auto-quality watchdog to step down. */
const QUALITY_TIER_ORDER = /** @type {QualityTier[]} */ (["low", "medium", "high-lite", "high"]);

/** @type {boolean} */
let menuPreviewVisualLod = false;
/** @type {QualityTier | null} */
let sessionTierOverride = null;

/**
 * Arms menu-preview visual LOD for the duration of a level init.
 * Does not persist a user preference.
 * @param {boolean} enabled
 * @returns {void}
 */
export function setMenuPreviewVisualLod(enabled) {
  menuPreviewVisualLod = enabled === true;
}

/**
 * Resolves the active quality tier.
 * @returns {QualityTier}
 */
export function getQualityTier() {
  if (menuPreviewVisualLod) return "low";
  if (sessionTierOverride != null) return sessionTierOverride;
  const tier = settingsStore.getState().qualityTier;
  return QUALITY_TIER_ORDER.includes(tier) ? tier : "high";
}

/**
 * Returns true when the lowest quality tier is active — menu-preview LOD,
 * session auto step-down, explicit setting, or touch-device default.
 * @returns {boolean}
 */
export function isLowQualityMode() {
  return getQualityTier() === "low";
}

/**
 * Persists the quality tier preference to settingsStore.
 * Clears any session auto-quality override so the user's choice wins.
 * @param {QualityTier} tier
 * @returns {void}
 */
export function setQualityTier(tier) {
  sessionTierOverride = null;
  settingsStore.getState().setQualityTier(tier);
}

/**
 * Session-only tier override (auto-quality watchdog). Does not persist.
 * Pass `null` to clear the override.
 * @param {QualityTier | null} tier
 * @returns {void}
 */
export function setSessionQualityTier(tier) {
  if (tier == null) {
    sessionTierOverride = null;
    return;
  }
  sessionTierOverride = QUALITY_TIER_ORDER.includes(tier) ? tier : null;
}

/** @returns {QualityTier | null} */
export function getSessionQualityTierOverride() {
  return sessionTierOverride;
}

/**
 * One tier down ("high"→"medium"→"low"); returns null when already at "low".
 * @param {QualityTier} tier
 * @returns {QualityTier | null}
 */
export function stepDownQualityTier(tier) {
  const idx = QUALITY_TIER_ORDER.indexOf(tier);
  return idx > 0 ? QUALITY_TIER_ORDER[idx - 1] : null;
}
