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
 * 1 (a check failed), or 2 (harness/setup error) — same contract as the netcode rig.
 */

import { spawn } from "node:child_process";
import net from "node:net";
import { resolve } from "node:path";
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
  const isWin = process.platform === "win32";
  const npm = isWin ? "npm.cmd" : "npm";
  log("starting dev:local (Vite :3000 + Wrangler :8787)…");
  const child = spawn(npm, ["run", "dev:local"], {
    cwd: resolve(process.cwd()),
    stdio: ["ignore", "pipe", "pipe"],
    shell: isWin,
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
 * @param {() => boolean} [o.readyExpr]          Page fn polled until truthy (default: __ccDiag active).
 * @param {(t: string) => boolean} [o.ignoreConsole] Return true to suppress a console-error line.
 * @param {(...a: unknown[]) => void} [o.log]
 * @returns {Promise<{ context: import('playwright').BrowserContext, page: import('playwright').Page, label: string }>}
 */
export async function makeClient(browser, o) {
  const label = o.label || "client";
  const log = o.log || makeLogger("harness");
  const context = await browser.newContext({ viewport: { width: 900, height: 600 } });

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

  /** Mark a scenario as having thrown (counts as failure for the exit code). */
  markError() {
    this.hadError = true;
  }

  /** Print the tally and exit with the shared contract. Never returns. */
  finish() {
    const failed = this.results.filter((r) => !r.pass);
    this.log(`\n${this.results.length - failed.length}/${this.results.length} checks passed`);
    process.exit(this.hadError || failed.length > 0 ? 1 : 0);
  }
}
