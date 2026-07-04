// @vitest-environment happy-dom
// netcode.test.js — buffer/interp/reconcile math against the real module (no socket).
// happy-dom environment: netcode.js transitively imports nipplejs, which touches
// window at module scope.

import { beforeEach, describe, expect, it } from "vitest";
import {
  __netcodeTestHooks as hooks,
  declashNpcSlotColors,
  reconcilePredictedLocalCart,
  sampleAuthoritativeCartState,
} from "../src/netcode.js";
import { CONFIG } from "../src/config.js";

/** Builds a per-slot snapshot array with one cart at the given pose. */
function snap(x, y, z, extra = {}) {
  return [{
    p: [x, y, z],
    q: extra.q ?? [0, 0, 0, 1],
    lv: extra.lv ?? [0, 0, 0],
    av: extra.av ?? [0, 0, 0],
  }];
}

/** Minimal Rapier-body stand-in tracking pose/velocity writes. */
function mockCart(pose = {}) {
  const state = {
    t: pose.t ?? { x: 0, y: 0, z: 0 },
    r: pose.r ?? { x: 0, y: 0, z: 0, w: 1 },
    lv: pose.lv ?? { x: 0, y: 0, z: 0 },
    av: pose.av ?? { x: 0, y: 0, z: 0 },
  };
  return {
    state,
    body: {
      translation: () => state.t,
      rotation: () => state.r,
      linvel: () => state.lv,
      angvel: () => state.av,
      setTranslation: (v) => { state.t = { ...v }; },
      setRotation: (v) => { state.r = { ...v }; },
      setLinvel: (v) => { state.lv = { ...v }; },
      setAngvel: (v) => { state.av = { ...v }; },
    },
  };
}

beforeEach(() => hooks.resetNetState());

describe("bufferAuthoritativeState", () => {
  it("drops stale and duplicate sequence numbers", () => {
    hooks.bufferState(1000, 5, snap(0, 0, 0));
    hooks.bufferState(1025, 5, snap(1, 0, 0)); // dup seq
    hooks.bufferState(1050, 4, snap(2, 0, 0)); // regression
    expect(hooks.getBufferLength()).toBe(1);
    hooks.bufferState(1025, 6, snap(1, 0, 0));
    expect(hooks.getBufferLength()).toBe(2);
  });

  it("caps the buffer at CONFIG.net.stateBufferMaxSize", () => {
    const max = CONFIG.net.stateBufferMaxSize;
    for (let i = 0; i < max + 10; i += 1) hooks.bufferState(1000 + i * 25, i + 1, snap(i, 0, 0));
    expect(hooks.getBufferLength()).toBe(max);
  });

  it("rejects non-finite timestamps and malformed carts", () => {
    hooks.bufferState(NaN, 1, snap(0, 0, 0));
    hooks.bufferState(1000, Infinity, snap(0, 0, 0));
    hooks.bufferState(1000, 1, null);
    expect(hooks.getBufferLength()).toBe(0);
  });
});

describe("findSnapshotPair", () => {
  it("brackets a target between snapshots", () => {
    hooks.bufferState(1000, 1, snap(0, 0, 0));
    hooks.bufferState(1100, 2, snap(10, 0, 0));
    const { before, after } = hooks.findSnapshotPair(1050);
    expect(before.serverNowMs).toBe(1000);
    expect(after.serverNowMs).toBe(1100);
  });

  it("returns only `before` when the target is past the newest snapshot", () => {
    hooks.bufferState(1000, 1, snap(0, 0, 0));
    const { before, after } = hooks.findSnapshotPair(2000);
    expect(before.serverNowMs).toBe(1000);
    expect(after).toBeNull();
  });

  it("returns only `after` when the target predates the oldest snapshot", () => {
    hooks.bufferState(1000, 1, snap(0, 0, 0));
    const { before, after } = hooks.findSnapshotPair(500);
    expect(before).toBeNull();
    expect(after.serverNowMs).toBe(1000);
  });
});

describe("sampleAuthoritativeCartState", () => {
  it("lerps position at the bracketed alpha", () => {
    hooks.bufferState(1000, 1, snap(0, 0, 0));
    hooks.bufferState(1100, 2, snap(10, 0, 20));
    const s = sampleAuthoritativeCartState(0, 1050);
    expect(s.p[0]).toBeCloseTo(5, 6);
    expect(s.p[2]).toBeCloseTo(10, 6);
  });

  it("clamps alpha to the snapshot pair endpoints", () => {
    hooks.bufferState(1000, 1, snap(0, 0, 0));
    hooks.bufferState(1100, 2, snap(10, 0, 0));
    // Bracketed pair only exists for targets < after; equal-past target uses extrapolation path.
    const s = sampleAuthoritativeCartState(0, 1099);
    expect(s.p[0]).toBeLessThanOrEqual(10);
  });

  it("extrapolates from velocity beyond the newest snapshot, capped", () => {
    hooks.bufferState(1000, 1, snap(0, 0, 0, { lv: [10, 0, 0] }));
    const capS = CONFIG.net.extrapolationCapMs / 1000;
    const s = sampleAuthoritativeCartState(0, 1000 + CONFIG.net.extrapolationCapMs + 500);
    expect(s.p[0]).toBeCloseTo(10 * capS, 6); // 50ms cap → 0.5m at 10 m/s
  });

  it("slerps quaternions through the bracketed pair", () => {
    const qIdent = [0, 0, 0, 1];
    const q90 = [0, Math.SQRT1_2, 0, Math.SQRT1_2]; // 90° about Y
    hooks.bufferState(1000, 1, snap(0, 0, 0, { q: qIdent }));
    hooks.bufferState(1100, 2, snap(0, 0, 0, { q: q90 }));
    const s = sampleAuthoritativeCartState(0, 1050);
    // Halfway slerp of a 90° Y rotation = 45°: y = sin(22.5°), w = cos(22.5°)
    expect(s.q[1]).toBeCloseTo(Math.sin(Math.PI / 8), 5);
    expect(s.q[3]).toBeCloseTo(Math.cos(Math.PI / 8), 5);
  });
});

describe("reconcilePredictedLocalCart", () => {
  it("skips corrections inside the dead zone", () => {
    hooks.bufferState(1000, 1, snap(0.05, 0, 0));
    const cart = mockCart();
    reconcilePredictedLocalCart(cart, 0, 1 / 60);
    expect(cart.state.t.x).toBe(0); // err 0.05 < minErrorM 0.12 → untouched
  });

  it("teleports past maxCorrectionM", () => {
    hooks.bufferState(1000, 1, snap(50, 0, 0));
    const cart = mockCart();
    reconcilePredictedLocalCart(cart, 0, 1 / 60);
    expect(cart.state.t.x).toBe(50); // err 50 > 4.0 → snap
  });

  it("moves a fraction of the error toward authority in the smooth band", () => {
    hooks.bufferState(1000, 1, snap(1, 0, 0));
    const cart = mockCart();
    reconcilePredictedLocalCart(cart, 0, 1 / 60);
    const expectedAlpha = 1 - Math.exp(-CONFIG.net.prediction.reconcilePosRate / 60);
    expect(cart.state.t.x).toBeCloseTo(expectedAlpha, 6);
    expect(cart.state.t.x).toBeGreaterThan(0);
    expect(cart.state.t.x).toBeLessThan(1);
  });

  it("yaw-only: corrects heading without touching an upright cart's pitch/roll", () => {
    // Authority: cart rotated 90° about Y, 1m away (inside smooth band).
    hooks.bufferState(1000, 1, snap(1, 0, 0, { q: [0, Math.SQRT1_2, 0, Math.SQRT1_2] }));
    const cart = mockCart();
    reconcilePredictedLocalCart(cart, 0, 1 / 60);
    const r = cart.state.r;
    // Rotation applied about Y only: x and z stay ~0.
    expect(Math.abs(r.x)).toBeLessThan(1e-9);
    expect(Math.abs(r.z)).toBeLessThan(1e-9);
    expect(Math.abs(r.y)).toBeGreaterThan(0); // heading moved toward authority
  });

  it("falls back to full slerp when flip state disagrees", () => {
    // Authority: cart flipped 180° about Z (upside down).
    hooks.bufferState(1000, 1, snap(1, 0, 0, { q: [0, 0, 1, 0] }));
    const cart = mockCart();
    reconcilePredictedLocalCart(cart, 0, 1 / 60);
    // Full slerp path engages roll: z component must move off zero.
    expect(Math.abs(cart.state.r.z)).toBeGreaterThan(0);
  });
});

describe("declashNpcSlotColors", () => {
  it("re-rolls an NPC color that collides with a human preset", () => {
    const slots = [
      { kind: "human", color: "pink", connId: "a" },
      { kind: "npc", color: "pink" },
      { kind: "npc", color: "blue" },
      null,
    ];
    const out = declashNpcSlotColors(slots);
    expect(out[1].color).not.toBe("pink");
    expect(out[2].color).toBe("blue");
  });
});
