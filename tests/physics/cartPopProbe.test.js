// @vitest-environment happy-dom
// CART-POP-1 Wave A — diagnostic-only shared-contact attribution.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { __resetCartPopProbeForTest, runFixedPhysicsStep } from "../../src/simulation.js";
import {
  __drainAutoCapturesForTest,
  __resetDiagnosticsForTest,
  installDiagnostics,
} from "../../src/utils/diagnostics.js";

const realFetch = globalThis.fetch;

function makeCart(slotIndex = 0) {
  const cart = {
    slotIndex,
    pos: { x: 0, y: 0, z: 0 },
    vel: { x: 0, y: 0, z: 0 },
    quat: { x: 0, y: 0, z: 0, w: 1 },
    body: {
      translation: () => ({ ...cart.pos }),
      linvel: () => ({ ...cart.vel }),
      rotation: () => ({ ...cart.quat }),
      applyImpulse: () => {},
    },
    collider: { handle: 100 + slotIndex },
    pendingRam: null,
    respawnAtMs: null,
    isSuddenDeathSpectator: false,
  };
  return cart;
}

function makeWorld(others = [], manifold = null) {
  const contactOthers = Array.isArray(others) ? others : others ? [others] : [];
  return {
    step: () => {},
    contactPairsWith: (_collider, visit) => {
      contactOthers.forEach(visit);
    },
    contactPair: (_cartCollider, _other, visit) => {
      if (manifold) visit(manifold);
    },
  };
}

const eventQueue = { drainCollisionEvents: () => {} };

function step(cart, world, now = 1000, callbacks = {}) {
  runFixedPhysicsStep({
    world,
    eventQueue,
    allCarts: [cart],
    localCart: null,
    remoteInputs: null,
    npcs: [],
    dt: 1 / 60,
    now,
    isHost: true,
    callbacks,
  });
}

function popEvents() {
  return (window.__ccDiag?.events() || []).filter((event) => event.ch === "cart_pop");
}

describe("CART-POP-1 contact probe", () => {
  beforeEach(() => {
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ ok: true, id: 1 }) });
    __resetDiagnosticsForTest();
    __resetCartPopProbeForTest();
  });

  afterEach(async () => {
    await __drainAutoCapturesForTest();
    globalThis.fetch = realFetch;
    __resetDiagnosticsForTest();
    __resetCartPopProbeForTest();
  });

  it("is inert unless diagnostics are active", () => {
    const cart = makeCart();
    cart.vel.y = 2;
    step(cart, makeWorld());
    expect(window.__ccDiag).toBeUndefined();
  });

  it("captures a single upward episode with shared contact material", () => {
    installDiagnostics({ flags: { enabled: true } });
    const cart = makeCart(2);
    cart.pos = { x: 3, y: 0.4, z: 4 };
    cart.vel = { x: 5, y: -0.5, z: 12 };
    const floor = { handle: 42 };
    const manifold = {
      normal: (out) => Object.assign(out, { x: 0, y: -1, z: 0 }),
      restitution: () => 0.175,
      numContacts: () => 1,
      contactImpulse: () => 18.5,
    };

    const world = makeWorld(floor, manifold);
    world.step = () => { cart.vel.y = 1; };
    step(cart, world, 1000, { recordColliderHandles: [42] });

    expect(popEvents()).toEqual([
      expect.objectContaining({
        type: "rise",
        slot: 2,
        x: 3,
        y: 0.4,
        z: 4,
        radius: 5,
        theta: 0.927,
        preVy: -0.5,
        preWorldVy: -0.5,
        vy: 1,
        deltaVy: 1.5,
        worldDeltaVy: 1.5,
        planarSpeed: 13,
        staticContacts: 1,
        supportContacts: 1,
        contactClasses: { floor: 1, edge: 0, clang: 0 },
        recordContacts: 1,
        unclassifiedStaticContacts: 0,
        recordContactDetails: [{ handle: 42, index: 0, normalY: 1, contacts: 1, maxImpulse: 18.5 }],
        recordContactDetailOverflow: 0,
        maxRestitution: 0.175,
        maxImpulse: 18.5,
        hop: false,
        ram: false,
      }),
    ]);
  });

  it("does not flood while the cart remains rising", () => {
    installDiagnostics({ flags: { enabled: true } });
    const cart = makeCart();
    cart.vel.y = 1;
    step(cart, makeWorld(), 1000);
    cart.vel.y = 1.4;
    step(cart, makeWorld(), 1016);
    expect(popEvents()).toHaveLength(1);

    cart.vel.y = 0;
    step(cart, makeWorld(), 1032);
    cart.vel.y = 1;
    step(cart, makeWorld(), 1048);
    expect(popEvents()).toHaveLength(2);
  });

  it("caps per-record contact detail while preserving the aggregate count", () => {
    installDiagnostics({ flags: { enabled: true } });
    const cart = makeCart();
    const floors = Array.from({ length: 10 }, (_unused, index) => ({ handle: index + 1 }));
    const manifold = {
      normal: (out) => Object.assign(out, { x: 0, y: -1, z: 0 }),
      restitution: () => 0.05,
      numContacts: () => 1,
      contactImpulse: () => 2,
    };
    const world = makeWorld(floors, manifold);
    world.step = () => { cart.vel.y = 1; };

    step(cart, world, 1000, { recordColliderHandles: floors.map((floor) => floor.handle) });

    expect(popEvents()).toEqual([
      expect.objectContaining({
        recordContacts: 10,
        recordContactDetails: expect.arrayContaining([
          { handle: 1, index: 0, normalY: 1, contacts: 1, maxImpulse: 2 },
          { handle: 8, index: 7, normalY: 1, contacts: 1, maxImpulse: 2 },
        ]),
        recordContactDetailOverflow: 2,
      }),
    ]);
    expect(popEvents()[0].recordContactDetails).toHaveLength(8);
  });
});
