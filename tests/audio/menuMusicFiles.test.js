// MENU-MUSIC-2: both menu songs exist on disk and the boot path loads the playlist.
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SOUNDS_DIR = path.join(ROOT, "public", "sounds");
const MENU_FILES = ["menu.opus", "menu2.opus"];

describe("MENU-MUSIC-2 files", () => {
  it("ships both menu tracks in public/sounds/", () => {
    for (const file of MENU_FILES) {
      expect(existsSync(path.join(SOUNDS_DIR, file)), `missing ${file}`).toBe(true);
    }
  });

  it("main.js loads the two-song menu playlist", () => {
    const src = readFileSync(path.join(ROOT, "src", "main.js"), "utf8");
    expect(src).toContain("loadMenuPlaylist");
    expect(src).toContain("menu.opus");
    expect(src).toContain("menu2.opus");
  });
});
