import { describe, expect, it } from "vitest";
import {
  createNightShiftCityPlan,
  NIGHT_SHIFT_CITY_SEED,
} from "../src/levels/nightShiftVisuals.js";

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
});
