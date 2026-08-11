import { describe, expect, it } from "vitest";
import {
  createNightShiftCityArchitecture,
  createNightShiftCityPlan,
  NIGHT_SHIFT_CITY_SEED,
  NIGHT_SHIFT_NEON_COLORS,
} from "../src/levels/nightShiftVisuals.js";
import * as THREE from "three";

describe("Night Shift city architecture", () => {
  it("compiles an identical building plan from the same seed", () => {
    expect(createNightShiftCityPlan()).toEqual(createNightShiftCityPlan(NIGHT_SHIFT_CITY_SEED));
    expect(createNightShiftCityPlan(12)).not.toEqual(createNightShiftCityPlan(13));
  });

  it("allocates all three depth bands and keeps a lean Low silhouette", () => {
    const plan = createNightShiftCityPlan();
    expect(plan.bandCounts).toEqual({ near: 10, mid: 18, far: 32 });
    expect(plan.buildings).toHaveLength(60);
    expect(plan.lowBuildingCount).toBe(20);
    expect(plan.buildings.filter((building) => building.detail === "extended")).toHaveLength(40);
    expect(new Set(plan.buildings.map((building) => building.silhouette)))
      .toEqual(new Set(["slab", "setback", "crown"]));
    const neonBuildings = plan.buildings.filter((building) => building.neonAccent);
    expect(neonBuildings.length).toBeGreaterThanOrEqual(12);
    expect(neonBuildings.length).toBeLessThanOrEqual(24);
    expect(neonBuildings.every((building) => building.neonAccent in NIGHT_SHIFT_NEON_COLORS))
      .toBe(true);
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
    expect(architecture.extendedNeon.visible).toBe(false);
    expect(architecture.diagnostics.lowTowerCount).toBe(20);
    expect(architecture.diagnostics.lowBuildingCount).toBeGreaterThan(20);
    expect(architecture.diagnostics.lowWindowCount).toBeGreaterThan(0);
    expect(architecture.diagnostics.lowNeonSignCount).toBeGreaterThan(0);
    expect(architecture.diagnostics.lowDrawCalls).toBe(5);
    expect(architecture.diagnostics.deckBraceCount).toBe(12);
    expect(architecture.diagnostics.facadeBandCount).toBe(32);
    expect(architecture.diagnostics.structuralBeamCount).toBe(52);

    architecture.applyQualityTier({ skyExtras: true });
    expect(architecture.extendedSkyline.visible).toBe(true);
    expect(architecture.extendedWindows.visible).toBe(true);
    expect(architecture.extendedNeon.visible).toBe(true);
    expect(architecture.diagnostics.fullTowerCount).toBe(60);
    expect(architecture.diagnostics.fullBuildingCount).toBeGreaterThan(60);
    expect(architecture.diagnostics.fullWindowCount)
      .toBeGreaterThan(architecture.diagnostics.lowWindowCount);
    expect(architecture.diagnostics.fullNeonSignCount)
      .toBeGreaterThan(architecture.diagnostics.lowNeonSignCount);
    expect(architecture.diagnostics.fullDrawCalls).toBe(8);

    architecture.dispose();
    material.dispose();
  });
});
