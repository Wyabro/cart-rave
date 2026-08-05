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

import { isQuickplayRoom } from "./roomCodes.js";

/** Grace before an armed countdown aborts on a transient unready — a reseat/blip within this
 *  window is tolerated, so a flapping peer no longer bounces everyone back to lobby (fix A). */
export const COUNTDOWN_ABORT_GRACE_MS = 1500;

/** Room names that are continuous (no manual ready-up). Quickplay is the public mode, and
 *  since QUICKPLAY-SHARD-1 it spans `quickplay` plus the `quickplay2…N` overflow shards —
 *  `isQuickplayRoom` is the single definition, so a shard is continuous exactly like shard 1.
 *  Miss this and a shard seats humans `isReady:false` while the client also stops auto-readying:
 *  nobody is ever ready and the room deadlocks in lobby.
 *
 *  `quickplay__*` is RETAINED alongside it as the party-do harness prefix — those tests inject
 *  the Durable Object name directly (bypassing the URL funnel that would reject an underscore)
 *  so each continuous-policy test gets an isolated DO. The shard regex does not match it. */
export function isContinuousModeRoom(roomName) {
  if (isQuickplayRoom(roomName)) return true;
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
