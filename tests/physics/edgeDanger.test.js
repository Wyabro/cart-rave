// edgeDanger.test.js — world threat direction → chase-cam screen sides (hit vignette).

import { describe, it, expect } from "vitest";
import { sideWeightsFromCartBasis } from "../../src/utils/edgeDanger.js";

describe("sideWeightsFromCartBasis", () => {
  // * Cart facing -Z (forward), right = +X
  const basis = { fX: 0, fZ: -1, rX: 1, rZ: 0 };

  it("maps forward threat to top", () => {
    const s = sideWeightsFromCartBasis(1, 0, -1, basis.fX, basis.fZ, basis.rX, basis.rZ);
    expect(s.top).toBeGreaterThan(0.9);
    expect(s.bottom).toBe(0);
  });

  it("maps rear threat to bottom", () => {
    const s = sideWeightsFromCartBasis(1, 0, 1, basis.fX, basis.fZ, basis.rX, basis.rZ);
    expect(s.bottom).toBeGreaterThan(0.9);
    expect(s.top).toBe(0);
  });

  it("maps right threat to right", () => {
    const s = sideWeightsFromCartBasis(1, 1, 0, basis.fX, basis.fZ, basis.rX, basis.rZ);
    expect(s.right).toBeGreaterThan(0.9);
    expect(s.left).toBe(0);
  });

  it("maps left threat to left", () => {
    const s = sideWeightsFromCartBasis(1, -1, 0, basis.fX, basis.fZ, basis.rX, basis.rZ);
    expect(s.left).toBeGreaterThan(0.9);
    expect(s.right).toBe(0);
  });

  it("splits a diagonal threat across both facing sides", () => {
    const inv = Math.SQRT1_2;
    const s = sideWeightsFromCartBasis(1, inv, -inv, basis.fX, basis.fZ, basis.rX, basis.rZ);
    expect(s.top).toBeGreaterThan(0.3);
    expect(s.right).toBeGreaterThan(0.3);
    expect(s.bottom).toBe(0);
    expect(s.left).toBe(0);
  });

  it("is zero at zero intensity", () => {
    const s = sideWeightsFromCartBasis(0, 0, -1, basis.fX, basis.fZ, basis.rX, basis.rZ);
    expect(s).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
  });

  it("falls back to uniform low glow on a degenerate direction", () => {
    const s = sideWeightsFromCartBasis(1, 0, 0, basis.fX, basis.fZ, basis.rX, basis.rZ);
    expect(s.top).toBeCloseTo(0.35, 5);
    expect(s.right).toBeCloseTo(0.35, 5);
    expect(s.bottom).toBeCloseTo(0.35, 5);
    expect(s.left).toBeCloseTo(0.35, 5);
  });
});
