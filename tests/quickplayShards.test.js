// quickplayShards.test.js — QUICKPLAY-SHARD-1: the shared public-quickplay predicate.
//
// * Why this exists: quickplay used to be ONE global Durable Object — four slots, so four
// * humans worldwide, and the fifth was closed 4004 "Room full". Sharding splits it into
// * `quickplay` + `quickplay2…N`, and `isQuickplayRoom` is the single definition of "is this a
// * public quickplay room" that every mode and policy decision on both planes keys off.
// *
// * The alphanumeric rule is the load-bearing one. `resolvedPartyRoomFromUrl` tests
// * /^[A-Za-z0-9]{2,16}$/ and SILENTLY falls back to "quickplay" on a miss, so a `quickplay__2`
// * scheme would collapse every shard URL back into the one global room — sharding would look
// * implemented and do nothing. The round-trip test below is what pins that.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  MAX_QUICKPLAY_SHARDS,
  isQuickplayRoom,
  isReservedRoomName,
  nextQuickplayShard,
} from "../shared/roomCodes.js";
import { isContinuousModeRoom } from "../shared/readiness.js";

/** The exact gate `resolvedPartyRoomFromUrl` (src/netcode.js) applies to `?room=`. */
const URL_ROOM_PATTERN = /^[A-Za-z0-9]{2,16}$/;

describe("isQuickplayRoom", () => {
  it("accepts shard 1 and numbered shards", () => {
    expect(isQuickplayRoom("quickplay")).toBe(true);
    expect(isQuickplayRoom("quickplay2")).toBe(true);
    expect(isQuickplayRoom("quickplay20")).toBe(true);
  });

  it("rejects friends codes, other modes, and non-strings", () => {
    for (const room of ["KALE7", "solo123", "testdrive", "", "quickplayx", "xquickplay2"]) {
      expect(isQuickplayRoom(room)).toBe(false);
    }
    for (const room of [null, undefined, 7, {}]) {
      expect(isQuickplayRoom(/** @type {any} */ (room))).toBe(false);
    }
  });

  it("rejects the harness prefix — `quickplay__x` is a party-do room, not a public shard", () => {
    // * It is still CONTINUOUS (asserted below); it is just not a public shard, so a full
    // * harness room must never hand its client a retryRoom and send it chasing shards.
    expect(isQuickplayRoom("quickplay__seat-arm-abc")).toBe(false);
  });
});

describe("shard ids survive the URL funnel", () => {
  it("every shard the chain can emit passes the ?room= gate", () => {
    // * The regression that would make sharding a no-op: an id that fails this pattern is
    // * silently rewritten to "quickplay", so every shard would land back in the global room.
    let room = "quickplay";
    const seen = [room];
    for (let i = 0; i < MAX_QUICKPLAY_SHARDS + 2; i += 1) {
      const next = nextQuickplayShard(room);
      if (next == null) break;
      expect(next).toMatch(URL_ROOM_PATTERN);
      expect(isQuickplayRoom(next)).toBe(true);
      seen.push(next);
      room = next;
    }
    expect(seen).toHaveLength(MAX_QUICKPLAY_SHARDS);
    expect(seen[1]).toBe("quickplay2");
  });

  it("never mints `quickplay1` — shard 1 has exactly one name", () => {
    expect(nextQuickplayShard("quickplay")).toBe("quickplay2");
    let room = "quickplay";
    for (let i = 0; i < MAX_QUICKPLAY_SHARDS; i += 1) {
      const next = nextQuickplayShard(room);
      if (next == null) break;
      expect(next).not.toBe("quickplay1");
      room = next;
    }
  });
});

describe("nextQuickplayShard", () => {
  it("stops at the cap so the chain terminates", () => {
    expect(nextQuickplayShard(`quickplay${MAX_QUICKPLAY_SHARDS}`)).toBeNull();
    // * Null is the "no hop" signal — the client then takes the original room-full path, so the
    // * worst case is exactly today's behaviour rather than an endless chase.
    expect(nextQuickplayShard("quickplay999")).toBeNull();
  });

  it("returns null for anything that is not a public shard", () => {
    for (const room of ["KALE7", "solo1", "quickplay__x", "", null, undefined]) {
      expect(nextQuickplayShard(/** @type {any} */ (room))).toBeNull();
    }
  });
});

describe("shards cannot collide with player-facing room codes", () => {
  it("the whole quickplay family stays reserved from the typed-code field", () => {
    // * Already true before this card (prefix match), which is why sharding needed no change
    // * here — but it is the invariant that stops a friends code becoming a public shard.
    for (const room of ["quickplay", "quickplay2", "QUICKPLAY7", "QuickPlay20"]) {
      expect(isReservedRoomName(room)).toBe(true);
    }
  });
});

describe("the four call sites route through the predicate", () => {
  // * Source asserts. These modules are not importable in a unit run (netcode.js pulls
  // * PartySocket and the whole netcode graph; party/index.ts is Worker TS), so the shape is
  // * pinned in text. Behaviour is proven by the party-do suite and the netharness scenario.
  const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");

  it("detectGameMode — the SEC-DIAG-1 regression bar", () => {
    // * If this reverts to an exact match, a ?diag=1 host on any overflow shard gets setScores
    // * back, because that gate keys on the mode string this function returns. The behavioural
    // * half of this bar lives in tests/devCommands.test.js.
    const src = read("../src/netcode.js");
    const fn = src.slice(src.indexOf("export function detectGameMode("));
    const body = fn.slice(0, fn.indexOf("\n}"));
    expect(body).toMatch(/isQuickplayRoom\(room\)/);
    expect(body).not.toMatch(/room === "quickplay"/);
  });

  it("the server emits retryRoom only for public shards, from one place", () => {
    const src = read("../party/index.ts");
    expect(src).toMatch(/isQuickplayRoom\(this\.name\) \? nextQuickplayShard\(this\.name\) : null/);
    // * Both full-reject call sites funnel through #rejectPendingConn, so one emission point is
    // * the whole surface — a second would be a place for the harness-room carve-out to rot.
    expect(src.match(/type: MSG\.joinRejected/g)).toHaveLength(1);
  });

  it("invite capture refuses the reserved family instead of hand-rolling it", () => {
    // * Otherwise `?room=quickplay3` is offered to the player as a friend invite.
    const src = read("../src/orchestration/menuPlayEntry.js");
    expect(src).toMatch(/if \(isReservedRoomName\(raw\)\) return false;/);
    expect(src).not.toMatch(/raw === "quickplay"/);
  });

  it("auto-rejoin accepts any shard but still reads the RAW param", () => {
    // * resolvedPartyRoomFromUrl() defaults a bare URL to "quickplay", so using it here would
    // * auto-enter a match straight off the title screen.
    const src = read("../src/orchestration/menuPlayEntry.js");
    expect(src).toMatch(/isQuickplayRoom\(roomParam\)/);
    expect(src).toMatch(/const roomParam = new URLSearchParams\(window\.location\.search/);
  });
});

describe("continuous policy covers shards", () => {
  it("treats every public shard as continuous, like shard 1", () => {
    // * If a shard were NOT continuous, the server seats humans isReady:false while the client
    // * also stops auto-readying — nobody is ever ready and the room deadlocks in lobby.
    expect(isContinuousModeRoom("quickplay")).toBe(true);
    expect(isContinuousModeRoom("quickplay2")).toBe(true);
    expect(isContinuousModeRoom("quickplay20")).toBe(true);
  });

  it("keeps the party-do harness prefix continuous", () => {
    // * Retained deliberately: those tests inject the DO name directly (an underscore would
    // * never survive the URL funnel) so each continuous-policy test gets an isolated DO.
    expect(isContinuousModeRoom("quickplay__seat-arm-abc")).toBe(true);
  });

  it("leaves friends rooms on manual ready-up", () => {
    expect(isContinuousModeRoom("KALE7")).toBe(false);
    expect(isContinuousModeRoom("")).toBe(false);
  });
});
