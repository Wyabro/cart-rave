/**
 * tabhidden.mjs — invisible-content trap guard (checklist rule #1).
 *
 * Reproduces a real backgrounded-tab freeze DURING a reveal and asserts no
 * content is stranded invisible on return. Two scenes:
 *
 *   menu  — the menu entrance cascade. Entrance targets sit at opacity:0
 *           (`.cr-menu-enter-pending`) until an anime.js cascade fades them in,
 *           with a fallback setTimeout that drops the pending class. Freeze rAF
 *           mid-cascade, then on return every target must be visible again.
 *
 *   round — the solo round-start HUD. `?room=solo` runs a 3s countdown (arena
 *           splash + status digit, timer hidden) then flips to running (timer
 *           shown). The HUD is driven by the rAF game loop, so freezing it
 *           through the whole countdown must NOT strand the HUD on a stale
 *           pre-round frame: on return it must catch up to a running round
 *           (timer visible, score boxes visible, no frozen countdown digit).
 *
 * Both drive the same cycle:
 *   1. mark tab hidden + freeze rAF  → 2. trigger/advance the reveal
 *   → 3. hold hidden                 → 4. restore visible + resume rAF
 *   → 5. settle                      → 6. assert nothing is stranded
 *
 * Faithful to Chrome: rAF callbacks are DEFERRED while hidden (queued, not
 * dropped) and flushed on return, and background setTimeout still fires.
 *
 * Usage:
 *   npm run tabhidden                       # both scenes
 *   npm run tabhidden -- --scene menu       # menu only
 *   npm run tabhidden -- --scene round      # round only
 *   npm run tabhidden -- --strict           # also fail if a scene never stalled
 *   npm run tabhidden -- --hold 2000 --report shots/tabhidden.json
 *   npm run tabhidden -- --url http://127.0.0.1:5173/ --noserver
 *
 * Exit code 1 if any scene strands content invisible after the hide/show cycle
 * (or, with --strict, if a scene proved nothing because nothing stalled).
 */

import { spawn, spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { writeFileSync, mkdirSync } from "node:fs";

// * Entrance targets gated by `.cr-menu-enter-pending` in cart-rave-menu.css.
// * Each must read as visible again once the tab returns to the foreground.
const MENU_TARGETS = [
  ".cr-tagline",
  ".cr-title-word",
  ".cr-buttons .cr-btn",
  ".cr-levels-hd",
  ".cr-level-btn:not(.cr-level-btn--disabled)",
];

// * Round-start HUD targets that must read as visible once the round is running.
// * The timer is `display:none` during countdown, so its visibility doubles as
// * proof the frozen HUD caught up to the running phase on return.
const ROUND_TARGETS = ["#hud", "#hud .hud-timer", "#hud .hud-scoreBox"];

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

function buildUrl(base, scene) {
  const u = new URL(base);
  u.searchParams.set("harness", "1");
  // * Deliberately NO perfPump: it keeps rAF ticking in hidden tabs, which would
  // * paper over the exact stall this test needs to reproduce.
  if (scene === "round") {
    // * Boot straight into an offline solo round so the countdown → running
    // * reveal happens without netcode.
    u.searchParams.set("room", "solo");
  } else {
    u.searchParams.set("freeze", "1"); // * Pin the attract camera for the menu scene.
  }
  return u.toString();
}

async function ensurePlaywright() {
  try {
    return await import("playwright");
  } catch {
    console.error(
      "[tabhidden] playwright missing. Run:\n  npm i -D playwright\n  npx playwright install chromium",
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
      console.log("[tabhidden] dev server ready on :5173");
      return child;
    }
    // eslint-disable-next-line no-await-in-loop
    await sleep(250);
  }
  child.kill();
  throw new Error("Dev server failed to start");
}

/** Kills the dev server AND its child Vite process (child.kill leaves the tree on Windows). */
function stopDevServer(child) {
  if (!child || child.killed) return;
  if (process.platform === "win32" && child.pid) {
    try {
      spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
      return;
    } catch {
      /* fall through to kill() */
    }
  }
  child.kill();
}

/**
 * Installs `window.__tabHiddenCtl` — a controller that fakes tab visibility and
 * freezes/resumes requestAnimationFrame, plus a per-selector visibility probe.
 * Runs in the page; kept dependency-free so it survives any bundle.
 */
function installController() {
  // * Keep the how-to overlay from auto-opening over the menu targets, and skip
  // * the returning-boot delay. Runs at document_start (before app scripts).
  try {
    localStorage.setItem("cartRaveHowToSeen", "1");
    localStorage.setItem("cartRaveBootSeen", "1");
  } catch {
    /* ignore */
  }

  const nativeRaf = window.requestAnimationFrame.bind(window);
  const nativeCaf = window.cancelAnimationFrame.bind(window);
  /** @type {Map<number, FrameRequestCallback>} */
  const queued = new Map();
  let nextId = 1 << 20; // * Avoid colliding with native ids.
  let frozen = false;
  let hiddenState = false;

  const defineVis = () => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => (hiddenState ? "hidden" : "visible"),
    });
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => hiddenState,
    });
  };
  defineVis();

  window.requestAnimationFrame = (cb) => {
    if (!frozen) return nativeRaf(cb);
    const id = nextId++;
    queued.set(id, cb);
    return id;
  };
  window.cancelAnimationFrame = (id) => {
    if (queued.has(id)) {
      queued.delete(id);
      return;
    }
    nativeCaf(id);
  };

  /**
   * @param {string[]} selectors
   * @returns {Array<{ sel: string, matched: number, visible: number, minOpacity: number }>}
   */
  const probe = (selectors) =>
    selectors.map((sel) => {
      const els = Array.from(document.querySelectorAll(sel));
      let visible = 0;
      let minOpacity = 1;
      for (const el of els) {
        const he = /** @type {HTMLElement} */ (el);
        // * checkVisibility({checkOpacity}) walks ancestors and returns false if
        // * this element or any parent is fully transparent — the stranded state.
        const ok =
          typeof he.checkVisibility === "function"
            ? he.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true, opacityProperty: true, visibilityProperty: true })
            : he.offsetParent !== null;
        if (ok) visible += 1;
        const op = Number.parseFloat(getComputedStyle(he).opacity || "1");
        if (Number.isFinite(op) && op < minOpacity) minOpacity = op;
      }
      return { sel, matched: els.length, visible, minOpacity };
    });

  window.__tabHiddenCtl = {
    hide() {
      hiddenState = true;
      frozen = true;
      document.dispatchEvent(new Event("visibilitychange"));
    },
    show() {
      hiddenState = false;
      frozen = false;
      document.dispatchEvent(new Event("visibilitychange"));
      // * Flush deferred frames so the stalled reveal engines resume, exactly as
      // * Chrome replays pending rAF callbacks when a tab returns to foreground.
      const pending = Array.from(queued.values());
      queued.clear();
      const now = performance.now();
      for (const cb of pending) {
        try {
          cb(now);
        } catch {
          /* keep flushing */
        }
      }
    },
    probe,
  };
}

/** Logs a probe row and returns whether it passed (all matched els visible). */
function reportProbe(rows) {
  let fail = false;
  for (const r of rows) {
    if (r.matched === 0) {
      console.log(`[tabhidden]   ${r.sel} — no elements (skipped)`);
      continue;
    }
    const ok = r.visible === r.matched;
    console.log(
      `[tabhidden]   ${ok ? "OK  " : "FAIL"} ${r.sel} — ${r.visible}/${r.matched} visible (minOpacity=${r.minOpacity.toFixed(3)})`,
    );
    if (!ok) fail = true;
  }
  return fail;
}

/**
 * Menu entrance scene: freeze rAF, replay the entrance so its cascade stalls,
 * hold hidden, return, and assert every entrance target is visible.
 */
async function runMenuScene(page, { holdMs, settleMs, timeoutMs, strict }) {
  console.log("[tabhidden] --- scene: menu ---");
  await page.waitForFunction(() => Boolean(window.CartRave?.playEntrance), undefined, {
    timeout: timeoutMs,
  });
  await page.waitForSelector("#cr-root .cr-tagline", { timeout: 15000 });

  // * Go hidden + freeze rAF, THEN replay the entrance so its reveals stall.
  await page.evaluate(() => {
    window.__tabHiddenCtl.hide();
    window.CartRave.playEntrance();
  });

  // * Sanity: while frozen the targets should read as invisible — proof the test
  // * exercises a real stall. Probe before the entrance fallback timeout (~1s).
  await page.waitForTimeout(300);
  const midProbe = await page.evaluate((sels) => window.__tabHiddenCtl.probe(sels), MENU_TARGETS);
  const stalled = midProbe.filter((r) => r.matched > 0 && r.visible === 0).length;
  let noStall = false;
  if (stalled === 0) {
    noStall = true;
    console.warn(
      `[tabhidden] ${strict ? "FAIL" : "WARNING"}: no menu targets stalled while hidden — test is a no-op (perfPump / reduced-motion?).`,
    );
  } else {
    console.log(`[tabhidden] hidden: ${stalled}/${midProbe.length} target groups stalled at opacity:0 (expected)`);
  }

  await page.waitForTimeout(holdMs);
  await page.evaluate(() => window.__tabHiddenCtl.show());
  await page.waitForTimeout(settleMs);
  await page.evaluate(async () => window.__cartRave?.settle?.(12)).catch(() => {});

  const finalProbe = await page.evaluate((sels) => window.__tabHiddenCtl.probe(sels), MENU_TARGETS);
  // * In --strict a no-op run (nothing ever stalled) fails: it proves nothing.
  const fail = reportProbe(finalProbe) || (strict && noStall);
  console.log(fail ? "[tabhidden] menu FAIL" : "[tabhidden] menu PASS");
  return { scene: "menu", fail, noStall, midProbe, finalProbe };
}

/**
 * Round-start HUD scene: wait for the solo round to reach its countdown, freeze
 * the rAF game loop through the whole countdown → running transition, return,
 * and assert the HUD caught up (timer + score boxes visible, no frozen digit).
 */
async function runRoundScene(page, { holdMs, settleMs, roundTimeoutMs, strict }) {
  console.log("[tabhidden] --- scene: round ---");
  // * Arena warm is the flaky part headless (WebGL/SwiftShader) — gate on the
  // * harness worldReady first so a stall here reads as "warm never finished"
  // * rather than "countdown never fired".
  await page
    .waitForFunction(() => window.__cartRave?.worldReady === true, undefined, { timeout: roundTimeoutMs })
    .catch(async () => {
      const diag = await page.evaluate(() => ({
        hud: Boolean(document.querySelector("#hud")),
        worldReady: Boolean(window.__cartRave?.worldReady),
        error: window.__cartRave?.error ?? null,
      }));
      throw new Error(
        `arena never warmed (worldReady=false) — headless WebGL flake. diag=${JSON.stringify(diag)}`,
      );
    });

  // * Round entry runs a 3s countdown before running. Wait (attached-based, no
  // * strict visibility race) until the HUD reaches either countdown (status
  // * shows a 1-3 digit) or running (timer visible), then branch on the phase we
  // * observed. Catching the live countdown lets the freeze span the countdown →
  // * running transition — the reveal under test.
  await page.waitForFunction(
    () => {
      const digit = /^[1-3]$/.test((document.querySelector("#hud .hud-status-num")?.textContent || "").trim());
      const timer = document.querySelector("#hud .hud-timer");
      const running = Boolean(timer && timer.checkVisibility?.({ checkOpacity: true, checkVisibilityCSS: true }));
      return digit || running;
    },
    undefined,
    { timeout: roundTimeoutMs, polling: "raf" },
  );

  // * Freeze the rAF game loop, then record the phase we froze on.
  const froze = await page.evaluate(() => {
    const digit = /^[1-3]$/.test((document.querySelector("#hud .hud-status-num")?.textContent || "").trim());
    window.__tabHiddenCtl.hide();
    return { caughtCountdown: digit };
  });
  if (froze.caughtCountdown) {
    console.log("[tabhidden] caught countdown — froze HUD mid-countdown");
  } else {
    console.warn(
      "[tabhidden] WARNING: missed live countdown — froze on running HUD; assertion still valid but weaker.",
    );
  }

  // * Sanity: while frozen the timer must still be hidden (HUD stuck pre-running).
  await page.waitForTimeout(300);
  const midStatus = await page.evaluate(() => ({
    timerVisible: (() => {
      const t = document.querySelector("#hud .hud-timer");
      return Boolean(t && t.checkVisibility?.({ checkOpacity: true, checkVisibilityCSS: true }));
    })(),
    status: (document.querySelector("#hud .hud-status")?.textContent || "").trim(),
  }));
  console.log(`[tabhidden] hidden: timerVisible=${midStatus.timerVisible} status=${JSON.stringify(midStatus.status)}`);
  // * No real reveal was frozen if we missed the countdown or the timer was
  // * already showing — the scene proves nothing (fails under --strict).
  const noStall = !froze.caughtCountdown || midStatus.timerVisible;

  // * Hold past the full 3s countdown so the transition to running happens while
  // * the loop is frozen — the case that could strand the HUD on a stale frame.
  // * Capped: holding past the round's own length (~60s) would let the round END
  // * mid-freeze — no timer on return → a false FAIL. 4s spans the countdown; the
  // * ceiling keeps a large --hold (meant for the menu) from ending the round.
  const ROUND_HOLD_MAX = 15000;
  const wantHold = Math.max(holdMs, 4000);
  const roundHold = Math.min(wantHold, ROUND_HOLD_MAX);
  if (wantHold > ROUND_HOLD_MAX) {
    console.warn(`[tabhidden] round hold capped ${wantHold}ms → ${roundHold}ms (avoid ending the round mid-freeze)`);
  }
  await page.waitForTimeout(roundHold);

  // * Return: resume the loop, then let it catch up to wall-clock round state.
  await page.evaluate(() => window.__tabHiddenCtl.show());
  await page.waitForTimeout(settleMs);
  await page.evaluate(async () => window.__cartRave?.settle?.(24)).catch(() => {});

  const finalProbe = await page.evaluate((sels) => window.__tabHiddenCtl.probe(sels), ROUND_TARGETS);
  let fail = reportProbe(finalProbe);

  // * A running round must not be stranded showing a stale countdown digit.
  const status = await page.evaluate(
    () => (document.querySelector("#hud .hud-status")?.textContent || "").trim(),
  );
  const strandedDigit = /^[1-3]$/.test(status);
  console.log(
    `[tabhidden]   ${strandedDigit ? "FAIL" : "OK  "} #hud .hud-status — ${JSON.stringify(status)}${strandedDigit ? " (stuck on countdown digit)" : ""}`,
  );
  if (strandedDigit) fail = true;
  // * In --strict a no-op run (missed the countdown) fails: it proves nothing.
  if (strict && noStall) {
    console.warn("[tabhidden] FAIL: round scene did not freeze a live reveal (--strict).");
    fail = true;
  }

  console.log(fail ? "[tabhidden] round FAIL" : "[tabhidden] round PASS");
  return { scene: "round", fail, noStall, midStatus, finalProbe, status };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const holdMs = Math.max(300, Number(str(args.hold) ?? 1300));
  const settleMs = Math.max(200, Number(str(args.settle) ?? 700));
  const width = Number(str(args.w) ?? 1280);
  const height = Number(str(args.h) ?? 720);
  const timeoutMs = Number(str(args.timeout) ?? 120000);
  const base = str(args.url) ?? "http://127.0.0.1:5173/";
  const reportPath = str(args.report);
  const sceneArg = (str(args.scene) ?? "all").toLowerCase();
  const scenes = sceneArg === "all" ? ["menu", "round"] : [sceneArg];
  if (scenes.some((s) => s !== "menu" && s !== "round")) {
    console.error(`[tabhidden] unknown --scene "${sceneArg}" (use menu | round | all)`);
    process.exit(2);
  }

  // * Arena warm is flaky headless, so the round scene gets a shorter budget and
  // * a retry rather than one long hang on the shared boot timeout.
  const roundTimeoutMs = Number(str(args["round-timeout"]) ?? 45000);
  const roundRetries = Math.max(0, Number(str(args["round-retries"]) ?? 1));
  // * --strict fails a scene that never stalled while hidden (it proves nothing).
  const strict = args.strict === true || args.strict === "1";

  console.log(`[tabhidden] scenes=${scenes.join(",")} hold=${holdMs}ms settle=${settleMs}ms${strict ? " strict" : ""}`);

  // * One dev server for every scene (each scene navigates its own URL).
  let serverProc = null;
  try {
    serverProc = await maybeStartDevServer(buildUrl(base, "menu"), args);
  } catch (err) {
    console.warn("[tabhidden]", err instanceof Error ? err.message : err);
  }

  const { chromium } = await ensurePlaywright();
  const browser = await chromium.launch({ headless: true });

  /** One page load + scene run; page is always closed. */
  const attemptScene = async (scene) => {
    const url = buildUrl(base, scene);
    console.log(`[tabhidden] ${url}`);
    const page = await browser.newPage({
      viewport: { width, height },
      deviceScaleFactor: 1,
      reducedMotion: "no-preference", // * Entrance cascade is skipped under reduced motion.
    });
    // * Surface page errors — a stalled warm is usually a thrown boot error.
    page.on("pageerror", (e) => console.warn(`[tabhidden] pageerror: ${e.message}`));
    page.on("console", (m) => {
      if (m.type() === "error") console.warn(`[tabhidden] console.error: ${m.text()}`);
    });
    try {
      await page.addInitScript(installController);
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: timeoutMs });
      await page.waitForFunction(() => window.__cartRaveMainReady === true, undefined, {
        timeout: timeoutMs,
      });
      const opts = { holdMs, settleMs, timeoutMs, roundTimeoutMs, strict };
      return scene === "round" ? await runRoundScene(page, opts) : await runMenuScene(page, opts);
    } finally {
      await page.close();
    }
  };

  // * Pre-warm Vite's dep optimizer on the solo URL: the first Rapier import
  // * triggers a re-optimization + reload that can 404 stale `?v=` modules and
  // * strand the real round scene. Absorb that once against a throwaway page so
  // * the graded runs load a settled server. Best-effort — never fails the tool.
  if (scenes.includes("round") && serverProc) {
    console.log("[tabhidden] pre-warming physics deps (solo)…");
    const warm = await browser.newPage({ viewport: { width, height } });
    try {
      await warm.goto(buildUrl(base, "round"), { waitUntil: "domcontentloaded", timeout: timeoutMs });
      await warm.waitForFunction(() => window.__cartRave?.worldReady === true, undefined, {
        timeout: roundTimeoutMs,
      });
      console.log("[tabhidden] deps warm");
    } catch {
      console.warn("[tabhidden] pre-warm did not reach worldReady — continuing (round scene will retry)");
    } finally {
      await warm.close();
    }
  }

  let anyFail = false;
  /** @type {any[]} */
  const results = [];

  try {
    for (const scene of scenes) {
      const maxAttempts = scene === "round" ? roundRetries + 1 : 1;
      let result = null;
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
          // eslint-disable-next-line no-await-in-loop
          result = await attemptScene(scene);
          break;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (attempt < maxAttempts) {
            console.warn(`[tabhidden] ${scene} attempt ${attempt} failed (${msg}) — retrying`);
          } else {
            console.error(`[tabhidden] ${scene} FAIL — ${msg}`);
            result = { scene, fail: true, error: msg };
          }
        }
      }
      results.push(result);
      if (result?.fail) anyFail = true;
    }

    console.log(anyFail ? "[tabhidden] FAIL — content stranded invisible after tab return" : "[tabhidden] PASS");

    if (reportPath) {
      mkdirSync(resolve(reportPath, ".."), { recursive: true });
      writeFileSync(
        resolve(reportPath),
        JSON.stringify({ scenes, holdMs, settleMs, fail: anyFail, results }, null, 2),
      );
      console.log(`[tabhidden] report ${resolve(reportPath)}`);
    }
  } finally {
    await browser.close();
    stopDevServer(serverProc);
  }

  process.exit(anyFail ? 1 : 0);
}

main().catch((e) => {
  console.error("[tabhidden] FAILED:", e instanceof Error ? e.message : e);
  process.exit(1);
});
