import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { QUICKPLAY_ARENA_IDS } from "../../shared/arenaPool.js";
import { ARENA_CATALOG } from "../../src/levels/arenaCatalog.js";
import { LEVEL_IMPORTERS, resolveLevelId } from "../../src/levels/index.js";
import { FREE_LEVEL, LEVEL_UNLOCKS } from "../../src/unlockConfig.js";
import { normalizeState } from "../../src/stores/unlockStore.js";
import { LEVEL_MUSIC } from "../../src/music/levelMusic.js";
import { ARENA_AMBIENCE } from "../../src/ambience/arenaAmbience.js";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const INDEX_HTML = readFileSync(path.join(ROOT_DIR, "index.html"), "utf8");
const MENU_LEVEL_IDS = new Set(
  [...INDEX_HTML.matchAll(/\bdata-level="([^"]+)"/g)].map((match) => match[1]),
);

describe("ARENA_CATALOG", () => {
  it("matches the Worker quickplay pool in deterministic order", () => {
    const catalogQuickplayIds = ARENA_CATALOG
      .filter((arena) => arena.quickplay)
      .map((arena) => arena.id);

    expect(catalogQuickplayIds).toEqual(QUICKPLAY_ARENA_IDS);
  });

  it("gives every quickplay arena complete authoring metadata and a menu card", () => {
    for (const arena of ARENA_CATALOG.filter((entry) => entry.quickplay)) {
      expect(arena.music.length, `${arena.id} has no music`).toBeGreaterThan(0);
      expect(arena.ambience.bed, `${arena.id} has no ambience bed`).toBeTruthy();
      expect(LEVEL_UNLOCKS[arena.id], `${arena.id} has no unlock policy`).toBeTruthy();
      expect(MENU_LEVEL_IDS.has(arena.id), `${arena.id} has no data-level card`).toBe(true);
      expect(LEVEL_MUSIC[arena.id]).toBe(arena.music);
      expect(ARENA_AMBIENCE[arena.id]).toBe(arena.ambience);
    }
  });

  it("keeps every catalog arena loadable while allowing importer-only dev extras", () => {
    for (const arena of ARENA_CATALOG) {
      expect(LEVEL_IMPORTERS[arena.id], `${arena.id} has no importer`).toBeTypeOf("function");
    }
  });
});

describe("resolveLevelId", () => {
  it("accepts catalog ids and falls back to the arena every player owns", () => {
    for (const arena of ARENA_CATALOG) {
      expect(resolveLevelId(arena.id)).toBe(arena.id);
    }
    // * The fallback must be an UNLOCKED arena, not a named one — UNLOCK-ORDER-1 moved
    // * `free` off Cart Rave, so hardcoding it here would drop a fresh player into a
    // * locked arena on any path that loses the saved selection.
    expect(resolveLevelId("typo-arena")).toBe(FREE_LEVEL);
    expect(resolveLevelId(null)).toBe(FREE_LEVEL);
    expect(resolveLevelId(undefined)).toBe(FREE_LEVEL);
  });
});

// * UNLOCK-ORDER-1 progression chain + its save migration. The chain is Sundial (free)
// * -> Storerooms (10 KOs on Sundial) -> Cart Rave (15 KOs on Storerooms), while
// * ARENA_CATALOG's array order stays the quickplay rotation (asserted above).
describe("unlock progression order", () => {
  it("starts at Sundial Station and ends at Cart Rave", () => {
    expect(FREE_LEVEL).toBe("zanzibar");
    expect(LEVEL_UNLOCKS.zanzibar.free).toBe(true);
    expect(LEVEL_UNLOCKS.backrooms.killsOnLevel).toBe("zanzibar");
    expect(LEVEL_UNLOCKS.classicRecord.killsOnLevel).toBe("backrooms");
    expect(LEVEL_UNLOCKS.classicRecord.free).toBeUndefined();
  });

  it("every gate names an arena that is earlier in the chain", () => {
    // * Guards against a future edit producing a cycle or a gate on a locked arena.
    const order = ["zanzibar", "backrooms", "classicRecord"];
    for (const [i, id] of order.entries()) {
      const gate = LEVEL_UNLOCKS[id].killsOnLevel;
      if (!gate) continue;
      expect(order.indexOf(gate), `${id} gated on ${gate}`).toBeLessThan(i);
    }
  });

  it("hint copy names the arena the gate actually reads", () => {
    expect(LEVEL_UNLOCKS.backrooms.hint).toContain("Sundial Station");
    expect(LEVEL_UNLOCKS.classicRecord.hint).toContain("The Storerooms");
  });

  it("a fresh save gets Sundial only — never Cart Rave", () => {
    for (const raw of [null, undefined, {}, { levels: {} }, { levels: { backrooms: true } }]) {
      const state = normalizeState(raw);
      expect(state.levels.zanzibar).toBe(true);
      expect(state.levels.classicRecord).toBeUndefined();
    }
  });

  it("a save written before the flip keeps Cart Rave", () => {
    // * Grandfathered by the merge, not by a force-write: every pre-flip save carries
    // * classicRecord: true because it was the free level when it was written.
    const state = normalizeState({ levels: { classicRecord: true }, killsByLevel: { classicRecord: 7 } });
    expect(state.levels.classicRecord).toBe(true);
    expect(state.levels.zanzibar).toBe(true);
    expect(state.killsByLevel.classicRecord).toBe(7);
  });
});
