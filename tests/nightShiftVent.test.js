import { afterEach, describe, expect, it, vi } from "vitest";
import * as GameState from "../src/gameState.js";
import { getNightShiftBlockoutHazards } from "../src/levels/rooftop.js";
import {
  computeAcLauncherVelocity,
  runFixedPhysicsStep,
  setLevelHazards,
} from "../src/simulation.js";

function makeCart(x, z, velocity = { x: 0, y: 0, z: 0 }) {
  const cart = {
    slotIndex: 0,
    position: { x, y: 1.077, z },
    velocity: { ...velocity },
    respawnAtMs: null,
    pendingRam: null,
    isSuddenDeathSpectator: false,
  };
  cart.body = {
    translation: () => ({ ...cart.position }),
    linvel: () => ({ ...cart.velocity }),
    mass: () => 2,
    applyImpulse: vi.fn((impulse) => {
      cart.velocity.x += impulse.x / 2;
      cart.velocity.y += impulse.y / 2;
      cart.velocity.z += impulse.z / 2;
    }),
  };
  return cart;
}

function step(cart, { now = 1000, isHost = true } = {}) {
  runFixedPhysicsStep({
    world: { step: vi.fn() },
    eventQueue: { drainCollisionEvents: vi.fn() },
    allCarts: [cart],
    localCart: null,
    remoteInputs: null,
    dt: 1 / 60,
    now,
    isHost,
  });
}

afterEach(() => {
  setLevelHazards(null);
  GameState.resetRoundToLobby();
});

describe("NIGHT-SHIFT-VENT-1", () => {
  it("registers AC launchers even when the square roof has no internal holes", () => {
    GameState.setRoundPhase("running");
    const hazards = getNightShiftBlockoutHazards();
    expect(hazards.squareHoles).toEqual([]);
    setLevelHazards(hazards);
    const cart = makeCart(0, 6);

    step(cart);

    expect(cart.body.applyImpulse).toHaveBeenCalledTimes(1);
  });

  it("aims route launches at lateral roofs and sends both chaos units straight up", () => {
    const [west, east, north, south] = getNightShiftBlockoutHazards().acLaunchers;
    const westVelocity = computeAcLauncherVelocity(west, { x: west.x, z: west.z });
    const eastVelocity = computeAcLauncherVelocity(east, { x: east.x, z: east.z });
    const northVelocity = computeAcLauncherVelocity(north, { x: north.x, z: north.z });
    const southVelocity = computeAcLauncherVelocity(south, { x: south.x, z: south.z });

    expect(westVelocity).toEqual({ x: -west.horizontalSpeed, y: west.verticalSpeed, z: 0 });
    expect(eastVelocity).toEqual({ x: east.horizontalSpeed, y: east.verticalSpeed, z: 0 });
    expect(northVelocity).toEqual({ x: 0, y: north.verticalSpeed, z: 0 });
    expect(southVelocity).toEqual({ x: 0, y: south.verticalSpeed, z: 0 });
    expect(northVelocity.y).toBeGreaterThan(westVelocity.y);
    expect(southVelocity.y).toBeGreaterThan(eastVelocity.y);
  });

  it("fires instantly on the host during running and cancels incoming velocity", () => {
    GameState.setRoundPhase("running");
    setLevelHazards(getNightShiftBlockoutHazards());
    const cart = makeCart(0, 6, { x: 4, y: -2, z: -3 });

    step(cart);

    expect(cart.body.applyImpulse).toHaveBeenCalledTimes(1);
    expect(cart.velocity).toEqual({ x: 0, y: 26, z: 0 });
  });

  it("does not fire on a client or outside the running phase", () => {
    setLevelHazards(getNightShiftBlockoutHazards());
    const clientCart = makeCart(-5, 0);
    GameState.setRoundPhase("running");
    step(clientCart, { isHost: false });
    expect(clientCart.body.applyImpulse).not.toHaveBeenCalled();

    const lobbyCart = makeCart(-5, 0);
    GameState.resetRoundToLobby();
    step(lobbyCart, { isHost: true });
    expect(lobbyCart.body.applyImpulse).not.toHaveBeenCalled();
  });

  it("latches one unit until exit while allowing a different unit to chain", () => {
    GameState.setRoundPhase("running");
    setLevelHazards(getNightShiftBlockoutHazards());
    const cart = makeCart(-5, 0);

    step(cart, { now: 1000 });
    step(cart, { now: 2000 });
    expect(cart.body.applyImpulse).toHaveBeenCalledTimes(1);

    cart.position.x = 5;
    cart.velocity = { x: 0, y: 0, z: 0 };
    step(cart, { now: 2050 });
    expect(cart.body.applyImpulse).toHaveBeenCalledTimes(2);
    expect(cart.velocity.x).toBeGreaterThan(0);
    expect(cart.velocity.z).toBe(0);
  });

  it("requires the same unit cooldown to expire after the cart exits", () => {
    GameState.setRoundPhase("running");
    setLevelHazards(getNightShiftBlockoutHazards());
    const cart = makeCart(-5, 0);

    step(cart, { now: 1000 });
    cart.position.x = -10;
    cart.velocity = { x: 0, y: 0, z: 0 };
    step(cart, { now: 1100 });
    cart.position.x = -5;
    step(cart, { now: 1200 });
    expect(cart.body.applyImpulse).toHaveBeenCalledTimes(1);

    cart.position.x = -10;
    step(cart, { now: 1700 });
    cart.position.x = -5;
    step(cart, { now: 1800 });
    expect(cart.body.applyImpulse).toHaveBeenCalledTimes(2);
  });
});
