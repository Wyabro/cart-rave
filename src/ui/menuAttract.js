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
 * @property {() => string} [getLevelId] Loaded arena id — per-arena camera clamps.
 */

/** @type {MenuAttractDeps | null} */
let deps = null;
/** @type {number | null} */
let rafId = null;
let active = false;
let revealed = false;
/** Last rendered frame timestamp (ms) for throttling. */
let lastFrameMs = 0;

/** Base orbit period (ms) — slow enough to read as a camera drift, not a spin. */
const ORBIT_PERIOD_MS = 70000;
/** Frame budget: ~30fps is plenty for an ambient backdrop. */
const FRAME_INTERVAL_MS = 33;
/** Reduced motion renders a static shot at a slow heartbeat (level swaps still appear). */
const REDUCED_MOTION_INTERVAL_MS = 800;
/** Reduced-motion fixed three-quarter azimuth (rad). */
const REDUCED_MOTION_AZIMUTH = Math.PI * 0.28;
/** Reduced-motion framing (the original single-orbit shot). */
const ORBIT_RADIUS_MUL = 1.55;
const ORBIT_HEIGHT_MUL = 0.62;
const LOOK_AT_HEIGHT_MUL = 0.06;

/**
 * Attract shot list — the loop hard-cuts between these framings (arcade attract
 * style), each drifting slowly while it holds. All values are arena-radius
 * relative; `speedMul` scales the base ORBIT_PERIOD_MS drift and `driftDir`
 * alternates so consecutive shots don't feel like one long orbit. Each cut
 * starts from a fresh random azimuth for variety across menu visits.
 *
 * @type {ReadonlyArray<{ durMs: number, radiusMul: number, heightMul: number,
 *   lookHeightMul: number, driftDir: 1 | -1, speedMul: number }>}
 */
const ATTRACT_SHOTS = Object.freeze([
  // Wide establishing orbit (the original attract framing).
  { durMs: 15000, radiusMul: 1.55, heightMul: 0.62, lookHeightMul: 0.06, driftDir: 1, speedMul: 1.0 },
  // Low trackside dolly — cart-height energy, floor neon up close.
  { durMs: 10000, radiusMul: 1.12, heightMul: 0.16, lookHeightMul: 0.1, driftDir: -1, speedMul: 1.7 },
  // High slow sweep — reads the whole arena layout.
  { durMs: 12000, radiusMul: 1.3, heightMul: 0.88, lookHeightMul: 0, driftDir: 1, speedMul: 0.8 },
  // Close three-quarter push — booth / podium detail pass.
  { durMs: 9000, radiusMul: 0.85, heightMul: 0.3, lookHeightMul: 0.14, driftDir: -1, speedMul: 1.4 },
]);

/**
 * Per-arena camera height ceiling (meters). The Storerooms has a dropped ceiling at
 * y=14.5 — the old fixed 0.62×radius orbit (~16.4 m) floated ABOVE it, showing the
 * roof void. Clamp comfortably below the tiles (fixtures hang under them).
 * @type {Readonly<Record<string, number>>}
 */
const LEVEL_MAX_CAM_HEIGHT_M = Object.freeze({ backrooms: 11.5 });

/** Active shot index + entry timestamp + per-cut random azimuth offset. */
let shotIndex = 0;
let shotStartMs = 0;
let shotBaseAzimuth = 0;

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
  const maxHeightM = LEVEL_MAX_CAM_HEIGHT_M[d.getLevelId?.() ?? ""] ?? Infinity;
  // * Visual QA: ?cam= / ?freeze= pin pose (no orbit) so shoot tools are stable.
  if (isDebugCameraLocked()) {
    applyDebugCameraPose(d.camera);
  } else if (reduced) {
    // Fixed three-quarter shot for reduced motion (no cuts, no drift).
    const orbitRadius = arenaRadius * ORBIT_RADIUS_MUL;
    d.camera.position.set(
      Math.cos(REDUCED_MOTION_AZIMUTH) * orbitRadius,
      Math.min(arenaRadius * ORBIT_HEIGHT_MUL, maxHeightM),
      Math.sin(REDUCED_MOTION_AZIMUTH) * orbitRadius,
    );
    d.camera.lookAt(0, arenaRadius * LOOK_AT_HEIGHT_MUL, 0);
  } else {
    // Shot-list attract: hard-cut between framings, each drifting while it holds.
    if (shotStartMs === 0 || now - shotStartMs >= ATTRACT_SHOTS[shotIndex].durMs) {
      shotIndex = shotStartMs === 0 ? shotIndex : (shotIndex + 1) % ATTRACT_SHOTS.length;
      shotStartMs = now;
      shotBaseAzimuth = Math.random() * Math.PI * 2;
    }
    const shot = ATTRACT_SHOTS[shotIndex];
    const drift = ((now - shotStartMs) / ORBIT_PERIOD_MS) * Math.PI * 2 * shot.speedMul;
    const azimuth = shotBaseAzimuth + shot.driftDir * drift;
    const orbitRadius = arenaRadius * shot.radiusMul;
    d.camera.position.set(
      Math.cos(azimuth) * orbitRadius,
      Math.min(arenaRadius * shot.heightMul, maxHeightM),
      Math.sin(azimuth) * orbitRadius,
    );
    d.camera.lookAt(0, arenaRadius * shot.lookHeightMul, 0);
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
  // * Fresh visit, fresh cut — restart the shot list from a new random azimuth.
  shotStartMs = 0;
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
