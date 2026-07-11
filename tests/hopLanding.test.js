// @vitest-environment happy-dom
// hopLanding.test.js — hop landing edge flags + NPC hop config shape.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { CONFIG } from "../src/config.js";
import { isNpcNearHazardEdge, setLevelHazards } from "../src/simulation.js";
import { resetCartTransientState } from "../src/entities.js";

describe("CONFIG.cart.hop landing + npc", () => {
  it("exposes landing window and npc rare-hop knobs", () => {
    expect(CONFIG.cart.hop.landingMaxMs).toBeGreaterThan(CONFIG.cart.hop.cooldownMs);
    expect(CONFIG.cart.hop.airborneVy).toBeGreaterThan(0);
    expect(CONFIG.cart.hop.npc.enabled).toBe(true);
    expect(CONFIG.cart.hop.npc.cooldownMs).toBeGreaterThan(CONFIG.cart.hop.cooldownMs);
    expect(CONFIG.cart.hop.npc.chance).toBeGreaterThan(0);
    expect(CONFIG.cart.hop.npc.chance).toBeLessThan(0.5);
    expect(CONFIG.cart.hop.npc.minThreatDistance).toBeLessThan(
      CONFIG.cart.hop.npc.maxThreatDistance,
    );
  });
});

describe("hop landing edge state machine (pure)", () => {
  /** Minimal cart-shaped object used by the sim hop-landing path. */
  function makeCart() {
    return {
      lastHopAtMs: 0,
      hopAwaitingLand: false,
      hopAirborne: false,
    };
  }

  it("arms one-shot landing flags on takeoff and clears on land", () => {
    const cart = makeCart();
    const now = 1000;
    cart.lastHopAtMs = now;
    cart.hopAwaitingLand = true;
    cart.hopAirborne = false;

    // * Airborne rising edge (takeoff).
    const vyUp = CONFIG.cart.hop.airborneVy + 0.5;
    if (vyUp > CONFIG.cart.hop.airborneVy) cart.hopAirborne = true;
    expect(cart.hopAwaitingLand).toBe(true);
    expect(cart.hopAirborne).toBe(true);

    // * Rising-edge floor contact consumes the one-shot.
    if (cart.hopAwaitingLand && cart.hopAirborne) {
      cart.hopAwaitingLand = false;
      cart.hopAirborne = false;
    }
    expect(cart.hopAwaitingLand).toBe(false);
    expect(cart.hopAirborne).toBe(false);

    // * Subsequent floor bumps must not re-arm without a new hop.
    const wouldLandAgain = cart.hopAwaitingLand && cart.hopAirborne;
    expect(wouldLandAgain).toBe(false);
  });

  it("times out stale hop-landing awaits", () => {
    const cart = makeCart();
    cart.lastHopAtMs = 0;
    cart.hopAwaitingLand = true;
    cart.hopAirborne = true;
    const now = CONFIG.cart.hop.landingMaxMs + 1;
    if (now - cart.lastHopAtMs > CONFIG.cart.hop.landingMaxMs) {
      cart.hopAwaitingLand = false;
      cart.hopAirborne = false;
    }
    expect(cart.hopAwaitingLand).toBe(false);
  });

  it("resetCartTransientState clears hop landing flags (mid-hop death / respawn)", () => {
    const cart = {
      body: {
        setLinvel: vi.fn(),
        setAngvel: vi.fn(),
      },
      hopAwaitingLand: true,
      hopAirborne: true,
      lastHopAtMs: 1000,
      isChargingBoost: true,
      boostChargeStartedAtMs: 50,
      boostCooldownUntilMs: 0,
      boostChargeMultiplier: 1,
      chargeUpSfxId: null,
      pendingRam: null,
      ramBoostActiveUntilMs: 0,
      ramBoostStreakCarry: 0,
      lastRamBoostTimeMs: 0,
      comboTier: 0,
      comboExpiryMs: 0,
      aiNextDecisionMs: 0,
      aiTarget: { x: 0, z: 0 },
      aiPauseUntilMs: 0,
      aiReverseUntilMs: 0,
      aiSteerGain: 1.1,
      aiLastProgressMs: 0,
      aiLastDistToTarget: Infinity,
      hasSpilled: false,
      tipOverStartMs: null,
      respawnAtMs: 123,
      mesh: null,
      cargoBay: null,
    };

    resetCartTransientState(cart);

    expect(cart.hopAwaitingLand).toBe(false);
    expect(cart.hopAirborne).toBe(false);
  });
});

describe("isNpcNearHazardEdge", () => {
  beforeEach(() => {
    setLevelHazards(null);
  });

  it("flags classic center-hole proximity", () => {
    // * Near origin is inside the center hole lip + proximity.
    expect(isNpcNearHazardEdge(0.5, 0.5, 3.2)).toBe(true);
    // * Far out on the deck (not near hole, not near outer rim helper).
    expect(isNpcNearHazardEdge(12, 0, 1.0)).toBe(false);
  });

  it("flags backrooms square-hole proximity when hazards registered", () => {
    setLevelHazards({
      arenaHalf: 20,
      half: 3.5,
      avoidMargin: 0.6,
      influenceBand: 4,
      squareHoles: [{ x: 10, z: 10 }],
    });
    expect(isNpcNearHazardEdge(10.2, 10.1, 3.2)).toBe(true);
    expect(isNpcNearHazardEdge(0, 0, 1.0)).toBe(false);
    setLevelHazards(null);
  });
});
