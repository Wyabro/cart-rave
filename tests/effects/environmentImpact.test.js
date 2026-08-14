// environmentImpact.test.js — ZAN-BOLLARD-PT-1.
// The edge clang (wall/booth/bollard/gnomon impacts) computes the Δv the impact
// produced in one substep: live post-step linvel minus the pre-step snapshot. The
// pre-step snapshot is captured at the top of runFixedPhysicsStep; processCollisionEvents
// drains after world.step, so body.linvel() there is the post-impact velocity.
// The old code subtracted the pre-step snapshot from itself — Δv was always 0 and
// edge impacts never fired (bollards, gnomon and booth legs all silent).
import { describe, expect, it, vi } from "vitest";
import { runFixedPhysicsStep } from "../../src/simulation.js";

const NOW = 1_000;
const CART_HANDLE = 9_001;
const BOLLARD_HANDLE = 9_100;
const BOOTH_HANDLE = 9_101;
const FLOOR_HANDLE = 9_102;

/**
 * Velocity fake: the capture loop is the first linvel() read of the step (the pre-step
 * snapshot); every later read (launcher pass, the impact drain after world.step) sees
 * the post-impact velocity. "First read = pre, rest = post" is the correct ordering —
 * the drain is guaranteed to be the last linvel consumer in the step.
 */
function makeCart(pre, post, pos = { x: 0, y: 0, z: 0 }) {
  let firstRead = true;
  const body = {
    translation: () => pos,
    rotation: () => ({ x: 0, y: 0, z: 0, w: 1 }),
    angvel: () => ({ x: 0, y: 0, z: 0 }),
    linvel: () => {
      if (firstRead) {
        firstRead = false;
        return pre;
      }
      return post;
    },
    applyImpulse: () => {},
  };
  return {
    body,
    collider: { handle: CART_HANDLE },
    slotIndex: 0,
    isSuddenDeathSpectator: true,
    hopAwaitingLand: false,
    hopAirborne: false,
    lastHopAtMs: NOW,
    pendingRam: null,
  };
}

function makeCallbacks({
  playEdgeImpact = vi.fn(),
  playFloorImpact = vi.fn(),
  spawnTrashBurst = undefined,
} = {}) {
  return {
    boothColliderHandles: [BOOTH_HANDLE],
    bollardColliderHandles: [BOLLARD_HANDLE],
    recordColliderHandles: [FLOOR_HANDLE],
    playEdgeImpact,
    playFloorImpact,
    ...(spawnTrashBurst ? { spawnTrashBurst } : {}),
  };
}

/** Drive one host step that reports a started env contact vs `otherHandle`. */
function driveHostContact(cart, otherHandle, callbacks) {
  runFixedPhysicsStep({
    world: { step: () => {} },
    eventQueue: { drainCollisionEvents: (fn) => fn(otherHandle, CART_HANDLE, true) },
    allCarts: [cart],
    localCart: undefined,
    isHost: true,
    callbacks,
    dt: 1 / 60,
    now: NOW,
  });
}

describe("environment impact classification (ZAN-BOLLARD-PT-1)", () => {
  it("hard bollard hit fires the clang with a velocity-delta intensity", () => {
    // * Capture reads 8 m/s; the impact (restitution 0.55 bounce) leaves ~2 m/s.
    // * Cart sits at a corner-bollard distance (34 m out) — the spark must stay on
    // * the post, not project out to the pit ring (~58 m).
    const cart = makeCart({ x: 8, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }, { x: 34, y: 0, z: 0 });
    const playEdgeImpact = vi.fn();
    const playFloorImpact = vi.fn();
    const spawnTrashBurst = vi.fn();

    driveHostContact(
      cart,
      BOLLARD_HANDLE,
      makeCallbacks({ playEdgeImpact, playFloorImpact, spawnTrashBurst }),
    );

    expect(playEdgeImpact).toHaveBeenCalledTimes(1);
    // * Δv = 6 → (6 − 0.75) / 6 = 0.875
    expect(playEdgeImpact.mock.calls[0][0]).toBeCloseTo(0.875, 3);
    expect(playFloorImpact).not.toHaveBeenCalled();
    // * Spark at the post, not floating over the pit (was projected to the ring).
    expect(spawnTrashBurst).toHaveBeenCalledTimes(1);
    expect(spawnTrashBurst.mock.calls[0][0].x).toBeCloseTo(34, 3);
    expect(spawnTrashBurst.mock.calls[0][0].z).toBeCloseTo(0, 3);
    expect(spawnTrashBurst.mock.calls[0][2]).toBe("edge");
  });

  it("soft bollard graze stays silent (Δv below the 0.75 m/s threshold)", () => {
    const cart = makeCart({ x: 3, y: 0, z: 0 }, { x: 2.9, y: 0, z: 0 });
    const playEdgeImpact = vi.fn();
    const playFloorImpact = vi.fn();

    driveHostContact(cart, BOLLARD_HANDLE, makeCallbacks({ playEdgeImpact, playFloorImpact }));

    expect(playEdgeImpact).not.toHaveBeenCalled();
    expect(playFloorImpact).not.toHaveBeenCalled();
  });

  it("measured real-impact Δv (1.6 m/s) fires an audible clang on the tuned curve", () => {
    // * The real Rapier probe measured 1.6–1.7 m/s per-step Δv at first contact at
    // * ANY approach speed (5–12 m/s) — the +4 solver iterations spread the impulse.
    // * The old 2.5 threshold was unreachable; the tuned curve must make this fire.
    const cart = makeCart({ x: 8, y: 0, z: 0 }, { x: 6.4, y: 0, z: 0 });
    const playEdgeImpact = vi.fn();
    const playFloorImpact = vi.fn();

    driveHostContact(cart, BOLLARD_HANDLE, makeCallbacks({ playEdgeImpact, playFloorImpact }));

    expect(playEdgeImpact).toHaveBeenCalledTimes(1);
    // * Δv = 1.6 → (1.6 − 0.75) / 6 ≈ 0.142
    expect(playEdgeImpact.mock.calls[0][0]).toBeCloseTo(0.1417, 3);
    expect(playFloorImpact).not.toHaveBeenCalled();
  });

  it("booth-leg contact keeps FX but never plays the clang sound", () => {
    // * ZAN-BOLLARD-PT-1: only the posts (bollards + gnomon) clang. Booth legs and
    // * the pit wall stay "edge": spark FX yes, metallic clang no.
    const cart = makeCart({ x: 8, y: 0, z: 0 }, { x: 2, y: 0, z: 0 });
    const playEdgeImpact = vi.fn();
    const playFloorImpact = vi.fn();
    const spawnTrashBurst = vi.fn();

    driveHostContact(
      cart,
      BOOTH_HANDLE,
      makeCallbacks({ playEdgeImpact, playFloorImpact, spawnTrashBurst }),
    );

    expect(playEdgeImpact).not.toHaveBeenCalled();
    expect(playFloorImpact).not.toHaveBeenCalled();
    expect(spawnTrashBurst).toHaveBeenCalledTimes(1);
    expect(spawnTrashBurst.mock.calls[0][2]).toBe("edge");
  });

  it("floor contact still fires the floor impact from the pre-step fall speed", () => {
    // * Capture reads 6 m/s downward; a floor thud plays from the pre-step fall speed.
    const cart = makeCart({ x: 0, y: -6, z: 0 }, { x: 0, y: -6, z: 0 });
    const playEdgeImpact = vi.fn();
    const playFloorImpact = vi.fn();

    driveHostContact(cart, FLOOR_HANDLE, makeCallbacks({ playEdgeImpact, playFloorImpact }));

    expect(playFloorImpact).toHaveBeenCalledTimes(1);
    // * fallSpeed 6 → (6 − 3) / 15 = 0.2
    expect(playFloorImpact.mock.calls[0][0]).toBeCloseTo(0.2, 3);
    expect(playEdgeImpact).not.toHaveBeenCalled();
  });
});
