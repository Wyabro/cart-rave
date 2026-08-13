import { describe, it, expect } from "vitest";
import {
  NPC_NAME_POOL,
  NPC_NAME_PERSONALITY,
  NPC_PERSONALITY_ORDER,
  drawNpcNamesByPersonality,
  rotateNpcPersonalityOrder,
} from "../shared/npcNames.js";
import { PERSONALITY_META } from "../src/npcNames.js";

describe("NPC_NAME_PERSONALITY drift", () => {
  it("maps every pool name to one of the four types", () => {
    const types = new Set(NPC_PERSONALITY_ORDER);
    expect(NPC_PERSONALITY_ORDER).toEqual(["aggressor", "lurker", "scavenger", "chaotic"]);
    expect(Object.keys(PERSONALITY_META)).toEqual([...NPC_PERSONALITY_ORDER]);
    expect(Object.keys(NPC_NAME_PERSONALITY).sort()).toEqual([...NPC_NAME_POOL].sort());
    for (const name of NPC_NAME_POOL) {
      expect(types.has(NPC_NAME_PERSONALITY[name])).toBe(true);
    }
  });
});

describe("drawNpcNamesByPersonality", () => {
  it("returns distinct personalities and no duplicate names, and honors order", () => {
    const order = ["chaotic", "lurker", "aggressor", "scavenger"];
    const names = drawNpcNamesByPersonality(order, () => 0.999);
    expect(names).toHaveLength(4);
    expect(new Set(names).size).toBe(4);
    expect(names.map((name) => NPC_NAME_PERSONALITY[name])).toEqual(order);
  });
});

describe("rotateNpcPersonalityOrder", () => {
  it("puts the omitted type first and keeps cyclic order", () => {
    expect(rotateNpcPersonalityOrder(0)).toEqual([...NPC_PERSONALITY_ORDER]);
    expect(rotateNpcPersonalityOrder(1)).toEqual([
      "lurker",
      "scavenger",
      "chaotic",
      "aggressor",
    ]);
    expect(rotateNpcPersonalityOrder(Number.NaN)[0]).toBe(NPC_PERSONALITY_ORDER[0]);
  });
});
