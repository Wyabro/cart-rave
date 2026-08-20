import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CLASSIC_RECORD_RING_SEGMENTS, getClassicRecordColliderSpec } from "../../src/levels/arena.js";
import { CONFIG } from "../../src/config.js";

const spec = getClassicRecordColliderSpec(CONFIG.record);
const src = readFileSync(new URL("../../src/levels/arena.js", import.meta.url), "utf8");

describe("Classic record floor collider spec", () => {
  it("builds one annulus, not 16 radial hulls", () => {
    expect(spec.segments).toBe(CLASSIC_RECORD_RING_SEGMENTS);
    expect(spec.vertices.length).toBe(spec.segments * 4 * 3);
    expect(spec.indices.length).toBe(spec.segments * 4 * 2 * 3);
    expect(spec.innerRadius).toBe(CONFIG.record.innerRadius);
    expect(spec.outerRadius).toBe(CONFIG.record.radius);
  });

  it("places the ring top at world y=0", () => {
    expect(spec.centerY + spec.halfHeight).toBeCloseTo(0, 9);
    expect(spec.halfHeight * 2).toBeCloseTo(CONFIG.record.thickness, 9);
    expect(spec.vertices[1]).toBeCloseTo(spec.halfHeight, 5);
  });

  it("uses a FIX_INTERNAL_EDGES trimesh for the record floor", () => {
    const floor = src.slice(
      src.indexOf("CART-POP-1: one annulus trimesh"),
      src.indexOf("let debugMesh"),
    );
    expect(floor).toContain("ColliderDesc.trimesh");
    expect(floor).toContain("TriMeshFlags.FIX_INTERNAL_EDGES");
    expect(floor).not.toContain("convexHull");
  });
});
