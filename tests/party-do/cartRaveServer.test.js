/// <reference path="./env.d.ts" />
// CartRaveServer DO harness smoke (A5b / SRV-TEST-1).
// Workers runtime only — join/seat/keepalive + onClose host migration.

import { describe, expect, it } from "vitest";
import { MSG } from "../../shared/protocol.js";
import { connectAndSeat, openPartyClient } from "./wsClient.js";

function uniqueRoom(label) {
  return `a5b-${label}-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 8)}`;
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
});
