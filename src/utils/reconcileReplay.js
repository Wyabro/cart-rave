/**
 * Bound non-host reconcile cost: after a hard body snap to host truth, replaying
 * EVERY unacked input is correct but unbounded (run-7 Match A: pending hit 120 on
 * an Intel non-host → 120 Rapier world.steps per snapshot → main-thread death
 * spiral, snap receive rate 40 Hz → 13 Hz, 72 m teleports). Drop oldest unacked
 * frames so we only ever replay the newest `maxSteps`.
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
  pending.splice(0, drop);
  return drop;
}
