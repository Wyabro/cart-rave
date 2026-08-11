import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { CONFIG, computeSpawnAngleForSlot } from "../src/config.js";
import {
  getNightShiftBlockoutHazards,
  getNightShiftSpawnPlatforms,
  NIGHT_SHIFT_BLOCKOUT_LAYOUT,
} from "../src/levels/rooftop.js";

describe("Night Shift blockout", () => {
  it("uses one full square roof with no internal corner voids", () => {
    expect(NIGHT_SHIFT_BLOCKOUT_LAYOUT.mainRoofs).toEqual([
      { x: 0, z: 0, width: 72, depth: 72 },
    ]);
    expect(getNightShiftBlockoutHazards().squareHoles).toEqual([]);
  });

  it("keeps AC data without enabling Storerooms hole avoidance", () => {
    const hazards = getNightShiftBlockoutHazards();
    expect(hazards.squareHoles).toHaveLength(0);
    expect(hazards.suctionBand).toBeUndefined();
  });

  it("supports two lateral elevated roofs with inset plinths and four active AC launchers", () => {
    expect(NIGHT_SHIFT_BLOCKOUT_LAYOUT.highRoofs).toHaveLength(2);
    expect(NIGHT_SHIFT_BLOCKOUT_LAYOUT.highRoofPlinths).toHaveLength(2);
    expect(NIGHT_SHIFT_BLOCKOUT_LAYOUT.acLaunchers).toHaveLength(4);
    expect(NIGHT_SHIFT_BLOCKOUT_LAYOUT.highRoofs).toEqual([
      { x: -23, z: 0 },
      { x: 23, z: 0 },
    ]);

    for (const [index, roof] of NIGHT_SHIFT_BLOCKOUT_LAYOUT.highRoofs.entries()) {
      const plinth = NIGHT_SHIFT_BLOCKOUT_LAYOUT.highRoofPlinths[index];
      expect(plinth).toMatchObject({ x: roof.x, z: roof.z });
      expect(plinth.width).toBeLessThan(12);
      expect(plinth.depth).toBeLessThan(12);
    }
  });

  it("aims two route units outward and keeps two stronger vertical units", () => {
    const [west, east, north, south] = NIGHT_SHIFT_BLOCKOUT_LAYOUT.acLaunchers;
    expect(west).toMatchObject({ kind: "route", targetX: -23, targetZ: 0, cooldownMs: 750 });
    expect(east).toMatchObject({ kind: "route", targetX: 23, targetZ: 0, cooldownMs: 750 });
    expect(north).toMatchObject({ kind: "vertical", x: 0, z: 6, cooldownMs: 750 });
    expect(south).toMatchObject({ kind: "vertical", x: 0, z: -6, cooldownMs: 750 });
    expect(north.verticalSpeed).toBeGreaterThan(west.verticalSpeed);
    expect(south.verticalSpeed).toBeGreaterThan(east.verticalSpeed);
  });

  it("keeps elevated roofs as AC-launch targets, not driveable ramps", () => {
    const source = readFileSync(new URL("../src/levels/rooftop.js", import.meta.url), "utf8");
    expect(source).not.toContain("addRamp(");
    expect(source).not.toContain("RAMP_");
  });

  it("matches four supported platforms to the exact diagonal spawn poses", () => {
    const rooftopConfig = {
      ...CONFIG,
      cart: {
        ...CONFIG.cart,
        spawnRingRadius: CONFIG.cart.spawnRingRadiusByLevel.rooftop,
        spawnAngleOffset: CONFIG.cart.spawnAngleOffsetByLevel.rooftop,
      },
    };
    const platforms = getNightShiftSpawnPlatforms(rooftopConfig);
    const radius = rooftopConfig.cart.spawnRingRadius;
    expect(platforms).toHaveLength(4);
    for (const [index, platform] of platforms.entries()) {
      const angle = computeSpawnAngleForSlot(rooftopConfig, index);
      expect(platform.x).toBeCloseTo(radius * Math.cos(angle), 6);
      expect(platform.z).toBeCloseTo(radius * Math.sin(angle), 6);
      expect(Math.abs(platform.x)).toBeGreaterThan(29);
      expect(Math.abs(platform.z)).toBeGreaterThan(29);
      expect(platform.yaw).toBeCloseTo(Math.PI / 2 - angle, 6);
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
    const start = source.indexOf("for (const platform of spawnPlatforms)");
    const end = source.indexOf("// Spawn-side baffles", start);
    const platformBuild = source.slice(start, end);
    expect(start).toBeGreaterThan(-1);
    expect(platformBuild).toMatch(/spawnSupportMaterial[\s\S]*edgeColliderHandles/);
    expect(platformBuild).toMatch(/spawnPlatformMaterial[\s\S]*recordColliderHandles/);
    expect(platformBuild.match(/yaw: platform\.yaw/g)).toHaveLength(2);
    expect(source).toMatch(/body\.setRotation\(\{ x: 0, y: Math\.sin\(halfYaw\), z: 0, w: Math\.cos\(halfYaw\) \}, true\)/);
  });
});
