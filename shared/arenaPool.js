// arenaPool.js — quickplay arena rotation pool, shared by client + Worker.
//
// The server picks a random entry when a fresh quickplay room initializes so the
// first hello carries the room's real arena (not a hardcoded default that would
// silently clobber every joiner's local pick via adoptAuthoritativeRoomLevel).
// Client-side, src/levels/index.js re-exports this as PREFETCHABLE_LEVEL_IDS and
// main.js pickNextQuickplayArenaId draws the rematch rotation from it.

/** @type {readonly string[]} */
export const QUICKPLAY_ARENA_IDS = ["classicRecord", "backrooms", "zanzibar"];
