// gameState.js — round phases, scoring, podium, and match state

export const RoundPhase = {
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
let roundStartingHumanCount = 0;

let lastHitBy = new Map(); // victimSlot -> { attackerSlotIndex, wasCritical, timestamp }

export function getRoundState() {
  return {
    phase: roundPhase,
    startedAtMs: roundStartedAtMs,
    countdownStartedAtMs: roundCountdownStartedAtMs,
    winnerSlotIndex: roundWinnerSlotIndex,
    scores: { ...roundScores },
  };
}

export function setRoundPhase(phase) {
  roundPhase = phase;
}

export function startRunning() {
  roundPhase = RoundPhase.RUNNING;
  roundStartedAtMs = Date.now();
  roundScores = { 0: 0, 1: 0, 2: 0, 3: 0 };
  roundWinnerSlotIndex = null;
  lastHitBy.clear();
}

export function startCountdown() {
  roundPhase = RoundPhase.COUNTDOWN;
  roundCountdownStartedAtMs = Date.now();
  roundScores = { 0: 0, 1: 0, 2: 0, 3: 0 };
  roundWinnerSlotIndex = null;
  roundStartedAtMs = 0;
}

export function endRound(winnerSlotIndex = null) {
  roundPhase = RoundPhase.PODIUM;
  roundWinnerSlotIndex = winnerSlotIndex;
}

export function addScore(slotIndex, points) {
  if (roundScores[slotIndex] == null) roundScores[slotIndex] = 0;
  roundScores[slotIndex] += points;
}

export function recordHit(victimSlot, attackerSlotIndex, wasCritical) {
  lastHitBy.set(victimSlot, {
    attackerSlotIndex,
    wasCritical,
    timestamp: Date.now(),
  });
}

export function getLastHit(victimSlot) {
  return lastHitBy.get(victimSlot) || null;
}

export function clearLastHit(victimSlot) {
  lastHitBy.delete(victimSlot);
}

export function setRoundScores(scores) {
  roundScores = { ...scores };
}

export function setRoundStartedAtMs(ms) {
  roundStartedAtMs = ms;
}

export function setRoundCountdownStartedAtMs(ms) {
  roundCountdownStartedAtMs = ms;
}

export function setRoundWinnerSlotIndex(idx) {
  roundWinnerSlotIndex = idx;
}

export function clearAllHits() {
  lastHitBy.clear();
}

export function getRoundScores() {
  return { ...roundScores };
}

export function getRoundLeaderSlot() {
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

export function getLastHitBy() {
  return lastHitBy;
}

export function clearHit(victimSlotIndex) {
  lastHitBy.delete(victimSlotIndex);
}