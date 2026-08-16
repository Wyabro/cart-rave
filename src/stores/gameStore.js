// gameStore.js — Vanilla Zustand store for match & round lifecycle state.
import { createStore } from "zustand/vanilla";
import { CONFIG } from "../config.js";
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
    // * Single source with scoring: CONFIG.combo.tiers (do not hardcode multipliers here).
    const t = Math.max(0, Math.min(3, Number(tier) || 0));
    const mult = CONFIG.combo?.tiers?.[t]?.multiplier ?? 1.0;
    set({ localComboTier: t, localComboExpiryMs: expiryMs, localComboMultiplier: mult });
  },

  setRoundPhase: (phase) => set({ roundPhase: phase }),

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
        endedSuddenDeath = true;
      }
    }

    // * SD-SCORE-STALE-1: commit BEFORE the SD win callback. endRound (wired as
    // * suddenDeathWinCallback) reads getRoundScores()/getRoundState().scores for
    // * podium stats and the host_round broadcast — the winning point must already
    // * be visible, or guests see pre-KO scores and stats miss the final point.
    // * Invariant: subscribers must not throw or mutate store state between this
    // * commit and the callback (verified safe today — all four are read-only w.r.t.
    // * scoring); the callback must always run once the win is flagged.
    set(updates);
    if (endedSuddenDeath) {
      state.suddenDeathWinCallback(slotIndex);
    }
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

  /** Clears one slot's open hit attribution (e.g. after its KO is dispatched). */
  clearLastHitBy: (slotIndex) => {
    const map = new Map(get().lastHitBy);
    map.delete(slotIndex);
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

/** @returns {{
 *   phase: string,
 *   startedAtMs: number,
 *   countdownStartedAtMs: number,
 *   winnerSlotIndex: number | string | null,
 *   endReason: "timer" | "lastStanding" | null,
 *   scores: Record<number, number>,
 *   isSuddenDeath: boolean,
 * }} */
export function getRoundState() {
  return gameStore.getState().getRoundState();
}

/** @param {string} phase */
export function setRoundPhase(phase) {
  gameStore.getState().setRoundPhase(phase);
}

/**
 * Round-phase transitions that always clear leftover Rampage combo on a fresh
 * countdown/running boundary (solo RESTART can land inside the previous round's
 * 5s combo window and flash the badge over 3-2-1).
 * @param {string} phase
 */
export function syncRoundPhase(phase) {
  if (phase === "countdown" || phase === "running") setLocalCombo(0, 0);
  setRoundPhase(phase);
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
 * @param {number} [impactSpeed] Planar speed (m/s) of the crediting ram at contact.
 * @param {boolean} [fromPodium] Ram was delivered from the podium high ground (Sundial).
 */
export function recordHit(victimSlot, attackerSlotIndex, wasCritical, impactSpeed = 0, fromPodium = false) {
  gameStore.getState().recordHit(victimSlot, attackerSlotIndex, wasCritical, impactSpeed, fromPodium);
}

/** @param {number} slotIndex */
export function clearLastHitBy(slotIndex) {
  gameStore.getState().clearLastHitBy(slotIndex);
}

/** @param {Record<number, number>} scores */
export function setRoundScores(scores) {
  gameStore.getState().setRoundScores(scores);
}

/** @param {number} ms */
export function setRoundStartedAtMs(ms) {
  gameStore.getState().setRoundStartedAtMs(ms);
}

/** @param {number} ms */
export function setRoundCountdownStartedAtMs(ms) {
  gameStore.getState().setRoundCountdownStartedAtMs(ms);
}

/** @param {number | string | null} idx */
export function setRoundWinnerSlotIndex(idx) {
  gameStore.getState().setRoundWinnerSlotIndex(idx);
}

/** @param {"timer" | "lastStanding" | null} reason */
export function setRoundEndReason(reason) {
  gameStore.getState().setRoundEndReason(reason);
}

export function clearAllHits() {
  gameStore.getState().clearAllHits();
}

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

/** @param {boolean} val */
export function setSuddenDeath(val) {
  gameStore.getState().setSuddenDeath(val);
}

/** @param {(slotIndex: number) => void} fn */
export function setSuddenDeathWinCallback(fn) {
  gameStore.getState().setSuddenDeathWinCallback(fn);
}

/** @param {number} tier @param {number} expiryMs */
export function setLocalCombo(tier, expiryMs) {
  gameStore.getState().setLocalCombo(tier, expiryMs);
}

/** @returns {Map<number, { attackerSlotIndex: number, wasCritical: boolean, impactSpeed: number, fromPodium?: boolean, timestamp: number }>} */
export function getLastHitBy() {
  return gameStore.getState().lastHitBy;
}

/** @param {Map<number, { attackerSlotIndex: number, wasCritical: boolean, impactSpeed: number, fromPodium?: boolean, timestamp: number }>} map */
export function replaceLastHitBy(map) {
  gameStore.getState().replaceLastHitBy(map);
}

/** @returns {Record<number, number>} */
export function getLastScoringHitAt() {
  return { ...gameStore.getState().lastScoringHitAt };
}

/** @param {Record<number, number>} hits */
export function setLastScoringHitAt(hits) {
  gameStore.getState().setLastScoringHitAt(hits);
}
