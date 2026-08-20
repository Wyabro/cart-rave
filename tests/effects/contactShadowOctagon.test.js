import { describe, it, expect } from "vitest";
import { octagonEdgeDistance } from "../../src/contactShadows.js";

// Contact-shadow surface test vs the deck that is actually built (08-02, ART-PASS-SUNDIAL-1
// lever 13a).
//
// Sundial's deck is a regular octagon with its FLATS normal to the k·45° directions and its
// VERTICES at 22.5° + k·45° — getZanzibarFloorColliderSpec is one octagon trimesh
// with that vertex ring, and octPath / buildOctHullVertices agree.
//
// isOnSolidPlaySurface used to test the support pair (cos22.5, sin22.5), which describes the
// octagon rotated 22.5° from that. It therefore accepted points 2.61 m out over open water
// off each flat mid, and rejected 2.61 m of real deck at each corner — silently dropping
// every static shadow placed at a vertex angle, which is where all eight bollards live.
//
// simulation.js's octagonEdgeDistance() had the correct formula the whole time; these two
// must not drift apart again.

const APOTHEM = 31.7; // meters — CONFIG.record.radiusByLevel.zanzibar
const COS_HALF = Math.cos(Math.PI / 8);
const CIRCUM_R = APOTHEM / COS_HALF; // 34.312 m — deck vertex radius
const VERTEX_OFFSET = Math.PI / 8; // 22.5°
const TOLERANCE = 0.2; // meters — the epsilon isOnSolidPlaySurface allows

/** Is (x, z) accepted as solid play surface, using the same test the shadows use? */
const onDeck = (x, z) => octagonEdgeDistance(x, z) <= APOTHEM + TOLERANCE;

/** Point at polar (radius, angle). */
const at = (radius, angle) => [Math.cos(angle) * radius, Math.sin(angle) * radius];

describe("octagonEdgeDistance — flats normal to k·45°", () => {
  it("returns the apothem at every flat midpoint", () => {
    for (let k = 0; k < 8; k += 1) {
      const [x, z] = at(APOTHEM, k * (Math.PI / 4));
      expect(octagonEdgeDistance(x, z)).toBeCloseTo(APOTHEM, 6);
    }
  });

  it("returns the apothem at every vertex, which sits at the circumradius", () => {
    for (let k = 0; k < 8; k += 1) {
      const [x, z] = at(CIRCUM_R, VERTEX_OFFSET + k * (Math.PI / 4));
      expect(octagonEdgeDistance(x, z)).toBeCloseTo(APOTHEM, 6);
    }
  });

  it("is the origin's zero and grows monotonically outward", () => {
    expect(octagonEdgeDistance(0, 0)).toBe(0);
    expect(octagonEdgeDistance(10, 0)).toBeLessThan(octagonEdgeDistance(20, 0));
  });
});

describe("solid-play-surface acceptance on Sundial's deck", () => {
  it("accepts the deck edge at a flat midpoint and rejects open water past it", () => {
    for (let k = 0; k < 8; k += 1) {
      const a = k * (Math.PI / 4);
      expect(onDeck(...at(APOTHEM - 0.5, a))).toBe(true);
      expect(onDeck(...at(APOTHEM + 1.0, a))).toBe(false);
    }
  });

  it("does NOT accept the 2.61 m of open water the rotated test allowed off a flat mid", () => {
    // The old test's ceiling at a flat mid was APOTHEM / cos22.5 = the circumradius.
    const [x, z] = at(CIRCUM_R - 0.5, 0);
    expect(onDeck(x, z)).toBe(false);
  });

  it("accepts the deck corners the rotated test rejected", () => {
    for (let k = 0; k < 8; k += 1) {
      const a = VERTEX_OFFSET + k * (Math.PI / 4);
      expect(onDeck(...at(CIRCUM_R - 0.5, a))).toBe(true);
      expect(onDeck(...at(CIRCUM_R + 1.0, a))).toBe(false);
    }
  });

  it("accepts all eight bollard feet", () => {
    // zanzibarPlatform: bollards sit at VERTEX_OFFSET + k·45°, radius circumR × 0.97.
    const bollardRing = CIRCUM_R * 0.97; // 33.28 m
    for (let k = 0; k < 8; k += 1) {
      const [x, z] = at(bollardRing, VERTEX_OFFSET + k * (Math.PI / 4));
      expect(onDeck(x, z)).toBe(true);
    }
  });

  it("keeps the podium and the whole driving band inside", () => {
    for (const radius of [0, 9.5, 20, 27.7, 30]) {
      for (let k = 0; k < 16; k += 1) {
        const [x, z] = at(radius, k * (Math.PI / 8));
        expect(onDeck(x, z)).toBe(true);
      }
    }
  });
});
