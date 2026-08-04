// menuStats.js — main-menu personal stats panel (wins / played / points / solo).
// Owns localStorage stats schema shared with the podium flow (MAIN-1 Lever H).

import { STORAGE_KEYS, storageGetJson, storageSetJson } from "../utils/storage.js";

/**
 * @returns {{ wins: number, matches: number, totalPoints: number, soloGames: number }}
 */
export function getPersonalStats() {
  const parsed = storageGetJson(STORAGE_KEYS.stats, /** @type {Record<string, unknown>} */ ({}));
  return {
    wins: Number(parsed.wins) || 0,
    matches: Number(parsed.matches) || 0,
    totalPoints: Number(parsed.totalPoints) || 0,
    soloGames: Number(parsed.soloGames) || 0,
  };
}

/** @param {{ wins: number, matches: number, totalPoints: number, soloGames: number }} stats */
export function savePersonalStats(stats) {
  storageSetJson(STORAGE_KEYS.stats, stats);
}

/**
 * @param {{
 *   getPersonalStats?: () => { wins: number, matches: number, totalPoints: number, soloGames: number },
 * }} [deps]
 * @returns {{ refreshMenuStats: () => void }}
 */
export function createMenuStats(deps = {}) {
  const readStats = deps.getPersonalStats ?? getPersonalStats;
  function refreshMenuStats() {
    const ps = readStats();
    const winsEl = document.getElementById("stat-wins");
    const playedEl = document.getElementById("stat-played");
    const ptsEl = document.getElementById("stat-pts");
    const soloEl = document.getElementById("stat-solo");
    if (winsEl) winsEl.textContent = String(ps.wins);
    if (playedEl) playedEl.textContent = String(ps.matches);
    if (ptsEl) ptsEl.textContent = ps.totalPoints.toLocaleString();
    if (soloEl) soloEl.textContent = String(ps.soloGames);
  }

  return { refreshMenuStats };
}
