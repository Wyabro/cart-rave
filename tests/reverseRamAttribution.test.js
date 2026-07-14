// @vitest-environment happy-dom
// reverseRamAttribution.test.js — a reverse shove that knocks a cart off the edge must be
// credited to the shover (AI-1 / playtest 2026-07-14).
//
// * Bug: cart-on-cart ram qualification read POST-step linvel. A reverse shove
// * (reverseMaxSpeed 8 m/s) carries little momentum, so Rapier's contact solver arrests
// * (or bounces) it within the same world.step(). Post-step linvel then reads ~0, the hit
// * fails `ramming.minSpeed`/alignment, and no ram is credited — yet the victim is still
// * knocked off by raw contact response → "FELL OFF", no attacker, no points.
// * Fix: qualify + attribute from the PRE-step snapshot (`_preStepLinvel`) — the closing
// * velocity at the instant of contact, the same signal the floor-thud impact uses.

import { describe, it, expect } from "vitest";
import { CONFIG } from "../src/config.js";
import {
  getRammingQualificationScore,
  resolveCartRamCollision,
} from "../src/simulation.js";

/** A ram-state buffer as read by the qualification math (planar pos + linvel). */
function state(pos, linvel) {
  return { pos: { ...pos }, linvel: { ...linvel } };
}

/** Minimal cart with post-step body linvel + a pre-step snapshot the fix reads. */
function makeCart(slotIndex, pos, postLinvel, preLinvel) {
  return {
    slotIndex,
    body: {
      translation: () => ({ ...pos }),
      linvel: () => ({ ...postLinvel }),
    },
    collider: { handle: slotIndex },
    _preStepLinvel: preLinvel ? { ...preLinvel } : null,
    respawnAtMs: null,
    isSuddenDeathSpectator: false,
  };
}

describe("getRammingQualificationScore (velocity is direction-agnostic)", () => {
  // * Victim at origin; rammer 5m away on +Z. To close, the rammer's velocity must point
  // * toward the victim (−Z). The function never sees cart HEADING — a reverse impact whose
  // * velocity points at the victim is a valid ram, exactly like a forward one.
  const rammerPos = { x: 0, y: 0, z: 5 };
  const victimPos = { x: 0, y: 0, z: 0 };

  it("qualifies a shove whose velocity points at the victim (reverse-closing)", () => {
    const rammer = state(rammerPos, { x: 0, y: 0, z: -6 }); // moving toward victim
    const victim = state(victimPos, { x: 0, y: 0, z: 0 });
    const score = getRammingQualificationScore(rammer, victim);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeCloseTo(6, 5); // stationary victim → closingSpeed == rammer speed
  });

  it("rejects a contact-arrested velocity (why post-step linvel fails the reverse shove)", () => {
    // * Post-step: the solver zeroed the reverse closing velocity — below ramming.minSpeed.
    const rammer = state(rammerPos, { x: 0, y: 0, z: 0.15 });
    const victim = state(victimPos, { x: 0, y: 0, z: 0 });
    expect(getRammingQualificationScore(rammer, victim)).toBe(0);
    expect(0.15).toBeLessThan(CONFIG.ramming.minSpeed);
  });

  it("still rejects a sideways brush (alignment cone guards over-crediting)", () => {
    // * Fast, but travelling perpendicular to the victim — not a ram.
    const rammer = state(rammerPos, { x: 6, y: 0, z: 0 });
    const victim = state(victimPos, { x: 0, y: 0, z: 0 });
    expect(getRammingQualificationScore(rammer, victim)).toBe(0);
  });
});

describe("resolveCartRamCollision (reads pre-step velocity)", () => {
  it("credits the reverse shover even when its post-step velocity is arrested", () => {
    // * Shover: post-step linvel ~0 (contact killed it), but pre-step was reversing at 6 m/s
    // * straight into the victim. Old post-step read → null (no credit); fix → shover is rammer.
    const shover = makeCart(
      0,
      { x: 0, y: 0, z: 5 },
      { x: 0, y: 0, z: 0.1 }, // post-step: arrested
      { x: 0, y: 0, z: -6 }, // pre-step: reversing toward the victim
    );
    const victim = makeCart(1, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 });

    const ram = resolveCartRamCollision(shover, victim);
    expect(ram).not.toBeNull();
    expect(ram.rammer).toBe(shover);
    expect(ram.victim).toBe(victim);
    // * Proves it attributed off the pre-step snapshot, not the arrested post-step linvel.
    expect(ram.rammerState.linvel.z).toBeCloseTo(-6, 5);
  });

  it("returns null when neither cart had closing velocity at impact", () => {
    const a = makeCart(0, { x: 0, y: 0, z: 5 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 });
    const b = makeCart(1, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 });
    expect(resolveCartRamCollision(a, b)).toBeNull();
  });

  it("falls back to live linvel when no pre-step snapshot exists yet", () => {
    // * First frame a cart exists: _preStepLinvel is null → read body.linvel().
    const shover = makeCart(0, { x: 0, y: 0, z: 5 }, { x: 0, y: 0, z: -6 }, null);
    const victim = makeCart(1, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, null);
    const ram = resolveCartRamCollision(shover, victim);
    expect(ram).not.toBeNull();
    expect(ram.rammer).toBe(shover);
  });
});
