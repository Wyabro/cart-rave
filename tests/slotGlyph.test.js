import { describe, it, expect } from "vitest";
import { SLOT_GLYPHS, slotGlyphForIndex, emblemForSlot } from "../src/npcNames.js";

describe("slotGlyphForIndex", () => {
  it("returns one distinct icon per slot", () => {
    const seen = new Set();
    for (let i = 0; i < 4; i += 1) {
      const glyph = slotGlyphForIndex(i);
      expect(glyph).not.toBeNull();
      expect(seen.has(glyph.icon)).toBe(false);
      seen.add(glyph.icon);
      expect(glyph.label).toBeTruthy();
    }
    expect(seen.size).toBe(4);
  });

  it("the four icons are the documented shape set", () => {
    expect(SLOT_GLYPHS.map((g) => g.icon)).toEqual(["slot0", "slot1", "slot2", "slot3"]);
  });

  it("returns null for out-of-range or non-integer indices", () => {
    expect(slotGlyphForIndex(-1)).toBeNull();
    expect(slotGlyphForIndex(4)).toBeNull();
    expect(slotGlyphForIndex(null)).toBeNull();
    expect(slotGlyphForIndex(undefined)).toBeNull();
    expect(slotGlyphForIndex(1.5)).toBeNull();
    expect(slotGlyphForIndex("1")).toBeNull();
  });
});

describe("emblemForSlot — the resolver slot glyphs pair with", () => {
  it("humans get the shopper emblem, NPCs a personality emblem, empty nothing", () => {
    expect(emblemForSlot({ kind: "human", color: 0xff00ff }).icon).toBe("shopper");
    expect(emblemForSlot({ kind: "npc", name: "WheelSnipe" }).icon).toBe("aggressor");
    expect(emblemForSlot(null)).toBeNull();
  });
});
