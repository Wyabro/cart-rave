// spawnRing.test.js — SPAWN-BACKROOMS-1 / SPAWN-SUNDIAL-1 spawn-ring override.
//
// The booths and the spawn ring are matched only because every booth builder and
// computeSpawnRingRadius read config.booth.gapDistance live at build time. These
// cases pin that shared-input property, and that loadLevel recomputes the cached
// ring when the gap moves on its own (Storerooms overrides no radius).

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CONFIG, computeSpawnRingRadius } from "../src/config.js";

/** loadLevel's derived-value bookkeeping, replayed on a throwaway config. */
function ringFor(levelId) {
  const cfg = {
    record: { ...CONFIG.record },
    booth: { ...CONFIG.booth },
  };
  const overrideRadius = cfg.record.radiusByLevel?.[levelId];
  const overrideGap = cfg.booth.gapDistanceByLevel?.[levelId];
  if (overrideRadius != null) cfg.record.radius = overrideRadius;
  if (overrideGap != null) cfg.booth.gapDistance = overrideGap;
  return computeSpawnRingRadius(cfg);
}

describe("spawn ring per-level overrides", () => {
  it("pushes Storerooms and Sundial spawns further out", () => {
    expect(CONFIG.booth.gapDistanceByLevel.backrooms).toBeCloseTo(2.25, 6);
    // SPAWN-SUNDIAL-GAP-1: widened from 2.25 to 3.75 so carts can't wedge
    // between booth legs and the platform edge.
    expect(CONFIG.booth.gapDistanceByLevel.zanzibar).toBeCloseTo(3.75, 6);

    const base = computeSpawnRingRadius(CONFIG);
    expect(ringFor("backrooms")).toBeCloseTo(base + 0.75, 6);
  });

  it("leaves Classic Record on the base ring", () => {
    expect(CONFIG.booth.gapDistanceByLevel.classicRecord).toBeUndefined();
    expect(ringFor("classicRecord")).toBeCloseTo(computeSpawnRingRadius(CONFIG), 6);
  });

  it("stacks the gap override on top of Sundial's radius override", () => {
    // * Sundial overrides BOTH. The two must compose, not shadow each other.
    expect(CONFIG.record.radiusByLevel.zanzibar).toBeCloseTo(31.7, 6);
    const expected =
      31.7 + 3.75 + CONFIG.booth.rampLength + CONFIG.booth.platformDepth / 2;
    expect(ringFor("zanzibar")).toBeCloseTo(expected, 6);
  });

  it("loadLevel recomputes the ring for a gap-only override, not radius-only", () => {
    // * Storerooms has no radiusByLevel entry, so gating the recompute on the radius
    // * would move the booths and leave the carts spawning on the old ring.
    const src = readFileSync(new URL("../src/levels/index.js", import.meta.url), "utf8");
    expect(src).toMatch(/overrideRadius\s*!=\s*null\s*\|\|\s*overrideGap\s*!=\s*null/);
    expect(src).toMatch(/config\.booth\.gapDistance\s*=\s*overrideGap/);
  });

  it("restores every overridden value, so the next level starts from base", () => {
    const src = readFileSync(new URL("../src/levels/index.js", import.meta.url), "utf8");
    const restore = src.slice(
      src.indexOf("const restoreOverrides"),
      src.indexOf("if (overrideRadius != null || overrideGap != null)"),
    );
    expect(restore).toMatch(/config\.record\.radius\s*=\s*prevRadius/);
    expect(restore).toMatch(/config\.booth\.gapDistance\s*=\s*prevGap/);
    expect(restore).toMatch(/config\.cart\.spawnRingRadius\s*=\s*prevSpawnRing/);
  });
});
