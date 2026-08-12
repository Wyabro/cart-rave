// @vitest-environment happy-dom
// ramContactStale.test.js — stale sustained-contact pairs must not re-qualify a ram.
//
// * Bug (RAM-CONTACT-STALE-1): `_activeCartContacts` pruned by collider identity only and
// * otherwise relied entirely on Rapier's collision-stopped event. A missed stopped edge —
// * teleport-to-spawn while touching, or setEnabled(false) for a Sudden Death spectator
// * mid-contact — left the pair in the map, so it re-fired a fully attributed ram +
// * knockback every 500 ms from across the arena whenever the geometric cone realigned.
// * Fix: (1) the sustained-contact sweep drops any pair whose planar separation exceeds a
// * ~two-cart-length guard; (2) resetCartTransientState clears the reset cart's entries.

import { describe, it, expect, beforeEach } from "vitest";
import { CONFIG } from "../src/config.js";
import { runFixedPhysicsStep } from "../src/simulation.js";
import { resetCartTransientState } from "../src/entities.js";
import * as GameState from "../src/stores/gameStore.js";

const SLOW = CONFIG.ramming.minSpeed * 0.2; // below qualification
const FAST = CONFIG.ramming.minSpeed * 2.5; // well above qualification

/**
 * Mutable-velocity + mutable-position cart mock. `translation()` reads `cart.z` so a test
 * can teleport a cart (respawn path) without a stopped collision event.
 */
function makeCart(slotIndex, z, vz) {
  const cart = {
    slotIndex,
    z,
    vel: { x: 0, y: 0, z: vz },
    body: {
      translation: () => ({ x: 0, y: 0, z: cart.z }),
      linvel: () => ({ ...cart.vel }),
      applyImpulse: () => {},
      setLinvel: () => {},
      setAngvel: () => {},
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

describe("RAM-CONTACT-STALE-1 stale sustained-contact hygiene", () => {
  beforeEach(() => {
    GameState.replaceLastHitBy(new Map());
  });

  it("a pair separated beyond the max-separation guard is evicted and cannot re-qualify", () => {
    const rammer = makeCart(0, 5, -SLOW);
    const victim = makeCart(1, 0, 0);
    const eq = makeEventQueue();

    eq.queue(rammer.collider.handle, victim.collider.handle, true);
    step([rammer, victim], eq, 1000);
    expect(GameState.getLastHitBy().get(1)).toBeUndefined(); // slow touch: pair tracked, no credit

    // * The stopped edge never fires (teleport-to-spawn while touching): the rammer is
    // * now across the arena with the pair still tracked.
    rammer.z = 45;
    rammer.vel.z = -FAST; // geometrically aimed at the victim — would qualify on speed+angle

    // * 45 m is far beyond the ~two-cart-length guard, so the pair is dropped before the
    // * cone can realign and re-fire a fully attributed ram + knockback.
    step([rammer, victim], eq, 2000);
    expect(GameState.getLastHitBy().get(1)).toBeUndefined();
    expect(victim.pendingRam).toBeNull();
  });

  it("resetCartTransientState removes the reset cart's tracked contact pairs", () => {
    const rammer = makeCart(0, 5, -SLOW);
    const victim = makeCart(1, 0, 0);
    const eq = makeEventQueue();

    eq.queue(rammer.collider.handle, victim.collider.handle, true);
    step([rammer, victim], eq, 1000);
    expect(GameState.getLastHitBy().get(1)).toBeUndefined(); // slow touch: pair tracked, no credit

    // * Respawn path: transient state resets, which must also drop the victim's entry.
    resetCartTransientState(victim);

    // * Carts are STILL within the separation guard and the rammer now shoves fast.
    // * With the reset having removed the pair (and no new started event), the sweep
    // * cannot re-qualify — a surviving stale entry would have fired right here.
    rammer.vel.z = -FAST;
    step([rammer, victim], eq, 2000);
    expect(GameState.getLastHitBy().get(1)).toBeUndefined();
    expect(victim.pendingRam).toBeNull();
  });
});
