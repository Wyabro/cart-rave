import { describe, expect, it } from "vitest";
import { clampJsonObject } from "../../party/logUtil.ts";

describe("clampJsonObject", () => {
  it("keeps valid JSON at the cap and prefers kos/country", () => {
    const obj = { kos: 12, country: "US", region: "UT", returning: 1, extra: "x".repeat(80) };
    const s = clampJsonObject(obj, 80);
    expect(() => JSON.parse(s)).not.toThrow();
    const parsed = JSON.parse(s);
    expect(parsed.kos).toBe(12);
    expect(parsed.country).toBe("US");
    expect(s.length).toBeLessThanOrEqual(80);
  });

  it("never returns sliced invalid JSON", () => {
    const s = clampJsonObject({ kos: 1, blob: "y".repeat(600) }, 40);
    expect(() => JSON.parse(s)).not.toThrow();
    expect(JSON.parse(s).kos).toBe(1);
  });
});
