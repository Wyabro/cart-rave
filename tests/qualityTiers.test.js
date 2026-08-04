import { beforeEach, describe, expect, it } from "vitest";
import {
  QUALITY_KNOBS,
  effectivePixelRatio,
  resetSessionRenderScaleForTests,
} from "../src/utils/qualityTiers.js";

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

  it("PERF-PASS-1: low drops the pit fill lights, medium/high keep them", () => {
    expect(QUALITY_KNOBS.low.arenaFillLights).toBe(false);
    expect(QUALITY_KNOBS.medium.arenaFillLights).toBe(true);
    expect(QUALITY_KNOBS.high.arenaFillLights).toBe(true);
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

describe("effectivePixelRatio software long-edge cap", () => {
  beforeEach(() => {
    resetSessionRenderScaleForTests();
    // * No window in this env → effectivePixelRatio defaults dpr to 1; min(1, cap 1) = 1,
    // * so the LOW base is 0.75 without any window stubbing.
  });

  it("leaves a real GPU untouched: no cap when software is inactive", () => {
    // * Big 2560-wide display, LOW knobs, hardware renderer → tier formula only.
    const pr = effectivePixelRatio(2560, 1271, false, QUALITY_KNOBS.low);
    expect(pr).toBeCloseTo(0.75, 5); // min(1,1) × 0.75 × 1
  });

  it("caps the drawing buffer to a fixed long edge on a big software display", () => {
    // * The Hawaii case: 2560-wide, no GPU driver. Base would be 0.75 (→1920px);
    // * the 720px long-edge floor pins it to 720/2560 regardless of tier.
    const pr = effectivePixelRatio(2560, 1271, true, QUALITY_KNOBS.low);
    expect(pr).toBeCloseTo(720 / 2560, 5);
    expect(2560 * pr).toBeCloseTo(720, 3); // buffer long edge ≈ 720px
  });

  it("never upscales: on a small software display the tier base still wins", () => {
    // * 640-wide window → cap would be 720/640 = 1.125 > 0.75; base must win.
    const pr = effectivePixelRatio(640, 360, true, QUALITY_KNOBS.low);
    expect(pr).toBeCloseTo(0.75, 5);
  });

  it("uses the larger edge (portrait windows cap on height)", () => {
    const pr = effectivePixelRatio(720, 1600, true, QUALITY_KNOBS.low);
    expect(pr).toBeCloseTo(720 / 1600, 5);
  });
});
