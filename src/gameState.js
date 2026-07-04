// gameState.js — round phases, scoring, podium, and match state backed by gameStore (Zustand)
import { gameStore, RoundPhase } from "./stores/gameStore.js";

export { RoundPhase };

/**
 * Snapshot of current round state (scores are copied).
 * @returns {{
 *   phase: string,
 *   startedAtMs: number,
 *   countdownStartedAtMs: number,
 *   winnerSlotIndex: number | string | null,
 *   endReason: "timer" | "lastStanding" | null,
 *   scores: Record<number, number>,
 *   isSuddenDeath: boolean,
 * }}
 */
export function getRoundState() {
  return gameStore.getState().getRoundState();
}

/**
 * @param {string} phase
 */
export function setRoundPhase(phase) {
  gameStore.getState().setRoundPhase(phase);
}

/** Begin the 60s running phase; resets scores and hit tracking. */
export function startRunning() {
  gameStore.getState().startRunning();
}

/** Begin the pre-round countdown; resets scores and hit tracking. */
export function startCountdown() {
  gameStore.getState().startCountdown();
}

/**
 * Enter podium phase with an optional winner slot index (or `"draw"`).
 * @param {number | string | null} [winnerSlotIndex]
 */
export function endRound(winnerSlotIndex = null) {
  gameStore.getState().endRound(winnerSlotIndex);
}

/**
 * @param {number} slotIndex
 * @param {number} points
 * @param {boolean} [suppressSuddenDeathWin=false] When true, awards score without ending Sudden Death.
 * @returns {boolean} True if this score ended Sudden Death.
 */
export function addScore(slotIndex, points, suppressSuddenDeathWin = false) {
  return gameStore.getState().addScore(slotIndex, points, suppressSuddenDeathWin);
}

/**
 * Host timer-end winner: highest score; ties broken by most recent scoring hit, then lowest slot.
 * @param {Record<number, number>} scores
 * @returns {number | "draw"}
 */
export function pickTimerWinner(scores) {
  const lastScoringHitAt = gameStore.getState().lastScoringHitAt;
  let topScore = -Infinity;
  for (let i = 0; i < 4; i += 1) {
    topScore = Math.max(topScore, Number(scores[i] || 0));
  }

  const leaders = [];
  for (let i = 0; i < 4; i += 1) {
    if (Number(scores[i] || 0) === topScore) leaders.push(i);
  }

  if (leaders.length === 0) return 0;
  if (topScore === 0) return "draw";
  if (leaders.length === 1) return leaders[0];

  let winner = leaders[0];
  let bestHitAt = lastScoringHitAt[winner] || 0;
  for (let j = 1; j < leaders.length; j += 1) {
    const slot = leaders[j];
    const hitAt = lastScoringHitAt[slot] || 0;
    if (hitAt > bestHitAt) {
      bestHitAt = hitAt;
      winner = slot;
    }
  }

  const atBest = leaders.filter((s) => (lastScoringHitAt[s] || 0) === bestHitAt);
  if (atBest.length > 1) {
    return Math.min(...atBest);
  }
  return winner;
}

/**
 * @param {number} victimSlot
 * @param {number} attackerSlotIndex
 * @param {boolean} wasCritical
 */
export function recordHit(victimSlot, attackerSlotIndex, wasCritical) {
  gameStore.getState().recordHit(victimSlot, attackerSlotIndex, wasCritical);
}

/**
 * Replace all slot scores (used when applying host round snapshots).
 * @param {Record<number, number>} scores
 */
export function setRoundScores(scores) {
  gameStore.getState().setRoundScores(scores);
}

/**
 * @param {number} ms
 * @internal Used by netcode / host round sync — prefer startRunning() for new rounds.
 */
export function setRoundStartedAtMs(ms) {
  gameStore.getState().setRoundStartedAtMs(ms);
}

/**
 * @param {number} ms
 * @internal Used by netcode / host round sync — prefer startCountdown() for new countdowns.
 */
export function setRoundCountdownStartedAtMs(ms) {
  gameStore.getState().setRoundCountdownStartedAtMs(ms);
}

/**
 * @param {number | string | null} idx
 * @internal Used by netcode / host round sync — prefer endRound() at round end.
 */
export function setRoundWinnerSlotIndex(idx) {
  gameStore.getState().setRoundWinnerSlotIndex(idx);
}

/**
 * @param {"timer" | "lastStanding" | null} reason
 */
export function setRoundEndReason(reason) {
  gameStore.getState().setRoundEndReason(reason);
}

/** Clears all pending hit attribution (e.g. between-round rematch reset). */
export function clearAllHits() {
  gameStore.getState().clearAllHits();
}

/** Resets round state to lobby (session teardown or quit-to-menu). */
export function resetRoundToLobby() {
  gameStore.getState().resetRoundToLobby();
}

/** @returns {Record<number, number>} */
export function getRoundScores() {
  return { ...gameStore.getState().roundScores };
}

/**
 * Checks if the top score is shared by more than one slot (ignoring lastScoringHitAt tiebreaker).
 * @returns {boolean}
 */
export function isScoreTied() {
  const roundScores = gameStore.getState().roundScores;
  let topScore = -Infinity;
  for (let i = 0; i < 4; i += 1) {
    topScore = Math.max(topScore, Number(roundScores[i] || 0));
  }
  if (topScore <= 0) return false;
  let topCount = 0;
  for (let i = 0; i < 4; i += 1) {
    if (Number(roundScores[i] || 0) === topScore) topCount += 1;
  }
  return topCount > 1;
}

/**
 * Sets the Sudden Death flag. Cleared automatically on next round start via _resetRoundBase().
 * @param {boolean} val
 */
export function setSuddenDeath(val) {
  gameStore.getState().setSuddenDeath(val);
}

/**
 * Registers a callback fired when a score ends Sudden Death.
 * @param {(slotIndex: number) => void} fn
 */
export function setSuddenDeathWinCallback(fn) {
  gameStore.getState().setSuddenDeathWinCallback(fn);
}

/**
 * Updates the local player combo tier and expiry timestamp in gameStore.
 * @param {number} tier
 * @param {number} expiryMs
 */
export function setLocalCombo(tier, expiryMs) {
  gameStore.getState().setLocalCombo(tier, expiryMs);
}

/** @returns {Map<number, { attackerSlotIndex: number, wasCritical: boolean, timestamp: number }>} */
export function getLastHitBy() {
  return gameStore.getState().lastHitBy;
}
