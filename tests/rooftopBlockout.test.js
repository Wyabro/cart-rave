import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { CONFIG, computeSpawnRingRadius } from "../src/config.js";
import {
  getNightShiftBlockoutHazards,
  getNightShiftSpawnPlatforms,
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

  it("supports two elevated roofs with inset utility plinths and three active AC launchers", () => {
    expect(NIGHT_SHIFT_BLOCKOUT_LAYOUT.highRoofs).toHaveLength(2);
    expect(NIGHT_SHIFT_BLOCKOUT_LAYOUT.highRoofPlinths).toHaveLength(2);
    expect(NIGHT_SHIFT_BLOCKOUT_LAYOUT.acLaunchers).toHaveLength(3);

    const hazards = getNightShiftBlockoutHazards();
    for (const [index, roof] of NIGHT_SHIFT_BLOCKOUT_LAYOUT.highRoofs.entries()) {
      const plinth = NIGHT_SHIFT_BLOCKOUT_LAYOUT.highRoofPlinths[index];
      expect(plinth).toMatchObject({ x: roof.x, z: roof.z });
      expect(plinth.width).toBeLessThan(12);
      expect(plinth.depth).toBeLessThan(12);
      for (const hole of hazards.squareHoles) {
        const insideHole =
          Math.abs(roof.x - hole.x) < hazards.half
          && Math.abs(roof.z - hole.z) < hazards.half;
        expect(insideHole).toBe(false);
      }
    }
  });

  it("aims two route units at opposite roofs and makes the center unit stronger", () => {
    const [north, south, center] = NIGHT_SHIFT_BLOCKOUT_LAYOUT.acLaunchers;
    expect(north).toMatchObject({ kind: "route", targetX: 0, targetZ: 18, cooldownMs: 750 });
    expect(south).toMatchObject({ kind: "route", targetX: 0, targetZ: -18, cooldownMs: 750 });
    expect(center).toMatchObject({ kind: "vertical", x: 0, z: 6, cooldownMs: 750 });
    expect(center.verticalSpeed).toBeGreaterThan(north.verticalSpeed);
    expect(center.verticalSpeed).toBeGreaterThan(south.verticalSpeed);
  });

  it("keeps elevated roofs as AC-launch targets, not driveable ramps", () => {
    const source = readFileSync(new URL("../src/levels/rooftop.js", import.meta.url), "utf8");
    expect(source).not.toContain("addRamp(");
    expect(source).not.toContain("RAMP_");
  });

  it("matches four supported platforms to the exact cardinal spawn poses", () => {
    const platforms = getNightShiftSpawnPlatforms(CONFIG);
    const radius = computeSpawnRingRadius(CONFIG);
    expect(platforms).toHaveLength(4);

    const expected = [
      { x: radius, z: 0 },
      { x: 0, z: radius },
      { x: -radius, z: 0 },
      { x: 0, z: -radius },
    ];
    for (const [index, platform] of platforms.entries()) {
      expect(platform.x).toBeCloseTo(expected[index].x, 6);
      expect(platform.z).toBeCloseTo(expected[index].z, 6);
      expect(platform.y + platform.height / 2 + CONFIG.cart.size.y / 2 + 0.05)
        .toBeCloseTo(CONFIG.cart.spawnHeight, 6);
      expect(platform.supportY - platform.supportHeight / 2).toBeCloseTo(0, 6);
      expect(platform.supportY + platform.supportHeight / 2)
        .toBeCloseTo(platform.y - platform.height / 2, 6);
    }
  });

  it("returns a detached rotation proxy instead of rotating the rooftop root", () => {
    const source = readFileSync(new URL("../src/levels/rooftop.js", import.meta.url), "utf8");
    expect(source).toContain('recordMesh.name = "night-shift-static-rotation-proxy"');
    expect(source).not.toContain("recordMesh: root");
  });

  it("wires spawn decks as floor colliders and support shafts as obstacles", () => {
    const source = readFileSync(new URL("../src/levels/rooftop.js", import.meta.url), "utf8");
    const start = source.indexOf("for (const platform of getNightShiftSpawnPlatforms(config))");
    const end = source.indexOf("// Spawn-side baffles", start);
    const platformBuild = source.slice(start, end);
    expect(start).toBeGreaterThan(-1);
    expect(platformBuild).toMatch(/spawnSupportMaterial[\s\S]*edgeColliderHandles/);
    expect(platformBuild).toMatch(/spawnPlatformMaterial[\s\S]*recordColliderHandles/);
  });
});
