// levelMusic.js — which in-game music tracks belong to which arena.
//
// Per-level assignments are authored in levels/arenaCatalog.js. This module keeps
// the music API stable for callers and owns fallback/copy behavior.

import { ARENA_CATALOG } from "../levels/arenaCatalog.js";

/**
 * Arena id → ordered list of music filenames (in public/sounds/). Every quickplay
 * arena needs at least one track — contract-tested against shared/arenaPool.js.
 * @type {Record<string, readonly string[]>}
 */
export const LEVEL_MUSIC = Object.fromEntries(
  ARENA_CATALOG
    .filter((arena) => arena.music.length > 0)
    .map((arena) => [arena.id, arena.music]),
);

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
