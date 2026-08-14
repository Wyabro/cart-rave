import { describe, expect, it } from "vitest";
import { getArenaKoPresentationProfile } from "../../src/levels/arenaReactiveLights.js";

describe("getArenaKoPresentationProfile", () => {
  it("makes a critical KO stronger than a normal KO", () => {
    const normal = getArenaKoPresentationProfile({ isKill: true, wasCritical: false });
    const critical = getArenaKoPresentationProfile({ isKill: true, wasCritical: true });

    expect(critical.strength).toBeGreaterThan(normal.strength);
    expect(critical.hitmarkerIntensity).toBeGreaterThan(normal.hitmarkerIntensity);
    expect(critical.durationMs).toBe(normal.durationMs);
  });

  it("keeps a self-fall subdued even when a bad event carries critical", () => {
    const self = getArenaKoPresentationProfile({ isKill: false, wasCritical: true });

    expect(self).toEqual({ strength: 0.35, durationMs: 240, hitmarkerIntensity: 0.6 });
  });

  it("keeps first blood as an additional multiplier", () => {
    const normal = getArenaKoPresentationProfile({ isKill: true, wasCritical: true });
    const firstBlood = getArenaKoPresentationProfile({ isKill: true, wasCritical: true }, true);

    expect(firstBlood.strength).toBeCloseTo(normal.strength * 1.45, 6);
    expect(firstBlood.hitmarkerIntensity).toBeCloseTo(normal.hitmarkerIntensity * 1.45, 6);
    expect(firstBlood.durationMs).toBeCloseTo(normal.durationMs * 1.3, 6);
  });
});
