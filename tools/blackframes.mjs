/**
 * blackframes.mjs — multi-frame black-pixel battery (flicker triage).
 *
 * Samples N frames via window.__cartRave.sampleBlack after world warm.
 *
 * Usage:
 *   npm run blackframes -- --shot classic --frames 60
 *   npm run blackframes -- --shot storerooms --ablate bloom --frames 40
 *
 * Exit code 1 if any frame exceeds --max-ratio (default 0.92) or if a run of
 * full-black frames exceeds --max-full (default 2).
 */

import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { writeFileSync, mkdirSync } from "node:fs";

function parseArgs(argv) {
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

function str(v) {
  return typeof v === "string" ? v : undefined;
}

function buildUrl(base, args) {
  const u = new URL(base);
  u.searchParams.set("harness", "1");
  u.searchParams.set("freeze", "1");
  u.searchParams.set("perfPump", "1");
  u.searchParams.set("hud", "0");
  const shot = str(args.shot) ?? "classic";
  u.searchParams.set("shot", shot);
  const level = str(args.level);
  if (level) u.searchParams.set("level", level);
  const cam = str(args.cam);
  if (cam) u.searchParams.set("cam", cam);
  const preset = str(args.preset);
  if (preset) u.searchParams.set("preset", preset);
  const ablate = str(args.ablate);
  if (ablate) u.searchParams.set("ablate", ablate);
  if (args.postmin === true || args.postmin === "1") u.searchParams.set("postmin", "1");
  return u.toString();
}

async function ensurePlaywright() {
  try {
    return await import("playwright");
  } catch {
    console.error(
      "[blackframes] playwright missing. Run:\n  npm i -D playwright\n  npx playwright install chromium",
    );
    process.exit(1);
  }
}

async function maybeStartDevServer(url, args) {
  if (str(args.url) || args.noserver === true) return null;
  let host;
  try {
    host = new URL(url).hostname;
  } catch {
    return null;
  }
  if (host !== "localhost" && host !== "127.0.0.1") return null;

  const child = spawn("npm run dev -- --host 127.0.0.1 --port 5173 --strictPort", {
    cwd: resolve(process.cwd()),
    stdio: ["ignore", "pipe", "pipe"],
    shell: true,
    env: { ...process.env, BROWSER: "none" },
  });
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    // eslint-disable-next-line no-await-in-loop
    const up = await new Promise((resolveProbe) => {
      import("node:net").then(({ default: net }) => {
        const s = net.connect(5173, "127.0.0.1", () => {
          s.end();
          resolveProbe(true);
        });
        s.on("error", () => resolveProbe(false));
      });
    });
    if (up) {
      console.log("[blackframes] dev server ready on :5173");
      return child;
    }
    // eslint-disable-next-line no-await-in-loop
    await sleep(250);
  }
  child.kill();
  throw new Error("Dev server failed to start");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const frames = Math.max(1, Number(str(args.frames) ?? 48));
  const maxRatio = Number(str(args["max-ratio"]) ?? 0.92);
  const maxFull = Math.max(0, Number(str(args["max-full"]) ?? 2));
  const width = Number(str(args.w) ?? 1280);
  const height = Number(str(args.h) ?? 720);
  const timeoutMs = Number(str(args.timeout) ?? 120000);
  const base = str(args.url) ?? "http://127.0.0.1:5173/";
  const url = buildUrl(base, args);
  const reportPath = str(args.report);

  console.log(`[blackframes] ${url}`);
  console.log(`[blackframes] frames=${frames} maxRatio=${maxRatio} maxFull=${maxFull}`);

  let serverProc = null;
  try {
    serverProc = await maybeStartDevServer(url, args);
  } catch (err) {
    console.warn("[blackframes]", err instanceof Error ? err.message : err);
  }

  const { chromium } = await ensurePlaywright();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });

  /** @type {Array<{ i: number, ratio: number, maxRun: number }>} */
  const samples = [];
  let fullBlackRun = 0;
  let maxFullBlackRun = 0;
  let worstRatio = 0;
  let fail = false;

  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    await page.waitForFunction(() => window.__cartRaveMainReady === true, undefined, {
      timeout: timeoutMs,
    });
    await page.waitForFunction(() => Boolean(window.__cartRave), undefined, { timeout: 15000 }).catch(() => {
      throw new Error("window.__cartRave harness not installed — pass ?harness=1");
    });
    await page.evaluate(async () => {
      await window.__cartRave?.ensureWorld?.();
    });
    await page.waitForFunction(() => window.__cartRave?.worldReady === true, undefined, {
      timeout: timeoutMs,
    }).catch(() => console.warn("[blackframes] worldReady timeout — sampling anyway"));

    await page.evaluate(() => {
      try {
        localStorage.setItem("cartRaveHowToSeen", "1");
      } catch {
        /* ignore */
      }
      const howto = document.getElementById("cr-howto-screen");
      if (howto) {
        howto.style.display = "none";
        howto.setAttribute("aria-hidden", "true");
      }
    });

    // * Warm a few frames before measuring.
    await page.evaluate(async () => {
      window.__cartRave?.applyCam?.();
      await window.__cartRave?.settle?.(24);
    });
    await page
      .waitForFunction(
        () => document.getElementById("cr-root")?.classList.contains("cr-root--attract") === true,
        undefined,
        { timeout: 20000 },
      )
      .catch(() => {});

    for (let i = 0; i < frames; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const sample = await page.evaluate(async () => {
        await window.__cartRave?.settle?.(1);
        return window.__cartRave?.sampleBlack?.({ maxDim: 240, threshold: 2 });
      });
      const ratio = sample?.ratio ?? -1;
      const maxRun = sample?.maxRun ?? 0;
      samples.push({ i, ratio, maxRun });
      if (ratio > worstRatio) worstRatio = ratio;

      const isFull = ratio >= 0.995;
      if (isFull) {
        fullBlackRun += 1;
        if (fullBlackRun > maxFullBlackRun) maxFullBlackRun = fullBlackRun;
      } else {
        fullBlackRun = 0;
      }

      if (ratio >= maxRatio) {
        console.warn(`[blackframes] frame ${i}: ratio=${ratio.toFixed(4)} EXCEEDS max-ratio`);
        fail = true;
      }
    }

    if (maxFullBlackRun > maxFull) {
      console.warn(
        `[blackframes] consecutive full-black frames ${maxFullBlackRun} > max-full ${maxFull}`,
      );
      fail = true;
    }

    const ratios = samples.map((s) => s.ratio).filter((r) => r >= 0);
    ratios.sort((a, b) => a - b);
    const med = ratios[Math.floor(ratios.length / 2)] ?? -1;
    const mean = ratios.length ? ratios.reduce((a, b) => a + b, 0) / ratios.length : -1;

    console.log(
      `[blackframes] mean=${mean.toFixed(4)} median=${med.toFixed(4)} worst=${worstRatio.toFixed(4)} maxFullRun=${maxFullBlackRun}`,
    );
    console.log(fail ? "[blackframes] FAIL" : "[blackframes] PASS");

    if (reportPath) {
      mkdirSync(resolve(reportPath, ".."), { recursive: true });
      writeFileSync(
        resolve(reportPath),
        JSON.stringify(
          {
            url,
            frames,
            maxRatio,
            maxFull,
            mean,
            median: med,
            worst: worstRatio,
            maxFullBlackRun,
            fail,
            samples,
          },
          null,
          2,
        ),
      );
      console.log(`[blackframes] report ${resolve(reportPath)}`);
    }
  } finally {
    await browser.close();
    if (serverProc && !serverProc.killed) serverProc.kill();
  }

  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error("[blackframes] FAILED:", e instanceof Error ? e.message : e);
  process.exit(1);
});
