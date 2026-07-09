import { describe, expect, it, beforeEach } from "vitest";
import { tickAutoQuality, resetAutoQualityForTests } from "../src/utils/autoQuality.js";
import { getSessionLowQualityOverride, setSessionLowQuality } from "../src/utils/qualityMode.js";

describe("tickAutoQuality", () => {
  beforeEach(() => {
    resetAutoQualityForTests();
    setSessionLowQuality(null);
  });

  it("does not step down on healthy frames", () => {
    let now = 1000;
    for (let i = 0; i < 200; i += 1) {
      tickAutoQuality(0.016, now);
      now += 16;
    }
    expect(getSessionLowQualityOverride()).not.toBe(true);
  });

  it("steps down after sustained bad p95 windows", () => {
    let now = 1000;
    let stepped = false;
    for (let i = 0; i < 400; i += 1) {
      // * ~33ms frames (~30fps) well above 22ms p95 threshold
      if (tickAutoQuality(0.033, now)) stepped = true;
      now += 33;
    }
    expect(stepped).toBe(true);
    expect(getSessionLowQualityOverride()).toBe(true);
  });

  it("only steps down once", () => {
    let now = 1000;
    let count = 0;
    for (let i = 0; i < 500; i += 1) {
      if (tickAutoQuality(0.04, now)) count += 1;
      now += 40;
    }
    expect(count).toBe(1);
  });
});
