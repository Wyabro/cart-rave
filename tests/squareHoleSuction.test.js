// @ts-nocheck
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { computeSquareHoleSuction, setLevelHazards } from "../src/simulation.js";

// * Storerooms-style hazard model: one square void at (20, 20), half 4.25, suction band 2.6m
// * outside the lip → band spans Chebyshev distance [4.25, 6.85] from the void center.
const HALF = 4.25;
const BAND = 2.6;
const HOLE = { x: 20, z: 20 };

function registerSuctionLevel() {
  setLevelHazards({
    arenaHalf: 38,
    half: HALF,
    avoidMargin: 2.4,
    influenceBand: 1.6,
    suctionBand: BAND,
    squareHoles: [HOLE],
  });
}

describe("computeSquareHoleSuction", () => {
  beforeEach(registerSuctionLevel);
  afterEach(() => setLevelHazards(null));

  it("returns null with no suction band registered", () => {
    setLevelHazards({
      arenaHalf: 38,
      half: HALF,
      avoidMargin: 1.2,
      influenceBand: 1.2,
      squareHoles: [HOLE],
    });
    // * At the lip but no suctionBand key → feature off.
    expect(computeSquareHoleSuction(HOLE.x + HALF, HOLE.z, 0, 0)).toBeNull();
  });

  it("returns null outside the band (past the outer edge)", () => {
    // * Cheb distance just beyond half + band = 6.85.
    const outside = computeSquareHoleSuction(HOLE.x + HALF + BAND + 0.5, HOLE.z, 0, 0);
    expect(outside).toBeNull();
  });

  it("pulls toward the void center (inward direction)", () => {
    // * East of the void on the x-axis → inward points -x, no z component.
    const s = computeSquareHoleSuction(HOLE.x + HALF + 0.5, HOLE.z, 0, 0);
    expect(s).not.toBeNull();
    expect(s.inwardX).toBeLessThan(0);
    expect(Math.abs(s.inwardZ)).toBeLessThan(1e-6);
    // * Applying the pull reduces the cart's distance to the hole.
    expect(HOLE.x + HALF + 0.5 + s.inwardX).toBeLessThan(HOLE.x + HALF + 0.5);
  });

  it("ramps depth 0 at the outer edge to ~1 at the lip", () => {
    const atLip = computeSquareHoleSuction(HOLE.x + HALF + 0.01, HOLE.z, 0, 0);
    const midBand = computeSquareHoleSuction(HOLE.x + HALF + BAND / 2, HOLE.z, 0, 0);
    expect(atLip.depth).toBeGreaterThan(0.95);
    expect(midBand.depth).toBeCloseTo(0.5, 1);
    // * Deeper (closer to the lip) always pulls harder for a stationary cart.
    expect(atLip.accel).toBeGreaterThan(midBand.accel);
  });

  it("adds capture assist for a cart shoved inward, but not for one driving out", () => {
    const px = HOLE.x + HALF + 1.0;
    const shovedIn = computeSquareHoleSuction(px, HOLE.z, -6, 0); // velocity toward the void (-x)
    const drivingOut = computeSquareHoleSuction(px, HOLE.z, +6, 0); // velocity away (+x)
    const still = computeSquareHoleSuction(px, HOLE.z, 0, 0);
    // * Shove-in gets the extra capture accel; driving out gets only the depth pull (no reduction).
    expect(shovedIn.accel).toBeGreaterThan(still.accel);
    expect(drivingOut.accel).toBeCloseTo(still.accel, 5);
  });

  it("keeps the outer half escapable — modest pull vs the deep lip", () => {
    const outerHalf = computeSquareHoleSuction(HOLE.x + HALF + BAND * 0.75, HOLE.z, 0, 0);
    const atLip = computeSquareHoleSuction(HOLE.x + HALF + 0.01, HOLE.z, 0, 0);
    // * Outer-half stationary pull is well under the lip pull (the "escapable outer band" promise).
    expect(outerHalf.accel).toBeLessThan(atLip.accel * 0.5);
  });
});
