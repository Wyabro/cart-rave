// @vitest-environment happy-dom
// loadLevelAwait.test.js — BOOT-TBT-1: loadLevel must await initFn so preview LOD
// stays armed across yields inside initArena.
import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { LEVEL_IMPORTERS, loadLevel } from "../../src/levels/index.js";
import { isLowQualityMode, setMenuPreviewVisualLod } from "../../src/utils/qualityMode.js";
import { CONFIG } from "../../src/config.js";

const origClassic = LEVEL_IMPORTERS.classicRecord;

describe("loadLevel awaits initFn (BOOT-TBT-1)", () => {
  afterEach(() => {
    LEVEL_IMPORTERS.classicRecord = origClassic;
    setMenuPreviewVisualLod(false);
  });

  it("source: loadLevel awaits initFn", () => {
    const src = readFileSync(resolve("src/levels/index.js"), "utf8");
    expect(src).toMatch(/result\s*=\s*await\s*initFn\(/);
  });

  it("source: initArena is async and yields between slabs", () => {
    const src = readFileSync(resolve("src/levels/arena.js"), "utf8");
    expect(src).toMatch(/export async function initArena\(/);
    expect(src).toMatch(/await yieldForPaint\(\)/);
  });

  it("keeps preview LOD armed until initFn settles", async () => {
    /** @type {boolean[]} */
    const lodAtYield = [];
    LEVEL_IMPORTERS.classicRecord = () =>
      Promise.resolve(async () => {
        await Promise.resolve();
        lodAtYield.push(isLowQualityMode());
        return { dispose() {} };
      });

    const cfg = {
      record: { ...CONFIG.record },
      booth: { ...CONFIG.booth },
      cart: { ...CONFIG.cart },
    };
    await loadLevel("classicRecord", {}, {}, cfg, { menuPreview: true });
    expect(lodAtYield).toEqual([true]);
    expect(isLowQualityMode()).toBe(false);
  });
});
