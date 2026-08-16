// gameStore.test.js — addScore Sudden Death commit ordering (SD-SCORE-STALE-1).
// The SD win callback (wired to endRound) must observe the committed score: podium
// stats (recordPodiumStats) and the host_round broadcast (sendHostRound) both read
// getRoundScores()/getRoundState().scores synchronously inside that callback.

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  addScore,
  getLastScoringHitAt,
  getRoundScores,
  getRoundState,
  resetRoundToLobby,
  setSuddenDeath,
  setSuddenDeathWinCallback,
} from "../../src/stores/gameStore.js";
import { gameStore } from "../../src/stores/gameStore.js";

beforeEach(() => {
  // * resetRoundToLobby does NOT clear suddenDeathWinCallback (module singleton) —
  // * a stale callback from a prior case must never fire.
  resetRoundToLobby();
  setSuddenDeathWinCallback(null);
});

describe("addScore Sudden Death win (SD-SCORE-STALE-1)", () => {
  it("commits the score BEFORE the win callback — endRound's reads see the final point", () => {
    setSuddenDeath(true);
    let commitObservedBySubscriber = false;
    let callbackSlot = null;
    let callbackScores = null;
    let callbackRoundState = null;
    let callbackHitAt = 0;
    let callbackRan = false;

    // * Subscriber fires synchronously inside set(updates) — pins the commit-before-
    // * callback order. If the order regresses, commitObservedBySubscriber is false
    // * when the callback runs.
    const unsubscribe = gameStore.subscribe((state) => {
      if (state.roundScores[2] === 1) commitObservedBySubscriber = true;
    });
    setSuddenDeathWinCallback((scoringSlot) => {
      callbackRan = true;
      callbackSlot = scoringSlot;
      // * recordPodiumStats reads getRoundScores() (roundLifecycle.js)...
      callbackScores = getRoundScores();
      // * sendHostRound serializes getRoundState().scores (netcode.js)...
      callbackRoundState = getRoundState();
      // * pickTimerWinner's tiebreak input — same commit must carry the hit stamp.
      callbackHitAt = getLastScoringHitAt()[scoringSlot] ?? 0;
    });

    const ended = addScore(2, 1);
    unsubscribe();

    expect(ended).toBe(true);
    expect(callbackRan).toBe(true);
    expect(commitObservedBySubscriber).toBe(true);
    expect(callbackSlot).toBe(2);
    expect(callbackScores[2]).toBe(1);
    expect(callbackRoundState.scores[2]).toBe(1);
    expect(callbackHitAt).toBeGreaterThan(0);
    // * Store remains committed after the callback (host UI self-corrects off the live store).
    expect(getRoundScores()[2]).toBe(1);
    expect(gameStore.getState().roundScores).toEqual({ 0: 0, 1: 0, 2: 1, 3: 0 });
  });

  it("accumulates on the winner and leaves other slots untouched", () => {
    setSuddenDeath(true);
    let saw = null;
    setSuddenDeathWinCallback((slot) => {
      saw = slot;
    });

    addScore(2, 1);
    expect(saw).toBe(2);
    expect(getRoundScores()).toEqual({ 0: 0, 1: 0, 2: 1, 3: 0 });

    addScore(2, 1);
    expect(getRoundScores()).toEqual({ 0: 0, 1: 0, 2: 2, 3: 0 });
    expect(gameStore.getState().roundScores[1]).toBe(0);
  });

  it("does not fire the callback outside Sudden Death — score still commits", () => {
    const cb = vi.fn();
    setSuddenDeathWinCallback(cb);

    const ended = addScore(1, 2);

    expect(ended).toBe(false);
    expect(cb).not.toHaveBeenCalled();
    expect(getRoundScores()).toEqual({ 0: 0, 1: 2, 2: 0, 3: 0 });
  });

  it("suppressSuddenDeathWin commits without ending Sudden Death", () => {
    setSuddenDeath(true);
    const cb = vi.fn();
    setSuddenDeathWinCallback(cb);

    const ended = addScore(0, 3, true);

    expect(ended).toBe(false);
    expect(cb).not.toHaveBeenCalled();
    expect(gameStore.getState().isSuddenDeath).toBe(true);
    expect(getRoundScores()).toEqual({ 0: 3, 1: 0, 2: 0, 3: 0 });
  });

  it("zero-point awards never fire the win callback", () => {
    setSuddenDeath(true);
    const cb = vi.fn();
    setSuddenDeathWinCallback(cb);

    const ended = addScore(1, 0);

    expect(ended).toBe(false);
    expect(cb).not.toHaveBeenCalled();
    expect(getRoundScores()).toEqual({ 0: 0, 1: 0, 2: 0, 3: 0 });
  });
});
