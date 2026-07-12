/**
 * menuAttract.js — attract-mode arena backdrop for the main menu (Pass 3).
 *
 * While the menu is up, the game loop is fully skipped (`shouldSkipTiming`),
 * so the idle-warmed arena behind the menu never draws. This module runs its
 * OWN throttled rAF loop that only renders — no physics, no game flow — using
 * the same warm render path as the frame loop (composer vs direct latch, see
 * frameVisuals.js) so it never triggers a shader-path recompile.
 *
 * The main camera is borrowed for a slow orbit: gameplay re-seats the camera
 * every play frame and play entry is covered by the loading overlay, so no
 * pose needs to be saved or restored.
 *
 * When frames are actually being produced, `.cr-root--attract` is set on the
 * menu root — CSS fades the gradient backdrop (`.cr-root::before`) translucent
 * to reveal the canvas. Until the world is warm the class stays off and the
 * gradient stands alone, so cold boots and low-memory devices (where idle
 * warm never runs) keep a clean backdrop.
 *
 * Reduced motion: no orbit — a fixed three-quarter shot re-rendered at a slow
 * heartbeat so level swaps still show up.
 */

import { isComposerBypassActive } from "../scene.js";
import { applyDebugCameraPose, isDebugCameraLocked } from "../utils/debugParams.js";
import { tickVisualHarnessFrame } from "../utils/visualHarness.js";

/**
 * @typedef {object} MenuAttractDeps
 * @property {import("three").PerspectiveCamera} camera
 * @property {import("three").Scene} scene
 * @property {import("three").WebGLRenderer} renderer
 * @property {{ render: () => void }} composer
 * @property {() => boolean} isWorldBootstrapped
 * @property {() => boolean} getMenuVisible
 * @property {() => number} getArenaRadius
 */

/** @type {MenuAttractDeps | null} */
let deps = null;
/** @type {number | null} */
let rafId = null;
let active = false;
let revealed = false;
/** Last rendered frame timestamp (ms) for throttling. */
let lastFrameMs = 0;

/** Full orbit period (ms) — slow enough to read as a camera drift, not a spin. */
const ORBIT_PERIOD_MS = 70000;
/** Frame budget: ~30fps is plenty for an ambient backdrop. */
const FRAME_INTERVAL_MS = 33;
/** Reduced motion renders a static shot at a slow heartbeat (level swaps still appear). */
const REDUCED_MOTION_INTERVAL_MS = 800;
/** Camera framing, all relative to arena radius: orbit ring, eye height, look-at height. */
const ORBIT_RADIUS_MUL = 1.55;
const ORBIT_HEIGHT_MUL = 0.62;
const LOOK_AT_HEIGHT_MUL = 0.06;
/** Reduced-motion fixed three-quarter azimuth (rad). */
const REDUCED_MOTION_AZIMUTH = Math.PI * 0.28;

const reducedMotionQuery =
  typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-reduced-motion: reduce)")
    : null;

// * Dev-only: ?perfPump shims rAF so hidden tabs still tick (utils/perfPump.js).
// * Mirror its activation condition so attract stays verifiable in that mode.
const hiddenTabPumped =
  import.meta.env.DEV &&
  typeof location !== "undefined" &&
  new URLSearchParams(location.search).has("perfPump");

/** @param {boolean} on */
function setRevealed(on) {
  if (revealed === on) return;
  revealed = on;
  document.getElementById("cr-root")?.classList.toggle("cr-root--attract", on);
}

/** @param {number} now */
function step(now) {
  if (!active) return;
  rafId = requestAnimationFrame(step);
  const d = deps;
  if (!d) return;

  // Self-gating: silently idle until the arena is actually there to show.
  const gate =
    !d.getMenuVisible() ? "menuHidden"
    : !d.isWorldBootstrapped() ? "worldCold"
    : document.visibilityState === "hidden" && !hiddenTabPumped ? "tabHidden"
    : document.body.classList.contains("cr-boot-pending") ? "bootPending"
    : null;
  if (import.meta.env.DEV) {
    /** @type {any} */ (window).__menuAttractDebug = { active, revealed, gate };
  }
  if (gate) {
    setRevealed(false);
    return;
  }

  const reduced = reducedMotionQuery?.matches === true;
  const interval = reduced ? REDUCED_MOTION_INTERVAL_MS : FRAME_INTERVAL_MS;
  if (now - lastFrameMs < interval) return;
  lastFrameMs = now;

  const arenaRadius = Math.max(6, d.getArenaRadius());
  // * Visual QA: ?cam= / ?freeze= pin pose (no orbit) so shoot tools are stable.
  if (isDebugCameraLocked()) {
    applyDebugCameraPose(d.camera);
  } else {
    // Fixed three-quarter shot for reduced motion; slow drift otherwise.
    const azimuth = reduced ? REDUCED_MOTION_AZIMUTH : (now / ORBIT_PERIOD_MS) * Math.PI * 2;
    const orbitRadius = arenaRadius * ORBIT_RADIUS_MUL;
    d.camera.position.set(
      Math.cos(azimuth) * orbitRadius,
      arenaRadius * ORBIT_HEIGHT_MUL,
      Math.sin(azimuth) * orbitRadius,
    );
    d.camera.lookAt(0, arenaRadius * LOOK_AT_HEIGHT_MUL, 0);
  }

  // Same latched path as frameVisuals.js — never flip render paths here.
  if (isComposerBypassActive()) {
    d.renderer.render(d.scene, d.camera);
  } else {
    d.composer.render();
  }
  tickVisualHarnessFrame();
  setRevealed(true);
}

/** @param {MenuAttractDeps} dependencies */
export function initMenuAttract(dependencies) {
  deps = dependencies;
}

/** Starts the attract loop (idempotent; safe before the world is warm). */
export function startMenuAttract() {
  if (!deps || active) return;
  active = true;
  lastFrameMs = 0;
  rafId = requestAnimationFrame(step);
}

/** Stops the loop and restores the opaque menu backdrop. */
export function stopMenuAttract() {
  active = false;
  if (rafId != null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
  setRevealed(false);
}
