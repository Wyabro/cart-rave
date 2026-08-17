/**
 * FRIENDS-LOBBY-ORDER-1 — display order for the Friends CHECKOUT LINE.
 *
 * Seat index still owns color, glyph, and ready. This only reorders rows.
 * Humans whose connId is in joinOrder come first, in that array order.
 * Other humans follow in seat-index order. NPCs / empty stay last, seat-index.
 *
 * Missing or empty joinOrder returns seat-index order (today's paint).
 *
 * @template {{ slotIndex: number, kind: string, connId?: string|null }} T
 * @param {T[]} rows
 * @param {readonly string[] | null | undefined} joinOrder
 * @returns {T[]}
 */
export function orderLobbyRosterRows(rows, joinOrder) {
  if (!Array.isArray(rows) || rows.length === 0) return Array.isArray(rows) ? rows.slice() : [];
  const ordered = rows.slice();
  if (!Array.isArray(joinOrder) || joinOrder.length === 0) {
    ordered.sort((a, b) => a.slotIndex - b.slotIndex);
    return ordered;
  }

  const rank = new Map();
  for (let i = 0; i < joinOrder.length; i += 1) {
    const id = joinOrder[i];
    if (typeof id === "string" && id && !rank.has(id)) rank.set(id, i);
  }

  ordered.sort((a, b) => lobbyRosterCompare(a, b, rank));
  return ordered;
}

/**
 * @param {{ slotIndex: number, kind: string, connId?: string|null }} a
 * @param {{ slotIndex: number, kind: string, connId?: string|null }} b
 * @param {Map<string, number>} rank
 */
function lobbyRosterCompare(a, b, rank) {
  const aHuman = a.kind === "human" ? 0 : 1;
  const bHuman = b.kind === "human" ? 0 : 1;
  if (aHuman !== bHuman) return aHuman - bHuman;
  if (aHuman === 0) {
    const aRank = typeof a.connId === "string" && rank.has(a.connId) ? rank.get(a.connId) : Number.POSITIVE_INFINITY;
    const bRank = typeof b.connId === "string" && rank.has(b.connId) ? rank.get(b.connId) : Number.POSITIVE_INFINITY;
    if (aRank !== bRank) return aRank - bRank;
  }
  return a.slotIndex - b.slotIndex;
}
