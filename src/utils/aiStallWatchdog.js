/**
 * aiStallWatchdog.js — dev-only observer that flags NPCs that appear stuck.
 *
 * This does NOT touch AI behavior. It only watches: each host frame (when ?diag is active) it
 * samples every NPC cart's horizontal speed + position and, when one sits with near-zero
 * meaningful movement in the same behavior for longer than a threshold, it emits ONE
 * `recordDiagEvent("ai", "stall_detected", …)`. The point is actionable evidence for future AI
 * tuning — "personality X wedged against the Storerooms wall for 4s" — not a fix.
 *
 * Why the thresholds are what they are: the AI's own recovery logic (simulation.js) already
 * treats speed < 1.4 for > 1100ms as "stuck" and reacts (reverse / re-target). We deliberately
 * sit ABOVE that (STALL_DURATION_MS) and also require the cart to have barely moved from where
 * it first went slow, so we only report stalls the AI failed to recover from on its own — the
 * ones worth a human's attention — instead of every normal reposition.
 *
 * Timers on the cart (aiPauseUntilMs, aiReverseUntilMs, …) are compared against the same
 * `performance.now()`-based clock the host step passes in, so `now` must come from the caller
 * (gameLoop's stepNow), not an independent performance.now() read.
 *
 * State is keyed by the cart object in a WeakMap, so a torn-down/respawned cart drops out with
 * no bookkeeping. Zero cost when diagnostics are inactive: the sole caller is guarded by
 * `window.__ccDiagActive`, and recordDiagEvent itself is a no-op when the hub isn't installed.
 */

import { recordDiagEvent } from "./diagnostics.js";

/** Below this horizontal speed (m/s) a cart counts as "not meaningfully moving". Matches the AI's own stuck speed. */
const STALL_SPEED_THRESHOLD = 1.4;
/** Sustained slow-and-stationary time before we flag (ms). Above the AI's 1100ms self-recovery window. */
const STALL_DURATION_MS = 2500;
/** If a cart drifts more than this (m) from where it went slow, it's making progress — re-anchor, no stall. */
const MOVE_EPSILON_M = 0.8;

/**
 * @typedef {object} StallTrack
 * @property {number} anchorMs  When the cart last had meaningful movement (the stall-window start).
 * @property {number} anchorX
 * @property {number} anchorZ
 * @property {boolean} reported Whether the current stall episode already emitted (debounce).
 */

/** @type {WeakMap<object, StallTrack>} */
let tracks = new WeakMap();

/**
 * Human-readable behavior descriptor. No AI state enum exists in this codebase — behavior is
 * emergent from timers — so we synthesize one from the same timer fields the `ai` probe reads.
 * @param {any} cart
 * @param {number} now
 * @returns {string}
 */
function describeState(cart, now) {
  if (typeof cart.aiPauseUntilMs === "number" && cart.aiPauseUntilMs > now) return "paused";
  if (typeof cart.aiReverseUntilMs === "number" && cart.aiReverseUntilMs > now) return "reversing";
  if (typeof cart.aiContestPodiumUntilMs === "number" && cart.aiContestPodiumUntilMs > now) {
    return "contestingPodium";
  }
  if (typeof cart.aiAvoidanceCommitUntilMs === "number" && cart.aiAvoidanceCommitUntilMs > now) {
    return "avoiding";
  }
  return "seeking";
}

/** Read horizontal speed + position from a cart's Rapier body; null if the body is gone. */
function readMotion(cart) {
  const body = cart?.body;
  if (!body) return null;
  try {
    const t = body.translation();
    const v = body.linvel();
    return { x: t.x, z: t.z, speed: Math.hypot(v.x || 0, v.z || 0) };
  } catch {
    return null; // body torn down mid-read
  }
}

function round2(n) {
  return typeof n === "number" ? Math.round(n * 100) / 100 : n;
}

/**
 * Sample every NPC once and emit `ai/stall_detected` for any that crossed the stall threshold.
 * Call once per host frame from the host-gated loop, guarded by window.__ccDiagActive.
 *
 * @param {Array<any> | null | undefined} npcs  The frame's NPC carts (holes/nulls tolerated).
 * @param {number} now  The host step clock (performance.now-based) — same clock the AI timers use.
 * @returns {void}
 */
export function tickAiStallWatchdog(npcs, now) {
  if (!Array.isArray(npcs) || npcs.length === 0) return;
  for (const cart of npcs) {
    if (!cart || !cart.isNpc) continue;
    const m = readMotion(cart);
    if (!m) continue;

    let track = tracks.get(cart);
    if (!track) {
      track = { anchorMs: now, anchorX: m.x, anchorZ: m.z, reported: false };
      tracks.set(cart, track);
      continue;
    }

    const drift = Math.hypot(m.x - track.anchorX, m.z - track.anchorZ);
    const movingMeaningfully = m.speed >= STALL_SPEED_THRESHOLD || drift > MOVE_EPSILON_M;

    if (movingMeaningfully) {
      // * Progress (or recovery from a prior stall) — re-anchor here and re-arm the detector.
      track.anchorMs = now;
      track.anchorX = m.x;
      track.anchorZ = m.z;
      track.reported = false;
      continue;
    }

    const durationMs = now - track.anchorMs;
    if (durationMs >= STALL_DURATION_MS && !track.reported) {
      track.reported = true; // debounce: one event per stall episode until it recovers
      recordDiagEvent("ai", "stall_detected", {
        slot: typeof cart.slotIndex === "number" ? cart.slotIndex : null,
        npcId: typeof cart.slotIndex === "number" ? `npc:${cart.slotIndex}` : "npc:?",
        personality: cart.aiPersonality?.name ?? cart.aiPersonality ?? null,
        state: describeState(cart, now),
        durationMs: Math.round(durationMs),
        x: round2(m.x),
        z: round2(m.z),
        speed: round2(m.speed),
        target: cart.aiTarget ? { x: round2(cart.aiTarget.x), z: round2(cart.aiTarget.z) } : null,
      });
    }
  }
}

/**
 * Drop all tracking (e.g. between rounds / on host migration). Not required for correctness —
 * stale carts fall out of the WeakMap on GC — but keeps durations honest across a fresh round.
 * @returns {void}
 */
export function resetAiStallWatchdog() {
  tracks = new WeakMap();
}
