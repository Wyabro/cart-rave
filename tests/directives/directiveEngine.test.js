// directiveEngine.test.js — Living Store directive engine: per-round slot scheduling,
// CONFIG override apply/restore, quiet-finale + Sudden Death rails, remote apply, and
// the scoring hooks (Double Bag multiplier, Spill Bonus awards).

import { describe, it, expect, beforeEach, vi } from "vitest";
import { CONFIG } from "../../src/config.js";
import { gameStore } from "../../src/stores/gameStore.js";
import * as roundClock from "../../src/roundClock.js";
import {
  initDirectiveEngine,
  updateDirectiveEngine,
  applyRemoteDirective,
  clearDirectiveOnHostMigration,
  getActiveDirective,
  getDirectiveKoRewardMultiplier,
  onHostSpill,
  shiftDirectiveTimersBy,
} from "../../src/directives/directiveEngine.js";

const { getRoundClockNowMs } = roundClock;

/** Recorder deps with a toggleable host flag. */
function makeDeps() {
  const calls = { announce: [], sent: [], scores: [], spillAwards: [] };
  const lastHitBy = new Map();
  const deps = {
    isHost: true,
    getIsHost: () => deps.isHost,
    sendP2PEvent: (payload) => calls.sent.push(payload),
    announce: (id, data) => calls.announce.push([id, data]),
    addScore: (slot, pts) => calls.scores.push([slot, pts]),
    getLastHitBy: () => lastHitBy,
    onSpillBonusAward: (info) => calls.spillAwards.push(info),
  };
  return { deps, calls, lastHitBy };
}

/** Starts a fresh running round whose clock reads `elapsedMs` into the round. */
function setRound(elapsedMs, extra = {}) {
  gameStore.setState({
    roundPhase: "running",
    // * Same domain as directiveEngine roundElapsed (getRoundClockNowMs, NET-CLK-3).
    roundStartedAtMs: getRoundClockNowMs() - elapsedMs,
    isSuddenDeath: false,
    ...extra,
  });
}

let deps;
let calls;
let lastHitBy;

beforeEach(() => {
  ({ deps, calls, lastHitBy } = makeDeps());
  initDirectiveEngine(deps);
  CONFIG.directives = {
    enabled: true,
    fireAtMs: [20000, 55000, 90000],
    jitterMs: 0,
    durationMs: 18000,
    quietFinaleMs: 30000,
  };
  CONFIG.round = { ...CONFIG.round, durationMs: 150000 };
  // * Fresh unique round start → engine's new-round detection wipes prior state.
  setRound(0);
  updateDirectiveEngine(performance.now());
});

describe("slot scheduling", () => {
  it("does not fire before the first slot", () => {
    setRound(19000);
    updateDirectiveEngine(performance.now());
    expect(getActiveDirective()).toBeNull();
    expect(calls.sent).toHaveLength(0);
  });

  it("fires at the slot time, announces, and broadcasts", () => {
    setRound(21000); // 1s past slot 0 (20s), well within its window
    const now = performance.now();
    updateDirectiveEngine(now); // new round → build schedule
    updateDirectiveEngine(now); // fire slot 0

    const active = getActiveDirective();
    expect(active).not.toBeNull();
    expect(calls.sent).toHaveLength(1);
    expect(calls.sent[0].type).toBe("directive");
    expect(calls.sent[0].id).toBe(active.id);
    expect(calls.announce.some(([id]) => id.startsWith("directive_"))).toBe(true);
  });

  it("restores CONFIG values after the window expires", () => {
    const baseline = {
      ramStrength: CONFIG.ramming.strength,
      maxSpeed: CONFIG.driving.maxSpeed,
      accel: CONFIG.driving.accel,
      cooldownSec: CONFIG.cart.ramBoost.cooldownSec,
      chargeMs: CONFIG.cart.ramBoost.boostCharge.boostChargeTimeMs,
    };

    setRound(21000);
    const now = performance.now();
    updateDirectiveEngine(now); // (re)build for this round
    updateDirectiveEngine(now); // fire slot 0
    expect(getActiveDirective()).not.toBeNull();

    updateDirectiveEngine(now + 18001); // expire
    expect(getActiveDirective()).toBeNull();
    expect(CONFIG.ramming.strength).toBe(baseline.ramStrength);
    expect(CONFIG.driving.maxSpeed).toBe(baseline.maxSpeed);
    expect(CONFIG.driving.accel).toBe(baseline.accel);
    expect(CONFIG.cart.ramBoost.cooldownSec).toBe(baseline.cooldownSec);
    expect(CONFIG.cart.ramBoost.boostCharge.boostChargeTimeMs).toBe(baseline.chargeMs);
    // * Expiry is silent — no end-of-promo announcement (user-cut).
    expect(calls.announce.filter(([id]) => id === "directive_end")).toHaveLength(0);
  });

  it("skips a slot missed by more than a window instead of firing late", () => {
    setRound(45000); // slot 0 (20s) is 25s stale; slot 1 (55s) not yet due
    const now = performance.now();
    updateDirectiveEngine(now); // new round → build
    updateDirectiveEngine(now); // stale-skip slot 0
    updateDirectiveEngine(now); // slot 1 not due
    expect(getActiveDirective()).toBeNull();
    expect(calls.sent).toHaveLength(0);
  });

  it("never lets a window run into the quiet finale", () => {
    CONFIG.directives.fireAtMs = [110000]; // 110s + 18s window > 120s cutoff
    setRound(111000); // due and not stale — only the finale guard can block it
    const now = performance.now();
    updateDirectiveEngine(now); // new round → build schedule
    updateDirectiveEngine(now); // slot due → finale guard must refuse
    expect(getActiveDirective()).toBeNull();
    expect(calls.sent).toHaveLength(0);
  });

  it("fires all three slots across a full round, one at a time", () => {
    // * One continuous round: freeze roundStartedAtMs and advance the round clock, so
    // * the engine's new-round detection never resets the schedule mid-test (NET-CLK-3).
    const base = 1_000_000;
    let roundNow = base;
    const clockSpy = vi.spyOn(roundClock, "getRoundClockNowMs").mockImplementation(() => roundNow);
    try {
      gameStore.setState({
        roundPhase: "running",
        roundStartedAtMs: base,
        isSuddenDeath: false,
      });
      let perf = performance.now();
      updateDirectiveEngine(perf); // build schedule for this round

      for (const t of [21000, 56000, 91000]) {
        roundNow = base + t;
        perf += 40000; // any prior window has long expired on the perf clock
        updateDirectiveEngine(perf); // expire previous
        updateDirectiveEngine(perf); // fire this slot
        expect(getActiveDirective()).not.toBeNull();
      }
      expect(calls.sent).toHaveLength(3);
    } finally {
      clockSpy.mockRestore();
    }
  });
});

describe("pause compensation (FIX-DIRPAUSE)", () => {
  /**
   * Drives one continuous round on a frozen round clock, the same way the
   * "fires all three slots" test does. Returns the handles a pause test needs.
   */
  function startRoundWithSlot0Fired() {
    const base = 1_000_000;
    const clock = { now: base };
    const clockSpy = vi.spyOn(roundClock, "getRoundClockNowMs").mockImplementation(() => clock.now);
    gameStore.setState({
      roundPhase: "running",
      roundStartedAtMs: base,
      isSuddenDeath: false,
    });
    const perf = 500_000;
    updateDirectiveEngine(perf); // new round → build schedule
    clock.now = base + 21_000; // 1s past slot 0 (20s)
    updateDirectiveEngine(perf); // fire slot 0
    expect(getActiveDirective()).not.toBeNull();
    expect(calls.sent).toHaveLength(1);
    return { base, clock, clockSpy, perf };
  }

  it("a paused-then-resumed round does not re-fire the in-flight directive", () => {
    const { base, clock, clockSpy, perf } = startRoundWithSlot0Fired();
    try {
      const firstId = getActiveDirective().id;
      const untilBefore = getActiveDirective().untilMs;
      const announcesBefore = calls.announce.length;

      // * Esc pause for 5s, then resume: production shifts roundStartedAtMs and the
      // * directive timers by the same delta in one synchronous block.
      const delta = 5_000;
      clock.now = base + 26_000;
      gameStore.setState({ roundStartedAtMs: base + delta });
      shiftDirectiveTimersBy(delta);

      updateDirectiveEngine(perf + delta);

      // (1) same directive still in flight, nothing re-fired, no new callout.
      const active = getActiveDirective();
      expect(active).not.toBeNull();
      expect(active.id).toBe(firstId);
      expect(calls.sent).toHaveLength(1);
      expect(calls.announce).toHaveLength(announcesBefore);
      // (3) the window is continuous — shifted by delta, not restarted.
      expect(active.untilMs).toBe(untilBefore + delta);

      // (2) scheduleIdx survived: once this window expires, the engine is waiting on
      // * slot 1 (55s), so the same round-elapsed 21s must not produce another fire.
      updateDirectiveEngine(perf + delta + 18_001);
      expect(getActiveDirective()).toBeNull();
      updateDirectiveEngine(perf + delta + 18_002);
      expect(getActiveDirective()).toBeNull();
      expect(calls.sent).toHaveLength(1);

      // * And slot 1 still fires normally afterwards.
      clock.now = base + delta + 56_000;
      updateDirectiveEngine(perf + delta + 60_000);
      expect(getActiveDirective()).not.toBeNull();
      expect(calls.sent).toHaveLength(2);
    } finally {
      clockSpy.mockRestore();
    }
  });

  it("still resets the schedule when a real new round starts (no shift call)", () => {
    const { clock, clockSpy, perf } = startRoundWithSlot0Fired();
    try {
      // * A genuine new round: roundStartedAtMs moves with no compensating shift.
      const newBase = 2_000_000;
      clock.now = newBase;
      gameStore.setState({ roundStartedAtMs: newBase });
      updateDirectiveEngine(perf + 1_000);
      // * Leftover window dropped and the slot list rebuilt from index 0.
      expect(getActiveDirective()).toBeNull();

      clock.now = newBase + 21_000;
      updateDirectiveEngine(perf + 2_000);
      expect(getActiveDirective()).not.toBeNull();
      expect(calls.sent).toHaveLength(2);
    } finally {
      clockSpy.mockRestore();
    }
  });
});

describe("safety rails", () => {
  it("restores immediately when Sudden Death starts and never fires during it", () => {
    setRound(21000);
    const now = performance.now();
    updateDirectiveEngine(now);
    updateDirectiveEngine(now);
    expect(getActiveDirective()).not.toBeNull();

    gameStore.setState({ isSuddenDeath: true });
    updateDirectiveEngine(now + 100);
    expect(getActiveDirective()).toBeNull();
    expect(CONFIG.ramming.strength).toBe(3.15);

    updateDirectiveEngine(now + 200);
    expect(getActiveDirective()).toBeNull();
  });

  it("restores when the round leaves the running phase", () => {
    setRound(21000);
    const now = performance.now();
    updateDirectiveEngine(now);
    updateDirectiveEngine(now);
    expect(getActiveDirective()).not.toBeNull();

    gameStore.setState({ roundPhase: "podium" });
    updateDirectiveEngine(now + 100);
    expect(getActiveDirective()).toBeNull();
  });

  it("non-hosts never schedule fires", () => {
    deps.isHost = false;
    setRound(21000);
    const now = performance.now();
    updateDirectiveEngine(now);
    updateDirectiveEngine(now);
    expect(getActiveDirective()).toBeNull();
    expect(calls.sent).toHaveLength(0);
  });
});

describe("remote apply + scoring hooks", () => {
  it("applies a host-broadcast directive on a non-host and self-expires", () => {
    deps.isHost = false;
    setRound(30000);
    updateDirectiveEngine(performance.now());

    applyRemoteDirective({ id: "double_bag", durationMs: 5000 });
    expect(getActiveDirective()?.id).toBe("double_bag");
    expect(getDirectiveKoRewardMultiplier()).toBe(2);

    updateDirectiveEngine(performance.now() + 5001);
    expect(getActiveDirective()).toBeNull();
    expect(getDirectiveKoRewardMultiplier()).toBe(1);
  });

  it("ignores unknown remote directive ids", () => {
    deps.isHost = false;
    applyRemoteDirective({ id: "definitely_not_real", durationMs: 5000 });
    expect(getActiveDirective()).toBeNull();
  });

  it("clearDirectiveOnHostMigration restores CONFIG and drops the active window", () => {
    deps.isHost = false;
    setRound(30000);
    updateDirectiveEngine(performance.now());
    const baselineStrength = CONFIG.ramming.strength;
    applyRemoteDirective({ id: "flash_sale", durationMs: 10000 });
    expect(getActiveDirective()?.id).toBe("flash_sale");
    expect(CONFIG.ramming.strength).toBeCloseTo(baselineStrength * 1.5, 5);

    clearDirectiveOnHostMigration();
    expect(getActiveDirective()).toBeNull();
    expect(CONFIG.ramming.strength).toBeCloseTo(baselineStrength, 5);
    // * Idempotent.
    clearDirectiveOnHostMigration();
    expect(getActiveDirective()).toBeNull();
  });

  it("clearDirectiveOnHostMigration skips due/past slots so promote cannot re-fire them", () => {
    // * Non-host never advances scheduleIdx; on promote it becomes host mid-round.
    // * Without skip, slot 0 (due at ~20s) would re-fire while still inside durationMs.
    deps.isHost = false;
    setRound(25_000);
    updateDirectiveEngine(performance.now()); // builds schedule at round start latch
    clearDirectiveOnHostMigration();

    deps.isHost = true;
    const sentBefore = calls.sent.length;
    updateDirectiveEngine(performance.now());
    // * No new directive fire — 25s is past first slot but we skipped it on migrate.
    const directiveSends = calls.sent.slice(sentBefore).filter((m) => m?.type === "directive" || m?.id);
    expect(getActiveDirective()).toBeNull();
    expect(directiveSends.length).toBe(0);
  });

  it("Spill Bonus pays the recent rammer, never a self-spill", () => {
    deps.isHost = false;
    setRound(30000);
    updateDirectiveEngine(performance.now());
    applyRemoteDirective({ id: "spill_bonus", durationMs: 10000 });
    deps.isHost = true;

    lastHitBy.set(2, { attackerSlotIndex: 0, timestamp: getRoundClockNowMs() - 500 });
    onHostSpill(2);
    expect(calls.scores).toEqual([[0, 1]]);
    expect(calls.spillAwards).toEqual([
      { attackerSlotIndex: 0, victimSlotIndex: 2, points: 1 },
    ]);
    // * Presentation wire for non-hosts (host still uses onSpillBonusAward locally).
    expect(calls.sent).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "spill_bonus",
          attackerSlotIndex: 0,
          victimSlotIndex: 2,
          points: 1,
        }),
      ]),
    );

    // Stale hit outside the window: no award.
    lastHitBy.set(3, { attackerSlotIndex: 1, timestamp: getRoundClockNowMs() - 10000 });
    onHostSpill(3);
    expect(calls.scores).toHaveLength(1);
    expect(calls.spillAwards).toHaveLength(1);

    // Self-attribution: no award.
    lastHitBy.set(1, { attackerSlotIndex: 1, timestamp: getRoundClockNowMs() - 100 });
    onHostSpill(1);
    expect(calls.scores).toHaveLength(1);
    expect(calls.spillAwards).toHaveLength(1);
  });

  it("awards nothing while no directive is active", () => {
    lastHitBy.set(2, { attackerSlotIndex: 0, timestamp: getRoundClockNowMs() });
    onHostSpill(2);
    expect(calls.scores).toHaveLength(0);
    expect(calls.spillAwards).toHaveLength(0);
  });
});
