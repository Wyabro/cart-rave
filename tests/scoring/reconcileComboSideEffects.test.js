// @vitest-environment happy-dom
// reconcileComboSideEffects.test.js — non-host reconcile must not re-count combo/spill
// challenges when replaying pending inputs (applyRammingImpulse isReconcileReplay gate).

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/stores/gameStore.js", async (importActual) => {
  const actual = await importActual();
  return {
    ...actual,
    recordHit: vi.fn(),
    setLocalCombo: vi.fn(),
  };
});

vi.mock("../../src/stores/challengeStore.js", () => ({
  ChallengeTracker: { record: vi.fn() },
}));

import { applyRammingImpulse } from "../../src/simulation.js";
import * as GameState from "../../src/stores/gameStore.js";
import { ChallengeTracker } from "../../src/stores/challengeStore.js";
import { creditLocalSpillCause } from "../../src/scoring/spillCredit.js";
import { getMatchStats, resetMatchStats } from "../../src/scoring/matchStats.js";

function ramCart(slotIndex, pos, liveLinvel) {
  return {
    slotIndex,
    body: {
      translation: () => ({ ...pos }),
      linvel: () => ({ ...liveLinvel }),
      mass: () => 20,
    },
    respawnAtMs: null,
    isSuddenDeathSpectator: false,
    ramBoostActiveUntilMs: 0,
    comboTier: 0,
    hasSpilled: false,
  };
}

function stateOf(pos) {
  return { pos: { ...pos }, linvel: { x: 0, y: 0, z: 0 } };
}

const SHOVER_POS = { x: 0, y: 0, z: 5 };
const VICTIM_POS = { x: 0, y: 0, z: 0 };

beforeEach(() => {
  vi.mocked(GameState.recordHit).mockClear();
  vi.mocked(GameState.setLocalCombo).mockClear();
  vi.mocked(ChallengeTracker.record).mockClear();
  resetMatchStats();
});

describe("applyRammingImpulse — reconcile replay side effects", () => {
  it("live non-host path still builds combo and records challenges", () => {
    const rammer = ramCart(0, SHOVER_POS, { x: 0, y: 0, z: -8 });
    const victim = ramCart(1, VICTIM_POS, { x: 0, y: 0, z: 0 });
    rammer.comboTier = 1; // next hit reaches SAVAGE (tier 2)

    applyRammingImpulse(
      rammer,
      victim,
      stateOf(SHOVER_POS),
      stateOf(VICTIM_POS),
      { localCart: rammer },
      false,
      1000,
    );

    expect(rammer.comboTier).toBe(2);
    expect(GameState.setLocalCombo).toHaveBeenCalled();
    expect(ChallengeTracker.record).toHaveBeenCalledWith("combo_t2");
    expect(ChallengeTracker.record).not.toHaveBeenCalledWith("spill");
  });

  it("three qualifying rams on an upright victim record 0 SPILL; credit helper ticks once", () => {
    const rammer = ramCart(0, SHOVER_POS, { x: 0, y: 0, z: -8 });
    const victim = ramCart(1, VICTIM_POS, { x: 0, y: 0, z: 0 });

    for (let i = 0; i < 3; i += 1) {
      applyRammingImpulse(
        rammer,
        victim,
        stateOf(SHOVER_POS),
        stateOf(VICTIM_POS),
        { localCart: rammer },
        false,
        1000 + i,
      );
    }

    expect(ChallengeTracker.record).not.toHaveBeenCalledWith("spill");
    expect(getMatchStats().localSpills).toBe(0);

    creditLocalSpillCause();
    expect(ChallengeTracker.record).toHaveBeenCalledWith("spill");
    expect(getMatchStats().localSpills).toBe(1);
  });

  it("isReconcileReplay does not create a second physical ram or progression event", () => {
    const rammer = ramCart(0, SHOVER_POS, { x: 0, y: 0, z: -8 });
    const victim = ramCart(1, VICTIM_POS, { x: 0, y: 0, z: 0 });
    rammer.comboTier = 1;

    applyRammingImpulse(
      rammer,
      victim,
      stateOf(SHOVER_POS),
      stateOf(VICTIM_POS),
      { localCart: rammer, isReconcileReplay: true },
      false,
      1000,
    );

    // The remote cart is at a display-delayed pose during replay. A new ram here
    // is not a replay of host physics and can launch the local cart on every snap.
    expect(victim.pendingRam).toBeUndefined();
    expect(rammer.comboTier).toBe(1);
    expect(GameState.setLocalCombo).not.toHaveBeenCalled();
    expect(ChallengeTracker.record).not.toHaveBeenCalled();
  });

  it("does not launch the local victim from a boosted remote replay contact", () => {
    const rammer = ramCart(1, SHOVER_POS, { x: 0, y: 0, z: -20 });
    const localVictim = ramCart(0, VICTIM_POS, { x: 0, y: 0, z: 0 });
    rammer.ramBoostActiveUntilMs = 2000;

    applyRammingImpulse(
      rammer, localVictim, stateOf(SHOVER_POS), stateOf(VICTIM_POS),
      { localCart: localVictim, isReconcileReplay: true }, false, 1000,
    );

    expect(localVictim.pendingRam).toBeUndefined();
    expect(GameState.recordHit).not.toHaveBeenCalled();
  });
});
