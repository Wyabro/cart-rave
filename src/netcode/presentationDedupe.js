// presentationDedupe.js — NET-PRES-1 event-id stamps + seen-set for unreliable tails.
//
// Falls/collisions ride unordered unreliable DataChannels. Pose buffering gates on seq,
// but tails still run when seq rejects — so the same (seq, i) event can fan reactors twice.
// Host stamps `eid`; clients skip already-seen ids. Time-window pair/victim dedupe remains
// as a fallback for legacy hosts and for NH-HIT optimistic vs host-echo (no shared eid).

/**
 * Stamp `(seq, i)` presentation ids onto drained fall/collision arrays before send.
 * Mutates in place. Ids are scoped per hostSeq epoch (clients clear seen-sets on migrate).
 *
 * @param {number} seq Host snapshot sequence (already incremented for this tick).
 * @param {object[] | null | undefined} falls
 * @param {object[] | null | undefined} collisions
 * @returns {void}
 */
export function stampTailEventIds(seq, falls, collisions) {
  if (!Number.isFinite(seq)) return;
  if (Array.isArray(falls)) {
    for (let i = 0; i < falls.length; i += 1) {
      const ev = falls[i];
      if (ev && typeof ev === "object") ev.eid = `f${seq}.${i}`;
    }
  }
  if (Array.isArray(collisions)) {
    for (let i = 0; i < collisions.length; i += 1) {
      const ev = collisions[i];
      if (ev && typeof ev === "object") ev.eid = `c${seq}.${i}`;
    }
  }
}

/**
 * Record a presentation eid. Returns true when the caller should skip (already seen).
 * No-ops (returns false) when eid is missing — caller keeps legacy time-window dedupe.
 *
 * @param {Map<string, number>} seen eid → last-seen monotonic ms
 * @param {unknown} eid
 * @param {number} nowMs
 * @param {{ ttlMs?: number, maxSize?: number }} [opts]
 * @returns {boolean}
 */
export function markPresentationEid(seen, eid, nowMs, opts = {}) {
  if (typeof eid !== "string" || eid.length === 0) return false;
  if (seen.has(eid)) return true;
  seen.set(eid, nowMs);
  const ttlMs = opts.ttlMs ?? 5000;
  const maxSize = opts.maxSize ?? 64;
  if (seen.size > maxSize) {
    for (const [k, t] of seen) {
      if (nowMs - t > ttlMs) seen.delete(k);
    }
  }
  return false;
}
