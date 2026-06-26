// gameState.js — round phases, scoring, podium, and match state

/**
 * Round lifecycle phases.
 * @readonly
 * @enum {string}
 */
const RoundPhase = {
  LOBBY: "lobby",
  COUNTDOWN: "countdown",
  RUNNING: "running",
  PODIUM: "podium",
};

let roundPhase = RoundPhase.LOBBY;
let roundStartedAtMs = 0;
let roundCountdownStartedAtMs = 0;
let roundWinnerSlotIndex = null;
/** @type {"timer" | "lastStanding" | null} */
let roundEndReason = null;
let roundScores = { 0: 0, 1: 0, 2: 0, 3: 0 };
/** @type {Record<number, number>} Wall-clock ms when each slot last scored (attacker). */
let lastScoringHitAt = { 0: 0, 1: 0, 2: 0, 3: 0 };

/** @type {Map<number, { attackerSlotIndex: number, wasCritical: boolean, timestamp: number }>} */
let lastHitBy = new Map();

function _resetRoundBase() {
  roundScores = { 0: 0, 1: 0, 2: 0, 3: 0 };
  roundWinnerSlotIndex = null;
  roundEndReason = null;
  lastScoringHitAt = { 0: 0, 1: 0, 2: 0, 3: 0 };
  lastHitBy.clear();
}

/**
 * Snapshot of current round state (scores are copied).
 * @returns {{
 *   phase: string,
 *   startedAtMs: number,
 *   countdownStartedAtMs: number,
 *   winnerSlotIndex: number | string | null,
 *   endReason: "timer" | "lastStanding" | null,
 *   scores: Record<number, number>,
 * }}
 */
export function getRoundState() {
  return {
    phase: roundPhase,
    startedAtMs: roundStartedAtMs,
    countdownStartedAtMs: roundCountdownStartedAtMs,
    winnerSlotIndex: roundWinnerSlotIndex,
    endReason: roundEndReason,
    scores: { ...roundScores },
  };
}

/**
 * @param {string} phase
 */
export function setRoundPhase(phase) {
  roundPhase = phase;
}

/** Begin the 60s running phase; resets scores and hit tracking. */
function startRunning() {
  roundPhase = RoundPhase.RUNNING;
  roundStartedAtMs = Date.now();
  _resetRoundBase();
}

/** Begin the pre-round countdown; resets scores and hit tracking. */
function startCountdown() {
  roundPhase = RoundPhase.COUNTDOWN;
  roundCountdownStartedAtMs = Date.now();
  roundStartedAtMs = 0;
  _resetRoundBase();
}

/**
 * Enter podium phase with an optional winner slot index (or `"draw"`).
 * @param {number | string | null} [winnerSlotIndex]
 */
function endRound(winnerSlotIndex = null) {
  roundPhase = RoundPhase.PODIUM;
  roundWinnerSlotIndex = winnerSlotIndex;
}

/**
 * @param {number} slotIndex
 * @param {number} points
 */
export function addScore(slotIndex, points) {
  if (roundScores[slotIndex] == null) roundScores[slotIndex] = 0;
  roundScores[slotIndex] += points;
  if (points > 0) {
    lastScoringHitAt[slotIndex] = Date.now();
  }
}

/**
 * Host timer-end winner: highest score; ties broken by most recent scoring hit, then lowest slot.
 * @param {Record<number, number>} scores
 * @returns {number | "draw"}
 */
export function pickTimerWinner(scores) {
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
  lastHitBy.set(victimSlot, {
    attackerSlotIndex,
    wasCritical,
    timestamp: Date.now(),
  });
}

/**
 * @param {number} victimSlot
 * @returns {{ attackerSlotIndex: number, wasCritical: boolean, timestamp: number } | null}
 */
function getLastHit(victimSlot) {
  return lastHitBy.get(victimSlot) || null;
}

/**
 * @param {number} victimSlot
 */
function clearLastHit(victimSlot) {
  lastHitBy.delete(victimSlot);
}

/**
 * Replace all slot scores (used when applying host round snapshots).
 * @param {Record<number, number>} scores
 */
export function setRoundScores(scores) {
  roundScores = { ...scores };
}

/**
 * @param {number} ms
 * @internal Used by netcode / host round sync — prefer startRunning() for new rounds.
 */
export function setRoundStartedAtMs(ms) {
  roundStartedAtMs = ms;
}

/**
 * @param {number} ms
 * @internal Used by netcode / host round sync — prefer startCountdown() for new countdowns.
 */
export function setRoundCountdownStartedAtMs(ms) {
  roundCountdownStartedAtMs = ms;
}

/**
 * @param {number | string | null} idx
 * @internal Used by netcode / host round sync — prefer endRound() at round end.
 */
export function setRoundWinnerSlotIndex(idx) {
  roundWinnerSlotIndex = idx;
}

/**
 * @param {"timer" | "lastStanding" | null} reason
 */
export function setRoundEndReason(reason) {
  roundEndReason = reason === "timer" || reason === "lastStanding" ? reason : null;
}

/** Clears all pending hit attribution (e.g. between-round rematch reset). */
export function clearAllHits() {
  lastHitBy.clear();
}

/** Resets round state to lobby (session teardown or quit-to-menu). */
export function resetRoundToLobby() {
  roundPhase = RoundPhase.LOBBY;
  roundStartedAtMs = 0;
  roundCountdownStartedAtMs = 0;
  roundWinnerSlotIndex = null;
  _resetRoundBase();
}

/** @returns {Record<number, number>} */
export function getRoundScores() {
  return { ...roundScores };
}

/** @returns {number} Highest-scoring slot index, or -1 if none. */
function getRoundLeaderSlot() {
  let leaderSlot = -1;
  let leaderScore = -Infinity;
  const scores = getRoundScores();
  for (let i = 0; i < 4; i++) {
    const s = Number(scores[i] || 0);
    if (s > leaderScore) {
      leaderScore = s;
      leaderSlot = i;
    }
  }
  return leaderSlot;
}

/** @returns {Map<number, { attackerSlotIndex: number, wasCritical: boolean, timestamp: number }>} */
export function getLastHitBy() {
  return lastHitBy;
}
