import { describe, it, expect } from "vitest";
import { buildKOEvent, rebuildKOEvent } from "../src/scoring/koEvent.js";

// Minimal GameFlowDeps stub. Overrides let each test set scores / hit / carts.
function makeDeps(overrides = {}) {
  return {
    getRoundState: () => ({ startedAtMs: 1000, isSuddenDeath: false }),
    getRoundScores: () => ({ 0: 0, 1: 0, 2: 0, 3: 0 }),
    getLastHitBy: () => new Map(),
    getAllCarts: () => [{}, {}, {}, {}],
    getNetSlots: () => [{ kind: "human" }, { kind: "human" }, { kind: "human" }, { kind: "human" }],
    getLocalSlotIndex: () => -1,
    setLocalCombo: () => {},
    CONFIG: {
      scoring: { hitWindowMs: 2500 },
      record: { innerRadius: 5 },
      combo: {
        decayMs: 5000,
        tiers: {
          0: { multiplier: 1.0 },
          1: { multiplier: 1.5 },
          2: { multiplier: 2.0 },
          3: { multiplier: 3.0 },
        },
      },
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

  it("does NOT score center-hole on a solid-floor level (centerHole.enabled = false)", () => {
    const deps = makeDeps({
      CONFIG: {
        scoring: { hitWindowMs: 2500 },
        record: { innerRadius: 5, centerHole: { enabled: false } },
        combo: { decayMs: 5000, tiers: { 0: { multiplier: 1.0 } } },
      },
      getLastHitBy: () => hitMap(2, { attackerSlotIndex: 1, wasCritical: false, timestamp: NOW }),
    });
    const e = buildKOEvent(deps, 2, CENTER, NOW); // near origin, but no hole here
    expect(e.cause).toBe("outer_edge");
    expect(e.reward.base).toBe(1);
    expect(e.reward.total).toBe(1);
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

  it("scores a Storerooms corner-void kill as +2 via the level classifier", () => {
    const deps = makeDeps({
      CONFIG: {
        scoring: { hitWindowMs: 2500 },
        record: { innerRadius: 5, centerHole: { enabled: false } },
        combo: { decayMs: 5000, tiers: { 0: { multiplier: 1.0 } } },
      },
      classifyKillZone: (p) => (Math.abs(p.x) > 15 && Math.abs(p.z) > 15 ? "corner_void" : null),
      getLastHitBy: () => hitMap(2, { attackerSlotIndex: 1, wasCritical: false, timestamp: NOW }),
    });
    const inVoid = buildKOEvent(deps, 2, { x: 20, y: -20, z: -20 }, NOW);
    expect(inVoid.cause).toBe("corner_void");
    expect(inVoid.reward.base).toBe(2);
    expect(inVoid.reward.total).toBe(2);

    const offVoid = buildKOEvent(deps, 2, OUTER, NOW);
    expect(offVoid.cause).toBe("outer_edge");
    expect(offVoid.reward.base).toBe(1);
  });

  it("center hole wins classification over the level kill-zone classifier", () => {
    const deps = makeDeps({
      classifyKillZone: () => "corner_void",
      getLastHitBy: () => hitMap(2, { attackerSlotIndex: 1, wasCritical: false, timestamp: NOW }),
    });
    const e = buildKOEvent(deps, 2, CENTER, NOW);
    expect(e.cause).toBe("center_hole");
    expect(e.reward.base).toBe(2);
  });

  it("adds the high-ground bonus when the crediting ram came from the podium", () => {
    const deps = makeDeps({
      getLastHitBy: () => hitMap(2, { attackerSlotIndex: 1, wasCritical: false, fromPodium: true, timestamp: NOW }),
    });
    const e = buildKOEvent(deps, 2, OUTER, NOW);
    expect(e.reward.highGround).toBe(1);
    expect(e.reward.total).toBe(2); // base 1 + high ground 1
  });

  it("stacks high ground with critical/leader under the combo multiplier", () => {
    const carts = [{}, { comboTier: 2 }, {}, {}]; // attacker at x2.0
    const deps = makeDeps({
      getAllCarts: () => carts,
      getRoundScores: () => ({ 0: 0, 1: 0, 2: 3, 3: 0 }), // victim leads
      getLastHitBy: () => hitMap(2, { attackerSlotIndex: 1, wasCritical: true, fromPodium: true, timestamp: NOW }),
    });
    const e = buildKOEvent(deps, 2, OUTER, NOW);
    // (base 1 + critical 1 + leader 1 + high ground 1) * 2.0 = 8
    expect(e.reward.total).toBe(8);
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

  it("classifies the victim (kind + AI personality) from slots and carts", () => {
    const deps = makeDeps({
      getNetSlots: () => [{ kind: "human" }, { kind: "human" }, { kind: "npc" }, { kind: "human" }],
      getAllCarts: () => [{}, {}, { aiPersonality: { name: "aggressor" } }, {}],
      getLastHitBy: () => hitMap(2, { attackerSlotIndex: 1, wasCritical: false, timestamp: NOW }),
    });
    const e = buildKOEvent(deps, 2, OUTER, NOW);
    expect(e.victimKind).toBe("npc");
    expect(e.victimAiName).toBe("aggressor");
  });

  it("leaves victim classification null when slot/cart data is absent", () => {
    const deps = makeDeps({
      getNetSlots: () => [],
      getLastHitBy: () => hitMap(2, { attackerSlotIndex: 1, wasCritical: false, timestamp: NOW }),
    });
    const e = buildKOEvent(deps, 2, OUTER, NOW);
    expect(e.victimKind).toBe(null);
    expect(e.victimAiName).toBe(null);
  });

  it("carries round context (roundTimeMs, isSuddenDeath) onto the event", () => {
    const deps = makeDeps({
      getRoundState: () => ({ startedAtMs: 1000, isSuddenDeath: true }),
      getLastHitBy: () => hitMap(2, { attackerSlotIndex: 1, wasCritical: false, timestamp: NOW }),
    });
    const e = buildKOEvent(deps, 2, OUTER, NOW);
    expect(e.roundTimeMs).toBe(NOW - 1000);
    expect(e.isSuddenDeath).toBe(true);
    expect(e.impactSpeed).toBe(0); // hit carried no impactSpeed
    expect(e.isFinalBlow).toBe(false);
  });

  it("carries the crediting ram's impactSpeed from the hit record onto the event", () => {
    const deps = makeDeps({
      getLastHitBy: () => hitMap(2, { attackerSlotIndex: 1, wasCritical: true, impactSpeed: 28.6, timestamp: NOW }),
    });
    const e = buildKOEvent(deps, 2, OUTER, NOW);
    expect(e.impactSpeed).toBe(28.6);
    expect(e.wasCritical).toBe(true);
  });

  it("leaves impactSpeed at 0 for a self/environmental fall", () => {
    const e = buildKOEvent(makeDeps(), 2, OUTER, NOW);
    expect(e.isKill).toBe(false);
    expect(e.impactSpeed).toBe(0);
  });
});

describe("rebuildKOEvent (non-host replay)", () => {
  const clientDeps = {
    getNetSlots: () => [{ kind: "human" }, { kind: "human" }, { kind: "npc" }, { kind: "human" }],
    getAllCarts: () => [{}, {}, { aiPersonality: { name: "aggressor" } }, {}],
  };

  it("rebuilds an attributed kill from a wire fall record", () => {
    const msg = { slotId: 2, attackerSlot: 1, verb: "YEETED", comboTier: 2, comboMultiplier: 2.0 };
    const e = rebuildKOEvent(msg, clientDeps);
    expect(e.isKill).toBe(true);
    expect(e.attackerSlotIndex).toBe(1);
    expect(e.victimSlotIndex).toBe(2);
    expect(e.verb).toBe("YEETED");
    expect(e.comboTier).toBe(2);
    expect(e.comboMultiplier).toBe(2.0);
    // victim classification recomputed from this client's own slots/carts
    expect(e.victimKind).toBe("npc");
    expect(e.victimAiName).toBe("aggressor");
  });

  it("rebuilds a self fall (null attacker) and keeps the wire verb", () => {
    const msg = { slotId: 0, attackerSlot: null, verb: "SUDDEN DEATH" };
    const e = rebuildKOEvent(msg, clientDeps);
    expect(e.isKill).toBe(false);
    expect(e.attackerSlotIndex).toBe(null);
    expect(e.cause).toBe("self");
    expect(e.verb).toBe("SUDDEN DEATH");
  });

  it("defaults the verb when the wire record omits it", () => {
    expect(rebuildKOEvent({ slotId: 0, attackerSlot: 1 }, clientDeps).verb).toBe("RAMMED");
    expect(rebuildKOEvent({ slotId: 0, attackerSlot: null }, clientDeps).verb).toBe("FELL OFF");
  });

  it("consumes presentation context (cause, flags, reward) from the wire when present", () => {
    const msg = {
      slotId: 2,
      attackerSlot: 1,
      comboTier: 2,
      comboMultiplier: 2.0,
      cause: "corner_void",
      wasCritical: true,
      victimWasLeader: true,
      isFinalBlow: true,
      reward: { base: 2, critical: 1, leader: 1, highGround: 0, multiplier: 2.0, total: 8 },
    };
    const e = rebuildKOEvent(msg, clientDeps);
    expect(e.cause).toBe("corner_void");
    expect(e.wasCritical).toBe(true);
    expect(e.victimWasLeader).toBe(true);
    expect(e.isFinalBlow).toBe(true);
    expect(e.reward.total).toBe(8);
  });

  it("defaults presentation context to neutral for older wire records", () => {
    const e = rebuildKOEvent({ slotId: 2, attackerSlot: 1, comboMultiplier: 1.5 }, clientDeps);
    expect(e.cause).toBe("outer_edge");
    expect(e.wasCritical).toBe(false);
    expect(e.victimWasLeader).toBe(false);
    expect(e.isFinalBlow).toBe(false);
    expect(e.isSuddenDeath).toBe(false);
    expect(e.reward.total).toBe(0);
    expect(e.reward.multiplier).toBe(1.5);
  });

  it("carries isSuddenDeath from the wire when the host stamped it", () => {
    const e = rebuildKOEvent(
      { slotId: 2, attackerSlot: 0, verb: "SUDDEN DEATH", isSuddenDeath: true, isFinalBlow: true },
      clientDeps,
    );
    expect(e.isSuddenDeath).toBe(true);
    expect(e.isKill).toBe(true);
    expect(e.isFinalBlow).toBe(true);
    expect(e.verb).toBe("SUDDEN DEATH");
  });
});
