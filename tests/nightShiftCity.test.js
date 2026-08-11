import { describe, expect, it } from "vitest";
import {
  createNightShiftCityArchitecture,
  createNightShiftCityPlan,
  NIGHT_SHIFT_CITY_SEED,
} from "../src/levels/nightShiftVisuals.js";
import * as THREE from "three";

describe("Night Shift city architecture", () => {
  it("compiles an identical building plan from the same seed", () => {
    expect(createNightShiftCityPlan()).toEqual(createNightShiftCityPlan(NIGHT_SHIFT_CITY_SEED));
    expect(createNightShiftCityPlan(12)).not.toEqual(createNightShiftCityPlan(13));
  });

  it("allocates all three depth bands and keeps a lean Low silhouette", () => {
    const plan = createNightShiftCityPlan();
    expect(plan.bandCounts).toEqual({ near: 8, mid: 14, far: 24 });
    expect(plan.buildings).toHaveLength(46);
    expect(plan.lowBuildingCount).toBe(16);
    expect(plan.buildings.filter((building) => building.detail === "extended")).toHaveLength(30);
  });

  it("keeps every skyline mass below and clear of the playable tower", () => {
    const plan = createNightShiftCityPlan();
    for (const building of plan.buildings) {
      const radius = Math.hypot(building.x, building.z);
      expect(radius).toBeGreaterThanOrEqual(93.99);
      expect(building.roofY).toBeLessThanOrEqual(-10);
      expect(building.bottomY).toBeLessThan(building.roofY);
    }
  });

  it("keeps the core city on Low and enables extended depth on Medium and High", () => {
    const root = new THREE.Group();
    const material = new THREE.MeshBasicMaterial();
    const architecture = createNightShiftCityArchitecture(
      root,
      createNightShiftCityPlan(),
      [
        { x: 30, y: 4, z: 30, height: 0.6 },
        { x: -30, y: 4, z: 30, height: 0.6 },
        { x: -30, y: 4, z: -30, height: 0.6 },
        { x: 30, y: 4, z: -30, height: 0.6 },
      ],
      { tower: material, brace: material, skylineCore: material, skylineExtended: material },
    );

    architecture.applyQualityTier({ skyExtras: false });
    expect(architecture.extendedSkyline.visible).toBe(false);
    expect(architecture.extendedWindows.visible).toBe(false);
    expect(architecture.diagnostics.lowBuildingCount).toBe(16);
    expect(architecture.diagnostics.lowWindowCount).toBeGreaterThan(0);
    expect(architecture.diagnostics.deckBraceCount).toBe(12);
    expect(architecture.diagnostics.facadeBandCount).toBe(32);
    expect(architecture.diagnostics.structuralBeamCount).toBe(52);

    architecture.applyQualityTier({ skyExtras: true });
    expect(architecture.extendedSkyline.visible).toBe(true);
    expect(architecture.extendedWindows.visible).toBe(true);
    expect(architecture.diagnostics.fullBuildingCount).toBe(46);
    expect(architecture.diagnostics.fullWindowCount)
      .toBeGreaterThan(architecture.diagnostics.lowWindowCount);

    architecture.dispose();
    material.dispose();
  });
});
