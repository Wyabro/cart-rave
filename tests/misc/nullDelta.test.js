/**
 * HARNESS-NULL-1: null-control gate — when both arms are the same experiment, |Δ| ≤ floor.
 *
 * Stronger than soakGrowth on incomplete data: either non-finite → fail (no silent filter).
 */
import { describe, it, expect } from "vitest";
import { evaluateNullDelta } from "../../tools/lib/nullDelta.mjs";

const FLOOR = 1.5;

describe("evaluateNullDelta — pass band", () => {
  it("passes exact zero delta", () => {
    const v = evaluateNullDelta(10, 10, { floor: FLOOR, metric: "gpuMs.median" });
    expect(v.pass).toBe(true);
    expect(v.delta).toBe(0);
    expect(v.absDelta).toBe(0);
    expect(v.a).toBe(10);
    expect(v.b).toBe(10);
    expect(v.detail).toContain("PASS");
    expect(v.detail).toContain("gpuMs.median");
  });

  it("passes when absDelta equals floor (inclusive)", () => {
    const v = evaluateNullDelta(10, 11.5, { floor: FLOOR });
    expect(v.absDelta).toBe(1.5);
    expect(v.pass).toBe(true);
  });

  it("passes a small negative delta under floor", () => {
    const v = evaluateNullDelta(12, 11, { floor: FLOOR });
    expect(v.delta).toBe(-1);
    expect(v.absDelta).toBe(1);
    expect(v.pass).toBe(true);
  });
});

describe("evaluateNullDelta — fail band", () => {
  it("fails when absDelta is just over floor", () => {
    const v = evaluateNullDelta(10, 11.5 + 1e-9, { floor: FLOOR });
    expect(v.pass).toBe(false);
    expect(v.detail).toContain("FAIL");
  });

  it("fails a large systematic bias", () => {
    const v = evaluateNullDelta(8, 12, { floor: FLOOR, metric: "frameMs.median" });
    expect(v.pass).toBe(false);
    expect(v.delta).toBe(4);
    expect(v.absDelta).toBe(4);
  });
});

describe("evaluateNullDelta — incomplete (stricter than soakGrowth)", () => {
  it("fails when a is non-finite", () => {
    const v = evaluateNullDelta(NaN, 10, { floor: FLOOR });
    expect(v.pass).toBe(false);
    expect(v.delta).toBeNull();
    expect(v.detail).toContain("incomplete");
  });

  it("fails when b is null/undefined", () => {
    expect(evaluateNullDelta(10, null, { floor: FLOOR }).pass).toBe(false);
    expect(evaluateNullDelta(10, undefined, { floor: FLOOR }).pass).toBe(false);
  });

  it("fails when either side is Infinity", () => {
    expect(evaluateNullDelta(Infinity, 1, { floor: FLOOR }).pass).toBe(false);
    expect(evaluateNullDelta(1, -Infinity, { floor: FLOOR }).pass).toBe(false);
  });

  it("fails invalid floor", () => {
    expect(evaluateNullDelta(1, 1, { floor: -1 }).pass).toBe(false);
    expect(evaluateNullDelta(1, 1, { floor: NaN }).pass).toBe(false);
  });
});
