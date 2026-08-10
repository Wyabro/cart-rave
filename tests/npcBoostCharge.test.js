import { afterEach, describe, expect, it, vi } from "vitest";
import { CONFIG } from "../src/config.js";
import * as GameState from "../src/gameState.js";
import { cancelNpcBoostCharge, runFixedPhysicsStep } from "../src/simulation.js";

function makeChargingNpc() {
  const npc = {
    slotIndex: 1,
    pos: { x: 0, y: 1, z: 0 },
    vel: { x: 0, y: 0, z: 0 },
    quat: { x: 0, y: 0, z: 0, w: 1 },
    body: {
      translation: () => ({ ...npc.pos }),
      linvel: () => ({ ...npc.vel }),
      rotation: () => ({ ...npc.quat }),
      angvel: () => ({ x: 0, y: 0, z: 0 }),
      applyImpulse: vi.fn(),
      wakeUp: vi.fn(),
    },
    collider: { handle: 101 },
    pendingRam: null,
    respawnAtMs: null,
    isSuddenDeathSpectator: false,
    isChargingBoost: true,
    boostChargeStartedAtMs: 1000,
    boostChargeMultiplier: 1,
    boostCooldownUntilMs: 0,
    ramBoostActiveUntilMs: 0,
    ramBoostStreakCarry: 0,
    lastRamBoostTimeMs: 0,
    nitroStreakCharged: false,
  };
  return npc;
}

afterEach(() => {
  GameState.resetRoundToLobby();
});

describe("NPC-BOOST-1 hard charge cancel", () => {
  it("clears a mid-charge NPC without a burst, nitro window, or charged trail", () => {
    const onBoostCancel = vi.fn();
    const cart = {
      isChargingBoost: true,
      boostChargeStartedAtMs: 800,
      boostChargeMultiplier: 1,
      nitroStreakCharged: true,
      ramBoostActiveUntilMs: 0,
      lastRamBoostTimeMs: 100,
      body: { applyImpulse: vi.fn() },
    };

    expect(cancelNpcBoostCharge(cart, 1200, { onBoostCancel })).toBe(true);
    expect(cart.isChargingBoost).toBe(false);
    expect(cart.boostChargeStartedAtMs).toBe(0);
    expect(cart.ramBoostActiveUntilMs).toBe(0);
    expect(cart.nitroStreakCharged).toBe(false);
    expect(cart.lastRamBoostTimeMs).toBe(1200);
    expect(cart.body.applyImpulse).not.toHaveBeenCalled();
    expect(onBoostCancel).toHaveBeenCalledWith(cart);
  });

  it("leaves an already idle cart untouched", () => {
    const cart = { isChargingBoost: false, lastRamBoostTimeMs: 100 };
    expect(cancelNpcBoostCharge(cart, 1200)).toBe(false);
    expect(cart.lastRamBoostTimeMs).toBe(100);
  });

  it("keeps a host NPC hold active until the fixed step auto-releases it", () => {
    GameState.setRoundPhase("running");
    const npc = makeChargingNpc();
    const onBoostRelease = vi.fn();
    const now = 1000 + CONFIG.cart.ramBoost.boostCharge.boostChargeTimeMs;

    runFixedPhysicsStep({
      world: { step: vi.fn() },
      eventQueue: { drainCollisionEvents: vi.fn() },
      allCarts: [npc],
      localCart: null,
      remoteInputs: null,
      npcs: [npc],
      dt: 1 / 60,
      now,
      isHost: true,
      callbacks: {
        getAiAxis: () => ({ forward: 1, turn: 0, boostHeld: true }),
        onBoostRelease,
      },
    });

    expect(npc.isChargingBoost).toBe(false);
    expect(npc.boostChargeMultiplier).toBe(CONFIG.cart.ramBoost.boostCharge.boostMaxMultiplier);
    expect(npc.ramBoostActiveUntilMs).toBe(now + CONFIG.cart.ramBoost.durationSec * 1.5 * 1000);
    expect(npc.nitroStreakCharged).toBe(true);
    expect(onBoostRelease).toHaveBeenCalledWith(npc);
  });
});
