// arenaPool.js — quickplay arena rotation pool, shared by client + Worker.
//
// Fresh public Quickplay rooms start at QUICKPLAY_ARENA_IDS[0]. Client rematch
// advances via nextQuickplayArenaId (catalog order, wrap). src/levels/index.js
// re-exports the pool as PREFETCHABLE_LEVEL_IDS.

/** @type {readonly string[]} */
export const QUICKPLAY_ARENA_IDS = ["classicRecord", "backrooms", "zanzibar"];

/**
 * Next arena in catalog order for Quickplay rematch rotation.
 *
 * @param {string} current Currently loaded arena id
 * @param {readonly string[]} [arenaIds=QUICKPLAY_ARENA_IDS]
 * @returns {string}
 */
export function nextQuickplayArenaId(current, arenaIds = QUICKPLAY_ARENA_IDS) {
  if (!arenaIds || arenaIds.length === 0) return current;
  if (arenaIds.length === 1) return arenaIds[0];
  const idx = arenaIds.indexOf(current);
  if (idx < 0) return arenaIds[0];
  return arenaIds[(idx + 1) % arenaIds.length];
}
