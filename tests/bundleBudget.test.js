/**
 * BUNDLE-1 Lever A: the byte budget is the card's insurance — if every later code-split
 * lever aborts, this guard still ships. Two things must hold or it is decorative:
 *
 *   1. `analyzeInitialSet` measures the whole preload set (not just `index-*.js`) and keys
 *      chunks by hash-stripped name, so content-hash churn cannot break the baseline.
 *   2. `--require-dist` turns the standalone "missing/stale dist → skip" convenience into a
 *      hard failure. A silent skip must never be able to green the release gate.
 *
 * See tools/bundle-budget.mjs.
 */
import { describe, it, expect, afterAll } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, utimesSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { analyzeInitialSet, compareToBaseline, strippedKey } from "../tools/bundle-budget.mjs";

const TOOL = resolve(import.meta.dirname, "../tools/bundle-budget.mjs");
const scratch = mkdtempSync(join(tmpdir(), "cart-clash-bundlebudget-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

const HTML = `<!DOCTYPE html><html><head>
  <script type="module" crossorigin src="./assets/index-BuD_HIUu.js"></script>
  <link rel="modulepreload" crossorigin href="./assets/rolldown-runtime-BpQH8Ho1.js">
  <link rel="modulepreload" crossorigin href="./assets/three-CsDqmm-5.js">
  <link rel="stylesheet" href="./assets/index-CV28OpFD.css">
</head><body><script src="./assets/not-a-module.js"></script></body></html>`;

const SIZES = {
  "assets/index-BuD_HIUu.js": { raw: 660_794, gzip: 215_105 },
  "assets/rolldown-runtime-BpQH8Ho1.js": { raw: 227, gzip: 194 },
  "assets/three-CsDqmm-5.js": { raw: 689_139, gzip: 174_623 },
  "assets/index-CV28OpFD.css": { raw: 159_000, gzip: 29_000 },
  "assets/not-a-module.js": { raw: 999, gzip: 500 },
};

describe("strippedKey", () => {
  it.each([
    ["assets/index-BuD_HIUu.js", "index"],
    // * A greedy hash regex eats dashed names — this one must keep both words.
    ["assets/rolldown-runtime-BpQH8Ho1.js", "rolldown-runtime"],
    // * The hash alphabet itself contains "-".
    ["assets/captureUpload-CfDh0a-1.js", "captureUpload"],
    ["assets/index-CV28OpFD.css", "index"],
  ])("strips the content hash from %s", (file, key) => expect(strippedKey(file)).toBe(key));
});

describe("analyzeInitialSet", () => {
  const r = analyzeInitialSet(HTML, SIZES);

  it("counts the entry module plus every modulepreload, and nothing else", () => {
    expect(r.count).toBe(3);
    expect(r.files.map((f) => f.key).sort()).toEqual(["index", "rolldown-runtime", "three"]);
    // * A stylesheet link and a non-module script are not part of the module preload set.
    expect(r.files.some((f) => f.file.endsWith(".css"))).toBe(false);
    expect(r.files.some((f) => f.file.includes("not-a-module"))).toBe(false);
  });

  it("marks the entry and totals raw + gzip over the whole set", () => {
    expect(r.files.filter((f) => f.kind === "entry").map((f) => f.key)).toEqual(["index"]);
    expect(r.totalRaw).toBe(660_794 + 227 + 689_139);
    expect(r.totalGzip).toBe(215_105 + 194 + 174_623);
    expect(r.missing).toEqual([]);
  });

  it("reports referenced files that are absent from the size map instead of scoring 0", () => {
    const missing = analyzeInitialSet(HTML, { "assets/three-CsDqmm-5.js": { raw: 1, gzip: 1 } });
    expect(missing.missing).toContain("assets/index-BuD_HIUu.js");
    expect(missing.count).toBe(1);
  });

  it("survives content-hash churn — same keys after a rebuild renames every chunk", () => {
    const rebuilt = HTML.replace("index-BuD_HIUu", "index-D2C9bpdR").replace("three-CsDqmm-5", "three-ZZZZZZZ1");
    const sizes = {
      "assets/index-D2C9bpdR.js": SIZES["assets/index-BuD_HIUu.js"],
      "assets/three-ZZZZZZZ1.js": SIZES["assets/three-CsDqmm-5.js"],
      "assets/rolldown-runtime-BpQH8Ho1.js": SIZES["assets/rolldown-runtime-BpQH8Ho1.js"],
    };
    const after = analyzeInitialSet(rebuilt, sizes);
    expect(after.files.map((f) => f.key).sort()).toEqual(r.files.map((f) => f.key).sort());
    expect(after.totalRaw).toBe(r.totalRaw);
  });
});

describe("compareToBaseline", () => {
  const baseline = {
    initialSet: { raw: 1_000_000, gzip: 300_000 },
    chunks: { index: { raw: 600_000, gzip: 200_000 }, three: { raw: 400_000, gzip: 100_000 } },
  };
  /** @param {Record<string, number>} spec key → raw bytes */
  const analysisOf = (spec) => ({
    files: Object.entries(spec).map(([key, raw]) => ({ file: `assets/${key}-AAAAAAAA.js`, key, raw, gzip: Math.round(raw / 3), kind: "preload" })),
    totalRaw: Object.values(spec).reduce((a, b) => a + b, 0),
    totalGzip: Object.values(spec).reduce((a, b) => a + Math.round(b / 3), 0),
    count: Object.keys(spec).length,
    missing: [],
  });

  it("passes growth inside the tolerance (2% of a 1 MB budget)", () => {
    const r = compareToBaseline(analysisOf({ index: 615_000, three: 400_000 }), baseline);
    expect(r.allowance).toBe(20_000);
    expect(r.ceiling).toBe(1_020_000);
    expect(r.failed).toBe(false);
  });

  it("fails once the initial set clears the ceiling, and names the culprit first", () => {
    const r = compareToBaseline(analysisOf({ index: 660_000, three: 400_000 }), baseline);
    expect(r.overBudget).toBe(true);
    expect(r.failed).toBe(true);
    expect(r.deltas[0].key).toBe("index");
    expect(r.deltas[0].rawDelta).toBe(60_000);
  });

  it("uses the 20 kB floor when 2% would be smaller", () => {
    const small = { initialSet: { raw: 100_000, gzip: 30_000 }, chunks: { index: { raw: 100_000, gzip: 30_000 } } };
    expect(compareToBaseline(analysisOf({ index: 100_000 }), small).allowance).toBe(20_000);
  });

  it("fails a chunk that ENTERED the preload set even when the byte total is fine", () => {
    // * Under budget by 100 kB, but a deferred module got re-eagered — the stricter signal.
    const r = compareToBaseline(analysisOf({ index: 500_000, three: 400_000, hud: 5_000 }), baseline);
    expect(r.overBudget).toBe(false);
    expect(r.entered).toEqual(["hud"]);
    expect(r.failed).toBe(true);
  });

  it("reports a chunk that LEFT the preload set without failing — that is the win", () => {
    const r = compareToBaseline(analysisOf({ index: 600_000 }), baseline);
    expect(r.left).toEqual(["three"]);
    expect(r.entered).toEqual([]);
    expect(r.failed).toBe(false);
  });
});

describe("--require-dist", () => {
  /** @param {string} cwd @param {string[]} argv */
  const runTool = (cwd, argv = []) => spawnSync(process.execPath, [TOOL, ...argv], { cwd, encoding: "utf8" });

  /** @param {string} name @param {boolean} withDist */
  function makeRepo(name, withDist) {
    const dir = join(scratch, name);
    mkdirSync(join(dir, "src"), { recursive: true });
    writeFileSync(join(dir, "src", "main.js"), "// source\n");
    if (withDist) {
      mkdirSync(join(dir, "dist"), { recursive: true });
      writeFileSync(join(dir, "dist", "index.html"), "<html></html>");
      // * Backdate the build so src/main.js is unambiguously newer — a stale dist.
      const old = statSync(join(dir, "dist", "index.html")).mtime.getTime() / 1000 - 3600;
      utimesSync(join(dir, "dist", "index.html"), old, old);
    }
    return dir;
  }

  const noDist = makeRepo("no-dist", false);
  const staleDist = makeRepo("stale-dist", true);

  it("skips (exit 0) when dist/index.html is missing — standalone convenience", () => {
    const r = runTool(noDist);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/not found/);
  });

  it("skips (exit 0) when dist/index.html is older than src/ — never gate on a stale dist", () => {
    const r = runTool(staleDist);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/older than the newest src/);
  });

  it("hard-fails (exit 1) on a MISSING dist under --require-dist", () => {
    expect(runTool(noDist, ["--require-dist"]).status).toBe(1);
  });

  it("hard-fails (exit 1) on a STALE dist under --require-dist", () => {
    const r = runTool(staleDist, ["--require-dist"]);
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/refusing to pass/);
  });
});
