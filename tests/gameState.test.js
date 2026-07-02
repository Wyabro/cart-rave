import { describe, it, expect } from "vitest";
import { pickTimerWinner } from "../src/gameState.js";

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
