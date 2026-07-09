import { describe, it, expect } from "vitest";
import { getZanzibarFloorColliderSpec } from "../src/levels/zanzibarPlatform.js";

// Sundial Station floor invariants (2026-07-09 feedback round):
//
// 1. FLAT SURFACES ARE CUBOIDS, NOT HULLS. Resting carts (roundCuboid colliders)
//    visibly jitter on large convex-hull faces but sit rock-solid on cuboids — observed
//    directly in play (spawn booths = cuboids = stable; the old hull deck = jitter).
//    The deck and podium crown are each four rotated cuboids whose union is EXACTLY the
//    visual octagon; every top face shares one plane with identical +y normals.
//
// 2. THE RAMP HULL IS NEVER COPLANAR WITH A CUBOID. Hull faces exactly coplanar with
//    another collider flip contact ownership frame-to-frame (the Storerooms CHAMFER_TUCK
//    lesson), so the podium ramp hull is tucked below the cap plane at its crest and
//    below the deck plane at its base.

const DECK_THICKNESS = 0.6; // keep in sync with zanzibarPlatform.js
const PODIUM_HEIGHT = 0.5;
const MIN_TUCK = 0.01; // meters — minimum separation from any shared plane

const circumR = 31.7 / Math.cos(Math.PI / 8); // enlarged deck (apothem 31.7)
const APOTHEM = 31.7;
const spec = getZanzibarFloorColliderSpec(circumR);

/** Point-in-octagon test (flats normal to the k·45° directions, apothem A). */
function insideOctagon(x, z, A) {
  const ax = Math.abs(x);
  const az = Math.abs(z);
  return Math.max(ax, az, (ax + az) * Math.SQRT1_2) <= A;
}

/** Point covered by one rotated rectangle from the spec. */
function insideRect(x, z, rect) {
  const cos = Math.cos(rect.yaw);
  const sin = Math.sin(rect.yaw);
  const lx = x * cos + z * sin;
  const lz = -x * sin + z * cos;
  return Math.abs(lx) <= rect.halfLength && Math.abs(lz) <= rect.halfWidth;
}

function coveredBy(rects, x, z) {
  return rects.some((r) => insideRect(x, z, r));
}

/** Y values of a hull's vertex array (Float32Array of xyz triples). */
function hullYs(hull) {
  const out = [];
  for (let i = 1; i < hull.length; i += 3) out.push(hull[i]);
  return out;
}

describe("Sundial Station cuboid deck decomposition", () => {
  it("uses four rectangles rotated 45° apart for deck and podium caps", () => {
    for (const rects of [spec.deckRects, spec.podiumCaps]) {
      expect(rects.length).toBe(4);
      const yaws = rects.map((r) => r.yaw).sort((a, b) => a - b);
      for (let k = 0; k < 4; k += 1) {
        expect(yaws[k]).toBeCloseTo(k * (Math.PI / 4), 9);
      }
    }
  });

  it("deck rect union covers exactly the visual octagon (no gaps, no overhang)", () => {
    const eps = 0.02; // skip points within 2 cm of the boundary (numeric edge)
    let checked = 0;
    for (let x = -circumR; x <= circumR; x += 0.37) {
      for (let z = -circumR; z <= circumR; z += 0.37) {
        const inOct = insideOctagon(x, z, APOTHEM - eps);
        const outOct = !insideOctagon(x, z, APOTHEM + eps);
        const covered = coveredBy(spec.deckRects, x, z);
        if (inOct) {
          expect(covered, `visible deck must be supported at (${x.toFixed(2)}, ${z.toFixed(2)})`).toBe(true);
        } else if (outOct) {
          expect(covered, `no invisible support past the kill edge at (${x.toFixed(2)}, ${z.toFixed(2)})`).toBe(false);
        }
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(30000);
  });

  it("all deck cuboid tops are coplanar at y=0 with the tuned thickness", () => {
    for (const r of spec.deckRects) {
      expect(r.centerY + r.halfHeight).toBeCloseTo(0, 9);
      expect(r.halfHeight * 2).toBeCloseTo(DECK_THICKNESS, 9);
    }
  });

  it("all podium cap tops are coplanar at the podium height", () => {
    for (const r of spec.podiumCaps) {
      expect(r.centerY + r.halfHeight).toBeCloseTo(PODIUM_HEIGHT, 9);
    }
  });
});

describe("Sundial Station ramp hull separation (anti-jitter tucks)", () => {
  const ys = hullYs(spec.podiumHull);
  const crest = Math.max(...ys);
  const base = Math.min(...ys);

  it("tucks the hull crest strictly below the podium cap plane", () => {
    expect(crest).toBeLessThanOrEqual(PODIUM_HEIGHT - MIN_TUCK);
    // ...but close enough that the step never catches a cart (< roundRadius 0.08).
    expect(PODIUM_HEIGHT - crest).toBeLessThan(0.08);
  });

  it("tucks the hull base strictly below the deck top plane", () => {
    expect(base).toBeLessThanOrEqual(-MIN_TUCK);
    expect(base).toBeGreaterThan(-DECK_THICKNESS);
  });

  it("has no hull vertex on either shared plane", () => {
    for (const y of ys) {
      expect(Math.abs(y)).toBeGreaterThan(1e-6); // deck plane
      expect(Math.abs(y - PODIUM_HEIGHT)).toBeGreaterThan(1e-6); // cap plane
    }
  });
});
