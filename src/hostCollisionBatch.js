// hostCollisionBatch.js — host-side collision FX queue (flushed with host_transform)

/** @type {Map<string, object>} */
const pendingByPair = new Map();

/**
 * @param {number} slotA
 * @param {number} slotB
 * @returns {string}
 */
function collisionPairKey(slotA, slotB) {
  const a = Math.min(slotA, slotB);
  const b = Math.max(slotA, slotB);
  return `${a}|${b}`;
}

/**
 * * Queues one collision FX event for the next host send tick.
 * * Keeps the highest-intensity event per slot pair until flush.
 *
 * @param {{
 *   slotA: number,
 *   slotB: number,
 *   intensity: number,
 *   midpoint?: { x: number, y: number, z: number } | null,
 *   rammerSlot?: number,
 *   isBoosting?: boolean,
 * }} event
 * @returns {void}
 */
export function queueHostCollisionEvent(event) {
  const { slotA, slotB } = event;
  if (typeof slotA !== "number" || typeof slotB !== "number") return;

  const key = collisionPairKey(slotA, slotB);
  const intensity = typeof event.intensity === "number" ? event.intensity : 0;
  const existing = pendingByPair.get(key);
  if (existing && intensity <= (existing.intensity ?? 0)) return;

  const mp = event.midpoint;
  pendingByPair.set(key, {
    slotA,
    slotB,
    intensity,
    rammerSlot: typeof event.rammerSlot === "number" ? event.rammerSlot : undefined,
    isBoosting: Boolean(event.isBoosting),
    midpoint: mp && typeof mp.x === "number" && typeof mp.y === "number" && typeof mp.z === "number"
      ? { x: mp.x, y: mp.y, z: mp.z }
      : null,
  });
}

/**
 * @returns {object[]}
 */
export function drainHostCollisionBatch() {
  if (pendingByPair.size === 0) return [];
  const batch = Array.from(pendingByPair.values());
  pendingByPair.clear();
  return batch;
}

/** @returns {void} */
export function clearHostCollisionBatch() {
  pendingByPair.clear();
}
