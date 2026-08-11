import { describe, expect, it } from "vitest";
import { sampleNightShiftSurface } from "../src/levels/nightShiftMaterials.js";

describe("Night Shift procedural materials", () => {
  it("samples deterministic causal surface fields", () => {
    expect(sampleNightShiftSurface("roof", 17, 29)).toEqual(
      sampleNightShiftSurface("roof", 17, 29),
    );
    expect(sampleNightShiftSurface("roof", 17, 29)).not.toEqual(
      sampleNightShiftSurface("roof", 18, 29),
    );
  });

  it("makes damp wear smoother and seams rougher from the same field", () => {
    const samples = [];
    for (let y = 0; y < 256; y += 7) {
      for (let x = 0; x < 256; x += 7) samples.push(sampleNightShiftSurface("roof", x, y));
    }
    const damp = samples.reduce((best, sample) => sample.damp > best.damp ? sample : best);
    const dry = samples.find((sample) => sample.damp === 0 && sample.seam === 0);
    const seam = sampleNightShiftSurface("roof", 64, 64);
    expect(damp.damp).toBeGreaterThan(0.1);
    expect(damp.roughness).toBeLessThan(dry.roughness);
    expect(seam.seam).toBe(1);
    expect(seam.height).toBeLessThan(dry.height);
  });

  it("adds vertical streak wear only to facade fields", () => {
    let facadeStreak = null;
    for (let x = 0; x < 96 && !facadeStreak; x += 1) {
      const sample = sampleNightShiftSurface("facade", x, 80);
      if (sample.streak > 0.2) facadeStreak = sample;
    }
    expect(facadeStreak).not.toBeNull();
    expect(sampleNightShiftSurface("roof", 15, 80).streak).toBe(0);
  });
});
