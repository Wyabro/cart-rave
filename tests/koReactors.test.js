import { describe, it, expect } from "vitest";
import {
  dispatchKOEvent,
  killFeedReactor,
  localKillConfirmReactor,
  announcerReactor,
  DEFAULT_KO_REACTORS,
} from "../src/scoring/koReactors.js";

function makeCtx(overrides = {}) {
  const calls = { killFeed: [], announcer: [], localConfirm: [] };
  const ctx = {
    netSlots: [{ name: "A" }, { name: "B" }, { name: "C" }, { name: "D" }],
    localSlotIndex: 1,
    colorHexForSlot: () => 0xff00ff,
    pickSelfDeathVerb: () => "FELL OFF",
    hud: {
      addKillFeedEntry: (...args) => calls.killFeed.push(args),
      colorHexToCss: (h) => `#${Number(h).toString(16)}`,
      pickSelfDeathVerb: () => "WIPED OUT",
    },
    onAnnouncerFall: (fall) => calls.announcer.push(fall),
    onLocalKillConfirm: (victim, tier) => calls.localConfirm.push([victim, tier]),
    ...overrides,
  };
  return { ctx, calls };
}

const KILL = {
  victimSlotIndex: 3,
  attackerSlotIndex: 1,
  isKill: true,
  verb: "RAMMED",
  comboTier: 2,
  comboMultiplier: 2.0,
};

const SELF = {
  victimSlotIndex: 3,
  attackerSlotIndex: null,
  isKill: false,
  verb: "SUDDEN DEATH", // wire verb; the kill feed picks a fresh self verb instead
  comboTier: 0,
  comboMultiplier: 1.0,
};

describe("localKillConfirmReactor", () => {
  it("fires when the local player scored the kill", () => {
    const { ctx, calls } = makeCtx({ localSlotIndex: 1 });
    localKillConfirmReactor(KILL, ctx);
    expect(calls.localConfirm).toEqual([[3, 2]]);
  });

  it("does not fire when a different player scored", () => {
    const { ctx, calls } = makeCtx({ localSlotIndex: 0 });
    localKillConfirmReactor(KILL, ctx);
    expect(calls.localConfirm).toEqual([]);
  });

  it("does not fire on a self/environmental fall", () => {
    const { ctx, calls } = makeCtx({ localSlotIndex: 1 });
    localKillConfirmReactor({ ...SELF, attackerSlotIndex: 1 }, ctx);
    expect(calls.localConfirm).toEqual([]); // isKill false -> no confirm
  });
});

describe("killFeedReactor", () => {
  it("renders an attributed kill with attacker, verb and combo", () => {
    const { ctx, calls } = makeCtx();
    killFeedReactor(KILL, ctx);
    expect(calls.killFeed).toHaveLength(1);
    expect(calls.killFeed[0]).toEqual(["B", "#ff00ff", "RAMMED", "D", "#ff00ff", 2, 2.0]);
  });

  it("renders a self fall with a fresh self-death verb and no actor", () => {
    const { ctx, calls } = makeCtx();
    killFeedReactor(SELF, ctx);
    expect(calls.killFeed).toHaveLength(1);
    expect(calls.killFeed[0]).toEqual([null, null, "WIPED OUT", "D", "#ff00ff"]);
  });

  it("falls back to P-labels when a slot has no name", () => {
    const { ctx, calls } = makeCtx({ netSlots: [null, null, null, null] });
    killFeedReactor(KILL, ctx);
    expect(calls.killFeed[0][0]).toBe("P2"); // attacker slot 1
    expect(calls.killFeed[0][3]).toBe("P4"); // victim slot 3
  });

  it("no-ops when the hud has no kill feed", () => {
    const { ctx } = makeCtx({ hud: {} });
    expect(() => killFeedReactor(KILL, ctx)).not.toThrow();
  });
});

describe("announcerReactor", () => {
  it("forwards the fall to the announcer with the three observed fields", () => {
    const { ctx, calls } = makeCtx();
    announcerReactor(KILL, ctx);
    expect(calls.announcer).toEqual([{ victimSlotIndex: 3, attackerSlotIndex: 1, comboTier: 2 }]);
  });
});

describe("dispatchKOEvent", () => {
  it("runs the default reactors in order for a kill", () => {
    const { ctx, calls } = makeCtx({ localSlotIndex: 1 });
    dispatchKOEvent(KILL, ctx);
    expect(calls.localConfirm).toEqual([[3, 2]]);
    expect(calls.killFeed).toHaveLength(1);
    expect(calls.announcer).toHaveLength(1);
  });

  it("runs a custom reactor list when provided", () => {
    const { ctx } = makeCtx();
    const seen = [];
    dispatchKOEvent(KILL, ctx, [(e) => seen.push(e.verb)]);
    expect(seen).toEqual(["RAMMED"]);
  });

  it("exposes the default reactor order", () => {
    expect(DEFAULT_KO_REACTORS).toEqual([
      localKillConfirmReactor,
      killFeedReactor,
      announcerReactor,
    ]);
  });
});
