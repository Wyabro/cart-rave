import { describe, expect, it } from "vitest";
import { CLASSIC_RECORD_SEGMENT_COUNT, getClassicRecordColliderSpec } from "../../src/levels/arena.js";
import { CONFIG } from "../../src/config.js";

const spec = getClassicRecordColliderSpec(CONFIG.record);

describe("Classic record wedge collider spec", () => {
  it("uses 16 trapezoidal prisms with tangent half-angles", () => {
    expect(spec.nSegments).toBe(CLASSIC_RECORD_SEGMENT_COUNT);
    expect(spec.yaws).toHaveLength(16);
    expect(spec.vertices).toHaveLength(24);
    const halfAngle = Math.PI / 16;
    expect(spec.yaws[4]).toBeCloseTo(Math.PI / 2, 12);
    expect(spec.yaws[12]).toBeCloseTo(3 * Math.PI / 2, 12);
    const zIn = CONFIG.record.innerRadius * Math.tan(halfAngle);
    expect(spec.vertices[5]).toBeCloseTo(zIn, 5);
  });

  it("places the ring top at world y=0", () => {
    expect(spec.centerY + spec.halfHeight).toBeCloseTo(0, 9);
    expect(spec.halfHeight * 2).toBeCloseTo(CONFIG.record.thickness, 9);
  });
});
