// compareLuma.test.js — computeLumaStats metric definition (ART-LUMA-TOOL-1)
//
// Guards art-direction.md Rule 3's measurement: Rec.709 luma on raw sRGB bytes,
// floor = darkest-decile mean, median, mean, pure-black %. Deterministic on a
// synthetic buffer — no capture or GPU needed.

import { describe, expect, it } from "vitest";
import { computeLumaStats } from "../tools/compare.mjs";

/** Build an RGBA byte buffer from a list of [r, g, b] pixels (alpha 255). */
function rgba(pixels) {
  const data = new Uint8ClampedArray(pixels.length * 4);
  pixels.forEach(([r, g, b], i) => {
    const o = i * 4;
    data[o] = r;
    data[o + 1] = g;
    data[o + 2] = b;
    data[o + 3] = 255;
  });
  return data;
}

describe("computeLumaStats", () => {
  it("all-black frame → zero floor/median/mean, 100% black", () => {
    const stats = computeLumaStats(rgba([[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]]), 2, 2);
    expect(stats.floor).toBe(0);
    expect(stats.median).toBe(0);
    expect(stats.mean).toBe(0);
    expect(stats.blackPct).toBe(100);
  });

  it("Rec.709 luma matches the documented weights on known bytes", () => {
    // 255·0.2126 = 54.213, 255·0.7152 = 182.376, 255·0.0722 = 18.411
    const stats = computeLumaStats(rgba([
      [255, 0, 0],
      [0, 255, 0],
      [0, 0, 255],
      [255, 255, 255],
    ]), 2, 2);
    expect(stats.mean).toBeCloseTo((54.213 + 182.376 + 18.411 + 255) / 4, 3);
    expect(stats.blackPct).toBe(0);
  });

  it("floor is the darkest-decile mean (N = floor(0.1·count))", () => {
    // 12 pixels: darkest decile = 1.2 → N = 1 → the single 0-luma pixel.
    const pixels = [[0, 0, 0]];
    for (let i = 0; i < 11; i += 1) pixels.push([255, 255, 255]);
    const stats = computeLumaStats(rgba(pixels), 4, 3);
    expect(stats.floor).toBe(0);
    expect(stats.blackPct).toBeCloseTo(100 / 12, 1);
  });

  it("median averages the two middle values for even counts", () => {
    // Sorted luma: 0, 18.411, 54.213, 182.376 → (18.411 + 54.213) / 2 = 36.312
    const stats = computeLumaStats(rgba([
      [255, 0, 0],
      [0, 255, 0],
      [0, 0, 255],
      [0, 0, 0],
    ]), 2, 2);
    expect(stats.median).toBeCloseTo((18.411 + 54.213) / 2, 2);
  });

  it("black % counts only luma that rounds to 0", () => {
    // 3 pure-black + 1 near-black (1,1,1 → luma 1) → 75% black.
    const stats = computeLumaStats(rgba([
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
      [1, 1, 1],
    ]), 2, 2);
    expect(stats.blackPct).toBe(75);
  });
});
