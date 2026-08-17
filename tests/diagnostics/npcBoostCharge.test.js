// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { CONFIG } from "../../src/config.js";
import * as GameState from "../../src/stores/gameStore.js";
import { resolveNpcChargeHold } from "../../src/orchestration/cartOrchestration.js";
import { cancelNpcBoostCharge, runFixedPhysicsStep } from "../../src/simulation.js";

const YAW_NEG_Z = { x: 0, y: 0, z: 0, w: 1 };
const YAW_NEG_X = { x: 0, y: Math.SQRT1_2, z: 0, w: Math.SQRT1_2 };

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

function makePoseCart({ x, z, y = 1, quat = YAW_NEG_Z, extra = {} }) {
  const cart = {
    pos: { x, y, z },
    quat: { ...quat },
    respawnAtMs: null,
    isSuddenDeathSpectator: false,
    isChargingBoost: true,
    npcBoostChargeTargetSlotIndex: 0,
    body: {
      translation: () => ({ ...cart.pos }),
      rotation: () => ({ ...cart.quat }),
    },
    ...extra,
  };
  return cart;
}

function stepNpcCharge(npc, axis, now, callbacks = {}) {
  GameState.setRoundPhase("running");
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
      getAiAxis: () => axis,
      ...callbacks,
    },
  });
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
    const npc = makeChargingNpc();
    const onBoostRelease = vi.fn();
    const now = 1000 + CONFIG.cart.ramBoost.boostCharge.boostChargeTimeMs;
    stepNpcCharge(npc, { forward: 1, turn: 0, boostHeld: true }, now, { onBoostRelease });

    expect(npc.isChargingBoost).toBe(false);
    expect(npc.boostChargeMultiplier).toBe(CONFIG.cart.ramBoost.boostCharge.boostMaxMultiplier);
    expect(npc.ramBoostActiveUntilMs).toBe(now + CONFIG.cart.ramBoost.durationSec * 1.5 * 1000);
    expect(npc.nitroStreakCharged).toBe(true);
    expect(onBoostRelease).toHaveBeenCalledWith(npc);
  });
});

describe("NPC-ABORT-BURST-1 charge abort", () => {
  it("hard-cancels through applyArcadeControls when boostCancel is set", () => {
    const npc = makeChargingNpc();
    const onBoostCancel = vi.fn();
    const onBoostRelease = vi.fn();
    stepNpcCharge(
      npc,
      { forward: 1, turn: 0, boostHeld: false, boostCancel: true },
      1400,
      { onBoostCancel, onBoostRelease },
    );

    expect(npc.isChargingBoost).toBe(false);
    expect(npc.ramBoostActiveUntilMs).toBe(0);
    expect(onBoostCancel).toHaveBeenCalledWith(npc);
    expect(onBoostRelease).not.toHaveBeenCalled();
  });

  it("still fires a proportional abort burst when boostHeld drops without boostCancel", () => {
    const npc = makeChargingNpc();
    const onBoostCancel = vi.fn();
    const onBoostRelease = vi.fn();
    stepNpcCharge(
      npc,
      { forward: 1, turn: 0, boostHeld: false },
      1400,
      { onBoostCancel, onBoostRelease },
    );

    expect(npc.isChargingBoost).toBe(false);
    expect(npc.ramBoostActiveUntilMs).toBeGreaterThan(1400);
    expect(onBoostRelease).toHaveBeenCalledWith(npc);
    expect(onBoostCancel).not.toHaveBeenCalled();
  });

  it("holds charge while the locked target is still a legal ram", () => {
    const target = makePoseCart({ x: 14, z: -6, extra: { isChargingBoost: false } });
    const npc = makePoseCart({ x: 14, z: 0 });
    expect(resolveNpcChargeHold(npc, [target, npc])).toEqual({ boostHeld: true });
  });

  it("abort-bursts at ram range when the yaw runway stays clear", () => {
    const target = makePoseCart({ x: 14, z: -2, extra: { isChargingBoost: false } });
    const npc = makePoseCart({ x: 14, z: 0 });
    expect(resolveNpcChargeHold(npc, [target, npc])).toEqual({ boostHeld: false });
  });

  it("cancels when the locked target has fallen, even if yaw is clear", () => {
    const target = makePoseCart({ x: 14, z: -6, y: -20, extra: { isChargingBoost: false } });
    const npc = makePoseCart({ x: 14, z: 0 });
    expect(resolveNpcChargeHold(npc, [target, npc])).toEqual({
      boostHeld: false,
      boostCancel: true,
    });
  });

  it("cancels when cart yaw points the burst into the center hole", () => {
    const target = makePoseCart({ x: 12, z: 0, extra: { isChargingBoost: false } });
    const npc = makePoseCart({ x: 14, z: 0, quat: YAW_NEG_X });
    expect(resolveNpcChargeHold(npc, [target, npc])).toEqual({
      boostHeld: false,
      boostCancel: true,
    });
  });

  it("cancels when the locked target is a spectator", () => {
    const target = makePoseCart({
      x: 14,
      z: -6,
      extra: { isChargingBoost: false, isSuddenDeathSpectator: true },
    });
    const npc = makePoseCart({ x: 14, z: 0 });
    expect(resolveNpcChargeHold(npc, [target, npc])).toEqual({
      boostHeld: false,
      boostCancel: true,
    });
  });
});
