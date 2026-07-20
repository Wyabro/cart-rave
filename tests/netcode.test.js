// @vitest-environment happy-dom
// netcode.test.js — buffer/interp/reconcile math against the real module (no socket).
// happy-dom environment: netcode.js transitively imports nipplejs, which touches
// window at module scope.

import { beforeEach, describe, expect, it } from "vitest";
import {
  __netcodeTestHooks as hooks,
  declashNpcSlotColors,
  sampleAuthoritativeCartState,
  getPendingInputs,
  prunePendingInputs,
  getLatestSnap,
  applyCartState,
  resetClientPredictionState,
  serializeCartToWire,
} from "../src/netcode.js";
import { resetReconciliationState } from "../src/gameLoop.js";
import { CONFIG } from "../src/config.js";
import { MSG } from "../shared/protocol.js";
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

describe("rewind and replay input buffering", () => {
  beforeEach(() => {
    hooks.resetNetState();
  });

  it("buffers and prunes pending inputs by acknowledged seq", () => {
    prunePendingInputs(0); // Reset buffer
    getPendingInputs().push({ seq: 1, input: { throttle: 1, steer: 0 } });
    getPendingInputs().push({ seq: 2, input: { throttle: 1, steer: 0 } });
    getPendingInputs().push({ seq: 3, input: { throttle: 0, steer: 1 } });

    expect(getPendingInputs().length).toBe(3);

    prunePendingInputs(2);
    expect(getPendingInputs().length).toBe(1);
    expect(getPendingInputs()[0].seq).toBe(3);
  });

  it("resetClientPredictionState clears pending inputs and the snapshot buffer", () => {
    // * Drain any leftover frames from prior cases (pendingInputs is module state).
    prunePendingInputs(Number.MAX_SAFE_INTEGER);
    getPendingInputs().push({ seq: 9, input: { throttle: 1, steer: 0 } });
    hooks.bufferState(1000, 50, snap(1, 0, 0));
    expect(getPendingInputs().length).toBe(1);
    expect(hooks.getBufferLength()).toBe(1);

    resetClientPredictionState();
    resetReconciliationState();

    expect(getPendingInputs().length).toBe(0);
    expect(hooks.getBufferLength()).toBe(0);
    // * After reset, a low seq (as after host migration hostSeq=0) is accepted again.
    hooks.bufferState(2000, 1, snap(2, 0, 0));
    expect(hooks.getBufferLength()).toBe(1);
    expect(getLatestSnap()?.seq).toBe(1);
  });

  it("caps pending prediction inputs so a stalled snapshot stream cannot grow unbounded", () => {
    hooks.resetNetState();
    const max = CONFIG.net.predictionPendingInputsMax ?? 24;
    for (let i = 1; i <= max + 40; i += 1) {
      hooks.pushPendingInputForTest(i);
    }
    expect(getPendingInputs().length).toBe(max);
    // * Oldest frames dropped — remaining are the newest `max` seqs.
    expect(getPendingInputs()[0].seq).toBe(41);
    expect(getPendingInputs()[max - 1].seq).toBe(max + 40);
  });
});

describe("non-host countdown hold (cap-59/61/63)", () => {
  beforeEach(() => {
    hooks.resetNetState();
    hooks.setIsSessionPlayReadyForTest(() => true);
  });

  it("holds countdown for non-host when session play is not ready", () => {
    hooks.setIsSessionPlayReadyForTest(() => false);
    expect(hooks.shouldHoldNonHostCountdownPhase("countdown", false)).toBe(true);
  });

  it("does not hold when carts-ready (session play ready)", () => {
    hooks.setIsSessionPlayReadyForTest(() => true);
    expect(hooks.shouldHoldNonHostCountdownPhase("countdown", false)).toBe(false);
  });

  it("does not hold for host, or for non-countdown phases", () => {
    hooks.setIsSessionPlayReadyForTest(() => false);
    expect(hooks.shouldHoldNonHostCountdownPhase("countdown", true)).toBe(false);
    expect(hooks.shouldHoldNonHostCountdownPhase("lobby", false)).toBe(false);
    expect(hooks.shouldHoldNonHostCountdownPhase("running", false)).toBe(false);
  });
});

describe("netcode game bridge wires session play ready (cap-63)", () => {
  it("forwards isSessionPlayReady from context (was missing → hold always true)", async () => {
    const { buildNetcodeGameBridge } = await import("../src/gameSession.js");
    let ready = false;
    const bridge = buildNetcodeGameBridge(
      () => ({
        isSessionPlayReady: () => ready,
        hasPendingNonHostCountdownApply: () => true,
      }),
      { returnToMenu: () => {} },
    );
    expect(bridge.isSessionPlayReady()).toBe(false);
    ready = true;
    expect(bridge.isSessionPlayReady()).toBe(true);
    expect(bridge.hasPendingNonHostCountdownApply()).toBe(true);
  });

  it("fails closed when context is null (hold engages)", async () => {
    const { buildNetcodeGameBridge } = await import("../src/gameSession.js");
    const bridge = buildNetcodeGameBridge(() => null, { returnToMenu: () => {} });
    expect(bridge.isSessionPlayReady()).toBe(false);
    expect(bridge.hasPendingNonHostCountdownApply()).toBe(false);
  });
});

describe("host input jitter ackSeq (apply, not receive)", () => {
  beforeEach(() => {
    hooks.resetNetState();
    hooks.setHostStateForTest({ isHost: true });
  });

  it("does not advance ackSeq until the jitter buffer drains the frame", () => {
    hooks.handleRemoteClientInput(
      { throttle: 1, steer: 0, nitro: false, hop: false },
      "peerA",
      7,
    );
    expect(hooks.getRemoteInputQueueLength("peerA")).toBe(1);
    expect(hooks.getHostLastProcessedInputSeq("peerA")).toBe(0);

    // * Immediate drain — frame is younger than inputJitterBufferMs, still queued.
    hooks.drainRemoteInputJitterBuffers();
    expect(hooks.getRemoteInputQueueLength("peerA")).toBe(1);
    expect(hooks.getHostLastProcessedInputSeq("peerA")).toBe(0);
  });

  it("advances ackSeq only for frames that leave the jitter buffer", async () => {
    const delay = CONFIG.net.inputJitterBufferMs ?? 40;
    hooks.handleRemoteClientInput(
      { throttle: 0.5, steer: -0.2, nitro: false, hop: false },
      "peerB",
      11,
    );
    hooks.handleRemoteClientInput(
      { throttle: 0, steer: 1, nitro: false, hop: false },
      "peerB",
      12,
    );
    expect(hooks.getHostLastProcessedInputSeq("peerB")).toBe(0);

    await new Promise((r) => setTimeout(r, delay + 20));
    hooks.drainRemoteInputJitterBuffers();

    expect(hooks.getRemoteInputQueueLength("peerB")).toBe(0);
    expect(hooks.getHostLastProcessedInputSeq("peerB")).toBe(12);
  });

  it("acks the highest applied seq when multiple frames drain in one pass", async () => {
    const delay = CONFIG.net.inputJitterBufferMs ?? 40;
    for (const seq of [3, 5, 8]) {
      hooks.handleRemoteClientInput(
        { throttle: 1, steer: 0, nitro: false, hop: false },
        "peerC",
        seq,
      );
    }
    await new Promise((r) => setTimeout(r, delay + 20));
    hooks.drainRemoteInputJitterBuffers();
    expect(hooks.getHostLastProcessedInputSeq("peerC")).toBe(8);
    expect(hooks.getRemoteInputQueueLength("peerC")).toBe(0);
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

  it("keeps Party and host clock offsets independent (NET-CLK-1)", () => {
    hooks.resetNetState();
    // Party: local 1000, partyNow 900 => offset +100
    hooks.updatePartyClockOffset(900, 1000);
    hooks.updatePartyClockOffset(900, 1000);
    hooks.updatePartyClockOffset(900, 1000);
    // Host: local 1000, tHost 1100 => offset -100
    hooks.updateServerClockOffset(1100, 1000);
    hooks.updateServerClockOffset(1100, 1000);
    hooks.updateServerClockOffset(1100, 1000);

    expect(hooks.getPartyClockOffset()).toBe(100);
    expect(hooks.getHostClockOffset()).toBe(-100);
    // Legacy alias tracks host only.
    expect(hooks.getServerClockOffset()).toBe(-100);
  });
});

describe("Binary snapshot serialization", () => {
  it("successfully round-trips a host state snapshot through encode/decode", () => {
    // * Absolute monotonic ms (~performance.timeOrigin + now) — must survive Float64, not Float32.
    const absoluteTHost = 1_772_345_678_901.25;
    const original = {
      seq: 12345,
      tHost: absoluteTHost,
      carts: [
        {
          p: [1.23, -4.56, 7.89],
          q: [0.1, 0.2, 0.3, 0.9],
          lv: [-1.1, 2.2, -3.3],
          av: [0.1, 0.5, -0.2], // yaw (av[1]) is what the wire carries
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
          av: [0, -0.8, 0],
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
      ],
      attr: {
        h: [[2, 0, 1, 9.5, 0, 250]],
        s: [100, 0, 0, 0],
        c: [[0, 2, 3000]],
      },
    };

    const buffer = encodeHostStateSnapshot(original);
    expect(buffer).toBeInstanceOf(ArrayBuffer);
    // Header 16 + 2 * 52 cart + JSON tail
    expect(buffer.byteLength).toBeGreaterThan(16 + 52 * 2);

    const decoded = decodeHostStateSnapshot(buffer);
    // Must equal the shared protocol constant so the receiver's dispatcher routes it.
    expect(decoded.type).toBe(MSG.hostTransform);
    expect(decoded.seq).toBe(original.seq);
    // Full ms precision for absolute epoch-scale timestamps (Float32 would quantize ~42s).
    expect(decoded.tHost).toBe(absoluteTHost);
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
    expect(decoded.carts[0].av[0]).toBe(0);
    expect(decoded.carts[0].av[1]).toBeCloseTo(original.carts[0].av[1], 3);
    expect(decoded.carts[0].av[2]).toBe(0);
    expect(decoded.carts[0].ackSeq).toBe(original.carts[0].ackSeq);
    expect(decoded.carts[0].b).toBe(true);
    expect(decoded.carts[0].h).toBe(false);
    expect(decoded.carts[0].c).toBe(true);
    expect(decoded.carts[0].s).toBe(false);

    // Cart 1 assertions
    expect(decoded.carts[1].p[0]).toBeCloseTo(original.carts[1].p[0], 3);
    expect(decoded.carts[1].q[0]).toBeCloseTo(original.carts[1].q[0], 3);
    expect(decoded.carts[1].lv[0]).toBeCloseTo(original.carts[1].lv[0], 3);
    expect(decoded.carts[1].av[1]).toBeCloseTo(original.carts[1].av[1], 3);
    expect(decoded.carts[1].ackSeq).toBe(original.carts[1].ackSeq);
    expect(decoded.carts[1].b).toBe(false);
    expect(decoded.carts[1].h).toBe(true);
    expect(decoded.carts[1].c).toBe(false);
    expect(decoded.carts[1].s).toBe(true);

    // JSON tail assertions
    expect(decoded.collisions).toEqual(original.collisions);
    expect(decoded.falls).toEqual(original.falls);
    expect(decoded.attr).toEqual(original.attr);
  });

  it("serializeCartToWire sets b from ramBoostActiveUntilMs (NH-BOOST)", () => {
    // * Host never latches isBoosting flags — only the nitro timer is authoritative.
    const body = {
      translation: () => ({ x: 0, y: 1, z: 0 }),
      rotation: () => ({ x: 0, y: 0, z: 0, w: 1 }),
      linvel: () => ({ x: 0, y: 0, z: 0 }),
      angvel: () => ({ x: 0, y: 0, z: 0 }),
    };
    const idle = {
      body,
      isRamBoosting: false,
      isBoosting: false,
      ramBoostActiveUntilMs: 0,
      lastHopAtMs: 0,
      cargoBay: { visible: true },
      hasSpilled: false,
    };
    expect(serializeCartToWire(idle)?.b).toBe(false);

    const boosting = {
      ...idle,
      ramBoostActiveUntilMs: performance.now() + 500,
    };
    expect(serializeCartToWire(boosting)?.b).toBe(true);

    const expired = {
      ...idle,
      ramBoostActiveUntilMs: performance.now() - 10,
    };
    expect(serializeCartToWire(expired)?.b).toBe(false);
  });

  it("preserves quaternion w=0 (180° rotation) through encode/decode", () => {
    // * `|| 1` would corrupt w=0 into identity; encodeF32 must keep legitimate zeros.
    const original = {
      seq: 7,
      tHost: 1_000,
      carts: [
        {
          p: [0, 0, 0],
          q: [1, 0, 0, 0], // w === 0
          lv: [0, 0, 0],
          av: [0, 0, 0],
          ackSeq: 0,
          b: false,
          h: false,
          c: false,
          s: false,
        },
      ],
      collisions: [],
      falls: [],
    };
    const decoded = decodeHostStateSnapshot(encodeHostStateSnapshot(original));
    expect(decoded).not.toBeNull();
    expect(decoded.carts[0].q[0]).toBeCloseTo(1, 5);
    expect(decoded.carts[0].q[1]).toBeCloseTo(0, 5);
    expect(decoded.carts[0].q[2]).toBeCloseTo(0, 5);
    expect(decoded.carts[0].q[3]).toBeCloseTo(0, 5);
    expect(decoded.carts[0].q[3]).not.toBe(1);
  });

  it("preserves consecutive absolute timestamps that Float32 would collapse", () => {
    // At ~1.77e12, Float32 ULP is ~41984ms — these two would encode to the same value.
    const t0 = 1_772_345_678_901;
    const t1 = t0 + 25;
    const d0 = decodeHostStateSnapshot(encodeHostStateSnapshot({ seq: 1, tHost: t0, carts: [] }));
    const d1 = decodeHostStateSnapshot(encodeHostStateSnapshot({ seq: 2, tHost: t1, carts: [] }));
    expect(d0.tHost).toBe(t0);
    expect(d1.tHost).toBe(t1);
    expect(d1.tHost - d0.tHost).toBe(25);
  });

  it("replaces non-finite float values with 0 on decode", () => {
    const original = {
      seq: 12345,
      tHost: 100.0,
      carts: [
        {
          p: [1.0, 2.0, 3.0],
          q: [0.0, 0.0, 0.0, 1.0],
          lv: [4.0, 5.0, 6.0],
          av: [0, 7.0, 0],
          ackSeq: 42,
          b: false,
          h: false,
          c: false,
          s: false,
        }
      ],
      collisions: [],
      falls: []
    };

    const buffer = encodeHostStateSnapshot(original);
    const view = new DataView(buffer);

    // tHost is Float64 at offset 8
    view.setFloat64(8, NaN, true);

    // Cart 0 starts at HEADER_BYTES (16)
    view.setFloat32(16, Infinity, true); // p[0]
    view.setFloat32(28, NaN, true); // q[0]
    view.setFloat32(44, -Infinity, true); // lv[0]
    view.setFloat32(56, NaN, true); // avY

    const decoded = decodeHostStateSnapshot(buffer);

    expect(decoded.tHost).toBe(0);
    expect(decoded.carts[0].p[0]).toBe(0);
    expect(decoded.carts[0].q[0]).toBe(0);
    expect(decoded.carts[0].lv[0]).toBe(0);
    expect(decoded.carts[0].av[1]).toBe(0);

    // Unmodified values should remain as original
    expect(decoded.carts[0].p[1]).toBeCloseTo(2.0, 3);
    expect(decoded.carts[0].q[3]).toBeCloseTo(1.0, 3);
    expect(decoded.carts[0].ackSeq).toBe(42);
  });

  it("returns null when the buffer is shorter than the header", () => {
    expect(decodeHostStateSnapshot(new ArrayBuffer(8))).toBeNull();
    expect(decodeHostStateSnapshot(new ArrayBuffer(0))).toBeNull();
  });

  it("returns null when numCarts claims more payload than the buffer holds", () => {
    // Header only, but numCarts=2 requires 16 + 2*52 bytes of cart payload.
    const buffer = new ArrayBuffer(16);
    const view = new DataView(buffer);
    view.setUint8(1, 2);
    view.setUint32(4, 1, true);
    view.setFloat64(8, 1000, true);
    expect(decodeHostStateSnapshot(buffer)).toBeNull();
  });

  it("returns null when numCarts exceeds the room slot max", () => {
    const buffer = new ArrayBuffer(16 + 5 * 52);
    const view = new DataView(buffer);
    view.setUint8(1, 5); // > MAX_CARTS (4)
    view.setUint32(4, 1, true);
    view.setFloat64(8, 1000, true);
    expect(decodeHostStateSnapshot(buffer)).toBeNull();
  });
});

describe("binary snapshot dispatch (end-to-end into the buffer)", () => {
  beforeEach(() => hooks.resetNetState());

  it("fills netStateBuffer from a raw binary host snapshot via the real dispatch", () => {
    // Exact runtime path: ArrayBuffer -> decodeHostStateSnapshot -> handleRemoteP2PMessage
    // -> handleRemoteHostState -> bufferAuthoritativeState. No live DataChannel needed.
    const buf = encodeHostStateSnapshot({ seq: 7, tHost: 1000, carts: snap(1, 2, 3) });
    expect(buf).toBeInstanceOf(ArrayBuffer);
    hooks.dispatchP2P(buf, null);
    expect(hooks.getBufferLength()).toBe(1);
    // And the newest snapshot is what reconciliation reads via getLatestSnap().
    expect(getLatestSnap().seq).toBe(7);
  });

  it("accumulates monotonically increasing sequences across ticks", () => {
    for (let i = 1; i <= 5; i += 1) {
      hooks.dispatchP2P(encodeHostStateSnapshot({ seq: i, tHost: 1000 + i * 25, carts: snap(i, 0, 0) }), null);
    }
    expect(hooks.getBufferLength()).toBe(5);
    expect(getLatestSnap().seq).toBe(5);
  });

  it("REGRESSION #1: the old literal type string would never buffer", () => {
    // Pre-fix, the decoder stamped the literal "hostTransform", which does not equal
    // MSG.hostTransform ("host_transform"), so the dispatcher dropped every snapshot.
    hooks.dispatchP2P({ type: "hostTransform", seq: 7, tHost: 1000, carts: snap(1, 2, 3) }, null);
    expect(hooks.getBufferLength()).toBe(0);
    // The shared constant routes correctly.
    hooks.dispatchP2P({ type: MSG.hostTransform, seq: 7, tHost: 1000, carts: snap(1, 2, 3) }, null);
    expect(hooks.getBufferLength()).toBe(1);
  });

  it("REGRESSION #3: rejects a snapshot from a non-host source connId", () => {
    hooks.setHostIdForTest("host-A");
    // Straggler from the pre-migration host is dropped by source.
    hooks.dispatchP2P(encodeHostStateSnapshot({ seq: 9, tHost: 1000, carts: snap(1, 0, 0) }), "host-OLD");
    expect(hooks.getBufferLength()).toBe(0);
    // The current host's snapshot is accepted.
    hooks.dispatchP2P(encodeHostStateSnapshot({ seq: 9, tHost: 1000, carts: snap(1, 0, 0) }), "host-A");
    expect(hooks.getBufferLength()).toBe(1);
  });
});

describe("applyCartState bounds validation", () => {
  it("rejects non-finite values from updating physics body and net targets", () => {
    const cart = mockCart({
      t: { x: 10, y: 11, z: 12 },
      r: { x: 0, y: 0, z: 0, w: 1 },
      lv: { x: 1, y: 2, z: 3 },
      av: { x: 4, y: 5, z: 6 }
    });
    cart._netTargetPos = { set: (x, y, z) => { cart.netPos = [x, y, z]; } };
    cart._netTargetQuat = { set: (x, y, z, w) => { cart.netQuat = [x, y, z, w]; } };
    cart._lastNetLinvel = { x: 100, y: 200, z: 300 };

    // Snap with NaN and Infinity
    const snap = {
      p: [NaN, 1, 2],
      q: [0, Infinity, 0, 1],
      lv: [0, 0, -Infinity],
      av: [NaN, 0, 0],
      b: false,
      h: false,
      c: false,
      s: false
    };

    applyCartState(cart, snap, { interpolate: false });

    // Physics body values should NOT change (should keep original values)
    expect(cart.body.translation()).toEqual({ x: 10, y: 11, z: 12 });
    expect(cart.body.rotation()).toEqual({ x: 0, y: 0, z: 0, w: 1 });
    expect(cart.body.linvel()).toEqual({ x: 1, y: 2, z: 3 });
    expect(cart.body.angvel()).toEqual({ x: 4, y: 5, z: 6 });

    // Net targets and last net linvel should NOT change (should be undefined/original)
    expect(cart.netPos).toBeUndefined();
    expect(cart.netQuat).toBeUndefined();
    expect(cart._lastNetLinvel).toEqual({ x: 100, y: 200, z: 300 });

    // Try a completely valid snap to ensure it does update
    const validSnap = {
      p: [20, 21, 22],
      q: [0, 1, 0, 0],
      lv: [7, 8, 9],
      av: [10, 11, 12],
      b: false,
      h: false,
      c: false,
      s: false
    };

    applyCartState(cart, validSnap, { interpolate: false });

    expect(cart.body.translation()).toEqual({ x: 20, y: 21, z: 22 });
    expect(cart.body.rotation()).toEqual({ x: 0, y: 1, z: 0, w: 0 });
    expect(cart.body.linvel()).toEqual({ x: 7, y: 8, z: 9 });
    expect(cart.body.angvel()).toEqual({ x: 10, y: 11, z: 12 });

    expect(cart.netPos).toEqual([20, 21, 22]);
    expect(cart.netQuat).toEqual([0, 1, 0, 0]);
    expect(cart._lastNetLinvel).toEqual({ x: 7, y: 8, z: 9 });
  });
});


