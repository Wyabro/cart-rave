// @vitest-environment happy-dom
// p2p-signaling.test.js — proves the WebRTC signaling handshake is now reachable end-to-end.
// Uses a mock RTCPeerConnection (happy-dom has no WebRTC) to exercise the REAL p2p.js and
// netcode.js code paths: host createOffer -> sdp_offer -> client answer -> ondatachannel ->
// DataChannel open -> binary onmessage -> netcode dispatch -> netStateBuffer.

import { beforeEach, describe, expect, it } from "vitest";
import * as P2P from "../src/netcode/p2p.js";
import { __netcodeTestHooks as hooks } from "../src/netcode.js";
import { MSG } from "../shared/protocol.js";
import { encodeHostStateSnapshot } from "../src/netcode/binary.js";

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
    createdPCs.push(this);
  }
  createDataChannel(label) { const dc = new MockRTCDataChannel(label); this.dataChannels.push(dc); return dc; }
  async createOffer() { return { type: "offer", sdp: "MOCK_OFFER" }; }
  async createAnswer() { return { type: "answer", sdp: "MOCK_ANSWER" }; }
  async setLocalDescription(d) { this.localDescription = d; }
  async setRemoteDescription(d) { this.remoteDescription = d; }
  async addIceCandidate(c) { this.addedIce.push(c); }
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
    createdPCs[0].onicecandidate({ candidate: { cand: "x" } });
    const ice = sent.find((m) => m.type === MSG.iceCandidate);
    expect(ice).toBeTruthy();
    expect(ice.targetConnId).toBe("clientA");
    expect(ice.candidate).toEqual({ cand: "x" });
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
