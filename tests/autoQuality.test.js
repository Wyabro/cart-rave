import { describe, expect, it, beforeEach } from "vitest";
import { tickAutoQuality, resetAutoQualityForTests } from "../src/utils/autoQuality.js";
import {
  getSessionQualityTierOverride,
  setSessionQualityTier,
  stepDownQualityTier,
} from "../src/utils/qualityMode.js";

describe("tickAutoQuality", () => {
  beforeEach(() => {
    resetAutoQualityForTests();
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

  it("steps at most twice, ending at low", () => {
    let now = 1000;
    let count = 0;
    for (let i = 0; i < 2000; i += 1) {
      if (tickAutoQuality(0.04, now)) count += 1;
      now += 40;
    }
    expect(count).toBe(2);
    expect(getSessionQualityTierOverride()).toBe("low");
  });

  it("does nothing once the session tier is low", () => {
    setSessionQualityTier("low");
    let now = 1000;
    let stepped = false;
    for (let i = 0; i < 400; i += 1) {
      if (tickAutoQuality(0.04, now)) stepped = true;
      now += 40;
    }
    expect(stepped).toBe(false);
    expect(getSessionQualityTierOverride()).toBe("low");
  });
});

describe("stepDownQualityTier", () => {
  it("walks high→medium→low→null", () => {
    expect(stepDownQualityTier("high")).toBe("medium");
    expect(stepDownQualityTier("medium")).toBe("low");
    expect(stepDownQualityTier("low")).toBe(null);
  });
});
