// @vitest-environment happy-dom
// connectionEvents.test.js — CONN-TOASTS-1 join/leave toast policy:
//   1. diffHumanSlots — human connId membership diff over MSG.slots payloads.
//   2. filterConnectionEvents — self-skip, single-broadcast same-name coalesce,
//      and the reconnect-blip cooldown (both directions).
// happy-dom: netcode.js touches window at module scope via its transitive imports.

import { describe, expect, it } from "vitest";
import {
  CONN_TOAST_COOLDOWN_MS,
  diffHumanSlots,
  filterConnectionEvents,
} from "../../src/netcode.js";

const human = (connId, name, extra = {}) => ({ kind: "human", connId, name, ...extra });
const npc = (name = "BOT") => ({ kind: "npc", connId: null, name });

// --- diffHumanSlots: membership-only diff over human slots -------------------

describe("diffHumanSlots", () => {
  it("detects a new human seat with its name", () => {
    const prev = [human("a", "Wyatt"), npc(), npc(), npc()];
    const next = [human("a", "Wyatt"), human("b", "Bo"), npc(), npc()];
    expect(diffHumanSlots(prev, next)).toEqual({
      joined: [{ connId: "b", name: "Bo" }],
      left: [],
    });
  });

  it("detects a departed human (slot converted to NPC) with its name", () => {
    const prev = [human("a", "Wyatt"), human("b", "Bo"), npc(), npc()];
    const next = [human("a", "Wyatt"), npc(), npc(), npc()];
    expect(diffHumanSlots(prev, next)).toEqual({
      joined: [],
      left: [{ connId: "b", name: "Bo" }],
    });
  });

  it("treats npc→human and human→npc as join and leave", () => {
    const prev = [npc(), npc(), npc(), npc()];
    const next = [human("c", "Cat"), npc(), npc(), npc()];
    expect(diffHumanSlots(prev, next)).toEqual({
      joined: [{ connId: "c", name: "Cat" }],
      left: [],
    });
  });

  it("ignores cosmetic-only changes (color / look / ready)", () => {
    const prev = [human("a", "Wyatt", { color: "pink", isReady: false })];
    const next = [human("a", "Wyatt", { color: "green", isReady: true })];
    expect(diffHumanSlots(prev, next)).toEqual({ joined: [], left: [] });
  });

  it("ignores NPC-only changes (bot difficulty rename)", () => {
    const prev = [human("a", "Wyatt"), npc("BOT A"), npc("BOT B"), npc()];
    const next = [human("a", "Wyatt"), npc("HARD A"), npc("HARD B"), npc()];
    expect(diffHumanSlots(prev, next)).toEqual({ joined: [], left: [] });
  });

  it("is set-based: a roster shuffle produces no events", () => {
    const prev = [human("a", "A"), human("b", "B")];
    const next = [human("b", "B"), human("a", "A")];
    expect(diffHumanSlots(prev, next)).toEqual({ joined: [], left: [] });
  });

  it("reports multiple simultaneous joins and leaves", () => {
    const prev = [human("a", "A"), human("b", "B"), npc(), npc()];
    const next = [npc(), human("c", "C"), human("d", "D"), npc()];
    expect(diffHumanSlots(prev, next)).toEqual({
      joined: [
        { connId: "c", name: "C" },
        { connId: "d", name: "D" },
      ],
      left: [
        { connId: "a", name: "A" },
        { connId: "b", name: "B" },
      ],
    });
  });

  it("tolerates null/undefined slots and human slots without a connId", () => {
    expect(diffHumanSlots(null, undefined)).toEqual({ joined: [], left: [] });
    expect(diffHumanSlots([], [])).toEqual({ joined: [], left: [] });
    expect(diffHumanSlots([{ kind: "human", connId: null, name: "X" }], [])).toEqual({
      joined: [],
      left: [],
    });
  });
});

// --- filterConnectionEvents: self-skip / coalesce / blip cooldown -------------

describe("filterConnectionEvents", () => {
  const recent = () => new Map();
  const base = (over = {}) => ({
    youConnId: "local",
    recent: recent(),
    nowMs: 100_000,
    ...over,
  });

  it("drops the local player's own join and leave", () => {
    const diff = {
      joined: [{ connId: "local", name: "Me" }, { connId: "x", name: "X" }],
      left: [{ connId: "local", name: "Me" }],
    };
    expect(filterConnectionEvents(diff, base())).toEqual([{ kind: "joined", name: "X" }]);
  });

  it("nets a name present in both sets of one diff to zero (ghost-exorcism swap)", () => {
    const diff = {
      joined: [{ connId: "b", name: "Wyatt" }],
      left: [{ connId: "a", name: "Wyatt" }],
    };
    expect(filterConnectionEvents(diff, base())).toEqual([]);
  });

  it("suppresses a leave that follows a join within the cooldown", () => {
    const opts = base({ nowMs: 100_000 });
    const join = {
      joined: [{ connId: "x", name: "X" }],
      left: [],
    };
    expect(filterConnectionEvents(join, opts)).toEqual([{ kind: "joined", name: "X" }]);
    const leave = {
      joined: [],
      left: [{ connId: "x", name: "X" }],
    };
    expect(filterConnectionEvents(leave, opts)).toEqual([]);
  });

  it("suppresses a rejoin that follows a leave within the cooldown (reconnect blip)", () => {
    const opts = base({ nowMs: 100_000 });
    const leave = {
      joined: [],
      left: [{ connId: "a", name: "Wyatt" }],
    };
    expect(filterConnectionEvents(leave, opts)).toEqual([{ kind: "left", name: "Wyatt" }]);
    const rejoin = {
      joined: [{ connId: "b", name: "Wyatt" }],
      left: [],
    };
    expect(filterConnectionEvents(rejoin, opts)).toEqual([]);
  });

  it("emits the opposite kind again once the cooldown has expired", () => {
    const opts = base({ nowMs: 100_000 });
    filterConnectionEvents(
      { joined: [{ connId: "x", name: "X" }], left: [] },
      opts,
    );
    const later = base({ ...opts, nowMs: 100_000 + CONN_TOAST_COOLDOWN_MS + 1 });
    const out = filterConnectionEvents(
      { joined: [], left: [{ connId: "x", name: "X" }] },
      later,
    );
    expect(out).toEqual([{ kind: "left", name: "X" }]);
  });

  it("emits same-kind repeats without suppression (distinct events)", () => {
    const opts = base({ nowMs: 100_000 });
    filterConnectionEvents(
      { joined: [{ connId: "x", name: "X" }], left: [] },
      opts,
    );
    const second = filterConnectionEvents(
      { joined: [{ connId: "y", name: "Y" }], left: [] },
      base({ ...opts, nowMs: 100_500 }),
    );
    expect(second).toEqual([{ kind: "joined", name: "Y" }]);
  });

  it("falls back to 'Player' for an empty name and honours cooldownMs override", () => {
    const opts = base({ nowMs: 100_000, cooldownMs: 2000 });
    expect(
      filterConnectionEvents({ joined: [{ connId: "z", name: "" }], left: [] }, opts),
    ).toEqual([{ kind: "joined", name: "Player" }]);
    const inWindow = filterConnectionEvents(
      { joined: [], left: [{ connId: "z", name: "" }] },
      base({ ...opts, nowMs: 100_500 }),
    );
    expect(inWindow).toEqual([]);
  });

  it("records only emitted events in the recent map and bounds it", () => {
    const opts = base({ nowMs: 100_000 });
    const diff = {
      joined: [{ connId: "a", name: "A" }, { connId: "b", name: "B" }],
      left: [{ connId: "a", name: "A" }],
    };
    const out = filterConnectionEvents(diff, opts);
    // * A appears in both sets → net zero; only B is recorded and emitted.
    expect(out).toEqual([{ kind: "joined", name: "B" }]);
    expect(opts.recent.has("A")).toBe(false);
    expect(opts.recent.get("B")).toEqual({ kind: "joined", atMs: 100_000 });

    const big = base({ nowMs: 200_000 });
    const many = {
      joined: Array.from({ length: 40 }, (_, i) => ({ connId: `c${i}`, name: `C${i}` })),
      left: [],
    };
    filterConnectionEvents(many, big);
    expect(big.recent.size).toBeLessThanOrEqual(24);
  });
});
