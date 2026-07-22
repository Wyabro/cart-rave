// readiness.js — countdown-readiness policy shared between the Worker DO and its tests.
//
// COUNTDOWN-ABORT-1 (07-21): quickplay is a CONTINUOUS mode — there is no manual ready-up,
// so a seated human is ready by definition. The prior server gated the countdown on a
// client-sent `ready` message; a slow/reconnecting peer (e.g. a weak machine mid a multi-
// second load freeze) couldn't send it in time, got seated `isReady:false`, and the server
// aborted the armed countdown on every roster blip — the "countdown jank" the paired F8s
// (caps 167/168, 175/176) pinned to `round_msg_lobby` aborts with all humans actually ready.
//
// This module is the single source of truth for "does a seated human count as ready", so the
// decision is unit-testable without the Workers runtime (the DO class is not).

/** Grace before an armed countdown aborts on a transient unready — a reseat/blip within this
 *  window is tolerated, so a flapping peer no longer bounces everyone back to lobby (fix A). */
export const COUNTDOWN_ABORT_GRACE_MS = 1500;

/** Room names that are continuous (no manual ready-up). Quickplay is the shared public room.
 *  `quickplay__*` is a party-do harness prefix so continuous-policy tests get isolated DOs. */
export function isContinuousModeRoom(roomName) {
  if (roomName === "quickplay") return true;
  return typeof roomName === "string" && roomName.startsWith("quickplay__");
}

/**
 * Readiness a human slot should be seated with.
 * - Continuous mode (quickplay): always ready — seated ⇒ ready (fixes the abort at its source).
 * - Other modes (friends/private READY button): ready only if this connId was ready before an
 *   orphan-reconcile → reseat blip, so a same-connId flap restores rather than drops readiness (B).
 *
 * @param {{ continuousMode: boolean, connId?: string | null, readyConnIds?: Set<string> | null }} opts
 * @returns {boolean}
 */
export function seatReadyState({ continuousMode, connId, readyConnIds }) {
  if (continuousMode) return true;
  return !!(connId && readyConnIds && readyConnIds.has(connId));
}
