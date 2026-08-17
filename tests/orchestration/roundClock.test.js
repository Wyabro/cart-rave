// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";
import {
  getRoundClockNowMs,
  getRoundElapsedMs,
  getRoundRemainingMs,
  isRoundTimerExpired,
} from "../../src/roundClock.js";
import { updateGameFlow } from "../../src/gameFlow.js";

vi.mock("../../src/entities.js", () => ({
  resetCartTransientState: () => {},
}));
vi.mock("../../src/levels/levelManager.js", () => ({
  getCurrentLevelId: () => "classicRecord",
}));
vi.mock("../../src/scoring/koEvent.js", () => ({
  buildKOEvent: vi.fn(() => ({
    isKill: false,
    attackerSlotIndex: null,
    verb: "FELL",
    cause: "edge",
    comboTier: 0,
    comboMultiplier: 1.0,
    wasCritical: false,
    victimWasLeader: false,
    reward: { total: 1 },
    isFinalBlow: false,
  })),
}));
vi.mock("../../src/scoring/koReactors.js", () => ({
  dispatchKOEvent: vi.fn(),
}));

describe("roundClock", () => {
  it("getRoundClockNowMs is finite and near Date.now (same epoch domain)", () => {
    const wall = Date.now();
    const round = getRoundClockNowMs();
    expect(Number.isFinite(round)).toBe(true);
    // * Within a few seconds of wall clock under normal conditions.
    expect(Math.abs(round - wall)).toBeLessThan(5_000);
  });

  it("elapsed / remaining / expired helpers are consistent", () => {
    const started = 1_000_000;
    const duration = 150_000;
    expect(getRoundElapsedMs(started, started + 10_000)).toBe(10_000);
    expect(getRoundRemainingMs(started, duration, started + 10_000)).toBe(140_000);
    expect(isRoundTimerExpired(started, duration, started + duration - 1)).toBe(false);
    expect(isRoundTimerExpired(started, duration, started + duration)).toBe(true);
    expect(isRoundTimerExpired(0, duration, started + duration)).toBe(false);
    expect(getRoundElapsedMs(0, started)).toBeNull();
    expect(getRoundRemainingMs(0, duration, started)).toBeNull();
  });
});

describe("updateGameFlow round timer (injected roundNowMs)", () => {
  function makeRunningHostDeps({ startedAtMs, durationMs = 150_000, tied = false }) {
    const scores = tied ? { 0: 3, 1: 3, 2: 0, 3: 0 } : { 0: 5, 1: 2, 2: 0, 3: 0 };
    const carts = [0, 1, 2, 3].map((slotIndex) => ({
      slotIndex,
      body: {
        translation: () => ({ x: 0, y: 0, z: 0 }),
        rotation: () => ({ x: 0, y: 0, z: 0, w: 1 }),
        linvel: () => ({ x: 0, y: 0, z: 0 }),
        setTranslation() {},
        setRotation() {},
        setLinvel() {},
        setAngvel() {},
        setEnabled() {},
        wakeUp() {},
      },
      mesh: { visible: true },
      collider: { setEnabled() {} },
      spawn: { x: 0, y: 2, z: 8 },
      spawnYaw: 0,
      respawnAtMs: null,
      isSuddenDeathSpectator: false,
      comboTier: 0,
      comboExpiryMs: 0,
      hasSpilled: false,
      cargoBay: null,
    }));
    const endRound = vi.fn();
    const setSuddenDeath = vi.fn();
    const roundState = {
      phase: "running",
      startedAtMs,
      countdownStartedAtMs: 0,
      winnerSlotIndex: null,
      endReason: null,
      scores,
      isSuddenDeath: false,
    };
    const deps = {
      getAllCarts: () => carts,
      getNetSlots: () => [
        { kind: "human", connId: "a" },
        { kind: "human", connId: "b" },
        { kind: "npc" },
        { kind: "npc" },
      ],
      isHost: () => true,
      getRoundState: () => roundState,
      getRoundScores: () => scores,
      getLastHitBy: () => new Map(),
      CONFIG: {
        fall: { yThreshold: -10 },
        round: { durationMs },
        booth: { platformY: 6 },
      },
      getLocalSlotIndex: () => 0,
      getLocalCart: () => carts[0],
      scheduleRespawn: vi.fn(),
      scheduleStuckRespawn: vi.fn(),
      doRespawn: vi.fn(),
      maybeTriggerNpcOpportunisticRamBoost: vi.fn(),
      maybeTriggerNpcOpportunisticHop: vi.fn(),
      endRound,
      colorHexForSlot: () => 0xffffff,
      hud: null,
      sendHostRound: vi.fn(),
      getPartySocket: () => null,
      addScore: vi.fn(() => true),
      isScoreTied: () => tied,
      setSuddenDeath,
      detectGameMode: () => "solo",
      getScene: () => ({}),
      triggerCartShatter: vi.fn(),
      getYouConnId: () => "a",
      queueHostFallEvent: vi.fn(),
      onSpill: vi.fn(),
      onCartOutOfPlay: vi.fn(),
    };
    return { deps, endRound, setSuddenDeath, roundState };
  }

  it("does not end the round before duration on the round clock", () => {
    const startedAtMs = 1_000_000;
    const durationMs = 150_000;
    const { deps, endRound } = makeRunningHostDeps({ startedAtMs, durationMs });
    updateGameFlow(deps, {
      now: 0,
      dt: 0.016,
      loopState: {},
      roundNowMs: startedAtMs + durationMs - 1,
    });
    expect(endRound).not.toHaveBeenCalled();
  });

  it("ends the round when roundNowMs reaches startedAtMs + durationMs", () => {
    const startedAtMs = 1_000_000;
    const durationMs = 150_000;
    const { deps, endRound } = makeRunningHostDeps({ startedAtMs, durationMs, tied: false });
    updateGameFlow(deps, {
      now: 0,
      dt: 0.016,
      loopState: {},
      roundNowMs: startedAtMs + durationMs,
    });
    expect(endRound).toHaveBeenCalledTimes(1);
  });

  it("enters Sudden Death on timer expiry when humans are tied", () => {
    const startedAtMs = 1_000_000;
    const durationMs = 150_000;
    const { deps, endRound, setSuddenDeath } = makeRunningHostDeps({
      startedAtMs,
      durationMs,
      tied: true,
    });
    updateGameFlow(deps, {
      now: 50,
      dt: 0.016,
      loopState: {},
      roundNowMs: startedAtMs + durationMs + 100,
    });
    expect(endRound).not.toHaveBeenCalled();
    expect(setSuddenDeath).toHaveBeenCalledWith(true);
  });
});
