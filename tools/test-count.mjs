#!/usr/bin/env node
/**
 * test-count.mjs — TEST-COUNT-1: fail when vitest silently drops whole test files.
 *
 *   npm test               (wraps `vitest run` — full suite, count-gated)
 *   npm test -- <filters>  (pass-through; the count gate only applies to FULL runs)
 *
 * `vitest run` counts only files that RAN: a workerd pool start failure can drop
 * whole spec files and still print an all-green summary ("86 passed (86)" while the
 * suite is 89 files). AGENTS.md says "report results by number", so the number is
 * the artifact — and it lied by omission twice on 08-01.
 *
 * Gate: discover `tests/**\/*.test.js` on disk at run time (exactly the union of the
 * two vitest projects — root config includes tests/** minus tests/party-do/**, and
 * vitest.party.config.js includes tests/party-do/**; a spec added OUTSIDE tests/
 * needs both this glob and the vitest configs updated, so they move together), then
 * compare against the JSON reporter's file list. Reported < discovered → name the
 * missing files and exit 1. Never a hardcoded count.
 *
 * By design this turns the workerd silent-drop flake into a HARD RED. If the JSON
 * report itself is missing/unparseable, warn loudly but fail open — a broken gate
 * must not block all commits; vitest's own exit code still gates correctness.
 */

import { spawnSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPORT = join(ROOT, ".diag-captures", "vitest-report.json");

/** @param {string} dir @returns {string[]} absolute paths of *.test.js under dir */
function discoverSpecs(dir) {
  /** @type {string[]} */
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules") continue;
      out.push(...discoverSpecs(p));
    } else if (e.name.endsWith(".test.js")) {
      out.push(p);
    }
  }
  return out;
}

const passthrough = process.argv.slice(2);
const fullRun = passthrough.length === 0;

mkdirSync(join(ROOT, ".diag-captures"), { recursive: true });
const vitestArgs = [
  join(ROOT, "node_modules", "vitest", "vitest.mjs"),
  "run",
  ...(fullRun ? ["--reporter=default", "--reporter=json", `--outputFile.json=${REPORT}`] : []),
  ...passthrough,
];
const r = spawnSync(process.execPath, vitestArgs, { stdio: "inherit", cwd: ROOT });
if (r.status !== 0) process.exit(r.status ?? 1);
if (!fullRun) {
  console.log("[test-count] filtered run — count gate skipped (full `npm test` enforces it)");
  process.exit(0);
}

const norm = (p) => resolve(p).split(sep).join("/").toLowerCase();
let ranFiles;
try {
  const report = JSON.parse(readFileSync(REPORT, "utf8"));
  ranFiles = new Set(report.testResults.map((t) => norm(t.name)));
  if (ranFiles.size === 0) throw new Error("empty testResults");
} catch (err) {
  console.warn(`[test-count] WARNING: could not read the JSON report (${err.message}) — count gate SKIPPED. ` +
    "The suite exit code above still stands, but silent file drops are unverified this run.");
  process.exit(0);
}

const discovered = discoverSpecs(join(ROOT, "tests"));
const missing = discovered.filter((p) => !ranFiles.has(norm(p)));
if (missing.length > 0) {
  console.error(`[test-count] FAIL — vitest ran ${ranFiles.size} of ${discovered.length} discovered spec files. Missing:`);
  for (const m of missing) console.error(`  - ${m}`);
  console.error("[test-count] This is TEST-COUNT-1: an all-green summary that silently dropped files. Re-run; if it persists, check for orphaned workerd processes.");
  process.exit(1);
}
console.log(`[test-count] ok — ${ranFiles.size} spec files ran, ${discovered.length} discovered on disk`);
