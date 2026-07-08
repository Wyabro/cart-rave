import { describe, it, expect } from "vitest";
import { buildKOEvent } from "../src/scoring/koEvent.js";

// Minimal GameFlowDeps stub. Overrides let each test set scores / hit / carts.
function makeDeps(overrides = {}) {
  return {
    getRoundState: () => ({ startedAtMs: 1000, isSuddenDeath: false }),
    getRoundScores: () => ({ 0: 0, 1: 0, 2: 0, 3: 0 }),
    getLastHitBy: () => new Map(),
    getAllCarts: () => [{}, {}, {}, {}],
    getLocalSlotIndex: () => -1,
    setLocalCombo: () => {},
    CONFIG: {
      scoring: { hitWindowMs: 2500 },
      record: { innerRadius: 5 },
      combo: { decayMs: 5000 },
    },
    hud: {
      pickSelfDeathVerb: () => "FELL OFF",
      pickKillFeedVerb: () => "RAMMED",
    },
    ...overrides,
  };
}

const NOW = 5000;
const OUTER = { x: 10, y: -20, z: 0 }; // dist 10 >= innerRadius(5)+2 -> outer edge
const CENTER = { x: 0, y: -20, z: 0 }; // dist 0 < 7 -> center hole

function hitMap(victim, hit) {
  return new Map([[victim, hit]]);
}

describe("buildKOEvent", () => {
  it("reports a self/environmental fall when there is no recent hit", () => {
    const e = buildKOEvent(makeDeps(), 2, OUTER, NOW);
    expect(e.isKill).toBe(false);
    expect(e.attackerSlotIndex).toBe(null);
    expect(e.cause).toBe("self");
    expect(e.reward.total).toBe(0);
    expect(e.verb).toBe("FELL OFF");
  });

  it("treats a hit older than the window as a self fall", () => {
    const deps = makeDeps({
      getLastHitBy: () => hitMap(2, { attackerSlotIndex: 1, wasCritical: false, timestamp: NOW - 3000 }),
    });
    const e = buildKOEvent(deps, 2, OUTER, NOW);
    expect(e.isKill).toBe(false);
    expect(e.cause).toBe("self");
  });

  it("scores an outer-edge kill as +1 with no bonuses", () => {
    const deps = makeDeps({
      getLastHitBy: () => hitMap(2, { attackerSlotIndex: 1, wasCritical: false, timestamp: NOW }),
    });
    const e = buildKOEvent(deps, 2, OUTER, NOW);
    expect(e.isKill).toBe(true);
    expect(e.attackerSlotIndex).toBe(1);
    expect(e.cause).toBe("outer_edge");
    expect(e.reward).toMatchObject({ base: 1, critical: 0, leader: 0, multiplier: 1, total: 1 });
    expect(e.verb).toBe("RAMMED");
  });

  it("scores a center-hole kill as +2", () => {
    const deps = makeDeps({
      getLastHitBy: () => hitMap(2, { attackerSlotIndex: 1, wasCritical: false, timestamp: NOW }),
    });
    const e = buildKOEvent(deps, 2, CENTER, NOW);
    expect(e.cause).toBe("center_hole");
    expect(e.reward.base).toBe(2);
    expect(e.reward.total).toBe(2);
  });

  it("adds the critical bonus when the hit was critical", () => {
    const deps = makeDeps({
      getLastHitBy: () => hitMap(2, { attackerSlotIndex: 1, wasCritical: true, timestamp: NOW }),
    });
    const e = buildKOEvent(deps, 2, OUTER, NOW);
    expect(e.wasCritical).toBe(true);
    expect(e.reward.critical).toBe(1);
    expect(e.reward.total).toBe(2); // base 1 + critical 1
  });

  it("adds the leader bonus and flags victimWasLeader when the victim is the sole leader", () => {
    const deps = makeDeps({
      getRoundScores: () => ({ 0: 0, 1: 0, 2: 3, 3: 0 }),
      getLastHitBy: () => hitMap(2, { attackerSlotIndex: 1, wasCritical: false, timestamp: NOW }),
    });
    const e = buildKOEvent(deps, 2, OUTER, NOW);
    expect(e.victimWasLeader).toBe(true);
    expect(e.reward.leader).toBe(1);
    expect(e.reward.total).toBe(2); // base 1 + leader 1
  });

  it("does not grant the leader bonus on a tied lead", () => {
    const deps = makeDeps({
      getRoundScores: () => ({ 0: 0, 1: 0, 2: 3, 3: 3 }),
      getLastHitBy: () => hitMap(2, { attackerSlotIndex: 1, wasCritical: false, timestamp: NOW }),
    });
    const e = buildKOEvent(deps, 2, OUTER, NOW);
    expect(e.victimWasLeader).toBe(false);
    expect(e.reward.leader).toBe(0);
  });

  it("applies the attacker's combo multiplier to the stacked base", () => {
    const carts = [{}, { comboTier: 2 }, {}, {}]; // attacker slot 1 at tier 2 -> x2.0
    const deps = makeDeps({
      getAllCarts: () => carts,
      getLastHitBy: () => hitMap(2, { attackerSlotIndex: 1, wasCritical: true, timestamp: NOW }),
    });
    const e = buildKOEvent(deps, 2, CENTER, NOW);
    expect(e.comboTier).toBe(2);
    expect(e.comboMultiplier).toBe(2);
    // (base 2 + critical 1) * 2.0 = 6
    expect(e.reward.total).toBe(6);
  });

  it("reports victimWasLeader even on a self fall (no attribution)", () => {
    const deps = makeDeps({
      getRoundScores: () => ({ 0: 0, 1: 0, 2: 4, 3: 0 }),
    });
    const e = buildKOEvent(deps, 2, OUTER, NOW);
    expect(e.isKill).toBe(false);
    expect(e.victimWasLeader).toBe(true);
    expect(e.reward.leader).toBe(0); // no points on a self fall
  });

  it("carries round context (roundTimeMs, isSuddenDeath) onto the event", () => {
    const deps = makeDeps({
      getRoundState: () => ({ startedAtMs: 1000, isSuddenDeath: true }),
      getLastHitBy: () => hitMap(2, { attackerSlotIndex: 1, wasCritical: false, timestamp: NOW }),
    });
    const e = buildKOEvent(deps, 2, OUTER, NOW);
    expect(e.roundTimeMs).toBe(NOW - 1000);
    expect(e.isSuddenDeath).toBe(true);
    expect(e.impactSpeed).toBe(0); // not captured until step 5
    expect(e.isFinalBlow).toBe(false);
  });
});
