// @vitest-environment happy-dom
// NH-HIT: non-host live prediction should present ram FX immediately for the local
// rammer; reconcile replay must stay quiet (no double FX).

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../src/stores/gameStore.js", async (importActual) => {
  const actual = await importActual();
  return {
    ...actual,
    recordHit: vi.fn(),
    setLocalCombo: vi.fn(),
    getRoundState: () => ({ phase: "running", isSuddenDeath: false }),
  };
});

vi.mock("../src/stores/challengeStore.js", () => ({
  ChallengeTracker: { record: vi.fn() },
}));

import { applyRammingImpulse } from "../src/simulation.js";

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
