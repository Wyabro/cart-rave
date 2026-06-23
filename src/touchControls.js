// touchControls.js — virtual joystick + action buttons for mobile play

import { clamp } from "./utils.js";
import {
  animateTouchControlPress,
  animateTouchControlRelease,
  animateBoostActivateFlash,
  animateJoystickEngage,
  animateJoystickRelease,
  setJoystickActivePulse,
  stopTouchPulse,
} from "./animations.js";

const JOY_DEADZONE = 0.12;
const HUD_CLEARANCE_GAP = 12;

/** @type {HTMLElement | null} */
let rootEl = null;
/** @type {HTMLElement | null} */
let joyEl = null;
/** @type {HTMLElement | null} */
let knobEl = null;

/** @type {HTMLElement | null} */
let joyRingEl = null;

/** Knob travel radius in px — derived from joy element size on pointer down. */
let joyRadius = 56;
let knobOffsetX = 0;
let knobOffsetY = 0;
let touchForward = 0;
let touchTurn = 0;
let boostHeld = false;
let joyActive = false;
/** @type {number | null} */
let joyPointerId = null;
/** @type {number | null} */
let boostPointerId = null;
let joyCenterX = 0;
let joyCenterY = 0;

/** @type {(() => void) | null} */
let onHopCb = null;
/** @type {(() => void) | null} */
let onBoostCb = null;

/** @type {HTMLElement | null} */
let boostBtnEl = null;
/** @type {HTMLElement | null} */
let hopBtnEl = null;
/** @type {ResizeObserver | null} */
let hudResizeObserver = null;
/** @type {MutationObserver | null} */
let hudMutationObserver = null;
/** @type {number | null} */
let layoutRaf = null;
let hudObserversBound = false;

function isElementVisible(el) {
  if (!el) return false;
  const style = getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden") return false;
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

/**
 * Measures HUD elements and sets CSS variables so controls sit above the score bar, etc.
 */
export function syncTouchLayout() {
  if (!rootEl || rootEl.style.display === "none") return;

  const vh = window.innerHeight || 0;
  let bottomClearance = 0;

  const scores = document.querySelector("#hud .hud-scores");
  if (isElementVisible(scores)) {
    const rect = scores.getBoundingClientRect();
    // * Mobile score bar docks to the bottom edge — lift controls above it.
    if (rect.bottom >= vh - 28) {
      bottomClearance = Math.max(bottomClearance, rect.height + HUD_CLEARANCE_GAP);
    }
  }

  const readyBtn = document.querySelector("#hud .hud-ready-btn");
  if (isElementVisible(readyBtn)) {
    const rect = readyBtn.getBoundingClientRect();
    if (rect.bottom > vh * 0.55) {
      bottomClearance = Math.max(bottomClearance, vh - rect.top + HUD_CLEARANCE_GAP);
    }
  }

  rootEl.style.setProperty("--gtc-hud-bottom-clearance", `${Math.round(bottomClearance)}px`);

  const shortViewport = vh < 640;
  const landscape = window.innerWidth > window.innerHeight && vh < 520;
  rootEl.classList.toggle("gtc-compact", shortViewport);
  rootEl.classList.toggle("gtc-landscape", landscape);
}

function scheduleLayoutSync() {
  if (layoutRaf != null) return;
  layoutRaf = requestAnimationFrame(() => {
    layoutRaf = null;
    syncTouchLayout();
  });
}

function ensureHudObservers() {
  if (hudObserversBound) return;
  const hud = document.getElementById("hud");
  if (!hud) return;

  hudObserversBound = true;

  if (typeof ResizeObserver !== "undefined") {
    hudResizeObserver?.disconnect();
    hudResizeObserver = new ResizeObserver(scheduleLayoutSync);
    hudResizeObserver.observe(hud);

    const scores = hud.querySelector(".hud-scores");
    if (scores) hudResizeObserver.observe(scores);
  }

  if (typeof MutationObserver !== "undefined") {
    hudMutationObserver?.disconnect();
    hudMutationObserver = new MutationObserver(scheduleLayoutSync);
    for (const sel of [".hud-scores", ".hud-timer", ".hud-ready-btn"]) {
      const el = hud.querySelector(sel);
      if (el) {
        hudMutationObserver.observe(el, {
          attributes: true,
          attributeFilter: ["style"],
        });
      }
    }
  }
}

function bindLayoutSync() {
  window.addEventListener("resize", scheduleLayoutSync, { passive: true });
  window.addEventListener("orientationchange", scheduleLayoutSync, { passive: true });
}

function setKnobOffset(kx, ky) {
  if (!knobEl) return;
  knobOffsetX = kx;
  knobOffsetY = ky;
  knobEl.style.setProperty("--knob-x", `${kx.toFixed(1)}px`);
  knobEl.style.setProperty("--knob-y", `${ky.toFixed(1)}px`);
}

function resetJoystick() {
  joyActive = false;
  joyPointerId = null;
  touchForward = 0;
  touchTurn = 0;
  joyEl?.classList.remove("is-active");

  stopTouchPulse(knobEl);
  stopTouchPulse(joyRingEl);

  if (knobEl) {
    const fromX = knobOffsetX;
    const fromY = knobOffsetY;
    knobOffsetX = 0;
    knobOffsetY = 0;
    animateJoystickRelease(knobEl, fromX, fromY);
  } else {
    setKnobOffset(0, 0);
  }
}

function resetBoost() {
  boostHeld = false;
  boostPointerId = null;
  if (boostBtnEl) {
    boostBtnEl.classList.remove("is-held");
    animateTouchControlRelease(boostBtnEl);
  }
}

export function resetTouchControls() {
  resetJoystick();
  resetBoost();
  if (hopBtnEl) {
    hopBtnEl.classList.remove("is-pressed");
    animateTouchControlRelease(hopBtnEl);
  }
}

/**
 * Returns tank-steering axes from the virtual joystick.
 * @returns {{ forward: number, turn: number }}
 */
export function getTouchAxis() {
  if (!joyActive && Math.abs(touchForward) < JOY_DEADZONE && Math.abs(touchTurn) < JOY_DEADZONE) {
    return { forward: 0, turn: 0 };
  }
  return {
    forward: Math.abs(touchForward) < JOY_DEADZONE ? 0 : touchForward,
    turn: Math.abs(touchTurn) < JOY_DEADZONE ? 0 : touchTurn,
  };
}

export function isJoystickActive() {
  return joyActive;
}

export function isBoostHeld() {
  return boostHeld;
}

/**
 * @param {boolean} visible
 */
export function setTouchControlsVisible(visible) {
  if (!rootEl) return;
  rootEl.style.display = visible ? "block" : "none";
  if (!visible) {
    resetTouchControls();
    return;
  }
  ensureHudObservers();
  scheduleLayoutSync();
}

function readJoyMetrics(joy) {
  const rect = joy.getBoundingClientRect();
  const size = Math.min(rect.width, rect.height);
  joyRadius = Math.max(32, size * 0.38);
  return {
    centerX: rect.left + rect.width / 2,
    centerY: rect.top + rect.height / 2,
  };
}

function updateJoystick(clientX, clientY) {
  const dx = clientX - joyCenterX;
  const dy = clientY - joyCenterY;
  const dist = Math.hypot(dx, dy);
  const clampedDist = Math.min(dist, joyRadius);
  const angle = dist > 1e-4 ? Math.atan2(dy, dx) : 0;
  const kx = Math.cos(angle) * clampedDist;
  const ky = Math.sin(angle) * clampedDist;

  setKnobOffset(kx, ky);

  touchTurn = clamp(-kx / joyRadius, -1, 1);
  touchForward = clamp(-ky / joyRadius, -1, 1);

  const magnitude = Math.hypot(touchTurn, touchForward);
  setJoystickActivePulse(
    knobEl,
    joyRingEl,
    magnitude > JOY_DEADZONE,
    magnitude,
  );
}

function injectTouchStyles() {
  if (document.getElementById("game-touch-styles")) return;

  const style = document.createElement("style");
  style.id = "game-touch-styles";
  style.textContent = `
    #game-touch-controls {
      --gtc-joy-size: clamp(124px, 27vmin, 160px);
      --gtc-btn-w: clamp(96px, 24vw, 118px);
      --gtc-btn-h: clamp(52px, 12.5vw, 60px);
      --gtc-btn-gap: clamp(10px, 2.5vw, 14px);
      --gtc-edge: clamp(14px, 3.5vw, 22px);
      --gtc-safe-top: env(safe-area-inset-top, 0px);
      --gtc-safe-right: env(safe-area-inset-right, 0px);
      --gtc-safe-bottom: env(safe-area-inset-bottom, 0px);
      --gtc-safe-left: env(safe-area-inset-left, 0px);
      --gtc-hud-bottom-clearance: 0px;
      --gtc-bottom-offset: calc(var(--gtc-edge) + var(--gtc-safe-bottom) + var(--gtc-hud-bottom-clearance));

      position: fixed;
      inset: 0;
      z-index: 19990;
      pointer-events: none;
      user-select: none;
      -webkit-user-select: none;
      touch-action: none;
    }

    #game-touch-controls.gtc-compact {
      --gtc-joy-size: clamp(108px, 24vmin, 132px);
      --gtc-btn-w: clamp(88px, 22vw, 104px);
      --gtc-btn-h: clamp(46px, 11vw, 54px);
      --gtc-edge: clamp(10px, 2.8vw, 16px);
    }

    #game-touch-controls.gtc-landscape {
      --gtc-joy-size: clamp(96px, 20vmin, 116px);
      --gtc-btn-h: clamp(42px, 9vw, 50px);
      --gtc-btn-gap: 8px;
    }

    #game-touch-controls .gtc-joy {
      position: absolute;
      left: calc(var(--gtc-edge) + var(--gtc-safe-left));
      bottom: var(--gtc-bottom-offset);
      width: var(--gtc-joy-size);
      height: var(--gtc-joy-size);
      border-radius: 999px;
      background: rgba(0, 0, 0, 0.26);
      border: 2px solid rgba(34, 230, 255, 0.22);
      box-shadow:
        0 0 0 1px rgba(255, 43, 214, 0.08),
        0 4px 24px rgba(0, 0, 0, 0.35);
      backdrop-filter: blur(6px);
      -webkit-backdrop-filter: blur(6px);
      pointer-events: auto;
      touch-action: none;
      transition: border-color 120ms ease, box-shadow 120ms ease, background 120ms ease;
    }

    #game-touch-controls .gtc-joy.is-active {
      background: rgba(0, 0, 0, 0.34);
      border-color: rgba(34, 230, 255, 0.48);
      box-shadow:
        0 0 0 2px rgba(34, 230, 255, 0.18),
        0 0 28px rgba(34, 230, 255, 0.22),
        0 4px 24px rgba(0, 0, 0, 0.4);
    }

    #game-touch-controls .gtc-joy-ring {
      --ring-pulse: 1;
      position: absolute;
      inset: 14%;
      border-radius: 999px;
      border: 1px dashed rgba(255, 255, 255, 0.1);
      pointer-events: none;
      opacity: 0.7;
      transform: scale(var(--ring-pulse));
      transition: border-color 120ms ease;
    }

    #game-touch-controls .gtc-joy.is-active .gtc-joy-ring {
      opacity: 1;
      border-color: rgba(34, 230, 255, 0.28);
    }

    #game-touch-controls .gtc-joy-knob {
      --knob-x: 0px;
      --knob-y: 0px;
      --knob-scale: 1;
      --knob-bright: 1;
      position: absolute;
      left: 50%;
      top: 50%;
      width: 42%;
      height: 42%;
      transform: translate3d(calc(-50% + var(--knob-x)), calc(-50% + var(--knob-y)), 0) scale(var(--knob-scale));
      filter: brightness(var(--knob-bright));
      border-radius: 999px;
      background: radial-gradient(circle at 35% 30%, rgba(255, 255, 255, 0.22), rgba(255, 255, 255, 0.06) 55%, rgba(0, 0, 0, 0.2));
      border: 2px solid rgba(255, 43, 214, 0.35);
      box-shadow:
        0 2px 10px rgba(0, 0, 0, 0.45),
        0 0 16px rgba(255, 43, 214, 0.16);
      pointer-events: none;
    }

    #game-touch-controls .gtc-joy.is-active .gtc-joy-knob {
      border-color: rgba(255, 255, 255, 0.55);
      box-shadow:
        0 2px 12px rgba(0, 0, 0, 0.5),
        0 0 22px rgba(34, 230, 255, 0.28);
    }

    #game-touch-controls .gtc-btns {
      position: absolute;
      right: calc(var(--gtc-edge) + var(--gtc-safe-right));
      bottom: var(--gtc-bottom-offset);
      display: grid;
      gap: var(--gtc-btn-gap);
      pointer-events: auto;
    }

    #game-touch-controls .gtc-btn {
      width: var(--gtc-btn-w);
      height: var(--gtc-btn-h);
      border-radius: 999px;
      border: 2px solid rgba(255, 255, 255, 0.16);
      background: rgba(0, 0, 0, 0.28);
      color: rgba(255, 255, 255, 0.92);
      font-family: "Space Mono", ui-monospace, monospace;
      font-size: clamp(10px, 2.6vw, 12px);
      font-weight: 700;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      box-shadow: 0 4px 18px rgba(0, 0, 0, 0.35);
      backdrop-filter: blur(6px);
      -webkit-backdrop-filter: blur(6px);
      touch-action: none;
      transition:
        background 80ms ease,
        border-color 80ms ease,
        box-shadow 80ms ease;
    }

    #game-touch-controls .gtc-btn--boost {
      border-color: rgba(34, 230, 255, 0.34);
      box-shadow:
        0 4px 18px rgba(0, 0, 0, 0.35),
        0 0 14px rgba(34, 230, 255, 0.14);
    }

    #game-touch-controls .gtc-btn--hop {
      border-color: rgba(255, 43, 214, 0.34);
      box-shadow:
        0 4px 18px rgba(0, 0, 0, 0.35),
        0 0 14px rgba(255, 43, 214, 0.14);
    }

    #game-touch-controls .gtc-btn.is-held {
      background: rgba(34, 230, 255, 0.16);
      border-color: rgba(34, 230, 255, 0.72);
      box-shadow:
        0 2px 10px rgba(0, 0, 0, 0.4),
        0 0 24px rgba(34, 230, 255, 0.35);
    }

    #game-touch-controls .gtc-btn--hop.is-pressed {
      background: rgba(255, 43, 214, 0.18);
      border-color: rgba(255, 43, 214, 0.72);
      box-shadow:
        0 2px 10px rgba(0, 0, 0, 0.4),
        0 0 24px rgba(255, 43, 214, 0.35);
    }

    @media (max-width: 380px) {
      #game-touch-controls {
        --gtc-btn-w: clamp(84px, 25vw, 96px);
      }
    }

    @media (max-height: 520px) and (orientation: landscape) {
      #game-touch-controls {
        --gtc-hud-bottom-clearance: max(var(--gtc-hud-bottom-clearance), 0px);
      }
    }

    /* Desktop: never show touch layer (keyboard unchanged). */
    @media (pointer: fine) and (hover: hover) {
      #game-touch-controls { display: none !important; }
    }
  `;
  document.head.appendChild(style);
}

function onJoyPointerDown(e) {
  if (joyActive) return;
  e.preventDefault();
  joyActive = true;
  joyPointerId = e.pointerId;
  joyEl?.classList.add("is-active");
  animateJoystickEngage(knobEl);
  const metrics = readJoyMetrics(e.currentTarget);
  joyCenterX = metrics.centerX;
  joyCenterY = metrics.centerY;
  e.currentTarget.setPointerCapture(e.pointerId);
  updateJoystick(e.clientX, e.clientY);
}

function onJoyPointerMove(e) {
  if (!joyActive || e.pointerId !== joyPointerId) return;
  e.preventDefault();
  updateJoystick(e.clientX, e.clientY);
}

function onJoyPointerEnd(e) {
  if (e.pointerId !== joyPointerId) return;
  e.preventDefault();
  try {
    e.currentTarget.releasePointerCapture(e.pointerId);
  } catch {
    // Pointer may already be released.
  }
  resetJoystick();
}

function onBoostPointerDown(e) {
  if (boostPointerId != null) return;
  e.preventDefault();
  boostPointerId = e.pointerId;
  boostHeld = true;
  const btn = e.currentTarget;
  btn.classList.add("is-held");
  animateTouchControlPress(btn, { variant: "boost" });
  btn.setPointerCapture(e.pointerId);
  onBoostCb?.();
}

function onBoostPointerEnd(e) {
  if (e.pointerId !== boostPointerId) return;
  e.preventDefault();
  try {
    e.currentTarget.releasePointerCapture(e.pointerId);
  } catch {
    // Pointer may already be released.
  }
  const btn = e.currentTarget;
  btn.classList.remove("is-held");
  animateTouchControlRelease(btn);
  resetBoost();
}

/**
 * Plays a one-shot activation flash when nitro successfully fires (mobile Boost button).
 */
export function flashBoostActivate() {
  if (!boostBtnEl || rootEl?.style.display === "none") return;
  animateBoostActivateFlash(boostBtnEl);
}

function onHopPointerDown(e) {
  e.preventDefault();
  const btn = e.currentTarget;
  btn.classList.add("is-pressed");
  animateTouchControlPress(btn, { variant: "hop" });
  window.setTimeout(() => {
    btn.classList.remove("is-pressed");
    animateTouchControlRelease(btn);
  }, 140);
  onHopCb?.();
}

/**
 * Creates on-screen touch controls and wires pointer handlers.
 * @param {{ onHop?: () => void, onBoost?: () => void }} callbacks
 */
export function setupTouchControls(callbacks = {}) {
  onHopCb = callbacks.onHop ?? null;
  onBoostCb = callbacks.onBoost ?? null;

  injectTouchStyles();

  if (rootEl) return;

  rootEl = document.createElement("div");
  rootEl.id = "game-touch-controls";
  rootEl.setAttribute("aria-hidden", "true");
  rootEl.style.display = "none";

  joyEl = document.createElement("div");
  joyEl.className = "gtc-joy";
  joyEl.setAttribute("aria-label", "Move cart");

  const joyRing = document.createElement("div");
  joyRing.className = "gtc-joy-ring";
  joyRingEl = joyRing;
  joyEl.appendChild(joyRing);

  knobEl = document.createElement("div");
  knobEl.className = "gtc-joy-knob";
  joyEl.appendChild(knobEl);

  joyEl.addEventListener("pointerdown", onJoyPointerDown, { passive: false });
  joyEl.addEventListener("pointermove", onJoyPointerMove, { passive: false });
  joyEl.addEventListener("pointerup", onJoyPointerEnd, { passive: false });
  joyEl.addEventListener("pointercancel", onJoyPointerEnd, { passive: false });

  const btns = document.createElement("div");
  btns.className = "gtc-btns";

  const boostBtn = document.createElement("button");
  boostBtn.type = "button";
  boostBtn.className = "gtc-btn gtc-btn--boost";
  boostBtn.textContent = "BOOST";
  boostBtn.setAttribute("aria-label", "Nitro boost");
  boostBtnEl = boostBtn;
  boostBtn.addEventListener("pointerdown", onBoostPointerDown, { passive: false });
  boostBtn.addEventListener("pointerup", onBoostPointerEnd, { passive: false });
  boostBtn.addEventListener("pointercancel", onBoostPointerEnd, { passive: false });

  const hopBtn = document.createElement("button");
  hopBtn.type = "button";
  hopBtn.className = "gtc-btn gtc-btn--hop";
  hopBtn.textContent = "HOP";
  hopBtn.setAttribute("aria-label", "Hop");
  hopBtnEl = hopBtn;
  hopBtn.addEventListener("pointerdown", onHopPointerDown, { passive: false });

  btns.appendChild(boostBtn);
  btns.appendChild(hopBtn);

  rootEl.appendChild(joyEl);
  rootEl.appendChild(btns);
  document.body.appendChild(rootEl);

  bindLayoutSync();
  window.addEventListener("blur", resetTouchControls);
}
