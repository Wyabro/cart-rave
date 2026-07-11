/**
 * device.js — Shared device-capability detection.
 *
 * Lives in its own module (no imports) so both utils.js and settingsStore.js can
 * use one definition of "touch device" without an import cycle
 * (utils.js → settingsStore.js for the low-quality flag).
 */

/**
 * Detects touch-first devices (phones, tablets, and other coarse-primary surfaces).
 *
 * Uses the *primary* pointer + hover capability, not a viewport-width gate:
 * - Phones / tablets: `(pointer: coarse)` and usually `(hover: none)` → true
 * - Hybrid laptops (Surface + mouse): primary pointer is fine + hover → false
 * - iPad Pro landscape (≥1024 wide): still coarse-primary → true (was wrong before)
 *
 * Width is no longer part of the test — it flipped layout class mid-session on
 * rotate and excluded large tablets from the touch HUD branch entirely.
 *
 * @returns {boolean}
 */
export function isTouchLikeDevice() {
  try {
    if (typeof window === "undefined") return false;
    const hasTouch =
      ("ontouchstart" in window) ||
      (navigator.maxTouchPoints || 0) > 0;
    if (!hasTouch) return false;

    const mm = window.matchMedia?.bind(window);
    if (mm) {
      // * Primary pointer is coarse → finger-first UI (HUD touch branch, virtual stick).
      if (mm("(pointer: coarse)").matches) return true;
      // * Fine primary pointer with hover = mouse/trackpad desktop (even if a
      // * touchscreen exists via any-pointer: coarse). Keep keyboard HUD.
      if (mm("(pointer: fine)").matches && mm("(hover: hover)").matches) {
        return false;
      }
    }

    // * Fallback when matchMedia is missing or inconclusive: any multi-touch surface.
    return (navigator.maxTouchPoints || 0) > 0;
  } catch {
    return false;
  }
}
