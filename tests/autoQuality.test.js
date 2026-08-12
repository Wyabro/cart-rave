import { describe, expect, it, beforeEach } from "vitest";
import {
  tickAutoQuality,
  resetAutoQualityForTests,
  noteModeEntryShown,
  noteModeEntryHidden,
  isAutoQualityEntrySuppressed,
  ENTRY_QUALITY_GRACE_MS,
} from "../src/utils/autoQuality.js";
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
    // * Default tier is high (no touch, no persisted setting in tests) → first step lands on high-lite.
    expect(getSessionQualityTierOverride()).toBe("high-lite");
  });

  it("steps tiers thrice then render scale twice on a chronically slow machine", () => {
    let now = 1000;
    let count = 0;
    for (let i = 0; i < 2000; i += 1) {
      if (tickAutoQuality(0.04, now)) count += 1;
      now += 40;
    }
    // * high→high-lite→medium→low tier steps, then the run-6 below-floor relief valve:
    // * renderScale ×0.85 → ×0.7, and nothing further.
    expect(count).toBe(5);
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

  it("ATTRACT-JANK-1: a 1.25fps feed never demotes, however bad one old frame was", () => {
    // * cap-287 shape: reduced-motion attract renders every 800ms, so 20 samples span
    // * ~16s. One 97.8ms boot-tail frame followed by healthy 3-6ms frames used to carry
    // * a p95 of 24.7 into a demotion 16s after the spike was over.
    setSessionQualityTier("low");
    let now = 20_000;
    let stepped = false;
    // * The boot tail: a handful of genuinely expensive frames, then an idle menu.
    for (let i = 0; i < 5; i += 1) {
      tickAutoQuality(0.04, now, "attract");
      now += 816;
    }
    for (let i = 0; i < 200; i += 1) {
      if (tickAutoQuality(0.005, now, "attract")) stepped = true;
      now += 816;
    }
    expect(stepped).toBe(false);
    expect(getSessionRenderScaleMul()).toBe(1);
  });

  it("ATTRACT-JANK-1: ageing out samples does NOT silence a genuinely slow machine", () => {
    // * The guard must key on feed rate, not on badness — a 5fps in-game feed is 20
    // * samples in 4s, still inside SAMPLE_MAX_AGE_MS, and those machines are exactly
    // * the ones the watchdog exists for.
    let now = 1000;
    let stepped = false;
    for (let i = 0; i < 400; i += 1) {
      if (tickAutoQuality(0.2, now, "game")) stepped = true;
      now += 200;
      if (stepped) break;
    }
    expect(stepped).toBe(true);
    expect(getSessionQualityTierOverride()).toBe("high-lite");
  });

  it("ATTRACT-JANK-1: a spike still demotes while it is CURRENT", () => {
    // * The complement of the two above — the fix drops stale samples, not bad ones.
    setSessionQualityTier("low");
    let now = 5000;
    let stepped = false;
    for (let i = 0; i < 400; i += 1) {
      if (tickAutoQuality(0.03, now, "attract")) stepped = true;
      now += 30;
      if (stepped) break;
    }
    expect(stepped).toBe(true);
    expect(getSessionRenderScaleMul()).toBe(0.85);
  });

  it("FV-LOAD-1b: suppresses demotion during mode-entry + post-entry grace", () => {
    const t0 = 10_000;
    noteModeEntryShown();
    expect(isAutoQualityEntrySuppressed(t0)).toBe(true);
    let stepped = false;
    for (let i = 0; i < 400; i += 1) {
      if (tickAutoQuality(0.04, t0 + i * 40)) stepped = true;
    }
    expect(stepped).toBe(false);
    expect(getSessionQualityTierOverride()).toBe(null);

    noteModeEntryHidden(t0 + 20_000);
    const graceStart = t0 + 20_000;
    // * Still suppressed inside the 2s grace even with terrible frames.
    stepped = false;
    for (let i = 0; i < 50; i += 1) {
      const now = graceStart + i * 20;
      if (now >= graceStart + ENTRY_QUALITY_GRACE_MS) break;
      if (tickAutoQuality(0.05, now)) stepped = true;
    }
    expect(stepped).toBe(false);
    expect(isAutoQualityEntrySuppressed(graceStart + ENTRY_QUALITY_GRACE_MS - 1)).toBe(true);
  });

  it("FV-LOAD-1b: sustained bad frames after grace still demote", () => {
    const t0 = 50_000;
    noteModeEntryShown();
    noteModeEntryHidden(t0);
    // * Poison the ring during grace — must not demote, and must clear at grace end.
    for (let i = 0; i < 100; i += 1) {
      tickAutoQuality(0.05, t0 + i * 16);
    }
    expect(getSessionQualityTierOverride()).toBe(null);

    let now = t0 + ENTRY_QUALITY_GRACE_MS + 1;
    let stepped = false;
    for (let i = 0; i < 400; i += 1) {
      if (tickAutoQuality(0.04, now)) stepped = true;
      now += 40;
      if (stepped) break;
    }
    expect(stepped).toBe(true);
    expect(getSessionQualityTierOverride()).toBe("high-lite");
  });
});

describe("stepDownQualityTier", () => {
  it("walks high→high-lite→medium→low→null", () => {
    expect(stepDownQualityTier("high")).toBe("high-lite");
    expect(stepDownQualityTier("high-lite")).toBe("medium");
    expect(stepDownQualityTier("medium")).toBe("low");
    expect(stepDownQualityTier("low")).toBe(null);
  });
});
