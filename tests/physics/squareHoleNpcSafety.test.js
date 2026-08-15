// @vitest-environment happy-dom
// squareHoleNpcSafety.test.js — STOREROOMS-NPC-SELFKO-2 L1 vortex keep-out + TTE recovery.

import { describe, it, expect, afterEach } from "vitest";
import {
  computeSquareHoleTtePanic,
  shouldNpcPanicReverseSquareHole,
  computeBackroomsOuterRimStrength,
  clampBackroomsAiTarget,
  setLevelHazards,
} from "../../src/simulation.js";
import { STOREROOMS_NPC_AVOID_MARGIN } from "../../src/levels/backroomsSupermarket.js";

/** Keep in sync with backroomsSupermarket.js HOLE_HALF / HOLE_SUCTION_BAND. */
const HALF = 4.25;
const SUCTION = 2.6;

describe("Storerooms NPC vortex keep-out (STOREROOMS-NPC-SELFKO-2 L1)", () => {
  it("live keep-out sits past the suction band", () => {
    expect(HALF + STOREROOMS_NPC_AVOID_MARGIN).toBeGreaterThan(HALF + SUCTION);
  });
});

describe("computeSquareHoleTtePanic", () => {
  it("is zero when idle next to a hole", () => {
    // * Gutter-ish: cheb 7.0, no inward speed.
    expect(computeSquareHoleTtePanic(7.0, 0, HALF)).toBe(0);
    expect(computeSquareHoleTtePanic(7.0, 0.4, HALF)).toBe(0);
  });

  it("fast dive (~15 m/s) near suction reaches panic ≥ 1.0", () => {
    // * cheb 6.6 → gap 2.35 m; 15 m/s → tte 0.157 s ≪ 0.45.
    // * strength = (0.45 − 0.157) / 0.45 * 1.6 ≈ 1.04.
    const panic = computeSquareHoleTtePanic(6.6, 15, HALF);
    expect(panic).toBeGreaterThanOrEqual(1.0);
    expect(panic).toBeLessThanOrEqual(1.6);
    expect(panic).toBeGreaterThan(computeSquareHoleTtePanic(6.6, 0, HALF));
  });

  it("does not engage TTE when not diving", () => {
    expect(computeSquareHoleTtePanic(6.6, -8, HALF)).toBe(0);
  });
});

describe("shouldNpcPanicReverseSquareHole", () => {
  const keepOut = HALF + STOREROOMS_NPC_AVOID_MARGIN;

  it("does not reverse an idle cart in the gutter", () => {
    expect(shouldNpcPanicReverseSquareHole({
      cheb: keepOut + 0.4,
      half: HALF,
      keepOut,
      speed: 0.4,
      towardHole: 0,
      insideZone: false,
    })).toBe(false);
  });

  it("reverses a dive with short time-to-lip", () => {
    // * cheb 8.0, 15 m/s, toward 0.9 → approach 13.5; tte (8−4.25)/13.5 ≈ 0.28 < 0.32.
    expect(shouldNpcPanicReverseSquareHole({
      cheb: 8.0,
      half: HALF,
      keepOut,
      speed: 15,
      towardHole: 0.9,
      insideZone: false,
    })).toBe(true);
  });

  it("does not reverse a far dive still outside the TTE window", () => {
    // * cheb 12, 15 m/s, toward 0.9 → tte (12−4.25)/13.5 ≈ 0.57 > 0.32.
    expect(shouldNpcPanicReverseSquareHole({
      cheb: 12,
      half: HALF,
      keepOut,
      speed: 15,
      towardHole: 0.9,
      insideZone: false,
    })).toBe(false);
  });
});

const ARENA_HALF = 38;

function registerStorerooms() {
  setLevelHazards({
    arenaHalf: ARENA_HALF,
    half: HALF,
    avoidMargin: STOREROOMS_NPC_AVOID_MARGIN,
    influenceBand: 2.0,
    squareHoles: [{ x: 20, z: 20 }],
  });
}

describe("Storerooms NPC outer rim (STOREROOMS-NPC-SELFKO-2 L2)", () => {
  afterEach(() => setLevelHazards(null));

  it("clamps chase targets off the outward chamfer (|x|,|z| ≤ 35.2)", () => {
    registerStorerooms();
    const c = clampBackroomsAiTarget(40, 0, false);
    expect(Math.abs(c.x)).toBeLessThanOrEqual(35.2);
    expect(Math.abs(c.z)).toBeLessThanOrEqual(35.2);
    const corner = clampBackroomsAiTarget(40, 40, false);
    expect(Math.abs(corner.x)).toBeLessThanOrEqual(35.2);
    expect(Math.abs(corner.z)).toBeLessThanOrEqual(35.2);
  });

  it("rim strength is 0 at mid-floor", () => {
    expect(computeBackroomsOuterRimStrength(0, 0, 0, 0, ARENA_HALF)).toBe(0);
    expect(computeBackroomsOuterRimStrength(10, 8, 20, 0, ARENA_HALF)).toBe(0);
  });

  it("fast outward run near 36 m reaches panic", () => {
    // * gap = 38 − 36 = 2 m; 15 m/s outward → tte 0.133 s ≪ 0.55.
    const strength = computeBackroomsOuterRimStrength(36, 0, 15, 0, ARENA_HALF);
    expect(strength).toBeGreaterThanOrEqual(1.0);
    expect(strength).toBeLessThanOrEqual(1.6);
    const idle = computeBackroomsOuterRimStrength(36, 0, 0, 0, ARENA_HALF);
    expect(strength).toBeGreaterThan(idle);
  });
});
