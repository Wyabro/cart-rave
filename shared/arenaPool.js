// arenaPool.js — quickplay arena rotation pool, shared by client + Worker.
//
// Fresh public Quickplay rooms pick a random pool entry; client rematch advances
// via nextQuickplayArenaId (catalog order, wrap). src/levels/index.js uses the
// same pool for prefetch.

/** @type {readonly string[]} */
export const QUICKPLAY_ARENA_IDS = ["classicRecord", "backrooms", "zanzibar"];

/** Production arenas a host may latch on friends / quickplay rooms. */
export const MULTIPLAYER_LEVEL_IDS = Object.freeze([
  "classicRecord",
  "backrooms",
  "zanzibar",
  "rooftop",
]);

/**
 * Whether a room is testdrive/solo (dev arena allowed).
 * @param {unknown} roomName
 * @returns {boolean}
 */
export function isDevOnlyRoomName(roomName) {
  const n = String(roomName || "").toLowerCase();
  return n.startsWith("testdrive") || n.startsWith("solo");
}

/**
 * Host-asserted levelId allowlist. Rejects prototype keys and testArena in MP.
 * @param {unknown} levelId
 * @param {unknown} roomName
 * @returns {boolean}
 */
export function isAllowedHostLevelId(levelId, roomName) {
  if (typeof levelId !== "string" || levelId.length === 0) return false;
  if (MULTIPLAYER_LEVEL_IDS.includes(levelId)) return true;
  return levelId === "testArena" && isDevOnlyRoomName(roomName);
}

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
