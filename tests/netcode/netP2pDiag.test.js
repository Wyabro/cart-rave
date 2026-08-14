// @vitest-environment happy-dom
// netP2pDiag.test.js — NET-P2P-DIAG-1: mid-match WebRTC recovery must emit net diag
// events so an F8 capture can attribute a "the other cart froze" report. Instrument-only:
// this file pins the event payloads and the event rate-limit, NOT recovery behavior
// (p2p-signaling.test.js owns the behavior; this only adds assertions on the traces).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as P2P from "../../src/netcode/p2p.js";
import { __netcodeTestHooks as hooks } from "../../src/netcode.js";
import { CONFIG } from "../../src/config.js";
import { installDiagnostics, __resetDiagnosticsForTest } from "../../src/utils/diagnostics.js";

let createdPCs = [];

class MockRTCDataChannel {
  constructor(label) {
    this.label = label;
    this.readyState = "connecting";
    this.binaryType = "blob";
    this.onopen = this.onclose = this.onmessage = null;
  }
  send() {}
  close() { this.readyState = "closed"; if (this.onclose) this.onclose(); }
  _open() { this.readyState = "open"; if (this.onopen) this.onopen(); }
}

class MockRTCPeerConnection {
  constructor(config) {
    this.config = config;
    this.onicecandidate = null;
    this.oniceconnectionstatechange = null;
    this.ondatachannel = null;
    this.localDescription = null;
    this.remoteDescription = null;
    this.iceConnectionState = "new";
    this.dataChannels = [];
    this.closed = false;
    createdPCs.push(this);
  }
  createDataChannel(label) { const dc = new MockRTCDataChannel(label); this.dataChannels.push(dc); return dc; }
  async createOffer() { return { type: "offer", sdp: "MOCK_OFFER" }; }
  async createAnswer() { return { type: "answer", sdp: "MOCK_ANSWER" }; }
  async setLocalDescription(d) { this.localDescription = d; }
  async setRemoteDescription(d) { this.remoteDescription = d; }
  async addIceCandidate() {}
  setConfiguration(c) { this.config = c; }
  restartIce() {}
  close() { this.closed = true; this.iceConnectionState = "closed"; }
}

const flush = () => new Promise((r) => setTimeout(r, 0));

/** Net-channel diag events of a given type, filtered to one peer, newest last. */
const netEventsFor = (type, connId) =>
  window.__ccDiag
    .events()
    .filter((e) => e.ch === "net" && e.type === type && e.connId === connId);

const hostSlots = (peers) => [
  { kind: "human", connId: "H" },
  ...peers.map((connId) => ({ kind: "human", connId })),
  { kind: "npc", connId: null },
];

beforeEach(() => {
  globalThis.RTCPeerConnection = MockRTCPeerConnection;
  createdPCs = [];
  P2P.closeAllConnections();
  hooks.resetNetState();
  __resetDiagnosticsForTest();
  installDiagnostics({ flags: { enabled: true } });
});

afterEach(() => {
  P2P.closeAllConnections();
  __resetDiagnosticsForTest();
});

describe("NET-P2P-DIAG-1: recovery attempt diag events", () => {
  it("emits p2p_reconnect_attempt with connId, reason, ageMs, and attempt count", async () => {
    const sent = [];
    P2P.initP2P({ host: true, sendSignal: (m) => sent.push(m), onInput: () => {}, onState: () => {} });
    hooks.setHostStateForTest({ isHost: true, youConnId: "H", netSlots: hostSlots(["C1"]) });

    // * Wedged peer: ICE is connected but the DataChannel died ("channel_down").
    await P2P.initiateP2PConnection("C1");
    const pc = createdPCs[0];
    pc.iceConnectionState = "connected";
    const dc = pc.dataChannels[0];
    dc._open();
    dc.readyState = "closed";

    hooks.maintainHostPeerConnections();
    await flush();

    const attempts = netEventsFor("p2p_reconnect_attempt", "C1");
    expect(attempts).toHaveLength(1);
    expect(attempts[0].connId).toBe("C1");
    expect(attempts[0].reason).toBe("channel_down");
    expect(typeof attempts[0].ageMs).toBe("number");
    expect(attempts[0].ageMs).toBeGreaterThanOrEqual(0);
    expect(attempts[0].attempt).toBe(1);
    // * No failure trace on the happy path.
    expect(netEventsFor("p2p_reconnect_offer_failed", "C1")).toHaveLength(0);
  });

  it("emits one attempt event per re-offer — the per-peer cooldown is the event rate-limit", async () => {
    const sent = [];
    P2P.initP2P({ host: true, sendSignal: (m) => sent.push(m), onInput: () => {}, onState: () => {} });
    hooks.setHostStateForTest({ isHost: true, youConnId: "H", netSlots: hostSlots(["C1"]) });

    // * No PC yet — first maintain is an immediate recovery offer.
    hooks.maintainHostPeerConnections();
    await flush();
    expect(netEventsFor("p2p_reconnect_attempt", "C1")).toHaveLength(1);

    // * Peer still wedged (forced to missing), but the cooldown is armed — no event.
    P2P.forceClosePeer("C1");
    hooks.maintainHostPeerConnections();
    await flush();
    expect(netEventsFor("p2p_reconnect_attempt", "C1")).toHaveLength(1);

    // * Cooldown cleared (as if time elapsed) — the next recovery is attempt 2.
    hooks.clearPeerReconnectCooldowns();
    P2P.forceClosePeer("C1");
    hooks.maintainHostPeerConnections();
    await flush();

    const attempts = netEventsFor("p2p_reconnect_attempt", "C1");
    expect(attempts).toHaveLength(2);
    expect(attempts[0].attempt).toBe(1);
    expect(attempts[1].attempt).toBe(2);
    expect(attempts[1].reason).toBe("missing");
  });

  it("resets the attempt count on the next health-ok pass", async () => {
    const sent = [];
    P2P.initP2P({ host: true, sendSignal: (m) => sent.push(m), onInput: () => {}, onState: () => {} });
    hooks.setHostStateForTest({ isHost: true, youConnId: "H", netSlots: hostSlots(["C1"]) });

    // * One wedged recovery, then the peer heals (DC open).
    hooks.maintainHostPeerConnections();
    await flush();
    expect(netEventsFor("p2p_reconnect_attempt", "C1")).toHaveLength(1);

    const pc = createdPCs[createdPCs.length - 1];
    pc.iceConnectionState = "connected";
    pc.dataChannels[0]._open();
    hooks.maintainHostPeerConnections();
    await flush();
    expect(netEventsFor("p2p_reconnect_attempt", "C1")).toHaveLength(1); // health-ok pass emits nothing

    // * Wedged again — the counter restarted from 1, not 2.
    P2P.forceClosePeer("C1");
    hooks.maintainHostPeerConnections();
    await flush();
    const afterReset = netEventsFor("p2p_reconnect_attempt", "C1");
    expect(afterReset).toHaveLength(2);
    expect(afterReset[1].attempt).toBe(1);
  });
});

describe("NET-P2P-DIAG-1: offer-failure diag event", () => {
  it("emits p2p_reconnect_offer_failed with connId, reason, ageMs, attempt, and err", async () => {
    const originalCreateOffer = MockRTCPeerConnection.prototype.createOffer;
    MockRTCPeerConnection.prototype.createOffer = async function createOfferReject() {
      throw new Error("ICE gathering failed");
    };
    try {
      const sent = [];
      P2P.initP2P({ host: true, sendSignal: (m) => sent.push(m), onInput: () => {}, onState: () => {} });
      hooks.setHostStateForTest({ isHost: true, youConnId: "H", netSlots: hostSlots(["C1"]) });

      hooks.maintainHostPeerConnections();
      await flush();

      const failed = netEventsFor("p2p_reconnect_offer_failed", "C1");
      expect(failed).toHaveLength(1);
      expect(failed[0].connId).toBe("C1");
      expect(failed[0].reason).toBe("missing");
      expect(typeof failed[0].ageMs).toBe("number");
      expect(failed[0].attempt).toBe(1);
      expect(failed[0].err).toContain("ICE gathering failed");

      // * The attempt event is still recorded before the offer fires.
      expect(netEventsFor("p2p_reconnect_attempt", "C1")).toHaveLength(1);
    } finally {
      MockRTCPeerConnection.prototype.createOffer = originalCreateOffer;
    }
  });

  it("is rate-limited to the cooldown like the attempt event", async () => {
    const originalCreateOffer = MockRTCPeerConnection.prototype.createOffer;
    MockRTCPeerConnection.prototype.createOffer = async function createOfferReject() {
      throw new Error("boom");
    };
    try {
      const sent = [];
      P2P.initP2P({ host: true, sendSignal: (m) => sent.push(m), onInput: () => {}, onState: () => {} });
      hooks.setHostStateForTest({ isHost: true, youConnId: "H", netSlots: hostSlots(["C1"]) });

      hooks.maintainHostPeerConnections();
      await flush();
      P2P.forceClosePeer("C1");
      hooks.maintainHostPeerConnections(); // within cooldown — no second offer, no second failure event
      await flush();

      expect(netEventsFor("p2p_reconnect_offer_failed", "C1")).toHaveLength(1);
      expect(netEventsFor("p2p_reconnect_attempt", "C1")).toHaveLength(1);
    } finally {
      MockRTCPeerConnection.prototype.createOffer = originalCreateOffer;
    }
  });
});
