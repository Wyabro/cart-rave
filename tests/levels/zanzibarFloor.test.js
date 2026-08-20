import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { getZanzibarFloorColliderSpec } from "../../src/levels/zanzibarPlatform.js";

// Sundial Station floor invariants (CART-POP-1):
//
// 1. FLATS ARE ONE TRIMESH EACH, NOT OVERLAPPING CUBOIDS AND NOT A HULL.
//    Four overlapping cuboids launched a supported cart at ~24 m/s (tilted nY 0.919).
//    Convex hulls jitter at rest (2026-07-09). Classic used one annulus trimesh with
//    FIX_INTERNAL_EDGES; Sundial uses one octagon prism with the same flag.
//
// 2. THE RAMP HULL IS NEVER COPLANAR WITH A FLAT. Hull faces exactly coplanar with
//    another collider flip contact ownership frame-to-frame (the Storerooms CHAMFER_TUCK
//    lesson), so the podium ramp hull is tucked below the cap plane at its crest and
//    below the deck plane at its base.

const DECK_THICKNESS = 0.6; // keep in sync with zanzibarPlatform.js
const PODIUM_HEIGHT = 0.5;
const PODIUM_TOP_R = 6.6;
const PODIUM_CAP_THICKNESS = 0.12;
const MIN_TUCK = 0.01; // meters — minimum separation from any shared plane

const circumR = 31.7 / Math.cos(Math.PI / 8); // enlarged deck (apothem 31.7)
const APOTHEM = 31.7;
const VERTEX_OFFSET = Math.PI / 8;
const spec = getZanzibarFloorColliderSpec(circumR);
const src = readFileSync(new URL("../../src/levels/zanzibarPlatform.js", import.meta.url), "utf8");

/** Point-in-octagon test (flats normal to the k·45° directions, apothem A). */
function insideOctagon(x, z, A) {
  const ax = Math.abs(x);
  const az = Math.abs(z);
  return Math.max(ax, az, (ax + az) * Math.SQRT1_2) <= A;
}

/** Y values of a hull's vertex array (Float32Array of xyz triples). */
function hullYs(hull) {
  const out = [];
  for (let i = 1; i < hull.length; i += 3) out.push(hull[i]);
  return out;
}

function topRing(mesh) {
  const out = [];
  for (let i = 0; i < mesh.sides; i += 1) {
    out.push({
      x: mesh.vertices[i * 3],
      y: mesh.vertices[i * 3 + 1],
      z: mesh.vertices[i * 3 + 2],
    });
  }
  return out;
}

describe("Sundial Station octagon deck trimesh", () => {
  it("builds one 8-side prism for the deck, not four cuboids", () => {
    expect(spec.deckTrimesh.sides).toBe(8);
    expect(spec.deckTrimesh.vertices.length).toBe(8 * 2 * 3);
    expect(spec.deckTrimesh.indices.length).toBe((6 + 6 + 8 * 2) * 3);
    expect(spec.deckRects).toBeUndefined();
    expect(spec.podiumCaps).toBeUndefined();
  });

  it("places the deck top at y=0 with the tuned thickness", () => {
    expect(spec.deckTrimesh.yTop).toBeCloseTo(0, 9);
    expect(spec.deckTrimesh.yBottom).toBeCloseTo(-DECK_THICKNESS, 9);
    for (const v of topRing(spec.deckTrimesh)) {
      expect(v.y).toBeCloseTo(0, 9);
    }
  });

  it("places deck vertices on the visual octagon (no gaps, no overhang)", () => {
    const verts = topRing(spec.deckTrimesh);
    expect(verts.length).toBe(8);
    verts.forEach((v, i) => {
      const a = VERTEX_OFFSET + i * (Math.PI / 4);
      expect(v.x).toBeCloseTo(Math.cos(a) * circumR, 5);
      expect(v.z).toBeCloseTo(Math.sin(a) * circumR, 5);
      expect(insideOctagon(v.x, v.z, APOTHEM + 1e-6)).toBe(true);
      expect(Math.hypot(v.x, v.z)).toBeCloseTo(circumR, 5);
    });
  });

  it("uses a FIX_INTERNAL_EDGES trimesh for the deck and podium cap", () => {
    const floor = src.slice(
      src.indexOf("CART-POP-1: one octagon trimesh per flat"),
      src.indexOf("Drivable ramp ring"),
    );
    expect(floor).toContain("ColliderDesc.trimesh");
    expect(floor).toContain("TriMeshFlags.FIX_INTERNAL_EDGES");
    expect(floor).not.toContain("ColliderDesc.convexHull");
    expect(floor).not.toContain("ColliderDesc.cuboid");
    expect(src).toContain("addTrimeshCollider(spec.deckTrimesh)");
    expect(src).toContain("addTrimeshCollider(spec.podiumCapTrimesh)");
  });
});

describe("Sundial Station podium cap trimesh", () => {
  it("places the cap top at the podium height", () => {
    expect(spec.podiumCapTrimesh.sides).toBe(8);
    expect(spec.podiumCapTrimesh.yTop).toBeCloseTo(PODIUM_HEIGHT, 9);
    expect(spec.podiumCapTrimesh.yBottom).toBeCloseTo(PODIUM_HEIGHT - PODIUM_CAP_THICKNESS, 9);
    expect(spec.podiumCapTrimesh.circumR).toBeCloseTo(PODIUM_TOP_R, 9);
    for (const v of topRing(spec.podiumCapTrimesh)) {
      expect(v.y).toBeCloseTo(PODIUM_HEIGHT, 9);
      expect(Math.hypot(v.x, v.z)).toBeCloseTo(PODIUM_TOP_R, 5);
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
