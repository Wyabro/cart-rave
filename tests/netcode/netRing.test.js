// @vitest-environment happy-dom
// netRing.test.js — NET-RING-1 always-on traffic-quality counters for the
// authoritative-state ring. Ring rejects return BEFORE netStateBuffer.push, so the
// counters measure how much garbage arrives, NOT a "stateBufferMaxSize − buffer length"
// margin. Epoch-scoped: resetNetFlowStats + every hostEpoch bump zero them.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  __netcodeTestHooks as hooks,
  getNetFlowStats,
  resetClientPredictionState,
} from "../../src/netcode.js";
import * as P2P from "../../src/netcode/p2p.js";
import { MSG } from "../../shared/protocol.js";

/** Minimal snapshot payload (netcode.test.js style). */
function snap(x, y, z) {
  return [{ p: [x, y, z], q: [0, 0, 0, 1], lv: [0, 0, 0], av: [0, 0, 0] }];
}

/** JSON hostTransform as the real P2P dispatcher routes it (non-binary path). */
function hostState(seq, tHost) {
  return { type: MSG.hostTransform, seq, tHost, carts: snap(0, 0, 0) };
}

describe("NET-RING-1 ring reject counters", () => {
  beforeEach(() => {
    hooks.resetNetState();
    // * hooks.resetNetState does NOT touch netFlowStats — resetClientPredictionState
    // * (→ resetNetFlowStats → resetNetRingCounters) guarantees a clean epoch start.
    resetClientPredictionState();
  });

  it("counts duplicate-seq rejects without burning a ring slot", () => {
    hooks.dispatchP2P(hostState(5, 1000), null);
    expect(hooks.getBufferLength()).toBe(1);
    expect(getNetFlowStats().ring.ringRejectsDupSeq).toBe(0);

    hooks.dispatchP2P(hostState(5, 1000), null);
    expect(getNetFlowStats().ring.ringRejectsDupSeq).toBe(1);
    // * Reject returned before push — buffer length is unchanged.
    expect(hooks.getBufferLength()).toBe(1);
  });

  it("counts out-of-order-seq rejects separately from dups", () => {
    hooks.dispatchP2P(hostState(5, 1000), null);
    hooks.dispatchP2P(hostState(3, 1000), null);

    expect(getNetFlowStats().ring.ringRejectsOooSeq).toBe(1);
    expect(getNetFlowStats().ring.ringRejectsDupSeq).toBe(0);
    expect(hooks.getBufferLength()).toBe(1);
  });

  it("counts rejects from a stale non-host source connId", () => {
    hooks.setHostIdForTest("host-A");
    hooks.dispatchP2P(hostState(9, 1000), "host-OLD");
    expect(getNetFlowStats().ring.ringRejectsStaleSource).toBe(1);
    expect(hooks.getBufferLength()).toBe(0);

    // * The current host's snapshot is accepted.
    hooks.dispatchP2P(hostState(9, 1000), "host-A");
    expect(hooks.getBufferLength()).toBe(1);
    expect(getNetFlowStats().ring.ringRejectsStaleSource).toBe(1);
  });

  it("counts each non-finite guard reject once", () => {
    hooks.bufferState(NaN, 1, snap(0, 0, 0));
    hooks.bufferState(1000, Infinity, snap(0, 0, 0));

    expect(getNetFlowStats().ring.ringRejectsNonFinite).toBe(2);
    expect(hooks.getBufferLength()).toBe(0);
  });

  it("exposes all four ring keys with correct types", () => {
    const ring = getNetFlowStats().ring;
    expect(ring).toEqual({
      ringRejectsStaleSource: 0,
      ringRejectsDupSeq: 0,
      ringRejectsOooSeq: 0,
      ringRejectsNonFinite: 0,
    });
    for (const v of Object.values(ring)) expect(typeof v).toBe("number");
  });
});

describe("NET-RING-1 epoch reset", () => {
  class MockRTCDataChannel {
    constructor(label) {
      this.label = label;
      this.readyState = "connecting";
      this.binaryType = "blob";
      this.onopen = this.onclose = this.onmessage = null;
    }
    send() {}
    close() { this.readyState = "closed"; }
  }

  class MockRTCPeerConnection {
    constructor(config) {
      this.config = config;
      this.onicecandidate = this.oniceconnectionstatechange = this.ondatachannel = null;
      this.localDescription = this.remoteDescription = null;
      this.iceConnectionState = "new";
    }
    createDataChannel(label) { return new MockRTCDataChannel(label); }
    async createOffer() { return { type: "offer", sdp: "MOCK" }; }
    async createAnswer() { return { type: "answer", sdp: "MOCK" }; }
    async setLocalDescription(d) { this.localDescription = d; }
    async setRemoteDescription(d) { this.remoteDescription = d; }
    async addIceCandidate() {}
    setConfiguration(c) { this.config = c; }
    restartIce() {}
    close() { this.iceConnectionState = "closed"; }
  }

  beforeEach(() => {
    globalThis.RTCPeerConnection = MockRTCPeerConnection;
    P2P.closeAllConnections();
    hooks.resetNetState();
    resetClientPredictionState();
    hooks.setHostStateForTest({
      youConnId: "me",
      netSlots: [
        { kind: "human", connId: "me", name: "ME" },
        { kind: "human", connId: "newHost", name: "NEW" },
      ],
    });
    hooks.setHostIdForTest("oldHost");
  });

  afterEach(() => {
    P2P.closeAllConnections();
  });

  it("zeroes the ring counters on the host-migration epoch bump", () => {
    hooks.dispatchP2P(hostState(5, 1000), null);
    hooks.dispatchP2P(hostState(5, 1000), null);
    expect(getNetFlowStats().ring.ringRejectsDupSeq).toBe(1);

    const epochBefore = hooks.getHostEpoch();
    hooks.applyHostMigration({ hostId: "newHost" });

    expect(hooks.getHostEpoch()).toBe(epochBefore + 1);
    expect(getNetFlowStats().ring).toEqual({
      ringRejectsStaleSource: 0,
      ringRejectsDupSeq: 0,
      ringRejectsOooSeq: 0,
      ringRejectsNonFinite: 0,
    });
  });
});
