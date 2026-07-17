/**
 * battery.mjs — the one-command regression sweep for Cart Clash.
 *
 * Runs every headless diagnostic rig against a SINGLE shared dev stack (started once, or
 * attached via --url), sequentially — the rigs share the quickplay room and the Worker, so
 * parallel runs would collide. Aggregates each rig's exit code into one tally, writes a
 * JSON report to .diag-captures/, and exits with the shared contract:
 *   0 = every rig green · 1 = a rig failed · 2 = setup error (stack never came up).
 *
 * Before this existed, a full sweep was five manual commands, each with its own dev-stack
 * handshake — so it never got run. Now it's:
 *
 *   npm run battery                              # auto-start dev:local, run everything
 *   npm run battery -- --url http://127.0.0.1:3000/    # attach to a running stack (faster)
 *   npm run battery -- --only gameharness              # one rig
 *   npm run battery -- --skip hostMigration,soak       # drop steps by name
 *   npm run battery -- --visual                        # also run the black-frame battery
 *
 * Add a step by appending to STEPS — any command that honors the 0/1/2 exit contract and
 * accepts --url (or needs no stack) slots in. Keep new rigs on tools/lib/harness.mjs so
 * they inherit preflight + the contract for free.
 */

import { spawn } from "node:child_process";
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

const log = makeLogger("battery");

/**
 * The sweep, in order. `name` doubles as the --only/--skip key. `urlArg` steps get the
 * shared stack's --url appended; `optIn` steps only run behind their flag.
 * @type {Array<{ name: string, cmd: string[], urlArg?: boolean, optIn?: string, note: string }>}
 */
const STEPS = [
  { name: "gameharness", cmd: ["node", "tools/gameharness.mjs"], urlArg: true, note: "solo gameplay: roundflow + unlockFunnel + arenas + soak" },
  { name: "spawnlock", cmd: ["node", "tools/netharness.mjs", "--scenario", "spawnlock"], urlArg: true, note: "2-client: joiner drives off spawn (NET-2 probe)" },
  { name: "mpIntegration", cmd: ["node", "tools/netharness.mjs", "--scenario", "mpIntegration"], urlArg: true, note: "2-client: netcode↔gameplay seam" },
  { name: "hostMigration", cmd: ["node", "tools/netharness.mjs", "--scenario", "hostMigration"], urlArg: true, note: "2-client: clean host departure" },
  { name: "visual", cmd: ["node", "tools/blackframes.mjs", "--shot", "classic", "--frames", "30"], optIn: "visual", note: "black-frame battery (qa:visual)" },
  { name: "qa", cmd: ["npm", "run", "qa"], optIn: "qa", note: "typecheck + vitest + knip" },
];

/**
 * Run one step as a child process, streaming its output with a [name] prefix.
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
    // * Only npm needs a shell on Windows; Node 24 deprecates args-array + shell:true
    // * (DEP0190), so the shell form joins our own literal step definition into one string.
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
  const only = str(args.only)?.split(",").map((s) => s.trim()).filter(Boolean);
  const skip = new Set(str(args.skip)?.split(",").map((s) => s.trim()).filter(Boolean) ?? []);

  const steps = STEPS.filter((s) => {
    if (only) return only.includes(s.name);
    if (skip.has(s.name)) return false;
    if (s.optIn) return args[s.optIn] === true;
    return true;
  });
  if (steps.length === 0) {
    log("nothing to run (check --only/--skip names:", STEPS.map((s) => s.name).join(", ") + ")");
    process.exit(2);
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
    // * If the auto-started stack dies mid-run (wrangler/workerd crash kills Vite via
    // * dev-local.mjs), stop burning minutes on doomed steps — mark the rest and bail.
    if (devProc) {
      devProc.on("exit", (code) => {
        if (tearingDown) return;
        stackDied = true;
        log(`!! dev stack exited mid-run (code ${code ?? "?"}) — remaining steps will be skipped.`);
        log("   Likely a wrangler/workerd crash or port fight. Check for zombies:");
        log("   PowerShell: Get-Process workerd | Stop-Process -Force  → then re-run.");
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
      // * Rigs persist their per-check tally so the battery report (and the dashboard)
      // * carries check-level detail (16/16 …) instead of only exit codes.
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
          checks = { passed: t.passed, failed: t.failed, checks: t.checks };
        } catch {
          /* rig died before writing a tally — exit code is still authoritative */
        }
      }
      results.push({ name: step.name, note: step.note, ...r, ...(checks ? { checks } : {}) });
      const checkNote = checks ? ` — ${checks.passed}/${checks.passed + checks.failed} checks` : "";
      log(`${r.code === 0 ? "PASS" : r.code === 2 ? "SETUP-ERROR" : "FAIL"} ${step.name} (${(r.ms / 1000).toFixed(0)}s)${checkNote}\n`);
    }
  } finally {
    tearingDown = true;
    killDevStack(devProc);
  }

  // Unified tally + persisted report (next to the capture bundles the rigs may have written).
  const failed = results.filter((r) => r.code !== 0);
  log("=== battery summary ===");
  for (const r of results) {
    log(`  ${r.code === 0 ? "PASS " : "FAIL "} ${r.name.padEnd(14)} ${(r.ms / 1000).toFixed(0).padStart(4)}s  ${r.note}`);
  }
  log(`${results.length - failed.length}/${results.length} steps green`);

  try {
    await mkdir(CAPTURE_DIR, { recursive: true });
    const reportPath = resolve(CAPTURE_DIR, `battery-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
    await writeFile(
      reportPath,
      JSON.stringify({ when: new Date().toISOString(), baseUrl, results }, null, 2),
      "utf8",
    );
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
