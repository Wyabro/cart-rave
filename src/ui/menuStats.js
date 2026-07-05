// menuStats.js — main-menu personal stats panel (wins / played / points / solo).
//
// * Extracted verbatim from main(). Stats storage stays in main.js
// * (getPersonalStats / savePersonalStats share the localStorage schema with the
// * podium flow), so the reader is injected here as a dependency.

/**
 * @param {{
 *   getPersonalStats: () => { wins: number, matches: number, totalPoints: number, soloGames: number },
 * }} deps
 * @returns {{ refreshMenuStats: () => void }}
 */
export function createMenuStats({ getPersonalStats }) {
  function refreshMenuStats() {
    const ps = getPersonalStats();
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
