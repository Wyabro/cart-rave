// arenaPool.test.js — Quickplay catalog-order rotation (QP-ORDER-1)

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  QUICKPLAY_ARENA_IDS,
  nextQuickplayArenaId,
} from "../shared/arenaPool.js";

describe("nextQuickplayArenaId", () => {
  it("advances classicRecord → backrooms → zanzibar → classicRecord", () => {
    expect(nextQuickplayArenaId("classicRecord")).toBe("backrooms");
    expect(nextQuickplayArenaId("backrooms")).toBe("zanzibar");
    expect(nextQuickplayArenaId("zanzibar")).toBe("classicRecord");
  });

  it("returns the first entry when current is unknown", () => {
    expect(nextQuickplayArenaId("testArena")).toBe("classicRecord");
    expect(nextQuickplayArenaId("nope")).toBe(QUICKPLAY_ARENA_IDS[0]);
  });

  it("returns the sole entry for a singleton pool", () => {
    expect(nextQuickplayArenaId("classicRecord", ["classicRecord"])).toBe("classicRecord");
    expect(nextQuickplayArenaId("other", ["onlyOne"])).toBe("onlyOne");
  });

  it("returns current when the pool is empty", () => {
    expect(nextQuickplayArenaId("classicRecord", [])).toBe("classicRecord");
  });

  it("differs from current when the pool has multiple unique entries", () => {
    for (const id of QUICKPLAY_ARENA_IDS) {
      expect(nextQuickplayArenaId(id)).not.toBe(id);
    }
  });

  it("party/index.ts starts fresh Quickplay with a random pool entry", () => {
    const src = readFileSync(new URL("../party/index.ts", import.meta.url), "utf8");
    expect(src).toMatch(/Math\.random\(\)\s*\*\s*QUICKPLAY_ARENA_IDS\.length/);
    // * Rematch order stays sequential — do not force every new room onto pool[0].
    expect(src).not.toMatch(/this\.#currentLevelId\s*=\s*QUICKPLAY_ARENA_IDS\[0\]/);
  });

  it("levelOrchestration rematch path uses nextQuickplayArenaId", () => {
    const src = readFileSync(
      new URL("../src/orchestration/levelOrchestration.js", import.meta.url),
      "utf8",
    );
    expect(src).toMatch(/nextQuickplayArenaId\(\s*getCurrentLevelId\(\)\s*\)/);
    expect(src).not.toMatch(/Math\.random\(\)\s*\*\s*pool\.length/);
  });
});
