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
  resolveCartNeonHex,
  resolveCartPatternForSlot,
  resolveCartSunglassesStyleForSlot,
} from "../src/carts/customization.js";
import { CART_COLORS, PALETTE } from "../src/config.js";
import { DEFAULT_CART_PATTERN } from "../src/carts/cartPatternConfig.js";
import { DEFAULT_SUNGLASSES_STYLE } from "../src/carts/cartThemeConfig.js";

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

// lookHex: null must not coerce to 0x000000 (Number(null) === 0) — recycled human
// seats leave lookHex null until color_pick arrives; fall through to CART_COLORS.
describe("resolveCartNeonHex — null lookHex", () => {
  it("falls through to palette color when remote human lookHex is null", () => {
    const slot = { kind: "human", connId: "peer", color: "blue", lookHex: null };
    expect(resolveCartNeonHex(slot, { youConnId: "me" })).toBe(CART_COLORS.blue.hex);
  });

  it("falls through when lookHex is absent or empty string", () => {
    const absent = { kind: "human", connId: "peer", color: "green" };
    const empty = { kind: "human", connId: "peer", color: "green", lookHex: "" };
    expect(resolveCartNeonHex(absent, { youConnId: "me" })).toBe(CART_COLORS.green.hex);
    expect(resolveCartNeonHex(empty, { youConnId: "me" })).toBe(CART_COLORS.green.hex);
  });

  it("still honors an explicit zero lookHex as pure black", () => {
    const slot = { kind: "human", connId: "peer", color: "blue", lookHex: 0 };
    expect(resolveCartNeonHex(slot, { youConnId: "me" })).toBe(0);
  });
});

// NET-LOOK-ACC-1: remote humans render the server-synced slot.patternId /
// slot.sunglassesStyle instead of a hardcoded default.
describe("resolveCartPatternForSlot", () => {
  it("uses the remote slot's synced patternId", () => {
    const slot = { kind: "human", connId: "peer", patternId: "stripes" };
    expect(resolveCartPatternForSlot(slot, { youConnId: "me" })).toBe("stripes");
  });

  it("falls back to the default for a garbage patternId", () => {
    const slot = { kind: "human", connId: "peer", patternId: "not-a-real-pattern" };
    expect(resolveCartPatternForSlot(slot, { youConnId: "me" })).toBe(DEFAULT_CART_PATTERN);
  });

  it("falls back to the default when patternId is absent", () => {
    const slot = { kind: "human", connId: "peer" };
    expect(resolveCartPatternForSlot(slot, { youConnId: "me" })).toBe(DEFAULT_CART_PATTERN);
  });

  it("still reads the local human's saved pattern, not the slot field", () => {
    savePlayerCustomization({ pattern: "checker" });
    const slot = { kind: "human", connId: "me", patternId: "stripes" };
    expect(resolveCartPatternForSlot(slot, { youConnId: "me" })).toBe("checker");
  });

  it("still name-seeds NPCs regardless of any patternId field", () => {
    const slot = { kind: "npc", name: "BOT_A", patternId: "stripes" };
    const result = resolveCartPatternForSlot(slot, { youConnId: "me" });
    expect(typeof result).toBe("string");
    expect(result).not.toBe("stripes");
  });
});

describe("resolveCartSunglassesStyleForSlot", () => {
  it("uses the remote slot's synced sunglassesStyle", () => {
    const slot = { kind: "human", connId: "peer", sunglassesStyle: "goldMirror" };
    expect(resolveCartSunglassesStyleForSlot(slot, { youConnId: "me" })).toBe("goldMirror");
  });

  it("falls back to the default for a garbage sunglassesStyle", () => {
    const slot = { kind: "human", connId: "peer", sunglassesStyle: "not-a-real-style" };
    expect(resolveCartSunglassesStyleForSlot(slot, { youConnId: "me" })).toBe(DEFAULT_SUNGLASSES_STYLE);
  });

  it("falls back to the default when sunglassesStyle is absent", () => {
    const slot = { kind: "human", connId: "peer" };
    expect(resolveCartSunglassesStyleForSlot(slot, { youConnId: "me" })).toBe(DEFAULT_SUNGLASSES_STYLE);
  });

  it("still reads the local human's saved style, not the slot field", () => {
    savePlayerCustomization({ sunglassesStyle: "blueMirror" });
    const slot = { kind: "human", connId: "me", sunglassesStyle: "goldMirror" };
    expect(resolveCartSunglassesStyleForSlot(slot, { youConnId: "me" })).toBe("blueMirror");
  });

  it("still name-seeds NPCs regardless of any sunglassesStyle field", () => {
    const slot = { kind: "npc", name: "BOT_A", sunglassesStyle: "goldMirror" };
    const result = resolveCartSunglassesStyleForSlot(slot, { youConnId: "me" });
    expect(typeof result).toBe("string");
  });
});
