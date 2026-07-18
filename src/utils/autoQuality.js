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
import { getQualityTier, setSessionQualityTier, stepDownQualityTier } from "./qualityMode.js";
import {
  canStepDownSessionRenderScale,
  getSessionRenderScaleMul,
  stepDownSessionRenderScale,
} from "./qualityTiers.js";

const SAMPLE_CAP = 90;
/** ms — ~48 fps threshold (was 22ms/~45fps; potato machines need earlier step-down) */
const BAD_FRAME_MS = 20.5;
/** consecutive bad 1s windows before step-down (was 3 — ~3s of stutter before relief) */
const BAD_WINDOWS_NEEDED = 2;
const WINDOW_MS = 1000;
/** max automatic tier steps per session (high→medium→low) */
const MAX_STEPS = 2;
/** ms of settle time after a step before sampling resumes */
const COOLDOWN_MS = 4000;

/** @type {number[]} */
const samples = [];
let badWindows = 0;
let windowStartMs = 0;
let stepsApplied = 0;
let cooldownUntilMs = 0;

/**
 * Feed one frame's delta (seconds) from the main loop.
 * @param {number} dtSec
 * @param {number} [nowMs]
 * @returns {boolean} true if this call applied a session step-down (caller should re-apply quality live)
 */
export function tickAutoQuality(dtSec, nowMs = performance.now()) {
  // * An explicit ?preset= is a QA pin (tools/perf-profile.mjs measures fixed tiers;
  // * visual-QA shots must be reproducible) — the watchdog shares the same session
  // * override slot and would silently relabel the cell. The software-GL hard floor
  // * still wins over a preset because createRenderer applies it after the preset.
  if (getDebugParams().preset != null) return false;
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
  if (samples.length > SAMPLE_CAP) samples.shift();

  if (!windowStartMs) windowStartMs = nowMs;
  if (nowMs - windowStartMs < WINDOW_MS) return false;
  windowStartMs = nowMs;

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
  windowStartMs = 0;
  cooldownUntilMs = nowMs + COOLDOWN_MS;
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.warn(
      `[autoQuality] session step-down ${stepDesc} (p95≈${p95.toFixed(1)}ms over ${BAD_WINDOWS_NEEDED}s)`,
    );
  }
  return true;
}

/** Test/reset helper. */
export function resetAutoQualityForTests() {
  samples.length = 0;
  badWindows = 0;
  windowStartMs = 0;
  stepsApplied = 0;
  cooldownUntilMs = 0;
}
