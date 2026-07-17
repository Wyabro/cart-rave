// Contract tests for per-arena music (src/music/levelMusic.js):
// * every quickplay arena has at least one track (a new arena can't ship silent),
// * every referenced file actually exists in public/sounds/ (catches typos),
// * resolveLevelMusic never returns empty (playGameMusic always has something),
// * multi-song lists are preserved and returned as copies (caller shuffles in place).

import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { LEVEL_MUSIC, resolveLevelMusic } from "../src/music/levelMusic.js";
import { QUICKPLAY_ARENA_IDS } from "../shared/arenaPool.js";

const SOUNDS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../public/sounds",
);

describe("LEVEL_MUSIC", () => {
  it("gives every quickplay arena at least one track", () => {
    for (const id of QUICKPLAY_ARENA_IDS) {
      expect(LEVEL_MUSIC[id]?.length, `arena ${id} has no music`).toBeGreaterThan(0);
    }
  });

  it("references only files that exist in public/sounds/", () => {
    for (const [id, files] of Object.entries(LEVEL_MUSIC)) {
      for (const file of files) {
        expect(existsSync(path.join(SOUNDS_DIR, file)), `${id} → missing ${file}`).toBe(true);
      }
    }
  });

  it("keeps the intended assignments (Cart Rave 2, Storerooms 1, Sundial 2)", () => {
    expect(LEVEL_MUSIC.classicRecord).toEqual(["music.opus", "song2.opus"]);
    expect(LEVEL_MUSIC.backrooms).toEqual(["storerooms.opus"]);
    expect(LEVEL_MUSIC.zanzibar).toEqual(["song3.opus", "song4.opus"]);
  });
});

describe("resolveLevelMusic", () => {
  it("returns the arena's list", () => {
    expect(resolveLevelMusic("zanzibar")).toEqual(["song3.opus", "song4.opus"]);
  });

  it("returns a copy, not the shared array (caller shuffles in place)", () => {
    const a = resolveLevelMusic("classicRecord");
    a.reverse();
    expect(LEVEL_MUSIC.classicRecord).toEqual(["music.opus", "song2.opus"]);
  });

  it("falls back to a non-empty default for unknown / nullish ids", () => {
    expect(resolveLevelMusic("testArena").length).toBeGreaterThan(0);
    expect(resolveLevelMusic(null).length).toBeGreaterThan(0);
    expect(resolveLevelMusic(undefined).length).toBeGreaterThan(0);
  });
});
