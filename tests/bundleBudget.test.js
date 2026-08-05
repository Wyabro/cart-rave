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
import { analyzeInitialSet, compareToBaseline, entryFamilyKeys, strippedKey } from "../tools/bundle-budget.mjs";

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

/**
 * BUNDLE-1 Lever F. `size:check` red-gated twice on a benign rolldown re-split of the ENTRY
 * chunk — once as `gamepadNav` (Lever C), once as `errorReporter`/`sfxSynth`/`animations`/
 * `koEvent` (Lever E) — because membership was keyed on chunk NAMES. Membership now keys on
 * MODULES via dist/.chunk-manifest.json. Both directions are asserted here: the benign rename
 * must pass, and a genuinely deferred module coming back must still fail.
 */
describe("entry-family re-split vs. real re-eagering", () => {
  const HTML_TWO = `<!DOCTYPE html><html><head>
    <script type="module" src="./assets/index-AAAAAAAA.js"></script>
    <link rel="modulepreload" href="./assets/errorReporter-BBBBBBBB.js">
    <link rel="modulepreload" href="./assets/three-CsDqmm-5.js">
  </head></html>`;
  const SIZES_TWO = {
    "assets/index-AAAAAAAA.js": { raw: 200_000, gzip: 60_000 },
    "assets/errorReporter-BBBBBBBB.js": { raw: 390_000, gzip: 130_000 },
    "assets/three-CsDqmm-5.js": { raw: 400_000, gzip: 100_000 },
  };
  /** The pre-split baseline: one `index` chunk holding both halves of the entry code. */
  const baseline = {
    initialSet: { raw: 1_000_000, gzip: 300_000 },
    entryFamily: { keys: ["index"], raw: 600_000, gzip: 200_000 },
    chunks: { index: { raw: 600_000, gzip: 200_000 }, three: { raw: 400_000, gzip: 100_000 } },
    deferredModules: ["src/effects.js", "src/simulation.js", "src/hud.js"],
  };

  it("passes a rename/re-split of the entry chunk — new name, no deferred module", () => {
    const analysis = analyzeInitialSet(HTML_TWO, SIZES_TWO, {
      "assets/index-AAAAAAAA.js": ["src/main.js", "index.html"],
      "assets/errorReporter-BBBBBBBB.js": ["src/errorReporter.js", "src/netcode.js"],
      "assets/three-CsDqmm-5.js": ["node_modules/three/build/three.core.js"],
    });
    const r = compareToBaseline(analysis, baseline);
    expect(r.entered).toEqual([]);
    expect(r.rejoinedFamily).toEqual(["errorReporter"]);
    expect(r.enteredModules).toEqual([]);
    expect(r.failed).toBe(false);
    // * The family is compared as one total, so the split is legible as a byte delta.
    expect(r.familyRaw).toBe(590_000);
    expect(r.familyBaseRaw).toBe(600_000);
    expect([...entryFamilyKeys(analysis, baseline)].sort()).toEqual(["errorReporter", "index"]);
  });

  it("FAILS when a deferred module is re-eagered, even hidden inside the renamed entry family", () => {
    // * The regression drill: a static `import "./effects.js"` back in main.js. No NEW chunk
    // * name appears at all — the module just lands in the entry family — so only the module
    // * signal can catch it.
    const analysis = analyzeInitialSet(HTML_TWO, SIZES_TWO, {
      "assets/index-AAAAAAAA.js": ["src/main.js", "index.html"],
      "assets/errorReporter-BBBBBBBB.js": ["src/errorReporter.js", "src/netcode.js", "src/effects.js"],
      "assets/three-CsDqmm-5.js": ["node_modules/three/build/three.core.js"],
    });
    const r = compareToBaseline(analysis, baseline);
    expect(r.enteredModules).toEqual([{ module: "src/effects.js", key: "errorReporter" }]);
    expect(r.failed).toBe(true);
    // * …and the chunk it re-entered through is excluded from the family, so it is named too.
    expect(r.entered).toEqual(["errorReporter"]);
  });

  it("FAILS when a deferred chunk re-enters the preload set under its own name", () => {
    const html = HTML_TWO.replace("</head>", `<link rel="modulepreload" href="./assets/hud-CCCCCCCC.js"></head>`);
    const analysis = analyzeInitialSet(html, { ...SIZES_TWO, "assets/hud-CCCCCCCC.js": { raw: 5_000, gzip: 1_500 } }, {
      "assets/index-AAAAAAAA.js": ["src/main.js"],
      "assets/errorReporter-BBBBBBBB.js": ["src/errorReporter.js"],
      "assets/three-CsDqmm-5.js": ["node_modules/three/build/three.core.js"],
      "assets/hud-CCCCCCCC.js": ["src/hud.js"],
    });
    const r = compareToBaseline(analysis, baseline);
    expect(r.overBudget).toBe(false);
    expect(r.entered).toEqual(["hud"]);
    expect(r.enteredModules.map((m) => m.module)).toEqual(["src/hud.js"]);
    expect(r.failed).toBe(true);
  });

  it("falls back to the chunk-name rule when no manifest is available", () => {
    // * An old dist with no .chunk-manifest.json must still gate — conservatively, which means
    // * the rename false positive returns rather than the guard silently going quiet.
    const analysis = analyzeInitialSet(HTML_TWO, SIZES_TWO);
    const r = compareToBaseline(analysis, baseline);
    expect(r.enteredModules).toEqual([]);
    expect(r.entered).toEqual(["errorReporter"]);
    expect(r.failed).toBe(true);
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
