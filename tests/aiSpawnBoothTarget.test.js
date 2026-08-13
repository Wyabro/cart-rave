// @vitest-environment happy-dom
// aiSpawnBoothTarget.test.js — NPC-BOOTH-TARGET-1
//
// NPCs must not chase a human who is still on a spawn booth. Height alone is
// not the booth test: Night Shift high roofs sit above platformY - 0.5.

import { describe, it, expect } from "vitest";
import { CONFIG } from "../src/config.js";
import {
  isOnSpawnBooth,
  findNearestHumanTarget,
} from "../src/simulation.js";

const FLOOR_NPC = { x: 0, y: 0, z: 0 };

function humanCart(pos) {
  return {
    body: {
      translation: () => ({ ...pos }),
      linvel: () => ({ x: 0, y: 0, z: 0 }),
    },
    respawnAtMs: null,
    isSuddenDeathSpectator: false,
  };
}

const SOLO_SLOTS = [
  { kind: "human", connId: "p1" },
  { kind: "npc", connId: null },
  { kind: "npc", connId: null },
  { kind: "npc", connId: null },
];

function boothPos() {
  return { x: CONFIG.cart.spawnRingRadius, y: 5, z: 0 };
}

describe("isOnSpawnBooth", () => {
  it("is true for a cart on the booth deck", () => {
    expect(isOnSpawnBooth(boothPos())).toBe(true);
    expect(isOnSpawnBooth({ x: 0, y: 5, z: 0 })).toBe(false);
    expect(isOnSpawnBooth({ x: 0, y: 0, z: 0 })).toBe(false);
    expect(isOnSpawnBooth({ ...boothPos(), y: 3.5 })).toBe(false);
  });

  it("is false on a Night Shift high roof (elevated, inside the ring)", () => {
    expect(isOnSpawnBooth({ x: 23, y: 4, z: 0 })).toBe(false);
  });
});

describe("findNearestHumanTarget — booth skip", () => {
  it("returns null while the only human sits on a booth", () => {
    const carts = [humanCart(boothPos()), null, null, null];
    expect(findNearestHumanTarget(FLOOR_NPC, carts, SOLO_SLOTS)).toBeNull();
  });

  it("returns a target for a human on the floor", () => {
    const carts = [humanCart({ x: 10, y: 0, z: 0 }), null, null, null];
    expect(findNearestHumanTarget(FLOOR_NPC, carts, SOLO_SLOTS)).not.toBeNull();
  });

  it("still chases a human on a Night Shift high roof", () => {
    const carts = [humanCart({ x: 23, y: 4, z: 0 }), null, null, null];
    expect(findNearestHumanTarget(FLOOR_NPC, carts, SOLO_SLOTS)).not.toBeNull();
  });
});
