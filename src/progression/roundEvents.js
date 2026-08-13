import { PROGRESSION_EVENTS } from "./eventIds.js";

/**
 * Returns the local lifetime/challenge events earned by one concluded round.
 * Spectators have no slot and therefore earn no round participation credit.
 * @param {{ localSlotIndex: number, winnerSlotIndex: number | "draw" | null, localScore: number }} input
 * @returns {string[]}
 */
export function localRoundProgressionEvents({ localSlotIndex, winnerSlotIndex, localScore }) {
  if (!Number.isInteger(localSlotIndex) || localSlotIndex < 0) return [];
  /** @type {string[]} */
  const events = [PROGRESSION_EVENTS.ROUND_COMPLETE];
  if (winnerSlotIndex === localSlotIndex) events.push(PROGRESSION_EVENTS.ROUND_WIN);
  if (Number.isFinite(localScore) && localScore > 0) events.push(PROGRESSION_EVENTS.ROUND_SCORED);
  return events;
}
