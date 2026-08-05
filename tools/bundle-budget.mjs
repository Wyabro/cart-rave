/**
 * bundle-budget.mjs — a byte budget for the INITIAL DOWNLOAD SET, not just `index-*.js`.
 *
 *   npm run size:check                        # compare dist/ against docs/bundle-budget.json
 *   npm run size:check -- --report            # same, always print the per-chunk table
 *   npm run size:check -- --require-dist      # a missing/stale dist is a HARD FAIL (release gate)
 *   npm run size:update                       # rewrite the committed baseline from this build
 *
 * WHAT IT MEASURES
 * The set a cold visitor must download before the menu can run: the `<script type="module">`
 * in dist/index.html plus every `<link rel="modulepreload">`. Gating only on `index-*.js`
 * is how a split "wins" on paper — code moves to a sibling chunk that is still preloaded,
 * so the wire cost is unchanged. This counts the whole set.
 *
 * GZIP IS A PROXY, NOT WIRE BYTES. Cloudflare serves these assets with **brotli**, so the
 * real transfer is smaller than the gzip column here. gzip (zlib default level) is used
 * because it is deterministic, dependency-free, and stable across machines — good for
 * comparing builds to each other. Do NOT quote the gzip number as "what users download".
 *
 * HASH-STRIPPED KEYS. Content hashes churn on every build (the build stamp in vite.config.js
 * bakes a timestamp into the entry chunk, so `index-*.js` is renamed even with zero source
 * changes). Chunks are therefore keyed by their hash-stripped name — `index-BuD_HIUu.js` →
 * `index` — so the committed baseline survives rebuilds.
 *
 * TWO SIGNALS, THE SECOND STRICTER THAN THE FIRST:
 *   1. total raw bytes of the initial set vs budget + max(2%, 20 kB)
 *   2. set MEMBERSHIP — something that was deferred is eager again. That fails even when the
 *      byte total looks fine. A chunk LEAVING the set is an improvement: reported, never fatal.
 *
 * MEMBERSHIP IS MEASURED ON MODULES, NOT CHUNK NAMES (BUNDLE-1 Lever F).
 * Rolldown re-splits the entry chunk on its own schedule and names each shared piece after
 * whichever module happens to sort first inside it — `gamepadNav` in Lever C, then
 * `errorReporter`/`sfxSynth`/`animations`/`koEvent` in Lever E. A name-keyed membership rule
 * reads every one of those as "a deferred module got re-eagered" and red-gates a benign
 * rebuild; it fired twice on this card. So when `dist/.chunk-manifest.json` is available the
 * baseline records the DEFERRED MODULE LIST, and the fatal signal is a baseline-deferred
 * module reappearing in the initial set — which no rename can fake and no rename can hide.
 *
 * ENTRY FAMILY. The entry chunk plus the shared chunks rolldown splits out of it are compared
 * as one family total instead of per-name. A previously-unseen preloaded chunk joins the family
 * only when it carries no baseline-deferred module; a chunk carrying one is a re-eagering and
 * still fails by name. With no manifest present the tool falls back to the old chunk-name rule,
 * so an old baseline still gates.
 *
 * dist/ is gitignored, so the budget must live as a committed *number* (docs/bundle-budget.json),
 * never as an artifact.
 *
 * Exit codes: 0 ok (or skipped) · 1 over budget / chunk entered the set / stale dist under
 * --require-dist · 2 setup error.
 */

import { readFileSync, writeFileSync, statSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { gzipSync } from "node:zlib";
import { parseArgs, makeLogger } from "./lib/harness.mjs";

const log = makeLogger("size:check");

const DIST_DIR = "dist";
const BASELINE_PATH = "docs/bundle-budget.json";

/** Growth allowed before the gate bites: whichever of these is larger. */
export const TOLERANCE_FRACTION = 0.02;
export const TOLERANCE_FLOOR_BYTES = 20_000;

/**
 * Strip a Vite content hash off a chunk file name.
 *
 * Anchored to the END of the extension-stripped base and length-bounded on purpose: a
 * greedy `-[A-Za-z0-9_-]{8,}` would eat legitimate dashed names (`rolldown-runtime-BpQH8Ho1`
 * → `rolldown`), and the hash alphabet itself contains `-` (`captureUpload-CfDh0a-1`).
 *
 * @param {string} file e.g. "assets/index-BuD_HIUu.js"
 * @returns {string} e.g. "index"
 */
export function strippedKey(file) {
  const base = file.split("/").pop() ?? file;
  const dot = base.lastIndexOf(".");
  const stem = dot > 0 ? base.slice(0, dot) : base;
  return stem.replace(/-[A-Za-z0-9_-]{8,12}$/, "");
}

/**
 * Pure core: given dist/index.html and a size lookup, describe the initial download set.
 * Kept free of fs so it is unit-testable without a real build.
 *
 * @param {string} html contents of dist/index.html
 * @param {Record<string, {raw: number, gzip: number}>} sizeByFile keyed by dist-relative path
 *   ("assets/index-X.js"); the html's `./assets/…` / `/assets/…` forms are normalized to that.
 * @param {Record<string, string[]>} [modulesByFile] `chunks` from dist/.chunk-manifest.json —
 *   dist-relative chunk file → the module ids it contains. Optional: without it the module-level
 *   membership signal is unavailable and the caller falls back to chunk names.
 * @returns {{
 *   files: {file: string, key: string, raw: number, gzip: number, kind: "entry"|"preload", modules: string[]}[],
 *   totalRaw: number, totalGzip: number, count: number, missing: string[],
 *   modules: string[], hasModules: boolean,
 * }}
 */
export function analyzeInitialSet(html, sizeByFile, modulesByFile) {
  /** @param {string} href */
  const normalize = (href) => href.replace(/^\.?\//, "").replace(/[?#].*$/, "");

  /** @type {{file: string, kind: "entry"|"preload"}[]} */
  const refs = [];
  for (const m of html.matchAll(/<script\b[^>]*\btype=["']module["'][^>]*>/gi)) {
    const src = /\bsrc=["']([^"']+)["']/i.exec(m[0]);
    if (src) refs.push({ file: normalize(src[1]), kind: "entry" });
  }
  for (const m of html.matchAll(/<link\b[^>]*\brel=["']modulepreload["'][^>]*>/gi)) {
    const href = /\bhref=["']([^"']+)["']/i.exec(m[0]);
    if (href) refs.push({ file: normalize(href[1]), kind: "preload" });
  }

  const seen = new Set();
  const usedKeys = new Set();
  /** @type {{file: string, key: string, raw: number, gzip: number, kind: "entry"|"preload"}[]} */
  const files = [];
  const missing = [];

  for (const ref of refs) {
    if (seen.has(ref.file)) continue;
    seen.add(ref.file);
    const size = sizeByFile[ref.file];
    if (!size) {
      missing.push(ref.file);
      continue;
    }
    // * Two chunks can strip to the same key (two `captureUpload-*.js` exist in dist today).
    // * Only one is in the initial set, but if that ever changes, keep the collision visible
    // * rather than silently merging two chunks into one baseline row.
    let key = strippedKey(ref.file);
    if (usedKeys.has(key)) key = ref.file;
    usedKeys.add(key);
    files.push({ file: ref.file, key, raw: size.raw, gzip: size.gzip, kind: ref.kind, modules: modulesByFile?.[ref.file] ?? [] });
  }

  files.sort((a, b) => b.raw - a.raw);
  const modules = [...new Set(files.flatMap((f) => f.modules))].sort();
  return {
    files,
    totalRaw: files.reduce((n, f) => n + f.raw, 0),
    totalGzip: files.reduce((n, f) => n + f.gzip, 0),
    count: files.length,
    missing,
    modules,
    hasModules: Boolean(modulesByFile) && modules.length > 0,
  };
}

/**
 * Which initial-set chunks are "entry family" — the entry chunk plus the shared chunks rolldown
 * split out of it. Family membership is what makes a rename/re-split benign; it deliberately
 * cannot swallow a re-eagering, because a chunk carrying a baseline-deferred module is excluded.
 *
 * @param {ReturnType<typeof analyzeInitialSet>} analysis
 * @param {{chunks?: Record<string, unknown>, entryFamily?: {keys?: string[]}, deferredModules?: string[]}} baseline
 * @returns {Set<string>} stripped keys
 */
export function entryFamilyKeys(analysis, baseline) {
  const baseFamily = new Set(baseline.entryFamily?.keys ?? []);
  const baseChunks = baseline.chunks ?? {};
  const deferred = new Set(baseline.deferredModules ?? []);
  /** @type {Set<string>} */
  const keys = new Set();
  for (const f of analysis.files) {
    if (f.kind === "entry" || baseFamily.has(f.key)) {
      keys.add(f.key);
      continue;
    }
    // * A previously-unseen preloaded chunk joins the family only when the manifest proves it
    // * carries no module the baseline had deferred. No manifest ⇒ no folding ⇒ old rule.
    // * Both sides must have module data: without the baseline's deferred list "carries no
    // * deferred module" is vacuously true and the family would swallow anything.
    const modules = f.modules ?? [];
    if (!Array.isArray(baseline.deferredModules)) continue;
    if (!(f.key in baseChunks) && modules.length && !modules.some((m) => deferred.has(m))) keys.add(f.key);
  }
  return keys;
}

/**
 * @param {ReturnType<typeof analyzeInitialSet>} analysis
 * @param {{initialSet: {raw: number, gzip: number}, chunks: Record<string, {raw: number, gzip: number}>,
 *   entryFamily?: {keys?: string[], raw?: number, gzip?: number}, deferredModules?: string[]}} baseline
 */
export function compareToBaseline(analysis, baseline) {
  const budget = baseline.initialSet?.raw ?? 0;
  const allowance = Math.max(Math.round(budget * TOLERANCE_FRACTION), TOLERANCE_FLOOR_BYTES);
  const ceiling = budget + allowance;
  const baseChunks = baseline.chunks ?? {};
  const baseDeferred = new Set(baseline.deferredModules ?? []);

  const family = entryFamilyKeys(analysis, baseline);
  const baseFamilyKeys = (baseline.entryFamily?.keys ?? []).filter((k) => k in baseChunks);
  const familyRaw = analysis.files.filter((f) => family.has(f.key)).reduce((n, f) => n + f.raw, 0);
  const familyBaseRaw = baseFamilyKeys.reduce((n, k) => n + (baseChunks[k]?.raw ?? 0), 0);

  // * The fatal membership signal, when the manifest is present: a module the baseline had
  // * deferred is in the initial download set again. Chunk names cannot fake or hide this.
  const enteredModules = analysis.hasModules && baseDeferred.size
    ? analysis.files.flatMap((f) => (f.modules ?? []).filter((m) => baseDeferred.has(m)).map((m) => ({ module: m, key: f.key })))
    : [];

  // * Chunk-name entries are informational once they are classified into the entry family;
  // * an unfamiliar chunk that is NOT family (or a run with no manifest at all) still fails.
  const enteredAll = analysis.files.map((f) => f.key).filter((k) => !(k in baseChunks));
  const entered = enteredAll.filter((k) => !family.has(k));
  const rejoinedFamily = enteredAll.filter((k) => family.has(k));
  const left = Object.keys(baseChunks).filter((k) => !analysis.files.some((f) => f.key === k));

  const deltas = analysis.files.map((f) => ({
    key: f.key,
    file: f.file,
    raw: f.raw,
    gzip: f.gzip,
    rawDelta: f.raw - (baseChunks[f.key]?.raw ?? 0),
    gzipDelta: f.gzip - (baseChunks[f.key]?.gzip ?? 0),
    isNew: !(f.key in baseChunks),
  }));
  deltas.sort((a, b) => b.rawDelta - a.rawDelta);

  const overBudget = analysis.totalRaw > ceiling;
  return {
    budget,
    allowance,
    ceiling,
    totalRaw: analysis.totalRaw,
    totalGzip: analysis.totalGzip,
    rawDelta: analysis.totalRaw - budget,
    gzipDelta: analysis.totalGzip - (baseline.initialSet?.gzip ?? 0),
    overBudget,
    entered,
    enteredModules,
    rejoinedFamily,
    family: [...family],
    familyRaw,
    familyBaseRaw,
    left,
    deltas,
    failed: overBudget || entered.length > 0 || enteredModules.length > 0,
  };
}

/* ------------------------------------------------------------------ CLI ---- */

/** @param {number} n */
const kb = (n) => `${(n / 1024).toFixed(1)} kB`;
/** @param {number} n */
const signed = (n) => (n > 0 ? `+${n.toLocaleString()}` : n.toLocaleString());

/** Newest mtime under a directory tree, or 0 when it does not exist. @param {string} dir */
function newestMtime(dir) {
  let newest = 0;
  /** @param {string} d */
  const walk = (d) => {
    let entries;
    try {
      entries = readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else {
        try {
          const m = statSync(p).mtimeMs;
          if (m > newest) newest = m;
        } catch {
          /* raced away mid-walk */
        }
      }
    }
  };
  walk(dir);
  return newest;
}

/** @returns {Record<string, {raw: number, gzip: number}>} */
function measureDistAssets() {
  /** @type {Record<string, {raw: number, gzip: number}>} */
  const out = {};
  /** @param {string} rel */
  const walk = (rel) => {
    const abs = resolve(DIST_DIR, rel);
    let entries;
    try {
      entries = readdirSync(abs, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const childRel = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(childRel);
      else if (/\.(js|css)$/.test(e.name)) {
        const buf = readFileSync(resolve(DIST_DIR, childRel));
        out[childRel] = { raw: buf.length, gzip: gzipSync(buf).length };
      }
    }
  };
  walk("");
  return out;
}

const isMain = process.argv[1] && /bundle-budget\.mjs$/.test(process.argv[1].replace(/\\/g, "/"));

if (isMain) {
  const args = parseArgs(process.argv.slice(2));
  const requireDist = Boolean(args["require-dist"]);
  const htmlPath = resolve(DIST_DIR, "index.html");

  // * Staleness. Standalone this is a convenience skip (never gate a dev machine on a dist
  // * it has not built), but a SILENT SKIP MUST NEVER BE ABLE TO GREEN THE RELEASE GATE —
  // * so under --require-dist the exact same condition is fatal.
  let stale = null;
  let htmlMtime = 0;
  try {
    htmlMtime = statSync(htmlPath).mtimeMs;
  } catch {
    stale = `${htmlPath} not found — run \`npm run build\``;
  }
  if (!stale) {
    const srcNewest = newestMtime(resolve("src"));
    if (srcNewest > htmlMtime) stale = "dist/index.html is older than the newest src/ file — rebuild before trusting these numbers";
  }
  if (stale) {
    log(`!! ${stale}`);
    if (requireDist) {
      log("!! --require-dist: refusing to pass on a missing/stale build.");
      process.exit(1);
    }
    log("   skipping (exit 0) — pass --require-dist to make this fatal.");
    process.exit(0);
  }

  const html = readFileSync(htmlPath, "utf8");

  // * dist/.chunk-manifest.json (written by vite.config.js) turns membership from a chunk-NAME
  // * question into a MODULE question. Absent (older dist), the tool degrades to the name rule.
  /** @type {Record<string, string[]>} */
  let manifestChunks = {};
  try {
    manifestChunks = JSON.parse(readFileSync(resolve(DIST_DIR, ".chunk-manifest.json"), "utf8")).chunks ?? {};
  } catch {
    log("!! dist/.chunk-manifest.json missing — falling back to chunk-name membership (rename-prone).");
  }
  const analysis = analyzeInitialSet(html, measureDistAssets(), Object.keys(manifestChunks).length ? manifestChunks : undefined);
  const initialModules = new Set(analysis.modules);
  const deferredModules = [...new Set(Object.entries(manifestChunks).flatMap(([, mods]) => mods))]
    .filter((m) => !initialModules.has(m))
    .sort();

  /** @returns {any} the committed baseline, or null */
  const readBaseline = () => {
    try {
      return JSON.parse(readFileSync(resolve(BASELINE_PATH), "utf8"));
    } catch {
      return null;
    }
  };
  if (analysis.missing.length) {
    log(`FATAL: index.html references files not present in dist/: ${analysis.missing.join(", ")}`);
    process.exit(2);
  }

  if (args.write) {
    /** @type {Record<string, {raw: number, gzip: number}>} */
    const chunks = {};
    for (const f of analysis.files) chunks[f.key] = { raw: f.raw, gzip: f.gzip };
    // * Carry the family forward: chunks the OLD baseline would have classified as entry family
    // * stay family after the ratchet, so the next rolldown re-split is judged against the same
    // * notion rather than re-seeding from the entry chunk alone.
    const prev = readBaseline();
    const family = prev ? entryFamilyKeys(analysis, prev) : new Set(analysis.files.filter((f) => f.kind === "entry").map((f) => f.key));
    const familyFiles = analysis.files.filter((f) => family.has(f.key));
    const baseline = {
      _doc:
        "Committed byte budget for the INITIAL DOWNLOAD SET (entry module + all modulepreloads) " +
        "of dist/index.html. Keys are hash-stripped chunk names. gzip is a stable proxy only — " +
        "Cloudflare serves brotli, so it is NOT wire bytes. Regenerate with `npm run size:update`. " +
        "Tool + gate rules: tools/bundle-budget.mjs.",
      _membership:
        "`deferredModules` is the membership gate: any of these appearing in the initial set is a " +
        "re-eagering and fails. `entryFamily` is the entry chunk plus the shared chunks rolldown " +
        "split out of it — compared as one total, so a rename/re-split is not a regression.",
      generatedAt: new Date().toISOString(),
      toleranceFraction: TOLERANCE_FRACTION,
      toleranceFloorBytes: TOLERANCE_FLOOR_BYTES,
      initialSet: { count: analysis.count, raw: analysis.totalRaw, gzip: analysis.totalGzip },
      entryFamily: {
        keys: familyFiles.map((f) => f.key).sort(),
        raw: familyFiles.reduce((n, f) => n + f.raw, 0),
        gzip: familyFiles.reduce((n, f) => n + f.gzip, 0),
      },
      chunks,
      deferredModules,
    };
    writeFileSync(resolve(BASELINE_PATH), `${JSON.stringify(baseline, null, 2)}\n`);
    log(`wrote ${BASELINE_PATH} — ${analysis.count} chunks · ${analysis.totalRaw.toLocaleString()} B raw (${kb(analysis.totalRaw)}) · ${analysis.totalGzip.toLocaleString()} B gzip`);
    process.exit(0);
  }

  const baseline = readBaseline();
  if (!baseline) {
    log(`FATAL: ${BASELINE_PATH} missing or unreadable — seed it with \`npm run size:update\`.`);
    process.exit(2);
  }

  const r = compareToBaseline(analysis, baseline);

  if (r.failed || args.report) {
    log(`initial set: ${analysis.count} files · ${analysis.totalRaw.toLocaleString()} B raw (${kb(analysis.totalRaw)}) · ${analysis.totalGzip.toLocaleString()} B gzip*`);
    log(`  budget ${r.budget.toLocaleString()} B  ceiling ${r.ceiling.toLocaleString()} B (+${r.allowance.toLocaleString()} allowance)  delta ${signed(r.rawDelta)} B`);
    log("  chunk                     raw B      Δraw       gzip B*    Δgzip");
    for (const d of r.deltas) {
      log(
        `  ${(d.key + (d.isNew ? " (NEW)" : "")).padEnd(24)} ${String(d.raw).padStart(9)} ${signed(d.rawDelta).padStart(10)} ${String(d.gzip).padStart(10)} ${signed(d.gzipDelta).padStart(9)}`,
      );
    }
    log("  * gzip is a comparison proxy — production is served brotli.");
    if (r.family.length > 1 || r.familyBaseRaw) {
      log(`  entry family (${r.family.length}): ${r.family.join(" + ")} = ${r.familyRaw.toLocaleString()} B vs baseline ${r.familyBaseRaw.toLocaleString()} B (${signed(r.familyRaw - r.familyBaseRaw)} B)`);
    }
  }

  for (const k of r.left) log(`  chunk LEFT the initial set: ${k} — improvement, not a failure.`);
  for (const k of r.rejoinedFamily) log(`  chunk name is new but carries no deferred module: ${k} — entry-family re-split, not a regression.`);
  for (const k of r.entered) log(`  chunk ENTERED the initial set: ${k} — a deferred module got re-eagered.`);
  for (const m of r.enteredModules) log(`  module RE-EAGERED into the initial set: ${m.module} (now in chunk ${m.key})`);

  if (r.failed) {
    if (r.overBudget) log(`FAIL: initial set ${r.totalRaw.toLocaleString()} B exceeds ceiling ${r.ceiling.toLocaleString()} B.`);
    if (r.entered.length) log(`FAIL: ${r.entered.length} chunk(s) entered the initial download set.`);
    if (r.enteredModules.length) log(`FAIL: ${r.enteredModules.length} previously-deferred module(s) are in the initial download set again.`);
    log(`If the growth is intended, re-baseline with \`npm run size:update\` and say so in the commit body.`);
    process.exit(1);
  }

  log(`ok — initial set ${analysis.count} files · ${kb(analysis.totalRaw)} raw / ${kb(analysis.totalGzip)} gzip* (budget ${kb(r.budget)}, delta ${signed(r.rawDelta)} B)`);
  process.exit(0);
}
