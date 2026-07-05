// graphicsToggles.js — live GFX/quality toggle bridge between the DOM menu and main().
//
// * cart-rave-menu.js executes at import time, before main() has built the composer
// * or the quality-rebuild machinery, so it cannot receive the real handlers directly.
// * main() registers its closures here once they exist; until then the exported
// * toggles no-op — the same semantics as the former window.__cartRave_toggle*
// * optional-call globals this module replaces.

/** @type {((enabled: boolean) => void) | null} */
let postFxHandler = null;
/** @type {((enabled: boolean) => void) | null} */
let lowQualityHandler = null;

/**
 * Called once from main() when the composer passes and quality-rebuild flow exist.
 * @param {{ togglePostFx: (enabled: boolean) => void, toggleLowQuality: (enabled: boolean) => void }} handlers
 */
export function registerGraphicsToggleHandlers({ togglePostFx, toggleLowQuality }) {
  postFxHandler = togglePostFx;
  lowQualityHandler = toggleLowQuality;
}

/**
 * Applies the Post-FX (bloom + arcade/fx passes) setting to the live scene.
 * @param {boolean} enabled
 */
export function togglePostFx(enabled) {
  postFxHandler?.(enabled);
}

/**
 * Applies the low-quality mode setting, rebuilding the scene in place.
 * @param {boolean} enabled
 */
export function toggleLowQuality(enabled) {
  lowQualityHandler?.(enabled);
}
