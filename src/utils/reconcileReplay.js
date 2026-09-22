/**
 * Bound non-host reconcile cost: after a hard body snap to host truth, replaying
 * EVERY unacked input is correct but unbounded (run-7 Match A: pending hit 120 on
 * an Intel non-host → 120 Rapier world.steps per snapshot → main-thread death
 * spiral). Cap steps so potato non-hosts stay alive.
 *
 * Pending is oldest-first and already pruned to seq > host ack. Replay must be a
 * *continuous* extension of host truth, so select the **oldest** `maxSteps` frames.
 * Newer frames stay in the live pending history. A later host acknowledgement
 * advances the window and makes those deferred frames eligible for replay.
 *
 * This function never mutates the live netcode array. Deleting deferred frames here
 * loses player input whenever acknowledgement latency exceeds the replay budget.
 * @template T
 * @param {T[]} pending
 * @param {number} maxSteps
 * @returns {{ inputs: T[], deferredCount: number }}
 */
export function selectPendingForReconcileReplay(pending, maxSteps) {
  if (!Array.isArray(pending) || pending.length === 0) {
    return { inputs: [], deferredCount: 0 };
  }
  const cap = Math.max(0, Math.floor(Number(maxSteps) || 0));
  const replayCount = Math.min(pending.length, cap);
  return {
    inputs: pending.slice(0, replayCount),
    deferredCount: pending.length - replayCount,
  };
}
