// @vitest-environment happy-dom
// furnitureWedge.test.js — tangent break-out geometry for the Storerooms center-furniture
// wedge (AI-2). A bot sawing the solid furniture face while chasing a human on the far side
// commits to a tangent that circles the obstacle toward its target, instead of grinding in.
//
// The integrated getAiAxis behavior (reverse-off-furniture gate + avoidance commit) is
// timing/RNG-driven and validated live; this locks the pure escape-vector geometry.

import { describe, it, expect } from "vitest";
import { circularKeepOutTangentEscape } from "../src/simulation.js";

const ORIGIN = { x: 0, z: 0 };

describe("circularKeepOutTangentEscape", () => {
  it("returns a unit heading perpendicular to the outward radial", () => {
    const esc = circularKeepOutTangentEscape(5, 0, ORIGIN);
    expect(Math.hypot(esc.x, esc.z)).toBeCloseTo(1, 5);
    // * Radial from furniture center to cart is (1,0); tangent must be orthogonal to it.
    const radial = { x: 1, z: 0 };
    expect(esc.x * radial.x + esc.z * radial.z).toBeCloseTo(0, 5);
  });

  it("circles toward the chase target (shorter way round)", () => {
    // * Cart at +X of the furniture, target at +Z → escape should point toward +Z.
    const esc = circularKeepOutTangentEscape(5, 0, ORIGIN, 0, 5);
    expect(esc.z).toBeGreaterThan(0);
    // * Still tangent (no radial component toward/away from center).
    expect(esc.x).toBeCloseTo(0, 5);
  });

  it("flips to the other tangent when the target is the opposite way", () => {
    const esc = circularKeepOutTangentEscape(5, 0, ORIGIN, 0, -5);
    expect(esc.z).toBeLessThan(0);
  });

  it("honors a non-origin keep-out center", () => {
    // * Furniture at (10,10); cart 3m north of it; target east of the cart.
    const zone = { x: 10, z: 10 };
    const esc = circularKeepOutTangentEscape(10, 13, zone, 15, 13);
    expect(Math.hypot(esc.x, esc.z)).toBeCloseTo(1, 5);
    // * Radial is +Z; tangent orthogonal, biased toward +X (the target).
    expect(esc.z).toBeCloseTo(0, 5);
    expect(esc.x).toBeGreaterThan(0);
  });

  it("is direction-agnostic without a target (either tangent is valid)", () => {
    const esc = circularKeepOutTangentEscape(0, 4, ORIGIN);
    expect(Math.hypot(esc.x, esc.z)).toBeCloseTo(1, 5);
    // * Radial (0,1) → tangent has no Z component.
    expect(esc.z).toBeCloseTo(0, 5);
  });
});
