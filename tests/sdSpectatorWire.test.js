// @vitest-environment happy-dom
//
// SD-SPECTATOR-WIRE-1 — Sudden-Death spectator flag must survive host migration.
// The flag is set host-side only (gameFlow fall loop) and was never synced. A
// promoted host's copy of an already-eliminated cart sits enabled and unflagged
// and re-fires as a phantom "SUDDEN DEATH" fall on the next frame. The fix rides
// the host snapshot's JSON attribution tail (NET-MIG-1): `attr.sds` names parked
// spectator slots so applyHostMigration restores the flag before the fall loop
// runs. The tail is JSON passthrough through the hybrid binary snapshot, so no
// binary layout / version change is needed.
//
// happy-dom: netcode.js touches window at module scope via its transitive imports.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as P2P from "../src/netcode/p2p.js";
import { __netcodeTestHooks as hooks, getIsHost } from "../src/netcode.js";
import * as GameState from "../src/stores/gameStore.js";
import {
  encodeHostStateSnapshot,
  decodeHostStateSnapshot,
} from "../src/netcode/binary.js";

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

/**
 * Mid-Sudden-Death world: slots 0+1 are standing tied fighters, slots 2+3 are
 * parked spectators (the flag is set on the old host, never synced before this fix).
 */
function makeCarts() {
  return [
    { slotIndex: 0, isSuddenDeathSpectator: false },
    { slotIndex: 1, isSuddenDeathSpectator: false },
    { slotIndex: 2, isSuddenDeathSpectator: true },
    { slotIndex: 3, isSuddenDeathSpectator: true },
  ];
}

describe("buildAttributionWire carries the SD-spectator tail", () => {
  beforeEach(() => {
    hooks.resetNetState();
    GameState.resetRoundToLobby();
  });

  it("names parked SD spectator slots so a promoted host can restore them", () => {
    const carts = makeCarts();
    hooks.setGetAllCartsForTest(() => carts);

    const wire = hooks.buildAttributionWire(1234);

    expect(wire).not.toBeNull();
    expect(wire.sds).toEqual([2, 3]);
    // * Normal carts stay out of the tail — only spectators are listed.
    expect(wire.sds).not.toContain(0);
    expect(wire.sds).not.toContain(1);
  });

  it("keeps the tail alive on spectator-only ticks (no open hits/combos)", () => {
    const carts = makeCarts();
    hooks.setGetAllCartsForTest(() => carts);

    // * Empty hit windows and no combos used to make buildAttributionWire return
    // * null — that would drop the spectator list once the SD-entry hit window closed.
    expect(hooks.buildAttributionWire(1234)).not.toBeNull();
    expect(hooks.buildAttributionWire(1234).sds).toEqual([2, 3]);
  });

  it("omits sds for a normal world (no spectators) and stays null", () => {
    const carts = makeCarts();
    carts[2].isSuddenDeathSpectator = false;
    carts[3].isSuddenDeathSpectator = false;
    hooks.setGetAllCartsForTest(() => carts);

    expect(hooks.buildAttributionWire(1234)).toBeNull();
  });

  it("does not force an sds key when a hit is open but no cart is a spectator", () => {
    const carts = makeCarts();
    carts[2].isSuddenDeathSpectator = false;
    carts[3].isSuddenDeathSpectator = false;
    hooks.setGetAllCartsForTest(() => carts);
    // * 100ms-old kill credit keeps the wire alive — sds must stay absent.
    GameState.replaceLastHitBy(
      new Map([[1, {
        attackerSlotIndex: 0,
        wasCritical: false,
        impactSpeed: 5,
        fromPodium: false,
        timestamp: 1134,
      }]]),
    );

    const wire = hooks.buildAttributionWire(1234);

    expect(wire).not.toBeNull();
    expect("sds" in wire).toBe(false);
  });
});

describe("applyHostMigration restores SD spectator flags (promoted host)", () => {
  beforeEach(() => {
    globalThis.RTCPeerConnection = MockRTCPeerConnection;
    P2P.closeAllConnections();
    hooks.resetNetState();
    GameState.resetRoundToLobby();
  });

  afterEach(() => {
    P2P.closeAllConnections();
  });

  it("marks remote SD-spectator carts so the fall-loop guard treats them as inert", () => {
    const carts = makeCarts();
    hooks.setGetAllCartsForTest(() => carts);
    hooks.setHostStateForTest({
      youConnId: "me",
      netSlots: [
        { kind: "human", connId: "me", name: "ME" },
        { kind: "human", connId: "peer", name: "PEER" },
        { kind: "human", connId: "peer2", name: "PEER2" },
        { kind: "human", connId: "peer3", name: "PEER3" },
      ],
    });
    hooks.setHostIdForTest("oldHost");
    // * The tail the mid-SD host sent on its last snapshot: slots 2+3 parked.
    hooks.setLastAttributionCache({ h: [], s: [0, 0, 0, 0], c: [], sds: [2, 3] });

    hooks.applyHostMigration({ hostId: "me" });

    expect(getIsHost()).toBe(true);
    // * Flag restored — gameFlow's fall-loop guard (`isSuddenDeathSpectator`)
    // * skips these carts, so no phantom "SUDDEN DEATH" fall / shatter / callout.
    expect(carts[2].isSuddenDeathSpectator).toBe(true);
    expect(carts[3].isSuddenDeathSpectator).toBe(true);
    // * Standing tied fighters stay unflagged — the fall loop still watches them.
    expect(carts[0].isSuddenDeathSpectator).toBe(false);
    expect(carts[1].isSuddenDeathSpectator).toBe(false);
  });

  it("leaves flags untouched when the cached tail has no sds", () => {
    const carts = makeCarts();
    carts[2].isSuddenDeathSpectator = false;
    carts[3].isSuddenDeathSpectator = false;
    hooks.setGetAllCartsForTest(() => carts);
    hooks.setHostStateForTest({
      youConnId: "me",
      netSlots: [
        { kind: "human", connId: "me", name: "ME" },
        { kind: "human", connId: "peer", name: "PEER" },
      ],
    });
    hooks.setHostIdForTest("oldHost");
    // * Pre-fix wire (or post-SD world): no spectator list in the tail.
    hooks.setLastAttributionCache({ h: [], s: [0, 0, 0, 0], c: [] });

    hooks.applyHostMigration({ hostId: "me" });

    expect(getIsHost()).toBe(true);
    expect(carts.some((c) => c.isSuddenDeathSpectator)).toBe(false);
  });
});

describe("the sds tail crosses the hybrid binary snapshot", () => {
  it("round-trips attr.sds through encode/decode without a binary layout change", () => {
    const attr = { h: [], s: [0, 0, 0, 0], c: [], sds: [2, 3] };

    const decoded = decodeHostStateSnapshot(
      encodeHostStateSnapshot({ seq: 7, tHost: 1000, carts: [], attr }),
    );

    expect(decoded.attr.sds).toEqual([2, 3]);
  });
});
