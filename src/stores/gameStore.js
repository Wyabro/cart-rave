// gameStore.js — Vanilla Zustand store for match & round lifecycle state.
import { createStore } from "zustand/vanilla";
import { getRoundClockNowMs } from "../roundClock.js";

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
  localComboTier: 0,
  localComboExpiryMs: 0,
  localComboMultiplier: 1.0,

  setLocalCombo: (tier, expiryMs) => {
    const mult = tier === 1 ? 1.5 : tier === 2 ? 2.0 : tier === 3 ? 3.0 : 1.0;
    set({ localComboTier: tier, localComboExpiryMs: expiryMs, localComboMultiplier: mult });
  },

  setRoundPhase: (phase) => set({ roundPhase: phase }),

  startRunning: () => {
    // * Round-clock domain (same as host_round startedAtMs / hit timestamps) — not Date.now().
    const now = getRoundClockNowMs();
    set({
      roundPhase: RoundPhase.RUNNING,
      roundStartedAtMs: now,
      roundScores: { 0: 0, 1: 0, 2: 0, 3: 0 },
      lastScoringHitAt: { 0: 0, 1: 0, 2: 0, 3: 0 },
      roundWinnerSlotIndex: null,
      roundEndReason: null,
      lastHitBy: new Map(),
      isSuddenDeath: false,
      localComboTier: 0,
      localComboExpiryMs: 0,
      localComboMultiplier: 1.0,
    });
  },

  startCountdown: () => {
    const now = getRoundClockNowMs();
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
      localComboTier: 0,
      localComboExpiryMs: 0,
      localComboMultiplier: 1.0,
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
      const currentHits = { ...state.lastScoringHitAt, [slotIndex]: getRoundClockNowMs() };
      updates.lastScoringHitAt = currentHits;

      if (state.isSuddenDeath && state.suddenDeathWinCallback && !suppressSuddenDeathWin) {
        state.suddenDeathWinCallback(slotIndex);
        endedSuddenDeath = true;
      }
    }

    set(updates);
    return endedSuddenDeath;
  },

  recordHit: (victimSlot, attackerSlotIndex, wasCritical, impactSpeed = 0, fromPodium = false) => {
    const map = new Map(get().lastHitBy);
    map.set(victimSlot, {
      attackerSlotIndex,
      wasCritical,
      impactSpeed,
      fromPodium,
      // * Same domain as buildKOEvent(nowMs) / directive hit windows (NET-CLK-3).
      timestamp: getRoundClockNowMs(),
    });
    set({ lastHitBy: map });
  },

  /**
   * Host-migration restore: replace open hit attribution with wire ages applied to local now.
   * @param {Map<number, { attackerSlotIndex: number, wasCritical: boolean, impactSpeed: number, fromPodium?: boolean, timestamp: number }>} map
   */
  replaceLastHitBy: (map) => {
    set({ lastHitBy: map instanceof Map ? map : new Map() });
  },

  /**
   * Host-migration restore for timer-tiebreak stamps (round-clock domain).
   * @param {Record<number, number>} hits
   */
  setLastScoringHitAt: (hits) => {
    set({
      lastScoringHitAt: {
        0: Number(hits?.[0]) || 0,
        1: Number(hits?.[1]) || 0,
        2: Number(hits?.[2]) || 0,
        3: Number(hits?.[3]) || 0,
      },
    });
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
      localComboTier: 0,
      localComboExpiryMs: 0,
      localComboMultiplier: 1.0,
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
