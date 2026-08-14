import { describe, it, expect } from "vitest";
import * as THREE from "three";

// SHADOW-TILT-1 (fixed 2026-08-02) — cart contact shadows must stay FLAT on the floor at
// every cart yaw.
//
// createBlobMesh builds the quad with rotation.x = -PI/2 to lay it down. updateCartContactShadow
// then applied the cart's yaw. Under three's default XYZ Euler order those two do not compose
// into "a flat quad, spun" — a rotation.y on top of the -PI/2 X rotation TILTS the quad out of
// the floor plane entirely. The composed normal is (sin yaw, cos yaw, 0): correct at yaw 0,
// half-tilted at 45 deg, and exactly edge-on — invisible — at +/-90 deg. Since the footprint is
// a true circle, the symptom in play was a shadow that thinned and vanished as you turned.
//
// rotation.z composes AFTER the X rotation and spins the quad about its own normal, so the
// normal stays (0,1,0) at every yaw. On a circular footprint that makes the yaw a visual no-op,
// which is the point: the blob is supposed to be a flat centred circle (Run-6 ruling).
//
// These tests assert the composition directly rather than going through createBlobMesh, which
// needs a canvas (document.createElement) and would drag a DOM environment in for pure math.

const YAWS = [0, Math.PI / 6, Math.PI / 4, Math.PI / 3, Math.PI / 2, Math.PI, -Math.PI / 2];

/** Reproduces the blob's transform: laid flat by rotation.x, then spun on `axis`. */
function blobNormal(yaw, axis) {
  const mesh = new THREE.Object3D();
  mesh.rotation.x = -Math.PI / 2;
  mesh.rotation[axis] = yaw;
  mesh.updateMatrixWorld(true);
  return new THREE.Vector3(0, 0, 1).transformDirection(mesh.matrixWorld);
}

describe("cart contact shadow stays flat on the floor", () => {
  it("keeps the surface normal at (0,1,0) for every yaw", () => {
    for (const yaw of YAWS) {
      const n = blobNormal(yaw, "z");
      expect(n.x).toBeCloseTo(0, 6);
      expect(n.y).toBeCloseTo(1, 6);
      expect(n.z).toBeCloseTo(0, 6);
    }
  });

  it("keeps the quad's projected floor area constant across yaw", () => {
    // Area seen from above scales with the normal's Y component.
    const areas = YAWS.map((yaw) => Math.abs(blobNormal(yaw, "z").y));
    for (const a of areas) expect(a).toBeCloseTo(1, 6);
  });

  it("spins the quad within the floor plane, so a circular footprint is unchanged", () => {
    // The in-plane axes must stay in the floor plane (zero Y) while actually rotating.
    const mesh = new THREE.Object3D();
    mesh.rotation.x = -Math.PI / 2;
    mesh.rotation.z = Math.PI / 2;
    mesh.updateMatrixWorld(true);
    const ex = new THREE.Vector3(1, 0, 0).transformDirection(mesh.matrixWorld);
    expect(ex.y).toBeCloseTo(0, 6);
    expect(Math.hypot(ex.x, ex.z)).toBeCloseTo(1, 6);
  });
});

describe("the rotation.y form this replaced (regression guard)", () => {
  it("tilted the quad out of the floor, and vanished it at +/-90 deg", () => {
    // Documents the defect so nobody "simplifies" rotation.z back to rotation.y.
    expect(blobNormal(0, "y").y).toBeCloseTo(1, 6);
    expect(blobNormal(Math.PI / 4, "y").y).toBeCloseTo(Math.SQRT1_2, 6);

    const edgeOn = blobNormal(Math.PI / 2, "y");
    expect(edgeOn.y).toBeCloseTo(0, 6); // no floor-facing area left at all
    expect(Math.abs(edgeOn.x)).toBeCloseTo(1, 6);
  });

  it("is strictly worse than rotation.z at every non-zero yaw", () => {
    for (const yaw of YAWS.filter((y) => Math.abs(y) > 1e-9 && Math.abs(Math.abs(y) - Math.PI) > 1e-9)) {
      expect(Math.abs(blobNormal(yaw, "y").y)).toBeLessThan(Math.abs(blobNormal(yaw, "z").y));
    }
  });
});
