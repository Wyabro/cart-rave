import { animate, createTimeline, stagger } from "animejs";
import "animejs/adapters/three";
import { isTouchDevice } from "./utils.js";

export { createTimeline, stagger };

/** @typedef {import('animejs').JSAnimation} JSAnimation */

/** @typedef {Object} AnimationOptions
 * @property {number} [duration]
 * @property {string | import('animejs').EasingFunction} [ease]
 * @property {boolean} [force] Skip reduced-motion / touch-only guards.
 * @property {boolean} [touchOnly] No-op on non-touch devices.
 * @property {'boost' | 'hop' | 'default'} [variant] Touch button glow preset.
 */

const DEFAULT_EASE_SNAP = "outExpo";
const DEFAULT_EASE_BOUNCE = "outBack(1.35)";
const DEFAULT_EASE_FADE = "inOutQuad";
const DEFAULT_EASE_SPRING = "outBack(1.5)";

/** Touch button glow presets — flash peaks then CSS classes hold steady glow. */
const TOUCH_GLOW = {
  boost: {
    flashFilter: "brightness(1.28)",
    heldFilter: "brightness(1.1)",
  },
  hop: {
    flashFilter: "brightness(1.32)",
    heldFilter: "brightness(1.12)",
  },
  default: {
    flashFilter: "brightness(1.22)",
    heldFilter: "brightness(1.06)",
  },
};

/** @type {WeakMap<Element, Set<JSAnimation>>} */
const activeByElement = new WeakMap();

/** @type {WeakMap<Element, JSAnimation>} */
const pulseByElement = new WeakMap();

/** @type {WeakMap<import('three').Object3D, JSAnimation>} */
const cartPulseByMesh = new WeakMap();

/** @type {WeakMap<Element, number>} */
const killFeedExitTimers = new WeakMap();

/** @type {WeakSet<Element>} */
const buttonPressWired = new WeakSet();

/** @type {WeakSet<Element>} */
const hoverWired = new WeakSet();

let removalObserverStarted = false;

/**
 * @returns {boolean}
 */
function prefersReducedMotion() {
  try {
    return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
  } catch {
    return false;
  }
}

/**
 * @param {AnimationOptions} [options]
 * @returns {boolean}
 */
function shouldAnimate(options = {}) {
  if (options.force) return true;
  if (prefersReducedMotion()) return false;
  if (options.touchOnly && !isTouchDevice()) return false;
  return true;
}

/**
 * @param {Element | null | undefined} element
 * @returns {element is HTMLElement}
 */
function isAnimatableElement(element) {
  return element instanceof HTMLElement && element.isConnected;
}

function ensureRemovalObserver() {
  if (removalObserverStarted || typeof MutationObserver === "undefined") return;
  removalObserverStarted = true;

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.removedNodes) {
        if (node instanceof Element) {
          cancelElementAnimations(node);
          node.querySelectorAll("*").forEach((child) => cancelElementAnimations(child));
        }
      }
    }
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });
}

/**
 * @param {Element} element
 * @param {JSAnimation} animation
 * @returns {JSAnimation}
 */
function trackAnimation(element, animation) {
  ensureRemovalObserver();

  let bucket = activeByElement.get(element);
  if (!bucket) {
    bucket = new Set();
    activeByElement.set(element, bucket);
  }

  bucket.add(animation);

  const untrack = () => {
    bucket?.delete(animation);
    if (bucket && bucket.size === 0) {
      activeByElement.delete(element);
    }
  };

  animation.then?.(untrack).catch?.(untrack);
  return animation;
}

/**
 * Cancels all tracked Anime.js instances for an element and reverts properties.
 * @param {Element | null | undefined} element
 */
export function cancelElementAnimations(element) {
  if (!(element instanceof Element)) return;

  stopTouchPulse(element);

  const bucket = activeByElement.get(element);
  if (!bucket) return;

  for (const animation of bucket) {
    try {
      animation.revert();
    } catch {
      try {
        animation.cancel();
      } catch {
        // Animation may already be finished or reverted.
      }
    }
  }

  bucket.clear();
  activeByElement.delete(element);
}

/**
 * Stops a looping touch pulse on an element.
 * @param {Element | null | undefined} element
 */
function stopTouchPulse(element) {
  if (!(element instanceof Element)) return;

  const pulse = pulseByElement.get(element);
  if (!pulse) return;

  try {
    pulse.cancel();
  } catch {
    // Pulse may already be finished.
  }

  pulseByElement.delete(element);
  activeByElement.get(element)?.delete(pulse);
}

/**
 * Cancels every tracked animation under a DOM subtree.
 * @param {Element | null | undefined} root
 */
export function cancelAnimationsIn(root) {
  if (!(root instanceof Element)) return;
  cancelElementAnimations(root);
  root.querySelectorAll("*").forEach((child) => cancelElementAnimations(child));
}

/**
 * @param {HTMLElement} element
 * @param {Record<string, unknown>} params
 * @param {AnimationOptions} [options]
 * @returns {JSAnimation | null}
 */
function runAnimation(element, params, options = {}) {
  if (!isAnimatableElement(element)) return null;
  if (!shouldAnimate(options)) return null;

  const animation = animate(element, params);
  return trackAnimation(element, animation);
}

/**
 * Runs a touch-only animation without cancelling siblings on the same element.
 * @param {HTMLElement} element
 * @param {Record<string, unknown>} params
 * @param {AnimationOptions} [options]
 * @returns {JSAnimation | null}
 */
function runTouchAnimation(element, params, options = {}) {
  if (!isAnimatableElement(element)) return null;
  if (!shouldAnimate({ touchOnly: true, ...options })) return null;

  const animation = animate(element, params);
  return trackAnimation(element, animation);
}

/**
 * Clears inline animated styles so CSS class glow can take over.
 * @param {HTMLElement} element
 * @param {string[]} [props=['filter', 'transform']]
 */
function clearInlineAnimStyles(element, props = ["filter", "transform"]) {
  for (const prop of props) {
    element.style.removeProperty(prop);
  }
}

/**
 * Applies final styles when animation is skipped (reduced motion / touch guard).
 * @param {HTMLElement} element
 * @param {Record<string, string | number>} values
 */
function applyInstantStyles(element, values) {
  if (!element) return;

  if ("opacity" in values) {
    element.style.opacity = String(values.opacity);
  }
  if ("scale" in values) {
    element.style.transform = `scale(${values.scale})`;
  }
  if ("y" in values) {
    const y = values.y;
    element.style.transform = `translateY(${typeof y === "number" ? `${y}px` : y})`;
  }
}

/**
 * Snappy press feedback for menu / HUD buttons.
 * @param {HTMLElement | null | undefined} element
 * @param {AnimationOptions & { scale?: number }} [options]
 * @returns {JSAnimation | null}
 */
export function animateButtonPress(element, options = {}) {
  if (!element) return null;

  const duration = options.duration ?? 80;
  const scale = options.scale ?? 0.94;
  const ease = options.ease ?? DEFAULT_EASE_SNAP;

  if (!shouldAnimate(options)) {
    applyInstantStyles(element, { scale });
    return null;
  }

  cancelElementAnimations(element);
  return runAnimation(
    element,
    { scale, duration, ease },
    { ...options, force: true },
  );
}

/**
 * Release spring-back for menu / HUD buttons.
 * @param {HTMLElement | null | undefined} element
 * @param {AnimationOptions & { scale?: number }} [options]
 * @returns {JSAnimation | null}
 */
export function animateButtonRelease(element, options = {}) {
  if (!element) return null;

  const duration = options.duration ?? 120;
  const scale = options.scale ?? 1;
  const ease = options.ease ?? DEFAULT_EASE_BOUNCE;

  if (!shouldAnimate(options)) {
    applyInstantStyles(element, { scale });
    return null;
  }

  cancelElementAnimations(element);
  return runAnimation(
    element,
    { scale, duration, ease },
    { ...options, force: true },
  );
}

/**
 * Stagger-friendly card entrance for menu panels and overlays.
 * @param {HTMLElement | HTMLElement[] | NodeListOf<HTMLElement>} element
 * @param {AnimationOptions & { delay?: any, y?: number, fromOpacity?: number }} [options]
 * @returns {JSAnimation | null}
 */
export function animateMenuCardEnter(element, options = {}) {
  if (!element) return null;

  const duration = options.duration ?? 420;
  const ease = options.ease ?? DEFAULT_EASE_BOUNCE;
  const delay = options.delay ?? 0;
  const y = options.y ?? 22;
  const fromOpacity = options.fromOpacity ?? 0;

  const target = /** @type {any} */ (element);
  if (!shouldAnimate(options)) {
    if (target.style) {
      target.style.opacity = String(1);
      target.style.transform = "translateY(0) scale(1)";
    } else if (target.length) {
      for (const el of target) {
        if (el.style) {
          el.style.opacity = String(1);
          el.style.transform = "translateY(0) scale(1)";
        }
      }
    }
    return null;
  }

  return runAnimation(
    target,
    {
      opacity: [fromOpacity, 1],
      y: [y, 0],
      scale: [0.94, 1],
      duration,
      ease,
      delay,
    },
    options,
  );
}

/**
 * Subtle fade + slide for menu sections (no scale pop).
 * @param {HTMLElement | null | undefined} element
 * @param {AnimationOptions & { delay?: number, y?: number, fromOpacity?: number }} [options]
 * @returns {JSAnimation | null}
 */
export function animateMenuReveal(element, options = {}) {
  if (!element) return null;

  const duration = options.duration ?? 360;
  const ease = options.ease ?? DEFAULT_EASE_SNAP;
  const delay = options.delay ?? 0;
  const y = options.y ?? 14;
  const fromOpacity = options.fromOpacity ?? 0;

  if (!shouldAnimate(options)) {
    element.style.opacity = "1";
    element.style.transform = "translateY(0)";
    return null;
  }

  return runAnimation(
    element,
    {
      opacity: [fromOpacity, 1],
      y: [y, 0],
      duration,
      ease,
      delay,
    },
    options,
  );
}

/**
 * Touch control press — stronger squash, brightness flash, mobile-only.
 * @param {HTMLElement | null | undefined} element
 * @param {AnimationOptions & { scale?: number }} [options]
 * @returns {JSAnimation | null}
 */
export function animateTouchControlPress(element, options = {}) {
  if (!element) return null;

  const duration = options.duration ?? 75;
  const scale = options.scale ?? 0.86;
  const ease = options.ease ?? DEFAULT_EASE_SNAP;
  const variant = options.variant ?? "default";
  const glow = TOUCH_GLOW[variant] ?? TOUCH_GLOW.default;

  if (!shouldAnimate({ touchOnly: true, ...options })) {
    element.style.transform = `scale(${scale})`;
    element.style.filter = glow.heldFilter;
    return null;
  }

  cancelElementAnimations(element);

  return runTouchAnimation(
    element,
    {
      scale,
      filter: ["brightness(1)", glow.flashFilter, glow.heldFilter],
      duration: Math.max(duration, 110),
      ease,
    },
    { force: true },
  );
}

/**
 * Touch control release — springy overshoot back, mobile-only.
 * @param {HTMLElement | null | undefined} element
 * @param {AnimationOptions & { scale?: number }} [options]
 * @returns {JSAnimation | null}
 */
export function animateTouchControlRelease(element, options = {}) {
  if (!element) return null;

  const duration = options.duration ?? 150;
  const scale = options.scale ?? 1;
  const ease = options.ease ?? DEFAULT_EASE_SPRING;

  if (!shouldAnimate({ touchOnly: true, ...options })) {
    clearInlineAnimStyles(element);
    return null;
  }

  cancelElementAnimations(element);

  return runTouchAnimation(
    element,
    {
      scale,
      filter: ["brightness(1.08)", "brightness(1)"],
      duration,
      ease,
      onComplete: () => {
        if (element.isConnected) clearInlineAnimStyles(element);
      },
    },
    { force: true },
  );
}

/**
 * Joystick knob squish when the user first touches the stick.
 * @param {HTMLElement | null | undefined} knobEl
 * @param {AnimationOptions} [options]
 * @returns {JSAnimation | null}
 */
function animateJoystickEngage(knobEl, options = {}) {
  if (!knobEl) return null;

  const duration = options.duration ?? 80;

  if (!shouldAnimate({ touchOnly: true, ...options })) {
    knobEl.style.setProperty("--knob-scale", "0.9");
    knobEl.style.setProperty("--knob-bright", "1.15");
    return null;
  }

  stopTouchPulse(knobEl);

  return runTouchAnimation(
    knobEl,
    {
      "--knob-scale": [1, 0.9],
      "--knob-bright": [1, 1.18],
      duration,
      ease: DEFAULT_EASE_SNAP,
    },
    { force: true },
  );
}

/**
 * Returns the joystick knob to center with spring easing and resets squish.
 * @param {HTMLElement | null | undefined} knobEl
 * @param {number} fromX Current knob X offset in px.
 * @param {number} fromY Current knob Y offset in px.
 * @param {AnimationOptions} [options]
 * @returns {JSAnimation | null}
 */
function animateJoystickRelease(knobEl, fromX, fromY, options = {}) {
  if (!knobEl) return null;

  const duration = options.duration ?? 140;
  const ease = options.ease ?? DEFAULT_EASE_BOUNCE;

  stopTouchPulse(knobEl);

  if (!shouldAnimate({ touchOnly: true, ...options })) {
    knobEl.style.setProperty("--knob-x", "0px");
    knobEl.style.setProperty("--knob-y", "0px");
    knobEl.style.setProperty("--knob-scale", "1");
    knobEl.style.setProperty("--knob-bright", "1");
    return null;
  }

  cancelElementAnimations(knobEl);

  return runTouchAnimation(
    knobEl,
    {
      "--knob-x": [`${fromX.toFixed(1)}px`, "0px"],
      "--knob-y": [`${fromY.toFixed(1)}px`, "0px"],
      "--knob-scale": [0.9, 1],
      "--knob-bright": [1.15, 1],
      duration,
      ease,
      onComplete: () => {
        if (!knobEl.isConnected) return;
        knobEl.style.setProperty("--knob-x", "0px");
        knobEl.style.setProperty("--knob-y", "0px");
        knobEl.style.removeProperty("--knob-scale");
        knobEl.style.removeProperty("--knob-bright");
      },
    },
    { force: true },
  );
}

/**
 * Starts or updates a subtle pulse on the joystick while input is active.
 * @param {HTMLElement | null | undefined} knobEl
 * @param {HTMLElement | null | undefined} ringEl
 * @param {boolean} active Whether the stick is deflected past the deadzone.
 * @param {number} [intensity=0] Input magnitude 0–1 for pulse strength.
 */
function setJoystickActivePulse(knobEl, ringEl, active, intensity = 0) {
  if (!knobEl && !ringEl) return;

  const mag = clampPulseIntensity(intensity);

  if (!active || mag <= 0) {
    stopTouchPulse(knobEl);
    stopTouchPulse(ringEl);
    if (knobEl?.isConnected) {
      knobEl.style.removeProperty("--knob-bright");
    }
    if (ringEl?.isConnected) {
      ringEl.style.removeProperty("--ring-pulse");
      ringEl.style.opacity = "";
    }
    return;
  }

  if (!shouldAnimate({ touchOnly: true })) return;

  const brightPeak = 1 + mag * 0.14;
  const ringPeak = 0.88 + mag * 0.12;

  if (!pulseByElement.has(knobEl)) {
    const knobPulse = animate(knobEl, {
      "--knob-bright": [1.04, brightPeak, 1.04],
      duration: 420 + (1 - mag) * 180,
      loop: true,
      ease: "inOutSine",
    });
    pulseByElement.set(knobEl, knobPulse);
    trackAnimation(knobEl, knobPulse);
  }

  if (ringEl && !pulseByElement.has(ringEl)) {
    const ringPulse = animate(ringEl, {
      opacity: [0.82, ringPeak, 0.82],
      "--ring-pulse": [1, 1 + mag * 0.04, 1],
      duration: 480 + (1 - mag) * 160,
      loop: true,
      ease: "inOutSine",
    });
    pulseByElement.set(ringEl, ringPulse);
    trackAnimation(ringEl, ringPulse);
  }
}

/**
 * @param {number} value
 * @returns {number}
 */
function clampPulseIntensity(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

/**
 * Counts a numeric display up to targetValue (e.g. stats, scores).
 * @param {HTMLElement | null | undefined} element
 * @param {number} targetValue
 * @param {number} [duration=700]
 * @param {AnimationOptions & { formatter?: (n: number) => string, from?: number, delay?: number }} [options]
 * @returns {JSAnimation | null}
 */
export function countUpNumber(element, targetValue, duration = 700, options = {}) {
  if (!element || !Number.isFinite(targetValue)) return null;

  const from = options.from ?? 0;
  const ease = options.ease ?? DEFAULT_EASE_SNAP;
  const delay = options.delay ?? 0;
  const formatter = options.formatter ?? ((n) => String(Math.round(n)));

  if (!shouldAnimate(options)) {
    element.textContent = formatter(targetValue);
    return null;
  }

  cancelElementAnimations(element);

  const counter = { value: from };
  const animation = animate(counter, {
    value: targetValue,
    duration,
    ease,
    delay,
    onUpdate: () => {
      if (!element.isConnected) {
        animation.cancel();
        return;
      }
      element.textContent = formatter(counter.value);
    },
    onComplete: () => {
      element.textContent = formatter(targetValue);
    },
  });

  return trackAnimation(element, animation);
}

/**
 * @param {HTMLElement | null | undefined} element
 * @param {number} [duration=220]
 * @param {AnimationOptions & { from?: number, to?: number }} [options]
 * @returns {JSAnimation | null}
 */
export function fadeIn(element, duration = 220, options = {}) {
  if (!element) return null;

  const ease = options.ease ?? DEFAULT_EASE_FADE;
  const from = options.from ?? 0;
  const to = options.to ?? 1;

  if (!shouldAnimate(options)) {
    element.style.opacity = String(to);
    element.style.pointerEvents = "";
    return null;
  }

  element.style.pointerEvents = "none";

  const animation = runAnimation(
    element,
    {
      opacity: [from, to],
      duration,
      ease,
      onComplete: () => {
        if (element.isConnected) element.style.pointerEvents = "";
      },
    },
    options,
  );

  return animation;
}

/**
 * @param {HTMLElement | null | undefined} element
 * @param {number} [duration=180]
 * @param {AnimationOptions & { from?: number, to?: number, removePointerEvents?: boolean }} [options]
 * @returns {JSAnimation | null}
 */
function fadeOut(element, duration = 180, options = {}) {
  if (!element) return null;

  const ease = options.ease ?? DEFAULT_EASE_FADE;
  const from = options.from ?? 1;
  const to = options.to ?? 0;

  if (!shouldAnimate(options)) {
    element.style.opacity = String(to);
    if (options.removePointerEvents !== false) element.style.pointerEvents = "none";
    return null;
  }

  element.style.pointerEvents = "none";

  return runAnimation(
    element,
    {
      opacity: [from, to],
      duration,
      ease,
    },
    options,
  );
}

/**
 * Kill-feed row entrance — quick fade, slide from the right, subtle scale pop.
 * @param {HTMLElement | null | undefined} element
 * @param {AnimationOptions & { delay?: number, x?: number, fromOpacity?: number }} [options]
 * @returns {JSAnimation | null}
 */
export function animateKillFeedEnter(element, options = {}) {
  if (!element) return null;

  const duration = options.duration ?? 280;
  const ease = options.ease ?? "outBack(1.25)";
  const delay = options.delay ?? 0;
  const x = options.x ?? 16;
  const fromOpacity = options.fromOpacity ?? 0;

  if (!shouldAnimate(options)) {
    element.style.opacity = "0.9";
    element.style.transform = "translateX(0) scale(1)";
    return null;
  }

  cancelElementAnimations(element);

  return runAnimation(
    element,
    {
      opacity: [fromOpacity, 0.9],
      x: [x, 0],
      scale: [0.94, 1],
      duration,
      ease,
      delay,
    },
    options,
  );
}

/**
 * Kill-feed row exit — fade, drift right, and subtle scale-down.
 * @param {HTMLElement | null | undefined} element
 * @param {AnimationOptions & { duration?: number, onComplete?: () => void }} [options]
 * @returns {JSAnimation | null}
 */
export function animateKillFeedExit(element, options = {}) {
  if (!element) return null;

  const duration = options.duration ?? 380;
  const ease = options.ease ?? DEFAULT_EASE_FADE;
  const onComplete = options.onComplete;

  if (!shouldAnimate(options)) {
    element.style.opacity = "0";
    onComplete?.();
    return null;
  }

  cancelElementAnimations(element);

  return runAnimation(
    element,
    {
      opacity: [0.9, 0],
      x: [0, 18],
      scale: [1, 0.92],
      duration,
      ease,
      onComplete: () => {
        if (element.isConnected) {
          element.style.removeProperty("opacity");
          element.style.removeProperty("transform");
        }
        onComplete?.();
      },
    },
    options,
  );
}

/**
 * Cancels a scheduled kill-feed auto-dismiss timer for a row.
 * @param {HTMLElement | null | undefined} row
 */
export function cancelKillFeedExitTimer(row) {
  if (!(row instanceof HTMLElement)) return;
  const timer = killFeedExitTimers.get(row);
  if (timer == null) return;
  window.clearTimeout(timer);
  killFeedExitTimers.delete(row);
}

/**
 * Schedules automatic kill-feed dismissal with Anime.js exit.
 * @param {HTMLElement} row
 * @param {number} [visibleMs=4000]
 */
export function scheduleKillFeedExit(row, visibleMs = 4000) {
  if (!(row instanceof HTMLElement)) return;

  cancelKillFeedExitTimer(row);

  const timer = window.setTimeout(() => {
    killFeedExitTimers.delete(row);
    if (!row.isConnected) return;
    animateKillFeedExit(row, {
      onComplete: () => {
        if (row.isConnected) row.remove();
      },
    });
  }, visibleMs);

  killFeedExitTimers.set(row, timer);
}

/**
 * Quick scale pulse on a cart mesh when nitro activates.
 * @param {import('three').Object3D | null | undefined} mesh
 * @param {AnimationOptions & { scalePeak?: number }} [options]
 * @returns {JSAnimation | null}
 */
export function animateCartBoostPulse(mesh, options = {}) {
  if (!mesh?.isObject3D) return null;

  const duration = options.duration ?? 220;
  const ease = options.ease ?? DEFAULT_EASE_BOUNCE;
  const scalePeak = options.scalePeak ?? 1.055;

  if (!shouldAnimate(options)) return null;

  const existing = cartPulseByMesh.get(mesh);
  if (existing) {
    try {
      existing.cancel();
    } catch {
      // Animation may already be finished.
    }
    cartPulseByMesh.delete(mesh);
  }

  const base = mesh.userData.baseScale ?? mesh.scale.x;
  const peak = base * scalePeak;

  const animation = animate(mesh.scale, {
    x: [base, peak, base],
    y: [base, peak, base],
    z: [base, peak, base],
    duration,
    ease,
    onComplete: () => {
      mesh.scale.setScalar(base);
      cartPulseByMesh.delete(mesh);
    },
  });

  cartPulseByMesh.set(mesh, animation);
  return animation;
}

/**
 * Impact squash-and-stretch on a cart mesh: vertical squash + lateral bulge, then a
 * small overshoot back to base. Shares the boost-pulse animation slot (last-wins) so
 * the two scale tweens never fight over mesh.scale.
 *
 * @param {import('three').Object3D | null | undefined} mesh
 * @param {number} [intensity] 0..1.2 — scales squash depth.
 * @param {AnimationOptions} [options]
 * @returns {JSAnimation | null}
 */
export function animateCartImpactSquash(mesh, intensity = 0.5, options = {}) {
  if (!mesh?.isObject3D) return null;

  const duration = options.duration ?? 200;
  const ease = options.ease ?? DEFAULT_EASE_BOUNCE;

  if (!shouldAnimate(options)) return null;

  const existing = cartPulseByMesh.get(mesh);
  if (existing) {
    try {
      existing.cancel();
    } catch {
      // Animation may already be finished.
    }
    cartPulseByMesh.delete(mesh);
  }

  const base = mesh.userData.baseScale ?? mesh.scale.x;
  const i = Math.min(Math.max(intensity, 0), 1.2);
  const squash = base * (1 - 0.16 * i);
  const bulge = base * (1 + 0.1 * i);
  const overshoot = base * (1 + 0.05 * i);

  const animation = animate(mesh.scale, {
    x: [base, bulge, base],
    y: [base, squash, overshoot, base],
    z: [base, bulge, base],
    duration,
    ease,
    onComplete: () => {
      mesh.scale.setScalar(base);
      cartPulseByMesh.delete(mesh);
    },
  });

  cartPulseByMesh.set(mesh, animation);
  return animation;
}

/**
 * One-shot boost activation flash on the touch Boost button (mobile only).
 * @param {HTMLElement | null | undefined} element
 * @param {AnimationOptions} [options]
 * @returns {JSAnimation | null}
 */
export function animateBoostActivateFlash(element, options = {}) {
  if (!element) return null;

  const duration = options.duration ?? 200;
  const ease = options.ease ?? DEFAULT_EASE_SNAP;
  const glow = TOUCH_GLOW.boost;

  if (!shouldAnimate({ touchOnly: true, ...options })) return null;

  cancelElementAnimations(element);

  return runTouchAnimation(
    element,
    {
      scale: [1, 1.08, 1],
      filter: ["brightness(1)", glow.flashFilter, glow.heldFilter],
      duration,
      ease,
      onComplete: () => {
        if (element.isConnected) clearInlineAnimStyles(element);
      },
    },
    { force: true },
  );
}

/**
 * Color chip selection — quick scale pop + brightness flash on the cart icon.
 * @param {HTMLElement | null | undefined} chip
 * @param {AnimationOptions & { scalePeak?: number }} [options]
 * @returns {JSAnimation | null}
 */
export function animateColorChipSelect(chip, options = {}) {
  if (!chip) return null;

  const target = chip.querySelector("svg") || chip;
  if (!(target instanceof HTMLElement)) return null;

  const duration = options.duration ?? 240;
  const ease = options.ease ?? "outBack(1.45)";
  const scalePeak = options.scalePeak ?? 1.14;

  if (!shouldAnimate(options)) return null;

  cancelElementAnimations(target);

  return runAnimation(
    target,
    {
      scale: [1, scalePeak, 1.04],
      filter: ["brightness(1)", "brightness(1.4)", "brightness(1.1)"],
      duration,
      ease,
      onComplete: () => {
        if (target.isConnected) clearInlineAnimStyles(target);
      },
    },
    options,
  );
}

/**
 * Quick pop when a HUD score value increases.
 * @param {HTMLElement | null | undefined} element
 * @param {AnimationOptions & { isLocal?: boolean, scalePeak?: number }} [options]
 * @returns {JSAnimation | null}
 */
export function animateScorePop(element, options = {}) {
  if (!element) return null;

  const isLocal = Boolean(options.isLocal);
  const duration = options.duration ?? (isLocal ? 260 : 200);
  const ease = options.ease ?? "outBack(1.4)";
  const scalePeak = options.scalePeak ?? (isLocal ? 1.16 : 1.11);

  if (!shouldAnimate(options)) return null;

  cancelElementAnimations(element);

  return runAnimation(
    element,
    {
      scale: [1, scalePeak, 1],
      filter: ["brightness(1)", "brightness(1.32)", "brightness(1)"],
      duration,
      ease,
      onComplete: () => {
        if (element.isConnected) clearInlineAnimStyles(element);
      },
    },
    options,
  );
}

/**
 * Subtle tick on a volume percentage readout when the slider moves.
 * @param {HTMLElement | null | undefined} element
 * @param {AnimationOptions} [options]
 * @returns {JSAnimation | null}
 */
export function animateVolumeTick(element, options = {}) {
  return animateSelectionPop(element, {
    duration: 120,
    scalePeak: 1.08,
    ease: "outBack(1.25)",
    ...options,
  });
}

/**
 * Quick pop when the mute button toggles state.
 * @param {HTMLElement | null | undefined} element
 * @param {AnimationOptions} [options]
 * @returns {JSAnimation | null}
 */
export function animateMuteToggle(element, options = {}) {
  return animateSelectionPop(element, {
    duration: 160,
    scalePeak: 1.1,
    ...options,
  });
}

/**
 * One-shot spin on the username re-roll button.
 * @param {HTMLElement | null | undefined} element
 * @param {AnimationOptions} [options]
 * @returns {JSAnimation | null}
 */
export function animateRerollSpin(element, options = {}) {
  if (!element) return null;

  const duration = options.duration ?? 320;
  const ease = options.ease ?? DEFAULT_EASE_SNAP;

  if (!shouldAnimate(options)) return null;

  cancelElementAnimations(element);

  return runAnimation(
    element,
    {
      rotate: [0, 180],
      duration,
      ease,
      onComplete: () => {
        if (element.isConnected) element.style.removeProperty("transform");
      },
    },
    options,
  );
}

/**
 * Fades an element out, runs a callback at the midpoint, then fades back in.
 * @param {HTMLElement | null | undefined} element
 * @param {() => void} midway Called while the element is fully transparent.
 * @param {AnimationOptions & { fadeOutMs?: number, fadeInMs?: number }} [options]
 * @returns {Promise<void>}
 */
export function crossfadeElement(element, midway, options = {}) {
  if (!element) {
    midway?.();
    return Promise.resolve();
  }

  const fadeOutMs = options.fadeOutMs ?? 140;
  const fadeInMs = options.fadeInMs ?? 180;

  if (!shouldAnimate(options)) {
    midway?.();
    element.style.opacity = "1";
    return Promise.resolve();
  }

  const outAnim = fadeOut(element, fadeOutMs, options);
  const runMid = () => {
    midway?.();
    fadeIn(element, fadeInMs, options);
  };

  if (outAnim?.then) {
    return outAnim.then(runMid);
  }

  return new Promise((resolve) => {
    window.setTimeout(() => {
      runMid();
      resolve();
    }, fadeOutMs);
  });
}

/**
 * Generic selection pop for cards, chips, and toggles.
 * @param {HTMLElement | null | undefined} element
 * @param {AnimationOptions & { scalePeak?: number }} [options]
 * @returns {JSAnimation | null}
 */
function animateSelectionPop(element, options = {}) {
  if (!element) return null;

  const duration = options.duration ?? 260;
  const ease = options.ease ?? DEFAULT_EASE_BOUNCE;
  const scalePeak = options.scalePeak ?? 1.06;

  if (!shouldAnimate(options)) return null;

  cancelElementAnimations(element);

  return runAnimation(
    element,
    {
      scale: [1, scalePeak, 1],
      duration,
      ease,
      onComplete: () => {
        if (element.isConnected) clearInlineAnimStyles(element);
      },
    },
    options,
  );
}

/**
 * Level card selection feedback — subtle inner pop.
 * @param {HTMLElement | null | undefined} element
 * @param {AnimationOptions} [options]
 * @returns {JSAnimation | null}
 */
export function animateLevelCardSelect(element, options = {}) {
  return animateSelectionPop(element, {
    duration: 240,
    scalePeak: 1.05,
    ease: "outBack(1.3)",
    ...options,
  });
}

/**
 * Ready button state toggle — scale pulse with brighter/dimmer flash.
 * @param {HTMLElement | null | undefined} element
 * @param {boolean} isReady
 * @param {AnimationOptions} [options]
 * @returns {JSAnimation | null}
 */
export function animateReadyStateToggle(element, isReady, options = {}) {
  if (!element) return null;

  const duration = options.duration ?? 300;
  const ease = options.ease ?? "outBack(1.35)";

  if (!shouldAnimate(options)) return null;

  cancelElementAnimations(element);

  return runAnimation(
    element,
    {
      scale: isReady ? [1, 1.08, 1] : [1, 0.96, 1],
      filter: isReady
        ? ["brightness(1)", "brightness(1.22)", "brightness(1)"]
        : ["brightness(1)", "brightness(0.9)", "brightness(1)"],
      duration,
      ease,
      onComplete: () => {
        if (element.isConnected) clearInlineAnimStyles(element);
      },
    },
    options,
  );
}

/**
 * Smooth hover scale-in for desktop pointer hover targets.
 * @param {HTMLElement | null | undefined} element
 * @param {AnimationOptions & { scale?: number }} [options]
 * @returns {JSAnimation | null}
 */
function animateHoverScale(element, options = {}) {
  if (!element) return null;

  const duration = options.duration ?? 150;
  const ease = options.ease ?? "outQuad";
  const scale = options.scale ?? 1.03;

  if (!shouldAnimate(options)) return null;

  cancelElementAnimations(element);

  return runAnimation(
    element,
    {
      scale,
      duration,
      ease,
    },
    options,
  );
}

/**
 * Returns a hover target to its resting scale.
 * @param {HTMLElement | null | undefined} element
 * @param {AnimationOptions} [options]
 * @returns {JSAnimation | null}
 */
function animateHoverReset(element, options = {}) {
  if (!element) return null;

  const duration = options.duration ?? 120;
  const ease = options.ease ?? "outQuad";

  if (!shouldAnimate(options)) {
    clearInlineAnimStyles(element);
    return null;
  }

  cancelElementAnimations(element);

  return runAnimation(
    element,
    {
      scale: 1,
      duration,
      ease,
      onComplete: () => {
        if (element.isConnected) clearInlineAnimStyles(element);
      },
    },
    options,
  );
}

/**
 * Wires snappy pointer press/release feedback on any button-like element.
 * @param {HTMLElement | null | undefined} btn
 * @param {AnimationOptions & { scale?: number, getTarget?: (btn: HTMLElement) => HTMLElement | null }} [options]
 */
export function wireButtonPressFeedback(btn, options = {}) {
  if (!(btn instanceof HTMLElement) || buttonPressWired.has(btn)) return;
  buttonPressWired.add(btn);

  const getTarget = options.getTarget ?? ((el) => el);
  const pressScale = options.scale ?? 0.94;
  let pressed = false;

  const onPress = (e) => {
    if (btn.disabled) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    pressed = true;
    const target = getTarget(btn);
    if (target) animateButtonPress(target, { duration: 70, scale: pressScale, force: true });
  };

  const onRelease = () => {
    if (!pressed) return;
    pressed = false;
    const target = getTarget(btn);
    if (target) animateButtonRelease(target, { duration: 120, force: true });
  };

  btn.addEventListener("pointerdown", onPress);
  btn.addEventListener("pointerup", onRelease);
  btn.addEventListener("pointercancel", onRelease);
  btn.addEventListener("pointerleave", (e) => {
    if (pressed && e.pointerType === "mouse") onRelease();
  });
}

/**
 * Wires smooth hover scale feedback on desktop pointer elements.
 * @param {HTMLElement | null | undefined} btn
 * @param {AnimationOptions & { scale?: number, getTarget?: (btn: HTMLElement) => HTMLElement | null }} [options]
 */
export function wireHoverFeedback(btn, options = {}) {
  if (!(btn instanceof HTMLElement) || hoverWired.has(btn) || isTouchDevice()) return;
  hoverWired.add(btn);

  const getTarget = options.getTarget ?? ((el) => el);
  const hoverScale = options.scale ?? 1.03;

  btn.addEventListener("pointerenter", (e) => {
    if (e.pointerType !== "mouse") return;
    const target = getTarget(btn);
    if (target) animateHoverScale(target, { scale: hoverScale, duration: 150 });
  });

  btn.addEventListener("pointerleave", (e) => {
    if (e.pointerType !== "mouse") return;
    const target = getTarget(btn);
    if (target) animateHoverReset(target, { duration: 120 });
  });
}
