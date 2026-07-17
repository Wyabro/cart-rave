// levelMusic.js — which in-game music tracks belong to which arena.
//
// Music used to be one global shuffled playlist of all four songs, arena-agnostic.
// It's now per-level: each arena has its own track list, and switching arenas
// (play entry or Quickplay rotation) swaps the playlist. Multiple songs per level
// are supported — a level with >1 track shuffles + advances through them, a level
// with 1 track loops it. Add a song to an arena by dropping the opus in
// public/sounds/ and adding its filename to that arena's array here.

/**
 * Arena id → ordered list of music filenames (in public/sounds/). Every quickplay
 * arena needs at least one track — contract-tested against shared/arenaPool.js.
 * @type {Record<string, string[]>}
 */
export const LEVEL_MUSIC = {
  classicRecord: ["music.opus", "song2.opus"],
  backrooms: ["storerooms.opus"],
  zanzibar: ["song3.opus", "song4.opus"],
};

/** Fallback for any arena not in the map (e.g. testArena) — the original main track. */
const DEFAULT_MUSIC = ["music.opus"];

/**
 * Resolve an arena's music filenames. Never returns empty (falls back to the main
 * track) so playGameMusic always has something to play.
 * @param {string | null | undefined} levelId
 * @returns {string[]} filenames (not URLs)
 */
export function resolveLevelMusic(levelId) {
  const list = levelId ? LEVEL_MUSIC[levelId] : null;
  return list && list.length > 0 ? list.slice() : DEFAULT_MUSIC.slice();
}
