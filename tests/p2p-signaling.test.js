// @vitest-environment happy-dom
// p2p-signaling.test.js — proves the WebRTC signaling handshake is now reachable end-to-end.
// Uses a mock RTCPeerConnection (happy-dom has no WebRTC) to exercise the REAL p2p.js and
// netcode.js code paths: host createOffer -> sdp_offer -> client answer -> ondatachannel ->
// DataChannel open -> binary onmessage -> netcode dispatch -> netStateBuffer.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as P2P from "../src/netcode/p2p.js";
import { __netcodeTestHooks as hooks } from "../src/netcode.js";
import { MSG } from "../shared/protocol.js";
import { CONFIG } from "../src/config.js";
import { encodeHostStateSnapshot } from "../src/netcode/binary.js";
import { MAX_P2P_BINARY_BYTES, MAX_P2P_JSON_CHARS } from "../src/netcode/p2pLimits.js";

let createdPCs = [];

class MockRTCDataChannel {
  constructor(label) {
    this.label = label;
    this.readyState = "connecting";
    this.binaryType = "blob";
    this.onopen = null;
    this.onclose = null;
    this.onmessage = null;
    this.sent = [];
  }
  send(payload) { this.sent.push(payload); }
  close() { this.readyState = "closed"; if (this.onclose) this.onclose(); }
  _open() { this.readyState = "open"; if (this.onopen) this.onopen(); }
  _receive(data) { if (this.onmessage) this.onmessage({ data }); }
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
    this.addedIce = [];
    this.closed = false;
    this.restartIceCalls = 0;
    createdPCs.push(this);
  }
  createDataChannel(label) { const dc = new MockRTCDataChannel(label); this.dataChannels.push(dc); return dc; }
  async createOffer() { return { type: "offer", sdp: "MOCK_OFFER" }; }
  async createAnswer() { return { type: "answer", sdp: "MOCK_ANSWER" }; }
  async setLocalDescription(d) { this.localDescription = d; }
  async setRemoteDescription(d) { this.remoteDescription = d; }
  async addIceCandidate(c) { this.addedIce.push(c); }
  setConfiguration(config) { this.config = config; }
  restartIce() { this.restartIceCalls += 1; }
  close() { this.closed = true; this.iceConnectionState = "closed"; }
}

const flush = () => new Promise((r) => setTimeout(r, 0));
const cartSnap = () => [{ p: [1, 2, 3], q: [0, 0, 0, 1], lv: [0, 0, 0], av: [0, 0, 0] }];

beforeEach(() => {
  globalThis.RTCPeerConnection = MockRTCPeerConnection;
  createdPCs = [];
  P2P.closeAllConnections();
  hooks.resetNetState();
});

describe("host is the offerer (createOffer is now reachable)", () => {
  it("host initiateP2PConnection creates the DataChannel, generates an offer, and emits sdp_offer", async () => {
    const sent = [];
    P2P.initP2P({ host: true, sendSignal: (m) => sent.push(m), onInput: () => {}, onState: () => {} });

    await P2P.initiateP2PConnection("clientA");

    expect(createdPCs).toHaveLength(1);                       // ✓ RTCPeerConnection created
    expect(createdPCs[0].dataChannels[0].label).toBe("physics");
    expect(createdPCs[0].localDescription).toEqual({ type: "offer", sdp: "MOCK_OFFER" }); // ✓ SDP offer generated
    const offer = sent.find((m) => m.type === MSG.sdpOffer);
    expect(offer).toBeTruthy();
    expect(offer.targetConnId).toBe("clientA");
  });

  it("non-host initiateP2PConnection stays a no-op (only the host offers)", async () => {
    const sent = [];
    P2P.initP2P({ host: false, sendSignal: (m) => sent.push(m), onInput: () => {}, onState: () => {} });
    await P2P.initiateP2PConnection("hostA");
    expect(createdPCs).toHaveLength(0);
    expect(sent).toHaveLength(0);
  });

  it("host relays ICE candidates for the peer connection", async () => {
    const sent = [];
    P2P.initP2P({ host: true, sendSignal: (m) => sent.push(m), onInput: () => {}, onState: () => {} });
    await P2P.initiateP2PConnection("clientA");
    const cand = { candidate: "candidate:1 1 udp 1 1.2.3.4 1234 typ host", sdpMid: "0", sdpMLineIndex: 0 };
    createdPCs[0].onicecandidate({ candidate: cand });
    const ice = sent.find((m) => m.type === MSG.iceCandidate);
    expect(ice).toBeTruthy();
    expect(ice.targetConnId).toBe("clientA");
    expect(ice.candidate).toEqual(cand);
  });

  it("host applies the peer's sdp_answer", async () => {
    P2P.initP2P({ host: true, sendSignal: () => {}, onInput: () => {}, onState: () => {} });
    await P2P.initiateP2PConnection("clientA");
    await P2P.handleSignalingMessage({ type: MSG.sdpAnswer, fromConnId: "clientA", sdp: { type: "answer", sdp: "A" } });
    expect(createdPCs[0].remoteDescription).toEqual({ type: "answer", sdp: "A" }); // ✓ SDP answer received
  });
});

describe("non-host answers and opens the channel", () => {
  it("client answers an incoming offer, wires ondatachannel, opens, and routes a binary snapshot", async () => {
    const states = [];
    const sent = [];
    // Route the received binary through the REAL netcode dispatch into netStateBuffer.
    hooks.setHostIdForTest("hostA");
    P2P.initP2P({
      host: false,
      sendSignal: (m) => sent.push(m),
      onInput: () => {},
      onState: (data, connId) => { states.push({ data, connId }); hooks.dispatchP2P(data, connId); },
    });

    await P2P.handleSignalingMessage({ type: MSG.sdpOffer, fromConnId: "hostA", sdp: { type: "offer", sdp: "O" } });

    const answer = sent.find((m) => m.type === MSG.sdpAnswer);
    expect(answer).toBeTruthy();
    expect(answer.targetConnId).toBe("hostA");
    const pc = createdPCs[createdPCs.length - 1];
    expect(pc.remoteDescription).toEqual({ type: "offer", sdp: "O" });
    expect(typeof pc.ondatachannel).toBe("function");

    // Host's "physics" channel arrives, opens, and delivers a binary snapshot.
    const dc = new MockRTCDataChannel("physics");
    pc.ondatachannel({ channel: dc });
    dc._open();                                              // ✓ DataChannel open
    expect(dc.readyState).toBe("open");

    const buf = encodeHostStateSnapshot({ seq: 1, tHost: 1000, carts: cartSnap() });
    dc._receive(buf);                                        // ✓ binary snapshot flows

    expect(states).toHaveLength(1);
    expect(states[0].connId).toBe("hostA");
    expect(states[0].data).toBeInstanceOf(ArrayBuffer);
    expect(hooks.getBufferLength()).toBe(1);                 // ✓ netStateBuffer fills
    expect(hooks.getBufferLength()).toBeGreaterThan(0);
  });

  it("drops oversized DataChannel frames before they reach onState/JSON.parse", async () => {
    const states = [];
    hooks.setHostIdForTest("hostA");
    P2P.initP2P({
      host: false,
      sendSignal: () => {},
      onInput: () => {},
      onState: (data, connId) => { states.push({ data, connId }); },
    });
    await P2P.handleSignalingMessage({ type: MSG.sdpOffer, fromConnId: "hostA", sdp: { type: "offer", sdp: "O" } });
    const pc = createdPCs[createdPCs.length - 1];
    const dc = new MockRTCDataChannel("physics");
    pc.ondatachannel({ channel: dc });
    dc._open();

    dc._receive(encodeHostStateSnapshot({ seq: 1, tHost: 1000, carts: cartSnap() })); // within limit — flows
    dc._receive(new ArrayBuffer(MAX_P2P_BINARY_BYTES + 1));                            // over — dropped
    dc._receive("x".repeat(MAX_P2P_JSON_CHARS + 1));                                   // over — dropped pre-parse

    expect(states).toHaveLength(1); // only the legitimate frame reached onState
    expect(states[0].data).toBeInstanceOf(ArrayBuffer);
  });
});

describe("TURN credentials applied to live peer connections", () => {
  it("setTurnServers updates iceServers on already-created PCs", async () => {
    P2P.initP2P({ host: true, sendSignal: () => {}, onInput: () => {}, onState: () => {} });
    await P2P.initiateP2PConnection("clientA");
    expect(createdPCs).toHaveLength(1);
    const turn = [{ urls: "turn:turn.example:3478", username: "u", credential: "p" }];
    P2P.setTurnServers(turn);
    expect(createdPCs[0].config.iceServers).toEqual(turn);
  });

  it("beginIceServersWait gates initiate until setTurnServers or timeout", async () => {
    P2P.initP2P({ host: true, sendSignal: () => {}, onInput: () => {}, onState: () => {} });
    P2P.beginIceServersWait(50);
    let opened = false;
    const p = P2P.initiateP2PConnection("clientB").then(() => { opened = true; });
    await flush();
    expect(opened).toBe(false);
    P2P.setTurnServers([{ urls: "stun:stun.example" }]);
    await p;
    expect(opened).toBe(true);
    expect(createdPCs).toHaveLength(1);
  });
});

describe("netcode fix: host opens offers to every non-self human peer", () => {
  it("ensureHostPeerConnections offers to each human peer and skips self + NPCs", async () => {
    const sent = [];
    P2P.initP2P({ host: true, sendSignal: (m) => sent.push(m), onInput: () => {}, onState: () => {} });
    hooks.setHostStateForTest({
      isHost: true,
      youConnId: "H",
      netSlots: [
        { kind: "human", connId: "H" },     // self — skip
        { kind: "human", connId: "C1" },    // peer — offer
        { kind: "npc", connId: null },      // npc — skip
        { kind: "human", connId: "C2" },    // peer — offer
      ],
    });

    hooks.ensureHostPeerConnections();
    await flush();

    const offeredTo = sent.filter((m) => m.type === MSG.sdpOffer).map((m) => m.targetConnId).sort();
    expect(offeredTo).toEqual(["C1", "C2"]);
    expect(createdPCs).toHaveLength(2);
  });

  it("is idempotent — a repeat slots update does not re-offer an existing peer", async () => {
    const sent = [];
    P2P.initP2P({ host: true, sendSignal: (m) => sent.push(m), onInput: () => {}, onState: () => {} });
    hooks.setHostStateForTest({
      isHost: true,
      youConnId: "H",
      netSlots: [{ kind: "human", connId: "H" }, { kind: "human", connId: "C1" }],
    });

    hooks.ensureHostPeerConnections();
    await flush();
    hooks.ensureHostPeerConnections();
    await flush();

    expect(sent.filter((m) => m.type === MSG.sdpOffer)).toHaveLength(1);
    expect(createdPCs).toHaveLength(1);
  });

  it("non-host never offers (guard holds even if called directly)", async () => {
    const sent = [];
    P2P.initP2P({ host: false, sendSignal: (m) => sent.push(m), onInput: () => {}, onState: () => {} });
    hooks.setHostStateForTest({
      isHost: false,
      youConnId: "C1",
      netSlots: [{ kind: "human", connId: "H" }, { kind: "human", connId: "C1" }],
    });
    hooks.ensureHostPeerConnections();
    await flush();
    expect(sent).toHaveLength(0);
    expect(createdPCs).toHaveLength(0);
  });
});

describe("ICE candidate buffering (race before remote description)", () => {
  const iceInit = (label) => ({
    candidate: `candidate:1 1 udp 1 1.2.3.4 1234 typ host ${label}`,
    sdpMid: "0",
    sdpMLineIndex: 0,
  });

  it("buffers ICE that arrives before the offer, then flushes on setRemoteDescription", async () => {
    P2P.initP2P({ host: false, sendSignal: () => {}, onInput: () => {}, onState: () => {} });

    // ICE races ahead of SDP — no PC yet; must not be dropped.
    await P2P.handleSignalingMessage({
      type: MSG.iceCandidate,
      fromConnId: "hostA",
      candidate: iceInit("early-1"),
    });
    expect(createdPCs).toHaveLength(0);

    await P2P.handleSignalingMessage({
      type: MSG.sdpOffer,
      fromConnId: "hostA",
      sdp: { type: "offer", sdp: "O" },
    });
    const pc = createdPCs[0];
    expect(pc.remoteDescription).toEqual({ type: "offer", sdp: "O" });
    expect(pc.addedIce).toHaveLength(1);
    expect(pc.addedIce[0].candidate).toContain("early-1");
  });

  it("buffers ICE that arrives after PC creation but before remote description is ready", async () => {
    P2P.initP2P({ host: true, sendSignal: () => {}, onInput: () => {}, onState: () => {} });
    await P2P.initiateP2PConnection("clientA");
    const pc = createdPCs[0];

    // Offer is local-only so far; remote description not set yet.
    await P2P.handleSignalingMessage({
      type: MSG.iceCandidate,
      fromConnId: "clientA",
      candidate: iceInit("mid-race"),
    });
    expect(pc.addedIce).toHaveLength(0);

    await P2P.handleSignalingMessage({
      type: MSG.sdpAnswer,
      fromConnId: "clientA",
      sdp: { type: "answer", sdp: "A" },
    });
    expect(pc.addedIce).toHaveLength(1);
    expect(pc.addedIce[0].candidate).toContain("mid-race");
  });
});

describe("ICE disconnect grace (transient vs terminal)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not tear down immediately on iceConnectionState disconnected", async () => {
    P2P.initP2P({ host: true, sendSignal: () => {}, onInput: () => {}, onState: () => {} });
    await P2P.initiateP2PConnection("clientA");
    const pc = createdPCs[0];
    expect(P2P.hasPeerConnection("clientA")).toBe(true);

    pc.iceConnectionState = "disconnected";
    pc.oniceconnectionstatechange();

    expect(P2P.hasPeerConnection("clientA")).toBe(true);
    expect(pc.closed).toBe(false);
  });

  it("tears down if disconnected persists past the grace window", async () => {
    P2P.initP2P({ host: true, sendSignal: () => {}, onInput: () => {}, onState: () => {} });
    await P2P.initiateP2PConnection("clientA");
    const pc = createdPCs[0];

    pc.iceConnectionState = "disconnected";
    pc.oniceconnectionstatechange();
    vi.advanceTimersByTime(P2P.getIceDisconnectGraceMs());

    expect(P2P.hasPeerConnection("clientA")).toBe(false);
    expect(pc.closed).toBe(true);
  });

  it("cancels grace teardown if ICE recovers to connected", async () => {
    P2P.initP2P({ host: true, sendSignal: () => {}, onInput: () => {}, onState: () => {} });
    await P2P.initiateP2PConnection("clientA");
    const pc = createdPCs[0];

    pc.iceConnectionState = "disconnected";
    pc.oniceconnectionstatechange();
    pc.iceConnectionState = "connected";
    pc.oniceconnectionstatechange();
    vi.advanceTimersByTime(P2P.getIceDisconnectGraceMs());

    expect(P2P.hasPeerConnection("clientA")).toBe(true);
    expect(pc.closed).toBe(false);
  });

  it("tears down immediately on iceConnectionState failed", async () => {
    P2P.initP2P({ host: true, sendSignal: () => {}, onInput: () => {}, onState: () => {} });
    await P2P.initiateP2PConnection("clientA");
    const pc = createdPCs[0];

    pc.iceConnectionState = "failed";
    pc.oniceconnectionstatechange();

    expect(P2P.hasPeerConnection("clientA")).toBe(false);
    expect(pc.closed).toBe(true);
  });
});

describe("host P2P maintain / mid-match reconnect", () => {
  const hostSlots = (peers) => [
    { kind: "human", connId: "H" },
    ...peers.map((connId) => ({ kind: "human", connId })),
    { kind: "npc", connId: null },
  ];

  beforeEach(() => {
    hooks.clearPeerReconnectCooldowns();
  });

  it("offers to a human peer with no existing PC", async () => {
    const sent = [];
    P2P.initP2P({ host: true, sendSignal: (m) => sent.push(m), onInput: () => {}, onState: () => {} });
    hooks.setHostStateForTest({ isHost: true, youConnId: "H", netSlots: hostSlots(["C1"]) });

    hooks.maintainHostPeerConnections();
    await flush();

    expect(sent.filter((m) => m.type === MSG.sdpOffer).map((m) => m.targetConnId)).toEqual(["C1"]);
    expect(P2P.hasPeerConnection("C1")).toBe(true);
  });

  it("does not re-offer while a healthy DataChannel is open", async () => {
    const sent = [];
    P2P.initP2P({ host: true, sendSignal: (m) => sent.push(m), onInput: () => {}, onState: () => {} });
    hooks.setHostStateForTest({ isHost: true, youConnId: "H", netSlots: hostSlots(["C1"]) });
    await P2P.initiateP2PConnection("C1");
    const pc = createdPCs[0];
    pc.iceConnectionState = "connected";
    pc.dataChannels[0]._open();
    sent.length = 0;

    hooks.maintainHostPeerConnections();
    await flush();

    expect(sent.filter((m) => m.type === MSG.sdpOffer)).toHaveLength(0);
    expect(createdPCs).toHaveLength(1);
  });

  it("re-offers after ICE failed cleaned up the peer", async () => {
    const sent = [];
    P2P.initP2P({ host: true, sendSignal: (m) => sent.push(m), onInput: () => {}, onState: () => {} });
    hooks.setHostStateForTest({ isHost: true, youConnId: "H", netSlots: hostSlots(["C1"]) });
    await P2P.initiateP2PConnection("C1");
    const pc = createdPCs[0];
    pc.iceConnectionState = "failed";
    pc.oniceconnectionstatechange();
    expect(P2P.hasPeerConnection("C1")).toBe(false);
    sent.length = 0;

    hooks.maintainHostPeerConnections();
    await flush();

    expect(sent.filter((m) => m.type === MSG.sdpOffer)).toHaveLength(1);
    expect(P2P.hasPeerConnection("C1")).toBe(true);
  });

  it("re-offers when ICE is up but the DataChannel is closed", async () => {
    const sent = [];
    P2P.initP2P({ host: true, sendSignal: (m) => sent.push(m), onInput: () => {}, onState: () => {} });
    hooks.setHostStateForTest({ isHost: true, youConnId: "H", netSlots: hostSlots(["C1"]) });
    await P2P.initiateP2PConnection("C1");
    const pc = createdPCs[0];
    pc.iceConnectionState = "connected";
    const dc = pc.dataChannels[0];
    dc._open();
    dc.readyState = "closed";
    sent.length = 0;

    hooks.maintainHostPeerConnections();
    await flush();

    expect(pc.closed).toBe(true);
    expect(sent.filter((m) => m.type === MSG.sdpOffer)).toHaveLength(1);
    expect(P2P.hasPeerConnection("C1")).toBe(true);
  });

  it("does not re-offer during ICE disconnected grace", async () => {
    const sent = [];
    P2P.initP2P({ host: true, sendSignal: (m) => sent.push(m), onInput: () => {}, onState: () => {} });
    hooks.setHostStateForTest({ isHost: true, youConnId: "H", netSlots: hostSlots(["C1"]) });
    await P2P.initiateP2PConnection("C1");
    const pc = createdPCs[0];
    pc.iceConnectionState = "disconnected";
    // * Do not fire teardown; grace path leaves the PC tracked.
    sent.length = 0;

    hooks.maintainHostPeerConnections();
    await flush();

    expect(sent.filter((m) => m.type === MSG.sdpOffer)).toHaveLength(0);
    expect(P2P.hasPeerConnection("C1")).toBe(true);
  });

  it("rate-limits reconnect offers per peer", async () => {
    const sent = [];
    P2P.initP2P({ host: true, sendSignal: (m) => sent.push(m), onInput: () => {}, onState: () => {} });
    hooks.setHostStateForTest({ isHost: true, youConnId: "H", netSlots: hostSlots(["C1"]) });

    hooks.maintainHostPeerConnections();
    await flush();
    hooks.maintainHostPeerConnections();
    await flush();

    expect(sent.filter((m) => m.type === MSG.sdpOffer)).toHaveLength(1);
  });

  it("force-reoffers a stuck negotiation after the connecting timeout", async () => {
    let nowMs = 1_000_000;
    const dateNowSpy = vi.spyOn(Date, "now").mockImplementation(() => nowMs);
    try {
      const sent = [];
      P2P.initP2P({ host: true, sendSignal: (m) => sent.push(m), onInput: () => {}, onState: () => {} });
      hooks.setHostStateForTest({ isHost: true, youConnId: "H", netSlots: hostSlots(["C1"]) });
      await P2P.initiateP2PConnection("C1");
      // * PC exists, DC still connecting — within timeout maintain must not thrash.
      sent.length = 0;
      hooks.maintainHostPeerConnections();
      await flush();
      expect(sent.filter((m) => m.type === MSG.sdpOffer)).toHaveLength(0);

      const timeoutMs = CONFIG.net.p2pConnectingTimeoutMs ?? 10000;
      nowMs += timeoutMs + 1;
      // * Cooldown from a prior maintain must not block the stale-negotiation path.
      hooks.clearPeerReconnectCooldowns();
      hooks.maintainHostPeerConnections();
      await flush();

      expect(sent.filter((m) => m.type === MSG.sdpOffer)).toHaveLength(1);
    } finally {
      dateNowSpy.mockRestore();
    }
  });

  it("non-host maintain is a no-op", async () => {
    const sent = [];
    P2P.initP2P({ host: false, sendSignal: (m) => sent.push(m), onInput: () => {}, onState: () => {} });
    hooks.setHostStateForTest({ isHost: false, youConnId: "C1", netSlots: hostSlots(["C1"]) });
    hooks.maintainHostPeerConnections();
    await flush();
    expect(sent).toHaveLength(0);
    expect(createdPCs).toHaveLength(0);
  });
});

describe("HOST-TAB-1e: demoted / stale-offer guards (session generation)", () => {
  const hostSlots = (peers) => [
    { kind: "human", connId: "H" },
    ...peers.map((connId) => ({ kind: "human", connId })),
    { kind: "npc", connId: null },
  ];

  it("demoted mid-await initiate emits no offer and leaves no PC", async () => {
    const sent = [];
    P2P.initP2P({ host: true, sendSignal: (m) => sent.push(m), onInput: () => {}, onState: () => {} });
    P2P.beginIceServersWait(5000);
    const pending = P2P.initiateP2PConnection("clientA");
    await flush();
    expect(createdPCs).toHaveLength(0);

    P2P.closeAllConnections();
    P2P.initP2P({ host: false, sendSignal: (m) => sent.push(m), onInput: () => {}, onState: () => {} });
    await pending;

    expect(sent.filter((m) => m.type === MSG.sdpOffer)).toHaveLength(0);
    expect(P2P.hasPeerConnection("clientA")).toBe(false);
  });

  it("demoted after createOffer sends no offer", async () => {
    let resolveOffer;
    const originalCreateOffer = MockRTCPeerConnection.prototype.createOffer;
    MockRTCPeerConnection.prototype.createOffer = function createOfferHang() {
      return new Promise((resolve) => {
        resolveOffer = () => resolve({ type: "offer", sdp: "MOCK_OFFER" });
      });
    };
    try {
      const sent = [];
      P2P.initP2P({ host: true, sendSignal: (m) => sent.push(m), onInput: () => {}, onState: () => {} });
      const pending = P2P.initiateP2PConnection("clientA");
      await flush();
      expect(createdPCs).toHaveLength(1);

      P2P.closeAllConnections();
      P2P.initP2P({ host: false, sendSignal: (m) => sent.push(m), onInput: () => {}, onState: () => {} });
      resolveOffer();
      await pending;

      expect(sent.filter((m) => m.type === MSG.sdpOffer)).toHaveLength(0);
      expect(P2P.hasPeerConnection("clientA")).toBe(false);
    } finally {
      MockRTCPeerConnection.prototype.createOffer = originalCreateOffer;
    }
  });

  it("host ignores inbound sdpOffer and creates no PC", async () => {
    const sent = [];
    P2P.initP2P({ host: true, sendSignal: (m) => sent.push(m), onInput: () => {}, onState: () => {} });
    await P2P.handleSignalingMessage({
      type: MSG.sdpOffer,
      fromConnId: "stalePeer",
      sdp: { type: "offer", sdp: "STALE" },
    });
    expect(createdPCs).toHaveLength(0);
    expect(P2P.hasPeerConnection("stalePeer")).toBe(false);
    expect(sent.filter((m) => m.type === MSG.sdpAnswer)).toHaveLength(0);
  });

  it("closeAll invalidates in-flight answerer ICE wait", async () => {
    const sent = [];
    P2P.initP2P({ host: false, sendSignal: (m) => sent.push(m), onInput: () => {}, onState: () => {} });
    P2P.beginIceServersWait(5000);
    const pending = P2P.handleSignalingMessage({
      type: MSG.sdpOffer,
      fromConnId: "hostA",
      sdp: { type: "offer", sdp: "O" },
    });
    await flush();

    P2P.closeAllConnections();
    P2P.initP2P({ host: false, sendSignal: (m) => sent.push(m), onInput: () => {}, onState: () => {} });
    await pending;

    expect(sent.filter((m) => m.type === MSG.sdpAnswer)).toHaveLength(0);
    expect(P2P.hasPeerConnection("hostA")).toBe(false);
  });

  it("ensureHostPeerConnections during negotiation sends zero offers and closes nothing", async () => {
    const sent = [];
    P2P.initP2P({ host: true, sendSignal: (m) => sent.push(m), onInput: () => {}, onState: () => {} });
    hooks.setHostStateForTest({ isHost: true, youConnId: "H", netSlots: hostSlots(["C1"]) });
    await P2P.initiateP2PConnection("C1");
    const pc = createdPCs[0];
    sent.length = 0;

    hooks.ensureHostPeerConnections();
    await flush();

    expect(sent.filter((m) => m.type === MSG.sdpOffer)).toHaveLength(0);
    expect(P2P.hasPeerConnection("C1")).toBe(true);
    expect(pc.closed).toBe(false);
  });
});
