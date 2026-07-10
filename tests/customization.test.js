// @vitest-environment happy-dom
//
// Regression tests for savePlayerCustomization partial saves.
// * Bug (Stability Pass 1): sunglasses/pattern-only saves omitted colorMode, which
// * silently downgraded custom-hue players to preset — and since the stored color id
// * "custom" is not in PALETTE, the body color collapsed to PALETTE[0] (pink/magenta).
// * Unlock gates are open here: vitest runs with import.meta.env.DEV, so
// * isDevUnlockAll() in unlockStore returns true and the clamp passes custom through.

import { describe, it, expect, beforeEach } from "vitest";
import {
  savePlayerCustomization,
  loadPlayerCustomization,
  invalidateCustomizationCache,
  CUSTOM_COLOR_ID,
} from "../src/customization.js";
import { PALETTE } from "../src/config.js";

beforeEach(() => {
  localStorage.clear();
  invalidateCustomizationCache();
});

describe("savePlayerCustomization partial saves", () => {
  it("keeps custom color mode when only the sunglasses style changes", () => {
    savePlayerCustomization({ colorMode: "custom", customHue: 140 });

    savePlayerCustomization({ sunglassesStyle: "goldMirror" });

    const saved = loadPlayerCustomization();
    expect(saved.colorMode).toBe("custom");
    expect(saved.color).toBe(CUSTOM_COLOR_ID);
    expect(saved.customHue).toBe(140);
    expect(saved.sunglassesStyle).toBe("goldMirror");
  });

  it("keeps custom color mode when only the pattern changes", () => {
    savePlayerCustomization({ colorMode: "custom", customHue: 200 });

    savePlayerCustomization({ pattern: "stripes" });

    const saved = loadPlayerCustomization();
    expect(saved.colorMode).toBe("custom");
    expect(saved.color).toBe(CUSTOM_COLOR_ID);
    expect(saved.customHue).toBe(200);
    expect(saved.pattern).toBe("stripes");
  });

  it("does not collapse a custom hue to the default magenta on partial save", () => {
    savePlayerCustomization({ colorMode: "custom", customHue: 140 });
    const before = loadPlayerCustomization();

    savePlayerCustomization({ sunglassesStyle: "blueMirror" });

    const after = loadPlayerCustomization();
    expect(after.hex).toBe(before.hex);
    expect(after.color).not.toBe(PALETTE[0]);
  });

  it("keeps preset color across a sunglasses-only save", () => {
    const presetColor = PALETTE[1];
    savePlayerCustomization({ colorMode: "preset", color: presetColor });

    savePlayerCustomization({ sunglassesStyle: "redMirror" });

    const saved = loadPlayerCustomization();
    expect(saved.colorMode).toBe("preset");
    expect(saved.color).toBe(presetColor);
  });

  it("still honors an explicit switch back to preset mode", () => {
    savePlayerCustomization({ colorMode: "custom", customHue: 90 });

    savePlayerCustomization({ colorMode: "preset", color: PALETTE[2] });

    const saved = loadPlayerCustomization();
    expect(saved.colorMode).toBe("preset");
    expect(saved.color).toBe(PALETTE[2]);
  });
});
