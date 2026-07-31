/**
 * harness.mjs — shared Playwright/CLI plumbing for Cart Clash's headless diagnostic rigs.
 *
 * Extracted from tools/netharness.mjs so every rig (netcode E2E, gameplay E2E, and future
 * modules) shares ONE set of conventions instead of each re-implementing them:
 *
 *   - arg parsing (--flag / --flag value)      parseArgs / str
 *   - dev-stack lifecycle (auto-start / attach) probePort / waitForPort / maybeStartDevStack
 *   - Playwright bring-up                       ensurePlaywright / launchClientBrowser
 *   - a client page with instrumentation on     makeClient
 *   - Node-side state polling (no in-page eval) waitForState
 *   - real production input                     holdKey / releaseKey
 *   - a pass/fail tally + the exit-code contract CheckTally  (0 pass / 1 fail / 2 setup error)
 *
 * Every rig prints "[<name>] …" via {@link makeLogger} and exits 0 (all checks passed),
 * 1 (a check failed), 2 (harness/setup error), or 3 (inconclusive — zero real failures but
 * ≥1 check was skipped because the client loop was starved; see resolveExitCode). Battery
 * treats 3 as "no regression evidence", not as red.
 */

import { spawn, spawnSync } from "node:child_process";
import net from "node:net";
import { mkdir, writeFile } from "node:fs/promises";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

export { sleep };

export const CLIENT_PORT = 3000; // Vite (vite.config.js server.port)
export const WORKER_PORT = 8787; // Wrangler dev default; client dials hostname:8787 (netcode.js)

/**
 * Parse `--flag` / `--flag value` argv into a record. A bare flag is `true`.
 * @param {string[]} argv
 * @returns {Record<string, string | boolean>}
 */
export function parseArgs(argv) {
  /** @type {Record<string, string | boolean>} */
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith("--")) {
      out[key] = next;
      i += 1;
    } else {
      out[key] = true;
    }
  }
  return out;
}

/** @param {unknown} v @returns {string | undefined} */
export const str = (v) => (typeof v === "string" ? v : undefined);

/** Prefixed console logger. @param {string} name @returns {(...a: unknown[]) => void} */
export function makeLogger(name) {
  // eslint-disable-next-line no-console
  return (...args) => console.log(`[${name}]`, ...args);
}

/** Resolve TCP connect to host:port; false on error/timeout. */
export function probePort(port, host = "127.0.0.1", timeoutMs = 1500) {
  return new Promise((res) => {
    const sock = net.connect(port, host);
    const done = (ok) => {
      sock.destroy();
      res(ok);
    };
    sock.once("connect", () => done(true));
    sock.once("error", () => done(false));
    sock.setTimeout(timeoutMs, () => done(false));
  });
}

/** Poll a port until open or the deadline passes. */
export async function waitForPort(port, deadlineMs) {
  while (Date.now() < deadlineMs) {
    // eslint-disable-next-line no-await-in-loop
    if (await probePort(port)) return true;
    // eslint-disable-next-line no-await-in-loop
    await sleep(500);
  }
  return false;
}

/**
 * Auto-start `npm run dev:local` (Vite :3000 + Wrangler :8787) unless --url points at a
 * running stack. Returns the child process (kill it in your finally) or null when attaching.
 * @param {Record<string, string | boolean>} args
 * @param {(...a: unknown[]) => void} [log]
 * @returns {Promise<import('node:child_process').ChildProcess | null>}
 */
export async function maybeStartDevStack(args, log = makeLogger("harness")) {
  if (str(args.url)) return null;

  // * Pre-scan the ports BEFORE spawning. Blind-starting dev:local onto occupied ports is
  // * how a run dies mid-flight: waitForPort/preflight pass against the OTHER process, our
  // * own wrangler then loses the :8787 bind and exits non-zero, and dev-local.mjs kills
  // * Vite along with it (seen live 2026-07-16 — another agent session's stack held :8787).
  const clientHeld = await probePort(CLIENT_PORT);
  const workerHeld = await probePort(WORKER_PORT);
  if (clientHeld && workerHeld) {
    log(`attaching to the already-running dev stack (:${CLIENT_PORT} + :${WORKER_PORT} both up) — not starting a new one`);
    return null;
  }
  if (clientHeld || workerHeld) {
    const held = clientHeld ? `:${CLIENT_PORT} (Vite)` : `:${WORKER_PORT} (Wrangler)`;
    throw new Error(
      `Half a dev stack is already running — ${held} is in use but its partner is not. ` +
        "Starting dev:local now would lose the port race and the whole stack would die mid-run. " +
        "Fix: kill the stray process (PowerShell: Get-Process workerd | Stop-Process -Force; " +
        "or stop the other Vite), or attach to a FULL running stack with --url http://127.0.0.1:3000/",
    );
  }

  const isWin = process.platform === "win32";
  log("starting dev:local (Vite :3000 + Wrangler :8787)…");
  // * Windows npm needs a shell; Node 24 deprecates args-array + shell:true (DEP0190),
  // * so the shell form gets one literal command string (no interpolated input).
  const child = isWin
    ? spawn("npm run dev:local", {
        cwd: resolve(process.cwd()),
        stdio: ["ignore", "pipe", "pipe"],
        shell: true,
        env: { ...process.env, BROWSER: "none" },
      })
    : spawn("npm", ["run", "dev:local"], {
        cwd: resolve(process.cwd()),
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, BROWSER: "none" },
      });
  child.stdout?.on("data", (b) => process.env.NETHARNESS_VERBOSE && process.stdout.write(`[dev] ${b}`));
  child.stderr?.on("data", (b) => process.env.NETHARNESS_VERBOSE && process.stderr.write(`[dev] ${b}`));

  const deadline = Date.now() + 120_000;
  const clientUp = await waitForPort(CLIENT_PORT, deadline);
  const workerUp = await waitForPort(WORKER_PORT, deadline);
  if (!clientUp || !workerUp) {
    child.kill();
    throw new Error(
      `dev stack failed to come up (client:${CLIENT_PORT}=${clientUp} worker:${WORKER_PORT}=${workerUp}). ` +
        "Try running `npm run dev:local` manually and re-run with --url http://127.0.0.1:3000/",
    );
  }
  log("dev stack ready");
  return child;
}

/**
 * Kill an auto-started dev stack INCLUDING its children. On Windows, child.kill() only
 * kills the npm shell wrapper — Vite and wrangler/workerd survive as orphans, which is the
 * root of the chronic zombie-workerd churn (every auto-start run used to leak a full
 * stack). taskkill /T takes the whole tree down.
 * @param {import('node:child_process').ChildProcess | null} child
 */
export function killDevStack(child) {
  if (!child || child.killed || child.exitCode !== null) return;
  if (process.platform === "win32") {
    try {
      spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
      return;
    } catch {
      /* fall through to plain kill */
    }
  }
  child.kill();
}

/**
 * Verify both dev-stack processes actually ANSWER HTTP before spending minutes on browser
 * scenarios. A wedged workerd keeps its port open but never responds (seen 2026-07-15: every
 * request hung, so the host client sat in lobby forever and the failure read as a game bug).
 * Any HTTP status — even 400 from the party endpoint, which expects a WebSocket upgrade —
 * proves liveness; only a hang/refusal fails. Throw → the rig exits 2 (setup error, not a
 * scenario failure), pointing at the fix.
 *
 * @param {string} baseUrl The client URL the rig will drive (e.g. http://127.0.0.1:3000/).
 * @param {(...a: unknown[]) => void} [log]
 */
export async function preflightStack(baseUrl, log = makeLogger("harness")) {
  const u = new URL(baseUrl);
  const targets = [
    [`${u.protocol}//${u.hostname}:${u.port || CLIENT_PORT}/`, "Vite client"],
    [`${u.protocol}//${u.hostname}:${WORKER_PORT}/parties/main/preflight`, "Wrangler worker (party endpoint)"],
  ];
  for (const [target, what] of targets) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await fetch(target, { signal: AbortSignal.timeout(10_000) });
    } catch (e) {
      const why = e instanceof Error && e.name === "TimeoutError" ? "port open but hung >10s" : e?.message;
      throw new Error(
        `${what} is not answering HTTP at ${target} (${why}). ` +
          "A listening-but-hung port is usually a wedged workerd: kill every workerd process " +
          "(PowerShell: Get-Process workerd | Stop-Process -Force) and restart `npm run dev:local`.",
      );
    }
  }
  log("stack preflight OK — client + worker both answering");
}

/** Import playwright or exit(2) with an install hint. */
export async function ensurePlaywright(log = makeLogger("harness")) {
  try {
    return await import("playwright");
  } catch {
    log("playwright missing. Run: npx playwright install chromium");
    process.exit(2);
  }
}

/**
 * Anti-throttle launch args + channel — a backgrounded Chromium page throttles to ~3fps and
 * starves the fixed-step sim loop, so headless rigs must defeat it (see netcode-harness.md).
 * @param {import('playwright').BrowserType} chromium
 * @param {{ headed?: boolean }} [opts]
 */
export function launchClientBrowser(chromium, opts = {}) {
  return chromium.launch({
    headless: opts.headed !== true,
    channel: process.env.PLAYWRIGHT_CHROME_CHANNEL || undefined,
    args: [
      "--disable-background-timer-throttling",
      "--disable-backgrounding-occluded-windows",
      "--disable-renderer-backgrounding",
      "--disable-features=CalculateNativeWinOcclusion,IntensiveWakeUpThrottling",
    ],
  });
}

/**
 * Open a client page: isolated context (distinct localStorage identity), seeded storage to
 * skip intro overlays, focus emulation so its loop runs at full speed, and the requested
 * instrumentation flags in the URL. Waits for `readyExpr` to become truthy.
 *
 * @param {import('playwright').Browser} browser
 * @param {object} o
 * @param {string} o.baseUrl
 * @param {string} [o.username]
 * @param {string} [o.label]
 * @param {Record<string, string>} [o.params]   Extra URL query params (e.g. { diag: "1", room: "solo" }).
 * @param {Record<string, string>} [o.storage]  Extra localStorage seed entries.
 * @param {{ width: number, height: number }} [o.viewport] Frame size (default 900×600).
 * @param {"reduce" | "no-preference"} [o.reducedMotion] Emulated `prefers-reduced-motion`.
 * @param {() => boolean} [o.readyExpr]          Page fn polled until truthy (default: __ccDiag active).
 * @param {(t: string) => boolean} [o.ignoreConsole] Return true to suppress a console-error line.
 * @param {(...a: unknown[]) => void} [o.log]
 * @returns {Promise<{ context: import('playwright').BrowserContext, page: import('playwright').Page, label: string }>}
 */
export async function makeClient(browser, o) {
  const label = o.label || "client";
  const log = o.log || makeLogger("harness");
  // * SHEET-1: viewport + reducedMotion are opt-in passthroughs so a contact-sheet cell can
  // * request its own frame; omitting them keeps every existing rig on the 900×600 default.
  // * deviceScaleFactor is pinned to 1 — already Playwright's default, stated the way
  // * shoot.mjs:162 and tabhidden.mjs:470 state it, so a captured PNG's pixel size is the
  // * viewport and never the host display's scaling.
  const context = await browser.newContext({
    viewport: o.viewport || { width: 900, height: 600 },
    deviceScaleFactor: 1,
    ...(o.reducedMotion ? { reducedMotion: o.reducedMotion } : {}),
  });

  const seed = {
    cartRaveUsername: o.username || label,
    cartRaveHowToSeen: "1",
    cartRaveBootSeen: "1",
    ...(o.storage || {}),
  };
  await context.addInitScript((entries) => {
    try {
      for (const [k, v] of Object.entries(entries)) localStorage.setItem(k, v);
    } catch {
      /* privacy mode */
    }
  }, seed);

  const page = await context.newPage();
  try {
    const cdp = await context.newCDPSession(page);
    await cdp.send("Emulation.setFocusEmulationEnabled", { enabled: true });
  } catch (e) {
    log(`[${label}] focus emulation unavailable:`, e instanceof Error ? e.message : e);
  }
  page.on("pageerror", (e) => console.error(`[${label}:pageerror]`, e.message));
  const ignore = o.ignoreConsole || ((t) => /onsleek|allowlist|No Listener/i.test(t));
  page.on("console", (m) => {
    const t = m.text();
    if (m.type() === "error" && !ignore(t)) console.error(`[${label}:console]`, t);
  });

  const url = new URL(o.baseUrl);
  for (const [k, v] of Object.entries(o.params || {})) url.searchParams.set(k, v);
  await page.goto(url.toString(), { waitUntil: "domcontentloaded", timeout: 60_000 });
  const readyExpr = o.readyExpr || (() => Boolean(/** @type {any} */ (window).__ccDiag?.active));
  await page.waitForFunction(readyExpr, undefined, { timeout: 60_000 });
  return { context, page, label };
}

/**
 * Poll a page's diagnostic state (fetched into Node) until `predFn(state)` is truthy or the
 * timeout passes. `predFn` is a real Node-side function — no in-page eval / string injection.
 *
 * @param {import('playwright').Page} page
 * @param {(state: any) => boolean} predFn
 * @param {object} [opts]
 * @param {() => any} [opts.read]  Page fn returning the state object (default: __ccDiag.snapshot()).
 * @param {number} [opts.timeout]
 * @param {number} [opts.interval]
 * @param {string} [opts.label]
 * @returns {Promise<any>}
 */
export async function waitForState(page, predFn, opts = {}) {
  const { timeout = 30_000, interval = 200, label = "" } = opts;
  const read = opts.read || (() => /** @type {any} */ (window).__ccDiag.snapshot());
  const deadline = Date.now() + timeout;
  let state = null;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    // eslint-disable-next-line no-await-in-loop
    state = await page.evaluate(read);
    if (predFn(state)) return state;
    if (Date.now() > deadline) {
      throw new Error(`[${label}] timed out.\n  last state: ${JSON.stringify(state)}`);
    }
    // eslint-disable-next-line no-await-in-loop
    await sleep(interval);
  }
}

/** Default output directory for capture bundles (gitignored). */
export const CAPTURE_DIR = resolve(process.cwd(), ".diag-captures");

let captureSeq = 0;

/**
 * Capture a bug-capture bundle from a page and persist it (+ a screenshot) for offline
 * investigation. Assembles the serializable core via the in-page __ccDiag.captureBundle(), adds
 * a Playwright screenshot (the one artifact the page can't produce), and writes both to disk.
 * Never throws — a capture failure must not mask the check failure that triggered it.
 *
 * @param {import('playwright').Page} page
 * @param {object} o
 * @param {string} o.scenario                     Scenario name (e.g. "mpIntegration").
 * @param {string} [o.label]                       Which client / step failed (e.g. "joiner").
 * @param {string} [o.reason]                       Why the bundle was captured.
 * @param {string} [o.dir]                          Output dir (default: ./.diag-captures).
 * @param {(...a: unknown[]) => void} [o.log]
 * @returns {Promise<{ json: string, png: string } | null>}
 */
export async function dumpFailureBundle(page, o) {
  const log = o.log || makeLogger("harness");
  const dir = o.dir || CAPTURE_DIR;
  captureSeq += 1;
  const safe = (s) => String(s || "").replace(/[^a-z0-9_-]+/gi, "-");
  const base = `${safe(o.scenario)}-${safe(o.label || "client")}-${String(captureSeq).padStart(3, "0")}`;
  try {
    await mkdir(dir, { recursive: true });
    const bundle = await page.evaluate(
      (meta) => /** @type {any} */ (window).__ccDiag?.captureBundle?.(meta) ?? null,
      { scenario: o.scenario, reason: o.reason || "harness check failed" },
    );
    const jsonPath = resolve(dir, `${base}.json`);
    const pngPath = resolve(dir, `${base}.png`);
    await writeFile(jsonPath, JSON.stringify(bundle, null, 2), "utf8");
    try {
      await page.screenshot({ path: pngPath, fullPage: false });
    } catch (e) {
      log(`capture screenshot failed: ${e instanceof Error ? e.message : e}`);
    }
    log(`captured bug bundle → ${jsonPath}`);
    return { json: jsonPath, png: pngPath };
  } catch (e) {
    log(`capture bundle failed: ${e instanceof Error ? e.message : e}`);
    return null;
  }
}

/** Dispatch a real keydown on window (drives the production input path). */
export async function holdKey(page, code) {
  await page.evaluate((c) => {
    window.dispatchEvent(new KeyboardEvent("keydown", { code: c, bubbles: true }));
  }, code);
}
/** Dispatch a real keyup on window. */
export async function releaseKey(page, code) {
  await page.evaluate((c) => {
    window.dispatchEvent(new KeyboardEvent("keyup", { code: c, bubbles: true }));
  }, code);
}

/**
 * A pass/fail tally with the shared exit-code contract. `check()` records + prints one line;
 * `finish()` prints the summary and exits 0 (all pass) / 1 (a fail or a thrown scenario).
 */
export class CheckTally {
  /** @param {string} name @param {(...a: unknown[]) => void} [log] */
  constructor(name, log = makeLogger(name)) {
    this.name = name;
    this.log = log;
    /** @type {{ name: string, pass: boolean, detail?: string }[]} */
    this.results = [];
    this.hadError = false;
  }

  /** @param {string} name @param {boolean} pass @param {string} [detail] */
  check(name, pass, detail) {
    this.results.push({ name, pass, detail });
    this.log(`  ${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
    return pass;
  }

  /** Current result count — a cursor for {@link failedSince} so a scenario can scope its own checks. */
  get count() {
    return this.results.length;
  }

  /** True if any check recorded after index `n` failed (used to trigger a capture bundle). */
  failedSince(n) {
    return this.results.slice(n).some((r) => !r.pass);
  }

  /** Mark a scenario as having thrown (counts as failure for the exit code). */
  markError() {
    this.hadError = true;
  }

  /**
   * Print the tally and exit with the shared contract. Never returns.
   * @param {string} [tallyOut] Optional path — persist the per-check results as JSON first
   *   (--tallyOut; the battery passes this so its report carries check-level detail instead
   *   of only exit codes, and the dashboard renders it).
   */
  finish(tallyOut) {
    const failed = this.results.filter((r) => !r.pass);
    this.log(`\n${this.results.length - failed.length}/${this.results.length} checks passed`);
    if (tallyOut) writeTallySync(tallyOut, this.name, this.results, this.hadError);
    process.exit(this.hadError || failed.length > 0 ? 1 : 0);
  }
}

/**
 * Persist a rig's per-check tally as JSON (synchronous — safe right before process.exit).
 * Before this, check-level results (16/16 etc.) lived only in stdout and evaporated; the
 * battery report and the dashboard read these files. Never throws.
 *
 * A check may carry `inconclusive: true` (with pass:false): the rig could not gather
 * evidence either way (starved client loop — NET-2 class), so it counts in the separate
 * `inconclusive` field, NOT in `failed`. Red stays reserved for regression evidence.
 *
 * @param {string} file  Output path (.json).
 * @param {string} rig   Rig/tally name.
 * @param {{ name: string, pass: boolean, inconclusive?: boolean, detail?: string }[]} checks
 * @param {boolean} [hadError]  A scenario threw (counts as failure).
 * @returns {void}
 */
export function writeTallySync(file, rig, checks, hadError = false) {
  try {
    mkdirSync(dirname(resolve(file)), { recursive: true });
    const failed = checks.filter((r) => !r.pass && !r.inconclusive).length;
    const inconclusive = checks.filter((r) => r.inconclusive).length;
    writeFileSync(
      resolve(file),
      JSON.stringify(
        {
          rig,
          when: new Date().toISOString(),
          passed: checks.length - failed - inconclusive,
          failed,
          inconclusive,
          hadError,
          checks,
        },
        null,
        2,
      ),
      "utf8",
    );
  } catch {
    /* tally persistence must never mask the run result */
  }
}

/**
 * The shared exit-code verdict, as a pure function so it is unit-testable:
 *   1 — a real check failed or a scenario threw (regression evidence);
 *   3 — no real failures, but ≥1 check was inconclusive (starved environment:
 *       no evidence either way — the battery must not paint this red);
 *   0 — everything passed.
 * Setup errors (exit 2) never reach this — rigs exit 2 before running checks.
 *
 * @param {{ pass: boolean, inconclusive?: boolean }[]} results
 * @param {boolean} [hadError]
 * @returns {0 | 1 | 3}
 */
export function resolveExitCode(results, hadError = false) {
  const failed = results.filter((r) => !r.pass && !r.inconclusive).length;
  if (hadError || failed > 0) return 1;
  if (results.some((r) => r.inconclusive)) return 3;
  return 0;
}
