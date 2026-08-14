// @vitest-environment happy-dom
//
// Regression tests for timer-expiry ordering in updateGameFlow.
// * Bug (Run-7 polish pass): the timer-expiry branch and the fall/KO loop were an
// * if/else — on the exact frame the round clock expired the entire fall pass was
// * skipped, so a last-frame KO (victim visibly off the arena at 0:00) was silently
// * swallowed: no kill-feed row, no shatter, no score, and a would-be tiebreak could
// * crown the wrong cart or enter Sudden Death despite a decisive final hit.
// * Falls now process first; expiry is evaluated afterward on fresh state.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/entities.js", () => ({
  resetCartTransientState: () => {},
}));
vi.mock("../../src/levels/levelManager.js", () => ({
  getCurrentLevelId: () => "classicRecord",
}));
vi.mock("../../src/scoring/koEvent.js", () => ({
  buildKOConfirmPreview: vi.fn(() => null),
  buildKOEvent: vi.fn(),
}));
vi.mock("../../src/scoring/koReactors.js", () => ({
  dispatchKOEvent: vi.fn(),
}));

import { updateGameFlow } from "../../src/gameFlow.js";
import { buildKOConfirmPreview, buildKOEvent } from "../../src/scoring/koEvent.js";
import { dispatchKOEvent } from "../../src/scoring/koReactors.js";

const ROUND_MS = 150000;

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

function makeCart(slotIndex, y) {
  return {
    slotIndex,
    body: makeBody({ x: 0, y, z: 0 }),
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

/** Timed round (not Sudden Death), host, all four carts standing. */
function makeTimedWorld(scores) {
  const carts = [makeCart(0, 0), makeCart(1, 0), makeCart(2, 0), makeCart(3, 0)];
  const roundState = {
    phase: "running",
    startedAtMs: 1000, // isRoundTimerExpired treats 0 as "not started"
    countdownStartedAtMs: 0,
    winnerSlotIndex: null,
    endReason: null,
    scores,
    isSuddenDeath: false,
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
      round: { durationMs: ROUND_MS },
      booth: { platformY: 6 },
    },
    getLocalSlotIndex: () => 0,
    getLocalCart: () => carts[0],
    scheduleRespawn: vi.fn(),
    scheduleStuckRespawn: vi.fn(),
    doRespawn: vi.fn(),
    maybeTriggerNpcOpportunisticRamBoost: vi.fn(),
    maybeTriggerNpcOpportunisticHop: vi.fn(),
    endRound: vi.fn(() => { roundState.phase = "podium"; }),
    scheduleLastCartStandingFinish: vi.fn(),
    abortLastCartStandingFlourish: vi.fn(),
    colorHexForSlot: () => 0xffffff,
    hud: null,
    sendHostRound: vi.fn(),
    getPartySocket: () => null,
    addScore: vi.fn((slot, pts) => {
      scores[slot] = (scores[slot] || 0) + pts;
      return false; // not a Sudden Death end
    }),
    isScoreTied: () => {
      const values = [0, 1, 2, 3].map((i) => Number(scores[i] || 0));
      const top = Math.max(...values);
      return values.filter((v) => v === top).length > 1;
    },
    setSuddenDeath: vi.fn(),
    detectGameMode: () => "solo",
    getScene: () => ({}),
    triggerCartShatter: vi.fn(),
    getYouConnId: () => "you",
    queueHostFallEvent: vi.fn(),
    onKoConfirmPreview: vi.fn(),
    onSpill: vi.fn(),
    onCartOutOfPlay: vi.fn(),
    setLocalCombo: vi.fn(),
  };
  return { carts, deps };
}

function runExpiryFrame(deps) {
  updateGameFlow(deps, {
    now: performance.now(),
    dt: 16,
    loopState: {},
    roundNowMs: 1000 + ROUND_MS + 1, // clock just hit 0:00 this frame
  });
}

function mockEnvFall() {
  vi.mocked(buildKOEvent).mockReturnValue({
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
  });
}

function mockRamKill(attackerSlotIndex, total) {
  vi.mocked(buildKOEvent).mockReturnValue({
    isKill: true,
    attackerSlotIndex,
    verb: "RAMMED",
    cause: "edge",
    comboTier: 0,
    comboMultiplier: 1.0,
    wasCritical: false,
    victimWasLeader: false,
    reward: { total },
    isFinalBlow: false,
  });
}

beforeEach(() => {
  vi.mocked(buildKOEvent).mockReset();
  vi.mocked(dispatchKOEvent).mockClear();
});

describe("timer expiry vs same-frame falls", () => {
  it("confirms an attributed KO at the shared rim before the tuned death threshold", () => {
    const { carts, deps } = makeTimedWorld({ 0: 0, 1: 0, 2: 0, 3: 0 });
    carts[1].body._pos.y = -2.1; // shared entry threshold; final KO remains at -10.
    vi.mocked(buildKOConfirmPreview).mockReturnValue({ victimSlotIndex: 1, attackerSlotIndex: 0 });

    updateGameFlow(deps, {
      now: performance.now(),
      dt: 16,
      loopState: {},
      roundNowMs: 2_000,
    });

    expect(deps.onKoConfirmPreview).toHaveBeenCalledWith({ victimSlotIndex: 1, attackerSlotIndex: 0 });
    expect(buildKOEvent).not.toHaveBeenCalled();
    expect(deps.addScore).not.toHaveBeenCalled();
    expect(deps.triggerCartShatter).not.toHaveBeenCalled();
    expect(deps.scheduleRespawn).not.toHaveBeenCalled();
  });

  it("still presents a KO that lands on the exact expiry frame, then ends the round", () => {
    const { carts, deps } = makeTimedWorld({ 0: 3, 1: 1, 2: 0, 3: 0 });
    mockEnvFall();
    carts[1].body._pos.y = -20; // crosses the fall line on the 0:00 frame

    runExpiryFrame(deps);

    // The fall is fully presented (feed/announcer via dispatch, VFX, wire event)…
    expect(deps.queueHostFallEvent).toHaveBeenCalledTimes(1);
    expect(dispatchKOEvent).toHaveBeenCalledTimes(1);
    expect(deps.triggerCartShatter).toHaveBeenCalledTimes(1);
    // …and the round still ends this frame.
    expect(deps.endRound).toHaveBeenCalledTimes(1);
    expect(deps.setSuddenDeath).not.toHaveBeenCalled();
  });

  it("counts a last-frame ram KO's points before the tiebreak — decisive hit wins, no Sudden Death", () => {
    // Human slot 0 and NPC slot 1 tied at the buzzer; slot 0 rams slot 2 off as the
    // clock expires. Pre-fix: fall skipped, tie → Sudden Death. Post-fix: score
    // lands, tie broken, round ends decisively.
    const { carts, deps } = makeTimedWorld({ 0: 3, 1: 3, 2: 0, 3: 0 });
    mockRamKill(0, 1);
    carts[2].body._pos.y = -20;

    runExpiryFrame(deps);

    expect(deps.addScore).toHaveBeenCalledWith(0, 1, false);
    expect(deps.setSuddenDeath).not.toHaveBeenCalled();
    expect(deps.endRound).toHaveBeenCalledTimes(1);
  });

  it("still enters Sudden Death on a genuine human tie at expiry with no same-frame fall", () => {
    const { deps } = makeTimedWorld({ 0: 3, 1: 3, 2: 0, 3: 0 });
    mockEnvFall();

    runExpiryFrame(deps);

    expect(deps.setSuddenDeath).toHaveBeenCalledTimes(1);
    expect(deps.sendHostRound).toHaveBeenCalled();
    expect(deps.endRound).not.toHaveBeenCalled();
  });

  it("resolves an NPC-only tie at expiry via endRound, not Sudden Death", () => {
    const { deps } = makeTimedWorld({ 0: 1, 1: 3, 2: 3, 3: 0 });
    mockEnvFall();

    runExpiryFrame(deps);

    expect(deps.setSuddenDeath).not.toHaveBeenCalled();
    expect(deps.endRound).toHaveBeenCalledTimes(1);
  });
});
