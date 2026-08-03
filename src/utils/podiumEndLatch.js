/**
 * podiumEndLatch.js — ROUND-WEDGE-1 Phase B client breaker.
 *
 * After the server rejects an optimistic host_round podium, netcode rolls the host
 * back to `running` and gameFlow's timer path would call endRound() every frame
 * (~25×/s storm, cap-217). This latch is pure host-end bookkeeping:
 *
 *   - Attempt count increments **only on send** (endRound → sendHostRound).
 *   - Reject arms a **time-gated** single retry (`retryAtMs`), then hard-stops.
 *   - Never bumps the send count on reject (pinned by tests).
 *
 * Callers: main.js endRound / host-only onPodiumRejected / clear on lobby·countdown.
 * Joiners must not arm; latch is only consulted inside host endRound.
 */

/** Max host_round podium sends per `startedAtMs` (first end + one hide-race retry). */
export const MAX_END_SENDS = 2;

/** Block endRound this long after a reject before allowing the single retry. */
export const PODIUM_END_RETRY_MS = 150;

/**
 * @typedef {object} PodiumEndLatchState
 * @property {number} startedAtMs
 * @property {number} sends
 * @property {number | null} blockedUntilMs  null = not in post-reject wait
 * @property {boolean} hardStopped
 * @property {boolean} hardStopDiagEmitted
 */

/** @type {PodiumEndLatchState | null} */
let state = null;

/** @returns {void} */
export function clearPodiumEndLatch() {
  state = null;
}

/**
 * @returns {PodiumEndLatchState | null} Snapshot for tests / diag (do not mutate).
 */
export function getPodiumEndLatchState() {
  return state ? { ...state } : null;
}

/**
 * Whether host endRound may proceed for this match clock.
 * Different / missing startedAtMs → allow (no latch for this key).
 *
 * @param {number} startedAtMs
 * @param {number} nowMs Round-clock now
 * @returns {boolean}
 */
export function shouldAllowPodiumEnd(startedAtMs, nowMs) {
  if (!Number.isFinite(startedAtMs) || startedAtMs <= 0) return true;
  if (!state || state.startedAtMs !== startedAtMs) return true;
  if (state.hardStopped) return false;
  if (state.sends >= MAX_END_SENDS) return false;
  if (state.blockedUntilMs != null && Number.isFinite(nowMs) && nowMs < state.blockedUntilMs) {
    return false;
  }
  return true;
}

/**
 * Record one podium host_round send. Increments send count only — never called from reject.
 *
 * @param {number} startedAtMs
 * @returns {void}
 */
export function notePodiumEndSend(startedAtMs) {
  if (!Number.isFinite(startedAtMs) || startedAtMs <= 0) return;
  if (!state || state.startedAtMs !== startedAtMs) {
    state = {
      startedAtMs,
      sends: 0,
      blockedUntilMs: null,
      hardStopped: false,
      hardStopDiagEmitted: false,
    };
  }
  state.sends += 1;
  // * After a send we wait for accept or reject; do not leave a stale block window open.
  state.blockedUntilMs = null;
}

/**
 * @typedef {"none" | "retry-scheduled" | "hard-stop"} PodiumEndRejectAction
 *
 * @typedef {object} PodiumEndRejectResult
 * @property {PodiumEndRejectAction} action
 * @property {number} [retryAtMs]
 * @property {number} [sends]
 */

/**
 * Server rejected podium (or reasserted running). Does **not** increment sends.
 * If budget remains → schedule time-gated retry; else hard-stop.
 *
 * @param {number} startedAtMs
 * @param {number} nowMs
 * @returns {PodiumEndRejectResult}
 */
export function onPodiumEndRejected(startedAtMs, nowMs) {
  if (!Number.isFinite(startedAtMs) || startedAtMs <= 0) {
    return { action: "none" };
  }
  if (!state || state.startedAtMs !== startedAtMs) {
    state = {
      startedAtMs,
      sends: 0,
      blockedUntilMs: null,
      hardStopped: false,
      hardStopDiagEmitted: false,
    };
  }
  if (state.hardStopped) {
    return { action: "hard-stop", sends: state.sends };
  }
  if (state.sends >= MAX_END_SENDS) {
    state.hardStopped = true;
    state.blockedUntilMs = null;
    return { action: "hard-stop", sends: state.sends };
  }
  const base = Number.isFinite(nowMs) ? nowMs : 0;
  state.blockedUntilMs = base + PODIUM_END_RETRY_MS;
  return {
    action: "retry-scheduled",
    retryAtMs: state.blockedUntilMs,
    sends: state.sends,
  };
}

/**
 * True once when hard-stopped and a diag event has not yet been claimed for this key.
 *
 * @param {number} startedAtMs
 * @returns {boolean}
 */
export function consumeHardStopDiag(startedAtMs) {
  if (!state || state.startedAtMs !== startedAtMs || !state.hardStopped) return false;
  if (state.hardStopDiagEmitted) return false;
  state.hardStopDiagEmitted = true;
  return true;
}

/** Test-only reset (same as clear). */
export function __resetPodiumEndLatchForTest() {
  clearPodiumEndLatch();
}
