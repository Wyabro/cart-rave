// gameStore.js — Vanilla Zustand store for match & round lifecycle state.
import { createStore } from "zustand/vanilla";

export const RoundPhase = {
  LOBBY: "lobby",
  COUNTDOWN: "countdown",
  RUNNING: "running",
  PODIUM: "podium",
};

/**
 * Vanilla Zustand store for overall game round phase, timing, and scoring.
 */
export const gameStore = createStore((set, get) => ({
  roundPhase: RoundPhase.LOBBY,
  roundStartedAtMs: 0,
  roundCountdownStartedAtMs: 0,
  roundWinnerSlotIndex: null,
  roundEndReason: null,
  roundScores: { 0: 0, 1: 0, 2: 0, 3: 0 },
  lastScoringHitAt: { 0: 0, 1: 0, 2: 0, 3: 0 },
  lastHitBy: new Map(),
  isSuddenDeath: false,
  suddenDeathWinCallback: null,

  setRoundPhase: (phase) => set({ roundPhase: phase }),

  startRunning: () => {
    const now = Date.now();
    set({
      roundPhase: RoundPhase.RUNNING,
      roundStartedAtMs: now,
      roundScores: { 0: 0, 1: 0, 2: 0, 3: 0 },
      lastScoringHitAt: { 0: 0, 1: 0, 2: 0, 3: 0 },
      roundWinnerSlotIndex: null,
      roundEndReason: null,
      lastHitBy: new Map(),
      isSuddenDeath: false,
    });
  },

  startCountdown: () => {
    const now = Date.now();
    set({
      roundPhase: RoundPhase.COUNTDOWN,
      roundCountdownStartedAtMs: now,
      roundStartedAtMs: 0,
      roundScores: { 0: 0, 1: 0, 2: 0, 3: 0 },
      lastScoringHitAt: { 0: 0, 1: 0, 2: 0, 3: 0 },
      roundWinnerSlotIndex: null,
      roundEndReason: null,
      lastHitBy: new Map(),
      isSuddenDeath: false,
    });
  },

  endRound: (winnerSlotIndex = null) => {
    set({
      roundPhase: RoundPhase.PODIUM,
      roundWinnerSlotIndex: winnerSlotIndex,
    });
  },

  addScore: (slotIndex, points, suppressSuddenDeathWin = false) => {
    const state = get();
    const currentScores = { ...state.roundScores };
    if (currentScores[slotIndex] == null) currentScores[slotIndex] = 0;
    currentScores[slotIndex] += points;

    const updates = { roundScores: currentScores };
    let endedSuddenDeath = false;

    if (points > 0) {
      const currentHits = { ...state.lastScoringHitAt, [slotIndex]: Date.now() };
      updates.lastScoringHitAt = currentHits;

      if (state.isSuddenDeath && state.suddenDeathWinCallback && !suppressSuddenDeathWin) {
        state.suddenDeathWinCallback(slotIndex);
        endedSuddenDeath = true;
      }
    }

    set(updates);
    return endedSuddenDeath;
  },

  recordHit: (victimSlot, attackerSlotIndex, wasCritical) => {
    const map = new Map(get().lastHitBy);
    map.set(victimSlot, {
      attackerSlotIndex,
      wasCritical,
      timestamp: Date.now(),
    });
    set({ lastHitBy: map });
  },

  setRoundScores: (scores) => {
    set({ roundScores: { ...scores } });
  },

  setRoundStartedAtMs: (ms) => set({ roundStartedAtMs: ms }),
  setRoundCountdownStartedAtMs: (ms) => set({ roundCountdownStartedAtMs: ms }),
  setRoundWinnerSlotIndex: (idx) => set({ roundWinnerSlotIndex: idx }),
  setRoundEndReason: (reason) => {
    const valid = reason === "timer" || reason === "lastStanding" ? reason : null;
    set({ roundEndReason: valid });
  },

  clearAllHits: () => {
    set({ lastHitBy: new Map() });
  },

  resetRoundToLobby: () => {
    set({
      roundPhase: RoundPhase.LOBBY,
      roundStartedAtMs: 0,
      roundCountdownStartedAtMs: 0,
      roundWinnerSlotIndex: null,
      roundEndReason: null,
      roundScores: { 0: 0, 1: 0, 2: 0, 3: 0 },
      lastScoringHitAt: { 0: 0, 1: 0, 2: 0, 3: 0 },
      lastHitBy: new Map(),
      isSuddenDeath: false,
    });
  },

  setSuddenDeath: (val) => set({ isSuddenDeath: Boolean(val) }),
  setSuddenDeathWinCallback: (fn) => set({ suddenDeathWinCallback: fn }),

  getRoundState: () => {
    const s = get();
    return {
      phase: s.roundPhase,
      startedAtMs: s.roundStartedAtMs,
      countdownStartedAtMs: s.roundCountdownStartedAtMs,
      winnerSlotIndex: s.roundWinnerSlotIndex,
      endReason: s.roundEndReason,
      scores: { ...s.roundScores },
      isSuddenDeath: s.isSuddenDeath,
    };
  },
}));
