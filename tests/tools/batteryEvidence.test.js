import { describe, it, expect } from "vitest";
import {
  REQUIRED_CORE_STEPS,
  selectBatterySteps,
  isCompleteCoreSelection,
  omittedCoreSteps,
  classifyBatteryEvidence,
  BATTERY_SUITE_ID,
} from "../../tools/lib/batteryPlan.mjs";
import { analyzeStatus, BUDGET_TOKENS } from "../../tools/status-size.mjs";
import { readFileSync } from "node:fs";

describe("batteryPlan", () => {
  it("requires the six core steps", () => {
    expect(REQUIRED_CORE_STEPS).toEqual([
      "gameharness",
      "spawnlock",
      "mpIntegration",
      "hostMigration",
      "hostReload",
      "teardownRejoin",
    ]);
  });

  it("marks --only runs as incomplete selections", () => {
    const steps = selectBatterySteps({ only: ["mpIntegration"] });
    expect(steps.map((s) => s.name)).toEqual(["mpIntegration"]);
    expect(isCompleteCoreSelection(steps.map((s) => s.name))).toBe(false);
    expect(omittedCoreSteps(steps.map((s) => s.name))).toHaveLength(5);
  });

  it("classifies legacy reports without provenance as unknown (never green)", () => {
    const report = {
      when: new Date().toISOString(),
      results: REQUIRED_CORE_STEPS.map((name) => ({ name, code: 0, ms: 1, note: "" })),
    };
    const c = classifyBatteryEvidence(report, { headFull: "abc" });
    expect(c.complete).toBe(true);
    expect(c.hasProvenance).toBe(false);
    expect(c.class).toBe("unknown");
    expect(c.scopeLabel).toBe("6/6");
  });

  it("classifies a targeted 1-step run as partial", () => {
    const report = {
      reportVersion: 2,
      suiteId: BATTERY_SUITE_ID,
      when: new Date().toISOString(),
      git: { headFull: "abc", head: "abc", branch: "cart-clash", dirty: false },
      selectedSteps: ["mpIntegration"],
      complete: false,
      results: [{ name: "mpIntegration", code: 0, ms: 1, note: "" }],
    };
    const c = classifyBatteryEvidence(report, { headFull: "abc" });
    expect(c.class).toBe("partial");
    expect(c.scopeLabel).toBe("1/6");
  });

  it("classifies complete exact-HEAD all-green as green", () => {
    const report = {
      reportVersion: 2,
      suiteId: BATTERY_SUITE_ID,
      when: new Date().toISOString(),
      git: { headFull: "deadbeef".repeat(5), head: "deadbeef", branch: "cart-clash", dirty: false },
      selectedSteps: [...REQUIRED_CORE_STEPS],
      complete: true,
      results: REQUIRED_CORE_STEPS.map((name) => ({ name, code: 0, ms: 1, note: "" })),
    };
    const c = classifyBatteryEvidence(report, { headFull: "deadbeef".repeat(5) });
    expect(c.class).toBe("green");
  });

  it("flags head-mismatch when provenance HEAD differs", () => {
    const report = {
      reportVersion: 2,
      suiteId: BATTERY_SUITE_ID,
      when: new Date().toISOString(),
      git: { headFull: "aaa", head: "aaa", branch: "cart-clash", dirty: false },
      selectedSteps: [...REQUIRED_CORE_STEPS],
      complete: true,
      results: REQUIRED_CORE_STEPS.map((name) => ({ name, code: 0, ms: 1, note: "" })),
    };
    const c = classifyBatteryEvidence(report, { headFull: "bbb" });
    expect(c.class).toBe("head-mismatch");
  });
});

describe("status-size budget", () => {
  it("live STATUS.md stays under the token budget", () => {
    const text = readFileSync(new URL("../../docs/STATUS.md", import.meta.url), "utf8");
    const r = analyzeStatus(text);
    expect(r.tokens).toBeLessThanOrEqual(BUDGET_TOKENS);
    expect(r.overBudget).toBe(false);
  });
});
