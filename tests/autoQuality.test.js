import { describe, expect, it, beforeEach } from "vitest";
import { tickAutoQuality, resetAutoQualityForTests } from "../src/utils/autoQuality.js";
import {
  getSessionQualityTierOverride,
  setSessionQualityTier,
  stepDownQualityTier,
} from "../src/utils/qualityMode.js";
import {
  getSessionRenderScaleMul,
  resetSessionRenderScaleForTests,
} from "../src/utils/qualityTiers.js";

describe("tickAutoQuality", () => {
  beforeEach(() => {
    resetAutoQualityForTests();
    resetSessionRenderScaleForTests();
    setSessionQualityTier(null);
  });

  it("does not step down on healthy frames", () => {
    let now = 1000;
    for (let i = 0; i < 200; i += 1) {
      tickAutoQuality(0.016, now);
      now += 16;
    }
    expect(getSessionQualityTierOverride()).toBe(null);
  });

  it("steps down one tier after sustained bad p95 windows", () => {
    let now = 1000;
    let stepped = false;
    for (let i = 0; i < 400; i += 1) {
      // * ~33ms frames (~30fps) well above 22ms p95 threshold
      if (tickAutoQuality(0.033, now)) stepped = true;
      now += 33;
      if (stepped) break;
    }
    expect(stepped).toBe(true);
    // * Default tier is high (no touch, no persisted setting in tests) → first step lands on medium.
    expect(getSessionQualityTierOverride()).toBe("medium");
  });

  it("steps tiers twice then render scale twice on a chronically slow machine", () => {
    let now = 1000;
    let count = 0;
    for (let i = 0; i < 2000; i += 1) {
      if (tickAutoQuality(0.04, now)) count += 1;
      now += 40;
    }
    // * high→medium→low tier steps, then the run-6 below-floor relief valve:
    // * renderScale ×0.85 → ×0.7, and nothing further.
    expect(count).toBe(4);
    expect(getSessionQualityTierOverride()).toBe("low");
    expect(getSessionRenderScaleMul()).toBe(0.7);
  });

  it("at the LOW floor, steps render scale instead of tiers (run-6)", () => {
    setSessionQualityTier("low");
    let now = 1000;
    let steps = 0;
    for (let i = 0; i < 400 && steps === 0; i += 1) {
      if (tickAutoQuality(0.04, now)) steps += 1;
      now += 40;
    }
    expect(steps).toBe(1);
    expect(getSessionQualityTierOverride()).toBe("low");
    expect(getSessionRenderScaleMul()).toBe(0.85);
  });

  it("stops entirely once the render-scale floor is exhausted", () => {
    setSessionQualityTier("low");
    let now = 1000;
    let count = 0;
    for (let i = 0; i < 2000; i += 1) {
      if (tickAutoQuality(0.04, now)) count += 1;
      now += 40;
    }
    expect(count).toBe(2);
    expect(getSessionRenderScaleMul()).toBe(0.7);
  });
});

describe("stepDownQualityTier", () => {
  it("walks high→medium→low→null", () => {
    expect(stepDownQualityTier("high")).toBe("medium");
    expect(stepDownQualityTier("medium")).toBe("low");
    expect(stepDownQualityTier("low")).toBe(null);
  });
});
