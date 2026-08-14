import { describe, expect, it, beforeEach } from "vitest";
import {
  beginFrameBudget,
  frameBudgetAllow,
  frameBudgetOptionalRemaining,
  resetFrameBudgetForTests,
  getFrameBudgetStats,
} from "../../src/utils/frameBudget.js";

describe("frameBudget", () => {
  beforeEach(() => {
    resetFrameBudgetForTests();
  });

  it("allows cheap buckets on a healthy frame", () => {
    beginFrameBudget(1000, 0.016);
    expect(frameBudgetAllow("labels", 1000)).toBe(true);
    expect(frameBudgetAllow("booth_pulse", 1000)).toBe(true);
    expect(frameBudgetOptionalRemaining(1000)).toBeGreaterThan(5);
  });

  it("yields optional work when the frame is already over budget", () => {
    beginFrameBudget(1000, 0.016);
    // * Simulate 14ms already elapsed → optional remaining under reserve.
    expect(frameBudgetAllow("rave_anim", 1014)).toBe(false);
    expect(frameBudgetAllow("ambient", 1014)).toBe(false);
  });

  it("caches allow decisions per bucket within a frame", () => {
    beginFrameBudget(2000, 0.016);
    const a = frameBudgetAllow("trash", 2000);
    const b = frameBudgetAllow("trash", 2010);
    expect(a).toBe(b);
  });

  it("tightens after a hitch (large prior dt)", () => {
    beginFrameBudget(4000, 0.033);
    const stats = getFrameBudgetStats();
    expect(stats.budgetMs).toBeLessThanOrEqual(12);
  });

  it("tracks run/skip counters", () => {
    beginFrameBudget(5000, 0.016);
    frameBudgetAllow("labels", 5000);
    frameBudgetAllow("rave_anim", 5014);
    const stats = getFrameBudgetStats();
    expect((stats.run.labels || 0) + (stats.skip.labels || 0)).toBeGreaterThan(0);
    expect(stats.skip.rave_anim || 0).toBeGreaterThanOrEqual(1);
  });
});
