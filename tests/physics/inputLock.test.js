// @vitest-environment happy-dom
// INPUT-LOCK-1 lever A — apply gate: no local boost / remote drive outside running.

import { afterEach, describe, expect, it, vi } from "vitest";
import { runFixedPhysicsStep } from "../../src/simulation.js";
import * as GameState from "../../src/stores/gameStore.js";

function makeCart(slotIndex = 0) {
  const cart = {
    slotIndex,
    pos: { x: 0, y: 1, z: 0 },
    vel: { x: 0, y: 0, z: 0 },
    quat: { x: 0, y: 0, z: 0, w: 1 },
    body: {
      translation: () => ({ ...cart.pos }),
      linvel: () => ({ ...cart.vel }),
      rotation: () => ({ ...cart.quat }),
      angvel: () => ({ x: 0, y: 0, z: 0 }),
      mass: () => 1,
      applyImpulse: vi.fn(),
      applyTorqueImpulse: vi.fn(),
      wakeUp: vi.fn(),
    },
    collider: { handle: 100 + slotIndex },
    pendingRam: null,
    respawnAtMs: null,
    isSuddenDeathSpectator: false,
    isChargingBoost: false,
    boostChargeStartedAtMs: 0,
    boostChargeMultiplier: 1,
    boostCooldownUntilMs: 0,
    ramBoostActiveUntilMs: 0,
    ramBoostStreakCarry: 0,
    lastRamBoostTimeMs: 0,
    nitroStreakCharged: false,
  };
  return cart;
}

function step({ localCart = null, remoteCart = null, phase, getAxis, triggerRamBoost, onBoostCancel }) {
  GameState.setRoundPhase(phase);
  const remotes = remoteCart
    ? new Map([["peer", { throttle: 1, steer: 1, nitro: true }]])
    : null;
  runFixedPhysicsStep({
    world: { step: vi.fn() },
    eventQueue: { drainCollisionEvents: vi.fn() },
    allCarts: [localCart, remoteCart].filter(Boolean),
    localCart,
    remoteInputs: remotes,
    npcs: [],
    dt: 1 / 60,
    now: 1000,
    isHost: true,
    callbacks: {
      getAxis: getAxis || (() => ({ forward: 0, turn: 0, boostHeld: false })),
      triggerRamBoost,
      onBoostCancel,
      resolveCartForConn: remoteCart ? () => remoteCart : undefined,
    },
  });
}

afterEach(() => {
  GameState.resetRoundToLobby();
});

describe("INPUT-LOCK-1 apply gate", () => {
  it("does not start a local charge from boostHeld during countdown", () => {
    const cart = makeCart(0);
    const triggerRamBoost = vi.fn();
    step({
      localCart: cart,
      phase: "countdown",
      getAxis: () => ({ forward: 1, turn: 1, boostHeld: true }),
      triggerRamBoost,
    });
    expect(triggerRamBoost).not.toHaveBeenCalled();
    expect(cart.isChargingBoost).toBe(false);
    expect(cart.ramBoostActiveUntilMs).toBe(0);
  });

  it("silent-cancels a leaked local charge during countdown (no burst)", () => {
    const cart = makeCart(0);
    cart.isChargingBoost = true;
    cart.boostChargeStartedAtMs = 200;
    const onBoostCancel = vi.fn();
    const triggerRamBoost = vi.fn();
    step({
      localCart: cart,
      phase: "countdown",
      getAxis: () => ({ forward: 0, turn: 0, boostHeld: false }),
      triggerRamBoost,
      onBoostCancel,
    });
    expect(cart.isChargingBoost).toBe(false);
    expect(cart.boostChargeStartedAtMs).toBe(0);
    expect(cart.ramBoostActiveUntilMs).toBe(0);
    expect(triggerRamBoost).not.toHaveBeenCalled();
    expect(onBoostCancel).toHaveBeenCalledWith(cart);
    const burst = cart.body.applyImpulse.mock.calls.some(([imp]) => (
      imp && Math.hypot(imp.x || 0, imp.y || 0, imp.z || 0) > 5
    ));
    expect(burst).toBe(false);
  });

  it("does not apply stale remote throttle during countdown", () => {
    const remote = makeCart(1);
    step({
      remoteCart: remote,
      phase: "countdown",
    });
    expect(remote.body.wakeUp).not.toHaveBeenCalled();
    expect(remote.body.applyImpulse).not.toHaveBeenCalled();
    expect(remote.isChargingBoost).toBe(false);
  });

  it("still re-arms local charge while running", () => {
    const cart = makeCart(0);
    const triggerRamBoost = vi.fn();
    step({
      localCart: cart,
      phase: "running",
      getAxis: () => ({ forward: 0, turn: 0, boostHeld: true }),
      triggerRamBoost,
    });
    expect(triggerRamBoost).toHaveBeenCalledWith(cart, 1000, expect.any(Object));
  });
});
