import { describe, expect, it, beforeEach } from "vitest";
import {
  getMatchStats,
  matchSuperlatives,
  recordKoForMatchStats,
  resetMatchStats,
  setMatchStatsLocalSlot,
  snapshotMatchStats,
} from "../../src/scoring/matchStats.js";
import { matchStatsReactor } from "../../src/scoring/koReactors.js";

function ko(partial) {
  return {
    isKill: true,
    victimSlotIndex: 1,
    attackerSlotIndex: 0,
    comboTier: 0,
    wasCritical: false,
    victimWasLeader: false,
    ...partial,
  };
}

describe("matchStats", () => {
  beforeEach(() => {
    resetMatchStats();
    setMatchStatsLocalSlot(0);
  });

  it("resets to zeros", () => {
    recordKoForMatchStats(ko({}));
    resetMatchStats();
    const s = getMatchStats();
    expect(s.kos).toBe(0);
    expect(s.deaths).toBe(0);
    expect(s.localKos).toBe(0);
  });

  it("records kills and deaths by slot", () => {
    recordKoForMatchStats(ko({ attackerSlotIndex: 0, victimSlotIndex: 2, isKill: true }));
    recordKoForMatchStats(ko({ attackerSlotIndex: null, victimSlotIndex: 0, isKill: false }));
    const s = getMatchStats();
    expect(s.kos).toBe(1);
    expect(s.kosBySlot[0]).toBe(1);
    expect(s.deaths).toBe(2);
    expect(s.localKos).toBe(1);
    expect(s.localDeaths).toBe(1);
  });

  it("tracks max combo and criticals for local kills only", () => {
    recordKoForMatchStats(ko({ comboTier: 2, wasCritical: true }));
    recordKoForMatchStats(ko({ comboTier: 3, victimWasLeader: true }));
    const s = getMatchStats();
    expect(s.maxComboTier).toBe(3);
    expect(s.criticalKos).toBe(1);
    expect(s.leaderDowns).toBe(1);
  });

  it("does not attribute peer/NPC combo or criticals to local superlatives", () => {
    // * Local is slot 0; peer kill on slot 1 must not mint RAMPAGE/CRITICAL chips.
    recordKoForMatchStats(
      ko({
        attackerSlotIndex: 1,
        victimSlotIndex: 2,
        comboTier: 3,
        wasCritical: true,
        victimWasLeader: true,
      }),
    );
    const s = getMatchStats();
    expect(s.kos).toBe(1);
    expect(s.localKos).toBe(0);
    expect(s.maxComboTier).toBe(0);
    expect(s.criticalKos).toBe(0);
    expect(s.leaderDowns).toBe(0);
    expect(matchSuperlatives(s).some((l) => /RAMPAGE|CARNAGE|CRITICAL|LEADER/i.test(l))).toBe(
      false,
    );
  });

  it("snapshot is isolated from later resets", () => {
    recordKoForMatchStats(ko({}));
    const snap = snapshotMatchStats();
    resetMatchStats();
    expect(snap.localKos).toBe(1);
    expect(getMatchStats().localKos).toBe(0);
  });

  it("superlatives prefer local story lines", () => {
    recordKoForMatchStats(ko({ comboTier: 2, wasCritical: true }));
    const lines = matchSuperlatives();
    expect(lines.some((l) => l.includes("KO"))).toBe(true);
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.length).toBeLessThanOrEqual(3);
  });

  it("matchStatsReactor records via dispatch path", () => {
    matchStatsReactor(ko({ attackerSlotIndex: 0, victimSlotIndex: 1 }), {
      localSlotIndex: 0,
      netSlots: [],
      colorHexForSlot: () => 0xffffff,
    });
    expect(getMatchStats().localKos).toBe(1);
  });
});
