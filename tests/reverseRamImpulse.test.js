// @vitest-environment happy-dom
// reverseRamImpulse.test.js — the AI-1 dial-back: attribution and knockback are DECOUPLED.
//
// * Knockback + crit read the rammer's LIVE (post-collision) velocity, so forward-ram feel
// * matches the pre-fix game. Attribution runs for the already-qualified pair regardless, so a
// * reverse shove (knocked the victim off via raw contact, ~0 live velocity) still scores.

import { describe, it, expect, vi, beforeEach } from "vitest";

// * Spy recordHit; keep the rest of the store real (no module-load side effects).
vi.mock("../src/gameState.js", async (importActual) => {
  const actual = await importActual();
  return { ...actual, recordHit: vi.fn() };
});

import { applyRammingImpulse } from "../src/simulation.js";
import * as GameState from "../src/gameState.js";

/** Cart whose body reports the given LIVE (post-step) linvel — what the impulse now reads. */
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
});

describe("applyRammingImpulse — decoupled attribution vs knockback", () => {
  it("credits a reverse shove (live velocity ~0) with NO ram impulse", () => {
    // * Post-collision the reverse velocity is arrested (~0). The victim was already knocked off
    // * by raw contact; the ram impulse must NOT fire, but the KO must still be credited.
    const shover = ramCart(0, SHOVER_POS, { x: 0, y: 0, z: 0.1 });
    const victim = ramCart(1, VICTIM_POS, { x: 0, y: 0, z: 0 });

    applyRammingImpulse(shover, victim, stateOf(SHOVER_POS), stateOf(VICTIM_POS), {}, true, 1000);

    // Attribution fires — the shover is credited.
    expect(GameState.recordHit).toHaveBeenCalledTimes(1);
    const [victimSlot, attackerSlot, wasCritical, impactSpeed] = GameState.recordHit.mock.calls[0];
    expect(victimSlot).toBe(1);
    expect(attackerSlot).toBe(0);
    expect(wasCritical).toBe(false);
    expect(impactSpeed).toBeCloseTo(0.1, 5);
    // No knockback impulse — raw contact already did the shoving.
    expect(victim.pendingRam).toBeUndefined();
    // Combo stays tied to real knockback — a contactless shove must not inflate the streak.
    expect(shover.comboTier).toBe(0);
  });

  it("applies a knockback impulse for a forward ram, from live velocity", () => {
    // * Live velocity is a real forward closing speed → the ram impulse fires (old feel).
    const rammer = ramCart(0, SHOVER_POS, { x: 0, y: 0, z: -8 }); // toward victim (−Z)
    const victim = ramCart(1, VICTIM_POS, { x: 0, y: 0, z: 0 });

    applyRammingImpulse(rammer, victim, stateOf(SHOVER_POS), stateOf(VICTIM_POS), {}, true, 1000);

    expect(victim.pendingRam).toBeDefined();
    expect(victim.pendingRam.impulse.z).toBeLessThan(0); // pushed away, toward −Z
    const [, , , impactSpeed] = GameState.recordHit.mock.calls[0];
    expect(impactSpeed).toBeCloseTo(8, 5); // live speed, not a pre-step value
    // A real knockback ram DOES build combo.
    expect(rammer.comboTier).toBe(1);
  });

  it("derives critical from the live impact speed", () => {
    const fast = ramCart(0, SHOVER_POS, { x: 0, y: 0, z: -18 }); // above criticalVelocityThreshold (16)
    const victim = ramCart(1, VICTIM_POS, { x: 0, y: 0, z: 0 });

    applyRammingImpulse(fast, victim, stateOf(SHOVER_POS), stateOf(VICTIM_POS), {}, true, 1000);

    const [, , wasCritical] = GameState.recordHit.mock.calls[0];
    expect(wasCritical).toBe(true);
  });

  it("does not credit a fallen/respawning victim", () => {
    const rammer = ramCart(0, SHOVER_POS, { x: 0, y: 0, z: -8 });
    const victim = ramCart(1, VICTIM_POS, { x: 0, y: 0, z: 0 });
    victim.respawnAtMs = 123;

    applyRammingImpulse(rammer, victim, stateOf(SHOVER_POS), stateOf(VICTIM_POS), {}, true, 1000);

    expect(GameState.recordHit).not.toHaveBeenCalled();
  });
});
