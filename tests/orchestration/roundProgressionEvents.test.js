import { describe, expect, it } from "vitest";
import {
  hostEndedPodiumRound,
  localRoundProgressionEvents,
  shouldCreditPodiumFromRoundMsg,
} from "../../src/progression/roundEvents.js";
import { PROGRESSION_EVENTS } from "../../src/progression/eventIds.js";

const STARTED = 1_700_000_000_000;

describe("localRoundProgressionEvents", () => {
  it("credits completion, win, and scoring for a scoring winner", () => {
    expect(localRoundProgressionEvents({
      localSlotIndex: 2,
      winnerSlotIndex: 2,
      localScore: 4,
    })).toEqual([
      PROGRESSION_EVENTS.ROUND_COMPLETE,
      PROGRESSION_EVENTS.ROUND_WIN,
      PROGRESSION_EVENTS.ROUND_SCORED,
    ]);
  });

  it("credits completion and scoring for a scoring loser", () => {
    expect(localRoundProgressionEvents({
      localSlotIndex: 1,
      winnerSlotIndex: 3,
      localScore: 2,
    })).toEqual([
      PROGRESSION_EVENTS.ROUND_COMPLETE,
      PROGRESSION_EVENTS.ROUND_SCORED,
    ]);
  });

  it("credits completion for a zero-score participant in a draw", () => {
    expect(localRoundProgressionEvents({
      localSlotIndex: 0,
      winnerSlotIndex: "draw",
      localScore: 0,
    })).toEqual([PROGRESSION_EVENTS.ROUND_COMPLETE]);
  });

  it("does not credit spectators", () => {
    expect(localRoundProgressionEvents({
      localSlotIndex: -1,
      winnerSlotIndex: 0,
      localScore: 8,
    })).toEqual([]);
  });
});

describe("hostEndedPodiumRound", () => {
  it("is true only when latch sends match this startedAtMs", () => {
    expect(hostEndedPodiumRound({ startedAtMs: STARTED, sends: 1 }, STARTED)).toBe(true);
    expect(hostEndedPodiumRound({ startedAtMs: STARTED, sends: 2 }, STARTED)).toBe(true);
  });

  it("is false for missing latch, zero sends, or a different round", () => {
    expect(hostEndedPodiumRound(null, STARTED)).toBe(false);
    expect(hostEndedPodiumRound({ startedAtMs: STARTED, sends: 0 }, STARTED)).toBe(false);
    expect(hostEndedPodiumRound({ startedAtMs: STARTED + 1, sends: 1 }, STARTED)).toBe(false);
    expect(hostEndedPodiumRound({ startedAtMs: STARTED, sends: 1 }, 0)).toBe(false);
  });
});

describe("shouldCreditPodiumFromRoundMsg", () => {
  it("guest running→podium validated credits once", () => {
    expect(shouldCreditPodiumFromRoundMsg({
      isHost: false,
      prevPhase: "running",
      newPhase: "podium",
      validated: true,
      hostEndedThisRound: false,
    })).toBe(true);
  });

  it("guest unvalidated or non-running prevPhase does not credit", () => {
    expect(shouldCreditPodiumFromRoundMsg({
      isHost: false,
      prevPhase: "running",
      newPhase: "podium",
      validated: false,
      hostEndedThisRound: false,
    })).toBe(false);
    expect(shouldCreditPodiumFromRoundMsg({
      isHost: false,
      prevPhase: "lobby",
      newPhase: "podium",
      validated: true,
      hostEndedThisRound: false,
    })).toBe(false);
  });

  it("host already on podium + validated echo credits when they ended the round", () => {
    expect(shouldCreditPodiumFromRoundMsg({
      isHost: true,
      prevPhase: "podium",
      newPhase: "podium",
      validated: true,
      hostEndedThisRound: true,
    })).toBe(true);
  });

  it("host after reject rollback (running→podium) still credits the accepted retry echo", () => {
    expect(shouldCreditPodiumFromRoundMsg({
      isHost: true,
      prevPhase: "running",
      newPhase: "podium",
      validated: true,
      hostEndedThisRound: true,
    })).toBe(true);
  });

  it("host podium echo without an endRound latch does not credit", () => {
    expect(shouldCreditPodiumFromRoundMsg({
      isHost: true,
      prevPhase: "podium",
      newPhase: "podium",
      validated: true,
      hostEndedThisRound: false,
    })).toBe(false);
  });

  it("host unvalidated or non-podium echo does not credit", () => {
    expect(shouldCreditPodiumFromRoundMsg({
      isHost: true,
      prevPhase: "podium",
      newPhase: "podium",
      validated: false,
      hostEndedThisRound: true,
    })).toBe(false);
    expect(shouldCreditPodiumFromRoundMsg({
      isHost: true,
      prevPhase: "podium",
      newPhase: "running",
      validated: true,
      hostEndedThisRound: true,
    })).toBe(false);
  });
});
