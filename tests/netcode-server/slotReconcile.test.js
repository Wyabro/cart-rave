// slotReconcile.test.js — orphan humans, NPC seat pick, free palette color.

import { describe, expect, it } from "vitest";
import {
  findNpcSlotForHuman,
  listOrphanHumanConnIds,
  nextFreePaletteColor,
} from "../../party/slotReconcile.ts";

const PALETTE = ["pink", "blue", "green", "yellow", "neonOrange"];

describe("listOrphanHumanConnIds", () => {
  it("returns empty for null slots", () => {
    expect(listOrphanHumanConnIds(null, new Set(["a"]))).toEqual([]);
  });

  it("lists human connIds not in the live set", () => {
    const slots = [
      { connId: "live", kind: "human", color: "pink" },
      { connId: "dead", kind: "human", color: "blue" },
      { connId: null, kind: "npc", color: "green" },
    ];
    expect(listOrphanHumanConnIds(slots, new Set(["live"]))).toEqual(["dead"]);
  });

  it("ignores NPC slots", () => {
    const slots = [{ connId: "x", kind: "npc", color: "pink" }];
    expect(listOrphanHumanConnIds(slots, new Set())).toEqual([]);
  });
});

describe("findNpcSlotForHuman", () => {
  const slots = [
    { kind: "human", color: "pink", connId: "h" },
    { kind: "npc", color: "blue", connId: null },
    { kind: "npc", color: "green", connId: null },
  ];

  it("prefers the NPC holding the preferred color", () => {
    expect(findNpcSlotForHuman(slots, "green")?.color).toBe("green");
  });

  it("falls back to the first NPC when preferred color is missing", () => {
    expect(findNpcSlotForHuman(slots, "yellow")?.color).toBe("blue");
  });

  it("falls back to the first NPC when no preference is given", () => {
    expect(findNpcSlotForHuman(slots)?.color).toBe("blue");
  });

  it("returns undefined when no NPC remains", () => {
    expect(findNpcSlotForHuman([{ kind: "human", color: "pink" }])).toBeUndefined();
  });
});

describe("nextFreePaletteColor", () => {
  it("can keep the converting slot's own color when it is free among others", () => {
    const slots = [
      { color: "pink" },
      { color: "blue" },
      { color: "green" },
    ];
    // Excluding blue removes it from "used" → first free palette entry is blue.
    expect(nextFreePaletteColor(slots, slots[1], PALETTE)).toBe("blue");
  });

  it("picks the first palette color not used by other slots", () => {
    const converting = { color: "neonOrange" };
    const slots = [
      { color: "pink" },
      { color: "blue" },
      { color: "green" },
      converting,
    ];
    expect(nextFreePaletteColor(slots, converting, PALETTE)).toBe("yellow");
  });

  it("keeps the exclude slot's color when the palette is exhausted", () => {
    const slots = PALETTE.map((color) => ({ color }));
    expect(nextFreePaletteColor(slots, slots[0], PALETTE)).toBe("pink");
  });
});
