// @vitest-environment happy-dom
// reconcileComboSideEffects.test.js — non-host reconcile must not re-count combo/spill
// challenges when replaying pending inputs (applyRammingImpulse isReconcileReplay gate).

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../src/gameState.js", async (importActual) => {
  const actual = await importActual();
  return {
    ...actual,
    recordHit: vi.fn(),
    setLocalCombo: vi.fn(),
  };
});

vi.mock("../src/stores/challengeStore.js", () => ({
  ChallengeTracker: { record: vi.fn() },
}));

import { applyRammingImpulse } from "../src/simulation.js";
import * as GameState from "../src/gameState.js";
import { ChallengeTracker } from "../src/stores/challengeStore.js";

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
    expect(ChallengeTracker.record).toHaveBeenCalledWith("spill");
  });

  it("isReconcileReplay suppresses combo increment and challenge records", () => {
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

    // * Knockback still applies (prediction correctness); progression side effects do not.
    expect(victim.pendingRam).toBeDefined();
    expect(rammer.comboTier).toBe(1);
    expect(GameState.setLocalCombo).not.toHaveBeenCalled();
    expect(ChallengeTracker.record).not.toHaveBeenCalled();
  });
});
