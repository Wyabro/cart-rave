/**
 * menuCartShowcase.js — desktop menu cart as an owned CartPreview canvas.
 *
 * Sits in the #cr-menu-cart-holder above the attract dim layer, using the same
 * init path as Customize. Each preview owns its renderer and its PMREM. Do not
 * share GPU objects across contexts. Do not create or destroy a context on
 * Customize toggle — pause/resume instead. Real dispose is menu-exit only
 * (`release()`). Peak while Customize has been opened once: attract + this
 * paused preview + the Customize preview (three contexts) until menu-exit.
 */

import { loadPlayerCustomization } from "../carts/customization.js";
import { recordDiagEvent } from "../utils/diagnostics.js";
import { getQualityTier } from "../utils/qualityMode.js";
// * CHUNK-DEFER-1 L1b: CartPreview pulls cart.js + cartRaveGltf — load only on mount.

const MIN_WIDTH_PX = 240;
const MIN_HEIGHT_PX = 180;

/** @param {number} value */
function clampPointerAxis(value) {
  return Math.min(Math.max(value, -1), 1);
}

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
  const menuRoot = document.getElementById("cr-root");
  let pointerRect = null;
  let pointerActive = false;
  let pointerX = 0;
  let pointerY = 0;

  function resetPointer({ immediate = false } = {}) {
    pointerActive = false;
    pointerX = 0;
    pointerY = 0;
    preview?.resetPointerParallax({ immediate });
  }

  function pointerEligible() {
    return !suspended
      && getMenuVisible()
      && window.innerWidth > 1024
      && getQualityTier() !== "low"
      && !(window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true);
  }

  /** @param {PointerEvent} event */
  function onPointerMove(event) {
    // * Cursor parallax is mouse/pen affordance only. A synthetic test event
    // * often has no pointerType, so only the explicit touch type is excluded.
    if (event.pointerType === "touch") return;
    if (!pointerEligible() || !(menuRoot instanceof HTMLElement)) {
      resetPointer({ immediate: true });
      return;
    }
    pointerRect ??= menuRoot.getBoundingClientRect();
    if (pointerRect.width <= 0 || pointerRect.height <= 0) return;
    pointerX = clampPointerAxis(((event.clientX - pointerRect.left) / pointerRect.width) * 2 - 1);
    pointerY = clampPointerAxis(((event.clientY - pointerRect.top) / pointerRect.height) * 2 - 1);
    pointerActive = true;
    preview?.setPointerParallax(pointerX, pointerY);
  }

  function onPointerLeave() {
    // * A visible leave returns slowly by design. Hidden/suspended paths use
    // * immediate reset instead so a stale pose cannot reappear on resume.
    resetPointer();
  }

  function onWindowBlur() {
    resetPointer({ immediate: true });
  }

  function onVisibilityChange() {
    if (document.visibilityState === "hidden") resetPointer({ immediate: true });
  }

  function onResize() {
    pointerRect = null;
  }

  menuRoot?.addEventListener("pointermove", onPointerMove, { passive: true });
  menuRoot?.addEventListener("pointerleave", onPointerLeave);
  window.addEventListener("blur", onWindowBlur);
  window.addEventListener("resize", onResize);
  document.addEventListener("visibilitychange", onVisibilityChange);

  function disposePreview() {
    resetPointer({ immediate: true });
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
        if (preview) return;
        if (!(holder instanceof HTMLElement)) return;
        if (!getMenuVisible() || window.innerWidth <= 1024 || getQualityTier() === "low") return;
        preview = new CartPreview();
        // * Set fields before init starts its one GLTF load, avoiding a second
        // * short-lived clone when the saved mirror style is not the default.
        syncLook(look);
        // * Owned canvas above the attract dim — same grade path as Customize.
        preview.init(holder);
        preview.setHeroPose();
        if (pointerActive) preview.setPointerParallax(pointerX, pointerY);
        mountedAtMs = startMs;
        recordDiagEvent("attract", "menuCartMount", { tier: getQualityTier() });
        if (suspended) {
          preview.pause();
          hide();
        }
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
    if (suspended) return;
    if (!hasEligibleViewport()) {
      disposePreview();
      hide();
      return;
    }
    mount(nowMs);
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
    if (reducedMotion) resetPointer({ immediate: true });
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
      resetPointer({ immediate: true });
      preview?.pause();
      hide();
      return;
    }
    if (preview) {
      if (!hasEligibleViewport()) {
        disposePreview();
        hide();
        return;
      }
      preview.resume();
    }
  }

  function release() {
    resetPointer({ immediate: true });
    disposePreview();
    hide();
    suspended = true;
  }

  const onCustomizationChanged = (event) => {
    const detail = /** @type {CustomEvent<ReturnType<typeof loadPlayerCustomization>>} */ (event).detail;
    syncLook(detail ?? loadPlayerCustomization());
  };
  window.addEventListener("cartrave:customization-changed", onCustomizationChanged);

  return {
    render,
    setSuspended,
    release,
    dispose() {
      menuRoot?.removeEventListener("pointermove", onPointerMove);
      menuRoot?.removeEventListener("pointerleave", onPointerLeave);
      window.removeEventListener("blur", onWindowBlur);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("cartrave:customization-changed", onCustomizationChanged);
      disposePreview();
      hide();
    },
  };
}
