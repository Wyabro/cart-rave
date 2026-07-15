/**
 * netharness.mjs — 2-client netcode E2E rig for Cart Clash.
 *
 * Drives two real browser clients (host + mid-round joiner) into the same `quickplay`
 * room against the local Vite+Wrangler stack, then asserts cross-client invariants using
 * the read-only window.__ccTest hook (see src/utils/netTestHarness.js). This exists because
 * the P2P prediction/reconciliation bugs (e.g. the joiner-stuck-at-spawn spawn-lock) are
 * invisible to unit tests — they need two live clients and a real DataChannel.
 *
 * Usage:
 *   node tools/netharness.mjs                 # auto-starts `npm run dev:local`, headless
 *   node tools/netharness.mjs --headed        # visible browser (debug / if headless WebRTC flaky)
 *   node tools/netharness.mjs --url http://127.0.0.1:3000/   # reuse already-running dev stack
 *   node tools/netharness.mjs --scenario spawnlock           # (default) mid-round joiner drives
 *
 * Requires: Playwright Chromium (`npx playwright install chromium`).
 * Exit code 0 = all assertions passed; 1 = a scenario failed; 2 = harness/setup error.
 */

import { setTimeout as sleep } from "node:timers/promises";
// * Shared CLI/Playwright plumbing (arg parsing, dev-stack lifecycle, browser launch, exit
// * contract) lives in ./lib/harness.mjs — the same helpers the gameplay rig uses, so both
// * stay consistent. The netcode-specific pieces (makeClient with the nettest hook, the
// * __ccTest state polling, the cold-load gate) stay here.
import {
  parseArgs,
  str,
  maybeStartDevStack,
  ensurePlaywright,
  launchClientBrowser,
  CLIENT_PORT,
} from "./lib/harness.mjs";

const nlog = (...a) => console.log("[netharness]", ...a);

/**
 * A client wrapper: its own browser context (isolated localStorage → distinct username),
 * one page with the netTest hook installed.
 */
async function makeClient(browser, { username, baseUrl, label }) {
  const context = await browser.newContext({ viewport: { width: 900, height: 600 } });
  // * Seed identity + skip intro overlays BEFORE any page script runs, so the
  // * ?room=quickplay auto-rejoin path (main.js) fires without DOM interaction.
  await context.addInitScript((name) => {
    try {
      localStorage.setItem("cartRaveUsername", name);
      localStorage.setItem("cartRaveHowToSeen", "1");
      localStorage.setItem("cartRaveBootSeen", "1");
    } catch {
      /* ignore */
    }
  }, username);

  const page = await context.newPage();
  // * Force the page to always report focused/visible. Chromium throttles background pages
  // * to ~3fps (intensive wake-up throttling reaches even perfPump's MessageChannel), which
  // * starves the fixed-step sim loop. Belt-and-suspenders with per-client browser processes.
  try {
    const cdp = await context.newCDPSession(page);
    await cdp.send("Emulation.setFocusEmulationEnabled", { enabled: true });
  } catch (e) {
    console.warn(`[${label}] focus emulation unavailable:`, e instanceof Error ? e.message : e);
  }
  page.on("pageerror", (e) => console.error(`[${label}:pageerror]`, e.message));
  page.on("console", (m) => {
    const t = m.text();
    if (m.type() === "error" && !/onsleek|allowlist|No Listener/i.test(t)) {
      console.error(`[${label}:console]`, t);
    }
  });

  const url = new URL(baseUrl);
  url.searchParams.set("room", "quickplay");
  url.searchParams.set("nettest", "1");
  // * Both clients run backgrounded (only one Playwright page can be foreground), so their
  // * rAF throttles to ~1fps and the fixed-step sim loop stalls (dt > RESUME_GAP_S zeroes the
  // * accumulator every frame). perfPump shims rAF with a 60Hz MessageChannel loop that runs
  // * while hidden — without it BOTH sims freeze and the test measures nothing. Dev-only shim.
  url.searchParams.set("perfPump", "1");
  await page.goto(url.toString(), { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForFunction(() => window.__ccTest?.ready === true, undefined, { timeout: 60_000 });
  return { context, page, label, username };
}

/**
 * Poll __ccTest.getState() (fetched into Node) until predFn(state) is truthy or timeout.
 * predFn is a real Node-side function — no in-page eval, no string injection surface.
 * @param {import('playwright').Page} page
 * @param {(state: any) => boolean} predFn
 */
async function waitForState(page, predFn, { timeout = 30_000, label = "" } = {}) {
  const deadline = Date.now() + timeout;
  let state = null;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    // eslint-disable-next-line no-await-in-loop
    state = await page.evaluate(() => window.__ccTest.getState());
    if (predFn(state)) return state;
    if (Date.now() > deadline) {
      throw new Error(`[${label}] timed out.\n  last state: ${JSON.stringify(state)}`);
    }
    // eslint-disable-next-line no-await-in-loop
    await sleep(200);
  }
}

/**
 * Wait until a freshly-joined client is past its cold world bootstrap. On join the main
 * thread blocks for many seconds (Rapier + arena + shader compile), showing up as a huge
 * single-frame maxDt; driving during that stall measures the stall, not the netcode. Headless
 * WebGL runs the loop slowly (~5fps) even when healthy, so we do NOT require 60fps — only that
 * the big stall is over (maxDt stable) and the loop is still ticking. At ~5fps the fixed-step
 * accumulator still catches up (multiple substeps/frame), so input is sampled fine.
 */
async function waitForColdLoadDone(page, { timeout = 60_000, label = "" } = {}) {
  const deadline = Date.now() + timeout;
  let good = 0;
  let prev = await page.evaluate(() => window.__ccLoopDbg ?? { frames: 0, maxDt: 0 });
  while (Date.now() < deadline) {
    // eslint-disable-next-line no-await-in-loop
    await sleep(1500);
    // eslint-disable-next-line no-await-in-loop
    const dbg = await page.evaluate(() => window.__ccLoopDbg ?? { frames: 0, maxDt: 0 });
    const advanced = dbg.frames - prev.frames;
    const stallGrew = dbg.maxDt - prev.maxDt > 0.5; // a new multi-hundred-ms+ stall this window
    prev = dbg;
    if (advanced >= 5 && !stallGrew) {
      good += 1;
      if (good >= 2) return dbg;
    } else {
      good = 0;
    }
  }
  const last = await page.evaluate(() => window.__ccLoopDbg ?? null);
  throw new Error(`[${label}] cold load never settled. last: ${JSON.stringify(last)}`);
}

/** Dispatch a real keydown/keyup on window (drives the production input path). */
async function holdKey(page, code) {
  await page.evaluate((c) => {
    window.dispatchEvent(new KeyboardEvent("keydown", { code: c, bubbles: true }));
  }, code);
}
async function releaseKey(page, code) {
  await page.evaluate((c) => {
    window.dispatchEvent(new KeyboardEvent("keyup", { code: c, bubbles: true }));
  }, code);
}

const results = [];
function check(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

/**
 * Scenario: mid-round joiner must be able to drive its own cart off spawn.
 * Reproduces the spawn-lock (host advertises ackSeq for input it never applied → the
 * client prunes pendingInputs and hard-snaps back to spawn every snapshot).
 */
async function scenarioSpawnLock(browserHost, browserJoiner, baseUrl) {
  console.log("[scenario] spawnlock — mid-round joiner drives forward");

  // 1. Host enters first and reaches a running round (quickplay fills with NPCs).
  const host = await makeClient(browserHost, { username: "HostBot", baseUrl, label: "host" });
  await waitForState(host.page, (s) => s.phase === "running" && s.localSlotIndex >= 0, {
    timeout: 40_000,
    label: "host-running",
  });
  console.log("[scenario] host is running");

  // Sanity: is the host sim actually stepping? Drive the host's OWN cart (pure local sim +
  // input, zero P2P). If this fails the harness itself is broken (rAF/perfPump), not the game.
  const hostBefore = await host.page.evaluate(() => window.__ccTest.getSelfCart());
  await holdKey(host.page, "KeyW");
  await sleep(1500);
  await releaseKey(host.page, "KeyW");
  const hostAfter = await host.page.evaluate(() => window.__ccTest.getSelfCart());
  const hostSelfDisp =
    hostBefore && hostAfter ? Math.hypot(hostAfter.x - hostBefore.x, hostAfter.z - hostBefore.z) : 0;
  console.log(
    `[scenario] host self-drive ${hostSelfDisp.toFixed(2)}m — ${JSON.stringify(hostBefore)} -> ${JSON.stringify(hostAfter)}`,
  );
  check("host can drive its own cart (sim liveness)", hostSelfDisp > 0.5, `${hostSelfDisp.toFixed(2)}m`);

  // 2. Joiner connects mid-round → seats into an ex-NPC slot (the repro condition).
  const joiner = await makeClient(browserJoiner, { username: "JoinBot", baseUrl, label: "joiner" });
  const seated = await waitForState(
    joiner.page,
    (s) => s.phase === "running" && s.localSlotIndex >= 0 && s.carts.some((c) => c.slot === s.localSlotIndex),
    { timeout: 40_000, label: "joiner-seated" },
  );
  const joinerSlot = seated.localSlotIndex;
  console.log(`[scenario] joiner seated at slot ${joinerSlot}, connId ${seated.youConnId}`);
  check("joiner is a non-host client", seated.isHost === false, `isHost=${seated.isHost}`);

  // Gate: confirm the DataChannel is actually delivering host snapshots. Without this,
  // a failed headless WebRTC handshake would let the joiner predict unopposed (cart moves)
  // and silently mask the spawn-lock. If this times out, the run is inconclusive, not a pass.
  const snap0 = seated.latestSnapSeq ?? 0;
  const flowing = await waitForState(
    joiner.page,
    (s) => (s.latestSnapSeq ?? 0) > snap0 + 3,
    { timeout: 15_000, label: "joiner-receiving-host-snapshots" },
  );
  console.log(`[scenario] P2P up — host snapshots arriving (seq ${snap0} → ${flowing.latestSnapSeq})`);

  // Wait out the joiner's cold-load main-thread stall so we measure netcode, not bootstrap.
  const health = await waitForColdLoadDone(joiner.page, { label: "joiner-loop" });
  console.log(`[scenario] joiner cold-load settled (${health.frames} frames, maxDt ${health.maxDt.toFixed(2)}s)`);

  // Prediction-gate probe (why does the joiner sometimes never sample input?).
  const gate = await joiner.page.evaluate(() => window.__ccTest.getState());
  console.log(
    `[diag] joiner gates: predict=${gate.predict} mode=${gate.mode} ` +
      `migFreezeRemMs=${typeof gate.migFreezeRemMs === "number" ? gate.migFreezeRemMs.toFixed(0) : gate.migFreezeRemMs} phase=${gate.phase}`,
  );

  // Let a few snapshots settle so reconciliation is steady-state, then read baseline.
  await sleep(1000);
  const before = await joiner.page.evaluate(() => window.__ccTest.getSelfCart());
  const ackBefore = (await joiner.page.evaluate(() => window.__ccTest.getState())).ackForSelf;

  // 3. Drive forward for 1.6s.
  await holdKey(joiner.page, "KeyW");
  await sleep(250);
  const probe = await joiner.page.evaluate(() => window.__ccTest.getState());
  console.log(`[scenario] after keydown — axis=${JSON.stringify(probe.axis)} pending=${probe.pending}`);
  const t0 = Date.now();
  let maxDisp = 0;
  // * Headless loop runs ~5fps, so give it real wall-time to accumulate movement.
  while (Date.now() - t0 < 3500) {
    // eslint-disable-next-line no-await-in-loop
    const now = await joiner.page.evaluate(() => window.__ccTest.getSelfCart());
    if (now && before) {
      const d = Math.hypot(now.x - before.x, now.z - before.z);
      if (d > maxDisp) maxDisp = d;
    }
    // eslint-disable-next-line no-await-in-loop
    await sleep(100);
  }
  await releaseKey(joiner.page, "KeyW");

  const after = await joiner.page.evaluate(() => window.__ccTest.getSelfCart());
  const stateAfter = await joiner.page.evaluate(() => window.__ccTest.getState());
  const dispSelf = after && before ? Math.hypot(after.x - before.x, after.z - before.z) : 0;

  // Host's authoritative view of the joiner cart (did the HOST actually move it?).
  const hostView = await host.page.evaluate(
    (slot) => window.__ccTest.getState().carts.find((c) => c.slot === slot) || null,
    joinerSlot,
  );
  const hostDisp = hostView && before ? Math.hypot(hostView.x - before.x, hostView.z - before.z) : 0;

  console.log(
    `[scenario] displacement — joiner-local peak ${maxDisp.toFixed(2)}m, final ${dispSelf.toFixed(2)}m; ` +
      `host-view ${hostDisp.toFixed(2)}m; ackForSelf ${ackBefore} → ${stateAfter.ackForSelf}`,
  );
  // Decisive diagnostics: why is the cart non-drivable?
  const hostState = await host.page.evaluate(() => window.__ccTest.getState());
  const hostCartOfJoiner = hostState.carts.find((c) => c.slot === joinerSlot) || null;
  const joinerConnId = seated.youConnId;
  const hostInputDbg = await host.page.evaluate(
    (cid) => window.__ccTest.hostInputDebug(cid),
    joinerConnId,
  );
  console.log(
    `[diag] host input for joiner connId ${joinerConnId}: queueLen=${hostInputDbg?.queueLen} lastAckSeq=${hostInputDbg?.lastAckSeq}`,
  );
  console.log("[diag] joiner input counters:", JSON.stringify(stateAfter.counters));
  console.log("[diag] host input counters:  ", JSON.stringify(hostState.counters));
  const joinerLoop = await joiner.page.evaluate(() => window.__ccLoopDbg ?? null);
  const hostLoop = await host.page.evaluate(() => window.__ccLoopDbg ?? null);
  console.log("[diag] joiner loop:", JSON.stringify(joinerLoop));
  console.log("[diag] host loop:  ", JSON.stringify(hostLoop));
  console.log(
    "[diag] joiner self-cart:",
    JSON.stringify(after),
    "\n[diag] joiner selfSnapSpectator:",
    stateAfter.selfSnapSpectator,
    "pendingMidJoin:",
    stateAfter.pendingMidJoinConnId,
    "\n[diag] host view of joiner slot:",
    JSON.stringify(hostCartOfJoiner),
    "\n[diag] host netSlots kinds:",
    JSON.stringify(hostState.carts.map((c) => `${c.slot}:${c.kind}${c.isNpc ? "(npc)" : ""}`)),
    "pendingMidJoin(host):",
    hostState.pendingMidJoinConnId,
  );

  // THE assertion: the joiner's own cart must leave spawn when it presses forward.
  check(
    "joiner cart moves off spawn on forward input",
    maxDisp > 0.5,
    `peak displacement ${maxDisp.toFixed(2)}m (need > 0.5m)`,
  );
  // Diagnostic: the host should also see it move (distinguishes prediction-only from real).
  check(
    "host applies joiner input (authoritative cart moves)",
    hostDisp > 0.3,
    `host-view displacement ${hostDisp.toFixed(2)}m (need > 0.3m)`,
  );

  await joiner.context.close();
  await host.context.close();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const baseUrl = str(args.url) || `http://127.0.0.1:${CLIENT_PORT}/`;

  let devProc = null;
  try {
    devProc = await maybeStartDevStack(args, nlog);
  } catch (err) {
    console.error("[netharness]", err instanceof Error ? err.message : err);
    process.exit(2);
  }

  const { chromium } = await ensurePlaywright(nlog);
  // * Each client gets its OWN browser process so both have a foreground page — one shared
  // * browser throttles the non-focused page to ~3fps and starves its sim loop. The launch
  // * anti-throttle flags (see launchClientBrowser) plus per-page focus emulation keep both
  // * loops at full speed.
  const headed = args.headed === true;
  const browserHost = await launchClientBrowser(chromium, { headed });
  const browserJoiner = await launchClientBrowser(chromium, { headed });

  let hadError = false;
  try {
    await scenarioSpawnLock(browserHost, browserJoiner, baseUrl);
  } catch (err) {
    hadError = true;
    console.error("[netharness] scenario error:", err instanceof Error ? err.stack : err);
  } finally {
    await browserHost.close();
    await browserJoiner.close();
    if (devProc && !devProc.killed) devProc.kill();
  }

  const failed = results.filter((r) => !r.pass);
  console.log(`\n[netharness] ${results.length - failed.length}/${results.length} checks passed`);
  if (hadError || failed.length > 0) process.exit(1);
  process.exit(0);
}

main().catch((e) => {
  console.error("[netharness] FATAL:", e instanceof Error ? e.stack : e);
  process.exit(2);
});
