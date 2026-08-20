// @vitest-environment happy-dom
// octagonRimSafety.test.js — AI-ARENA-SELFKO-1 Sundial rim TTE + boost exit abort.
// Pattern mirrors Classic outer-rim TTE; boost helper must no-op off octagon arenas.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  computeOctagonRimStrength,
  octagonSecondsToEdge,
  octagonOutwardAxis,
  boostSegmentExitsClassicDisc,
  boostSegmentExitsOctagon,
  isOctagonArenaActive,
  setLevelHazards,
} from "../../src/simulation.js";

/** Sundial-style apothem (meters). */
const APOTHEM = 26.4;
const BAND = 5.25;

function registerOctagon() {
  setLevelHazards({ isOctagon: true, arenaHalf: APOTHEM });
}

describe("computeOctagonRimStrength (Sundial TTE)", () => {
  it("is zero well inside the band", () => {
    // * Center-ish: far from apothem − band.
    expect(computeOctagonRimStrength(0, 0, 0, 0, APOTHEM, BAND)).toBe(0);
    expect(computeOctagonRimStrength(10, 0, 20, 0, APOTHEM, BAND)).toBe(0);
  });

  it("static band alone is modest when not moving outward", () => {
    // * Near mid-flat rim, edgeDist ≈ 24 (inside apothem 26.4, inside band from 21.15).
    const px = 24;
    const pz = 0;
    const staticOnly = computeOctagonRimStrength(px, pz, 0, 0, APOTHEM, BAND);
    expect(staticOnly).toBeGreaterThan(0);
    expect(staticOnly).toBeLessThanOrEqual(1.5);
  });

  it("high outward speed near rim reaches Classic-style panic floor (≥ 1.0)", () => {
    // * gap = apothem − edgeDist ≈ 26.4 − 24 = 2.4 m; outward 23.5 m/s → tte ≈ 0.10 s ≪ 0.55.
    // * TTE strength = clamp((0.55 − tte) / 0.55) * 1.6 ≈ 1.3+ — above static alone.
    const px = 24;
    const pz = 0;
    const lvx = 23.5;
    const lvz = 0;
    const strength = computeOctagonRimStrength(px, pz, lvx, lvz, APOTHEM, BAND);
    expect(strength).toBeGreaterThanOrEqual(1.0);
    expect(strength).toBeLessThanOrEqual(1.6);
    const idle = computeOctagonRimStrength(px, pz, 0, 0, APOTHEM, BAND);
    expect(strength).toBeGreaterThan(idle);
  });

  it("does not engage TTE when outward speed ≤ 0.5 (rim campers keep static only)", () => {
    const px = 24;
    const pz = 0;
    const slow = computeOctagonRimStrength(px, pz, 0.4, 0, APOTHEM, BAND);
    const idle = computeOctagonRimStrength(px, pz, 0, 0, APOTHEM, BAND);
    expect(slow).toBeCloseTo(idle, 5);
  });

  it("inward velocity does not inflate strength past static", () => {
    const px = 24;
    const pz = 0;
    const inward = computeOctagonRimStrength(px, pz, -20, 0, APOTHEM, BAND);
    const idle = computeOctagonRimStrength(px, pz, 0, 0, APOTHEM, BAND);
    expect(inward).toBeCloseTo(idle, 5);
  });

  it("NPC-SELFKO-3: TTE panics outside the 5.25 m static band at maxSpeed", () => {
    // * Sundial soak: TTE gated on the band never fired until 0.22 s from the lip.
    // * 8.4 m from apothem 26.4, outward 23.5 m/s → tte ≈ 0.36 s < 0.55.
    const px = 18;
    const pz = 0;
    expect(px).toBeLessThan(APOTHEM - BAND);
    const idle = computeOctagonRimStrength(px, pz, 0, 0, APOTHEM, BAND);
    expect(idle).toBe(0);
    const diving = computeOctagonRimStrength(px, pz, 23.5, 0, APOTHEM, BAND);
    expect(diving).toBeGreaterThan(0.4);
    expect(octagonSecondsToEdge(px, pz, 23.5, 0, APOTHEM)).toBeCloseTo(8.4 / 23.5, 3);
  });
});

describe("octagonOutwardAxis", () => {
  it("points at the +X flat on the axis and the diagonal flat in a corner", () => {
    expect(octagonOutwardAxis(20, 0)).toEqual({ x: 1, z: 0 });
    expect(octagonOutwardAxis(20, 20).x).toBeCloseTo(Math.SQRT1_2, 8);
    expect(octagonOutwardAxis(20, 20).z).toBeCloseTo(Math.SQRT1_2, 8);
  });
});

describe("boostSegmentExitsOctagon", () => {
  afterEach(() => setLevelHazards(null));

  it("no-ops (false) when octagon hazards are not registered", () => {
    setLevelHazards(null);
    expect(isOctagonArenaActive()).toBe(false);
    expect(boostSegmentExitsOctagon(0, 0, 30, 0, 1.25)).toBe(false);
  });

  it("no-ops on Storerooms-style square-hole hazards", () => {
    setLevelHazards({
      arenaHalf: 38,
      half: 4.25,
      avoidMargin: 2.4,
      influenceBand: 1.6,
      squareHoles: [{ x: 20, z: 20 }],
    });
    expect(isOctagonArenaActive()).toBe(false);
    expect(boostSegmentExitsOctagon(0, 0, 30, 0, 1.25)).toBe(false);
  });

  it("returns true when an endpoint is outside apothem − margin", () => {
    registerOctagon();
    expect(isOctagonArenaActive()).toBe(true);
    // * safe = 26.4 − 1.25 = 25.15; point at 26 is past safe on the +X flat.
    expect(boostSegmentExitsOctagon(0, 0, 26, 0, 1.25)).toBe(true);
    expect(boostSegmentExitsOctagon(26, 0, 0, 0, 1.25)).toBe(true);
  });

  it("returns false when both endpoints are inside the safe deck", () => {
    registerOctagon();
    // * Well inside safe (25.15).
    expect(boostSegmentExitsOctagon(0, 0, 10, 5, 1.25)).toBe(false);
    expect(boostSegmentExitsOctagon(20, 0, 18, 4, 1.25)).toBe(false);
  });

  it("respects a tighter margin (1.5 vs 1.0) at the same point", () => {
    registerOctagon();
    // * edgeDist = 25.5; safe@1.0 = 25.4 → exit; safe@1.5 = 24.9 → exit both true.
    // * Point at 25.2: safe@1.0 = 25.4 → inside; safe@1.5 = 24.9 → outside.
    const px = 25.2;
    expect(boostSegmentExitsOctagon(0, 0, px, 0, 1.0)).toBe(false);
    expect(boostSegmentExitsOctagon(0, 0, px, 0, 1.5)).toBe(true);
  });
});

describe("boostSegmentExitsClassicDisc", () => {
  afterEach(() => setLevelHazards(null));

  it("rejects a boost runway that crosses the Classic outer death rim", () => {
    setLevelHazards(null);
    expect(boostSegmentExitsClassicDisc(12, 0, 26, 0, 1.25)).toBe(true);
  });

  it("allows an inward Classic runway and no-ops for an octagon arena", () => {
    setLevelHazards(null);
    expect(boostSegmentExitsClassicDisc(12, 0, -6, 0, 1.25)).toBe(false);
    registerOctagon();
    expect(boostSegmentExitsClassicDisc(12, 0, 26, 0, 1.25)).toBe(false);
  });
});
