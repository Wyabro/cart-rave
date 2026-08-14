import { describe, it, expect } from "vitest";
import {
  getFloorSurfaceY,
  computeFloorPhysicsY,
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
