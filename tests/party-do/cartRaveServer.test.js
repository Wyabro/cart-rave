/// <reference path="./env.d.ts" />
// CartRaveServer DO harness (A5b / A6a).
// Workers runtime: hello / join+seat+keepalive / onClose migration /
// silent-reap migration / same-clientId ghost exorcism.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  REAP_THROTTLE_MS,
  REAP_TIMEOUT_MS,
  getReapThrottleMs,
  getReapTimeoutMs,
  setPlayReadyTimeoutOverride,
  setReapOverrides,
} from "../../party/constants.ts";
import { MSG } from "../../shared/protocol.js";
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
  it("sends hello with youConnId as host on first connect", async () => {
    const room = uniqueRoom("hello");
    const client = await openPartyClient(room, { ip: "10.0.0.1" });
    const hello = await client.awaitType(MSG.hello);

    expect(hello.youConnId).toEqual(expect.any(String));
    expect(hello.hostId).toBe(hello.youConnId);
    expect(hello.v).toBe(2);

    client.close();
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
        1000,
      );

      await sleep(250);
      joiner.client.sendJson({ type: MSG.keepalive, tClient: 1 });

      const migrated = await migratePromise;
      expect(migrated.hostId).toBe(joiner.youConnId);

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

  it("resets playReady timeout when a new human seats mid-wait", async () => {
    setPlayReadyTimeoutOverride(400);
    try {
      const room = uniqueContinuousRoom("reset");
      const host = await connectAndSeat(room, {
        name: "QP-R1",
        color: "pink",
        clientId: "cid-qp-r1",
        ip: "10.0.3.5",
        hostScore: 90,
      });
      expect(host.client.messages.some((m) => m.type === MSG.gameStart)).toBe(false);

      // * Burn most of the first ceiling — joiner seating must reset it.
      await sleep(280);
      expect(host.client.messages.some((m) => m.type === MSG.gameStart)).toBe(false);

      const joiner = await connectAndSeat(room, {
        name: "QP-R2",
        color: "blue",
        clientId: "cid-qp-r2",
        ip: "10.0.3.6",
        hostScore: 40,
      });
      expect(host.client.messages.some((m) => m.type === MSG.gameStart)).toBe(false);

      // * Old deadline would fire soon; reset means still no arm after a short wait.
      await sleep(200);
      expect(host.client.messages.some((m) => m.type === MSG.gameStart)).toBe(false);

      const start = await host.client.awaitType(MSG.gameStart, 3000);
      expect(start.startsAtMs).toEqual(expect.any(Number));

      host.client.close();
      joiner.client.close();
    } finally {
      setPlayReadyTimeoutOverride(null);
    }
  });
});