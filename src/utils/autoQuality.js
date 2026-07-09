/**
 * autoQuality.js — session frame-time watchdog.
 *
 * If p95 frame time stays above a threshold for several seconds, step quality
 * down once for this session (no localStorage write). User toggle via
 * setLowQualityMode still wins and clears the session override.
 */

import { isLowQualityMode, setSessionLowQuality } from "./qualityMode.js";

const SAMPLE_CAP = 90;
/** ms — ~45 fps threshold */
const BAD_FRAME_MS = 22;
/** consecutive bad 1s windows before step-down */
const BAD_WINDOWS_NEEDED = 3;
const WINDOW_MS = 1000;

/** @type {number[]} */
const samples = [];
let badWindows = 0;
let windowStartMs = 0;
let armed = true;
let applied = false;

/**
 * Feed one frame's delta (seconds) from the main loop.
 * @param {number} dtSec
 * @param {number} [nowMs]
 * @returns {boolean} true if this call applied a session step-down
 */
export function tickAutoQuality(dtSec, nowMs = performance.now()) {
  if (!armed || applied) return false;

  // * Already low quality (touch default, user pref, or prior session step) — stop watching.
  if (isLowQualityMode()) {
    armed = false;
    return false;
  }

  const dtMs = (Number(dtSec) || 0) * 1000;
  if (!(dtMs > 0) || dtMs > 250) return false;

  samples.push(dtMs);
  if (samples.length > SAMPLE_CAP) samples.shift();

  if (!windowStartMs) windowStartMs = nowMs;
  if (nowMs - windowStartMs < WINDOW_MS) return false;
  windowStartMs = nowMs;

  if (samples.length < 30) return false;

  const sorted = samples.slice().sort((a, b) => a - b);
  const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];
  if (p95 > BAD_FRAME_MS) {
    badWindows += 1;
  } else {
    badWindows = Math.max(0, badWindows - 1);
  }

  if (badWindows < BAD_WINDOWS_NEEDED) return false;

  setSessionLowQuality(true);
  applied = true;
  armed = false;
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.warn(
      `[autoQuality] session low-quality step-down (p95≈${p95.toFixed(1)}ms over ${BAD_WINDOWS_NEEDED}s)`,
    );
  }
  return true;
}

/** Test/reset helper. */
export function resetAutoQualityForTests() {
  samples.length = 0;
  badWindows = 0;
  windowStartMs = 0;
  armed = true;
  applied = false;
}
