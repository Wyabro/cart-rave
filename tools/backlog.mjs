/**
 * backlog.mjs — regenerate the GENERATED counts block in docs/planning/BACKLOG.md.
 *
 *   npm run backlog            # rewrite if stale (no-op when fresh)
 *   npm run backlog -- --check # exit 1 if stale, write nothing
 *
 * The "Status at a glance" Department table + open-row total used to be hand-
 * maintained and drifted (87 claimed vs 92 real rows — see the 2026-08-06 BACKLOG
 * audit). It is now derived straight from the department tables below it by
 * computeBacklogGlance() and can't drift by construction; this script just writes
 * that computation between the GENERATED markers. Everything else in BACKLOG.md is
 * still hand-authored — only the marked block is ever touched.
 *
 * Invoked from the pre-commit hook, but only when BACKLOG.md is already part of the
 * commit — see tools/git-hooks/pre-commit. `npm run qa`'s health:check only *checks*
 * freshness (validateBacklogHygiene), same split as briefing:check / arch:check.
 *
 * Exit 0 = fresh/written · 1 = --check found it stale · 2 = setup error (including an
 * unrecognized priority value the table has no column for).
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  computeBacklogGlance,
  renderBacklogGlanceBlock,
  extractBacklogGlanceBlock,
  replaceBacklogGlanceBlock,
} from "./lib/backlogGlance.mjs";
import { parseArgs, makeLogger } from "./lib/harness.mjs";

const log = makeLogger("backlog");

function main() {
  const args = parseArgs(process.argv.slice(2));
  const path = resolve("docs/planning/BACKLOG.md");
  const md = readFileSync(path, "utf8").replace(/\r\n/g, "\n");

  const glance = computeBacklogGlance(md);
  if (!glance.ok) {
    log(`FATAL: ${glance.reason}`);
    process.exit(2);
  }
  const expected = renderBacklogGlanceBlock(glance);
  const current = extractBacklogGlanceBlock(md);
  if (current === null) {
    log(
      "FATAL: docs/planning/BACKLOG.md is missing the GENERATED counts markers — insert them once by hand around the Department table, then re-run.",
    );
    process.exit(2);
  }
  const fresh = current === expected;

  if (args.check) {
    if (fresh) {
      log("fresh");
      process.exit(0);
    }
    log("STALE — docs/planning/BACKLOG.md's glance box lags the real rows. Run `npm run backlog`.");
    process.exit(1);
  }

  if (fresh) {
    log("glance box already fresh — not rewritten");
    process.exit(0);
  }
  writeFileSync(path, replaceBacklogGlanceBlock(md, expected), "utf8");
  log(`wrote docs/planning/BACKLOG.md (${glance.total} open rows) — commit it with your BACKLOG.md change`);
  process.exit(0);
}

try {
  main();
} catch (e) {
  console.error("[backlog] FATAL:", e instanceof Error ? e.stack : e);
  process.exit(2);
}
