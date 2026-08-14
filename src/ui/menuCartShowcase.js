/**
 * menuCartShowcase.js — desktop menu cart as an owned CartPreview canvas.
 *
 * Sits in the #cr-menu-cart-holder above the attract dim layer, using the same
 * init path as Customize. Borrowing the game canvas (initExternal under the dim)
 * could never match Customize grade without a box or a hole. Suspend/dispose
 * before Customize opens so PMREM never crosses WebGL contexts.
 */

import { loadPlayerCustomization } from "../carts/customization.js";
import { recordDiagEvent } from "../utils/diagnostics.js";
import { getQualityTier } from "../utils/qualityMode.js";
// * CHUNK-DEFER-1 L1b: CartPreview pulls cart.js + cartRaveGltf — load only on mount.

const MIN_WIDTH_PX = 240;
const MIN_HEIGHT_PX = 180;

/**
 * @param {{ getMenuVisible: () => boolean }} deps
 */
export function createMenuCartShowcase({ getMenuVisible }) {
  /** @type {InstanceType<typeof import("./cartPreview.js").CartPreview> | null} */
  let preview = null;
  /** @type {Promise<void> | null} */
  let mountPromise = null;
  let suspended = false;
  let mountedAtMs = 0;
  let feintActive = false;
  const holder = document.getElementById("cr-menu-cart-holder");

  function disposePreview() {
    if (feintActive) {
      recordDiagEvent("attract", "menuCartFeintEnd", { reason: "unmounted" });
      feintActive = false;
    }
    preview?.resetShowroomFeint();
    preview?.dispose();
    preview = null;
    mountPromise = null;
    mountedAtMs = 0;
  }

  function hide() {
    if (holder instanceof HTMLElement) holder.hidden = true;
  }

  /** @returns {boolean} */
  function hasEligibleViewport() {
    if (!(holder instanceof HTMLElement)) return false;
    // * Exact product gate: desktop only, and never add this extra scene at Low.
    if (suspended || !getMenuVisible() || window.innerWidth <= 1024 || getQualityTier() === "low") {
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

  /** @param {number} nowMs */
  function mount(nowMs) {
    if (!(holder instanceof HTMLElement) || preview || mountPromise) return;
    const look = loadPlayerCustomization();
    const startMs = nowMs;
    mountPromise = import("./cartPreview.js")
      .then(({ CartPreview }) => {
        if (!hasEligibleViewport() || preview) return;
        preview = new CartPreview();
        // * Set fields before init starts its one GLTF load, avoiding a second
        // * short-lived clone when the saved mirror style is not the default.
        syncLook(look);
        // * Owned canvas above the attract dim — same grade path as Customize.
        preview.init(holder);
        preview.setHeroPose();
        mountedAtMs = startMs;
        recordDiagEvent("attract", "menuCartMount", { tier: getQualityTier() });
      })
      .catch((err) => {
        console.warn("[menuCartShowcase] CartPreview load failed:", err);
      })
      .finally(() => {
        mountPromise = null;
      });
  }

  /**
   * Attract-loop tick: gate mount/dispose and drive showroom feint.
   * GL draw is owned by CartPreview's rAF (not the shared game canvas).
   * @param {number} nowMs
   */
  function render(nowMs) {
    if (!hasEligibleViewport()) {
      disposePreview();
      hide();
      return;
    }
    mount(nowMs);
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
    const nextFeintActive = reducedMotion ? false : preview?.applyShowroomFeint(nowMs - mountedAtMs) === true;
    if (reducedMotion) preview?.resetShowroomFeint();
    if (nextFeintActive && !feintActive) {
      recordDiagEvent("attract", "menuCartFeintStart", { cycleMs: 16000 });
    } else if (!nextFeintActive && feintActive) {
      recordDiagEvent("attract", "menuCartFeintEnd", { reason: "cycle" });
    }
    feintActive = nextFeintActive;
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
