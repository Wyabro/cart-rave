// @ts-nocheck
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  computeWallKeepOutBounce,
  resolveWallKeepOutDeltaV,
  setLevelHazards,
} from "../../src/simulation.js";
import { CONFIG } from "../../src/config.js";

// * Storerooms hazard model: keep-out radius 3.4. Pad reach is cart hz + 0.3 press
// * so a nose-on body origin (~4.45 m) is inside the band.
const R = 3.4;
const REACH = CONFIG.cart.size.z / 2 + 0.3;
const DT = 1 / 60;
const NOSE_ON = 4.45;

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
    expect(computeWallKeepOutBounce(R + REACH + 0.2, 0, 0, 0)).toBeNull();
  });

  it("arms at a nose-on body origin (STORE-PILE-1 pad missed this)", () => {
    // * Hull ~3.315 + cart hz 1.13 ≈ 4.45. Old 0.9m pad ended at 4.3, so head-on was null.
    const b = computeWallKeepOutBounce(NOSE_ON, 0, -10, 0);
    expect(b).not.toBeNull();
    expect(b.depth).toBeGreaterThan(0);
    expect(b.depth).toBeLessThan(1);
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
    const midPad = computeWallKeepOutBounce(R + REACH / 2, 0, 0, 0);
    expect(atFace.depth).toBeCloseTo(1, 5);
    expect(midPad.depth).toBeCloseTo(0.5, 5);
    expect(atFace.accel).toBeGreaterThan(midPad.accel);
  });

  it("frees a stationary wedge — a motionless cart still gets pushed out", () => {
    // * This is the trap case: the cart is not moving, so no impact-driven term applies.
    const b = computeWallKeepOutBounce(R + 0.1, 0, 0, 0);
    expect(b.accel).toBeGreaterThan(0);
  });

  it("walk-out accel does not depend on inbound speed", () => {
    const px = R + 0.3;
    const hardCrash = computeWallKeepOutBounce(px, 0, -10, 0);
    const still = computeWallKeepOutBounce(px, 0, 0, 0);
    expect(hardCrash.accel).toBeCloseTo(still.accel, 5);
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
    // * At x=4.2: 0.8m outside zone A, but inside zone B (dist 1.8, radius 2.0). B is deeper.
    const b = computeWallKeepOutBounce(4.2, 0, 0, 0);
    expect(b.outX).toBeCloseTo(-1, 5); // pushed away from the zone at x=6
  });

  it("has a finite push at the exact center (no divide-by-zero)", () => {
    const b = computeWallKeepOutBounce(0, 0, 0, 0);
    expect(Number.isFinite(b.accel)).toBe(true);
    expect(Math.hypot(b.outX, b.outZ)).toBeCloseTo(1, 5);
  });
});

describe("resolveWallKeepOutDeltaV", () => {
  beforeEach(() => registerPileLevel());
  afterEach(() => setLevelHazards(null));

  it("strips this-frame inward drive at a nose-on 10 m/s hit without launching", () => {
    const b = computeWallKeepOutBounce(NOSE_ON, 0, -10, 0);
    const d = resolveWallKeepOutDeltaV(-10, 0, b, DT);
    const outward = d.dvx; // outX is +1 east of the pile
    expect(outward).toBeGreaterThan(0);
    expect(outward).toBeLessThanOrEqual(4);
    expect(Number.isFinite(outward)).toBe(true);
    // * Must not reverse 10 m/s — that would throw into a corner void.
    expect(outward).toBeLessThan(10);
  });

  it("strips more from a hard inward drive than from a nudge", () => {
    const b = computeWallKeepOutBounce(R + 0.3, 0, 0, 0);
    const hard = resolveWallKeepOutDeltaV(-10, 0, b, DT);
    const nudge = resolveWallKeepOutDeltaV(-2, 0, b, DT);
    const still = resolveWallKeepOutDeltaV(0, 0, b, DT);
    expect(hard.dvx).toBeGreaterThan(nudge.dvx);
    expect(nudge.dvx).toBeGreaterThan(still.dvx);
  });

  it("does not strip extra from a cart already driving away", () => {
    const b = computeWallKeepOutBounce(R + 0.3, 0, 0, 0);
    const leaving = resolveWallKeepOutDeltaV(+9, 0, b, DT);
    const still = resolveWallKeepOutDeltaV(0, 0, b, DT);
    expect(leaving.dvx).toBeCloseTo(still.dvx, 5);
  });

  it("caps outward Δv so a stacked dt cannot hole-feed", () => {
    const b = computeWallKeepOutBounce(R, 0, -20, 0);
    const d = resolveWallKeepOutDeltaV(-20, 0, b, 0.25);
    expect(d.dvx).toBeLessThanOrEqual(4);
  });
});
