// @vitest-environment happy-dom
// pitProbe.test.js — PIT-PT-1 measurement probe (temporary; remove with the probe).
//
// * The probe answers "how far past the wall did the cart actually get, at what depth and
// * speed" for the Cart Rave pit. It is episode logic over POSE, so these tests script
// * translation()/linvel() directly — the Rapier event queue plays no part and is stubbed
// * only to satisfy the step signature.
// *
// * The load-bearing case is #4: an earlier draft closed the episode at y < -64, but carts
// * KO at CONFIG.fall.yThreshold (-10) and then ricochet through a ~1s respawn delay, so
// * rMax would have reported post-KO bouncing rather than the burial being investigated.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { CONFIG } from "../src/config.js";
import { runFixedPhysicsStep, __resetPitProbeForTest } from "../src/simulation.js";
import {
  installDiagnostics,
  __resetDiagnosticsForTest,
  __drainAutoCapturesForTest,
} from "../src/utils/diagnostics.js";

const realFetch = globalThis.fetch;

/** Cart mock whose pose the test drives frame by frame. */
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

const eventQueue = { drainCollisionEvents: () => {} };

function step(allCarts, now) {
  runFixedPhysicsStep({
    world: { step: () => {} },
    eventQueue,
    allCarts,
    localCart: null,
    remoteInputs: null,
    npcs: [],
    dt: 1 / 60,
    now,
    isHost: true,
    callbacks: {},
  });
}

/** Places the cart at radius `r` on the +X axis at height `y`, then steps once. */
function stepAt(cart, r, y, now) {
  cart.pos.x = r;
  cart.pos.z = 0;
  cart.pos.y = y;
  step([cart], now);
}

function pitEvents() {
  return (window.__ccDiag?.events() || []).filter((e) => e.ch === "pit");
}

describe("PIT-PT-1 pit probe", () => {
  beforeEach(() => {
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ ok: true, id: 1 }) });
    __resetDiagnosticsForTest();
    __resetPitProbeForTest();
  });

  afterEach(async () => {
    await __drainAutoCapturesForTest();
    globalThis.fetch = realFetch;
    __resetDiagnosticsForTest();
    __resetPitProbeForTest();
  });

  it("is inert without ?diag — no events and no episode state carried forward", () => {
    const cart = makeCart();
    // A full fall while diagnostics are off.
    stepAt(cart, 43, -3, 1000);
    stepAt(cart, 44.6, -6, 1016);
    cart.respawnAtMs = 1200;
    stepAt(cart, 44.6, -11, 1032);

    expect(window.__ccDiag).toBeUndefined();

    // Turning diagnostics on afterwards must not flush a half-tracked episode.
    installDiagnostics({ flags: { enabled: true } });
    cart.respawnAtMs = null;
    stepAt(cart, 43, -3, 2000);
    cart.respawnAtMs = 2100;
    stepAt(cart, 43, -11, 2016);
    const evs = pitEvents();
    expect(evs).toHaveLength(1);
    expect(evs[0].rMax).toBeCloseTo(43, 3);
  });

  it("emits exactly one event per fall, at the KO — not one per step", () => {
    installDiagnostics({ flags: { enabled: true } });
    const cart = makeCart();

    stepAt(cart, 42.5, -3, 1000);
    stepAt(cart, 43.4, -5, 1016);
    stepAt(cart, 44.2, -7, 1032);
    expect(pitEvents()).toHaveLength(0); // still falling — nothing emitted yet

    cart.respawnAtMs = 1100;
    stepAt(cart, 44.2, -9, 1048);
    expect(pitEvents()).toHaveLength(1);

    // Further steps while respawning must not emit again.
    stepAt(cart, 44.9, -12, 1064);
    expect(pitEvents()).toHaveLength(1);
  });

  it("reports the peak of the path, not the last sample", () => {
    installDiagnostics({ flags: { enabled: true } });
    const cart = makeCart();

    stepAt(cart, 42.5, -3, 1000);
    stepAt(cart, 44.75, -6, 1016); // the deepest excursion
    stepAt(cart, 43.1, -8, 1032); // bounced back inward before the KO
    cart.respawnAtMs = 1100;
    stepAt(cart, 43.0, -10.5, 1048);

    const [ev] = pitEvents();
    expect(ev.rMax).toBeCloseTo(44.75, 3);
    expect(ev.yAtRMax).toBeCloseTo(-6, 3);
    expect(ev.minY).toBeLessThanOrEqual(-8);
    // Half-extent basis travels with the event so burial can be judged against heading.
    expect(ev.hx).toBe(CONFIG.cart.size.x);
    expect(ev.hz).toBe(CONFIG.cart.size.z);
  });

  it("closes at the KO, so post-KO ricochets cannot inflate rMax", () => {
    installDiagnostics({ flags: { enabled: true } });
    const cart = makeCart();

    stepAt(cart, 42.5, -3, 1000);
    stepAt(cart, 43.5, -6, 1016);
    // Crossing yThreshold is the KO even before respawnAtMs is stamped.
    stepAt(cart, 43.6, CONFIG.fall.yThreshold - 0.5, 1032);

    // Shatter/respawn ricochet: far outboard, deep, and it must be ignored entirely.
    cart.respawnAtMs = 1100;
    stepAt(cart, 48, -30, 1048);
    stepAt(cart, 52, -50, 1064);

    const evs = pitEvents();
    expect(evs).toHaveLength(1);
    expect(evs[0].rMax).toBeCloseTo(43.5, 3);
    expect(evs[0].rMax).toBeLessThan(44);
  });

  it("radius alone does not open an episode — the Y gate is required", () => {
    installDiagnostics({ flags: { enabled: true } });
    const cart = makeCart();

    // Driving the outer dancefloor edge at deck height: wide, but never falling.
    stepAt(cart, 43.5, 0, 1000);
    stepAt(cart, 44.0, 0.2, 1016);
    cart.respawnAtMs = 1100;
    stepAt(cart, 44.0, 0.2, 1032);

    expect(pitEvents()).toHaveLength(0);
  });
});
