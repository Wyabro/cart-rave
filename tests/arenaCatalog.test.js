import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { QUICKPLAY_ARENA_IDS } from "../shared/arenaPool.js";
import { ARENA_CATALOG } from "../src/levels/arenaCatalog.js";
import { LEVEL_IMPORTERS, resolveLevelId } from "../src/levels/index.js";
import { LEVEL_UNLOCKS } from "../src/unlockConfig.js";
import { LEVEL_MUSIC } from "../src/music/levelMusic.js";
import { ARENA_AMBIENCE } from "../src/ambience/arenaAmbience.js";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
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
  it("accepts catalog ids and preserves the default fallback for unknown values", () => {
    for (const arena of ARENA_CATALOG) {
      expect(resolveLevelId(arena.id)).toBe(arena.id);
    }
    expect(resolveLevelId("typo-arena")).toBe("classicRecord");
    expect(resolveLevelId(null)).toBe("classicRecord");
    expect(resolveLevelId(undefined)).toBe("classicRecord");
  });
});
