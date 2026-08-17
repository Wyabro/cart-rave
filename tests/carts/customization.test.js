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
  hueToNeonCss,
  resolveCartNeonHex,
  resolveCartPatternForSlot,
  resolveCartSunglassesStyleForSlot,
} from "../../src/carts/customization.js";
import { CART_COLORS, PALETTE } from "../../src/config.js";
import { CART_PATTERN_IDS, DEFAULT_CART_PATTERN } from "../../src/carts/cartPatternConfig.js";
import { DEFAULT_SUNGLASSES_STYLE } from "../../src/carts/cartThemeConfig.js";

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

  it("keeps NPC pattern rolls peer-stable and makes every pattern reachable", () => {
    const results = new Set();
    for (let i = 0; i < 256; i += 1) {
      const slot = { kind: "npc", name: `BOT_PATTERN_${i}` };
      const first = resolveCartPatternForSlot(slot, { youConnId: "me" });
      expect(resolveCartPatternForSlot(slot, { youConnId: "me" })).toBe(first);
      results.add(first);
    }
    expect(results).toEqual(new Set(CART_PATTERN_IDS));
  });

  it("keeps the historical dots id when Maze is selected and reloaded", () => {
    savePlayerCustomization({ pattern: "dots" });
    expect(loadPlayerCustomization().pattern).toBe("dots");
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

describe("CART-HUE-RED-1 custom red snap", () => {
  const SNAP = "#ff2233";
  // * RAVE_GLTF_BODY_TINT_SCALE in cartRaveGltf.js — spectral 0xff0000 * 0.72 is #b80000 (b=0).
  const BODY_TINT_SCALE = 0.72;

  function cssToRgb(css) {
    const n = parseInt(css.slice(1), 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }

  it("snaps hue 0 and 360 to the crimson end", () => {
    expect(hueToNeonCss(0)).toBe(SNAP);
    expect(hueToNeonCss(360)).toBe(SNAP);
  });

  it("snaps 14° and leaves 15° on the HSL ramp", () => {
    expect(hueToNeonCss(14)).toBe(SNAP);
    expect(hueToNeonCss(15)).not.toBe(SNAP);
  });

  it("uses a non-spectral snap (g > 0.1, b > 0.15)", () => {
    const { g, b } = cssToRgb(hueToNeonCss(0));
    expect(g / 255).toBeGreaterThan(0.1);
    expect(b / 255).toBeGreaterThan(0.15);
  });

  it("keeps blue after the 0.72 body tint that zeroed spectral red", () => {
    const { r, g, b } = cssToRgb(hueToNeonCss(0));
    const tintedB = Math.round(b * BODY_TINT_SCALE);
    const tintedG = Math.round(g * BODY_TINT_SCALE);
    const tintedR = Math.round(r * BODY_TINT_SCALE);
    expect(tintedB).toBeGreaterThan(0);
    expect(tintedR).toBeGreaterThan(tintedG);
    expect(tintedR).toBeGreaterThan(tintedB);
  });
});
