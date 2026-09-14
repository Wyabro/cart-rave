// @vitest-environment happy-dom
// NH-HIT: non-host live prediction should present ram FX immediately for the local
// rammer; reconcile replay must stay quiet (no double FX).

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/stores/gameStore.js", async (importActual) => {
  const actual = await importActual();
  return {
    ...actual,
    recordHit: vi.fn(),
    setLocalCombo: vi.fn(),
    getRoundState: () => ({ phase: "running", isSuddenDeath: false }),
  };
});

vi.mock("../../src/stores/challengeStore.js", () => ({
  ChallengeTracker: { record: vi.fn() },
}));

import { applyRammingImpulse } from "../../src/simulation.js";

function ramCart(slotIndex, pos, liveLinvel) {
  return {
    slotIndex,
    body: {
      translation: () => ({ ...pos }),
      linvel: () => ({ ...liveLinvel }),
      mass: () => 20,
    },
    respawnAtMs: null,
    isSuddenDeathSpectator: false,
    ramBoostActiveUntilMs: 0,
    comboTier: 0,
    hasSpilled: false,
  };
}

function stateOf(pos) {
  return { pos: { ...pos }, linvel: { x: 0, y: 0, z: 0 } };
}

const SHOVER_POS = { x: 0, y: 0, z: 5 };
const VICTIM_POS = { x: 0, y: 0, z: 0 };

describe("applyRammingImpulse — NH-HIT optimistic local hit FX", () => {
  let playCollision;
  let spawnTrashBurst;
  let onLocalRamImpact;
  let noteOptimisticCollisionFx;

  beforeEach(() => {
    playCollision = vi.fn();
    spawnTrashBurst = vi.fn();
    onLocalRamImpact = vi.fn();
    noteOptimisticCollisionFx = vi.fn();
  });

  it("fires presentation on live non-host path when local cart is rammer", () => {
    const rammer = ramCart(0, SHOVER_POS, { x: 0, y: 0, z: -8 });
    const victim = ramCart(1, VICTIM_POS, { x: 0, y: 0, z: 0 });

    applyRammingImpulse(
      rammer,
      victim,
      stateOf(SHOVER_POS),
      stateOf(VICTIM_POS),
      {
        localCart: rammer,
        playCollision,
        spawnTrashBurst,
        onLocalRamImpact,
        noteOptimisticCollisionFx,
      },
      false,
      1000,
    );

    expect(playCollision).toHaveBeenCalled();
    expect(spawnTrashBurst).toHaveBeenCalled();
    expect(onLocalRamImpact).toHaveBeenCalled();
    expect(noteOptimisticCollisionFx).toHaveBeenCalledWith(0, 1, 0);
  });

  it("does not fire presentation on reconcile replay", () => {
    const rammer = ramCart(0, SHOVER_POS, { x: 0, y: 0, z: -8 });
    const victim = ramCart(1, VICTIM_POS, { x: 0, y: 0, z: 0 });

    applyRammingImpulse(
      rammer,
      victim,
      stateOf(SHOVER_POS),
      stateOf(VICTIM_POS),
      {
        localCart: rammer,
        isReconcileReplay: true,
        playCollision,
        spawnTrashBurst,
        onLocalRamImpact,
        noteOptimisticCollisionFx,
      },
      false,
      1000,
    );

    expect(playCollision).not.toHaveBeenCalled();
    expect(spawnTrashBurst).not.toHaveBeenCalled();
    expect(onLocalRamImpact).not.toHaveBeenCalled();
    expect(noteOptimisticCollisionFx).not.toHaveBeenCalled();
    expect(victim.pendingRam).toBeDefined();
  });

  it("does not fire when local cart is not the rammer", () => {
    const rammer = ramCart(0, SHOVER_POS, { x: 0, y: 0, z: -8 });
    const victim = ramCart(1, VICTIM_POS, { x: 0, y: 0, z: 0 });

    applyRammingImpulse(
      rammer,
      victim,
      stateOf(SHOVER_POS),
      stateOf(VICTIM_POS),
      {
        localCart: victim,
        playCollision,
        spawnTrashBurst,
        onLocalRamImpact,
        noteOptimisticCollisionFx,
      },
      false,
      1000,
    );

    expect(playCollision).not.toHaveBeenCalled();
    expect(noteOptimisticCollisionFx).not.toHaveBeenCalled();
  });
});

describe("applyRammingImpulse — RAM-ARREST-1 solver-arrest fallback", () => {
  let playCollision;
  let spawnTrashBurst;
  let onLocalRamImpact;
  let noteOptimisticCollisionFx;

  beforeEach(() => {
    playCollision = vi.fn();
    spawnTrashBurst = vi.fn();
    onLocalRamImpact = vi.fn();
    noteOptimisticCollisionFx = vi.fn();
  });

  // * Pre-step states carry the PRE-collision velocity (fast); the body mock
  // * reports the LIVE post-collision velocity (solver-arrested ~0).
  function arrestCase(liveLinvel) {
    const rammer = ramCart(0, SHOVER_POS, liveLinvel);
    const victim = ramCart(1, VICTIM_POS, { x: 0, y: 0, z: 0 });
    const rammerState = {
      pos: { ...SHOVER_POS },
      linvel: { x: 0, y: 0, z: -8 },
    };
    const victimState = {
      pos: { ...VICTIM_POS },
      linvel: { x: 0, y: 0, z: 0 },
    };
    return { rammer, victim, rammerState, victimState };
  }

  it("fires crash presentation from pre-step closing when live is arrested (non-host)", () => {
    const { rammer, victim, rammerState, victimState } = arrestCase({ x: 0, y: 0, z: -0.1 });

    applyRammingImpulse(
      rammer,
      victim,
      rammerState,
      victimState,
      {
        localCart: rammer,
        playCollision,
        spawnTrashBurst,
        onLocalRamImpact,
        noteOptimisticCollisionFx,
      },
      false,
      1000,
    );

    // * closing 8 m/s, mass 20: base min(3.15*8*20, 200) = 200 → intensity 1.
    expect(playCollision).toHaveBeenCalledTimes(1);
    expect(playCollision).toHaveBeenCalledWith(1, { isBoosting: false });
    expect(spawnTrashBurst).toHaveBeenCalledTimes(1);
    expect(onLocalRamImpact).toHaveBeenCalled();
    expect(noteOptimisticCollisionFx).toHaveBeenCalledWith(0, 1, 0);
    // * Physics stays live-gated: no impulse, no combo tier.
    expect(victim.pendingRam).toBeUndefined();
    expect(rammer.comboTier).toBe(0);
  });

  it("fires arrested presentation on host without impulse", () => {
    const { rammer, victim, rammerState, victimState } = arrestCase({ x: 0, y: 0, z: 0 });

    applyRammingImpulse(
      rammer,
      victim,
      rammerState,
      victimState,
      {
        localCart: rammer,
        playCollision,
        spawnTrashBurst,
        onLocalRamImpact,
        noteOptimisticCollisionFx,
      },
      true,
      1000,
    );

    expect(playCollision).toHaveBeenCalledTimes(1);
    expect(victim.pendingRam).toBeUndefined();
    expect(rammer.comboTier).toBe(0);
  });

  it("stays silent on reconcile replay even when arrested", () => {
    const { rammer, victim, rammerState, victimState } = arrestCase({ x: 0, y: 0, z: -0.1 });

    applyRammingImpulse(
      rammer,
      victim,
      rammerState,
      victimState,
      {
        localCart: rammer,
        isReconcileReplay: true,
        playCollision,
        spawnTrashBurst,
        onLocalRamImpact,
        noteOptimisticCollisionFx,
      },
      false,
      1000,
    );

    expect(playCollision).not.toHaveBeenCalled();
    expect(spawnTrashBurst).not.toHaveBeenCalled();
    expect(onLocalRamImpact).not.toHaveBeenCalled();
    expect(noteOptimisticCollisionFx).not.toHaveBeenCalled();
    expect(victim.pendingRam).toBeUndefined();
  });
});
