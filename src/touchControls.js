import nipplejs from "nipplejs";
import { setInputMode } from "./input.js";
import {
  animateTouchControlPress,
  animateTouchControlRelease,
  animateBoostActivateFlash,
} from "./animations.js";

const JOY_DEADZONE = 0.12;
const HUD_CLEARANCE_GAP = 12;

/** @type {HTMLElement | null} */
let rootEl = null;

/** nipplejs Collection instance */
let nippleCollection = null;
/** nipplejs zone element */
let joyZoneEl = null;

let touchForward = 0;
let touchTurn = 0;
let boostHeld = false;
let joyActive = false;
/** @type {number | null} */
let boostPointerId = null;

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

// ───── HUD layout sync ─────────────────────────────────────────────────────

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

  // * Let nipplejs recalculate its zone bounding box after layout changes.
  nippleCollection?.reposition();
}

function scheduleLayoutSync() {
  if (layoutRaf != null) return;
  layoutRaf = requestAnimationFrame(() => {
    layoutRaf = null;
    syncTouchLayout();
  });
}

/**
 * Renders the local boost charge state onto the BOOST button (mobile HUD —
 * replaces the desktop boost meter). Pass a null fillPct to reset to idle.
 *
 * @param {number | null} fillPct 0..100 charge/cooldown fill.
 * @param {"ready" | "charging" | "charged" | "cooldown"} [state]
 */
export function updateBoostRing(fillPct, state = "ready") {
  if (!boostBtnEl) return;
  if (fillPct == null) {
    if (boostBtnEl.dataset.boostState) delete boostBtnEl.dataset.boostState;
    boostBtnEl.style.removeProperty("--gtc-boost-pct");
    return;
  }
  boostBtnEl.style.setProperty("--gtc-boost-pct", String(Math.round(fillPct)));
  if (boostBtnEl.dataset.boostState !== state) boostBtnEl.dataset.boostState = state;
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

// ───── Nipplejs joystick ────────────────────────────────────────────────────

function initNippleJoystick() {
  if (!joyZoneEl) return;

  // Destroy previous instance if re-creating (e.g. orientation change).
  if (nippleCollection) {
    nippleCollection.destroy();
    nippleCollection = null;
  }

  nippleCollection = nipplejs.create({
    zone: joyZoneEl,
    mode: "static",
    position: { left: "50%", top: "50%" },
    size: 126,
    threshold: JOY_DEADZONE,
    color: {
      front: "radial-gradient(circle at 35% 30%, rgba(255,255,255,0.22), rgba(255,255,255,0.06) 55%, rgba(0,0,0,0.2))",
      back: "rgba(0, 0, 0, 0.26)",
    },
    fadeTime: 150,
    restOpacity: 0.55,
  });

  nippleCollection.on("start", () => {
    joyActive = true;
    joyZoneEl?.classList.add("is-active");
  });

  nippleCollection.on("move", (evt) => {
    const v = evt.data.vector;
    // * nipplejs vector: x=-1..1 (left..right), y=-1..1 (up..down in screen-space → positive=up)
    // * Cart steering: forward=positive=forward (up), turn=positive=left
    touchForward = v.y;
    touchTurn = -v.x;
  });

  nippleCollection.on("end", () => {
    joyActive = false;
    touchForward = 0;
    touchTurn = 0;
    joyZoneEl?.classList.remove("is-active");
  });
}

function destroyNippleJoystick() {
  if (nippleCollection) {
    nippleCollection.destroy();
    nippleCollection = null;
  }
  joyActive = false;
  touchForward = 0;
  touchTurn = 0;
}

// ───── Boost / Hop button handlers ──────────────────────────────────────────

function resetBoost() {
  boostHeld = false;
  boostPointerId = null;
  if (boostBtnEl) {
    boostBtnEl.classList.remove("is-held");
    animateTouchControlRelease(boostBtnEl);
  }
}

export function resetTouchControls() {
  // * Reset nipplejs to rest state (no active move to reset via API, just clear state).
  joyActive = false;
  touchForward = 0;
  touchTurn = 0;
  resetBoost();
  if (hopBtnEl) {
    hopBtnEl.classList.remove("is-pressed");
    animateTouchControlRelease(hopBtnEl);
  }
}

// ───── Public axis / state helpers ──────────────────────────────────────────

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

// ───── Visibility ───────────────────────────────────────────────────────────

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

// ───── Boost button flash (called externally when nitro fires) ──────────────

export function flashBoostActivate() {
  if (!boostBtnEl || rootEl?.style.display === "none") return;
  animateBoostActivateFlash(boostBtnEl);
}

// ───── Pointer handlers for Boost / Hop buttons ─────────────────────────────

function onBoostPointerDown(e) {
  setInputMode("touch");
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

function onHopPointerDown(e) {
  setInputMode("touch");
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

// ───── CSS injection ────────────────────────────────────────────────────────

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

    /* nipplejs zone — positioned in the same spot as the old custom joystick */
    #game-touch-controls .gtc-nipple-zone {
      position: absolute;
      left: calc(var(--gtc-edge) + var(--gtc-safe-left));
      bottom: var(--gtc-bottom-offset);
      width: var(--gtc-joy-size);
      height: var(--gtc-joy-size);
      pointer-events: auto;
      touch-action: none;
    }

    /* ── nipplejs neon theme overrides ── */

    /* Outer circle (back) — matches old .gtc-joy */
    #game-touch-controls .gtc-nipple-zone .joystick .back {
      background: rgba(0, 0, 0, 0.26) !important;
      border: 2px solid rgba(34, 230, 255, 0.22);
      box-shadow:
        0 0 0 1px rgba(255, 43, 214, 0.08),
        0 4px 24px rgba(0, 0, 0, 0.35);
      backdrop-filter: blur(6px);
      -webkit-backdrop-filter: blur(6px);
    }

    /* Outer circle active — cyan glow */
    #game-touch-controls .gtc-nipple-zone.is-active .joystick .back {
      background: rgba(0, 0, 0, 0.34) !important;
      border-color: rgba(34, 230, 255, 0.48);
      box-shadow:
        0 0 0 2px rgba(34, 230, 255, 0.18),
        0 0 28px rgba(34, 230, 255, 0.22),
        0 4px 24px rgba(0, 0, 0, 0.4);
    }

    /* Inner thumb (front) — matches old .gtc-joy-knob */
    #game-touch-controls .gtc-nipple-zone .joystick .front {
      background: radial-gradient(circle at 35% 30%, rgba(255, 255, 255, 0.22), rgba(255, 255, 255, 0.06) 55%, rgba(0, 0, 0, 0.2)) !important;
      border: 2px solid rgba(255, 43, 214, 0.35);
      box-shadow:
        0 2px 10px rgba(0, 0, 0, 0.45),
        0 0 16px rgba(255, 43, 214, 0.16);
    }

    /* Inner thumb active — white border + cyan glow */
    #game-touch-controls .gtc-nipple-zone.is-active .joystick .front {
      border-color: rgba(255, 255, 255, 0.55);
      box-shadow:
        0 2px 12px rgba(0, 0, 0, 0.5),
        0 0 22px rgba(34, 230, 255, 0.28);
    }

    /* Boost / Hop action buttons */
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
      position: relative;
      overflow: hidden;
      border-color: rgba(34, 230, 255, 0.34);
      box-shadow:
        0 4px 18px rgba(0, 0, 0, 0.35),
        0 0 14px rgba(34, 230, 255, 0.14);
    }

    /* Boost charge fill — the desktop meter's state grammar rendered where the
       thumb already rests: cyan=ready, amber=charging, white pulse=charged,
       faded magenta=cooldown. Driven by updateBoostRing(). */
    #game-touch-controls .gtc-btn--boost::before {
      content: "";
      position: absolute;
      inset: 0;
      width: calc(var(--gtc-boost-pct, 100) * 1%);
      background: var(--gtc-boost-color, rgba(34, 230, 255, 0.26));
      transition: width 60ms linear;
      pointer-events: none;
    }
    #game-touch-controls .gtc-btn--boost[data-boost-state="charging"] {
      --gtc-boost-color: rgba(255, 229, 61, 0.30);
    }
    #game-touch-controls .gtc-btn--boost[data-boost-state="charged"] {
      --gtc-boost-color: rgba(255, 255, 255, 0.38);
      animation: gtcBoostCharged 380ms ease-in-out infinite alternate;
    }
    #game-touch-controls .gtc-btn--boost[data-boost-state="cooldown"] {
      --gtc-boost-color: rgba(255, 43, 214, 0.18);
    }
    @keyframes gtcBoostCharged {
      from { filter: brightness(1); }
      to   { filter: brightness(1.55); }
    }
    @media (prefers-reduced-motion: reduce) {
      #game-touch-controls .gtc-btn--boost[data-boost-state="charged"] {
        animation: none;
      }
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

// ───── Setup ────────────────────────────────────────────────────────────────

/**
 * Creates on-screen touch controls and wires nipplejs joystick + pointer handlers.
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

  // * nipplejs zone — replaces the old custom gtc-joy element
  joyZoneEl = document.createElement("div");
  joyZoneEl.className = "gtc-nipple-zone";
  rootEl.appendChild(joyZoneEl);

  // * Boost / Hop action buttons
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

  rootEl.appendChild(btns);
  document.body.appendChild(rootEl);

  // * Initialize nipplejs AFTER the zone is in the DOM.
  initNippleJoystick();

  bindLayoutSync();
  window.addEventListener("touchstart", () => setInputMode("touch"), { passive: true });
  window.addEventListener("blur", resetTouchControls);
}
