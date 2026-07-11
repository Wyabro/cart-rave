// graphicsToggles.js — live GFX/quality toggle bridge between the DOM menu and main().
//
// * cart-rave-menu.js executes at import time, before main() has built the composer
// * or the quality-rebuild machinery, so it cannot receive the real handlers directly.
// * main() registers its closures here once they exist; until then the exported
// * toggles no-op — the same semantics as the former window.__cartRave_toggle*
// * optional-call globals this module replaces.

/** @type {((enabled: boolean) => void) | null} */
let postFxHandler = null;
/** @type {((tier: import("../utils/qualityMode.js").QualityTier) => void) | null} */
let qualityTierHandler = null;

/**
 * Called once from main() when the composer passes and quality-rebuild flow exist.
 * @param {{ togglePostFx: (enabled: boolean) => void, applyQualityTier: (tier: import("../utils/qualityMode.js").QualityTier) => void }} handlers
 */
export function registerGraphicsToggleHandlers({ togglePostFx, applyQualityTier }) {
  postFxHandler = togglePostFx;
  qualityTierHandler = applyQualityTier;
}

/**
 * Applies the Post-FX (bloom + arcade/fx passes) setting to the live scene.
 * @param {boolean} enabled
 */
export function togglePostFx(enabled) {
  postFxHandler?.(enabled);
}

/**
 * Applies a quality tier to the live scene, rebuilding visuals in place.
 * @param {import("../utils/qualityMode.js").QualityTier} tier
 */
export function applyQualityTier(tier) {
  qualityTierHandler?.(tier);
}
