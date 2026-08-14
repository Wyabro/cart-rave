// @vitest-environment happy-dom
// chargeSfxStop.test.js — chargeUp loop cleanup contracts.
// Per-cart cleanup stops by id (resetCartTransientState / doRespawn must NOT sweep
// every instance — chargeUp is played by the local cart AND NPCs, and a respawn of
// one cart must not silence another cart's live charge). The no-arg stopAllSfx
// (Howl.stop()) is a utility + the round-boundary/rematch orphan killer only.

import { describe, it, expect, vi, beforeEach } from "vitest";

const stopMock = vi.fn();
// * Unique ids per play so per-cart instance isolation is decidable in assertions.
// * mock-prefixed so the hoisted vi.mock factory may reference it.
const mockNextSfxId = { value: 1 };
vi.mock("howler", () => ({
  Howl: class {
    constructor() {
      this._state = "loaded";
    }
    state() { return this._state; }
    load() {}
    play() { return mockNextSfxId.value++; }
    stop(...args) { stopMock(...args); }
    volume() { return 1; }
    fade() {}
    once() {}
    unload() {}
  },
  Howler: { mute: vi.fn(), volume: vi.fn() },
}));

import { registerSfx, playSfx, stopSfx, stopAllSfx } from "../../src/audioManager.js";
import { resetCartTransientState, doRespawn } from "../../src/entities.js";

/** Minimal cart body for resetCartTransientState / doRespawn unit tests. */
function makeCart(overrides = {}) {
  return {
    body: {
      setLinvel: vi.fn(),
      setAngvel: vi.fn(),
      setTranslation: vi.fn(),
      setRotation: vi.fn(),
      translation: () => ({ x: 0, y: 1, z: 0 }),
      rotation: () => ({ x: 0, y: 0, z: 0, w: 1 }),
      linvel: () => ({ x: 0, y: 0, z: 0 }),
      angvel: () => ({ x: 0, y: 0, z: 0 }),
    },
    spawn: { x: 0, y: 1, z: 0 },
    spawnYaw: 0,
    slotIndex: 0,
    hopAwaitingLand: false,
    hopAirborne: false,
    isChargingBoost: true,
    boostChargeStartedAtMs: 50,
    boostCooldownUntilMs: 0,
    boostChargeMultiplier: 1,
    chargeUpSfxId: null,
    nitroStreakCharged: false,
    pendingRam: null,
    ramBoostActiveUntilMs: 0,
    ramBoostStreakCarry: 0,
    lastRamBoostTimeMs: 0,
    comboTier: 0,
    comboExpiryMs: 0,
    aiNextDecisionMs: 0,
    aiTarget: { x: 0, z: 0 },
    aiPauseUntilMs: 0,
    aiReverseUntilMs: 0,
    aiSteerGain: 1.1,
    aiLastProgressMs: 0,
    aiLastDistToTarget: Infinity,
    hasSpilled: false,
    tipOverStartMs: null,
    respawnAtMs: null,
    mesh: null,
    cargoBay: null,
    lifeCargoPoints: 0,
    cargoFullness01: 0,
    ...overrides,
  };
}

describe("chargeUp stop helpers", () => {
  beforeEach(() => {
    stopMock.mockClear();
    mockNextSfxId.value = 1;
    registerSfx("chargeUp", ["data:audio/wav;base64,AA=="], { pool: 2, loop: true });
  });

  it("stopSfx with id stops that instance only", () => {
    const id = playSfx("chargeUp");
    stopSfx("chargeUp", id);
    expect(stopMock).toHaveBeenCalledWith(id);
  });

  it("stopAllSfx stops every instance (no id)", () => {
    playSfx("chargeUp");
    playSfx("chargeUp");
    stopAllSfx("chargeUp");
    expect(stopMock).toHaveBeenCalledWith();
  });

  it("resetCartTransientState stops by id before nulling chargeUpSfxId", () => {
    const id = playSfx("chargeUp");
    const cart = makeCart({ chargeUpSfxId: id, isChargingBoost: true });
    resetCartTransientState(cart);
    expect(stopMock).toHaveBeenCalledWith(id);
    expect(cart.chargeUpSfxId).toBeNull();
    expect(cart.isChargingBoost).toBe(false);
  });

  it("doRespawn stops only the respawning cart's tracked loop; other live loops survive", () => {
    const idRespawned = playSfx("chargeUp"); // cart A's loop
    const idOther = playSfx("chargeUp"); // cart B's loop — must survive
    const cartA = makeCart({ chargeUpSfxId: idRespawned, isChargingBoost: true });
    const cartB = makeCart({ chargeUpSfxId: idOther, isChargingBoost: true });

    doRespawn(cartA);

    // * Cart A's own loop is stopped by id via resetCartTransientState.
    expect(stopMock).toHaveBeenCalledWith(idRespawned);
    // * No no-arg (stopAll) sweep — a global cut here would silence cart B's live
    // * charge (and any NPC's) mid-charge on an unrelated respawn (the reported bug).
    expect(stopMock).not.toHaveBeenCalledWith();
    // * Cart B's loop is untouched.
    expect(stopMock).not.toHaveBeenCalledWith(idOther);
    expect(cartB.chargeUpSfxId).toBe(idOther);
  });
});
