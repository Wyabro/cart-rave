// spawnRing.test.js — SPAWN-BACKROOMS-1 / SPAWN-BACKROOMS-2 / SPAWN-SUNDIAL-1 spawn-ring override.
//
// Classic / Sundial booths and the spawn ring stay matched because every booth
// builder and computeSpawnRingRadius read config.booth.gapDistance live at build
// time. Storerooms (SPAWN-BACKROOMS-2) uses spawnRingRadiusByLevel so the inset
// cannot go through a negative gap; buildBackroomsBooths reads the live ring.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CONFIG,
  computeSpawnAngleForSlot,
  computeSpawnRingRadius,
} from "../../src/config.js";

/** loadLevel's derived-value bookkeeping, replayed on a throwaway config. */
function ringFor(levelId) {
  const cfg = {
    record: { ...CONFIG.record },
    booth: { ...CONFIG.booth },
    cart: { ...CONFIG.cart },
  };
  const overrideRadius = cfg.record.radiusByLevel?.[levelId];
  const overrideGap = cfg.booth.gapDistanceByLevel?.[levelId];
  if (overrideRadius != null) cfg.record.radius = overrideRadius;
  if (overrideGap != null) cfg.booth.gapDistance = overrideGap;
  return cfg.cart.spawnRingRadiusByLevel?.[levelId] ?? computeSpawnRingRadius(cfg);
}

describe("spawn ring per-level overrides", () => {
  it("insets Storerooms spawns one booth-width via the ring override", () => {
    expect(CONFIG.booth.gapDistanceByLevel.backrooms).toBeCloseTo(2.25, 6);
    expect(CONFIG.cart.spawnRingRadiusByLevel.backrooms).toBeCloseTo(24.15, 6);
    expect(CONFIG.booth.platformWidth).toBeCloseTo(7, 6);

    const formulaWithStoreroomsGap =
      CONFIG.record.radius + 2.25 + CONFIG.booth.rampLength + CONFIG.booth.platformDepth / 2;
    expect(formulaWithStoreroomsGap).toBeCloseTo(31.15, 6);
    expect(ringFor("backrooms")).toBeCloseTo(formulaWithStoreroomsGap - 7, 6);
    expect(ringFor("backrooms")).toBeCloseTo(24.15, 6);
  });

  it("leaves Classic Record on the base ring", () => {
    expect(CONFIG.booth.gapDistanceByLevel.classicRecord).toBeUndefined();
    expect(ringFor("classicRecord")).toBeCloseTo(computeSpawnRingRadius(CONFIG), 6);
  });

  it("rotates only Night Shift spawns onto the diagonal ring", () => {
    const baseConfig = {
      ...CONFIG,
      cart: { ...CONFIG.cart, spawnAngleOffset: 0 },
    };
    const rooftopConfig = {
      ...CONFIG,
      cart: {
        ...CONFIG.cart,
        spawnAngleOffset: CONFIG.cart.spawnAngleOffsetByLevel.rooftop,
      },
    };
    expect(computeSpawnAngleForSlot(baseConfig, 0)).toBeCloseTo(0, 6);
    expect(computeSpawnAngleForSlot(rooftopConfig, 0)).toBeCloseTo(Math.PI / 4, 6);
    expect(computeSpawnAngleForSlot(rooftopConfig, 3)).toBeCloseTo((7 * Math.PI) / 4, 6);
    expect(ringFor("rooftop")).toBeCloseTo(42, 6);
  });

  it("stacks the gap override on top of Sundial's radius override", () => {
    // * Sundial overrides BOTH. The two must compose, not shadow each other.
    // SPAWN-SUNDIAL-GAP-1: widened from 2.25 to 3.75 so carts can't wedge
    // between booth legs and the platform edge.
    expect(CONFIG.booth.gapDistanceByLevel.zanzibar).toBeCloseTo(3.75, 6);
    expect(CONFIG.record.radiusByLevel.zanzibar).toBeCloseTo(31.7, 6);
    const expected =
      31.7 + 3.75 + CONFIG.booth.rampLength + CONFIG.booth.platformDepth / 2;
    expect(ringFor("zanzibar")).toBeCloseTo(expected, 6);
  });

  it("loadLevel recomputes the ring for a gap-only override, not radius-only", () => {
    // * Storerooms has no radiusByLevel entry, so gating the recompute on the radius
    // * would move the booths and leave the carts spawning on the old ring.
    const src = readFileSync(new URL("../../src/levels/index.js", import.meta.url), "utf8");
    expect(src).toMatch(/overrideRadius\s*!=\s*null\s*\|\|\s*overrideGap\s*!=\s*null/);
    expect(src).toMatch(/config\.booth\.gapDistance\s*=\s*overrideGap/);
    expect(src).toMatch(/config\.cart\.spawnRingRadius\s*=\s*overrideSpawnRing/);
  });

  it("places Storerooms booths on the live spawn ring, not the gap formula", () => {
    const src = readFileSync(
      new URL("../../src/levels/backroomsSupermarket.js", import.meta.url),
      "utf8",
    );
    expect(src).toMatch(/boothCenterDist\s*=\s*config\.cart\.spawnRingRadius/);
    expect(src).not.toMatch(
      /boothCenterDist\s*=\s*arenaR\s*\+\s*B\.gapDistance\s*\+\s*B\.rampLength/,
    );
    expect(src).toMatch(/along > 24\.5/);
    expect(src).not.toMatch(/along > 31\.5/);
  });

  it("uses the shared spawn-angle helper for initial carts and later refreshes", () => {
    const src = readFileSync(new URL("../../src/entities.js", import.meta.url), "utf8");
    const spawnHelper = src.slice(
      src.indexOf("function spawnOnRingForSlot"),
      src.indexOf("export function refreshCartSpawnPositions"),
    );
    expect(spawnHelper).toContain("computeSpawnAngleForSlot(CONFIG, slotIndex)");
    expect(src).toMatch(/refreshCartSpawnPositions[\s\S]*spawnOnRingForSlot\(cart\.slotIndex\)/);
  });

  it("restores every overridden value, so the next level starts from base", () => {
    const src = readFileSync(new URL("../../src/levels/index.js", import.meta.url), "utf8");
    const restore = src.slice(
      src.indexOf("const restoreOverrides"),
      src.indexOf("if (overrideRadius != null || overrideGap != null)"),
    );
    expect(restore).toMatch(/config\.record\.radius\s*=\s*prevRadius/);
    expect(restore).toMatch(/config\.booth\.gapDistance\s*=\s*prevGap/);
    expect(restore).toMatch(/config\.cart\.spawnRingRadius\s*=\s*prevSpawnRing/);
    expect(restore).toMatch(/config\.cart\.spawnAngleOffset\s*=\s*prevSpawnAngle/);
  });
});
