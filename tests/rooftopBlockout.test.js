import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { CONFIG, computeSpawnRingRadius } from "../src/config.js";
import {
  getNightShiftBlockoutHazards,
  NIGHT_SHIFT_BLOCKOUT_LAYOUT,
} from "../src/levels/rooftop.js";

describe("Night Shift blockout", () => {
  it("keeps every cardinal spawn on the central cross, not over a corner void", () => {
    const radius = computeSpawnRingRadius(CONFIG);
    expect(radius).toBeLessThan(36);

    const spawns = [
      { x: radius, z: 0 }, { x: -radius, z: 0 },
      { x: 0, z: radius }, { x: 0, z: -radius },
    ];
    const hazards = getNightShiftBlockoutHazards();
    for (const spawn of spawns) {
      for (const hole of hazards.squareHoles) {
        const insideHole =
          Math.abs(spawn.x - hole.x) < hazards.half
          && Math.abs(spawn.z - hole.z) < hazards.half;
        expect(insideHole).toBe(false);
      }
    }
  });

  it("uses four AI-visible voids without Storerooms suction", () => {
    const hazards = getNightShiftBlockoutHazards();
    expect(hazards.squareHoles).toHaveLength(4);
    expect(hazards.suctionBand).toBeUndefined();
    expect(hazards.arenaHalf).toBe(36);
  });

  it("reserves two elevated roofs and three inactive AC markers for later cards", () => {
    expect(NIGHT_SHIFT_BLOCKOUT_LAYOUT.highRoofs).toHaveLength(2);
    expect(NIGHT_SHIFT_BLOCKOUT_LAYOUT.inactiveVentMarkers).toHaveLength(3);

    const hazards = getNightShiftBlockoutHazards();
    for (const roof of NIGHT_SHIFT_BLOCKOUT_LAYOUT.highRoofs) {
      for (const hole of hazards.squareHoles) {
        const insideHole =
          Math.abs(roof.x - hole.x) < hazards.half
          && Math.abs(roof.z - hole.z) < hazards.half;
        expect(insideHole).toBe(false);
      }
    }
  });

  it("keeps elevated roofs as future AC-launch targets, not driveable ramps", () => {
    const source = readFileSync(new URL("../src/levels/rooftop.js", import.meta.url), "utf8");
    expect(source).not.toContain("addRamp(");
    expect(source).not.toContain("RAMP_");
  });
});
