// playingNow.js — QP-PLAYING-1. Main-menu "N PLAYING NOW" pill helpers.
// Poll wiring lives in cart-rave-menu.js (show / hide lifecycle).

export const PLAYING_COUNT_PATH = "/api/playing";
export const PLAYING_COUNT_POLL_MS = 8_000;

/**
 * @param {unknown} payload
 * @returns {number} Floor integer ≥ 0. Anything else is 0.
 */
export function parsePlayingCount(payload) {
  if (!payload || typeof payload !== "object") return 0;
  const n = /** @type {{ n?: unknown }} */ (payload).n;
  if (typeof n !== "number" || !Number.isFinite(n)) return 0;
  const i = Math.floor(n);
  return i > 0 ? i : 0;
}

/**
 * @param {number} n
 * @returns {string}
 */
export function formatPlayingNowLabel(n) {
  return `${n} PLAYING NOW`;
}

/**
 * Hide at 0 / invalid. Rewrite the DOM only when the visible text changes.
 * @param {{ hidden?: unknown, textContent?: unknown } | null | undefined} el
 * @param {number} n
 */
export function applyPlayingNowPill(el, n) {
  if (!el || typeof el !== "object" || !("hidden" in el) || !("textContent" in el)) return;
  if (!Number.isInteger(n) || n < 1) {
    if (!el.hidden) {
      el.hidden = true;
      el.textContent = "";
    }
    return;
  }
  const label = formatPlayingNowLabel(n);
  if (!el.hidden && el.textContent === label) return;
  el.hidden = false;
  el.textContent = label;
}
