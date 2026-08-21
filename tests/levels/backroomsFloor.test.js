import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import {
  getFloorSurfaceY,
  computeFloorPhysicsY,
  getBackroomsFloorColliderSpec,
} from "../../src/levels/backroomsSupermarket.js";

// The Storerooms floor invariant: the physics floor must support exactly what the carpet
// shows. The original corner-void falls bug was a violation of this — the flat collider
// slices stopped at the outer edge of each sloped chamfer lip, leaving a ~1m ring of
// visually solid carpet with no collider (physics holes 10.6m wide vs 8.5m visual).

const ARENA_HALF = 38; // keep in sync with backroomsSupermarket.js
const TOLERANCE = 0.03; // CHAMFER_TUCK (0.02) + margin

describe("Storerooms floor physics/visual lockstep", () => {
  it("physics coverage matches the visual surface across the whole floor", () => {
    let checked = 0;
    for (let x = -ARENA_HALF + 0.01; x <= ARENA_HALF - 0.01; x += 0.31) {
      for (let z = -ARENA_HALF + 0.01; z <= ARENA_HALF - 0.01; z += 0.31) {
        const visual = getFloorSurfaceY(x, z);
        const physics = computeFloorPhysicsY(x, z);
        const at = `at (${x.toFixed(2)}, ${z.toFixed(2)})`;
        if (visual === null) {
          expect(physics, `open void must have no support ${at}`).toBeNull();
        } else {
          expect(physics, `visible carpet must be supported ${at}`).not.toBeNull();
          expect(
            Math.abs(visual - physics),
            `support height must track the visual slope ${at}`,
          ).toBeLessThanOrEqual(TOLERANCE);
        }
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(50000);
  });

  it("supports the chamfer band that used to be a hidden death ring", () => {
    // Mid-band east of the (+20, +20) void: solid sloped carpet — must be supported.
    expect(computeFloorPhysicsY(24.8, 20)).not.toBeNull();
    // Just outside the true void edge.
    expect(computeFloorPhysicsY(24.3, 20)).not.toBeNull();
    // Diagonal (mitered) corner of the same band.
    expect(computeFloorPhysicsY(24.8, 24.8)).not.toBeNull();
    // Perimeter chamfer band.
    expect(computeFloorPhysicsY(37.4, 0)).not.toBeNull();
  });

  it("keeps the voids and the pit open", () => {
    expect(computeFloorPhysicsY(20, 20)).toBeNull(); // void center
    expect(computeFloorPhysicsY(22, 22)).toBeNull(); // inside void, off-center
    expect(computeFloorPhysicsY(39, 0)).toBeNull(); // past the floor edge
  });

  it("keeps the flat play surface at Y=0", () => {
    expect(computeFloorPhysicsY(0.5, 10)).toBe(0);
    expect(computeFloorPhysicsY(30.4, 0)).toBe(0); // under the spawn booths
    expect(computeFloorPhysicsY(-35, -35)).toBe(0); // expanded outer corner region
  });
});

const spec = getBackroomsFloorColliderSpec();
const src = readFileSync(new URL("../../src/levels/backroomsSupermarket.js", import.meta.url), "utf8");

function pointInTri(px, pz, a, b, c) {
  const v0x = c[0] - a[0];
  const v0z = c[1] - a[1];
  const v1x = b[0] - a[0];
  const v1z = b[1] - a[1];
  const v2x = px - a[0];
  const v2z = pz - a[1];
  const den = v0x * v1z - v0z * v1x;
  if (den === 0) return false;
  const u = (v2x * v1z - v2z * v1x) / den;
  const v = (v2z * v0x - v2x * v0z) / den;
  return u >= 0 && v >= 0 && u + v <= 1;
}

function topCovers(x, z) {
  const { vertices, indices } = spec;
  for (let i = 0; i < indices.length; i += 3) {
    const ia = indices[i];
    const ib = indices[i + 1];
    const ic = indices[i + 2];
    const ay = vertices[ia * 3 + 1];
    const by = vertices[ib * 3 + 1];
    const cy = vertices[ic * 3 + 1];
    if (ay !== 0 || by !== 0 || cy !== 0) continue;
    if (pointInTri(
      x, z,
      [vertices[ia * 3], vertices[ia * 3 + 2]],
      [vertices[ib * 3], vertices[ib * 3 + 2]],
      [vertices[ic * 3], vertices[ic * 3 + 2]],
    )) return true;
  }
  return false;
}

describe("Storerooms floor collider spec", () => {
  it("builds one hole-cut prism, not 9 cuboids", () => {
    expect(spec.sliceCount).toBe(9);
    expect(spec.vertices.length).toBeGreaterThan(0);
    expect(spec.indices.length).toBeGreaterThan(0);
    expect(spec.indices.length % 3).toBe(0);
  });

  it("places the floor top at y=0 with the cuboid thickness", () => {
    expect(spec.yTop).toBeCloseTo(0, 9);
    expect(spec.yBottom).toBeCloseTo(-0.6, 9);
    expect(spec.thickness).toBeCloseTo(0.6, 9);
  });

  it("covers the flat drive surface and leaves the four voids open", () => {
    expect(topCovers(0, 8)).toBe(true);
    expect(topCovers(30.4, 0)).toBe(true);
    expect(topCovers(-35, -35)).toBe(true);
    for (const h of spec.holeCenters) {
      expect(topCovers(h.x, h.z)).toBe(false);
    }
  });

  it("uses a FIX_INTERNAL_EDGES trimesh for the flat floor", () => {
    const floor = src.slice(
      src.indexOf("CART-POP-1: one floor trimesh"),
      src.indexOf("Sloped chamfer-lip colliders"),
    );
    expect(floor).toContain("ColliderDesc.trimesh");
    expect(floor).toContain("TriMeshFlags.FIX_INTERNAL_EDGES");
    expect(floor).not.toContain("ColliderDesc.cuboid");
  });
});

