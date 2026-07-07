/**
 * device.js — Shared device-capability detection.
 *
 * Lives in its own module (no imports) so both utils.js and settingsStore.js can
 * use one definition of "touch device" without an import cycle
 * (utils.js → settingsStore.js for the low-quality flag).
 */

/**
 * Detects touch-first mobile/tablet devices (coarse pointer, narrow viewport).
 * @returns {boolean}
 */
export function isTouchLikeDevice() {
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
