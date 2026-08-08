import { describe, expect, it } from "vitest";
import { getContactShadowGradientStops } from "../src/contactShadows.js";

describe("contact-shadow contrast treatment", () => {
  it("keeps a black contact core and a sorted authored outer contrast band", () => {
    const stops = getContactShadowGradientStops(0.92);

    expect(stops.map(([offset]) => offset)).toEqual([...stops.map(([offset]) => offset)].sort((a, b) => a - b));
    expect(stops[0][1]).toBe("rgba(0, 0, 0, 1)");
    expect(stops[3][1]).toBe("rgba(28, 24, 36, 0.16)");
    expect(stops.at(-1)?.[1]).toBe("rgba(0, 0, 0, 0)");
  });

  it("keeps debug softness values from creating an inverted gradient", () => {
    for (const softness of [0, 0.15, 0.5, 1, 2]) {
      const offsets = getContactShadowGradientStops(softness).map(([offset]) => offset);
      expect(offsets).toEqual([...offsets].sort((a, b) => a - b));
    }
  });
});
