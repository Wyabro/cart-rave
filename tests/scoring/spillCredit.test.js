import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/stores/challengeStore.js", () => ({
  ChallengeTracker: { record: vi.fn() },
}));

import { ChallengeTracker } from "../../src/stores/challengeStore.js";
import {
  getMatchStats,
  resetMatchStats,
} from "../../src/scoring/matchStats.js";
import {
  creditLocalSpillCause,
  resolveRecentRammer,
  shouldCreditLocalSpill,
} from "../../src/scoring/spillCredit.js";

describe("resolveRecentRammer", () => {
  const nowMs = 10_000;
  const hitWindowMs = 3000;

  it("returns the in-window other-slot rammer", () => {
    const lastHitBy = new Map([
      [2, { attackerSlotIndex: 0, timestamp: nowMs - 500 }],
    ]);
    expect(resolveRecentRammer(lastHitBy, 2, nowMs, hitWindowMs)).toBe(0);
  });

  it("returns null for a self-tip stamp", () => {
    const lastHitBy = new Map([
      [1, { attackerSlotIndex: 1, timestamp: nowMs - 100 }],
    ]);
    expect(resolveRecentRammer(lastHitBy, 1, nowMs, hitWindowMs)).toBeNull();
  });

  it("returns null when the hit is missing or expired", () => {
    expect(resolveRecentRammer(new Map(), 2, nowMs, hitWindowMs)).toBeNull();
    const stale = new Map([
      [2, { attackerSlotIndex: 0, timestamp: nowMs - 10000 }],
    ]);
    expect(resolveRecentRammer(stale, 2, nowMs, hitWindowMs)).toBeNull();
  });
});

describe("shouldCreditLocalSpill", () => {
  it("credits when attackerSlotIndex equals localSlot, including slot 0", () => {
    expect(shouldCreditLocalSpill(0, 0)).toBe(true);
    expect(shouldCreditLocalSpill(2, 2)).toBe(true);
  });

  it("rejects null, omitted, and another slot", () => {
    expect(shouldCreditLocalSpill(null, 0)).toBe(false);
    expect(shouldCreditLocalSpill(undefined, 0)).toBe(false);
    expect(shouldCreditLocalSpill(1, 0)).toBe(false);
  });
});

describe("creditLocalSpillCause", () => {
  beforeEach(() => {
    vi.mocked(ChallengeTracker.record).mockClear();
    resetMatchStats();
  });

  it("records one SPILL event and one match-stat spill", () => {
    creditLocalSpillCause();
    expect(ChallengeTracker.record).toHaveBeenCalledTimes(1);
    expect(ChallengeTracker.record).toHaveBeenCalledWith("spill");
    expect(getMatchStats().localSpills).toBe(1);
  });
});
