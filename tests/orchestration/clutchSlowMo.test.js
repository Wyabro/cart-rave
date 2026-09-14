// CLUTCH-SLOMO-1 — deferred Sudden Death win: the SD-win callback arms a
// gameFlow latch instead of ending the round synchronously, so the deciding KO
// plays ~1.2s in host slow-mo under the gameplay camera before endRound fires.
// Round-clock domain throughout: host promotion or a frozen tab cannot strand
// the window, and the startedAtMs stamp drops stale latches without reset sites.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/entities.js", () => ({
  resetCartTransientState: () => {},
}));
vi.mock("../../src/levels/levelManager.js", () => ({
  getCurrentLevelId: () => "classicRecord",
}));
vi.mock("../../src/scoring/koEvent.js", () => ({
  buildKOConfirmPreview: vi.fn(() => null),
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

import {
  updateGameFlow,
  deferSuddenDeathWin,
  isClutchSlowMoArmed,
  consumeClutchSlowMoDue,
  resetClutchSlowMoForTest,
  resetSuddenDeathStalemateForTest,
} from "../../src/gameFlow.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const repoRoot = resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");
const roundLifecycleSrc = readFileSync(
  resolve(repoRoot, "src/orchestration/roundLifecycle.js"),
  "utf8",
);
const gameBootSrc = readFileSync(
  resolve(repoRoot, "src/orchestration/gameBoot.js"),
  "utf8",
);

function makeBody(y) {
  return {
    _pos: { x: 0, y, z: 0 },
    translation() { return this._pos; },
    rotation: () => ({ x: 0, y: 0, z: 0, w: 1 }),
    linvel: () => ({ x: 0, y: 0, z: 0 }),
    setTranslation(p) { this._pos = { ...p }; },
    setRotation() {},
    setLinvel() {},
    setAngvel() {},
    setEnabled() {},
    wakeUp() {},
  };
}

function makeCart(slotIndex, y) {
  return {
    slotIndex,
    body: makeBody(y),
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
  };
}

/** Standing SD world: no falls, no wipeout, timer path skipped (SD active). */
function makeWorld() {
  const carts = [makeCart(0, 0), makeCart(1, 0), makeCart(2, 0), makeCart(3, 0)];
  const scores = { 0: 5, 1: 5, 2: 1, 3: 0 };
  const roundState = {
    phase: "running",
    startedAtMs: 1000,
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
    maybeTriggerNpcOpportunisticHop: vi.fn(),
    endRound: vi.fn(),
    setSlowMoActive: vi.fn(),
    setSlowMoStartMs: vi.fn(),
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
    onLocalDoomed: vi.fn(),
    onSpill: vi.fn(),
    onCartOutOfPlay: vi.fn(),
  };
  return { carts, deps, roundState };
}

function runFrame(deps, { roundNowMs, now = 9000 } = {}) {
  updateGameFlow(deps, { now, dt: 0.016, loopState: {}, roundNowMs });
}

beforeEach(() => {
  resetClutchSlowMoForTest();
  resetSuddenDeathStalemateForTest();
});

describe("deferSuddenDeathWin latch", () => {
  it("defers a finite scorer and reports armed", () => {
    expect(deferSuddenDeathWin(1, 5000, 1000)).toBe(true);
    expect(isClutchSlowMoArmed(1000)).toBe(true);
  });

  it("ends now on a null scorer (stalemate path has no moment to stretch)", () => {
    expect(deferSuddenDeathWin(null, 5000, 1000)).toBe(false);
    expect(deferSuddenDeathWin(Number.NaN, 5000, 1000)).toBe(false);
    expect(isClutchSlowMoArmed(1000)).toBe(false);
  });

  it("a second score inside the window neither extends nor doubles the latch", () => {
    expect(deferSuddenDeathWin(1, 5000, 1000)).toBe(true);
    // * Already armed: still deferred (caller must not endRound), due unchanged.
    expect(deferSuddenDeathWin(0, 6000, 1000)).toBe(true);
    expect(consumeClutchSlowMoDue(6100, 1000)).toBe(null);
    expect(consumeClutchSlowMoDue(6200, 1000)).toBe(1);
  });

  it("a stale round never fires (restart drops the latch without reset sites)", () => {
    deferSuddenDeathWin(1, 5000, 1000);
    expect(consumeClutchSlowMoDue(99999, 2000)).toBe(null);
    expect(isClutchSlowMoArmed(2000)).toBe(false);
  });
});

describe("updateGameFlow clutch window", () => {
  it("starts host slow-mo on first sighting and ends the round once at due", () => {
    const { deps } = makeWorld();
    expect(deferSuddenDeathWin(1, 5000, 1000)).toBe(true);

    runFrame(deps, { roundNowMs: 5000, now: 9000 });
    expect(deps.setSlowMoActive).toHaveBeenCalledTimes(1);
    expect(deps.setSlowMoActive).toHaveBeenCalledWith(true);
    expect(deps.setSlowMoStartMs).toHaveBeenCalledWith(9000);
    expect(deps.endRound).not.toHaveBeenCalled();

    runFrame(deps, { roundNowMs: 6199, now: 10199 });
    expect(deps.endRound).not.toHaveBeenCalled();

    runFrame(deps, { roundNowMs: 6200, now: 10200 });
    expect(deps.endRound).toHaveBeenCalledTimes(1);
    expect(deps.endRound).toHaveBeenCalledWith(1);

    // * Latch consumed: later frames never re-fire.
    runFrame(deps, { roundNowMs: 9000, now: 13000 });
    expect(deps.endRound).toHaveBeenCalledTimes(1);
  });

  it("ignores a stale latch after the round restarts", () => {
    const { deps, roundState } = makeWorld();
    deferSuddenDeathWin(1, 5000, 1000);
    roundState.startedAtMs = 2000;

    runFrame(deps, { roundNowMs: 99999, now: 100000 });
    expect(deps.setSlowMoActive).not.toHaveBeenCalled();
    expect(deps.endRound).not.toHaveBeenCalled();
  });

  it("does nothing outside Sudden Death", () => {
    const { deps, roundState } = makeWorld();
    deferSuddenDeathWin(1, 5000, 1000);
    roundState.isSuddenDeath = false;

    runFrame(deps, { roundNowMs: 99999, now: 100000 });
    expect(deps.setSlowMoActive).not.toHaveBeenCalled();
    expect(deps.endRound).not.toHaveBeenCalled();
  });
});

describe("SD-win callback wiring (source pins — roundLifecycle is too heavy to import)", () => {
  it("roundLifecycle routes its callback through the latch", () => {
    expect(roundLifecycleSrc).toMatch(/deferSuddenDeathWin\(scoringSlot, getRoundClockNowMs\(\)/);
    expect(roundLifecycleSrc).toMatch(
      /if \(!deferSuddenDeathWin\(scoringSlot,[\s\S]*?\)\) \{\s*endRound\(scoringSlot\);\s*\}/,
    );
  });

  it("gameBoot routes its (winning) callback through the same latch", () => {
    expect(gameBootSrc).toMatch(/deferSuddenDeathWin\(scoringSlot, getRoundClockNowMs\(\)/);
  });
});
