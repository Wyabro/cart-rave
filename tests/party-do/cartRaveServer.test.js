/// <reference path="./env.d.ts" />
// CartRaveServer DO harness (A5b / A6a).
// Workers runtime: hello / join+seat+keepalive / onClose migration /
// silent-reap migration / same-clientId ghost exorcism.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  RATE_LIMIT_MAX_PER_SEC,
  REAP_THROTTLE_MS,
  REAP_TIMEOUT_MS,
  getReapThrottleMs,
  getReapTimeoutMs,
  setPlatformLiveIdsOverride,
  setPlayReadyTimeoutOverride,
  setReapOverrides,
} from "../../party/constants.ts";
import { MSG } from "../../shared/protocol.js";
import { NPC_NAME_PERSONALITY } from "../../shared/npcNames.js";
import { QUICKPLAY_ARENA_IDS } from "../../shared/arenaPool.js";
import { COUNTDOWN_MS, FLYOVER_PREROLL_MS } from "../../shared/roundConstants.js";
import { connectAndSeat, openPartyClient } from "./wsClient.js";

function uniqueRoom(label) {
  return `a6a-${label}-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 8)}`;
}

/** Continuous-policy room with an isolated DO (not the shared public "quickplay"). */
function uniqueContinuousRoom(label) {
  return `quickplay__${label}-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 6)}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("CartRaveServer DO harness", () => {
  // * CONN-TRACK-LEAK-1: the platform-live override is module-global. Clear it
  // * after every test (even a failed one) so it can never poison later tests.
  afterEach(() => {
    setPlatformLiveIdsOverride(null);
  });

  it("sends hello with youConnId as host on first connect", async () => {
    const room = uniqueRoom("hello");
    const client = await openPartyClient(room, { ip: "10.0.0.1" });
    const hello = await client.awaitType(MSG.hello);

    expect(hello.youConnId).toEqual(expect.any(String));
    expect(hello.hostId).toBe(hello.youConnId);
    expect(hello.v).toBe(2);
    expect(hello.joinOrder).toEqual([hello.youConnId]);

    client.close();
  });

  it("hello and slots carry joinOrder in connect order", async () => {
    const room = uniqueRoom("join-order");
    const first = await connectAndSeat(room, {
      name: "FIRST",
      color: "pink",
      ip: "10.0.3.1",
    });
    const later = await connectAndSeat(room, {
      name: "LATER",
      color: "blue",
      ip: "10.0.3.2",
    });

    expect(first.hello.joinOrder).toEqual([first.youConnId]);
    expect(later.hello.joinOrder).toEqual([first.youConnId, later.youConnId]);

    const seatedSlots = later.client.messages
      .filter((m) => m.type === MSG.slots)
      .reverse()
      .find((m) => (m.slots ?? []).filter((s) => s && s.kind === "human").length === 2);
    expect(seatedSlots?.joinOrder).toEqual([first.youConnId, later.youConnId]);

    first.client.close();
    later.client.close();
  });

  it("starts a room with one NPC of each personality", async () => {
    const room = uniqueRoom("npc-types");
    const client = await openPartyClient(room, { ip: "10.0.0.11" });
    const hello = await client.awaitType(MSG.hello);
    const npcSlots = (hello.slots ?? []).filter((s) => s && s.kind === "npc");
    expect(npcSlots).toHaveLength(4);
    const types = npcSlots.map((s) => NPC_NAME_PERSONALITY[s.name]);
    expect(new Set(types).size).toBe(4);

    client.close();
  });

  it("releases platform-dead IP tracking before the connection cap", async () => {
    const room = uniqueRoom("conn-track-leak");
    const ip = "10.9.9.9";

    // Five connections from one IP fill the cap; the platform then drops all of
    // them without onClose firing (simulated via the override).
    const stale = [];
    for (let i = 0; i < 5; i += 1) {
      const c = await openPartyClient(room, { ip });
      await c.awaitType(MSG.hello);
      stale.push(c);
    }

    setPlatformLiveIdsOverride(new Set());

    // Five genuinely-live joins: the first triggers the pre-cap prune, which
    // releases the five stale counts before the cap decision. Without the fix,
    // the first live join is rejected 4029 and this hello never arrives.
    const live = [];
    const liveIds = new Set();
    for (let n = 0; n < 5; n += 1) {
      const c = await openPartyClient(room, { ip });
      const hello = await c.awaitType(MSG.hello);
      liveIds.add(hello.youConnId);
      setPlatformLiveIdsOverride(new Set(liveIds));
      live.push(c);
    }

    // Sixth live attempt hits the cap (4029).
    const over = await openPartyClient(room, { ip });
    expect(await over.awaitClose()).toBe(4029);

    setPlatformLiveIdsOverride(null);
    for (const c of stale) c.close();
    for (const c of live) c.close();
    over.close();
  });

  it("seats a human via join + color_pick and echoes keepalive", async () => {
    const room = uniqueRoom("seat");
    const { client, youConnId } = await connectAndSeat(room, {
      name: "SEAT1",
      color: "blue",
      ip: "10.0.0.2",
    });

    const seated = client.messages
      .filter((m) => m.type === MSG.slots)
      .flatMap((m) => m.slots ?? [])
      .find((s) => s && s.connId === youConnId && s.kind === "human");

    expect(seated?.kind).toBe("human");
    expect(seated?.lookHex).toBe(0xff00ff);
    // * color_pick after seating may reassign when the inherited booth color is
    // * already "taken" by this human in #getAvailableColors — assert palette membership.
    expect(["pink", "blue", "green", "yellow", "neonOrange"]).toContain(seated?.color);

    const tClient = 12345.6;
    client.sendJson({ type: MSG.keepalive, tClient });
    const ack = await client.awaitMessage(
      (m) => m.type === MSG.keepalive && m.tClient === tClient,
    );
    expect(ack.serverNowMs).toEqual(expect.any(Number));

    client.close();
  });

  it("counts frames against the rate limit before JSON.parse", async () => {
    const room = uniqueRoom("ws-rate-preparse");
    const client = await openPartyClient(room, { ip: "10.0.8.1" });
    await client.awaitType(MSG.hello);

    // * Invalid JSON used to return before the counter, so one IP could pay
    // * WS_ABSOLUTE_MAX parse cost unbounded. Fill the window with garbage,
    // * then a legal keepalive must be the frame that trips 4028.
    for (let i = 0; i < RATE_LIMIT_MAX_PER_SEC; i += 1) {
      client.socket.send("not-json");
    }
    client.sendJson({ type: MSG.keepalive, tClient: 1 });
    expect(await client.awaitClose()).toBe(4028);

    client.close();
  });

  it("migrates host onClose when a seated peer remains", async () => {
    const room = uniqueRoom("migrate");

    // * Seat host fully before opening the second client (avoids race on empty room).
    const host = await connectAndSeat(room, {
      name: "HOST",
      color: "pink",
      clientId: "cid-host",
      ip: "10.0.0.3",
      hostScore: 90,
    });
    expect(host.hello.hostId).toBe(host.youConnId);

    const joiner = await connectAndSeat(room, {
      name: "JOIN",
      color: "green",
      clientId: "cid-join",
      ip: "10.0.0.4",
      hostScore: 40,
    });

    // * Clear prior host_migrated noise, then close the host.
    const migratePromise = joiner.client.awaitMessage(
      (m) => m.type === MSG.hostMigrated && m.hostId === joiner.youConnId,
    );
    host.client.close();

    const migrated = await migratePromise;
    expect(migrated.hostId).toBe(joiner.youConnId);
    expect(migrated.reason).toBe("host_disconnect");

    // * Room always has NPC slots — wait until the departed host connId is gone
    // * and only the joiner remains human.
    const slotsAfter = await joiner.client.awaitMessage(
      (m) =>
        m.type === MSG.slots &&
        Array.isArray(m.slots) &&
        !m.slots.some((s) => s && s.connId === host.youConnId) &&
        m.slots.filter((s) => s && s.kind === "human").length === 1 &&
        m.slots.some((s) => s && s.kind === "human" && s.connId === joiner.youConnId),
    );
    const humans = slotsAfter.slots.filter((s) => s.kind === "human");
    expect(humans).toHaveLength(1);
    expect(humans[0].connId).toBe(joiner.youConnId);

    joiner.client.close();
  });

  describe("FIX-MIG continuous-policy migration", () => {
    it("migrates host onClose under continuous room with host_disconnect reason", async () => {
      const room = uniqueContinuousRoom("mig-close");

      const host = await connectAndSeat(room, {
        name: "HOST",
        color: "pink",
        clientId: "cid-c-host",
        ip: "10.0.3.1",
        hostScore: 90,
      });
      expect(host.hello.hostId).toBe(host.youConnId);

      const joiner = await connectAndSeat(room, {
        name: "JOIN",
        color: "green",
        clientId: "cid-c-join",
        ip: "10.0.3.2",
        hostScore: 40,
      });

      const migratePromise = joiner.client.awaitMessage(
        (m) => m.type === MSG.hostMigrated && m.hostId === joiner.youConnId,
      );
      host.client.close();

      const migrated = await migratePromise;
      expect(migrated.hostId).toBe(joiner.youConnId);
      expect(migrated.reason).toBe("host_disconnect");

      const slotsAfter = await joiner.client.awaitMessage(
        (m) =>
          m.type === MSG.slots &&
          Array.isArray(m.slots) &&
          !m.slots.some((s) => s && s.connId === host.youConnId) &&
          m.slots.filter((s) => s && s.kind === "human").length === 1 &&
          m.slots.some((s) => s && s.kind === "human" && s.connId === joiner.youConnId),
      );
      const humans = slotsAfter.slots.filter((s) => s.kind === "human");
      expect(humans).toHaveLength(1);
      expect(humans[0].connId).toBe(joiner.youConnId);

      joiner.client.close();
    });

    describe("silent-drop reaper under continuous", () => {
      beforeEach(() => {
        setReapOverrides({ timeoutMs: 200, throttleMs: 100 });
      });
      afterEach(() => {
        setReapOverrides(null);
      });

      it("reaps a silent host and migrates with host_disconnect reason", async () => {
        const room = uniqueContinuousRoom("mig-silent");

        const host = await connectAndSeat(room, {
          name: "HOST",
          color: "pink",
          clientId: "cid-c-silent-host",
          ip: "10.0.3.3",
          hostScore: 90,
        });
        const joiner = await connectAndSeat(room, {
          name: "JOIN",
          color: "green",
          clientId: "cid-c-silent-join",
          ip: "10.0.3.4",
          hostScore: 40,
        });
        expect(host.hello.hostId).toBe(host.youConnId);

        const migratePromise = joiner.client.awaitMessage(
          (m) => m.type === MSG.hostMigrated && m.hostId === joiner.youConnId,
          1000,
        );

        await sleep(250);
        joiner.client.sendJson({ type: MSG.keepalive, tClient: 1 });

        const migrated = await migratePromise;
        expect(migrated.hostId).toBe(joiner.youConnId);
        expect(migrated.reason).toBe("host_disconnect");

        const slotsAfter = await joiner.client.awaitMessage(
          (m) =>
            m.type === MSG.slots &&
            Array.isArray(m.slots) &&
            !m.slots.some((s) => s && s.connId === host.youConnId) &&
            m.slots.some((s) => s && s.kind === "human" && s.connId === joiner.youConnId),
          1000,
        );
        const humans = slotsAfter.slots.filter((s) => s && s.kind === "human");
        expect(humans).toHaveLength(1);
        expect(humans[0].connId).toBe(joiner.youConnId);

        joiner.client.close();
        try {
          host.client.close();
        } catch {
          /* server may already have closed it */
        }
      });
    });
  });

  it("migrates an away live host mid-round, but ignores peers and cooldown thrash", async () => {
    const room = uniqueRoom("host-away");
    const host = await connectAndSeat(room, {
      name: "HOST",
      color: "pink",
      clientId: "cid-away-host",
      ip: "10.0.0.13",
      hostScore: 100,
    });
    const joiner = await connectAndSeat(room, {
      name: "JOIN",
      color: "green",
      clientId: "cid-away-join",
      ip: "10.0.0.14",
      hostScore: 80,
    });

    host.client.sendJson({
      type: MSG.hostRound,
      round: {
        phase: "countdown",
        countdownStartedAtMs: 1000,
        startedAtMs: 0,
        winnerSlotIndex: null,
        scores: { 0: 0, 1: 0, 2: 0, 3: 0 },
      },
    });
    await joiner.client.awaitMessage((m) => m.type === MSG.round && m.round?.phase === "countdown");
    host.client.sendJson({
      type: MSG.hostRound,
      round: {
        phase: "running",
        countdownStartedAtMs: 1000,
        startedAtMs: 2000,
        winnerSlotIndex: null,
        scores: { 0: 0, 1: 0, 2: 0, 3: 0 },
      },
    });
    await joiner.client.awaitMessage((m) => m.type === MSG.round && m.round?.phase === "running");

    joiner.client.sendJson({ type: MSG.hostAway });
    await sleep(50);
    expect(joiner.client.messages.filter((m) => m.reason === "host_afk")).toHaveLength(0);

    const migratePromise = joiner.client.awaitMessage(
      (m) => m.type === MSG.hostMigrated && m.reason === "host_afk",
    );
    host.client.sendJson({ type: MSG.hostAway });
    const migrated = await migratePromise;
    expect(migrated.hostId).toBe(joiner.youConnId);

    joiner.client.sendJson({ type: MSG.hostAway });
    await sleep(50);
    expect(
      joiner.client.messages.filter((m) => m.type === MSG.hostMigrated && m.reason === "host_afk"),
    ).toHaveLength(1);

    await sleep(5100);
    joiner.client.sendJson({ type: MSG.hostPresent });
    await sleep(50);
    expect(joiner.client.messages.filter((m) => m.reason === "host_return")).toHaveLength(0);

    const returnPromise = host.client.awaitMessage(
      (m) => m.type === MSG.hostMigrated && m.reason === "host_return",
    );
    host.client.sendJson({ type: MSG.hostPresent });
    const returned = await returnPromise;
    expect(returned.hostId).toBe(host.youConnId);

    host.client.close();
    joiner.client.close();
  }, 10_000);

  it("does not promote a platform-dead peer on host_away", async () => {
    // * ZOMBIE-HOST-PICK-1: B stays in #connections (socket open, no onClose)
    // * but is dropped from the platform live set. Host-away must pick C.
    const room = uniqueRoom("zombie-host-pick");
    const host = await connectAndSeat(room, {
      name: "HOST",
      color: "pink",
      clientId: "cid-zhp-host",
      ip: "10.0.8.1",
      hostScore: 100,
    });
    const zombie = await connectAndSeat(room, {
      name: "ZOMBIE",
      color: "green",
      clientId: "cid-zhp-zombie",
      ip: "10.0.8.2",
      hostScore: 80,
    });
    const live = await connectAndSeat(room, {
      name: "LIVE",
      color: "blue",
      clientId: "cid-zhp-live",
      ip: "10.0.8.3",
      hostScore: 60,
    });

    host.client.sendJson({
      type: MSG.hostRound,
      round: {
        phase: "countdown",
        countdownStartedAtMs: 1000,
        startedAtMs: 0,
        winnerSlotIndex: null,
        scores: { 0: 0, 1: 0, 2: 0, 3: 0 },
      },
    });
    await live.client.awaitMessage((m) => m.type === MSG.round && m.round?.phase === "countdown");
    host.client.sendJson({
      type: MSG.hostRound,
      round: {
        phase: "running",
        countdownStartedAtMs: 1000,
        startedAtMs: 2000,
        winnerSlotIndex: null,
        scores: { 0: 0, 1: 0, 2: 0, 3: 0 },
      },
    });
    await live.client.awaitMessage((m) => m.type === MSG.round && m.round?.phase === "running");

    setPlatformLiveIdsOverride(new Set([host.youConnId, live.youConnId]));

    const migratePromise = live.client.awaitMessage(
      (m) => m.type === MSG.hostMigrated && m.reason === "host_afk",
    );
    host.client.sendJson({ type: MSG.hostAway });
    const migrated = await migratePromise;
    expect(migrated.hostId).toBe(live.youConnId);
    expect(migrated.hostId).not.toBe(zombie.youConnId);

    host.client.close();
    zombie.client.close();
    live.client.close();
  });

  it("does not migrate host_away to a sole platform-dead peer", async () => {
    // * ZOMBIE-HOST-PICK-1: A away + B platform-dead → liveHumanCount 1 → no migrate.
    const room = uniqueRoom("zombie-host-hold");
    const host = await connectAndSeat(room, {
      name: "HOST",
      color: "pink",
      clientId: "cid-zhh-host",
      ip: "10.0.8.4",
      hostScore: 100,
    });
    const zombie = await connectAndSeat(room, {
      name: "ZOMBIE",
      color: "green",
      clientId: "cid-zhh-zombie",
      ip: "10.0.8.5",
      hostScore: 80,
    });

    host.client.sendJson({
      type: MSG.hostRound,
      round: {
        phase: "countdown",
        countdownStartedAtMs: 1000,
        startedAtMs: 0,
        winnerSlotIndex: null,
        scores: { 0: 0, 1: 0, 2: 0, 3: 0 },
      },
    });
    await zombie.client.awaitMessage((m) => m.type === MSG.round && m.round?.phase === "countdown");
    host.client.sendJson({
      type: MSG.hostRound,
      round: {
        phase: "running",
        countdownStartedAtMs: 1000,
        startedAtMs: 2000,
        winnerSlotIndex: null,
        scores: { 0: 0, 1: 0, 2: 0, 3: 0 },
      },
    });
    await zombie.client.awaitMessage((m) => m.type === MSG.round && m.round?.phase === "running");

    setPlatformLiveIdsOverride(new Set([host.youConnId]));

    host.client.sendJson({ type: MSG.hostAway });
    await sleep(80);
    expect(
      zombie.client.messages.filter((m) => m.type === MSG.hostMigrated && m.reason === "host_afk"),
    ).toHaveLength(0);
    expect(
      host.client.messages.filter((m) => m.type === MSG.hostMigrated && m.reason === "host_afk"),
    ).toHaveLength(0);

    host.client.close();
    zombie.client.close();
  });

  it("does not let a high-score joiner steal host via hostPresent", async () => {
    const room = uniqueRoom("host-present");
    const host = await connectAndSeat(room, {
      name: "HOST",
      color: "pink",
      clientId: "cid-present-host",
      ip: "10.0.0.15",
      hostScore: 40,
    });
    const joiner = await connectAndSeat(room, {
      name: "JOIN",
      color: "green",
      clientId: "cid-present-join",
      ip: "10.0.0.16",
      hostScore: 100,
    });

    host.client.sendJson({
      type: MSG.hostRound,
      round: {
        phase: "countdown",
        countdownStartedAtMs: 1000,
        startedAtMs: 0,
        winnerSlotIndex: null,
        scores: { 0: 0, 1: 0, 2: 0, 3: 0 },
      },
    });
    await joiner.client.awaitMessage((m) => m.type === MSG.round && m.round?.phase === "countdown");
    host.client.sendJson({
      type: MSG.hostRound,
      round: {
        phase: "running",
        countdownStartedAtMs: 1000,
        startedAtMs: 2000,
        winnerSlotIndex: null,
        scores: { 0: 0, 1: 0, 2: 0, 3: 0 },
      },
    });
    await joiner.client.awaitMessage((m) => m.type === MSG.round && m.round?.phase === "running");

    joiner.client.sendJson({ type: MSG.hostPresent });
    await sleep(50);
    expect(joiner.client.messages.filter((m) => m.reason === "host_return")).toHaveLength(0);

    host.client.sendJson({
      type: MSG.join,
      name: "HOST",
      clientId: "cid-present-host",
      hostScore: 40,
    });
    joiner.client.sendJson({ type: MSG.hostPresent });
    await sleep(50);
    expect(
      joiner.client.messages.filter((m) => m.type === MSG.hostMigrated && m.hostId === joiner.youConnId),
    ).toHaveLength(0);

    host.client.close();
    joiner.client.close();
  });

  it("reap overrides default to production constants when cleared", () => {
    setReapOverrides({ timeoutMs: 1, throttleMs: 1 });
    setReapOverrides(null);
    expect(getReapTimeoutMs()).toBe(REAP_TIMEOUT_MS);
    expect(getReapThrottleMs()).toBe(REAP_THROTTLE_MS);
  });

  describe("silent-drop reaper (A6a)", () => {
    beforeEach(() => {
      setReapOverrides({ timeoutMs: 200, throttleMs: 100 });
    });
    afterEach(() => {
      setReapOverrides(null);
    });

    it("reaps a silent host and migrates to the seated joiner", async () => {
      const room = uniqueRoom("silent");

      const host = await connectAndSeat(room, {
        name: "HOST",
        color: "pink",
        clientId: "cid-silent-host",
        ip: "10.0.1.1",
        hostScore: 90,
      });
      const joiner = await connectAndSeat(room, {
        name: "JOIN",
        color: "green",
        clientId: "cid-silent-join",
        ip: "10.0.1.2",
        hostScore: 40,
      });
      expect(host.hello.hostId).toBe(host.youConnId);

      // * Host keeps the socket open but sends nothing — do NOT close() (that is onClose).
      const migratePromise = joiner.client.awaitMessage(
        (m) => m.type === MSG.hostMigrated && m.hostId === joiner.youConnId,
        1500,
      );

      await sleep(250);
      joiner.client.sendJson({ type: MSG.keepalive, tClient: 1 });

      const migrated = await migratePromise;
      expect(migrated.hostId).toBe(joiner.youConnId);
      expect(migrated.reason).toBe("host_disconnect");

      const slotsAfter = await joiner.client.awaitMessage(
        (m) =>
          m.type === MSG.slots &&
          Array.isArray(m.slots) &&
          !m.slots.some((s) => s && s.connId === host.youConnId) &&
          m.slots.some((s) => s && s.kind === "human" && s.connId === joiner.youConnId),
        1000,
      );
      const humans = slotsAfter.slots.filter((s) => s && s.kind === "human");
      expect(humans).toHaveLength(1);
      expect(humans[0].connId).toBe(joiner.youConnId);

      // * Leave host socket as-is (already reaped/closed by server); close joiner.
      joiner.client.close();
      try {
        host.client.close();
      } catch {
        /* server may already have closed it */
      }
    });

    it("reaps a platform-dead non-host and broadcasts the slot conversion", async () => {
      // * CONN-TOASTS-1: reap exists because onClose never fires (crash / platform
      // * drop), so the slot conversion was previously published to no one — every
      // * client kept a ghost human and no leave toast fired until an unrelated
      // * broadcast. setPlatformLiveIdsOverride fakes the platform dropping GHOST
      // * without onClose; the reap pass must broadcast MSG.slots with the slot
      // * converted to NPC.
      const room = uniqueRoom("reap-broadcast");

      const host = await connectAndSeat(room, {
        name: "HOST",
        color: "pink",
        clientId: "cid-reap-host",
        ip: "10.0.5.1",
        hostScore: 90,
      });
      const ghost = await connectAndSeat(room, {
        name: "GHOST",
        color: "green",
        clientId: "cid-reap-ghost",
        ip: "10.0.5.2",
        hostScore: 40,
      });
      expect(host.hello.hostId).toBe(host.youConnId);

      // * GHOST leaves the platform live set while the server still tracks it.
      setPlatformLiveIdsOverride(new Set([host.youConnId]));

      const slotsPromise = host.client.awaitMessage(
        (m) =>
          m.type === MSG.slots &&
          Array.isArray(m.slots) &&
          !m.slots.some((s) => s && s.connId === ghost.youConnId) &&
          m.slots.some((s) => s && s.kind === "human" && s.connId === host.youConnId),
        1500,
      );

      await sleep(250);
      host.client.sendJson({ type: MSG.keepalive, tClient: 1 });

      const slotsAfter = await slotsPromise;
      const humans = slotsAfter.slots.filter((s) => s && s.kind === "human");
      expect(humans).toHaveLength(1);
      expect(humans[0].connId).toBe(host.youConnId);
      const npcSlot = slotsAfter.slots.find((s) => s && s.kind === "npc");
      expect(npcSlot).toBeTruthy();

      ghost.client.close();
      try {
        host.client.close();
      } catch {
        /* server may already have closed it */
      }
    });
  });

  it("exorcises ghost host on same clientId rejoin and repairs host (4010)", async () => {
    const room = uniqueRoom("ghost");

    const host = await connectAndSeat(room, {
      name: "HOST",
      color: "pink",
      clientId: "cid-ghost-host",
      ip: "10.0.2.1",
      hostScore: 90,
    });
    const joiner = await connectAndSeat(room, {
      name: "JOIN",
      color: "green",
      clientId: "cid-ghost-join",
      ip: "10.0.2.2",
      hostScore: 40,
    });

    const ghostClosed = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("ghost close timed out")), 3000);
      host.client.socket.addEventListener("close", (event) => {
        clearTimeout(timer);
        resolve(event);
      });
    });

    const migratePromise = joiner.client.awaitMessage(
      (m) => m.type === MSG.hostMigrated && m.hostId === joiner.youConnId,
      3000,
    );

    // * Third WS, same clientId as host — race-free ghost path (no close+reopen).
    const replacement = await openPartyClient(room, { ip: "10.0.2.3" });
    await replacement.awaitType(MSG.hello);
    replacement.sendJson({
      type: MSG.join,
      name: "HOST2",
      clientId: "cid-ghost-host",
      hostScore: 90,
    });

    const closeEvent = await ghostClosed;
    expect(closeEvent.code).toBe(4010);

    const migrated = await migratePromise;
    expect(migrated.hostId).toBe(joiner.youConnId);

    joiner.client.close();
    replacement.close();
  });


  it("does not arm game_start on seat alone in continuous mode; arms after clientPlayReady", async () => {
    // * COUNTDOWN-ARM-1: seat sets isReady but not isPlayReady — no game_start until warm signal.
    const room = uniqueContinuousRoom("seat-arm");
    const { client, youConnId } = await connectAndSeat(room, {
      name: "QP1",
      color: "blue",
      clientId: "cid-qp-seat",
      ip: "10.0.3.1",
      hostScore: 80,
    });

    const seated = client.messages
      .filter((m) => m.type === MSG.slots)
      .flatMap((m) => m.slots ?? [])
      .find((s) => s && s.connId === youConnId && s.kind === "human");
    expect(seated?.isReady).toBe(true);
    expect(seated?.isPlayReady).toBe(false);

    expect(client.messages.some((m) => m.type === MSG.gameStart)).toBe(false);

    client.sendJson({ type: MSG.clientPlayReady });
    const start = await client.awaitType(MSG.gameStart, 3000);
    expect(start.startsAtMs).toEqual(expect.any(Number));
    expect(start.serverNowMs).toEqual(expect.any(Number));
    // * CAM-PT-MP-1: the anchor carries the opening fly-over pre-roll on top of the
    // * countdown, so every client can hold the arena before the digits start.
    expect(start.startsAtMs - start.serverNowMs).toBeGreaterThanOrEqual(
      COUNTDOWN_MS + FLYOVER_PREROLL_MS - 500,
    );

    // * Idempotent re-send must not double-arm / error.
    client.sendJson({ type: MSG.clientPlayReady });
    await sleep(50);
    expect(client.messages.filter((m) => m.type === MSG.gameStart)).toHaveLength(1);

    client.close();
  });

  it("still cancels an armed countdown when a player unreadies during the pre-roll", async () => {
    // * CAM-PT-MP-1: the arm window has to span FLYOVER_PREROLL_MS + COUNTDOWN_MS. Left at
    // * COUNTDOWN_MS it would disarm mid-digits, and a late unready would find nothing to
    // * abort. Friends/private room only — continuous mode has no manual unready.
    const room = uniqueRoom("preroll-abort");
    const { client } = await connectAndSeat(room, {
      name: "RDY1",
      color: "blue",
      clientId: "cid-preroll-abort",
      ip: "10.0.4.1",
    });

    client.sendJson({ type: MSG.readyToggle, isReady: true });
    const start = await client.awaitType(MSG.gameStart, 3000);
    expect(start.startsAtMs - start.serverNowMs).toBeGreaterThanOrEqual(
      COUNTDOWN_MS + FLYOVER_PREROLL_MS - 500,
    );

    // * Unready inside the pre-roll window. The abort is grace-delayed
    // * (COUNTDOWN_ABORT_GRACE_MS = 1500), not instant.
    client.sendJson({ type: MSG.readyToggle, isReady: false });
    const cancel = await client.awaitType(MSG.countdownCancel, 4000);
    expect(cancel.type).toBe(MSG.countdownCancel);

    client.close();
  });

  function gameStartCount(client) {
    return client.messages.filter((m) => m.type === MSG.gameStart).length;
  }

  function awaitNthGameStart(client, n, timeoutMs = 3000) {
    return client.awaitMessage(
      (m) => m.type === MSG.gameStart && gameStartCount(client) >= n,
      timeoutMs,
    );
  }

  it("friends first-match GO still arms on readyToggle without clientPlayReady", async () => {
    const room = uniqueRoom("friends-first-go");
    const host = await connectAndSeat(room, {
      name: "FR1",
      color: "blue",
      clientId: "cid-fr-first-h",
      ip: "10.0.5.1",
    });
    const joiner = await connectAndSeat(room, {
      name: "FR2",
      color: "pink",
      clientId: "cid-fr-first-j",
      ip: "10.0.5.2",
    });

    host.client.sendJson({ type: MSG.readyToggle, ready: true });
    joiner.client.sendJson({ type: MSG.readyToggle, ready: true });
    const start = await host.client.awaitType(MSG.gameStart, 3000);
    expect(start.startsAtMs).toEqual(expect.any(Number));
    expect(gameStartCount(host.client)).toBe(1);

    host.client.close();
    joiner.client.close();
  });

  it("friends rematch waits for both clientPlayReady after playAgain", async () => {
    // * FRIENDS-ROTATE-1: playAgain auto-readies humans but must not arm GO until
    // * every live human signals warm (arena rotation is in flight on the client).
    const room = uniqueRoom("friends-rotate-rematch");
    const host = await connectAndSeat(room, {
      name: "FRH",
      color: "blue",
      clientId: "cid-fr-rot-h",
      ip: "10.0.5.3",
    });
    const joiner = await connectAndSeat(room, {
      name: "FRJ",
      color: "pink",
      clientId: "cid-fr-rot-j",
      ip: "10.0.5.4",
    });

    host.client.sendJson({ type: MSG.playAgain });
    await sleep(2200);
    expect(gameStartCount(host.client)).toBe(0);

    host.client.sendJson({ type: MSG.clientPlayReady });
    await sleep(150);
    expect(gameStartCount(host.client)).toBe(0);

    const startPromise = awaitNthGameStart(host.client, 1);
    joiner.client.sendJson({ type: MSG.clientPlayReady });
    const start = await startPromise;
    expect(start.startsAtMs).toEqual(expect.any(Number));

    host.client.close();
    joiner.client.close();
  }, 10_000);

  it("friends rematch playReady wait does not arm if a human unreadies", async () => {
    setPlayReadyTimeoutOverride(400);
    try {
      const room = uniqueRoom("friends-rotate-unready");
      const host = await connectAndSeat(room, {
        name: "FRU-H",
        color: "blue",
        clientId: "cid-fr-unr-h",
        ip: "10.0.5.5",
      });
      const joiner = await connectAndSeat(room, {
        name: "FRU-J",
        color: "pink",
        clientId: "cid-fr-unr-j",
        ip: "10.0.5.6",
      });

      host.client.sendJson({ type: MSG.playAgain });
      await sleep(2200);
      expect(gameStartCount(host.client)).toBe(0);

      joiner.client.sendJson({ type: MSG.readyToggle, ready: false });
      await sleep(600);
      expect(gameStartCount(host.client)).toBe(0);

      joiner.client.sendJson({ type: MSG.readyToggle, ready: true });
      await sleep(150);
      expect(gameStartCount(host.client)).toBe(0);

      host.client.sendJson({ type: MSG.clientPlayReady });
      joiner.client.sendJson({ type: MSG.clientPlayReady });
      const start = await awaitNthGameStart(host.client, 1, 3000);
      expect(start.startsAtMs).toEqual(expect.any(Number));

      host.client.close();
      joiner.client.close();
    } finally {
      setPlayReadyTimeoutOverride(null);
    }
  }, 15_000);

  it("arms game_start after playReady timeout when clientPlayReady never arrives", async () => {
    setPlayReadyTimeoutOverride(250);
    try {
      const room = uniqueContinuousRoom("timeout");
      const { client, youConnId } = await connectAndSeat(room, {
        name: "QP-TO",
        color: "green",
        clientId: "cid-qp-timeout",
        ip: "10.0.3.2",
        hostScore: 70,
      });
      expect(youConnId).toEqual(expect.any(String));
      expect(client.messages.some((m) => m.type === MSG.gameStart)).toBe(false);

      const start = await client.awaitType(MSG.gameStart, 3000);
      expect(start.startsAtMs).toEqual(expect.any(Number));
      client.close();
    } finally {
      setPlayReadyTimeoutOverride(null);
    }
  });

  it("waits for both humans' clientPlayReady before arming in continuous mode", async () => {
    const room = uniqueContinuousRoom("both");
    const host = await connectAndSeat(room, {
      name: "QP-H",
      color: "pink",
      clientId: "cid-qp-h",
      ip: "10.0.3.3",
      hostScore: 90,
    });
    const joiner = await connectAndSeat(room, {
      name: "QP-J",
      color: "blue",
      clientId: "cid-qp-j",
      ip: "10.0.3.4",
      hostScore: 40,
    });

    expect(host.client.messages.some((m) => m.type === MSG.gameStart)).toBe(false);

    host.client.sendJson({ type: MSG.clientPlayReady });
    await sleep(100);
    expect(host.client.messages.some((m) => m.type === MSG.gameStart)).toBe(false);

    const startPromise = host.client.awaitType(MSG.gameStart, 3000);
    joiner.client.sendJson({ type: MSG.clientPlayReady });
    const start = await startPromise;
    expect(start.startsAtMs).toEqual(expect.any(Number));

    host.client.close();
    joiner.client.close();
  });

  // * PLAYREADY-RESET-FLAKE-1: 400/280/120 wall-clock sandwich flakes when
  // * connectAndSeat takes >120 ms under full party-do / qa load. Product reset
  // * (#schedulePlayReadyWait({ reset: true })) is unchanged. Inequalities:
  // *   burn + join < CEILING  or gameStart is already in the buffer
  // *   tJoin + CEILING - SLACK > t0 + CEILING  (burn is 1200, SLACK is 200)
  // *   tJoin + CEILING - SLACK < tJoin + CEILING
  it("resets playReady timeout when a new human seats mid-wait", async () => {
    const CEILING_MS = 2000;
    const JOIN_BUDGET_MS = 800;
    const SLACK_MS = 200;
    setPlayReadyTimeoutOverride(CEILING_MS);
    try {
      const room = uniqueContinuousRoom("reset");
      const host = await connectAndSeat(room, {
        name: "QP-R1",
        color: "pink",
        clientId: "cid-qp-r1",
        ip: "10.0.3.5",
        hostScore: 90,
      });
      const t0 = Date.now();
      const hasStart = () => host.client.messages.some((m) => m.type === MSG.gameStart);
      expect(hasStart()).toBe(false);

      await sleep(CEILING_MS - JOIN_BUDGET_MS);
      expect(hasStart()).toBe(false);

      const tJoinStart = Date.now();
      const joiner = await connectAndSeat(room, {
        name: "QP-R2",
        color: "blue",
        clientId: "cid-qp-r2",
        ip: "10.0.3.6",
        hostScore: 40,
      });
      const tJoin = Date.now();
      const elapsed = tJoin - t0;
      const joinMs = tJoin - tJoinStart;
      if (hasStart()) {
        throw new Error(
          `gameStart fired during join (elapsed=${elapsed}ms join=${joinMs}ms ceiling=${CEILING_MS}ms); first ceiling won the race`,
        );
      }

      const proveUntil = tJoin + CEILING_MS - SLACK_MS;
      const waitMs = proveUntil - Date.now();
      if (waitMs > 0) await sleep(waitMs);
      expect(hasStart()).toBe(false);

      const start = await host.client.awaitType(MSG.gameStart, SLACK_MS + 1000);
      expect(start.startsAtMs).toEqual(expect.any(Number));

      host.client.close();
      joiner.client.close();
    } finally {
      setPlayReadyTimeoutOverride(null);
    }
  }, 30_000);

  // * QUICKPLAY-SHARD-1. Quickplay was one global DO — four slots, so four humans WORLDWIDE,
  // * and the fifth was closed 4004 with a dead-end toast. A full PUBLIC shard now names the
  // * next one in `retryRoom` and the client hops there. These run against a real full room
  // * rather than a mocked one, because "full" is structural (no NPC slot left), not a constant.
  describe("overflow shards (QUICKPLAY-SHARD-1)", () => {
    it("hands a rejected joiner the next shard when a public shard fills up", async () => {
      const room = "quickplay19";
      const seated = [];
      try {
        for (let i = 0; i < 4; i += 1) {
          seated.push(await connectAndSeat(room, {
            name: `FULL${i}`,
            clientId: `cid-shard-${i}`,
            ip: `10.9.9.${i + 1}`,
          }));
        }

        // * Fifth human: the socket IS accepted and gets a hello — rejection only happens at
        // * `join`, which is exactly why the server has a channel to answer on.
        const fifth = await openPartyClient(room, { ip: "10.9.9.5" });
        const hello = await fifth.awaitType("hello");
        expect(hello.slots.filter((s) => s && s.kind === "human")).toHaveLength(4);

        fifth.sendJson({ type: "join", name: "FIFTH", clientId: "cid-shard-5", hostScore: 50 });
        const rejected = await fifth.awaitType(MSG.joinRejected, 3000);
        expect(rejected.retryRoom).toBe("quickplay20");

        fifth.close();
      } finally {
        for (const s of seated) s.client.close();
      }
    });

    it("stops the chain at the cap rather than pointing past it", async () => {
      const room = `quickplay${20}`;
      const seated = [];
      try {
        for (let i = 0; i < 4; i += 1) {
          seated.push(await connectAndSeat(room, {
            name: `CAP${i}`,
            clientId: `cid-cap-${i}`,
            ip: `10.9.8.${i + 1}`,
          }));
        }
        const fifth = await openPartyClient(room, { ip: "10.9.8.5" });
        await fifth.awaitType("hello");
        fifth.sendJson({ type: "join", name: "CAPX", clientId: "cid-cap-5", hostScore: 50 });
        const rejected = await fifth.awaitType(MSG.joinRejected, 3000);
        // * Null means "no hop" — the client falls back to today's room-full toast, so the
        // * worst case at the cap is exactly the behaviour that shipped before this card.
        expect(rejected.retryRoom).toBeNull();
        fifth.close();
      } finally {
        for (const s of seated) s.client.close();
      }
    });

    it("never sends a harness room chasing a shard", async () => {
      // * `quickplay__*` is continuous for policy purposes but is NOT a public shard. A test
      // * room that fills must not hand its client a retryRoom pointing at real traffic.
      const room = uniqueContinuousRoom("nohop");
      const seated = [];
      try {
        for (let i = 0; i < 4; i += 1) {
          seated.push(await connectAndSeat(room, {
            name: `HARN${i}`,
            clientId: `cid-harn-${i}`,
            ip: `10.9.7.${i + 1}`,
          }));
        }
        const fifth = await openPartyClient(room, { ip: "10.9.7.5" });
        await fifth.awaitType("hello");
        fifth.sendJson({ type: "join", name: "HARNX", clientId: "cid-harn-5", hostScore: 50 });
        const rejected = await fifth.awaitType(MSG.joinRejected, 3000);
        expect(rejected.retryRoom).toBeNull();
        fifth.close();
      } finally {
        for (const s of seated) s.client.close();
      }
    });

    it("gives a shard the same random arena and medium AI as shard 1", async () => {
      // * The branch that sets both was an exact `this.name === "quickplay"`, so a shard would
      // * have started on the hardcoded default arena with AI "easy" and broadcast that to
      // * joiners as authoritative — QP-ORDER-1 silently off on every shard.
      const seat = await connectAndSeat("quickplay18", {
        name: "ARENA", clientId: "cid-arena-1", ip: "10.9.6.1",
      });
      try {
        expect(QUICKPLAY_ARENA_IDS).toContain(seat.hello.levelId);
        expect(seat.hello.aiDifficulty).toBe("medium");
      } finally {
        seat.client.close();
      }
    });

    it("sanitizes hostSpawn carts before storing and relaying (CONN-SPAWN-SANITIZE-1)", async () => {
      const room = uniqueRoom("spawn-sanitize");
      // * Seat the host as a human first — otherwise the joiner's connect hits the
      // * existingHumans === 0 path, which resets #carts before hello.
      const host = await connectAndSeat(room, {
        name: "HOST", clientId: "cid-spawn-1", ip: "10.0.0.31",
      });

      host.client.sendJson({
        type: MSG.hostSpawn,
        seq: 3,
        tHost: 1000,
        carts: [
          { p: [0, 0, 0], q: [0, 0, 0, 1] },
          { p: [1, 0, 1] },
          { p: "junk" },
          { p: [2, 0, 2] },
          { p: [3, 0, 3] }, // 5th valid entry — sliced off by the 4-slot cap
        ],
      });

      // * The joiner's hello echoes #carts — the sanitized copy. JSON serializes the
      // * dropped entry (an undefined array slot) as null on the wire.
      const joiner = await connectAndSeat(room, {
        name: "JOIN", clientId: "cid-spawn-2", ip: "10.0.0.32",
      });
      try {
        expect(joiner.hello.carts).toEqual([
          { p: [0, 0, 0], q: [0, 0, 0, 1] },
          { p: [1, 0, 1] },
          null,
          { p: [2, 0, 2] },
        ]);
      } finally {
        joiner.client.close();
        host.client.close();
      }
    });
  });

  describe("DEEPSEC-1 identity + host pick + allowlists", () => {
    it("rejects a second socket that reuses a live connection id", async () => {
      const room = uniqueRoom("pk-spoof");
      const host = await connectAndSeat(room, {
        name: "HOST",
        clientId: "cid-pk-host",
        ip: "10.0.4.1",
      });
      const spoof = await openPartyClient(room, {
        ip: "10.0.4.2",
        pk: host.youConnId,
      });
      const closeCode = await spoof.awaitClose(2000);
      expect(closeCode).toBe(4030);
      expect(spoof.messages.some((m) => m.type === "hello")).toBe(false);

      const tClient = 4242;
      host.client.sendJson({ type: MSG.keepalive, tClient });
      const ack = await host.client.awaitMessage(
        (m) => m.type === MSG.keepalive && m.tClient === tClient,
      );
      expect(ack.serverNowMs).toEqual(expect.any(Number));
      expect(
        host.client.messages.filter((m) => m.type === MSG.hostMigrated && m.hostId !== host.youConnId),
      ).toHaveLength(0);

      host.client.close();
      spoof.close();
    });

    it("does not migrate host on join hostScore:100", async () => {
      const room = uniqueRoom("score-join");
      const host = await connectAndSeat(room, {
        name: "HOST",
        clientId: "cid-score-host",
        ip: "10.0.4.3",
        hostScore: 40,
      });
      const joiner = await connectAndSeat(room, {
        name: "JOIN",
        clientId: "cid-score-join",
        ip: "10.0.4.4",
        hostScore: 100,
      });
      await sleep(50);
      const stolen = joiner.client.messages.filter(
        (m) => m.type === MSG.hostMigrated && m.hostId === joiner.youConnId,
      );
      expect(stolen).toHaveLength(0);
      expect(host.hello.hostId).toBe(host.youConnId);
      host.client.close();
      joiner.client.close();
    });

    it("does not let a non-host sdpOffer reach the host", async () => {
      const room = uniqueRoom("sdp-acl");
      const host = await connectAndSeat(room, {
        name: "HOST",
        clientId: "cid-sdp-host",
        ip: "10.0.4.5",
      });
      const joiner = await connectAndSeat(room, {
        name: "JOIN",
        clientId: "cid-sdp-join",
        ip: "10.0.4.6",
      });
      joiner.client.sendJson({
        type: MSG.sdpOffer,
        targetConnId: host.youConnId,
        sdp: { type: "offer", sdp: "v=0" },
      });
      await sleep(50);
      expect(host.client.messages.some((m) => m.type === MSG.sdpOffer)).toBe(false);
      host.client.close();
      joiner.client.close();
    });

    it("does not latch constructor or testArena levelId on a friends room", async () => {
      const room = uniqueRoom("level-acl");
      const host = await connectAndSeat(room, {
        name: "HOST",
        clientId: "cid-lvl-host",
        ip: "10.0.4.7",
      });
      const before = host.hello.levelId;
      host.client.sendJson({
        type: MSG.hostRound,
        levelId: "constructor",
        round: {
          phase: "countdown",
          countdownStartedAtMs: 1000,
          startedAtMs: 0,
          winnerSlotIndex: null,
          scores: { 0: 0, 1: 0, 2: 0, 3: 0 },
        },
      });
      const counted = await host.client.awaitMessage(
        (m) => m.type === MSG.round && m.round?.phase === "countdown",
      );
      expect(counted.levelId).toBe(before);
      expect(counted.levelId).not.toBe("constructor");

      host.client.sendJson({
        type: MSG.hostRound,
        levelId: "testArena",
        round: {
          phase: "running",
          countdownStartedAtMs: 1000,
          startedAtMs: 2000,
          winnerSlotIndex: null,
          scores: { 0: 0, 1: 0, 2: 0, 3: 0 },
        },
      });
      const running = await host.client.awaitMessage(
        (m) => m.type === MSG.round && m.round?.phase === "running",
      );
      expect(running.levelId).not.toBe("testArena");
      host.client.close();
    });
  });
});