// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { installDiagnostics, __resetDiagnosticsForTest } from "../../src/utils/diagnostics.js";
import { snapshotSelfKoTally, __resetSelfKoTallyForTest } from "../../src/utils/diagnostics.js";
import {
  dispatchKOEvent,
  killFeedReactor,
  localKillConfirmReactor,
  localDoomedReactor,
  arenaVfxReactor,
  announcerReactor,
  challengeReactor,
  matchStatsReactor,
  diagnosticsReactor,
  DEFAULT_KO_REACTORS,
} from "../../src/scoring/koReactors.js";

function makeCtx(overrides = {}) {
  const calls = { killFeed: [], announcer: [], localConfirm: [], localDoomed: [], challenge: [], arenaFlash: [] };
  const ctx = {
    netSlots: [
      { name: "A", kind: "human" },
      { name: "B", kind: "human" },
      { name: "C", kind: "human" },
      { name: "D", kind: "human" },
    ],
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
    onLocalDoomed: (event) => calls.localDoomed.push(event),
    onArenaKoFlash: (ev) => calls.arenaFlash.push(ev),
    recordChallenge: (id) => calls.challenge.push(id),
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
  victimKind: "human",
  victimAiName: null,
};

const SELF = {
  victimSlotIndex: 3,
  attackerSlotIndex: null,
  isKill: false,
  verb: "SUDDEN DEATH", // wire verb; the kill feed picks a fresh self verb instead
  comboTier: 0,
  comboMultiplier: 1.0,
  victimKind: "human",
  victimAiName: null,
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

describe("localDoomedReactor", () => {
  it("fires for a local victim after an attributed kill", () => {
    const { ctx, calls } = makeCtx({ localSlotIndex: 3 });
    localDoomedReactor(KILL, ctx);
    expect(calls.localDoomed).toEqual([KILL]);
  });

  it("fires for a local self or environmental fall", () => {
    const { ctx, calls } = makeCtx({ localSlotIndex: 3 });
    localDoomedReactor(SELF, ctx);
    expect(calls.localDoomed).toEqual([SELF]);
  });

  it("does not fire for the local attacker or a remote victim", () => {
    const attacker = makeCtx({ localSlotIndex: 1 });
    const spectator = makeCtx({ localSlotIndex: 0 });
    localDoomedReactor(KILL, attacker.ctx);
    localDoomedReactor(SELF, spectator.ctx);
    expect(attacker.calls.localDoomed).toEqual([]);
    expect(spectator.calls.localDoomed).toEqual([]);
  });
});

describe("killFeedReactor", () => {
  it("renders an attributed kill with attacker, verb, combo and both slot marks", () => {
    const { ctx, calls } = makeCtx();
    killFeedReactor(KILL, ctx);
    expect(calls.killFeed).toHaveLength(1);
    expect(calls.killFeed[0]).toEqual(["B", "#ff00ff", "RAMMED", "D", "#ff00ff", 2, 2.0, 1, 3]);
  });

  it("renders a self fall using the event's verb and no actor", () => {
    const { ctx, calls } = makeCtx();
    killFeedReactor(SELF, ctx); // SELF.verb === "SUDDEN DEATH"
    expect(calls.killFeed).toHaveLength(1);
    expect(calls.killFeed[0]).toEqual([null, null, "SUDDEN DEATH", "D", "#ff00ff", 0, 1, null, 3]);
  });

  it("falls back to FELL OFF when a self fall has no verb", () => {
    const { ctx, calls } = makeCtx();
    killFeedReactor({ ...SELF, verb: undefined }, ctx);
    expect(calls.killFeed[0]).toEqual([null, null, "FELL OFF", "D", "#ff00ff", 0, 1, null, 3]);
  });

  it("falls back to P-labels when a slot has no name", () => {
    const { ctx, calls } = makeCtx({ netSlots: [null, null, null, null] });
    killFeedReactor(KILL, ctx);
    expect(calls.killFeed[0][0]).toBe("P2"); // attacker slot 1
    expect(calls.killFeed[0][3]).toBe("P4"); // victim slot 3
    expect(calls.killFeed[0][7]).toBeNull(); // unknown slot kind -> no mark
    expect(calls.killFeed[0][8]).toBeNull();
  });

  it("omits slot marks for NPC participants", () => {
    const { ctx, calls } = makeCtx({
      netSlots: [
        { name: "A", kind: "npc" },
        { name: "B", kind: "npc" },
        { name: "C", kind: "npc" },
        { name: "D", kind: "npc" },
      ],
    });
    killFeedReactor(KILL, ctx);
    expect(calls.killFeed[0][7]).toBeNull();
    expect(calls.killFeed[0][8]).toBeNull();
  });

  it("no-ops when the hud has no kill feed", () => {
    const { ctx } = makeCtx({ hud: {} });
    expect(() => killFeedReactor(KILL, ctx)).not.toThrow();
  });
});

describe("announcerReactor", () => {
  it("forwards the fall to the announcer with the observed fields", () => {
    const { ctx, calls } = makeCtx();
    announcerReactor(KILL, ctx);
    expect(calls.announcer).toEqual([{
      victimSlotIndex: 3,
      attackerSlotIndex: 1,
      comboTier: 2,
      wasCritical: false,
      victimWasLeader: false,
    }]);
  });

  it("forwards critical and leader-down context when present on the event", () => {
    const { ctx, calls } = makeCtx();
    announcerReactor({ ...KILL, wasCritical: true, victimWasLeader: true }, ctx);
    expect(calls.announcer[0].wasCritical).toBe(true);
    expect(calls.announcer[0].victimWasLeader).toBe(true);
  });
});

describe("arenaVfxReactor", () => {
  it("forwards every KO (kill or self-fall) to the arena flash hook", () => {
    const { ctx, calls } = makeCtx();
    arenaVfxReactor(KILL, ctx);
    arenaVfxReactor(SELF, ctx);
    expect(calls.arenaFlash).toEqual([KILL, SELF]);
  });
});

describe("challengeReactor", () => {
  it("records ko_void for the local player's kill", () => {
    const { ctx, calls } = makeCtx({ localSlotIndex: 1 });
    challengeReactor(KILL, ctx);
    expect(calls.challenge).toEqual(["ko_void"]);
  });

  it("also records ko_npc and ko_aggressor from the victim classification", () => {
    const { ctx, calls } = makeCtx({ localSlotIndex: 1 });
    challengeReactor({ ...KILL, victimKind: "npc", victimAiName: "aggressor" }, ctx);
    expect(calls.challenge).toEqual(["ko_void", "ko_npc", "ko_aggressor"]);
  });

  it("does not record for another player's kill", () => {
    const { ctx, calls } = makeCtx({ localSlotIndex: 0 });
    challengeReactor(KILL, ctx);
    expect(calls.challenge).toEqual([]);
  });

  it("does not record on a self/environmental fall", () => {
    const { ctx, calls } = makeCtx({ localSlotIndex: 1 });
    // attacker reassigned to local (as Sudden Death does) but isKill still false
    challengeReactor({ ...SELF, attackerSlotIndex: 1 }, ctx);
    expect(calls.challenge).toEqual([]);
  });
});

describe("dispatchKOEvent", () => {
  it("runs the default reactors for a kill", () => {
    const { ctx, calls } = makeCtx({ localSlotIndex: 1 });
    dispatchKOEvent(KILL, ctx);
    expect(calls.challenge).toEqual(["ko_void"]);
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
      matchStatsReactor,
      challengeReactor,
      localKillConfirmReactor,
      localDoomedReactor,
      arenaVfxReactor,
      killFeedReactor,
      announcerReactor,
      diagnosticsReactor,
    ]);
  });

  it("fires arena flash on default dispatch for any fall", () => {
    const { ctx, calls } = makeCtx({ localSlotIndex: 0 });
    dispatchKOEvent(SELF, ctx);
    expect(calls.arenaFlash).toHaveLength(1);
  });

  it("fires local-victim feedback on default dispatch for any local KO", () => {
    const { ctx, calls } = makeCtx({ localSlotIndex: 3 });
    dispatchKOEvent(SELF, ctx);
    expect(calls.localDoomed).toEqual([SELF]);
  });
});

describe("diagnosticsReactor NPC-SELFKO-3", () => {
  beforeEach(() => {
    __resetDiagnosticsForTest();
    __resetSelfKoTallyForTest();
  });

  it("records zone and personality and bumps the selfKo tally", () => {
    installDiagnostics({ flags: { enabled: true } });
    const { ctx } = makeCtx({ getLevelId: () => "classicRecord" });
    diagnosticsReactor({
      ...SELF,
      victimKind: "npc",
      victimAiName: "aggressor",
      cause: "self",
      zone: "center_hole",
      isSuddenDeath: false,
      fallX: 0.2,
      fallZ: -0.1,
    }, ctx);
    const events = window.__ccDiag.events();
    const ko = events.find((e) => e.ch === "ko");
    expect(ko).toMatchObject({
      type: "fall",
      victimKind: "npc",
      victimAiName: "aggressor",
      cause: "self",
      zone: "center_hole",
    });
    const snap = snapshotSelfKoTally();
    expect(snap.npcSelf).toBe(1);
    expect(snap.byZone.center_hole).toBe(1);
    expect(snap.levelId).toBe("classicRecord");
  });
});
