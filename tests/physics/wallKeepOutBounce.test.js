// @ts-nocheck
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { computeWallKeepOutBounce, setLevelHazards } from "../../src/simulation.js";

// * Storerooms hazard model: the center furniture pile is a `wall` keep-out (un-climbable),
// * radius 3.4 with a 0.9m pressing pad → the bounce band spans radius [2.5, 4.3] from center.
const R = 3.4;
const PAD = 0.9;

function registerPileLevel({ wall = true } = {}) {
  setLevelHazards({
    arenaHalf: 38,
    half: 4.25,
    avoidMargin: 2.4,
    influenceBand: 1.6,
    squareHoles: [{ x: 20, z: 20 }],
    circularKeepOuts: [{ x: 0, z: 0, radius: R, margin: 1.7, solid: true, wall }],
  });
}

describe("computeWallKeepOutBounce", () => {
  beforeEach(() => registerPileLevel());
  afterEach(() => setLevelHazards(null));

  it("returns null with no hazards registered", () => {
    setLevelHazards(null);
    expect(computeWallKeepOutBounce(R, 0, 0, 0)).toBeNull();
  });

  it("ignores keep-outs that are solid but drivable (no wall flag)", () => {
    // * Sundial's podium is `solid` high ground carts drive onto — it must never shove them off.
    registerPileLevel({ wall: false });
    expect(computeWallKeepOutBounce(R, 0, -8, 0)).toBeNull();
  });

  it("returns null outside the pressing pad", () => {
    expect(computeWallKeepOutBounce(R + PAD + 0.2, 0, 0, 0)).toBeNull();
  });

  it("pushes directly away from the obstacle center", () => {
    // * East of the pile on the x-axis → outward is +x with no z component.
    const b = computeWallKeepOutBounce(R + 0.3, 0, 0, 0);
    expect(b).not.toBeNull();
    expect(b.outX).toBeCloseTo(1, 5);
    expect(Math.abs(b.outZ)).toBeLessThan(1e-6);
  });

  it("ramps depth 0 at the pad edge to 1 at the keep-out radius", () => {
    const atFace = computeWallKeepOutBounce(R, 0, 0, 0);
    const midPad = computeWallKeepOutBounce(R + PAD / 2, 0, 0, 0);
    expect(atFace.depth).toBeCloseTo(1, 5);
    expect(midPad.depth).toBeCloseTo(0.5, 5);
    expect(atFace.accel).toBeGreaterThan(midPad.accel);
  });

  it("frees a stationary wedge — a motionless cart still gets pushed out", () => {
    // * This is the trap case: the cart is not moving, so no impact-driven term applies.
    const b = computeWallKeepOutBounce(R + 0.1, 0, 0, 0);
    expect(b.accel).toBeGreaterThan(0);
  });

  it("bounces harder the harder the cart drives in", () => {
    const px = R + 0.3;
    const hardCrash = computeWallKeepOutBounce(px, 0, -10, 0); // driving into the pile
    const nudge = computeWallKeepOutBounce(px, 0, -2, 0);
    const still = computeWallKeepOutBounce(px, 0, 0, 0);
    expect(hardCrash.accel).toBeGreaterThan(nudge.accel);
    expect(nudge.accel).toBeGreaterThan(still.accel);
  });

  it("does not add a bounce term for a cart already driving away", () => {
    const px = R + 0.3;
    const leaving = computeWallKeepOutBounce(px, 0, +9, 0);
    const still = computeWallKeepOutBounce(px, 0, 0, 0);
    expect(leaving.accel).toBeCloseTo(still.accel, 5);
  });

  it("resolves the deepest wall zone when several overlap", () => {
    setLevelHazards({
      arenaHalf: 38,
      half: 4.25,
      avoidMargin: 2.4,
      influenceBand: 1.6,
      squareHoles: [{ x: 20, z: 20 }],
      circularKeepOuts: [
        { x: 0, z: 0, radius: R, margin: 1.7, wall: true },
        { x: 6, z: 0, radius: 2.0, margin: 1.0, wall: true },
      ],
    });
    // * At x=4.2: 0.8m outside the far edge of zone A, but only 0.2m into zone B's pad
    // * measured from B's center (dist 1.8 → inside radius 2.0). B is deeper, so B wins.
    const b = computeWallKeepOutBounce(4.2, 0, 0, 0);
    expect(b.outX).toBeCloseTo(-1, 5); // pushed away from the zone at x=6
  });

  it("has a finite push at the exact center (no divide-by-zero)", () => {
    const b = computeWallKeepOutBounce(0, 0, 0, 0);
    expect(Number.isFinite(b.accel)).toBe(true);
    expect(Math.hypot(b.outX, b.outZ)).toBeCloseTo(1, 5);
  });
});
