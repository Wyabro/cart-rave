import { describe, expect, it } from "vitest";
import {
  createNightShiftCityArchitecture,
  createNightShiftCityPlan,
  NIGHT_SHIFT_CITY_SEED,
  NIGHT_SHIFT_MAST_BUILDING_ID,
  NIGHT_SHIFT_NEON_COLORS,
} from "../src/levels/nightShiftVisuals.js";
import * as THREE from "three";

function createTestMaterials(material) {
  return {
    tower: material,
    brace: material,
    skylineCore: material,
    skylineExtended: material,
    mastMetal: material,
    antennaPaint: material,
  };
}

function touchesFacade(point, building, tolerance = 0.35) {
  if (point.y < building.bottomY || point.y > building.roofY) return false;

  const totalHeight = building.roofY - building.bottomY;
  const setbackY = building.bottomY + totalHeight * building.setbackRatio;
  const scale = building.silhouette !== "slab" && point.y >= setbackY
    ? building.setbackScale
    : 1;
  const halfWidth = building.width * scale * 0.5;
  const halfDepth = building.depth * scale * 0.5;
  const dx = point.x - building.x;
  const dz = point.z - building.z;
  const cos = Math.cos(building.yaw);
  const sin = Math.sin(building.yaw);
  const localX = cos * dx - sin * dz;
  const localZ = sin * dx + cos * dz;

  return (
    Math.abs(Math.abs(localX) - halfWidth) <= tolerance
      && Math.abs(localZ) <= halfDepth + tolerance
  ) || (
    Math.abs(Math.abs(localZ) - halfDepth) <= tolerance
      && Math.abs(localX) <= halfWidth + tolerance
  );
}

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
      createTestMaterials(material),
    );

    architecture.applyQualityTier({ skyExtras: false });
    expect(architecture.extendedSkyline.visible).toBe(false);
    expect(architecture.extendedWindows.visible).toBe(false);
    expect(architecture.extendedNeon.visible).toBe(false);
    expect(architecture.diagnostics.lowTowerCount).toBe(20);
    expect(architecture.diagnostics.lowBuildingCount).toBeGreaterThan(20);
    expect(architecture.diagnostics.lowWindowCount).toBeGreaterThan(0);
    expect(architecture.diagnostics.lowNeonSignCount).toBeGreaterThan(0);
    expect(architecture.diagnostics.lowDrawCalls).toBe(9);
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
    expect(architecture.diagnostics.fullDrawCalls).toBe(13);

    architecture.dispose();
    material.dispose();
  });

  it("binds every skyline window and neon sign to a rotated facade face", () => {
    const root = new THREE.Group();
    const material = new THREE.MeshBasicMaterial();
    const plan = createNightShiftCityPlan();
    const architecture = createNightShiftCityArchitecture(
      root,
      plan,
      [],
      createTestMaterials(material),
    );
    const extendedBuildings = plan.buildings.filter((building) => building.detail === "extended");
    const detachedWindows = [];
    const positions = architecture.extendedWindows.geometry.getAttribute("position");
    const point = new THREE.Vector3();
    for (let index = 0; index < positions.count; index += 1) {
      point.fromBufferAttribute(positions, index);
      if (!extendedBuildings.some((building) => touchesFacade(point, building))) {
        detachedWindows.push(index);
      }
    }

    const detachedNeon = [];
    const matrix = new THREE.Matrix4();
    const rotation = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    for (let index = 0; index < architecture.extendedNeon.count; index += 1) {
      architecture.extendedNeon.getMatrixAt(index, matrix);
      matrix.decompose(point, rotation, scale);
      if (!extendedBuildings.some((building) => touchesFacade(point, building))) {
        detachedNeon.push(index);
      }
    }

    expect({
      detachedWindowCount: detachedWindows.length,
      detachedNeonCount: detachedNeon.length,
    }).toEqual({ detachedWindowCount: 0, detachedNeonCount: 0 });

    architecture.dispose();
    material.dispose();
  });

  it("attaches the telecom mast to one deterministic city roof without gameplay collision", () => {
    const root = new THREE.Group();
    const material = new THREE.MeshBasicMaterial();
    const plan = createNightShiftCityPlan();
    const anchor = plan.buildings.find((building) => building.id === NIGHT_SHIFT_MAST_BUILDING_ID);
    const architecture = createNightShiftCityArchitecture(
      root,
      plan,
      [],
      createTestMaterials(material),
    );
    const mast = architecture.telecomMast;
    const bounds = new THREE.Box3().setFromObject(mast.root);

    expect(anchor).toBeDefined();
    expect(mast.root.name).toBe("night-shift-telecom-mast");
    expect(mast.root.position.toArray()).toEqual([anchor.x, anchor.roofY + anchor.crownHeight, anchor.z]);
    expect(bounds.min.y).toBeGreaterThanOrEqual(anchor.roofY + anchor.crownHeight - 0.01);
    expect(mast.root.getObjectByName("night-shift-mast-core")).toBeTruthy();
    expect(mast.root.getObjectByName("night-shift-mast-moving-dish")).toBeTruthy();
    expect(mast.root.getObjectByName("night-shift-mast-beacons")).toBeTruthy();
    expect(architecture.diagnostics.telecomMast).toMatchObject({
      anchorBuildingId: NIGHT_SHIFT_MAST_BUILDING_ID,
      lowDrawCalls: 4,
      fullDrawCalls: 5,
      hasGameplayCollider: false,
    });
    expect(architecture.diagnostics.telecomMast.lowTriangles).toBeLessThanOrEqual(4000);
    expect(architecture.diagnostics.telecomMast.fullTriangles).toBeLessThanOrEqual(12000);

    architecture.applyQualityTier({ skyExtras: false });
    expect(mast.detail.visible).toBe(false);
    architecture.applyQualityTier({ skyExtras: true });
    expect(mast.detail.visible).toBe(true);

    architecture.dispose();
    material.dispose();
  });
});
