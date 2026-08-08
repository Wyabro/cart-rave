/**
 * menuCartShowcase.js — desktop menu cart rendered through the shared game canvas.
 *
 * The holder is only a layout marker. CartPreview owns a separate Three scene but
 * borrows the already-running menu renderer, so this module adds neither a canvas
 * nor an rAF loop. Customize suspends this scene before it opens its owned-canvas
 * preview because PMREM textures cannot cross WebGL contexts.
 */

import { loadPlayerCustomization } from "../customization.js";
import { recordDiagEvent } from "../utils/diagnostics.js";
import { getQualityTier } from "../utils/qualityMode.js";
import { CartPreview } from "./cartPreview.js";

const MIN_WIDTH_PX = 240;
const MIN_HEIGHT_PX = 180;

/**
 * @param {{ renderer: import("three").WebGLRenderer, getMenuVisible: () => boolean }} deps
 */
export function createMenuCartShowcase({ renderer, getMenuVisible }) {
  /** @type {CartPreview | null} */
  let preview = null;
  let suspended = false;
  let targetFaulted = false;
  const holder = document.getElementById("cr-menu-cart-holder");

  function disposePreview() {
    preview?.dispose();
    preview = null;
  }

  function hide() {
    if (holder instanceof HTMLElement) holder.hidden = true;
  }

  /** @returns {boolean} */
  function hasEligibleViewport() {
    if (!(holder instanceof HTMLElement)) return false;
    // * Exact product gate: desktop only, and never add this extra scene at Low.
    if (suspended || targetFaulted || !getMenuVisible() || window.innerWidth <= 1024 || getQualityTier() === "low") {
      return false;
    }
    holder.hidden = false;
    const rect = holder.getBoundingClientRect();
    return rect.width >= MIN_WIDTH_PX && rect.height >= MIN_HEIGHT_PX;
  }

  /** @param {ReturnType<typeof loadPlayerCustomization>} look */
  function syncLook(look) {
    if (!preview) return;
    preview.setColor(look.hex);
    preview.setPattern(look.pattern);
    preview.setSunglassesStyle(look.sunglassesStyle, { rebuild: preview.cartGroup != null });
  }

  function mount() {
    if (!(holder instanceof HTMLElement) || preview) return;
    const look = loadPlayerCustomization();
    preview = new CartPreview();
    // * Set fields before initExternal starts its one GLTF load, avoiding a second
    // * short-lived clone when the saved mirror style is not the default.
    syncLook(look);
    preview.initExternal(renderer, holder);
    preview.setHeroPose();
  }

  /** @param {number} _nowMs Attract callback timestamp; static Lever A pose ignores it. */
  function render(_nowMs) {
    if (!hasEligibleViewport()) {
      disposePreview();
      hide();
      return;
    }
    mount();
    const result = preview?.renderExternal(renderer);
    if (result === "targetNonNull") {
      // * A direct pass into a composer target would be undefined. Make the failure
      // * inspectable once, hide the marker, and release the borrowed scene.
      targetFaulted = true;
      recordDiagEvent("attract", "menuCartComposerTargetNonNull", {});
      disposePreview();
      hide();
    }
  }

  /** @param {boolean} next */
  function setSuspended(next) {
    suspended = Boolean(next);
    if (suspended) {
      disposePreview();
      hide();
    }
  }

  const onCustomizationChanged = (event) => {
    const detail = /** @type {CustomEvent<ReturnType<typeof loadPlayerCustomization>>} */ (event).detail;
    syncLook(detail ?? loadPlayerCustomization());
  };
  window.addEventListener("cartrave:customization-changed", onCustomizationChanged);

  return {
    render,
    setSuspended,
    dispose() {
      window.removeEventListener("cartrave:customization-changed", onCustomizationChanged);
      disposePreview();
      hide();
    },
  };
}
