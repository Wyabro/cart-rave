// @vitest-environment happy-dom
// sustainedContactRam.test.js — ram qualification must not be a one-shot at first touch.
//
// * Bug (playtest "hits do nothing" / unattributed falls; proven by a 100 s 3-NPC diagnostic
// * soak with 6 falls and ZERO attributed rams): Rapier only emits a collision event on the
// * started edge, so `processCollisionEvents` attempted ram qualification exactly once per
// * touch — at the (often slow) first-contact velocity. Two carts that drifted together and
// * then ground against each other could accelerate/boost/shove with no attribution and no
// * knockback EVER qualifying, because no new contact-start ever fired.
// * Fix: cart pairs in sustained contact are re-offered to resolveCartRamCollision each
// * substep on a per-pair cooldown (RAM_SUSTAINED_REQUALIFY_MS), pruned on the stopped edge.

import { describe, it, expect, beforeEach } from "vitest";
import { CONFIG } from "../../src/config.js";
import { runFixedPhysicsStep } from "../../src/simulation.js";
import * as GameState from "../../src/stores/gameStore.js";

const SLOW = CONFIG.ramming.minSpeed * 0.2; // below qualification
const FAST = CONFIG.ramming.minSpeed * 2.5; // well above qualification

/**
 * Mutable-velocity cart mock. `linvel` is read both by the pre-step capture loop
 * (qualification signal) and applyRammingImpulse's live read (knockback signal).
 */
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

/** Scripted Rapier event queue: `queue(h1, h2, started)` events for the NEXT drain only. */
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

function step(allCarts, eventQueue, now) {
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

describe("sustained-contact ram re-qualification", () => {
  beforeEach(() => {
    GameState.replaceLastHitBy(new Map());
  });

  it("a slow first touch that later turns into a real shove qualifies mid-contact", () => {
    // Rammer at z=5 creeping toward the victim at z=0 — first touch is sub-minSpeed.
    const rammer = makeCart(0, 5, -SLOW);
    const victim = makeCart(1, 0, 0);
    const eq = makeEventQueue();

    eq.queue(rammer.collider.handle, victim.collider.handle, true);
    step([rammer, victim], eq, 1000);
    expect(GameState.getLastHitBy().get(1)).toBeUndefined(); // slow touch: correctly no credit
    expect(victim.pendingRam).toBeNull();

    // Still in contact (no new started event) — the rammer accelerates into a real shove.
    rammer.vel.z = -FAST;
    step([rammer, victim], eq, 1600);
    const hit = GameState.getLastHitBy().get(1);
    expect(hit).toBeDefined();
    expect(hit.attackerSlotIndex).toBe(0); // attribution landed mid-contact
    expect(victim.pendingRam).not.toBeNull(); // and so did the knockback
  });

  it("the per-pair cooldown stops a single sustained hit from machine-gunning impulses", () => {
    const rammer = makeCart(0, 5, -FAST);
    const victim = makeCart(1, 0, 0);
    const eq = makeEventQueue();

    eq.queue(rammer.collider.handle, victim.collider.handle, true);
    step([rammer, victim], eq, 1000); // fires on the started edge (pre-fix behavior kept)
    expect(victim.pendingRam).not.toBeNull();

    victim.pendingRam = null; // consume, then step again inside the cooldown window
    step([rammer, victim], eq, 1016);
    expect(victim.pendingRam).toBeNull(); // no re-fire at +16ms

    step([rammer, victim], eq, 1000 + 600); // past the cooldown, still in contact & closing
    expect(victim.pendingRam).not.toBeNull(); // sustained shove re-fires
  });

  it("a separated pair (stopped edge) is no longer re-qualified", () => {
    const rammer = makeCart(0, 5, -SLOW);
    const victim = makeCart(1, 0, 0);
    const eq = makeEventQueue();

    eq.queue(rammer.collider.handle, victim.collider.handle, true);
    step([rammer, victim], eq, 1000);

    eq.queue(rammer.collider.handle, victim.collider.handle, false); // contact ends
    step([rammer, victim], eq, 1100);

    rammer.vel.z = -FAST; // fast now, but not touching — must NOT credit
    step([rammer, victim], eq, 2000);
    expect(GameState.getLastHitBy().get(1)).toBeUndefined();
    expect(victim.pendingRam).toBeNull();
  });

  it("a fast clean hit still fires immediately on the started edge (behavior preserved)", () => {
    const rammer = makeCart(2, 5, -FAST);
    const victim = makeCart(3, 0, 0);
    const eq = makeEventQueue();

    eq.queue(rammer.collider.handle, victim.collider.handle, true);
    step([rammer, victim], eq, 5000);
    const hit = GameState.getLastHitBy().get(3);
    expect(hit).toBeDefined();
    expect(hit.attackerSlotIndex).toBe(2);
    expect(victim.pendingRam).not.toBeNull();
  });
});
