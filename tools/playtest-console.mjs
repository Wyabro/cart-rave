/**
 * playtest-console.mjs — generate the auto-seeded playtest console.
 *
 *   npm run playtest:console     # write .diag-captures/playtest-console.html
 *
 * Also runs inside `npm run dashboard`. Card list is derived from STATUS + BACKLOG
 * (Owed: Wyatt playtest); verdicts stay in browser localStorage.
 *
 * Exit 0 = written · 2 = setup error.
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { buildPlaytestQueue } from "./lib/playtestQueue.mjs";
import { renderPlaytestConsoleHtml } from "./lib/playtestConsoleHtml.mjs";
import { makeLogger, CAPTURE_DIR } from "./lib/harness.mjs";

const log = makeLogger("playtest-console");

/** @param {string[]} argv */
function git(argv) {
  try {
    return execFileSync("git", argv, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return null;
  }
}

function main() {
  const cwd = process.cwd();
  let statusMd = "";
  let backlogMd = "";
  try {
    statusMd = readFileSync(resolve(cwd, "docs/STATUS.md"), "utf8");
  } catch (e) {
    log(`STATUS.md unreadable: ${e instanceof Error ? e.message : e}`);
  }
  try {
    backlogMd = readFileSync(resolve(cwd, "docs/planning/BACKLOG.md"), "utf8");
  } catch (e) {
    log(`BACKLOG.md unreadable: ${e instanceof Error ? e.message : e}`);
  }

  const head = git(["rev-parse", "--short", "HEAD"]);
  const branch = git(["rev-parse", "--abbrev-ref", "HEAD"]);
  const generatedAt = new Date().toISOString();
  const { cards, meta } = buildPlaytestQueue({ statusMd, backlogMd, head, generatedAt });

  const html = renderPlaytestConsoleHtml({
    cards,
    meta,
    git: { branch, head },
  });

  mkdirSync(CAPTURE_DIR, { recursive: true });
  const htmlPath = resolve(CAPTURE_DIR, "playtest-console.html");
  writeFileSync(htmlPath, html, "utf8");
  log(`playtest-console.html → ${htmlPath} (${cards.length} cards)`);

  // Lightweight machine-readable sidecar for agents (optional; not a gate).
  const jsonPath = resolve(CAPTURE_DIR, "playtest-queue.json");
  writeFileSync(
    jsonPath,
    `${JSON.stringify({ generatedAt, head, branch, cards, sources: meta.sources }, null, 2)}\n`,
    "utf8",
  );
  log(`playtest-queue.json → ${jsonPath}`);
}

try {
  main();
} catch (e) {
  console.error("[playtest-console] FATAL:", e instanceof Error ? e.stack : e);
  process.exit(2);
}
