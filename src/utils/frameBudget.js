/**
 * frameBudget.js — soft per-frame time budget for optional work.
 *
 * Critical path (physics, cart mesh sync, HUD scores, net, final render,
 * Classic floor Reflector) always runs. Optional systems call
 * {@link frameBudgetAllow} before doing work; a false return means "yield this
 * frame" — skip or reuse last results.
 *
 * Design notes:
 * - Budget is wall-clock from {@link beginFrameBudget}, not a fixed phase table.
 * - A render reserve is held so late-frame optionals never starve the GPU submit.
 * - Under sustained pressure (slow prior frames) the target tightens and
 *   half-rate buckets skip more aggressively.
 * - The vinyl Reflector is intentionally NOT budget-gated: skipping reuses a
 *   stale RT and reads as jitter on a spinning floor.
 */

/** @typedef {"rave_anim" | "ambient" | "trash" | "level_lod" | "labels" | "booth_pulse" | "water_fx" | "near_miss"} BudgetBucket */

/**
 * @typedef {object} BucketDef
 * @property {number} costMs Estimated cost used for allow/deny (not measured spend).
 * @property {boolean} [halfRate] When remaining is tight, only run on odd frames.
 * @property {number} [minRemainingMs] Require at least this much remaining (after reserve).
 */

/** @type {Record<BudgetBucket, BucketDef>} */
const BUCKETS = {
  // * Crowd bounce / lasers / stage lights / LED / billboard.
  rave_anim: { costMs: 1.1, halfRate: true, minRemainingMs: 2.0 },
  ambient: { costMs: 0.25, halfRate: true, minRemainingMs: 1.2 },
  trash: { costMs: 0.2, halfRate: true, minRemainingMs: 1.0 },
  level_lod: { costMs: 0.08, minRemainingMs: 0.8 },
  labels: { costMs: 0.15, halfRate: true, minRemainingMs: 1.0 },
  booth_pulse: { costMs: 0.08, halfRate: true, minRemainingMs: 0.8 },
  water_fx: { costMs: 0.25, halfRate: true, minRemainingMs: 1.2 },
  near_miss: { costMs: 0.12, halfRate: true, minRemainingMs: 1.0 },
};

/** ms held back for cart sync + composer/direct render + labels fallback */
const RENDER_RESERVE_MS = 5.5;
/** soft target for a 60 Hz frame with a little headroom */
const DEFAULT_BUDGET_MS = 15.5;
/** floor so we never go completely optional-less on 120 Hz displays */
const MIN_BUDGET_MS = 10.5;
/** ceiling when display is slow / dt is large */
const MAX_BUDGET_MS = 18.0;

let frameStartMs = 0;
let budgetMs = DEFAULT_BUDGET_MS;
let frameIndex = 0;
let lastFrameDtMs = 16.6;
/** @type {Partial<Record<BudgetBucket, boolean>>} */
let allowCache = {};
/** @type {Partial<Record<BudgetBucket, number>>} */
const skipCounts = {};
/** @type {Partial<Record<BudgetBucket, number>>} */
const runCounts = {};

/**
 * Starts a new frame budget window. Call once at the top of onFrame.
 * @param {number} nowMs performance.now()
 * @param {number} [dtSec] last frame delta (seconds) — used to adapt target
 */
export function beginFrameBudget(nowMs, dtSec = 0.016) {
  frameStartMs = nowMs;
  frameIndex += 1;
  allowCache = {};

  const dtMs = Math.min(50, Math.max(4, (Number(dtSec) || 0.016) * 1000));
  lastFrameDtMs = dtMs;

  // * Adaptive target: healthy frames keep ~15.5 ms; after a hitch, shrink optional
  // * budget so we recover instead of stacking more cosmetics onto debt.
  let target = DEFAULT_BUDGET_MS;
  if (dtMs > 22) target = MIN_BUDGET_MS;
  else if (dtMs > 18) target = 12.5;
  else if (dtMs < 12) target = Math.min(MAX_BUDGET_MS, 16.5);

  budgetMs = target;
}

/**
 * Wall-clock ms remaining in this frame's budget (can be negative when over).
 * @param {number} [nowMs]
 * @returns {number}
 */
function frameBudgetRemaining(nowMs = performance.now()) {
  return budgetMs - (nowMs - frameStartMs);
}

/**
 * ms still available for optional work after holding the render reserve.
 * @param {number} [nowMs]
 * @returns {number}
 */
export function frameBudgetOptionalRemaining(nowMs = performance.now()) {
  return frameBudgetRemaining(nowMs) - RENDER_RESERVE_MS;
}

/**
 * Whether an optional bucket may run this frame. Result is cached per bucket/frame.
 * @param {BudgetBucket} bucket
 * @param {number} [nowMs]
 * @returns {boolean}
 */
export function frameBudgetAllow(bucket, nowMs = performance.now()) {
  if (Object.prototype.hasOwnProperty.call(allowCache, bucket)) {
    return allowCache[bucket] === true;
  }

  const def = BUCKETS[bucket];
  if (!def) {
    allowCache[bucket] = true;
    return true;
  }

  const optionalLeft = frameBudgetOptionalRemaining(nowMs);
  const need = def.minRemainingMs ?? def.costMs;
  let allow = optionalLeft >= need && optionalLeft >= def.costMs;

  // * Under mild pressure, half-rate buckets run every other frame only.
  if (allow && def.halfRate && optionalLeft < need * 1.8) {
    allow = (frameIndex & 1) === 1;
  }

  // * After a bad prior frame, force half-rate buckets to odd frames only.
  if (allow && def.halfRate && lastFrameDtMs > 20) {
    allow = (frameIndex & 1) === 1;
  }

  allowCache[bucket] = allow;
  if (allow) runCounts[bucket] = (runCounts[bucket] || 0) + 1;
  else skipCounts[bucket] = (skipCounts[bucket] || 0) + 1;

  return allow;
}

/**
 * Dev/test counters — how often each bucket ran vs yielded.
 * @returns {{ frameIndex: number, budgetMs: number, remainingMs: number, run: object, skip: object }}
 */
export function getFrameBudgetStats() {
  return {
    frameIndex,
    budgetMs,
    remainingMs: frameBudgetRemaining(),
    run: { ...runCounts },
    skip: { ...skipCounts },
  };
}

/** Test helper — resets counters and frame state. */
export function resetFrameBudgetForTests() {
  frameStartMs = 0;
  budgetMs = DEFAULT_BUDGET_MS;
  frameIndex = 0;
  lastFrameDtMs = 16.6;
  allowCache = {};
  for (const k of Object.keys(skipCounts)) delete skipCounts[/** @type {BudgetBucket} */ (k)];
  for (const k of Object.keys(runCounts)) delete runCounts[/** @type {BudgetBucket} */ (k)];
}
