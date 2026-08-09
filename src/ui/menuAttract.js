/**
 * menuAttract.js — attract-mode arena backdrop for the main menu (Pass 3).
 *
 * While the menu is up, the game loop is fully skipped (`shouldSkipTiming`),
 * so the idle-warmed arena behind the menu never draws. This module runs its
 * OWN throttled rAF loop — no physics, no game flow — using the same warm
 * render path as the frame loop (composer vs direct latch, see frameVisuals.js)
 * so it never triggers a shader-path recompile.
 *
 * It also drives per-frame LEVEL animation via `onAnimationTick`. It used to
 * render WITHOUT updating, so every animated property — water scroll, turbines,
 * beacon pulses, ship glows — sat frozen at its constructor value behind the
 * menu and in every `npm run shoot` capture, which silently invalidated any
 * capture-based claim about motion (SHOOT-ANIM-1). The tick runs before the
 * render, in the same frame, exactly as the game loop orders it.
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
import { BAD_FRAME_MS } from "../utils/autoQuality.js";
import {
  applyDebugCameraPose,
  getDebugAnimTimeMs,
  isDebugCameraLocked,
} from "../utils/debugParams.js";
import { isDiagActive, recordDiagEvent } from "../utils/diagnostics.js";
import { getQualityTier } from "../utils/qualityMode.js";
import { getSessionRenderScaleMul } from "../utils/qualityTiers.js";
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
 * @property {(timeMs: number) => void} [onAnimationTick]
 *   Per-frame level animation (levelUpdate / sceneExtras). Called before the
 *   render, same frame. Receives the pinned ?t= timestamp when set, else the
 *   rAF time. See SHOOT-ANIM-1 in the module header.
 * @property {(frameCostSec: number, nowMs: number) => void} [onRenderCost]
 *   Measured cost of this attract frame — animation tick AND render (seconds).
 *   Main feeds it to the auto-quality watchdog so weak machines step down at the
 *   MENU — before play — instead of only after sustained bad in-game frames.
 *   Frame *spacing* is useless here (the loop throttles to ~30fps by design);
 *   only the measured frame duration reflects GPU/CPU load.
 * @property {(renderer: import("three").WebGLRenderer, nowMs: number) => void} [onOverlayRender]
 *   Optional direct-render overlay pass. It runs after the arena's latched
 *   composer/direct pass and before frame cost is sampled, so the same watchdog
 *   and diagnostics account for its CPU/GPU submission work.
 */

/** @type {MenuAttractDeps | null} */
let deps = null;
/** @type {number | null} */
let rafId = null;
let active = false;
let revealed = false;
/**
 * While true the loop keeps running but skips rendering — the canvas holds its
 * last frame. Set around menu arena swaps so the attract render never hits a
 * half-built scene or compiles the new arena's shaders mid-frame (the swap path
 * hides the work behind the opaque menu backdrop, warm-compiles, then releases
 * the hold).
 */
let renderHold = false;
/** Last rendered frame timestamp (ms) for throttling. */
let lastFrameMs = 0;
/**
 * ATTRACT-JANK-1 Lever A: the animation clock handed to the level while reduced
 * motion is active. Pinned to the first reduced frame of the session and never
 * advanced, so every time-driven property holds one phase. See the step() call site.
 */
let reducedAnimPinMs = 0;

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
 * Returns the camera poses used by the menu attract shots.
 *
 * Idle warm used to compile only the default gameplay camera. The first
 * attract frame could then compile newly visible arena programs after
 * world-ready, which made the menu look frozen.
 *
 * @param {number} arenaRadius
 * @param {string} [levelId]
 * @returns {ReadonlyArray<{ position: { x: number, y: number, z: number }, lookAt: { x: number, y: number, z: number } }>}
 */
export function getMenuAttractWarmupPoses(arenaRadius, levelId = "") {
  const maxHeightM = LEVEL_MAX_CAM_HEIGHT_M[levelId] ?? Infinity;
  const azimuths = [0, Math.PI * 0.5, Math.PI, Math.PI * 1.5];
  return ATTRACT_SHOTS.map((shot, index) => {
    const azimuth = azimuths[index];
    const radius = arenaRadius * shot.radiusMul;
    return {
      position: {
        x: Math.cos(azimuth) * radius,
        y: Math.min(arenaRadius * shot.heightMul, maxHeightM),
        z: Math.sin(azimuth) * radius,
      },
      lookAt: { x: 0, y: arenaRadius * shot.lookHeightMul, z: 0 },
    };
  });
}

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

/* ── ATTRACT-JANK-1 Lever 0 — measurement only, no behaviour change ─────────────
 * Nothing measured attract CADENCE anywhere: only frame cost reached the ring, and
 * only on the frame a demotion fired. That cannot separate "this machine is slow"
 * (cost) from "the 33ms throttle beats against vsync" (spacing), which are different
 * cards with different fixes. So: per-second percentiles of both, plus one-shot
 * markers at the two events cost is expected to spike on (shot cut, arena-swap hold
 * release), because inferring cuts from the 9-15s shot walls is unreliable once
 * spacing is already juddery — which is the case under test.
 *
 * Channel is "attract", NOT "perf", and that is load-bearing: evictOneEvent drops the
 * oldest event of the LOUDEST channel (diagnostics.js:186), so ~90 windows on "perf"
 * would evict `qualityStepDown` — the single event that decides the top-ranked
 * verdict — before the capture is taken. On its own channel the flood eats its own.
 *
 * Emission is `?diag`-gated end to end (recordDiagEvent no-ops when inactive), and the
 * sample arrays are reused, so an ordinary player pays two number pushes per frame.
 */
const ATTRACT_DIAG_WINDOW_MS = 1000;
/** ~90s of 1Hz windows — the shot cycle is 46s (15+10+12+9), so a 60s sit fits whole. */
const ATTRACT_DIAG_MAX_WINDOWS = 90;

/** @type {number[]} */
const diagSpacing = [];
/** @type {number[]} */
const diagCost = [];
/** @type {number[]} */
const diagOverlayCost = [];
let diagWindowStartMs = 0;
let diagWindowsEmitted = 0;
// * An overlay must never take down the menu backdrop. A failed integration stays
// * off for this browser session until its owner is corrected and reloaded.
let overlayRenderDisabled = false;

function resetAttractDiag() {
  diagSpacing.length = 0;
  diagCost.length = 0;
  diagOverlayCost.length = 0;
  diagWindowStartMs = 0;
  diagWindowsEmitted = 0;
}

/**
 * @param {number[]} sorted ascending
 * @param {number} p 0..1
 * @returns {number} ms, rounded to 0.1
 */
function pctMs(sorted, p) {
  if (sorted.length === 0) return 0;
  const v = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
  return Math.round(v * 10) / 10;
}

/**
 * Close the 1s window and emit its summary.
 * @param {number} nowMs
 * @param {string} levelId
 * @returns {void}
 */
function maybeEmitAttractWindow(nowMs, levelId) {
  if (!diagWindowStartMs) diagWindowStartMs = nowMs;
  if (nowMs - diagWindowStartMs < ATTRACT_DIAG_WINDOW_MS) return;
  diagWindowStartMs = nowMs;
  if (diagCost.length === 0) return;
  if (diagWindowsEmitted >= ATTRACT_DIAG_MAX_WINDOWS) {
    diagSpacing.length = 0;
    diagCost.length = 0;
    diagOverlayCost.length = 0;
    return;
  }
  const spacing = diagSpacing.slice().sort((a, b) => a - b);
  const cost = diagCost.slice().sort((a, b) => a - b);
  const overlayCost = diagOverlayCost.slice().sort((a, b) => a - b);
  let overBar = 0;
  for (const c of diagCost) if (c > BAD_FRAME_MS) overBar += 1;
  recordDiagEvent("attract", "attractWindow", {
    n: diagCost.length,
    spacingP50: pctMs(spacing, 0.5),
    spacingP95: pctMs(spacing, 0.95),
    spacingMax: pctMs(spacing, 1),
    costP50: pctMs(cost, 0.5),
    costP95: pctMs(cost, 0.95),
    costMax: pctMs(cost, 1),
    // * Always present: zero is the stable baseline when no menu overlay is mounted.
    overlayN: diagOverlayCost.length,
    overlayCostP50: pctMs(overlayCost, 0.5),
    overlayCostP95: pctMs(overlayCost, 0.95),
    overlayCostMax: pctMs(overlayCost, 1),
    // * Count and bar travel together — a bare count is unreadable if BAD_FRAME_MS moves.
    overBar,
    barMs: BAD_FRAME_MS,
    shotIndex,
    tier: getQualityTier(),
    renderScale: getSessionRenderScaleMul(),
    levelId,
  });
  diagWindowsEmitted += 1;
  diagSpacing.length = 0;
  diagCost.length = 0;
  diagOverlayCost.length = 0;
}

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

  // * Swap-in-progress hold: keep the last frame on the canvas, render nothing.
  if (renderHold) return;

  const reduced = reducedMotionQuery?.matches === true;
  const interval = reduced ? REDUCED_MOTION_INTERVAL_MS : FRAME_INTERVAL_MS;
  if (now - lastFrameMs < interval) return;
  // * ATTRACT-JANK-1: measured BEFORE the reset below, because that reset is the
  // * suspect — `lastFrameMs = now` re-anchors on arrival rather than accumulating,
  // * so a frame that misses the 33ms wall by a hair waits a whole extra vsync.
  // * lastFrameMs === 0 is the render-now sentinel (fresh visit / hold release), not
  // * an interval, so it yields no sample.
  const spacingMs = lastFrameMs > 0 ? now - lastFrameMs : 0;
  lastFrameMs = now;

  const arenaRadius = Math.max(6, d.getArenaRadius());
  const levelId = d.getLevelId?.() ?? "";
  const maxHeightM = LEVEL_MAX_CAM_HEIGHT_M[levelId] ?? Infinity;
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
      const isCut = shotStartMs !== 0;
      shotIndex = isCut ? (shotIndex + 1) % ATTRACT_SHOTS.length : shotIndex;
      shotStartMs = now;
      shotBaseAzimuth = Math.random() * Math.PI * 2;
      // * ATTRACT-JANK-1: mark the cut itself. Shot 3 (radiusMul 0.85, the close push)
      // * is the fill/overdraw suspect, and a cut can link programs for newly framed
      // * geometry — both would land as a cost spike ON this boundary. Only a real cut
      // * is marked; the first frame of a visit sets the shot without cutting to it.
      if (isCut) {
        recordDiagEvent("attract", "attractCut", {
          shotIndex,
          radiusMul: ATTRACT_SHOTS[shotIndex].radiusMul,
          levelId,
        });
      }
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

  // * SHOOT-ANIM-1: this is the ONLY loop running while the menu is up (the game loop
  // * bails in shouldSkipTiming), so per-frame level animation has to be driven from
  // * here or it stays frozen at its constructor value — on the live menu and in every
  // * capture. ?t= pins a phase so shots are reproducible.
  // * Ordering is load-bearing, twice over: the tick must sit BELOW the throttle gate
  // * above (advance only on frames that actually render, or update decouples from
  // * render at 60Hz) and BEFORE the render (after it, the drawn frame is one update
  // * stale). Timed together with the render because levelUpdate is real per-frame CPU
  // * — ships, water, rotors, beacons — and the watchdog must judge update+render.
  // * ATTRACT-JANK-1 Lever A (cap-287, Intel UHD @ e3d4d03): reduced motion renders on
  // * an 800ms heartbeat, so driving level animation from it advanced water, rotors,
  // * beacons and rave dressing in 800ms STEPS at 1.25fps — the "attract animation reads
  // * as jank" report. It is not a load problem: that capture measured 3-6ms frames on an
  // * idle box. SHOOT-ANIM-1 turned animation on for every path at once; before it, this
  // * path was a still image, which is what `prefers-reduced-motion: reduce` asks for.
  // *
  // * So the clock is PINNED here rather than the tick being skipped: `?t=` already
  // * defines a pinned-phase mode these updaters honour, and skipping would also strand
  // * updateLevelLod — which rides this callback but reads its own wall clock, and still
  // * has to react to an arena swap. Pinned tick = static frame, live LOD.
  const frameStartMs = performance.now();
  if (reduced && !reducedAnimPinMs) reducedAnimPinMs = now;
  d.onAnimationTick?.(getDebugAnimTimeMs() ?? (reduced ? reducedAnimPinMs : now));
  // Same latched path as frameVisuals.js — never flip render paths here.
  if (isComposerBypassActive()) {
    d.renderer.render(d.scene, d.camera);
  } else {
    d.composer.render();
  }
  // * MENU-CART-1 Lever 0: direct menu overlays render after the arena's final
  // * composer/direct pass. Keeping this above frameCostMs makes auto-quality judge
  // * the whole displayed menu frame, not only the arena beneath the overlay.
  let overlayCostMs = 0;
  if (d.onOverlayRender && !overlayRenderDisabled) {
    const overlayStartMs = performance.now();
    try {
      d.onOverlayRender(d.renderer, now);
    } catch (error) {
      overlayRenderDisabled = true;
      recordDiagEvent("attract", "overlayRenderFailed", {
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      overlayCostMs = performance.now() - overlayStartMs;
    }
  }
  const frameCostMs = performance.now() - frameStartMs;
  d.onRenderCost?.(frameCostMs / 1000, frameStartMs);
  // * ATTRACT-JANK-1: same cost the watchdog just judged, plus the spacing it never sees.
  if (isDiagActive()) {
    if (spacingMs > 0) diagSpacing.push(spacingMs);
    diagCost.push(frameCostMs);
    diagOverlayCost.push(overlayCostMs);
    maybeEmitAttractWindow(now, levelId);
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
  // * ATTRACT-JANK-1: fresh visit, fresh window budget — the first ~10s of a visit is
  // * where a menu-side demotion is expected, so it must never be the part that got
  // * capped off by a previous visit's windows.
  resetAttractDiag();
  rafId = requestAnimationFrame(step);
}

/**
 * Holds/releases attract rendering during menu arena swaps (see renderHold).
 * @param {boolean} on
 */
export function setMenuAttractRenderHold(on) {
  // * ATTRACT-JANK-1: mark the RELEASE — the first frames after an arena swap draw new
  // * geometry, and there is no menu-side autoQuality grace (noteModeEntryShown covers
  // * mode entry only), so this is where a false demotion would fire. Transition-guarded
  // * because maskMenuPreviewSwap releases twice, in the try AND the finally
  // * (levelOrchestration.js:564,569) — an unguarded marker would double-count.
  if (renderHold && !on) recordDiagEvent("attract", "attractHoldRelease", {});
  renderHold = on;
  // * Render immediately on release so the fade-in reveals the NEW arena, not a
  // * stale frame from before the swap.
  if (!on) lastFrameMs = 0;
}

/**
 * Forces the menu backdrop to the opaque or attract-revealed state without
 * touching the render loop. Used by the menu-preview swap mask so the level
 * swap hides behind the opaque backdrop (opacity 1) instead of a translucent
 * one — see levelOrchestration.js maskMenuPreviewSwap.
 * @param {boolean} on
 */
export function setMenuAttractReveal(on) {
  setRevealed(on);
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
