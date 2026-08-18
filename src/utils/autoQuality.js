/**
 * autoQuality.js — session frame-time watchdog.
 *
 * If p95 frame time stays above a threshold for several seconds, step quality
 * down ONE tier for this session (no localStorage write), re-arm, and allow
 * up to three steps (high→high-lite→medium→low). Below the LOW floor, further
 * relief is session render-scale (1 → 0.85 → 0.7). PERF-WATCH-1 wave 1 restores
 * scale only (0.7 → 0.85 → 1) after sustained good game pacing. Tier step-up
 * is wave 2. User tier changes via setQualityTier clear the session override
 * and win.
 *
 * The caller must react to a `true` return by re-applying quality live
 * (composer passes, pixel ratio, arena knobs) — the flag flip alone only
 * affects per-frame readers.
 */

import { getDebugParams } from "./debugParams.js";
import { recordDiagEvent } from "./diagnostics.js";
import { getQualityTier, setSessionQualityTier, stepDownQualityTier } from "./qualityMode.js";
import {
  canStepDownSessionRenderScale,
  canStepUpSessionRenderScale,
  getSessionRenderScaleMul,
  peekStepUpSessionRenderScale,
  stepDownSessionRenderScale,
  stepUpSessionRenderScale,
} from "./qualityTiers.js";

const SAMPLE_CAP = 90;
/**
 * ATTRACT-JANK-1 Lever B: samples older than this are dropped before a window is
 * evaluated. Without it the ring is bounded only by COUNT, so a slow FEED (not slow
 * frames) lets a p95 be computed from frames that are many seconds gone.
 *
 * cap-287: the menu was in reduced motion at 1.25fps, so the 20-sample minimum took
 * ~16s to fill and the watchdog demoted at t=44.6s on p95 24.7 — carried by a single
 * 97.8ms boot-tail frame from t=28.4s — while every window in the preceding 15s
 * measured under 9ms. That demotion follows the player into the round, so a stale
 * menu sample costs real in-game render scale. Wave 1 can restore scale; it does
 * not undo a tier demotion.
 *
 * 4s, not 2s: the 20-sample minimum below is documented as covering a 10fps machine
 * (~2s of frames) and those are exactly the machines that must still be able to
 * demote. 4s clears that case with margin, admits a 5fps in-game feed, and still
 * rejects the 1.25fps menu case by four-fold.
 */
const SAMPLE_MAX_AGE_MS = 4000;
/**
 * ms — ~48 fps threshold (was 22ms/~45fps; potato machines need earlier step-down).
 * Exported so ATTRACT-JANK-1's menu instrument counts over-bar frames against the
 * SAME number the watchdog demotes on — a second literal would drift silently.
 */
export const BAD_FRAME_MS = 20.5;
/**
 * ms — holding a 60 Hz lock. Game `dt` is rAF interval, not GPU busy time, so a
 * healthy 60 fps lock is ~16.7ms. 12ms would never fire on 60 Hz.
 */
export const GOOD_FRAME_MS = 17;
/** consecutive bad 1s windows before step-down (was 3 — ~3s of stutter before relief) */
const BAD_WINDOWS_NEEDED = 2;
/** consecutive good 1s game windows before a scale step-up */
export const GOOD_WINDOWS_NEEDED = 8;
const WINDOW_MS = 1000;
/** max automatic tier steps per session (high→high-lite→medium→low) */
const MAX_STEPS = 3;
/** ms of settle time after a step before sampling resumes */
const COOLDOWN_MS = 4000;
/** a down inside this window after a scale-up locks the pre-up scale as the ceiling */
export const RATCHET_WINDOW_MS = 30_000;
/**
 * FV-LOAD-1b: after mode-entry overlay lifts, keep sampling off this long so the
 * freeze shoulder (20.5–250 ms frames) cannot demote the session. Cap-229 demoted
 * high→medium ~2s after Cart Rave carts-ready during countdown.
 */
export const ENTRY_QUALITY_GRACE_MS = 2000;

/** @type {number[]} */
const samples = [];
/** Arrival time of each entry in `samples`, same index — drives SAMPLE_MAX_AGE_MS. */
/** @type {number[]} */
const sampleTimes = [];
let badWindows = 0;
let goodWindows = 0;
let windowStartMs = 0;
let stepsApplied = 0;
let cooldownUntilMs = 0;
/** While true (mode-entry overlay up), tick is a no-op. */
let entryOverlayActive = false;
/** performance.now() until which tick stays suppressed after overlay hide; 0 = none. */
let entryGraceUntilMs = 0;
/** Clear the sample ring once when grace expires (not every tick). */
let clearSamplesWhenGraceEnds = false;
/** Software-GL session floor — scene.js arms this; tick never steps scale up. */
let softwareFloorActive = false;
/**
 * After a failed scale-up (up then down inside RATCHET_WINDOW_MS), no step-up may
 * pass this mul. null = no lock.
 * @type {number | null}
 */
let ratchetScaleCeiling = null;
/**
 * Most recent scale-up, for the 30s ratchet.
 * @type {{ tMs: number, fromScale: number } | null}
 */
let lastScaleUp = null;

/**
 * PERF-WATCH-1: every auto step this session, oldest first. Wave 1 restores
 * render scale after sustained good game pacing; tier stays one-way. Read by
 * the analytics layer at session_end (`steps` = downs, `stepUps` = ups).
 * @type {Array<{ from: string, to: string, source: string, p95: number, tMs: number, dir: "up"|"down", ratchetLocked?: boolean }>}
 */
const stepLog = [];

/** @returns {ReadonlyArray<{ from: string, to: string, source: string, p95: number, tMs: number, dir?: "up"|"down", ratchetLocked?: boolean }>} */
export function getAutoQualityStepLog() {
  return stepLog;
}

/**
 * Arm the software-GL floor so the watchdog cannot raise render scale.
 * scene.js calls this when createRenderer classifies the live context as software.
 * @param {boolean} active
 * @returns {void}
 */
export function setAutoQualitySoftwareFloor(active) {
  softwareFloorActive = active === true;
}

/**
 * Mode-entry overlay just appeared — suppress demotion for the whole load window.
 * Also clears the sample ring so menu-attract cost cannot poison the first in-round
 * windows.
 * @returns {void}
 */
export function noteModeEntryShown() {
  entryOverlayActive = true;
  entryGraceUntilMs = 0;
  clearSamplesWhenGraceEnds = false;
  clearSampleRing();
}

/**
 * Mode-entry overlay fully dismissed — start the post-entry grace clock.
 * @param {number} [nowMs]
 * @returns {void}
 */
export function noteModeEntryHidden(nowMs = performance.now()) {
  entryOverlayActive = false;
  entryGraceUntilMs = nowMs + ENTRY_QUALITY_GRACE_MS;
  clearSamplesWhenGraceEnds = true;
}

/**
 * Test helper: is the governor currently suppressed by overlay or post-entry grace?
 * @param {number} [nowMs]
 * @returns {boolean}
 */
export function isAutoQualityEntrySuppressed(nowMs = performance.now()) {
  if (entryOverlayActive) return true;
  if (entryGraceUntilMs > 0 && nowMs < entryGraceUntilMs) return true;
  return false;
}

function clearSampleRing() {
  samples.length = 0;
  sampleTimes.length = 0;
  badWindows = 0;
  goodWindows = 0;
  windowStartMs = 0;
}

function canDownFrom(currentTier) {
  const atFloor = currentTier === "low";
  if (atFloor) return canStepDownSessionRenderScale();
  return stepsApplied < MAX_STEPS && stepDownQualityTier(currentTier) != null;
}

function canScaleUp(source) {
  if (source !== "game") return false;
  if (softwareFloorActive) return false;
  if (!canStepUpSessionRenderScale()) return false;
  const next = peekStepUpSessionRenderScale();
  if (!(next > 0)) return false;
  if (ratchetScaleCeiling != null && next > ratchetScaleCeiling) return false;
  return true;
}

/**
 * @param {{
 *   dir: "up"|"down",
 *   from: string,
 *   to: string,
 *   stepDesc: string,
 *   source: string,
 *   p95: number,
 *   nowMs: number,
 *   ratchetLocked?: boolean,
 * }} step
 * @returns {true}
 */
function commitStep(step) {
  clearSampleRing();
  cooldownUntilMs = step.nowMs + COOLDOWN_MS;
  const p95 = Math.round(step.p95 * 10) / 10;
  const renderScale = getSessionRenderScaleMul();
  const type = step.dir === "up" ? "qualityStepUp" : "qualityStepDown";
  recordDiagEvent("perf", type, {
    from: step.from,
    to: step.to,
    step: step.stepDesc,
    source: step.source,
    p95,
    stepsApplied,
    renderScale,
    dir: step.dir,
  });
  if (stepLog.length < 16) {
    /** @type {{ from: string, to: string, source: string, p95: number, tMs: number, dir: "up"|"down", ratchetLocked?: boolean }} */
    const entry = {
      from: step.from,
      to: step.to,
      source: step.source,
      p95,
      tMs: Math.round(step.nowMs),
      dir: step.dir,
    };
    if (step.ratchetLocked) entry.ratchetLocked = true;
    stepLog.push(entry);
  }
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.warn(
      `[autoQuality] session step-${step.dir} ${step.stepDesc} (p95≈${step.p95.toFixed(1)}ms, source=${step.source})`,
    );
  }
  return true;
}

function ratchetAfterDown(nowMs, from, to) {
  if (!lastScaleUp) return false;
  const dtMs = nowMs - lastScaleUp.tMs;
  if (dtMs > RATCHET_WINDOW_MS) {
    lastScaleUp = null;
    return false;
  }
  ratchetScaleCeiling = lastScaleUp.fromScale;
  recordDiagEvent("perf", "qualityStepRatchet", {
    from,
    to,
    dtMs: Math.round(dtMs),
    ceiling: ratchetScaleCeiling,
  });
  lastScaleUp = null;
  return true;
}

/**
 * Feed one frame's delta (seconds) from the main loop.
 * @param {number} dtSec
 * @param {number} [nowMs]
 * @param {string} [source] Which feed produced this sample — "game" (frame delta) or
 *   "attract" (menu render cost). The two measure DIFFERENT quantities against one
 *   threshold (see main.js onRenderCost); recording it is how we tell a menu-side
 *   demotion from a real in-round one without guessing.
 * @returns {boolean} true if this call applied a session step (caller should re-apply quality live)
 */
export function tickAutoQuality(dtSec, nowMs = performance.now(), source = "game") {
  // * An explicit ?preset= is a QA pin (tools/perf-profile.mjs measures fixed tiers;
  // * visual-QA shots must be reproducible) — the watchdog shares the same session
  // * override slot and would silently relabel the cell. The software-GL hard floor
  // * still wins over a preset because createRenderer applies it after the preset.
  if (getDebugParams().preset != null) return false;
  if (entryOverlayActive) return false;
  if (entryGraceUntilMs > 0 && nowMs < entryGraceUntilMs) return false;
  // * Grace just ended — drop the freeze-shoulder samples before any window eval.
  if (clearSamplesWhenGraceEnds) {
    clearSampleRing();
    clearSamplesWhenGraceEnds = false;
    entryGraceUntilMs = 0;
  }
  if (nowMs < cooldownUntilMs) return false;

  const currentTier = getQualityTier();
  // * Run-6: at the LOW floor the watchdog keeps working — further relief comes from
  // * sub-native render-scale steps instead of tier steps (an Intel UHD host still
  // * dropped ~30% of frames >33ms at LOW/0.75×, and a hitching host is every peer's
  // * rubber-banding). Tier steps stay capped at MAX_STEPS; scale steps cap in
  // * qualityTiers (1 → 0.85 → 0.7). Wave 1 also samples at the scale floor so a
  // * recovered machine can step scale back up.
  const canDown = canDownFrom(currentTier);
  const canUp = canScaleUp(source);
  if (!canDown && !canUp) return false;

  const dtMs = (Number(dtSec) || 0) * 1000;
  if (!(dtMs > 0) || dtMs > 250) return false;

  samples.push(dtMs);
  sampleTimes.push(nowMs);
  if (samples.length > SAMPLE_CAP) {
    samples.shift();
    sampleTimes.shift();
  }

  if (!windowStartMs) windowStartMs = nowMs;
  if (nowMs - windowStartMs < WINDOW_MS) return false;
  windowStartMs = nowMs;

  // * Lever B: age out before the count check, so the count is a count of CURRENT
  // * frames. A slow feed then fails the 20-sample minimum on its own and no demotion
  // * fires — which is the correct answer, because a feed that slow is not measuring
  // * frame pacing at all. A genuinely slow but live feed keeps its samples and steps.
  while (sampleTimes.length > 0 && nowMs - sampleTimes[0] > SAMPLE_MAX_AGE_MS) {
    sampleTimes.shift();
    samples.shift();
  }

  // * 20 samples ≈ 2s of frames on a 10fps machine — enough for a stable p95;
  // * requiring more just prolongs the suffering on exactly the devices that
  // * need the step-down most.
  if (samples.length < 20) return false;

  const sorted = samples.slice().sort((a, b) => a - b);
  const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];
  if (p95 > BAD_FRAME_MS) {
    badWindows += 1;
  } else {
    badWindows = Math.max(0, badWindows - 1);
  }
  // * Attract must not build step-up progress — menu cost is not in-game headroom.
  if (p95 > GOOD_FRAME_MS) {
    goodWindows = 0;
  } else if (source === "game") {
    goodWindows += 1;
  }

  const atFloor = currentTier === "low";
  if (canDown && badWindows >= BAD_WINDOWS_NEEDED) {
    let stepDesc;
    if (atFloor) {
      if (!stepDownSessionRenderScale()) return false;
      stepDesc = `low renderScale ×${getSessionRenderScaleMul()}`;
    } else {
      const nextTier = stepDownQualityTier(currentTier);
      if (!nextTier) return false;
      setSessionQualityTier(nextTier);
      stepsApplied += 1;
      stepDesc = `${currentTier}→${nextTier}`;
    }
    const to = atFloor ? currentTier : getQualityTier();
    const ratchetLocked = ratchetAfterDown(nowMs, currentTier, to);
    return commitStep({
      dir: "down",
      from: currentTier,
      to,
      stepDesc,
      source,
      p95,
      nowMs,
      ratchetLocked,
    });
  }

  if (canUp && goodWindows >= GOOD_WINDOWS_NEEDED) {
    const fromScale = getSessionRenderScaleMul();
    if (!stepUpSessionRenderScale()) return false;
    lastScaleUp = { tMs: nowMs, fromScale };
    return commitStep({
      dir: "up",
      from: currentTier,
      to: currentTier,
      stepDesc: `low renderScale ×${getSessionRenderScaleMul()}`,
      source,
      p95,
      nowMs,
    });
  }

  return false;
}

/** Test/reset helper. */
export function resetAutoQualityForTests() {
  samples.length = 0;
  sampleTimes.length = 0;
  badWindows = 0;
  goodWindows = 0;
  windowStartMs = 0;
  stepsApplied = 0;
  cooldownUntilMs = 0;
  stepLog.length = 0;
  entryOverlayActive = false;
  entryGraceUntilMs = 0;
  clearSamplesWhenGraceEnds = false;
  softwareFloorActive = false;
  ratchetScaleCeiling = null;
  lastScaleUp = null;
}
