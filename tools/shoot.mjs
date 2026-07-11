/**
 * shoot.mjs — headless screenshot of Cart Clash at a fixed visual bookmark.
 *
 * Usage:
 *   npm run shoot -- --shot classic --out shots/classic.png
 *   npm run shoot -- --level backrooms --cam "0,8,16,0,0.5,0" --out shots/store.png
 *   npm run shoot -- --shot sundial --ablate bloom --out shots/sundial-no-bloom.png
 *
 * Requires: dev server (auto-started if --url omitted), Playwright Chromium.
 *   npx playwright install chromium
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

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
  // * Clean arena by default; pass --menu to keep chrome.
  if (args.menu !== true && args.menu !== "1") u.searchParams.set("hud", "0");
  const shot = str(args.shot);
  if (shot) u.searchParams.set("shot", shot);
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
      "[shoot] playwright is not installed. Run:\n  npm i -D playwright\n  npx playwright install chromium",
    );
    process.exit(1);
  }
}

/**
 * @param {string} url
 * @returns {Promise<import('node:child_process').ChildProcess | null>}
 */
async function maybeStartDevServer(url, args) {
  if (str(args.url) || args.noserver === true) return null;
  // * Only auto-start when targeting localhost.
  let host;
  try {
    host = new URL(url).hostname;
  } catch {
    return null;
  }
  if (host !== "localhost" && host !== "127.0.0.1") return null;

  const { default: waitOn } = await import("node:net").then(() => ({ default: null })).catch(() => ({ default: null }));
  void waitOn;

  // * Windows needs shell for npm.cmd resolution; args are fixed literals (not user input).
  const child = spawn("npm run dev -- --host 127.0.0.1 --port 5173 --strictPort", {
    cwd: resolve(process.cwd()),
    stdio: ["ignore", "pipe", "pipe"],
    shell: true,
    env: { ...process.env, BROWSER: "none" },
  });

  let ready = false;
  const onData = (buf) => {
    const t = String(buf);
    if (t.includes("Local:") || t.includes("5173")) ready = true;
  };
  child.stdout?.on("data", onData);
  child.stderr?.on("data", onData);

  const deadline = Date.now() + 60000;
  while (!ready && Date.now() < deadline) {
    // eslint-disable-next-line no-await-in-loop
    await sleep(200);
    // * Probe TCP
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
      ready = true;
      break;
    }
  }
  if (!ready) {
    child.kill();
    throw new Error("Dev server failed to start on :5173 within 60s");
  }
  console.log("[shoot] dev server ready on :5173");
  return child;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const width = Number(str(args.w) ?? 1280);
  const height = Number(str(args.h) ?? 720);
  const settle = Number(str(args.settle) ?? 36);
  const timeoutMs = Number(str(args.timeout) ?? 120000);
  const out = resolve(str(args.out) ?? `shots/shoot-${Date.now()}.png`);
  const base = str(args.url) ?? "http://127.0.0.1:5173/";
  const url = buildUrl(base, args);

  console.log(`[shoot] ${url}`);
  console.log(`[shoot] → ${out}`);

  let serverProc = null;
  try {
    serverProc = await maybeStartDevServer(url, args);
  } catch (err) {
    console.warn("[shoot] auto dev server:", err instanceof Error ? err.message : err);
    console.warn("[shoot] continuing — ensure `npm run dev` is already running");
  }

  const { chromium } = await ensurePlaywright();
  const browser = await chromium.launch({
    headless: true,
    channel: process.env.PLAYWRIGHT_CHROME_CHANNEL || undefined,
  });
  const page = await browser.newPage({
    viewport: { width, height },
    deviceScaleFactor: 1,
  });
  page.on("pageerror", (err) => console.error("[pageerror]", err.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") console.error("[page]", msg.text());
  });

  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    await page.waitForFunction(
      () => window.__cartRaveMainReady === true || window.__cartRave?.ready === true,
      undefined,
      { timeout: timeoutMs },
    );

    // * Prefer harness API when installed; otherwise wait main ready only.
    const hasHarness = await page.evaluate(() => Boolean(window.__cartRave));
    if (hasHarness) {
      await page.evaluate(async () => {
        const h = window.__cartRave;
        if (h?.ensureWorld) await h.ensureWorld();
      });
      await page.waitForFunction(() => window.__cartRave?.worldReady === true, undefined, {
        timeout: timeoutMs,
      }).catch(() => {
        console.warn("[shoot] worldReady wait timed out — capturing menu/bootstrap state");
      });
      // * Dismiss onboarding / overlay chrome so attract arena is visible.
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
      await page.evaluate(async (n) => {
        const h = window.__cartRave;
        h?.applyCam?.();
        if (h?.settle) await h.settle(n);
      }, settle);
      // * Wait until menu attract has painted the warm arena (when menu is up).
      // * With ?hud=0 the root is hidden but attract still runs.
      await page
        .waitForFunction(
          () =>
            document.getElementById("cr-root")?.classList.contains("cr-root--attract") === true ||
            (window.__cartRave?.worldReady === true && window.__cartRave?.frame > 10),
          undefined,
          { timeout: 20000 },
        )
        .catch(() => console.warn("[shoot] attract class not set — canvas may still be cold"));
      await page.evaluate(async () => {
        window.__cartRave?.applyCam?.();
        await window.__cartRave?.settle?.(12);
      });
    } else {
      await sleep(Math.max(2000, settle * 20));
    }

    mkdirSync(dirname(out), { recursive: true });
    // * Full viewport: menu attract composites canvas under translucent menu chrome.
    // * Canvas-only shots miss that composite and often capture a black buffer.
    await page.screenshot({ path: out, fullPage: false });

    const stats = hasHarness
      ? await page.evaluate(() => JSON.stringify(window.__cartRave?.stats?.() ?? {}))
      : "{}";
    console.log(`[stats] ${stats}`);
    const statsOut = str(args.stats);
    if (statsOut) {
      mkdirSync(dirname(resolve(statsOut)), { recursive: true });
      writeFileSync(resolve(statsOut), stats);
    }
    console.log(`[shoot] wrote ${out}`);
  } finally {
    await browser.close();
    if (serverProc && !serverProc.killed) {
      serverProc.kill();
    }
  }
}

main().catch((e) => {
  console.error("[shoot] FAILED:", e instanceof Error ? e.message : e);
  process.exit(1);
});
