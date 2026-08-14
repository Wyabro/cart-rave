import { describe, expect, it } from "vitest";
import { boostChargeProgress01 } from "../src/carts/cartThemes.js";

describe("boostChargeProgress01", () => {
  it("returns 0 when not charging", () => {
    expect(boostChargeProgress01(false, 1000, 2000, 1500)).toBe(0);
  });

  it("returns 0 at charge start", () => {
    expect(boostChargeProgress01(true, 1000, 1000, 1500)).toBe(0);
  });

  it("returns mid progress during charge", () => {
    expect(boostChargeProgress01(true, 1000, 1750, 1500)).toBeCloseTo(0.5, 5);
  });

  it("clamps at 1 after full charge time", () => {
    expect(boostChargeProgress01(true, 1000, 3000, 1500)).toBe(1);
  });

  it("handles missing/zero charge duration", () => {
    expect(boostChargeProgress01(true, 0, 750, 0)).toBe(0.5);
  });
});
