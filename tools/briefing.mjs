/**
 * briefing.mjs — write docs/BRIEFING.md, the committed cold-start briefing.
 *
 *   npm run briefing            # regenerate from docs/STATUS.md (no-op when unchanged)
 *   npm run briefing -- --check # exit 1 if the file is stale, write nothing
 *
 * Runs inside `npm run qa` (before health:check) so the briefing self-heals on every
 * gate run; `health:check` fails on digest drift. Rendering: tools/lib/briefing.mjs.
 *
 * Exit 0 = fresh/written · 1 = --check found it stale · 2 = setup error.
 */

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderBriefingMd, extractBriefingDigest, briefingSourceDigest } from "./lib/briefing.mjs";
import { parseArgs, makeLogger } from "./lib/harness.mjs";

const log = makeLogger("briefing");

/** @param {string[]} argv */
function git(argv) {
  try {
    return execFileSync("git", argv, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return null;
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const statusPath = resolve("docs/STATUS.md");
  const briefingPath = resolve("docs/BRIEFING.md");
  const statusMd = readFileSync(statusPath, "utf8");

  let existing = "";
  try {
    existing = readFileSync(briefingPath, "utf8");
  } catch {
    /* first run */
  }
  const fresh = extractBriefingDigest(existing) === briefingSourceDigest(statusMd);

  if (args.check) {
    if (fresh) {
      log("fresh");
      process.exit(0);
    }
    log("STALE — docs/BRIEFING.md lags docs/STATUS.md. Run `npm run briefing`.");
    process.exit(1);
  }

  if (fresh) {
    log("docs/BRIEFING.md already fresh — not rewritten");
    process.exit(0);
  }
  const md = renderBriefingMd(statusMd, {
    branch: git(["rev-parse", "--abbrev-ref", "HEAD"]),
    head: git(["rev-parse", "--short", "HEAD"]),
    date: new Date().toISOString().slice(0, 10),
  });
  writeFileSync(briefingPath, md, "utf8");
  log(`wrote docs/BRIEFING.md (digest ${briefingSourceDigest(statusMd)}) — commit it with your STATUS.md change`);
  process.exit(0);
}

try {
  main();
} catch (e) {
  console.error("[briefing] FATAL:", e instanceof Error ? e.stack : e);
  process.exit(2);
}
