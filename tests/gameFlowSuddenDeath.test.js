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

import {
  updateGameFlow,
  reconstructSuddenDeathSpectators,
  ensureSuddenDeathOnHostPromote,
  scoresAreTiedAtTop,
  hasHumanTiedAtTop,
  anyCartLooksSuddenDeathOutOfPlay,
  pickSuddenDeathFallbackWinner,
  resetSuddenDeathStalemateForTest,
} from "../src/gameFlow.js";
import { dispatchKOEvent } from "../src/scoring/koReactors.js";

function makeBody(pos) {
  return {
    _pos: { ...pos },
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
    maybeTriggerNpcOpportunisticHop: vi.fn(),
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
    onCartOutOfPlay: vi.fn(),
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

  it("re-seats the tied carts instead of wedging when the last two fall on the same frame with no attacker", () => {
    // * Deadlock regression: both remaining tied carts cross the fall line in ONE frame
    // * with no kill credited (buildKOEvent mock → isKill:false). Each parks as a
    // * spectator and counts 0 survivors, so no addScore runs. Without the recovery the
    // * round would hang forever in Sudden Death (no timeout). The fix re-lays-out the
    // * tied carts so the tiebreak replays rather than crowning anyone.
    const { carts, deps } = makeSuddenDeathWorld();
    carts[0].body._pos.y = -20;
    carts[1].body._pos.y = -20; // both tied carts fall simultaneously

    runFrame(deps);

    // No arbitrary winner, round not ended, still in Sudden Death.
    expect(deps.addScore).not.toHaveBeenCalled();
    expect(deps.endRound).not.toHaveBeenCalled();
    // Tied carts are re-seated at spawn+1 (not stranded as spectators).
    expect(carts[0].isSuddenDeathSpectator).toBe(false);
    expect(carts[1].isSuddenDeathSpectator).toBe(false);
    expect(carts[0].body._pos.y).toBeCloseTo(3, 5); // spawn.y 2 + 1
    expect(carts[1].body._pos.y).toBeCloseTo(3, 5);
    expect(deps.sendHostRound).toHaveBeenCalled();

    // Self-limiting: with the carts back on the arena, later frames don't re-trigger.
    deps.sendHostRound.mockClear();
    runFrame(deps);
    runFrame(deps);
    expect(deps.addScore).not.toHaveBeenCalled();
    expect(deps.sendHostRound).not.toHaveBeenCalled();
  });

  it("calls onCartOutOfPlay when a tied cart falls in Sudden Death (no scheduleRespawn)", () => {
    const { carts, deps } = makeSuddenDeathWorld();
    carts[1].body._pos.y = -20;

    runFrame(deps);

    // * SD skips scheduleRespawn — leave-play hook is how charge SFX is stopped.
    expect(deps.scheduleRespawn).not.toHaveBeenCalled();
    expect(deps.onCartOutOfPlay).toHaveBeenCalledWith(carts[1]);
  });

  it("NET-SD-1: sole score leader self-fall crowns the best standing trailer", () => {
    // * After a multi-way suppress kill, A can lead on score while SD stays true.
    // * A self-falling used to find survivingTied===0 and award nobody.
    const { carts, deps } = makeSuddenDeathWorld();
    deps.getRoundScores = () => ({ 0: 8, 1: 5, 2: 1, 3: 0 });
    carts[0].body._pos.y = -20; // sole leader falls
    // * slot 1 still standing at lower score

    runFrame(deps);

    expect(deps.addScore).toHaveBeenCalledTimes(1);
    expect(deps.addScore).toHaveBeenCalledWith(1, 1);
    expect(carts[0].isSuddenDeathSpectator).toBe(true);
  });

  it("NET-SD-1: sole leader alone on arena self-fall crowns second place (no re-seat loop)", () => {
    const { carts, deps } = makeSuddenDeathWorld();
    deps.getRoundScores = () => ({ 0: 8, 1: 5, 2: 1, 3: 0 });
    carts[0].body._pos.y = -20;
    carts[1].isSuddenDeathSpectator = true;
    carts[1].body._pos.y = -50;

    runFrame(deps);

    expect(deps.addScore).toHaveBeenCalledTimes(1);
    expect(deps.addScore).toHaveBeenCalledWith(1, 1);
    // * Must not re-seat the sole leader (that was the softlock loop).
    expect(carts[0].isSuddenDeathSpectator).toBe(true);
    expect(carts[0].body._pos.y).toBe(-50);
  });
});

describe("pickSuddenDeathFallbackWinner (NET-SD-1)", () => {
  it("prefers the highest-scoring standing cart", () => {
    const carts = [
      makeCart(0, -50, { spectator: true }),
      makeCart(1, 0),
      makeCart(2, 0),
      makeCart(3, -50, { spectator: true }),
    ];
    const scores = { 0: 10, 1: 4, 2: 7, 3: 1 };
    expect(pickSuddenDeathFallbackWinner(carts, scores, 0, -10)).toBe(2);
  });

  it("falls back to second place by score when nobody is standing", () => {
    const carts = [
      makeCart(0, -50, { spectator: true }),
      makeCart(1, -50, { spectator: true }),
      makeCart(2, -50, { spectator: true }),
      makeCart(3, -50, { spectator: true }),
    ];
    const scores = { 0: 10, 1: 6, 2: 3, 3: 1 };
    expect(pickSuddenDeathFallbackWinner(carts, scores, 0, -10)).toBe(1);
  });
});

describe("reconstructSuddenDeathSpectators (host promote)", () => {
  const fallY = -10;

  function bodyAt(y, { enabled = true } = {}) {
    return {
      _pos: { x: 0, y, z: 0 },
      _enabled: enabled,
      translation() { return this._pos; },
      isEnabled() { return this._enabled; },
    };
  }

  it("flags non-tied carts from scores (SD entry spectators)", () => {
    const carts = [
      { isSuddenDeathSpectator: false, body: bodyAt(0) },
      { isSuddenDeathSpectator: false, body: bodyAt(0) },
      { isSuddenDeathSpectator: false, body: bodyAt(-50, { enabled: false }) },
      { isSuddenDeathSpectator: false, body: bodyAt(-50, { enabled: false }) },
    ];
    // * 0+1 tied at top; 2+3 already out of the race.
    const scores = { 0: 5, 1: 5, 2: 1, 3: 0 };

    reconstructSuddenDeathSpectators(carts, scores, fallY);

    expect(carts[0].isSuddenDeathSpectator).toBe(false);
    expect(carts[1].isSuddenDeathSpectator).toBe(false);
    expect(carts[2].isSuddenDeathSpectator).toBe(true);
    expect(carts[3].isSuddenDeathSpectator).toBe(true);
  });

  it("flags multi-way eliminated tied carts by y / disabled body (score-only would miss them)", () => {
    // * Three-way SD: all share top score. Slot 2 already fell (parked at y=-50).
    // * Pre-fix score-only reconstruction left slot 2 with spectator=false.
    const carts = [
      { isSuddenDeathSpectator: false, body: bodyAt(0) },
      { isSuddenDeathSpectator: false, body: bodyAt(0) },
      { isSuddenDeathSpectator: false, body: bodyAt(-50, { enabled: false }) },
      { isSuddenDeathSpectator: false, body: bodyAt(-50, { enabled: false }) },
    ];
    const scores = { 0: 4, 1: 4, 2: 4, 3: 1 };

    reconstructSuddenDeathSpectators(carts, scores, fallY);

    expect(carts[0].isSuddenDeathSpectator).toBe(false);
    expect(carts[1].isSuddenDeathSpectator).toBe(false);
    expect(carts[2].isSuddenDeathSpectator).toBe(true); // tied but out of play
    expect(carts[3].isSuddenDeathSpectator).toBe(true); // not tied
  });

  it("clears a stale spectator flag on a still-standing tied cart", () => {
    const carts = [
      { isSuddenDeathSpectator: true, body: bodyAt(0.5) },
      { isSuddenDeathSpectator: false, body: bodyAt(0) },
    ];
    const scores = { 0: 3, 1: 3, 2: 0, 3: 0 };

    reconstructSuddenDeathSpectators(carts, scores, fallY);

    expect(carts[0].isSuddenDeathSpectator).toBe(false);
    expect(carts[1].isSuddenDeathSpectator).toBe(false);
  });
});

describe("ensureSuddenDeathOnHostPromote (route 2: infer from clock + human tie)", () => {
  const fallY = -10;
  const durationMs = 60_000;
  const startedAtMs = 1_000_000;
  const afterTimer = startedAtMs + durationMs + 500;

  function bodyAt(y, { enabled = true } = {}) {
    return {
      _pos: { x: 0, y, z: 0 },
      _enabled: enabled,
      translation() { return this._pos; },
      isEnabled() { return this._enabled; },
      setTranslation(p) { this._pos = { ...p }; },
      setRotation() {},
      setLinvel() {},
      setAngvel() {},
      setEnabled(v) { this._enabled = v; },
      wakeUp() {},
    };
  }

  function makeCart(y, opts = {}) {
    return {
      isSuddenDeathSpectator: false,
      body: bodyAt(y, opts),
      spawn: { x: 2, y: 3, z: 8 },
      spawnYaw: 0,
      mesh: { visible: true },
      collider: { setEnabled() {} },
      respawnAtMs: null,
    };
  }

  const humanTieSlots = [
    { kind: "human", connId: "a" },
    { kind: "human", connId: "b" },
    { kind: "npc" },
    { kind: "npc" },
  ];

  it("scoresAreTiedAtTop / hasHumanTiedAtTop helpers match SD gates", () => {
    expect(scoresAreTiedAtTop({ 0: 5, 1: 5, 2: 1, 3: 0 })).toBe(true);
    expect(scoresAreTiedAtTop({ 0: 5, 1: 4, 2: 1, 3: 0 })).toBe(false);
    expect(scoresAreTiedAtTop({ 0: 0, 1: 0, 2: 0, 3: 0 })).toBe(false);
    expect(hasHumanTiedAtTop({ 0: 5, 1: 5 }, humanTieSlots)).toBe(true);
    expect(
      hasHumanTiedAtTop(
        { 0: 5, 1: 5 },
        [{ kind: "npc" }, { kind: "npc" }, { kind: "npc" }, { kind: "npc" }],
      ),
    ).toBe(false);
  });

  it("already in SD → reconstruct only (no setSuddenDeath churn)", () => {
    const setSuddenDeath = vi.fn();
    const sendHostRound = vi.fn();
    const carts = [
      makeCart(0),
      makeCart(0),
      makeCart(-50, { enabled: false }),
      makeCart(-50, { enabled: false }),
    ];
    const scores = { 0: 5, 1: 5, 2: 1, 3: 0 };

    const result = ensureSuddenDeathOnHostPromote({
      phase: "running",
      isSuddenDeath: true,
      startedAtMs,
      nowMs: afterTimer,
      durationMs,
      scores,
      netSlots: humanTieSlots,
      allCarts: carts,
      fallYThreshold: fallY,
      setSuddenDeath,
      sendHostRound,
    });

    expect(result).toBe("reconstruct");
    expect(setSuddenDeath).not.toHaveBeenCalled();
    expect(sendHostRound).not.toHaveBeenCalled();
    expect(carts[2].isSuddenDeathSpectator).toBe(true);
  });

  it("past timer + human tie + mid-SD geometry → infer_mid (flag + reconstruct, no yank)", () => {
    const setSuddenDeath = vi.fn();
    const sendHostRound = vi.fn();
    // * Multi-way SD mid-fight: one eliminated tied cart already at y=-50; flag was never synced.
    const carts = [
      makeCart(0.2),
      makeCart(0.1),
      makeCart(-50, { enabled: false }),
      makeCart(-50, { enabled: false }),
    ];
    const scores = { 0: 4, 1: 4, 2: 4, 3: 0 };
    const spawnYBefore = carts[0].body.translation().y;

    const result = ensureSuddenDeathOnHostPromote({
      phase: "running",
      isSuddenDeath: false, // missed host_round
      startedAtMs,
      nowMs: afterTimer,
      durationMs,
      scores,
      netSlots: humanTieSlots,
      allCarts: carts,
      fallYThreshold: fallY,
      setSuddenDeath,
      sendHostRound,
    });

    expect(result).toBe("infer_mid");
    expect(setSuddenDeath).toHaveBeenCalledWith(true);
    expect(sendHostRound).toHaveBeenCalledTimes(1);
    expect(anyCartLooksSuddenDeathOutOfPlay(carts, fallY)).toBe(true);
    // * Survivors must not be teleported back to spawn.
    expect(carts[0].body.translation().y).toBe(spawnYBefore);
    expect(carts[2].isSuddenDeathSpectator).toBe(true);
    expect(carts[0].isSuddenDeathSpectator).toBe(false);
  });

  it("past timer + human tie + everyone still on arena → infer_enter (full layout)", () => {
    const setSuddenDeath = vi.fn();
    const sendHostRound = vi.fn();
    const onCartOutOfPlay = vi.fn();
    const carts = [makeCart(0), makeCart(0), makeCart(0), makeCart(0)];
    const scores = { 0: 3, 1: 3, 2: 1, 3: 0 };

    const result = ensureSuddenDeathOnHostPromote({
      phase: "running",
      isSuddenDeath: false,
      startedAtMs,
      nowMs: afterTimer,
      durationMs,
      scores,
      netSlots: humanTieSlots,
      allCarts: carts,
      fallYThreshold: fallY,
      nowPerfMs: 5000,
      setSuddenDeath,
      sendHostRound,
      onCartOutOfPlay,
    });

    expect(result).toBe("infer_enter");
    expect(setSuddenDeath).toHaveBeenCalledWith(true);
    expect(sendHostRound).toHaveBeenCalledTimes(1);
    // * Tied drop in at spawn+1; non-tied parked.
    expect(carts[0].body.translation().y).toBeCloseTo(4, 5); // spawn.y 3 + 1
    expect(carts[2].body.translation().y).toBe(-50);
    expect(carts[2].isSuddenDeathSpectator).toBe(true);
    expect(onCartOutOfPlay).toHaveBeenCalled();
  });

  it("past timer but scores not tied → none (leave endRound to gameFlow)", () => {
    const setSuddenDeath = vi.fn();
    const result = ensureSuddenDeathOnHostPromote({
      phase: "running",
      isSuddenDeath: false,
      startedAtMs,
      nowMs: afterTimer,
      durationMs,
      scores: { 0: 6, 1: 2, 2: 1, 3: 0 },
      netSlots: humanTieSlots,
      allCarts: [makeCart(0), makeCart(0), makeCart(0), makeCart(0)],
      fallYThreshold: fallY,
      setSuddenDeath,
    });
    expect(result).toBe("none");
    expect(setSuddenDeath).not.toHaveBeenCalled();
  });

  it("still inside round clock → none", () => {
    const setSuddenDeath = vi.fn();
    const result = ensureSuddenDeathOnHostPromote({
      phase: "running",
      isSuddenDeath: false,
      startedAtMs,
      nowMs: startedAtMs + 1000,
      durationMs,
      scores: { 0: 3, 1: 3, 2: 0, 3: 0 },
      netSlots: humanTieSlots,
      allCarts: [makeCart(0), makeCart(0)],
      fallYThreshold: fallY,
      setSuddenDeath,
    });
    expect(result).toBe("none");
    expect(setSuddenDeath).not.toHaveBeenCalled();
  });
});

// * Run-6: SD only ends on a resolving KO — a live MP capture sat 24s past round
// * expiry with two cagey drivers circling a solid floor forever. The stalemate cap
// * ends the round via the standard tiebreak (endRound with no scorer).
describe("sudden death stalemate cap", () => {
  beforeEach(() => resetSuddenDeathStalemateForTest());

  it("ends the round after suddenDeathMaxMs with no resolving KO", () => {
    const { deps } = makeSuddenDeathWorld();
    deps.CONFIG.round.suddenDeathMaxMs = 45000;
    const t0 = 1_000_000;

    updateGameFlow(deps, { now: performance.now(), dt: 16, loopState: {}, roundNowMs: t0 });
    expect(deps.endRound).not.toHaveBeenCalled();

    updateGameFlow(deps, { now: performance.now(), dt: 16, loopState: {}, roundNowMs: t0 + 44_000 });
    expect(deps.endRound).not.toHaveBeenCalled();

    updateGameFlow(deps, { now: performance.now(), dt: 16, loopState: {}, roundNowMs: t0 + 45_000 });
    expect(deps.endRound).toHaveBeenCalledTimes(1);
  });

  it("does not arm the cap outside Sudden Death", () => {
    const { deps } = makeSuddenDeathWorld();
    deps.getRoundState().isSuddenDeath = false;
    deps.CONFIG.round.suddenDeathMaxMs = 45000;
    // * Keep the timer un-expired so the normal end path stays quiet too.
    deps.getRoundState().startedAtMs = 1_000_000;
    const t0 = 1_000_100;

    updateGameFlow(deps, { now: performance.now(), dt: 16, loopState: {}, roundNowMs: t0 });
    updateGameFlow(deps, { now: performance.now(), dt: 16, loopState: {}, roundNowMs: t0 + 100_000 });
    expect(deps.endRound).not.toHaveBeenCalled();
  });
});
