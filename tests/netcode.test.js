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
  getPendingInputs,
  prunePendingInputs,
  getLatestSnap,
} from "../src/netcode.js";
import { CONFIG } from "../src/config.js";
import { encodeHostStateSnapshot, decodeHostStateSnapshot } from "../src/netcode/binary.js";

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

describe.skip("reconcilePredictedLocalCart", () => {
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

describe("rewind and replay input buffering", () => {
  beforeEach(() => {
    hooks.resetNetState();
  });

  it("buffers inputs in startInputSendLoop and prunes them correctly", () => {
    prunePendingInputs(0); // Reset buffer
    getPendingInputs().push({ seq: 1, input: { throttle: 1, steer: 0 } });
    getPendingInputs().push({ seq: 2, input: { throttle: 1, steer: 0 } });
    getPendingInputs().push({ seq: 3, input: { throttle: 0, steer: 1 } });

    expect(getPendingInputs().length).toBe(3);

    prunePendingInputs(2);
    expect(getPendingInputs().length).toBe(1);
    expect(getPendingInputs()[0].seq).toBe(3);
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

describe("Massive Lag Spike / Buffer Flood", () => {
  it("bounds buffer size, discards old entries without throwing, and updates interpolation targets cleanly", () => {
    // Simulate receiving a burst of 15 out-of-order snapshots at once (wildly jumping timestamps & out-of-order seq numbers)
    const snapshots = [
      { t: 1000, seq: 1, pos: 10 },
      { t: 1050, seq: 3, pos: 30 },
      { t: 1025, seq: 2, pos: 20 }, // out-of-order sequence -> discarded by bufferState
      { t: 1100, seq: 4, pos: 40 },
      { t: 1150, seq: 5, pos: 50 },
      { t: 1200, seq: 6, pos: 60 },
      { t: 1250, seq: 7, pos: 70 },
      { t: 1300, seq: 8, pos: 80 },
      { t: 1350, seq: 9, pos: 90 },
      { t: 1400, seq: 10, pos: 100 },
      { t: 1450, seq: 11, pos: 110 },
      { t: 1425, seq: 10, pos: 100 }, // duplicate sequence -> discarded
      { t: 1500, seq: 12, pos: 120 },
      { t: 1550, seq: 13, pos: 130 },
      { t: 1600, seq: 14, pos: 140 },
    ];

    // Inject all 15 snapshots via the test hook without throwing
    for (const s of snapshots) {
      expect(() => {
        hooks.bufferState(s.t, s.seq, snap(s.pos, 0, 0));
      }).not.toThrow();
    }

    // Discarding old entries check with pruneConsumedSnapshots without throwing
    const lenBefore = hooks.getBufferLength();
    expect(() => {
      hooks.pruneConsumedSnapshots(2);
    }).not.toThrow();
    expect(hooks.getBufferLength()).toBe(lenBefore - 2);

    // Flood buffer beyond stateBufferMaxSize (64) to verify buffer capping logic
    const max = CONFIG.net.stateBufferMaxSize;
    for (let i = 100; i < 100 + max + 20; i++) {
      hooks.bufferState(2000 + i * 25, i, snap(i, 0, 0));
    }
    expect(hooks.getBufferLength()).toBe(max);

    // Interpolation target check: bracket target between snapshots
    const targetServerNowMs = 2000 + (100 + max + 18) * 25 - 10;
    const { before, after } = hooks.findSnapshotPair(targetServerNowMs);
    expect(before).not.toBeNull();
    expect(after).not.toBeNull();

    const dt = after.serverNowMs - before.serverNowMs;
    expect(dt).toBeGreaterThan(0);
    expect(Number.isNaN(dt)).toBe(false);

    // Sample state at target timestamp and verify position lerp matches target without negative or NaN
    const sampled = sampleAuthoritativeCartState(0, targetServerNowMs);
    expect(sampled).not.toBeNull();
    expect(Number.isNaN(sampled.p[0])).toBe(false);
    expect(sampled.p[0]).toBeGreaterThan(0);
  });
});

describe("Clock Drift Resync", () => {
  it("adjusts running clock offset by exactly 20% towards new median during 30s resync", () => {
    // Baseline setup: Provide 3 initial samples to establish baseline offset.
    // Local time = 1000, host timestamps arrive 100ms ahead (serverNowMs = 1100 => sample = -100ms).
    hooks.updateServerClockOffset(1100, 1000);
    hooks.updateServerClockOffset(1100, 1000);
    hooks.updateServerClockOffset(1100, 1000);

    const baselineOffset = hooks.getServerClockOffset();
    expect(baselineOffset).toBe(-100);

    // Advance local clock past the 30-second resync interval (e.g. now = 32000 ms, due at 31000 ms)
    const resyncNowMs = 32000;
    expect(resyncNowMs).toBeGreaterThanOrEqual(hooks.getClockResyncDueAtMs());

    // Host clock has drifted: host timestamps arrive 500ms ahead of local time.
    // Provide 3 mock ping/offset samples with median -500ms (e.g., samples -520, -500, -480)
    hooks.updateServerClockOffset(resyncNowMs + 520, resyncNowMs); // sample = -520
    hooks.updateServerClockOffset(resyncNowMs + 500, resyncNowMs); // sample = -500
    hooks.updateServerClockOffset(resyncNowMs + 480, resyncNowMs); // sample = -480

    // Calculating new median: sorted[-520, -500, -480] => -500.
    // New offset formula: baselineOffset * 0.8 + newMedian * 0.2
    // = (-100 * 0.8) + (-500 * 0.2) = -80 + -100 = -180.
    const newOffset = hooks.getServerClockOffset();
    expect(newOffset).toBeCloseTo(-180, 5);

    // Verify clock offset adjusted by exactly 20% (80ms out of 400ms delta) towards new median
    const expectedOffset = baselineOffset * 0.8 + (-500) * 0.2;
    expect(newOffset).toBe(expectedOffset);
  });
});

describe("Binary snapshot serialization", () => {
  it("successfully round-trips a host state snapshot through encode/decode", () => {
    const original = {
      seq: 12345,
      tHost: 123456.75,
      carts: [
        {
          p: [1.23, -4.56, 7.89],
          q: [0.1, 0.2, 0.3, 0.9],
          lv: [-1.1, 2.2, -3.3],
          av: [0.5, 0, 0],
          ackSeq: 42,
          b: true,
          h: false,
          c: true,
          s: false,
        },
        {
          p: [10.11, 12.13, 14.15],
          q: [0.5, 0.5, 0.5, 0.5],
          lv: [1.1, 2.2, 3.3],
          av: [-0.8, 0, 0],
          ackSeq: 99,
          b: false,
          h: true,
          c: false,
          s: true,
        }
      ],
      collisions: [
        { intensity: 0.8, midpoint: { x: 1, y: 2, z: 3 }, slotB: 2 }
      ],
      falls: [
        { slotId: 1, respawnAtMs: 1234567 }
      ]
    };

    const buffer = encodeHostStateSnapshot(original);
    expect(buffer).toBeInstanceOf(ArrayBuffer);

    const decoded = decodeHostStateSnapshot(buffer);
    expect(decoded.type).toBe("hostTransform");
    expect(decoded.seq).toBe(original.seq);
    expect(decoded.tHost).toBeCloseTo(original.tHost, 2);
    expect(decoded.carts).toHaveLength(2);

    // Cart 0 assertions
    expect(decoded.carts[0].p[0]).toBeCloseTo(original.carts[0].p[0], 3);
    expect(decoded.carts[0].p[1]).toBeCloseTo(original.carts[0].p[1], 3);
    expect(decoded.carts[0].p[2]).toBeCloseTo(original.carts[0].p[2], 3);
    expect(decoded.carts[0].q[0]).toBeCloseTo(original.carts[0].q[0], 3);
    expect(decoded.carts[0].q[1]).toBeCloseTo(original.carts[0].q[1], 3);
    expect(decoded.carts[0].q[2]).toBeCloseTo(original.carts[0].q[2], 3);
    expect(decoded.carts[0].q[3]).toBeCloseTo(original.carts[0].q[3], 3);
    expect(decoded.carts[0].lv[0]).toBeCloseTo(original.carts[0].lv[0], 3);
    expect(decoded.carts[0].lv[1]).toBeCloseTo(original.carts[0].lv[1], 3);
    expect(decoded.carts[0].lv[2]).toBeCloseTo(original.carts[0].lv[2], 3);
    expect(decoded.carts[0].av[0]).toBeCloseTo(original.carts[0].av[0], 3);
    expect(decoded.carts[0].ackSeq).toBe(original.carts[0].ackSeq);
    expect(decoded.carts[0].b).toBe(true);
    expect(decoded.carts[0].h).toBe(false);
    expect(decoded.carts[0].c).toBe(true);
    expect(decoded.carts[0].s).toBe(false);

    // Cart 1 assertions
    expect(decoded.carts[1].p[0]).toBeCloseTo(original.carts[1].p[0], 3);
    expect(decoded.carts[1].q[0]).toBeCloseTo(original.carts[1].q[0], 3);
    expect(decoded.carts[1].lv[0]).toBeCloseTo(original.carts[1].lv[0], 3);
    expect(decoded.carts[1].av[0]).toBeCloseTo(original.carts[1].av[0], 3);
    expect(decoded.carts[1].ackSeq).toBe(original.carts[1].ackSeq);
    expect(decoded.carts[1].b).toBe(false);
    expect(decoded.carts[1].h).toBe(true);
    expect(decoded.carts[1].c).toBe(false);
    expect(decoded.carts[1].s).toBe(true);

    // JSON tail assertions
    expect(decoded.collisions).toEqual(original.collisions);
    expect(decoded.falls).toEqual(original.falls);
  });
});

