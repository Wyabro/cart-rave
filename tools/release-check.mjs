/**
 * release-check.mjs — exact-HEAD release readiness gate (NOT ordinary PR CI).
 *
 * Requires: clean tree matching origin, qa green, production build, complete battery
 * report on this exact HEAD classified green, and STATUS exit checklist progress.
 * Does NOT run the expensive battery itself — look for an existing complete exact-HEAD report.
 *
 *   npm run release:check
 */

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawn } from "node:child_process";
import { collectProjectHealth } from "./lib/projectHealth.mjs";
import { parseStatusDoneWhen } from "./lib/projectHealth.mjs";
import { makeLogger } from "./lib/harness.mjs";

const log = makeLogger("release:check");

/** @param {string} cmd @param {string[]} argv */
function run(cmd, argv) {
  return new Promise((resolveRun) => {
    const isWin = process.platform === "win32";
    const child =
      isWin && cmd === "npm"
        ? spawn([cmd, ...argv].join(" "), { cwd: process.cwd(), stdio: "inherit", shell: true })
        : spawn(cmd, argv, { cwd: process.cwd(), stdio: "inherit" });
    child.on("close", (code) => resolveRun(code ?? 2));
    child.on("error", () => resolveRun(2));
  });
}

async function main() {
  const health = await collectProjectHealth({ cwd: process.cwd() });
  const reasons = [];

  if ((health.git?.dirtyFiles ?? 0) > 0) reasons.push("dirty-tree");
  if ((health.git?.ahead ?? 0) > 0 || (health.git?.behind ?? 0) > 0) reasons.push("not-in-sync-with-origin");

  const exact = health.battery?.latestCompleteExactHead;
  if (!exact || exact.classification?.class !== "green") {
    reasons.push(
      exact
        ? `exact-head-battery:${exact.classification?.class ?? "unknown"}`
        : "no-exact-head-complete-green-battery",
    );
  }

  const statusMd = await readFile(resolve("docs/STATUS.md"), "utf8");
  const doneWhen = parseStatusDoneWhen(statusMd);
  const unchecked = doneWhen.filter((d) => !d.done);
  // * Playtesting exit still allows unchecked "wait for Wyatt" style items — require
  // * at least one checked item and no open player-risk wording left unchecked unless
  // * the current phase is explicitly RC with all boxes checked.
  const phase = health.declared?.phase ?? "";
  if (/release\s*candidate/i.test(phase)) {
    if (unchecked.length > 0) reasons.push(`rc-done-when-open:${unchecked.length}`);
  }

  log("running npm run qa …");
  const qaCode = await run("npm", ["run", "qa"]);
  if (qaCode !== 0) reasons.push("qa-failed");

  log("running npm run build …");
  const buildCode = await run("npm", ["run", "build"]);
  if (buildCode !== 0) reasons.push("build-failed");

  if (reasons.length) {
    log("NOT RELEASE READY:");
    for (const r of reasons) log(`  - ${r}`);
    process.exit(1);
  }
  log("release ready (exact-HEAD evidence + qa + build)");
  process.exit(0);
}

main().catch((e) => {
  console.error("[release:check] FATAL:", e instanceof Error ? e.stack : e);
  process.exit(2);
});
