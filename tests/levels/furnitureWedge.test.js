// @vitest-environment happy-dom
// furnitureWedge.test.js — tangent break-out geometry for the Storerooms center-furniture
// wedge (AI-2). A bot sawing the solid furniture face while chasing a human on the far side
// commits to a tangent that circles the obstacle toward its target, instead of grinding in.
//
// The integrated getAiAxis behavior (reverse-off-furniture gate + avoidance commit) is
// timing/RNG-driven and validated live; this locks the pure escape-vector geometry.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as THREE from "three";
import {
  applyCircularKeepOutAvoidance,
  circularKeepOutTangentEscape,
  setLevelHazards,
} from "../../src/simulation.js";

const ORIGIN = { x: 0, z: 0 };
const PILE_R = 3.4;
const PILE_MARGIN = 1.7;

/** Registers the Storerooms hazard model with the pile as a `wall` keep-out. */
function registerPileLevel({ wall = true } = {}) {
  setLevelHazards({
    arenaHalf: 38,
    half: 4.25,
    avoidMargin: 2.4,
    influenceBand: 1.6,
    squareHoles: [{ x: 20, z: 20 }],
    circularKeepOuts: [
      { x: 0, z: 0, radius: PILE_R, margin: PILE_MARGIN, solid: true, wall },
    ],
  });
}

/**
 * Steers a heading aimed straight at the pile center from `dist` metres out, chasing a
 * target on the far side, and returns the resulting unit heading.
 */
function headingApproachingPile(dist, angleRad = 0) {
  const px = Math.cos(angleRad) * dist;
  const pz = Math.sin(angleRad) * dist;
  const dir = new THREE.Vector3(-px, 0, -pz).normalize();
  // * Chase target directly beyond the pile — the case that used to drive bots into it.
  applyCircularKeepOutAvoidance(px, pz, dir, -px * 4, -pz * 4);
  return { px, pz, dir };
}

/** Component of `dir` perpendicular to the outward radial at (px, pz) — the go-around steer. */
function lateralComponent(px, pz, dir) {
  const len = Math.hypot(px, pz) || 1;
  return Math.abs(dir.x * (-pz / len) + dir.z * (px / len));
}

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

describe("applyCircularKeepOutAvoidance — furniture pile go-around", () => {
  beforeEach(() => registerPileLevel());
  afterEach(() => setLevelHazards(null));

  // ! Regression lock. The repulsion used to be purely radial, so a heading aimed at the
  // ! pile center produced EXACTLY zero lateral steer at every approach angle — the bot
  // ! could only drive in or flee straight back, never route around, and it oscillated
  // ! across the sign flip until it plowed into the pile (playtest 2026-08-14).
  it("produces lateral steer at every head-on approach angle", () => {
    for (let deg = 0; deg < 360; deg += 15) {
      const rad = (deg * Math.PI) / 180;
      const { px, pz, dir } = headingApproachingPile(5.0, rad);
      expect(lateralComponent(px, pz, dir)).toBeGreaterThan(0.3);
    }
  });

  it("engages well before the cart reaches the obstacle", () => {
    // * Tangent reach is edge + margin * 2.2 = 8.84m; the old radial band did nothing useful.
    const far = headingApproachingPile(8.0);
    expect(lateralComponent(far.px, far.pz, far.dir)).toBeGreaterThan(0.05);
  });

  it("leaves the heading untouched outside the tangent reach", () => {
    const { px, pz, dir } = headingApproachingPile(12.0);
    expect(dir.x).toBeCloseTo(-1, 5);
    expect(lateralComponent(px, pz, dir)).toBeCloseTo(0, 5);
  });

  it("never collapses the heading to a degenerate near-zero vector", () => {
    // ! The old radial blend cancelled the heading to |dir| ~ 0.01 around 5.75m out, so
    // ! normalize() amplified floating-point noise into a random steer.
    for (let d = 3.6; d <= 9.0; d += 0.05) {
      const { dir } = headingApproachingPile(d);
      expect(Math.hypot(dir.x, dir.z)).toBeCloseTo(1, 3);
    }
  });

  it("rounds the pile on the side that leads toward the chase target", () => {
    // * Cart at +X, human parked at +Z beyond the pile → curve toward +Z, not away.
    const dir = new THREE.Vector3(-1, 0, 0);
    applyCircularKeepOutAvoidance(5, 0, dir, 0, 6);
    expect(dir.z).toBeGreaterThan(0);

    const mirrored = new THREE.Vector3(-1, 0, 0);
    applyCircularKeepOutAvoidance(5, 0, mirrored, 0, -6);
    expect(mirrored.z).toBeLessThan(0);
  });

  it("still pushes radially away when the cart is already alongside the pile", () => {
    // * Driving tangentially past the obstacle: no head-on component, so the tangent term
    // * stays out of it and the original radial keep-out behavior governs.
    const dir = new THREE.Vector3(0, 0, 1);
    applyCircularKeepOutAvoidance(PILE_R + 0.5, 0, dir, 0, 20);
    expect(dir.x).toBeGreaterThan(0);
  });

  it("leaves drivable (non-wall) keep-outs on the original radial-only behavior", () => {
    // * Sundial's podium is solid but drivable; its steering must not gain a go-around term.
    registerPileLevel({ wall: false });
    const { px, pz, dir } = headingApproachingPile(5.0);
    expect(lateralComponent(px, pz, dir)).toBeCloseTo(0, 5);
  });
});
