/// <reference path="./env.d.ts" />
// CLIENT-ID-AUTH-1 — clientId claim hijack, driven end-to-end through the real
// CartRaveServer DO WebSocket entry.
//
// Before the guard: a join naming a victim's clientId exorcised the victim's LIVE
// socket (close 4010 + human slot → NPC) and could promote the joiner to host in a
// sole-human room. These tests pin the fix: only the minted session token proves
// ownership; wrong/missing tokens are inert, and the rightful owner can still
// replace their own ghost.

import { describe, expect, it } from "vitest";
import { openPartyClient } from "./wsClient.js";

const ROOM = `hijack-${Math.random().toString(16).slice(2)}`;
// * Unique per test: the registry is per-DO-instance memory that persists across
// * tests in this file, so a reused clientId would already be claimed (and a
// * tokenless rejoin would correctly NOT mint).
let cidSeq = 0;
const freshCid = () => `victim-cid-${++cidSeq}-${Math.random().toString(16).slice(2)}`;

/** "Not closed" assertion: awaitClose rejects on timeout, which is the pass case. */
async function expectStillOpen(client, label) {
  let closed = false;
  const watch = client.awaitClose(500).then(
    (code) => {
      closed = true;
      return code;
    },
    () => null,
  );
  // Give any wrongful 4010 time to arrive while traffic flows.
  client.sendJson({ type: "keepalive", tClient: 1 });
  const code = await watch;
  expect(closed, `${label} socket should still be open (got close code ${code})`).toBe(false);
}

describe("CLIENT-ID-AUTH-1 clientId claim hijack", () => {
  it("mints a session token on first claim of a clientId", async () => {
    const cid = freshCid();
    const victim = await openPartyClient(ROOM);
    const hello = await victim.awaitType("hello");
    victim.sendJson({ type: "join", name: "VICTIM", clientId: cid });
    const mint = await victim.awaitType("session_token");
    expect(typeof mint.sessionToken).toBe("string");
    expect(mint.sessionToken.length).toBeGreaterThan(0);
    expect(hello.youConnId).toBeTruthy();
    victim.close();
  });

  it("a hijacker join with NO token does not close the victim or steal the slot", async () => {
    const cid = freshCid();
    const victim = await openPartyClient(ROOM);
    await victim.awaitType("hello");
    victim.sendJson({ type: "join", name: "VICTIM", clientId: cid });
    const { sessionToken } = await victim.awaitType("session_token");

    const attacker = await openPartyClient(ROOM);
    await attacker.awaitType("hello");
    attacker.sendJson({ type: "join", name: "HIJACKER", clientId: cid });

    await expectStillOpen(victim, "victim");
    // No mint for the attacker — the clientId is already claimed.
    const minted = attacker.messages.some((m) => m.type === "session_token");
    expect(minted).toBe(false);

    // Seat both via color_pick and confirm the victim keeps a human slot.
    const victimYou = /** @type {string} */ ((await victim.awaitType("hello")).youConnId);
    victim.sendJson({ type: "color_pick", color: "pink" });
    attacker.sendJson({ type: "color_pick", color: "cyan" });
    const finalSlots = await victim.awaitMessage(
      (m) =>
        m.type === "slots" &&
        Array.isArray(m.slots) &&
        m.slots.some((s) => s && s.kind === "human" && s.connId === victimYou),
    );
    const victimHuman = finalSlots.slots.some(
      (s) => s && s.kind === "human" && s.connId === victimYou,
    );
    expect(victimHuman).toBe(true);

    victim.close();
    attacker.close();
    void sessionToken;
  });

  it("a hijacker join with a WRONG token does not close the victim", async () => {
    const cid = freshCid();
    const victim = await openPartyClient(ROOM);
    await victim.awaitType("hello");
    victim.sendJson({ type: "join", name: "VICTIM", clientId: cid });
    await victim.awaitType("session_token");

    const attacker = await openPartyClient(ROOM);
    await attacker.awaitType("hello");
    attacker.sendJson({
      type: "join",
      name: "HIJACKER",
      clientId: cid,
      sessionToken: "guessed-token",
    });

    await expectStillOpen(victim, "victim");
    victim.close();
    attacker.close();
  });

  it("the rightful owner presenting the minted token replaces their own ghost (4010)", async () => {
    const cid = freshCid();
    const first = await openPartyClient(ROOM);
    await first.awaitType("hello");
    first.sendJson({ type: "join", name: "OWNER", clientId: cid });
    const { sessionToken } = await first.awaitType("session_token");

    const second = await openPartyClient(ROOM);
    await second.awaitType("hello");
    second.sendJson({
      type: "join",
      name: "OWNER",
      clientId: cid,
      sessionToken,
    });

    const closeCode = await first.awaitClose(3000);
    expect(closeCode).toBe(4010);

    // The new session is bound too — no fresh mint for an already-owned clientId
    // presented with the right token.
    const minted = second.messages.some((m) => m.type === "session_token");
    expect(minted).toBe(false);
    second.close();
  });
});

