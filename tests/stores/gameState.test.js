import { describe, it, expect, beforeEach } from "vitest";
import {
  pickTimerWinner,
  recordHit,
  clearLastHitBy,
  getLastHitBy,
  syncRoundPhase,
  setLocalCombo,
  resetRoundToLobby,
} from "../../src/stores/gameStore.js";
import { gameStore } from "../../src/stores/gameStore.js";

describe("clearLastHitBy (LASTHITBY-MUTATE-1)", () => {
  it("goes through set() — a gameStore.subscribe listener observes the clear", () => {
    recordHit(1, 0, false);
    expect(getLastHitBy().has(1)).toBe(true);

    let seenLastHitBy = null;
    const unsubscribe = gameStore.subscribe((state) => {
      seenLastHitBy = state.lastHitBy;
    });

    clearLastHitBy(1);
    unsubscribe();

    expect(seenLastHitBy).not.toBeNull();
    expect(seenLastHitBy.has(1)).toBe(false);
  });

  it("leaves other slots' attribution untouched", () => {
    recordHit(1, 0, false);
    recordHit(2, 3, true);

    clearLastHitBy(1);

    expect(getLastHitBy().has(1)).toBe(false);
    expect(getLastHitBy().has(2)).toBe(true);
  });
});

describe("pickTimerWinner", () => {
  it("returns the winning slot index when one score is strictly higher", () => {
    const scores = { 0: 0, 1: 3, 2: 1, 3: 0 };
    const winner = pickTimerWinner(scores);
    expect(winner).toBe(1);
  });

  it('returns "draw" if all scores are 0', () => {
    const scores = { 0: 0, 1: 0, 2: 0, 3: 0 };
    const winner = pickTimerWinner(scores);
    expect(winner).toBe("draw");
  });

  it("returns the lowest slot index on a perfect tie with scores > 0", () => {
    const scores = { 0: 5, 1: 5, 2: 0, 3: 0 };
    const winner = pickTimerWinner(scores);
    expect(winner).toBe(0);
  });
});

describe("STORE-1 Lever A — store owns facade logic", () => {
  beforeEach(() => {
    resetRoundToLobby();
  });

  it("drops unused startRunning / startCountdown / endRound store methods", () => {
    const state = gameStore.getState();
    expect(state.startRunning).toBeUndefined();
    expect(state.startCountdown).toBeUndefined();
    expect(state.endRound).toBeUndefined();
  });

  it("clears leftover combo on syncRoundPhase countdown", () => {
    setLocalCombo(2, 9_999_999);
    expect(gameStore.getState().localComboTier).toBe(2);
    syncRoundPhase("countdown");
    expect(gameStore.getState().localComboTier).toBe(0);
    expect(gameStore.getState().roundPhase).toBe("countdown");
  });
});
