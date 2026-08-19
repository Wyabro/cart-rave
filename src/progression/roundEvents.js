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

/**
 * True when this host actually sent a podium host_round for `startedAtMs`.
 * Late-join promote on someone else's podium has no latch sends.
 *
 * @param {{ startedAtMs?: number, sends?: number } | null | undefined} latch
 * @param {unknown} startedAtMs
 * @returns {boolean}
 */
export function hostEndedPodiumRound(latch, startedAtMs) {
  const started = Number(startedAtMs);
  if (!latch || !Number.isFinite(started) || started <= 0) return false;
  return Number(latch.sends) > 0 && latch.startedAtMs === started;
}

/**
 * Whether a MSG.round should credit local podium stats.
 * Host endRound flips phase to podium before sendHostRound, so the accepted
 * echo is podium→podium. Guests still require the running→podium they played.
 *
 * @param {{
 *   isHost: boolean,
 *   prevPhase: unknown,
 *   newPhase: unknown,
 *   validated: boolean,
 *   hostEndedThisRound: boolean,
 * }} args
 * @returns {boolean}
 */
export function shouldCreditPodiumFromRoundMsg({
  isHost,
  prevPhase,
  newPhase,
  validated,
  hostEndedThisRound,
}) {
  if (validated !== true) return false;
  if (newPhase !== "podium") return false;
  if (!isHost) return prevPhase === "running";
  if (hostEndedThisRound !== true) return false;
  return prevPhase === "running" || prevPhase === "podium";
}
