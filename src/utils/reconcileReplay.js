/**
 * Bound non-host reconcile cost: after a hard body snap to host truth, replaying
 * EVERY unacked input is correct but unbounded (run-7 Match A: pending hit 120 on
 * an Intel non-host → 120 Rapier world.steps per snapshot → main-thread death
 * spiral). Cap steps so potato non-hosts stay alive.
 *
 * Pending is oldest-first and already pruned to seq > host ack. Replay must be a
 * *continuous* extension of host truth — keep the **oldest** `maxSteps` frames and
 * drop the newest. (Run-7 hit-delay: keeping newest / dropping oldest punched a
 * hole in the input stream, so the body was reconstructed wrong every snap and
 * combat only "caught up" when a later host snapshot teleported poses — felt like
 * ~1s late hits both ways.)
 *
 * Mutates `pending` in place (the live netcode array). Returns how many were dropped.
 * @param {{ seq?: number }[]} pending
 * @param {number} maxSteps
 * @returns {number}
 */
export function trimPendingForReconcileReplay(pending, maxSteps) {
  if (!Array.isArray(pending) || pending.length === 0) return 0;
  const cap = Number(maxSteps);
  if (!(cap > 0) || pending.length <= cap) return 0;
  const drop = pending.length - cap;
  // * Drop from the tail (newest). Index 0 stays the first unacked after host ack.
  pending.splice(cap, drop);
  return drop;
}
