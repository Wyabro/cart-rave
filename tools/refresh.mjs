#!/usr/bin/env node
/**
 * refresh.mjs — one command to freshen every Command Center surface.
 *
 *   npm run refresh
 *
 * Runs the freshness steps in order with the right failure modes:
 *   1. pull-analytics   (SOFT — offline / missing token is fine, the feed just stays stale)
 *   2. briefing + arch  (regenerate committed cold-start docs; no-op when unchanged)
 *   3. dashboard        (HARD — rebuilds the Command Center HTML from the above)
 *
 * Use this when you sit down: the git hooks keep docs fresh as you commit, this is the
 * manual "catch me up now, including the network pull" button. Calls node on the tool
 * files directly (no npm/shell indirection). Exit 0 unless a HARD step fails.
 */

import { spawnSync } from "node:child_process";

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

run("pull-analytics.mjs", { soft: true });
run("briefing.mjs");
run("architecture.mjs");
run("dashboard.mjs");
