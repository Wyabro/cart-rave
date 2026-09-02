// @vitest-environment node
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, afterEach } from "vitest";
import {
  EXCLUDE_NAMES,
  MAX_FILE_COUNT,
  MAX_ZIP_BYTES,
  listZipEntryNames,
  zipCrazyGames,
} from "../../scripts/zip-crazygames.mjs";

/** @type {string[]} */
const temps = [];

async function makeFixture() {
  const dir = await mkdtemp(join(tmpdir(), "cc-cg-fix-"));
  temps.push(dir);
  await mkdir(join(dir, "assets"), { recursive: true });
  await writeFile(join(dir, "index.html"), "<!doctype html><title>Cart Clash</title>\n", "utf8");
  await writeFile(join(dir, "assets", "index-test.js"), "export {}\n", "utf8");
  await writeFile(join(dir, ".chunk-manifest.json"), "{\"chunks\":{}}\n", "utf8");
  await writeFile(join(dir, "robots.txt"), "User-agent: *\n", "utf8");
  await writeFile(join(dir, "sitemap.xml"), "<urlset></urlset>\n", "utf8");
  await writeFile(join(dir, "site.webmanifest"), "{\"start_url\":\"/\"}\n", "utf8");
  return dir;
}

afterEach(async () => {
  while (temps.length) {
    const p = temps.pop();
    if (p) await rm(p, { recursive: true, force: true });
  }
});

describe("CG-ZIP-1 — CrazyGames zip", () => {
  it("pins vite base to relative ./", () => {
    const src = readFileSync(new URL("../../vite.config.js", import.meta.url), "utf8");
    expect(src).toMatch(/base:\s*["']\.\/["']/);
  });

  it("zips index.html at archive root and drops excluded files", async () => {
    const srcDir = await makeFixture();
    const outPath = join(srcDir, "out.zip");
    const result = await zipCrazyGames({ srcDir, outPath });

    expect(existsSync(outPath)).toBe(true);
    expect(result.bytes).toBeGreaterThan(0);
    expect(result.bytes).toBeLessThanOrEqual(MAX_ZIP_BYTES);
    expect(result.fileCount).toBeGreaterThan(0);
    expect(result.fileCount).toBeLessThanOrEqual(MAX_FILE_COUNT);
    expect(result.files).toContain("index.html");
    expect(result.files).toContain("assets/index-test.js");
    for (const name of EXCLUDE_NAMES) {
      expect(result.files).not.toContain(name);
    }

    const entries = listZipEntryNames(outPath);
    expect(entries.some((e) => e === "index.html" || e === "./index.html")).toBe(true);
    expect(entries.some((e) => /(^|\/)dist\/index\.html$/.test(e))).toBe(false);
    for (const name of EXCLUDE_NAMES) {
      expect(entries.some((e) => e === name || e.endsWith(`/${name}`))).toBe(false);
    }
    expect(entries.some((e) => /crazygames|crazysdk/i.test(e))).toBe(false);
  });

  it("refuses a CrazyGames SDK filename in the tree", async () => {
    const srcDir = await makeFixture();
    await writeFile(join(srcDir, "crazygames-sdk.js"), "window.CrazyGames = {}\n", "utf8");
    const outPath = join(srcDir, "out.zip");
    await expect(zipCrazyGames({ srcDir, outPath })).rejects.toThrow(/CrazyGames SDK/i);
  });
});
