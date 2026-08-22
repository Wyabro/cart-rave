// @vitest-environment happy-dom
// softContactTap.test.js — AUDIO-RAM-IMPACT-1: sub-minSpeed cart touches must still thud.
//
// * Playtest finding (08-21 external feedback + Wyatt prod retest): every crash SFX sat behind
// * the SCORING gate (getRammingQualificationScore: minSpeed 0.6 m/s + alignment cone), so a
// * gentle bump below the threshold was resolved silently by raw contact response — rams felt
// * mute exactly when the game reads "shopping carts bumping". Hop landings already solve this
// * shape for floors ("fires even below the threshold so soft hops still thud"); carts get the
// * same treatment: an unqualified contact-start fires a quiet contact tap via
// * callbacks.playSoftContact(closingSpeed). No credit, no knockback, no particles — sound only.

import { describe, it, expect, beforeEach } from "vitest";
import { CONFIG } from "../../src/config.js";
import { runFixedPhysicsStep } from "../../src/simulation.js";
import * as GameState from "../../src/stores/gameStore.js";

const SLOW = CONFIG.ramming.minSpeed * 0.4; // below qualification
const FAST = CONFIG.ramming.minSpeed * 2.5; // well above qualification

function makeCart(slotIndex, z, vz) {
  const cart = {
    slotIndex,
    vel: { x: 0, y: 0, z: vz },
    body: {
      translation: () => ({ x: 0, y: 0, z }),
      linvel: () => ({ ...cart.vel }),
      applyImpulse: () => {},
    },
    collider: { handle: 100 + slotIndex },
    pendingRam: null,
    respawnAtMs: null,
    isSuddenDeathSpectator: false,
  };
  return cart;
}

function makeEventQueue() {
  let pending = [];
  return {
    queue(h1, h2, started) {
      pending.push([h1, h2, started]);
    },
    drainCollisionEvents(cb) {
      const batch = pending;
      pending = [];
      for (const [h1, h2, s] of batch) cb(h1, h2, s);
    },
  };
}

function makeCallbacks(log) {
  return {
    playCollision: (intensity, opts) => log.push(["crash", intensity, opts]),
    playSoftContact: (closingSpeed) => log.push(["soft", closingSpeed]),
  };
}

function step(allCarts, eventQueue, now, callbacks) {
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
    callbacks,
  });
}

describe("AUDIO-RAM-IMPACT-1 soft contact taps", () => {
  beforeEach(() => {
    GameState.replaceLastHitBy(new Map());
  });

  it("a sub-minSpeed touch plays a soft tap instead of silence (no credit, no knockback)", () => {
    const rammer = makeCart(0, 5, -SLOW);
    const victim = makeCart(1, 0, 0);
    const eq = makeEventQueue();
    const log = [];

    eq.queue(rammer.collider.handle, victim.collider.handle, true);
    step([rammer, victim], eq, 1000, makeCallbacks(log));

    expect(GameState.getLastHitBy().get(1)).toBeUndefined(); // still no scoring credit
    expect(victim.pendingRam).toBeNull(); // and no knockback
    expect(log).toHaveLength(1);
    expect(log[0][0]).toBe("soft");
    expect(log[0][1]).toBeGreaterThan(0); // real closing speed, not a flat flag
  });

  it("a fast qualifying hit fires only the crash — no double-fire with the soft layer", () => {
    const rammer = makeCart(2, 5, -FAST);
    const victim = makeCart(3, 0, 0);
    const eq = makeEventQueue();
    const log = [];

    eq.queue(rammer.collider.handle, victim.collider.handle, true);
    step([rammer, victim], eq, 5000, makeCallbacks(log));

    expect(victim.pendingRam).not.toBeNull();
    expect(log.map((e) => e[0])).toEqual(["crash"]);
  });

  it("sustained grinding re-taps on a cooldown, not every substep", () => {
    const rammer = makeCart(0, 5, -SLOW);
    const victim = makeCart(1, 0, 0);
    const eq = makeEventQueue();
    const log = [];
    const cbs = makeCallbacks(log);

    eq.queue(rammer.collider.handle, victim.collider.handle, true);
    step([rammer, victim], eq, 1000, cbs);
    const afterTouch = log.length;
    expect(afterTouch).toBe(1); // started-edge tap

    step([rammer, victim], eq, 1016, cbs); // 16 ms later, still grinding
    step([rammer, victim], eq, 1032, cbs);
    expect(log.length).toBe(afterTouch); // cooldown holds

    step([rammer, victim], eq, 1300, cbs); // past the soft-tap cooldown
    expect(log.length).toBe(afterTouch + 1);
    expect(log[log.length - 1][0]).toBe("soft");
  });

  it("an accelerating shove still qualifies mid-contact despite earlier soft taps", () => {
    const rammer = makeCart(0, 5, -SLOW);
    const victim = makeCart(1, 0, 0);
    const eq = makeEventQueue();
    const log = [];

    eq.queue(rammer.collider.handle, victim.collider.handle, true);
    step([rammer, victim], eq, 1000, makeCallbacks(log));
    expect(log[0][0]).toBe("soft");

    rammer.vel.z = -FAST; // accelerate into a real shove while still in contact
    step([rammer, victim], eq, 1600, makeCallbacks(log));
    const hit = GameState.getLastHitBy().get(1);
    expect(hit).toBeDefined(); // credit lands mid-contact — soft taps must not suppress it
    expect(hit.attackerSlotIndex).toBe(0);
    expect(log.some((e) => e[0] === "crash")).toBe(true);
  });
});
