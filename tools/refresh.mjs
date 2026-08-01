#!/usr/bin/env node
/**
 * refresh.mjs — one command to freshen every Command Center surface.
 *
 *   npm run refresh              (full: includes the network analytics pull)
 *   npm run dashboard            (alias for refresh --offline: no network)
 *
 * Runs the freshness steps in order with the right failure modes:
 *   1. pull-analytics     (SOFT — offline / missing token is fine, the feed just
 *                          stays stale; skipped entirely under --offline)
 *   2. briefing + arch    (regenerate committed cold-start docs; no-op when unchanged)
 *   3. playtest-console   (HARD — reseeds the playtest queue + console HTML)
 *   4. dashboard          (HARD — rebuilds the Command Center HTML from the above)
 *
 * This is the ONLY list of Command Center surfaces — the `dashboard` npm script and
 * the post-commit hook must not grow their own copies. Use this when you sit down:
 * the git hooks keep docs fresh as you commit, this is the manual "catch me up now"
 * button. Calls node on the tool files directly (no npm/shell indirection).
 * Exit 0 unless a HARD step fails.
 */

import { spawnSync } from "node:child_process";
import { parseArgs } from "./lib/harness.mjs";

const args = parseArgs(process.argv.slice(2));
const offline = Boolean(args.offline);

function run(tool, { soft = false } = {}) {
  console.log(`[refresh] ${tool}${soft ? " (soft)" : ""} …`);
  const r = spawnSync(process.execPath, [`tools/${tool}`], { stdio: "inherit" });
  if (r.status !== 0) {
    if (soft) {
      console.log(`[refresh] ${tool} skipped (exit ${r.status}) — continuing`);
      return;
    }
    process.exit(r.status ?? 1);
  }
}

if (offline) {
  console.log("[refresh] --offline — skipping pull-analytics");
} else {
  run("pull-analytics.mjs", { soft: true });
}
run("briefing.mjs");
run("architecture.mjs");
run("playtest-console.mjs");
run("dashboard.mjs");
