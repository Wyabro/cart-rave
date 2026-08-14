import { describe, expect, it } from "vitest";
import { SUNGLASSES_STYLES } from "../../src/carts/cartThemeConfig.js";
import { PROGRESSION_EVENTS } from "../../src/progression/eventIds.js";
import { SUNGLASSES_UNLOCKS } from "../../src/unlockConfig.js";

describe("sunglasses style and unlock registry", () => {
  it("keeps every style paired with one unlock definition", () => {
    expect(Object.keys(SUNGLASSES_UNLOCKS).sort()).toEqual(SUNGLASSES_STYLES.map((s) => s.id).sort());
  });

  it("uses the new round events for the new finishes", () => {
    expect(SUNGLASSES_UNLOCKS.obsidianMirror).toMatchObject({ event: PROGRESSION_EVENTS.ROUND_COMPLETE, goal: 10 });
    expect(SUNGLASSES_UNLOCKS.hazardMirror).toMatchObject({ event: PROGRESSION_EVENTS.ROUND_WIN, goal: 5 });
    expect(SUNGLASSES_UNLOCKS.pearlMirror).toMatchObject({ event: PROGRESSION_EVENTS.ROUND_SCORED, goal: 10 });
  });

  it("keeps the three new palettes distinct from the existing six", () => {
    const newStyles = SUNGLASSES_STYLES.slice(-3);
    expect(newStyles.map((s) => s.label)).toEqual(["Obsidian", "Hazard", "Pearl"]);
    expect(new Set(newStyles.map((s) => s.color)).size).toBe(3);
    for (const style of newStyles) expect(style.gradient).toHaveLength(4);
  });
});
