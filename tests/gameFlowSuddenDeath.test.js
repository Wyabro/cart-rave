// @vitest-environment happy-dom
//
// Regression tests for the Sudden Death fall loop in updateGameFlow.
// * Bug (Stability Pass 1): the fall-detection loop had no isSuddenDeathSpectator
// * guard. Spectators parked at y=-50 (below fall.yThreshold=-10, respawnAtMs null)
// * re-triggered the fall/KO path every frame — kill-feed/announcer spam and, with
// * the right timing, a premature or misattributed Sudden Death win.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../src/entities.js", () => ({
  resetCartTransientState: () => {},
}));
vi.mock("../src/levelManager.js", () => ({
  getCurrentLevelId: () => "classicRecord",
}));
vi.mock("../src/scoring/koEvent.js", () => ({
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
vi.mock("../src/scoring/koReactors.js", () => ({
  dispatchKOEvent: vi.fn(),
}));

import { updateGameFlow } from "../src/gameFlow.js";
import { dispatchKOEvent } from "../src/scoring/koReactors.js";

function makeBody(pos) {
  return {
    _pos: { ...pos },
    translation() { return this._pos; },
    rotation: () => ({ x: 0, y: 0, z: 0, w: 1 }),
    linvel: () => ({ x: 0, y: 0, z: 0 }),
    setTranslation() {},
    setRotation() {},
    setLinvel() {},
    setAngvel() {},
    setEnabled() {},
    wakeUp() {},
  };
}

function makeCart(slotIndex, y, { spectator = false } = {}) {
  return {
    slotIndex,
    body: makeBody({ x: 0, y, z: 0 }),
    mesh: { visible: true },
    collider: { setEnabled() {} },
    spawn: { x: 0, y: 2, z: 8 },
    spawnYaw: 0,
    respawnAtMs: null,
    isSuddenDeathSpectator: spectator,
    comboTier: 0,
    comboExpiryMs: 0,
    hasSpilled: false,
    cargoBay: null,
  };
}

/**
 * Sudden Death world: slots 0+1 tied on top score (standing), slots 2+3 parked
 * as spectators at y=-50 — exactly what Sudden Death entry produces.
 */
function makeSuddenDeathWorld() {
  const carts = [
    makeCart(0, 0),
    makeCart(1, 0),
    makeCart(2, -50, { spectator: true }),
    makeCart(3, -50, { spectator: true }),
  ];
  const scores = { 0: 5, 1: 5, 2: 1, 3: 0 };
  const roundState = {
    phase: "running",
    startedAtMs: Date.now(),
    countdownStartedAtMs: 0,
    winnerSlotIndex: null,
    endReason: null,
    scores,
    isSuddenDeath: true,
  };
  const deps = {
    getAllCarts: () => carts,
    getNetSlots: () => [
      { kind: "human", connId: "you" },
      { kind: "npc" },
      { kind: "npc" },
      { kind: "npc" },
    ],
    isHost: () => true,
    getRoundState: () => roundState,
    getRoundScores: () => scores,
    getLastHitBy: () => new Map(),
    CONFIG: {
      fall: { yThreshold: -10 },
      round: { durationMs: 150000 },
      booth: { platformY: 6 },
    },
    getLocalSlotIndex: () => 0,
    getLocalCart: () => carts[0],
    scheduleRespawn: vi.fn(),
    scheduleStuckRespawn: vi.fn(),
    doRespawn: vi.fn(),
    maybeTriggerNpcOpportunisticRamBoost: vi.fn(),
    endRound: vi.fn(),
    scheduleLastCartStandingFinish: vi.fn(),
    abortLastCartStandingFlourish: vi.fn(),
    colorHexForSlot: () => 0xffffff,
    hud: null,
    sendHostRound: vi.fn(),
    getPartySocket: () => null,
    addScore: vi.fn(() => true),
    isScoreTied: () => true,
    setSuddenDeath: vi.fn(),
    detectGameMode: () => "solo",
    getScene: () => ({}),
    triggerCartShatter: vi.fn(),
    getYouConnId: () => "you",
    queueHostFallEvent: vi.fn(),
    onSpill: vi.fn(),
  };
  return { carts, deps };
}

function runFrame(deps) {
  updateGameFlow(deps, { now: performance.now(), dt: 16, loopState: {} });
}

beforeEach(() => {
  vi.mocked(dispatchKOEvent).mockClear();
});

describe("Sudden Death fall loop", () => {
  it("never re-processes spectator carts parked at y=-50", () => {
    const { deps } = makeSuddenDeathWorld();

    // Several frames — before the guard, EVERY frame fired fall events per spectator.
    runFrame(deps);
    runFrame(deps);
    runFrame(deps);

    expect(deps.addScore).not.toHaveBeenCalled();
    expect(deps.queueHostFallEvent).not.toHaveBeenCalled();
    expect(dispatchKOEvent).not.toHaveBeenCalled();
    expect(deps.triggerCartShatter).not.toHaveBeenCalled();
    expect(deps.onSpill).not.toHaveBeenCalled();
  });

  it("still ends Sudden Death when a genuinely tied cart falls", () => {
    const { carts, deps } = makeSuddenDeathWorld();
    carts[1].body._pos.y = -20; // tied cart 1 falls for real

    runFrame(deps);

    // Sole surviving tied cart (slot 0) is awarded the win — exactly once.
    expect(deps.addScore).toHaveBeenCalledTimes(1);
    expect(deps.addScore).toHaveBeenCalledWith(0, 1);
    expect(deps.queueHostFallEvent).toHaveBeenCalledTimes(1);
    expect(dispatchKOEvent).toHaveBeenCalledTimes(1);
    expect(carts[1].isSuddenDeathSpectator).toBe(true);
  });

  it("does not double-fire after the fallen tied cart becomes a spectator", () => {
    const { carts, deps } = makeSuddenDeathWorld();
    carts[1].body._pos.y = -20;

    runFrame(deps);
    runFrame(deps); // cart 1 is now a spectator — must be inert

    expect(deps.addScore).toHaveBeenCalledTimes(1);
    expect(deps.queueHostFallEvent).toHaveBeenCalledTimes(1);
    expect(dispatchKOEvent).toHaveBeenCalledTimes(1);
  });
});
