// @vitest-environment happy-dom
// hostMigration.test.js — the host-migration handoff, end to end across both halves:
//   1. SERVER: pickNextHostId promotes the oldest surviving *human* connection.
//   2. CLIENT: applyHostMigration re-points authority, resets prediction/epoch/buffer,
//      arms the non-host freeze, and re-points the trusted snapshot source to the new host.
//
// This is the feature that is hardest to shake out by playtesting (it only fires when a
// host actually drops mid-match) and spans server + client + P2P + snapshot buffer.
// happy-dom: netcode.js touches window at module scope via its transitive imports.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { pickNextHostId } from "../party/hostSelection.ts";
import * as P2P from "../src/netcode/p2p.js";
import {
  __netcodeTestHooks as hooks,
  getIsHost,
  getHostId,
  getHostMigrationFreezeUntilMs,
  getPendingInputs,
} from "../src/netcode.js";
import { encodeHostStateSnapshot } from "../src/netcode/binary.js";

// --- Server: promote-oldest selection --------------------------------------------------

describe("pickNextHostId (server promote-oldest)", () => {
  const human = (connId) => ({ connId, kind: "human" });
  const npc = () => ({ connId: null, kind: "npc" });

  it("promotes the earliest-joined surviving human", () => {
    const joinOrder = ["a", "b", "c"];
    const live = new Set(["a", "b", "c"]);
    const slots = [human("a"), human("b"), human("c")];
    expect(pickNextHostId(joinOrder, live, slots)).toBe("a");
  });

  it("skips the dropped host and promotes the next-oldest survivor", () => {
    // "a" was the host and has left #connections (not in the live set).
    const joinOrder = ["a", "b", "c"];
    const live = new Set(["b", "c"]);
    const slots = [human("a"), human("b"), human("c")];
    expect(pickNextHostId(joinOrder, live, slots)).toBe("b");
  });

  it("skips connections that do not hold a human slot", () => {
    // "a" is live but its slot went NPC (converted on disconnect race); "b" is the human.
    const joinOrder = ["a", "b"];
    const live = new Set(["a", "b"]);
    const slots = [npc(), human("b")];
    expect(pickNextHostId(joinOrder, live, slots)).toBe("b");
  });

  it("returns null when no human survivor remains", () => {
    expect(pickNextHostId(["a", "b"], new Set(), [human("a"), human("b")])).toBeNull();
    expect(pickNextHostId(["a"], new Set(["a"]), [npc()])).toBeNull();
    expect(pickNextHostId(["a"], new Set(["a"]), null)).toBeNull();
  });

  it("honors join order, not slot order, for the tiebreak", () => {
    // c joined first even though it is last in the slot table.
    const joinOrder = ["c", "a", "b"];
    const live = new Set(["a", "b", "c"]);
    const slots = [human("a"), human("b"), human("c")];
    expect(pickNextHostId(joinOrder, live, slots)).toBe("c");
  });
});

// --- Client: authority handoff ---------------------------------------------------------

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

const snap = (x, y, z) => [{ p: [x, y, z], q: [0, 0, 0, 1], lv: [0, 0, 0], av: [0, 0, 0] }];

describe("applyHostMigration (client authority handoff)", () => {
  beforeEach(() => {
    globalThis.RTCPeerConnection = MockRTCPeerConnection;
    P2P.closeAllConnections();
    hooks.resetNetState();
  });
  afterEach(() => {
    P2P.closeAllConnections();
  });

  it("promotes this client to host, clearing prediction state and bumping the epoch", () => {
    hooks.setHostStateForTest({
      youConnId: "me",
      netSlots: [
        { kind: "human", connId: "me", name: "ME" },
        { kind: "human", connId: "peer", name: "PEER" },
      ],
    });
    hooks.setHostIdForTest("oldHost");
    getPendingInputs().push({ seq: 1, input: { throttle: 1, steer: 0 } });
    hooks.bufferState(1000, 4, snap(1, 0, 0));
    expect(hooks.getBufferLength()).toBe(1);
    const epochBefore = hooks.getHostEpoch();

    hooks.applyHostMigration({ hostId: "me" });

    expect(getIsHost()).toBe(true);
    expect(getHostId()).toBe("me");
    expect(hooks.getHostEpoch()).toBe(epochBefore + 1);
    expect(hooks.getBufferLength()).toBe(0); // pre-migration snapshots dropped
    expect(getPendingInputs().length).toBe(0); // stale prediction inputs cleared
  });

  it("keeps this client a non-host, arms the freeze, and resets the snapshot buffer", () => {
    hooks.setHostStateForTest({
      youConnId: "me",
      netSlots: [
        { kind: "human", connId: "me", name: "ME" },
        { kind: "human", connId: "newHost", name: "NEW" },
        { kind: "human", connId: "oldHost", name: "OLD" },
      ],
    });
    hooks.setHostIdForTest("oldHost");
    hooks.bufferState(1000, 5, snap(2, 0, 0));
    expect(hooks.getBufferLength()).toBe(1);
    const epochBefore = hooks.getHostEpoch();

    hooks.applyHostMigration({ hostId: "newHost" });

    expect(getIsHost()).toBe(false);
    expect(getHostId()).toBe("newHost");
    expect(hooks.getHostEpoch()).toBe(epochBefore + 1);
    expect(hooks.getBufferLength()).toBe(0);
    // * Non-hosts freeze briefly so the new host's first snapshots seed a fresh baseline.
    expect(getHostMigrationFreezeUntilMs()).toBeGreaterThan(0);
  });

  it("re-points the trusted snapshot source: old-host stragglers rejected, new host accepted", () => {
    hooks.setHostStateForTest({
      youConnId: "me",
      netSlots: [
        { kind: "human", connId: "me", name: "ME" },
        { kind: "human", connId: "newHost", name: "NEW" },
        { kind: "human", connId: "oldHost", name: "OLD" },
      ],
    });
    hooks.setHostIdForTest("oldHost");

    hooks.applyHostMigration({ hostId: "newHost" });

    // A late packet from the pre-migration host must not re-enter the buffer.
    hooks.dispatchP2P(encodeHostStateSnapshot({ seq: 9, tHost: 1100, carts: snap(1, 0, 0) }), "oldHost");
    expect(hooks.getBufferLength()).toBe(0);

    // The promoted host's snapshot is trusted.
    hooks.dispatchP2P(encodeHostStateSnapshot({ seq: 9, tHost: 1100, carts: snap(1, 0, 0) }), "newHost");
    expect(hooks.getBufferLength()).toBe(1);
  });

  it("tolerates a malformed hostId (no promotion, no throw)", () => {
    hooks.setHostStateForTest({
      youConnId: "me",
      netSlots: [{ kind: "human", connId: "me", name: "ME" }],
    });
    hooks.setHostIdForTest("oldHost");

    expect(() => hooks.applyHostMigration({})).not.toThrow();
    expect(getHostId()).toBeNull();
    expect(getIsHost()).toBe(false);
  });
});
