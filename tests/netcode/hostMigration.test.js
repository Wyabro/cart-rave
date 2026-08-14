// @vitest-environment happy-dom
// hostMigration.test.js — the host-migration handoff, end to end across both halves:
//   1. SERVER: pickNextHostId promotes the oldest surviving *human* connection.
//   2. CLIENT: applyHostMigration re-points authority, resets prediction/epoch/buffer,
//      arms the non-host freeze, and re-points the trusted snapshot source to the new host.
//
// This is the feature that is hardest to shake out by playtesting (it only fires when a
// host actually drops mid-match) and spans server + client + P2P + snapshot buffer.
// happy-dom: netcode.js touches window at module scope via its transitive imports.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pickNextHostId } from "../../party/hostSelection.ts";
import * as P2P from "../../src/netcode/p2p.js";
import {
  __netcodeTestHooks as hooks,
  detectGameMode,
  getIsHost,
  getHostId,
  getHostMigrationFreezeUntilMs,
  isHostMigrationAwaitingFirstSnap,
  getPendingInputs,
  sendHostPresent,
} from "../../src/netcode.js";
import * as GameState from "../../src/stores/gameStore.js";
import { encodeHostStateSnapshot } from "../../src/netcode/binary.js";
import { CONFIG } from "../../src/config.js";

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

describe("host presence retry", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    hooks.resetNetState();
    GameState.setRoundPhase("running");
    Object.defineProperty(document, "hidden", { configurable: true, value: false });
  });

  afterEach(() => {
    hooks.resetNetState();
    GameState.resetRoundToLobby();
    vi.useRealTimers();
  });

  it("retries once after cooldown when the returning human remains visible", () => {
    const sent = [];
    hooks.setPartySocketForTest({
      readyState: WebSocket.OPEN,
      send: (payload) => sent.push(JSON.parse(payload)),
    });
    hooks.setHostStateForTest({
      youConnId: "me",
      netSlots: [{ kind: "human", connId: "me", name: "ME" }],
    });

    sendHostPresent();
    expect(sent.map(({ type }) => type)).toEqual(["host_present"]);

    vi.advanceTimersByTime(4_999);
    expect(sent).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(sent.map(({ type }) => type)).toEqual(["host_present", "host_present"]);
  });
});

describe("DEEPSEC-1 room latch + tHost bounds", () => {
  afterEach(() => {
    hooks.resetNetState();
    window.history.replaceState({}, "", "/");
  });

  it("detectGameMode keeps the latched room after a URL rewrite", () => {
    hooks.setConnectedRoomForTest("quickplay");
    window.history.replaceState({}, "", "/?diag=1&room=KALE7");
    expect(detectGameMode()).toBe("quickplay");
  });

  it("rejects 1e300 tHost and resets the clock on migration", () => {
    expect(hooks.isPlausibleTHostForTest(1e300)).toBe(false);
    hooks.setLastAcceptedTHostForTest(1_000);
    expect(hooks.isPlausibleTHostForTest(1_000 + 4_000)).toBe(true);
    expect(hooks.isPlausibleTHostForTest(1_000 + 6_000)).toBe(false);
    hooks.updateServerClockOffset(5_000, 6_000);
    expect(hooks.getHostClockOffset()).not.toBe(0);
    hooks.applyHostMigration({ hostId: "b" });
    expect(hooks.getHostClockOffset()).toBe(0);
  });
});

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
    // * Non-hosts freeze until first post-migration snap (or freezeMaxMs) — NET-MIG-3.
    expect(getHostMigrationFreezeUntilMs()).toBeGreaterThan(0);
  });

  it("ends the non-host migration freeze when the first new-host snapshot lands (NET-MIG-3)", () => {
    hooks.setHostStateForTest({
      youConnId: "me",
      netSlots: [
        { kind: "human", connId: "me", name: "ME" },
        { kind: "human", connId: "newHost", name: "NEW" },
      ],
    });
    hooks.setHostIdForTest("oldHost");
    hooks.applyHostMigration({ hostId: "newHost" });
    expect(getHostMigrationFreezeUntilMs()).toBeGreaterThan(0);
    expect(isHostMigrationAwaitingFirstSnap()).toBe(true);

    hooks.dispatchP2P(encodeHostStateSnapshot({ seq: 1, tHost: 1200, carts: snap(1, 0, 0) }), "newHost");
    expect(hooks.getBufferLength()).toBe(1);
    expect(getHostMigrationFreezeUntilMs()).toBe(0);
    expect(isHostMigrationAwaitingFirstSnap()).toBe(false);
  });

  it("keeps ghost-guard after freeze max without a snap (NET-MIG-3 residual)", () => {
    // * Freeze cap 0 → prediction unfreezes immediately, but awaitingFirstSnap stays
    // * true so lastCartsCache / remote colliders cannot ghost until a real snap.
    const prevMax = CONFIG.net.hostMigrationFreezeMaxMs;
    CONFIG.net.hostMigrationFreezeMaxMs = 0;
    try {
      hooks.setHostStateForTest({
        youConnId: "me",
        netSlots: [
          { kind: "human", connId: "me", name: "ME" },
          { kind: "human", connId: "newHost", name: "NEW" },
        ],
      });
      hooks.setHostIdForTest("oldHost");
      hooks.applyHostMigration({ hostId: "newHost" });
      expect(getHostMigrationFreezeUntilMs()).toBe(0);
      expect(isHostMigrationAwaitingFirstSnap()).toBe(true);

      hooks.dispatchP2P(encodeHostStateSnapshot({ seq: 1, tHost: 1200, carts: snap(1, 0, 0) }), "newHost");
      expect(isHostMigrationAwaitingFirstSnap()).toBe(false);
      expect(getHostMigrationFreezeUntilMs()).toBe(0);
    } finally {
      CONFIG.net.hostMigrationFreezeMaxMs = prevMax;
    }
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

  it("explains an AFK migration once with the promoted host name", () => {
    const toasts = [];
    globalThis.window.CartRave = {
      showToast: (message) => toasts.push(message),
    };
    try {
      hooks.setHostStateForTest({
        youConnId: "me",
        netSlots: [
          { kind: "human", connId: "me", name: "ME" },
          { kind: "human", connId: "newHost", name: "NOVA" },
        ],
      });
      hooks.setHostIdForTest("oldHost");

      hooks.applyHostMigration({ hostId: "newHost", reason: "host_afk" });

      expect(toasts).toEqual(["Host stepped away — NOVA is hosting."]);
    } finally {
      delete globalThis.window.CartRave;
    }
  });

  it("uses smoother-multiplayer copy when the strongest host returns", () => {
    const toasts = [];
    globalThis.window.CartRave = {
      showToast: (message) => toasts.push(message),
    };
    try {
      hooks.setHostStateForTest({
        youConnId: "me",
        netSlots: [
          { kind: "human", connId: "me", name: "ME" },
          { kind: "human", connId: "returning", name: "NOVA" },
        ],
      });
      hooks.setHostIdForTest("me");

      hooks.applyHostMigration({ hostId: "returning", reason: "host_return" });

      expect(toasts).toEqual(["Host moved to NOVA for smoother multiplayer."]);
    } finally {
      delete globalThis.window.CartRave;
    }
  });

  it("explains a disconnect migration to the promoted peer by name (FIX-MIG)", () => {
    const toasts = [];
    globalThis.window.CartRave = {
      showToast: (message) => toasts.push(message),
    };
    try {
      hooks.setHostStateForTest({
        youConnId: "me",
        netSlots: [
          { kind: "human", connId: "me", name: "ME" },
          { kind: "human", connId: "newHost", name: "NOVA" },
        ],
      });
      hooks.setHostIdForTest("oldHost");

      hooks.applyHostMigration({ hostId: "newHost", reason: "host_disconnect" });

      expect(toasts).toEqual(["Host left — NOVA is hosting."]);
    } finally {
      delete globalThis.window.CartRave;
    }
  });

  it("tells the survivor they are hosting after a disconnect (FIX-MIG)", () => {
    const toasts = [];
    globalThis.window.CartRave = {
      showToast: (message) => toasts.push(message),
    };
    try {
      hooks.setHostStateForTest({
        youConnId: "me",
        netSlots: [
          { kind: "human", connId: "me", name: "ME" },
          { kind: "human", connId: "peer", name: "PEER" },
        ],
      });
      hooks.setHostIdForTest("oldHost");

      hooks.applyHostMigration({ hostId: "me", reason: "host_disconnect" });

      expect(toasts).toEqual(["You're hosting — previous host left."]);
    } finally {
      delete globalThis.window.CartRave;
    }
  });

  it("falls back when disconnect promote has no host name (FIX-MIG)", () => {
    const toasts = [];
    globalThis.window.CartRave = {
      showToast: (message) => toasts.push(message),
    };
    try {
      hooks.setHostStateForTest({
        youConnId: "me",
        netSlots: [
          { kind: "human", connId: "me", name: "ME" },
          { kind: "human", connId: "newHost" },
        ],
      });
      hooks.setHostIdForTest("oldHost");

      hooks.applyHostMigration({ hostId: "newHost", reason: "host_disconnect" });

      expect(toasts).toEqual(["Host left — a new player is hosting."]);
    } finally {
      delete globalThis.window.CartRave;
    }
  });

  it("toasts a bare A→B handoff as disconnect (FIX-MIG-PT-1 stale-DO residual)", () => {
    const toasts = [];
    globalThis.window.CartRave = {
      showToast: (message) => toasts.push(message),
    };
    try {
      hooks.setHostStateForTest({
        youConnId: "me",
        netSlots: [
          { kind: "human", connId: "me", name: "ME" },
          { kind: "human", connId: "newHost", name: "NOVA" },
        ],
      });
      hooks.setHostIdForTest("oldHost");

      // * No reason field — same wire shape as pre-FIX-MIG / warm DO still on old code.
      hooks.applyHostMigration({ hostId: "newHost" });

      expect(toasts).toEqual(["Host left — NOVA is hosting."]);
    } finally {
      delete globalThis.window.CartRave;
    }
  });

  it("stays toast-silent on bare first-host assign (no prior host)", () => {
    const toasts = [];
    globalThis.window.CartRave = {
      showToast: (message) => toasts.push(message),
    };
    try {
      hooks.setHostStateForTest({
        youConnId: "me",
        netSlots: [{ kind: "human", connId: "me", name: "ME" }],
      });
      hooks.setHostIdForTest(null);

      hooks.applyHostMigration({ hostId: "me" });

      expect(toasts).toEqual([]);
    } finally {
      delete globalThis.window.CartRave;
    }
  });

  it("restores open kill credit from the last attribution cache on promote (NET-MIG-1)", () => {
    hooks.setHostStateForTest({
      youConnId: "me",
      netSlots: [
        { kind: "human", connId: "me", name: "ME" },
        { kind: "human", connId: "peer", name: "PEER" },
      ],
    });
    hooks.setHostIdForTest("oldHost");
    // * Compact wire ages: victim 1 hit by 0, 400ms ago, critical, from podium.
    hooks.setLastAttributionCache({
      h: [[1, 0, 1, 12.5, 1, 400]],
      s: [0, 0, 0, 0],
      c: [],
    });

    hooks.applyHostMigration({ hostId: "me" });

    expect(getIsHost()).toBe(true);
    const hits = GameState.getLastHitBy();
    const hit = hits.get(1);
    expect(hit).toBeTruthy();
    expect(hit.attackerSlotIndex).toBe(0);
    expect(hit.wasCritical).toBe(true);
    expect(hit.fromPodium).toBe(true);
    expect(hit.impactSpeed).toBeCloseTo(12.5, 5);
    // * Re-anchored to local now: age ≈ 400ms.
    expect(Math.abs((performance.timeOrigin + performance.now()) - hit.timestamp - 400)).toBeLessThan(50);
  });
});

// --- HOST-CAP-1: weak-host toast (join-time score, once per hostship) -----------------

describe("weak-host warning (HOST-CAP-1 wire)", () => {
  /** @type {string[]} */
  let toasts;

  beforeEach(() => {
    toasts = [];
    globalThis.window = globalThis.window || globalThis;
    globalThis.window.CartRave = {
      showToast: (msg) => {
        toasts.push(msg);
      },
    };
    hooks.resetNetState();
  });

  afterEach(() => {
    if (globalThis.window?.CartRave) delete globalThis.window.CartRave;
  });

  it("toasts once when local is host and score < 50", () => {
    hooks.setLocalHostScoreForTest(40);
    hooks.setHostStateForTest({ isHost: true, youConnId: "me" });
    hooks.maybeWarnWeakHostForTest();
    hooks.maybeWarnWeakHostForTest();
    expect(toasts).toHaveLength(1);
    expect(toasts[0]).toMatch(/multiplayer smoother/i);
    expect(hooks.getWeakHostWarnedForTest()).toBe(true);
  });

  it("never toasts for non-host or neutral score 50", () => {
    hooks.setLocalHostScoreForTest(40);
    hooks.setHostStateForTest({ isHost: false, youConnId: "me" });
    hooks.maybeWarnWeakHostForTest();
    expect(toasts).toHaveLength(0);

    hooks.setLocalHostScoreForTest(50);
    hooks.setHostStateForTest({ isHost: true, youConnId: "me" });
    hooks.maybeWarnWeakHostForTest();
    expect(toasts).toHaveLength(0);
  });

  it("re-arms after losing host so a later hostship can warn again", () => {
    hooks.setLocalHostScoreForTest(30);
    hooks.setHostStateForTest({ isHost: true, youConnId: "me" });
    hooks.maybeWarnWeakHostForTest();
    expect(toasts).toHaveLength(1);

    // * Drop hostship (clears latch via setAuthorityMode non-host path).
    hooks.setAuthorityModeForTest(false);
    expect(hooks.getWeakHostWarnedForTest()).toBe(false);

    hooks.setAuthorityModeForTest(true);
    expect(toasts).toHaveLength(2);
  });
});
