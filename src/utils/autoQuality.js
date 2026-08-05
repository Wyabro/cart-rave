/**
 * autoQuality.js — session frame-time watchdog.
 *
 * If p95 frame time stays above a threshold for several seconds, step quality
 * down ONE tier for this session (no localStorage write), re-arm, and allow a
 * second step (high→medium→low at most). User tier changes via setQualityTier
 * clear the session override and win.
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
  getSessionRenderScaleMul,
  stepDownSessionRenderScale,
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
 * measured under 9ms. That demotion is irreversible for the session and follows the
 * player into the round, so a stale menu sample costs real in-game render scale.
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
/** consecutive bad 1s windows before step-down (was 3 — ~3s of stutter before relief) */
const BAD_WINDOWS_NEEDED = 2;
const WINDOW_MS = 1000;
/** max automatic tier steps per session (high→medium→low) */
const MAX_STEPS = 2;
/** ms of settle time after a step before sampling resumes */
const COOLDOWN_MS = 4000;
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
let windowStartMs = 0;
let stepsApplied = 0;
let cooldownUntilMs = 0;
/** While true (mode-entry overlay up), tick is a no-op. */
let entryOverlayActive = false;
/** performance.now() until which tick stays suppressed after overlay hide; 0 = none. */
let entryGraceUntilMs = 0;
/** Clear the sample ring once when grace expires (not every tick). */
let clearSamplesWhenGraceEnds = false;

/**
 * WARM-IGPU-1 Phase 0b: every step-down this session, oldest first. A demotion is
 * IRREVERSIBLE for the session (there is no step-up path) and until now was reported
 * only by a DEV-gated console.warn — so in production a player could spend a whole
 * session on LOW because of a few shader-compile stalls and no signal ever left the
 * machine. Read by the analytics layer at session_end.
 * @type {Array<{ from: string, to: string, source: string, p95: number, tMs: number }>}
 */
const stepLog = [];

/** @returns {ReadonlyArray<{ from: string, to: string, source: string, p95: number, tMs: number }>} */
export function getAutoQualityStepLog() {
  return stepLog;
}

/**
 * Feed one frame's delta (seconds) from the main loop.
 * @param {number} dtSec
 * @param {number} [nowMs]
 * @param {string} [source] Which feed produced this sample — "game" (frame delta) or
 *   "attract" (menu render cost). The two measure DIFFERENT quantities against one
 *   threshold (see main.js onRenderCost); recording it is how we tell a menu-side
 *   demotion from a real in-round one without guessing.
 * @returns {boolean} true if this call applied a session step-down (caller should re-apply quality live)
 */
/**
 * Mode-entry overlay just appeared — suppress demotion for the whole load window.
 * Also clears the sample ring so menu-attract cost cannot poison the first in-round
 * windows (same ring is never cleared between evals — autoQuality.js:126-128).
 * @returns {void}
 */
export function noteModeEntryShown() {
  entryOverlayActive = true;
  entryGraceUntilMs = 0;
  clearSamplesWhenGraceEnds = false;
  samples.length = 0;
  sampleTimes.length = 0;
  badWindows = 0;
  windowStartMs = 0;
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
  windowStartMs = 0;
}

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
  // * qualityTiers (1 → 0.85 → 0.7).
  const atFloor = currentTier === "low";
  if (!atFloor && stepsApplied >= MAX_STEPS) return false;
  if (atFloor && !canStepDownSessionRenderScale()) return false;

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

  if (badWindows < BAD_WINDOWS_NEEDED) return false;

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
  badWindows = 0;
  samples.length = 0;
  sampleTimes.length = 0;
  windowStartMs = 0;
  cooldownUntilMs = nowMs + COOLDOWN_MS;
  // * Phase 0b: land the demotion in the diag ring so an F8 capture shows WHEN it fired
  // * (menu attract vs mid-round) and on what evidence. The sample buffer is NOT cleared
  // * between windows, so one bad second can poison up to 3 evaluated windows — `p95` plus
  // * `source` is what separates "this machine is genuinely slow" from "a shader compile
  // * stall demoted the session".
  recordDiagEvent("perf", "qualityStepDown", {
    from: currentTier,
    to: atFloor ? currentTier : getQualityTier(),
    step: stepDesc,
    source,
    p95: Math.round(p95 * 10) / 10,
    stepsApplied,
    renderScale: getSessionRenderScaleMul(),
  });
  if (stepLog.length < 16) {
    stepLog.push({
      from: currentTier,
      to: atFloor ? currentTier : getQualityTier(),
      source,
      p95: Math.round(p95 * 10) / 10,
      tMs: Math.round(nowMs),
    });
  }
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.warn(
      `[autoQuality] session step-down ${stepDesc} (p95≈${p95.toFixed(1)}ms over ${BAD_WINDOWS_NEEDED}s, source=${source})`,
    );
  }
  return true;
}

/** Test/reset helper. */
export function resetAutoQualityForTests() {
  samples.length = 0;
  sampleTimes.length = 0;
  badWindows = 0;
  windowStartMs = 0;
  stepsApplied = 0;
  cooldownUntilMs = 0;
  stepLog.length = 0;
  entryOverlayActive = false;
  entryGraceUntilMs = 0;
  clearSamplesWhenGraceEnds = false;
}
