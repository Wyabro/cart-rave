import { describe, expect, it } from "vitest";
import { localRoundProgressionEvents } from "../../src/progression/roundEvents.js";
import { PROGRESSION_EVENTS } from "../../src/progression/eventIds.js";

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
