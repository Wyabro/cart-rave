import { describe, expect, it } from "vitest";
import { QUALITY_KNOBS } from "../src/utils/qualityTiers.js";

describe("QUALITY_KNOBS potato scaling", () => {
  it("low bypasses composer and kills lasers/reflector", () => {
    const k = QUALITY_KNOBS.low;
    expect(k.composerBypass).toBe(true);
    expect(k.postFx).toBe(false);
    expect(k.reflector).toBe(false);
    expect(k.laserBudget).toBe("off");
    expect(k.extrasLasers).toBe(false);
    expect(k.pixelRatioCap).toBe(1);
    expect(k.maxSubsteps).toBe(2);
  });

  it("medium is the iGPU tier: lean fill, core lasers, no reflector", () => {
    const k = QUALITY_KNOBS.medium;
    expect(k.reflector).toBe(false);
    expect(k.composerBypass).toBe(false);
    expect(k.postFx).toBe(true);
    expect(k.laserBudget).toBe("core");
    expect(k.extrasLasers).toBe(true);
    expect(k.pixelRatioCap).toBeLessThanOrEqual(1.25);
    expect(k.crowdCount).toBeLessThan(5000);
    expect(k.ceilingSpots).toBeLessThan(QUALITY_KNOBS.high.ceilingSpots);
  });

  it("high keeps full personality knobs for discrete GPUs", () => {
    const k = QUALITY_KNOBS.high;
    expect(k.reflector).toBe(true);
    expect(k.laserBudget).toBe("full");
    expect(k.crowdCount).toBe(Infinity);
    expect(k.pixelRatioCap).toBe(2);
    expect(k.ceilingSpots).toBe(8);
    expect(k.postFx).toBe(true);
  });

  it("tiers only step down on cost axes (low ≤ medium ≤ high)", () => {
    expect(QUALITY_KNOBS.low.pixelRatioCap).toBeLessThanOrEqual(QUALITY_KNOBS.medium.pixelRatioCap);
    expect(QUALITY_KNOBS.medium.pixelRatioCap).toBeLessThanOrEqual(QUALITY_KNOBS.high.pixelRatioCap);
    expect(QUALITY_KNOBS.low.dustMul).toBeLessThanOrEqual(QUALITY_KNOBS.medium.dustMul);
    expect(QUALITY_KNOBS.medium.dustMul).toBeLessThanOrEqual(QUALITY_KNOBS.high.dustMul);
    expect(QUALITY_KNOBS.low.streakCap).toBeLessThanOrEqual(QUALITY_KNOBS.medium.streakCap);
    expect(QUALITY_KNOBS.medium.streakCap).toBeLessThanOrEqual(QUALITY_KNOBS.high.streakCap);
  });
});
