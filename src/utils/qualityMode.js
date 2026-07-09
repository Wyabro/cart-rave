/**
 * qualityMode.js — low-quality / menu-preview / session auto-quality flags.
 *
 * Kept separate from utils.js so config.js can read quality without a circular
 * import (utils.js imports CART_COLORS from config.js).
 */

import { settingsStore } from "../stores/settingsStore.js";
import { isTouchLikeDevice } from "./device.js";

/** @type {boolean} */
let menuPreviewVisualLod = false;
/** @type {boolean | null} */
let sessionLowQualityOverride = null;

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
 * Returns true when low-quality mode is active — menu-preview LOD, session auto
 * step-down, explicit settingsStore flag, or touch-device default.
 * @returns {boolean}
 */
export function isLowQualityMode() {
  if (menuPreviewVisualLod) return true;
  if (sessionLowQualityOverride != null) return sessionLowQualityOverride;
  const lowQuality = settingsStore.getState().lowQuality;
  if (lowQuality !== undefined && lowQuality !== null) return lowQuality;
  return isTouchLikeDevice();
}

/**
 * Persists the low-quality mode preference to settingsStore.
 * Clears any session auto-quality override so the user's choice wins.
 * @param {boolean} bool
 */
export function setLowQualityMode(bool) {
  sessionLowQualityOverride = null;
  settingsStore.getState().setLowQuality(bool);
}

/**
 * Session-only quality step-down (auto-quality). Does not persist.
 * Pass `null` to clear the override.
 * @param {boolean | null} bool
 * @returns {void}
 */
export function setSessionLowQuality(bool) {
  if (bool == null) {
    sessionLowQualityOverride = null;
    return;
  }
  sessionLowQualityOverride = bool === true;
}

/** @returns {boolean | null} */
export function getSessionLowQualityOverride() {
  return sessionLowQualityOverride;
}
