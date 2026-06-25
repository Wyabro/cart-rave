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
let roundScores = { 0: 0, 1: 0, 2: 0, 3: 0 };

/** @type {Map<number, { attackerSlotIndex: number, wasCritical: boolean, timestamp: number }>} */
let lastHitBy = new Map();

function _resetRoundBase() {
  roundScores = { 0: 0, 1: 0, 2: 0, 3: 0 };
  roundWinnerSlotIndex = null;
  lastHitBy.clear();
}

/**
 * Snapshot of current round state (scores are copied).
 * @returns {{
 *   phase: string,
 *   startedAtMs: number,
 *   countdownStartedAtMs: number,
 *   winnerSlotIndex: number | string | null,
 *   scores: Record<number, number>,
 * }}
 */
export function getRoundState() {
  return {
    phase: roundPhase,
    startedAtMs: roundStartedAtMs,
    countdownStartedAtMs: roundCountdownStartedAtMs,
    winnerSlotIndex: roundWinnerSlotIndex,
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
