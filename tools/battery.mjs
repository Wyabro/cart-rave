/**
 * battery.mjs — the one-command regression sweep for Cart Clash.
 *
 * Runs diagnostic rigs against a SINGLE shared dev stack (started once, or attached via
 * --url), sequentially. Writes a versioned JSON report with git provenance + completeness.
 * Exit: 0 = every selected rig green · 1 = a rig failed · 2 = setup error · code 3 from a
 * child = INCONCLUSIVE (does not fail the sweep).
 *
 *   npm run battery
 *   npm run battery -- --url http://127.0.0.1:4000/
 *   npm run battery -- --only gameharness
 *   npm run battery -- --skip hostMigration
 *   npm run battery -- --visual
 */

import { spawn, execFileSync } from "node:child_process";
import { mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import {
  parseArgs,
  str,
  makeLogger,
  maybeStartDevStack,
  preflightStack,
  CLIENT_PORT,
  CAPTURE_DIR,
  killDevStack,
} from "./lib/harness.mjs";
import {
  BATTERY_STEPS,
  BATTERY_SUITE_ID,
  BATTERY_REPORT_VERSION,
  REQUIRED_CORE_STEPS,
  selectBatterySteps,
  omittedCoreSteps,
  isCompleteCoreSelection,
} from "./lib/batteryPlan.mjs";

const log = makeLogger("battery");

/** @param {string[]} argv @returns {string | null} */
function git(argv) {
  try {
    return execFileSync("git", argv, { cwd: process.cwd(), stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return null;
  }
}

function collectGitProvenance() {
  const branch = git(["rev-parse", "--abbrev-ref", "HEAD"]);
  const headFull = git(["rev-parse", "HEAD"]);
  const head = git(["rev-parse", "--short", "HEAD"]);
  const dirtyRaw = git(["status", "--porcelain"]);
  const dirtyFiles = dirtyRaw ? dirtyRaw.split("\n").filter(Boolean) : [];
  return {
    branch,
    head,
    headFull,
    dirty: dirtyFiles.length > 0,
    dirtyFiles: dirtyFiles.length,
  };
}

/**
 * @param {{ name: string, cmd: string[] }} step
 * @param {string[]} extraArgs
 * @returns {Promise<{ code: number, ms: number }>}
 */
function runStep(step, extraArgs) {
  return new Promise((resolveRun) => {
    const t0 = Date.now();
    const [bin, ...rest] = step.cmd;
    const isWin = process.platform === "win32";
    const argv = [...rest, ...extraArgs];
    const child =
      isWin && bin === "npm"
        ? spawn([bin, ...argv].join(" "), { cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"], shell: true })
        : spawn(bin, argv, { cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"] });
    const prefix = (buf) => {
      for (const line of String(buf).split(/\r?\n/)) {
        if (line.trim()) process.stdout.write(`  [${step.name}] ${line}\n`);
      }
    };
    child.stdout?.on("data", prefix);
    child.stderr?.on("data", prefix);
    child.on("close", (code) => resolveRun({ code: code ?? 2, ms: Date.now() - t0 }));
    child.on("error", () => resolveRun({ code: 2, ms: Date.now() - t0 }));
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const baseUrl = str(args.url) || `http://127.0.0.1:${CLIENT_PORT}/`;
  const only = str(args.only)?.split(",").map((s) => s.trim()).filter(Boolean) ?? null;
  const skipList = str(args.skip)?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];
  const skip = new Set(skipList);

  const steps = selectBatterySteps({ only, skip, flags: args });
  if (steps.length === 0) {
    log("nothing to run (check --only/--skip names:", BATTERY_STEPS.map((s) => s.name).join(", ") + ")");
    process.exit(2);
  }

  const selectedNames = steps.map((s) => s.name);
  const omitted = omittedCoreSteps(selectedNames);
  const complete = isCompleteCoreSelection(selectedNames);
  const gitProv = collectGitProvenance();
  const startedAt = new Date().toISOString();

  if (!complete) {
    log(
      `⚠ partial suite — selected ${selectedNames.filter((n) => REQUIRED_CORE_STEPS.includes(n)).length}/${REQUIRED_CORE_STEPS.length} core steps` +
        (omitted.length ? ` (omitted: ${omitted.join(", ")})` : ""),
    );
  }

  const needsStack = steps.some((s) => s.urlArg || s.name === "visual");
  let devProc = null;
  let stackDied = false;
  let tearingDown = false;
  if (needsStack) {
    try {
      devProc = await maybeStartDevStack(args, log);
      await preflightStack(baseUrl, log);
    } catch (err) {
      log(err instanceof Error ? err.message : err);
      killDevStack(devProc);
      process.exit(2);
    }
    if (devProc) {
      devProc.on("exit", (code) => {
        if (tearingDown) return;
        stackDied = true;
        log(`!! dev stack exited mid-run (code ${code ?? "?"}) — remaining steps will be skipped.`);
      });
    }
  }

  log(`running ${steps.length} step(s): ${steps.map((s) => s.name).join(" → ")}\n`);
  /** @type {Array<{ name: string, note: string, code: number, ms: number }>} */
  const results = [];
  try {
    for (const step of steps) {
      if (stackDied) {
        results.push({ name: step.name, note: step.note, code: 2, ms: 0 });
        log(`SKIP ${step.name} — dev stack is down\n`);
        continue;
      }
      log(`▶ ${step.name} — ${step.note}`);
      const extra = step.urlArg ? ["--url", baseUrl] : [];
      if (step.name === "gameharness" && str(args.soakCycles)) extra.push("--soakCycles", str(args.soakCycles));
      const tallyPath = step.urlArg ? resolve(CAPTURE_DIR, `tally-${step.name}.json`) : null;
      if (tallyPath) {
        await rm(tallyPath, { force: true }).catch(() => {});
        extra.push("--tallyOut", tallyPath);
      }
      // eslint-disable-next-line no-await-in-loop
      const r = await runStep(step, extra);
      /** @type {{ passed: number, failed: number, checks: unknown[] } | null} */
      let checks = null;
      if (tallyPath) {
        try {
          const t = JSON.parse(await readFile(tallyPath, "utf8"));
          checks = { passed: t.passed, failed: t.failed, inconclusive: t.inconclusive ?? 0, checks: t.checks };
        } catch {
          /* rig died before writing a tally */
        }
      }
      results.push({ name: step.name, note: step.note, ...r, ...(checks ? { checks } : {}) });
      const checkNote = checks
        ? ` — ${checks.passed}/${checks.passed + checks.failed} checks${checks.inconclusive ? ` (+${checks.inconclusive} inconclusive)` : ""}`
        : "";
      const verdict = r.code === 0 ? "PASS" : r.code === 2 ? "SETUP-ERROR" : r.code === 3 ? "INCONCLUSIVE" : "FAIL";
      log(`${verdict} ${step.name} (${(r.ms / 1000).toFixed(0)}s)${checkNote}\n`);
    }
  } finally {
    tearingDown = true;
    killDevStack(devProc);
  }

  const failed = results.filter((r) => r.code !== 0 && r.code !== 3);
  const inconclusive = results.filter((r) => r.code === 3);
  const finishedAt = new Date().toISOString();
  log("=== battery summary ===");
  for (const r of results) {
    const mark = r.code === 0 ? "PASS " : r.code === 3 ? "INCON" : "FAIL ";
    log(`  ${mark} ${r.name.padEnd(14)} ${(r.ms / 1000).toFixed(0).padStart(4)}s  ${r.note}`);
  }
  log(
    `${results.length - failed.length - inconclusive.length}/${results.length} steps green` +
      (inconclusive.length
        ? ` — ${inconclusive.length} INCONCLUSIVE (${inconclusive.map((r) => r.name).join(", ")})`
        : "") +
      (complete ? " · complete suite" : ` · partial ${REQUIRED_CORE_STEPS.filter((n) => selectedNames.includes(n)).length}/${REQUIRED_CORE_STEPS.length}`),
  );

  try {
    await mkdir(CAPTURE_DIR, { recursive: true });
    const reportPath = resolve(CAPTURE_DIR, `battery-${finishedAt.replace(/[:.]/g, "-")}.json`);
    const report = {
      reportVersion: BATTERY_REPORT_VERSION,
      suiteId: BATTERY_SUITE_ID,
      when: finishedAt,
      startedAt,
      finishedAt,
      baseUrl,
      git: gitProv,
      selectedSteps: selectedNames,
      omittedCoreSteps: omitted,
      complete,
      coreRequired: REQUIRED_CORE_STEPS,
      results,
    };
    await writeFile(reportPath, JSON.stringify(report, null, 2), "utf8");
    log(`report → ${reportPath}`);
  } catch (e) {
    log(`report write failed: ${e instanceof Error ? e.message : e}`);
  }

  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("[battery] FATAL:", e instanceof Error ? e.stack : e);
  process.exit(2);
});
