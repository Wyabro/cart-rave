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
 *   node tools/netharness.mjs --scenario teardownRejoin      # menu-return teardown BEFORE join (07-17 freeze)
 *
 * Requires: Playwright Chromium (`npx playwright install chromium`).
 * Exit code 0 = all assertions passed; 1 = a scenario failed; 2 = harness/setup error;
 * 3 = inconclusive — no failures, but ≥1 drive check was skipped because the client loop
 * stayed starved (NET-2-class cold-load, environment noise). 3 is "no evidence", not red:
 * the battery renders it INCONCLUSIVE and does not fail the sweep over it.
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
  preflightStack,
  ensurePlaywright,
  launchClientBrowser,
  dumpFailureBundle,
  writeTallySync,
  resolveExitCode,
  CLIENT_PORT,
  killDevStack,
} from "./lib/harness.mjs";

const nlog = (...a) => console.log("[netharness]", ...a);

/**
 * A client wrapper: its own browser context (isolated localStorage → distinct username),
 * one page with the netTest hook installed.
 */
async function makeClient(browser, { username, baseUrl, label, diag = false }) {
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
  // * mpIntegration also needs the gameplay diagnostics hub (?diag) for round/score/announcer
  // * probes + the host control levers; spawnlock does NOT pass diag, so its clients are byte-for-
  // * byte the same as before (the netcode rig stays unchanged).
  if (diag) url.searchParams.set("diag", "1");
  await page.goto(url.toString(), { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForFunction(
    (needDiag) => window.__ccTest?.ready === true && (!needDiag || window.__ccDiag?.active === true),
    diag,
    { timeout: 60_000 },
  );
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
 * Poll a __ccDiag read (fetched into Node) until predFn is truthy or timeout. `readExpr` is a
 * serializable page fn (e.g. `() => window.__ccDiag.snapshot("round")`) — the diagnostics analog
 * of waitForState, used by the mpIntegration scenario for round/score/announcer assertions.
 * @param {import('playwright').Page} page
 * @param {() => any} readExpr
 * @param {(v: any) => boolean} predFn
 */
async function pollDiag(page, readExpr, predFn, { timeout = 15_000, label = "" } = {}) {
  const deadline = Date.now() + timeout;
  let v = null;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    // eslint-disable-next-line no-await-in-loop
    v = await page.evaluate(readExpr);
    if (predFn(v)) return v;
    if (Date.now() > deadline) throw new Error(`[${label}] timed out.\n  last: ${JSON.stringify(v)}`);
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

/**
 * Waits until the client has actually SAMPLED the held input (queued >= 1 pending
 * input) instead of trusting a fixed sleep before the drive-measurement window.
 *
 * This replaces the `sleep(250)` that was the single largest source of battery
 * noise. waitForColdLoadDone is a loose heuristic and can declare the loop
 * "settled" while it is still starved enough that the fixed-step accumulator
 * keeps resetting (gameLoop: dt>0.25s → accumulator=0), so the client never
 * samples input at all. The 3500ms window then measured a cart nobody asked to
 * move and the rig reported a bare `peak 0.00m` — indistinguishable from a real
 * netcode regression, and it landed on a different rig every run.
 *
 * Deliberately does NOT throw on timeout: the existing displacement/pending
 * checks stay the sole arbiters of pass/fail, so this can only remove a race,
 * never invent a new failure. On a healthy client it also returns as soon as
 * input is flowing, which is faster than the fixed sleep it replaces.
 *
 * @returns {Promise<number>} pendingInputs observed (0 = never sampled → starved).
 */
async function waitForInputSampled(page, { label = "input-sampled", timeout = 12_000 } = {}) {
  const readPending = () => {
    const s = window.__ccTest.getState();
    const n = typeof s.pending === "number" ? s.pending : Number(s.pendingInputs ?? 0);
    return Number.isFinite(n) ? n : 0;
  };
  const seen = await pollDiag(page, readPending, (n) => (n ?? 0) > 0, { timeout, label })
    .catch(() => 0);
  if (!seen) {
    console.log(
      `[diag] ${label}: client never sampled the held input within ${timeout}ms — ` +
        `loop starved (NET-2 class). Any 0.00m displacement below is that, not a netcode regression.`,
    );
  }
  return seen ?? 0;
}

/**
 * Hold forward (KeyW) and wait for it to be SAMPLED, with one recovery cycle when the loop
 * is starved: release, let the cold-load heuristic settle again (waitForColdLoadDone is
 * loose and can pass while the accumulator is still resetting every frame), then re-hold
 * and re-wait. One retry rescues the runs where the stall was merely long; a client that is
 * STILL starved after it is an environment verdict, and the caller should record its drive
 * checks as inconclusive() rather than FAIL — never as a netcode regression.
 *
 * The key is left HELD on return (both paths), so the caller's measure window and
 * releaseKey flow are unchanged.
 *
 * @returns {Promise<number>} pendingInputs observed (0 = starved even after the retry).
 */
async function holdForwardSampled(page, { label = "drive" } = {}) {
  await holdKey(page, "KeyW");
  let sampled = await waitForInputSampled(page, { label });
  if (!sampled) {
    console.log(`[diag] ${label}: starved — one recovery cycle (release, re-settle, re-drive)…`);
    await releaseKey(page, "KeyW");
    await waitForColdLoadDone(page, { timeout: 45_000, label: `${label}-recovery` }).catch(() => {});
    await sleep(1000);
    await holdKey(page, "KeyW");
    sampled = await waitForInputSampled(page, { label: `${label}-retry` });
  }
  return sampled;
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
 * Record a check the rig could not gather evidence for either way (starved client loop —
 * the NET-2-class cold-load, not a netcode regression). Counted separately from failures:
 * the run exits 3 (inconclusive), never 1, when these are the only non-passes.
 */
function inconclusive(name, detail) {
  results.push({ name, pass: false, inconclusive: true, detail });
  console.log(`  INCONCL  ${name}${detail ? ` — ${detail}` : ""}`);
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
  // * Hold + wait for the input to actually be sampled (one recovery retry) — see
  // * holdForwardSampled. sampled=0 downgrades the drive checks to INCONCLUSIVE below.
  const sampled = await holdForwardSampled(joiner.page, { label: "spawnlock-joiner-input" });
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
  // * Verdict split — starved (input NEVER sampled, cart still) is the environment failing
  // * to produce evidence, not the netcode failing: INCONCLUSIVE. Sampled-but-frozen
  // * (pending > 0, cart still) is the real spawn-lock signature and stays a red FAIL.
  if (!sampled && maxDisp < 0.5) {
    inconclusive(
      "joiner cart moves off spawn on forward input",
      `input never sampled (pending 0) even after retry — starved loop (NET-2 class), peak ${maxDisp.toFixed(2)}m proves nothing`,
    );
    inconclusive(
      "host applies joiner input (authoritative cart moves)",
      "no input ever left the starved joiner, so the host had nothing to apply",
    );
  } else {
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
  }

  await joiner.context.close();
  await host.context.close();
}

/**
 * Scenario: multiplayer gameplay integration — the dangerous seam where netcode and gameplay
 * overlap. Host starts a match, a second client joins mid-round, and we assert INVARIANTS (not
 * exact timing): both stay connected, the joiner controls its cart, a scored round syncs across
 * both clients, the podium crowns the same winner on both, the PA fires the right result per
 * client (winner→victory, loser→defeat), and the quickplay rematch brings both into a fresh
 * round. Deterministic levers (diag control.setScores / rewindRoundClock) stand in for a natural
 * KO so the run is stable; any natural KO events observed are logged as extra evidence.
 */
async function scenarioMpIntegration(browserHost, browserJoiner, baseUrl) {
  console.log("[scenario] mpIntegration — seat, drive, score-sync, podium, PA, rematch");
  const mark = results.length;
  const readRound = () => window.__ccDiag.snapshot("round");
  const readScores = () => window.__ccDiag.snapshot("score").scores;
  const annTypes = () => window.__ccDiag.events().filter((e) => e.ch === "announcer").map((e) => e.type);

  // 1. Host reaches a running round (quickplay fills with NPCs).
  const host = await makeClient(browserHost, { username: "MpHost", baseUrl, label: "host", diag: true });
  await waitForState(host.page, (s) => s.phase === "running" && s.localSlotIndex >= 0, {
    timeout: 40_000,
    label: "host-running",
  });

  // 2. Joiner connects mid-round and seats into a slot (the overlap condition).
  const joiner = await makeClient(browserJoiner, { username: "MpJoin", baseUrl, label: "joiner", diag: true });
  const seated = await waitForState(
    joiner.page,
    (s) => s.phase === "running" && s.localSlotIndex >= 0 && s.carts.some((c) => c.slot === s.localSlotIndex),
    { timeout: 40_000, label: "joiner-seated" },
  );
  const joinerSlot = seated.localSlotIndex;
  console.log(`[scenario] joiner seated at slot ${joinerSlot}`);

  // 3. Both connected, correct roles, both in a live round.
  const hostState = await host.page.evaluate(() => window.__ccTest.getState());
  check("host is the host", hostState.isHost === true, `isHost=${hostState.isHost}`);
  check("joiner is a non-host client", seated.isHost === false, `isHost=${seated.isHost}`);
  check(
    "both clients agree the round is running",
    hostState.phase === "running" && seated.phase === "running",
    `host=${hostState.phase} joiner=${seated.phase}`,
  );

  // Gate: confirm the DataChannel is actually delivering host snapshots (else the run is
  // inconclusive, not a pass) — same gate the spawnlock scenario uses.
  const snap0 = seated.latestSnapSeq ?? 0;
  await waitForState(joiner.page, (s) => (s.latestSnapSeq ?? 0) > snap0 + 3, {
    timeout: 15_000,
    label: "joiner-receiving-host-snapshots",
  });
  await waitForColdLoadDone(joiner.page, { label: "joiner-loop" });

  // 4. Joined player can control their cart (netcode overlap): own cart AND the host's
  //    authoritative view of it both move on forward input. Wait for a live self-cart body
  //    first (the cold-load can leave getSelfCart null briefly) so we assert drivability, not a
  //    race — then drive and measure the peak displacement over a real wall-time window.
  const before = await pollDiag(
    joiner.page,
    () => window.__ccTest.getSelfCart(),
    (s) => s && s.x !== undefined,
    { timeout: 15_000, label: "joiner-self-cart-ready" },
  ).catch(() => null);
  check("joiner has a live cart body to drive", Boolean(before), before ? "ready" : "self-cart null");
  // * Let reconciliation reach steady-state before driving. waitForColdLoadDone is a
  // * loose heuristic that can declare "settled" while the rAF loop is still too
  // * starved to sample input — the false `peak 0.00m` flake. The spawnlock scenario
  // * (reliable 4/4) does this same 1s settle + post-keydown probe; mirror it here.
  await sleep(1000);
  const sampled = await holdForwardSampled(joiner.page, { label: "mpIntegration-joiner-input" });
  const inputProbe = await joiner.page.evaluate(() => window.__ccTest.getState());
  console.log(
    `[scenario] joiner after keydown — axis=${JSON.stringify(inputProbe.axis)} pending=${inputProbe.pending}`,
  );
  let maxDisp = 0;
  const t0 = Date.now();
  while (Date.now() - t0 < 3500) {
    // eslint-disable-next-line no-await-in-loop
    const now = await joiner.page.evaluate(() => window.__ccTest.getSelfCart());
    if (now && before) maxDisp = Math.max(maxDisp, Math.hypot(now.x - before.x, now.z - before.z));
    // eslint-disable-next-line no-await-in-loop
    await sleep(100);
  }
  await releaseKey(joiner.page, "KeyW");
  const hostView = await host.page.evaluate(
    (slot) => window.__ccTest.getState().carts.find((c) => c.slot === slot) || null,
    joinerSlot,
  );
  const hostDisp = hostView && before ? Math.hypot(hostView.x - before.x, hostView.z - before.z) : 0;
  // * Same verdict split as spawnlock: never-sampled + still = INCONCLUSIVE (starved
  // * environment, no evidence); sampled-but-frozen stays a red FAIL. The gameplay
  // * invariants below (score sync, podium, PA, rematch) don't depend on the drive and run
  // * either way.
  if (!sampled && maxDisp < 0.5) {
    inconclusive(
      "joiner controls its cart (moves off spawn)",
      `input never sampled (pending 0) even after retry — starved loop (NET-2 class), peak ${maxDisp.toFixed(2)}m proves nothing`,
    );
    inconclusive(
      "host applies joiner input (authoritative cart moves)",
      "no input ever left the starved joiner, so the host had nothing to apply",
    );
  } else {
    check("joiner controls its cart (moves off spawn)", maxDisp > 0.5, `peak ${maxDisp.toFixed(2)}m`);
    check("host applies joiner input (authoritative cart moves)", hostDisp > 0.3, `host-view ${hostDisp.toFixed(2)}m`);
  }

  // 5. A scored KO → score updates + syncs. Host crowns the joiner via the diag control lever
  //    (stands in for a natural KO deterministically); both clients must converge on the score.
  // * CROWN_SCORE history: it used to be 3, which quietly relied on the bots being passive —
  // * and they were, because isAiCautiousPhase compared a performance.now() value against a
  // * timeOrigin-domain startedAtMs and pinned every bot in cautious phase forever. With that
  // * clock-domain bug fixed the bots actually fight, an NPC out-scored the scripted 3
  // * mid-window, and this scenario failed on a winner-slot mismatch (host and joiner still
  // * AGREED — result sync was never broken, only the assumption that nothing else scores).
  // * Raising the margin to 60 was NOT enough either (07-19): the score-sync poll below can
  // * hold the round open for up to 15s, and one KO harvesting a full Living-Store cargo load
  // * plus streak bonuses out-scored even 60. The margin only has to survive the final ~1.2s
  // * now — step 6 re-applies the crown atomically with the fast-end, and the podium checks
  // * assert the winner INVARIANT (crowned winner = top scorer, synced) rather than a
  // * pre-picked slot, so a legitimate NPC upset can never masquerade as a sync bug.
  const CROWN_SCORE = 60;
  const scored = await host.page.evaluate(([slot, crown]) => {
    const c = window.__ccDiag.control;
    if (!c || typeof c.setScores !== "function") return false;
    const s = { 0: 0, 1: 0, 2: 0, 3: 0 };
    s[slot] = crown;
    return c.setScores(s);
  }, [joinerSlot, CROWN_SCORE]);
  check(
    "host control.setScores applied (host-authoritative score)",
    scored?.ok === true,
    scored?.message ?? String(scored),
  );
  // * >= not ===: the joiner can also land a natural KO on top of the scripted crown.
  const joinerScores = await pollDiag(
    joiner.page,
    readScores,
    (sc) => (sc?.[joinerSlot] ?? 0) >= CROWN_SCORE,
    { timeout: 15_000, label: "joiner-score-synced" },
  ).catch(() => null);
  const hostScores = await host.page.evaluate(readScores);
  check(
    "both clients agree on the joiner's score (invariant: scores sync)",
    hostScores[joinerSlot] >= CROWN_SCORE
      && (joinerScores?.[joinerSlot] ?? 0) >= CROWN_SCORE
      && hostScores[joinerSlot] === (joinerScores?.[joinerSlot] ?? -1),
    `host=${hostScores[joinerSlot]} joiner=${joinerScores?.[joinerSlot]}`,
  );

  // 6. Winner/result sync: host fast-ends the round → both reach podium with the SAME winner.
  // * Re-apply the crown in the SAME evaluate as the rewind: the score-sync poll above can
  // * hold the round open for seconds while the NPCs fight, so the crown state at fast-end
  // * time — not at step-5 time — is what decides the podium. After this the NPCs only have
  // * the final ~1.2s to out-score a 60-point lead.
  const ended = await host.page.evaluate(([slot, crown]) => {
    const c = window.__ccDiag.control;
    if (!c || typeof c.rewindRoundClock !== "function") return false;
    const s = { 0: 0, 1: 0, 2: 0, 3: 0 };
    s[slot] = crown;
    const recrown = c.setScores(s);
    if (recrown?.ok !== true) return recrown;
    return c.rewindRoundClock(1200);
  }, [joinerSlot, CROWN_SCORE]);
  check(
    "host control.rewindRoundClock fast-ends the round",
    ended?.ok === true,
    ended?.message ?? String(ended),
  );
  // * Read winner + final scores in ONE page evaluate per client: scores freeze at podium
  // * until the quickplay rematch resets them (~5s), so this pair is a consistent snapshot.
  const readPodium = () => {
    const r = window.__ccDiag.snapshot("round");
    return r?.phase === "podium"
      ? { ...r, scores: window.__ccDiag.snapshot("score").scores }
      : r;
  };
  const hostPodium = await pollDiag(host.page, readPodium, (r) => r?.phase === "podium", {
    timeout: 20_000,
    label: "host-podium",
  });
  const joinerPodium = await pollDiag(joiner.page, readPodium, (r) => r?.phase === "podium", {
    timeout: 20_000,
    label: "joiner-podium",
  });
  // * Assert the INVARIANT, not the scripted slot: both clients crown the SAME winner, that
  // * winner is a top scorer of the final synced scores, and the final score maps match. An
  // * NPC that legitimately out-scores the re-applied crown in the last 1.2s changes the
  // * winner without breaking any of these — the old `winner === joinerSlot` form flagged
  // * that as a sync failure when sync was fine. (A tie at the top takes the Sudden Death
  // * path instead of podium and would time out the polls above; with the re-crown margin
  // * an exact 60–60 tie is not a realistic window.)
  const winnerSlot = hostPodium.winnerSlotIndex;
  check(
    "both clients agree on the winner slot (invariant: result syncs)",
    winnerSlot != null && joinerPodium.winnerSlotIndex === winnerSlot,
    `host=${winnerSlot} joiner=${joinerPodium.winnerSlotIndex}`,
  );
  const topScoreOf = (sc) => Math.max(...[0, 1, 2, 3].map((s) => Number(sc?.[s] ?? 0)));
  check(
    "podium crowns the top scorer on both clients (invariant: winner = argmax)",
    Number(hostPodium.scores?.[winnerSlot] ?? -1) === topScoreOf(hostPodium.scores)
      && Number(joinerPodium.scores?.[winnerSlot] ?? -1) === topScoreOf(joinerPodium.scores),
    `winner=${winnerSlot} host=${JSON.stringify(hostPodium.scores)} joiner=${JSON.stringify(joinerPodium.scores)}`,
  );
  check(
    "final podium scores sync (invariant: scores sync)",
    [0, 1, 2, 3].every((s) => Number(hostPodium.scores?.[s] ?? -1) === Number(joinerPodium.scores?.[s] ?? -2)),
    `host=${JSON.stringify(hostPodium.scores)} joiner=${JSON.stringify(joinerPodium.scores)}`,
  );
  if (winnerSlot !== joinerSlot) {
    console.log(
      `[scenario] NPC out-scored the re-applied crown in the final window (winner=${winnerSlot}, joiner=${joinerSlot}) — victory PA path exercised on neither client this run`,
    );
  }

  // 7. Announcer correctness: each client's result callout matches the crowned winner
  //    (decided locally by localSlot === winnerSlot). Poll so we don't race the reveal.
  // * Expected per client follows the ACTUAL winner: with the re-crown the joiner wins in
  // * practice (so victory is exercised on virtually every run), but a legitimate NPC upset
  // * must expect defeat on both clients, not fail the rig.
  const joinerExpected = winnerSlot === joinerSlot ? "victory" : "defeat";
  const hostExpected = winnerSlot === hostState.localSlotIndex ? "victory" : "defeat";
  await pollDiag(joiner.page, annTypes, (t) => t.includes("victory") || t.includes("defeat"), {
    timeout: 8_000,
    label: "joiner-PA-result",
  }).catch(() => {});
  const joinerAnn = await joiner.page.evaluate(annTypes);
  const hostAnn = await host.page.evaluate(annTypes);
  check(
    `PA result callout matches the outcome on the joiner (${joinerExpected})`,
    joinerAnn.includes(joinerExpected),
    `joiner=[${joinerAnn.slice(-6).join(",")}]`,
  );
  check(
    `PA result callout matches the outcome on the host (${hostExpected})`,
    hostAnn.includes(hostExpected),
    `host=[${hostAnn.slice(-6).join(",")}]`,
  );

  // 8. Rematch: quickplay auto-continues (~5s). Both clients leave podium into a fresh round and
  //    scores reset — the next-round invariant, without asserting exact transition timing.
  const hostRematch = await pollDiag(
    host.page,
    readRound,
    (r) => r && (r.phase === "countdown" || r.phase === "running"),
    { timeout: 25_000, label: "host-rematch" },
  ).catch(() => null);
  const joinerRematch = await pollDiag(
    joiner.page,
    readRound,
    (r) => r && (r.phase === "countdown" || r.phase === "running"),
    { timeout: 25_000, label: "joiner-rematch" },
  ).catch(() => null);
  check(
    "both clients advance into a fresh round (rematch works)",
    Boolean(hostRematch) && Boolean(joinerRematch),
    `host=${hostRematch?.phase} joiner=${joinerRematch?.phase}`,
  );
  const scoresAfter = await host.page.evaluate(readScores);
  check(
    "scores reset for the new round",
    (scoresAfter[joinerSlot] ?? 0) === 0,
    `joinerScore=${scoresAfter[joinerSlot]}`,
  );

  // 9. No impossible state: neither client logged a sim error over the whole scenario.
  const hostErrors = await host.page.evaluate(() => window.__ccDiag.events().filter((e) => e.ch === "error").length);
  const joinerErrors = await joiner.page.evaluate(() => window.__ccDiag.events().filter((e) => e.ch === "error").length);
  check("no sim errors on host", hostErrors === 0, `errors=${hostErrors}`);
  check("no sim errors on joiner", joinerErrors === 0, `errors=${joinerErrors}`);

  // Extra evidence (not asserted): any natural KO events either client happened to log.
  const kos = await host.page.evaluate(() => window.__ccDiag.events().filter((e) => e.ch === "ko").length);
  if (kos) console.log(`[scenario] host logged ${kos} natural KO event(s) during the round`);

  // Capture a bug bundle from BOTH clients if anything in this scenario failed.
  if (results.slice(mark).some((r) => !r.pass)) {
    await dumpFailureBundle(host.page, { scenario: "mpIntegration", label: "host", log: nlog });
    await dumpFailureBundle(joiner.page, { scenario: "mpIntegration", label: "joiner", log: nlog });
  }

  await joiner.context.close();
  await host.context.close();
}

/**
 * Scenario: host migration on clean host departure. The server must promote the surviving
 * client to host, and the new host must actually be able to RUN the room: its sim steps as
 * authority, its own cart drives, and NPC carts stay owned. This is the automated complement
 * to docs/planning/host-migration-test-plan.md's "clean close" case (the silent-drop 20s reap
 * case still needs the manual plan — Playwright can't kill a socket without closing the page).
 */
async function scenarioHostMigration(browserHost, browserJoiner, baseUrl) {
  console.log("[scenario] hostMigration — host leaves cleanly, survivor is promoted and playable");
  const mark = results.length;

  // 1. Host up and running; joiner seated with snapshots flowing (same bring-up as spawnlock).
  const host = await makeClient(browserHost, { username: "MigHost", baseUrl, label: "host", diag: true });
  await waitForState(host.page, (s) => s.phase === "running" && s.localSlotIndex >= 0, {
    timeout: 40_000,
    label: "host-running",
  });
  const joiner = await makeClient(browserJoiner, { username: "MigJoin", baseUrl, label: "joiner", diag: true });
  const seated = await waitForState(
    joiner.page,
    (s) => s.phase === "running" && s.localSlotIndex >= 0 && s.carts.some((c) => c.slot === s.localSlotIndex),
    { timeout: 40_000, label: "joiner-seated" },
  );
  check("joiner starts as a non-host client", seated.isHost === false, `isHost=${seated.isHost}`);
  const snap0 = seated.latestSnapSeq ?? 0;
  await waitForState(joiner.page, (s) => (s.latestSnapSeq ?? 0) > snap0 + 3, {
    timeout: 15_000,
    label: "joiner-receiving-host-snapshots",
  });
  await waitForColdLoadDone(joiner.page, { label: "joiner-loop" });

  // 2. The host leaves cleanly (tab close → WebSocket close → server onClose promotes the
  //    oldest surviving connection).
  console.log("[scenario] closing host client…");
  await host.context.close();

  // 3. Promotion: the survivor must become host.
  const promoted = await waitForState(joiner.page, (s) => s.isHost === true, {
    timeout: 30_000,
    label: "joiner-promoted",
  }).catch(() => null);
  check("survivor is promoted to host", promoted?.isHost === true, `isHost=${promoted?.isHost}`);
  if (!promoted) {
    await dumpFailureBundle(joiner.page, { scenario: "hostMigration", label: "joiner", log: nlog });
    await joiner.context.close();
    return;
  }

  // 4. The room stays sane: a live phase (not a wedge). Allow running OR a countdown/lobby
  //    reset — both are sane recoveries; a permanent podium/none is not.
  const phaseOk = ["running", "countdown", "lobby"].includes(promoted.phase);
  check("room lands in a sane phase after migration", phaseOk, `phase=${promoted.phase}`);

  // 5. The new host is genuinely playable: wait until a round is running, then drive.
  const running = await waitForState(joiner.page, (s) => s.phase === "running", {
    timeout: 40_000,
    label: "post-migration-running",
  }).catch(() => null);
  check("a round runs under the new host", Boolean(running), `phase=${running?.phase}`);

  // 6. NPC slots must come back under the new host's authority (the departed host's slot and
  //    the original NPCs). Poll — the rebuild takes a beat after promotion; a stable zero
  //    means the bots are gone for good (survivor plays alone = real bug).
  // * `kind` comes from the net slot record — `cart.isNpc` is false even on a healthy host's
  // * NPC carts (verified against a running host's slots), so it is NOT the signal here.
  const withNpcs = await waitForState(joiner.page, (s) => s.carts.some((c) => c.kind === "npc"), {
    timeout: 20_000,
    label: "post-migration-npcs",
  }).catch(() => null);
  check(
    "NPC carts live under the new host",
    Boolean(withNpcs),
    withNpcs
      ? `slots=[${withNpcs.carts.map((c) => `${c.slot}:${c.kind}`).join(",")}]`
      : "no NPC-kind cart appeared within 20s of migration",
  );
  if (running) {
    const before = await joiner.page.evaluate(() => window.__ccTest.getSelfCart());
    // * Do NOT use holdForwardSampled here: the driver is the PROMOTED HOST, and a host
    // * consumes its own input directly — pendingInputs stays 0 by design, so the sampled
    // * poll can only time out (verified live 2026-07-20: poll+retry both starve-timed-out
    // * while the cart drove 27.6m). Plain drive + displacement is the honest signal, and
    // * this rig never exhibited the 0.00m starvation flake anyway.
    await holdKey(joiner.page, "KeyW");
    let maxDisp = 0;
    const t0 = Date.now();
    while (Date.now() - t0 < 3500) {
      // eslint-disable-next-line no-await-in-loop
      const now = await joiner.page.evaluate(() => window.__ccTest.getSelfCart());
      if (now && before) maxDisp = Math.max(maxDisp, Math.hypot(now.x - before.x, now.z - before.z));
      // eslint-disable-next-line no-await-in-loop
      await sleep(100);
    }
    await releaseKey(joiner.page, "KeyW");
    check("new host drives its own cart (authority works)", maxDisp > 0.5, `peak ${maxDisp.toFixed(2)}m`);
  }

  // 6. No sim errors on the survivor across the whole handoff.
  const errs = await joiner.page.evaluate(
    () => window.__ccDiag.events().filter((e) => e.ch === "error").length,
  );
  check("no sim errors on the survivor", errs === 0, `errors=${errs}`);

  if (results.slice(mark).some((r) => !r.pass)) {
    await dumpFailureBundle(joiner.page, { scenario: "hostMigration", label: "joiner", log: nlog });
  }
  await joiner.context.close();
}

/**
 * Scenario: menu teardown BEFORE a mid-round join — the door every other scenario skipped.
 *
 * The 07-17 non-host input freeze (dabdb6b): `returnToMenu` → `clearNetcodeRuntimeRefs` nulls
 * netcode's `getAxisRef`, so `sampleLocalInputForTick` becomes a permanent no-op, and only
 * re-entering a session (`ensureSessionCartsReady` → `wireNetcodeRuntimeRefs`) re-wires it. The
 * bug was invisible to spawnlock/mpIntegration/hostMigration because they all join straight from
 * a `?room=` URL and never exercise the menu-return teardown. Here the seated joiner returns to
 * the menu (the real path, via the diag control lever), re-joins the SAME quickplay room, and
 * must still drive: cart leaves spawn AND inputs are sampled+queued (pendingInputs > 0). The F8
 * `net` probe's `axisWired` is asserted across all three states — wired → unwired → re-wired —
 * so the assertion pins the exact root cause, not just a symptom. Pre-fix, re-entry left the axis
 * null and every check after the teardown fails.
 */
async function scenarioTeardownRejoin(browserHost, browserJoiner, baseUrl) {
  console.log("[scenario] teardownRejoin — joiner returns to menu, re-joins, must still drive (07-17 axis-unwire freeze)");
  const mark = results.length;
  const readNet = () => window.__ccDiag.snapshot("net");

  // 1. Host reaches a running round (quickplay fills with NPCs). Host needs no diag hooks.
  const host = await makeClient(browserHost, { username: "TrHost", baseUrl, label: "host" });
  await waitForState(host.page, (s) => s.phase === "running" && s.localSlotIndex >= 0, {
    timeout: 40_000,
    label: "host-running",
  });
  console.log("[scenario] host is running");

  // 2. Joiner connects mid-round and seats, snapshots flow, cold-load settles (spawnlock bring-up).
  //    diag:true so the F8 `net` probe (axisWired / pendingInputs) and control lever are available.
  const joiner = await makeClient(browserJoiner, { username: "TrJoin", baseUrl, label: "joiner", diag: true });
  const seated = await waitForState(
    joiner.page,
    (s) => s.phase === "running" && s.localSlotIndex >= 0 && s.carts.some((c) => c.slot === s.localSlotIndex),
    { timeout: 40_000, label: "joiner-seated" },
  );
  check("joiner is a non-host client", seated.isHost === false, `isHost=${seated.isHost}`);
  const snap0 = seated.latestSnapSeq ?? 0;
  await waitForState(joiner.page, (s) => (s.latestSnapSeq ?? 0) > snap0 + 3, {
    timeout: 15_000,
    label: "joiner-receiving-host-snapshots",
  });
  await waitForColdLoadDone(joiner.page, { label: "joiner-loop-1" });

  // 3. Baseline: a fresh URL-join wires the input axis (the control the old scenarios stopped at).
  const net0 = await joiner.page.evaluate(readNet);
  console.log(`[scenario] first join — axisWired=${net0.axisWired} pendingInputs=${net0.pendingInputs}`);
  check("input axis wired on first join", net0.axisWired === true, `axisWired=${net0.axisWired}`);

  // 4. Teardown: the joiner returns to the menu via the real path (clearNetcodeRuntimeRefs nulls
  //    getAxisRef). Confirm the axis actually goes unwired — otherwise the rest proves nothing.
  const left = await joiner.page.evaluate(() => window.__ccDiag.control?.returnToMenu?.("esc") ?? false);
  check("joiner returnToMenu lever applied", left?.ok === true, left?.message ?? String(left));
  const unwired = await pollDiag(joiner.page, readNet, (n) => n && n.axisWired === false, {
    timeout: 8_000,
    label: "joiner-axis-unwired",
  }).catch(() => null);
  check(
    "teardown unwires the input axis (root cause reproduced)",
    unwired?.axisWired === false,
    `axisWired=${unwired?.axisWired}`,
  );

  // 5. Re-enter: start quickplay again → rejoin the SAME room the host still holds. This is the
  //    dispatch the menu button fires; it re-adds ?room=quickplay and runs the full play entry.
  console.log("[scenario] joiner re-entering quickplay…");
  await joiner.page.evaluate(() =>
    window.dispatchEvent(new CustomEvent("cartrave:menu", { detail: { action: "quickplay" } })),
  );
  const reseated = await waitForState(
    joiner.page,
    (s) => s.phase === "running" && s.localSlotIndex >= 0 && s.carts.some((c) => c.slot === s.localSlotIndex),
    { timeout: 45_000, label: "joiner-reseated" },
  );
  check("joiner re-seats as a non-host client after rejoin", reseated.isHost === false, `isHost=${reseated.isHost}`);
  const snap1 = reseated.latestSnapSeq ?? 0;
  await waitForState(joiner.page, (s) => (s.latestSnapSeq ?? 0) > snap1 + 3, {
    timeout: 15_000,
    label: "joiner-receiving-host-snapshots-2",
  });
  await waitForColdLoadDone(joiner.page, { label: "joiner-loop-2" });

  // 6. THE fix assertion: re-entry must re-wire the input axis (ensureSessionCartsReady →
  //    wireNetcodeRuntimeRefs). Pre-dabdb6b this stayed false and the cart froze for the session.
  const netRe = await pollDiag(joiner.page, readNet, (n) => n && n.axisWired === true, {
    timeout: 8_000,
    label: "joiner-axis-rewired",
  }).catch(() => joiner.page.evaluate(readNet));
  check("re-entry re-wires the input axis", netRe?.axisWired === true, `axisWired=${netRe?.axisWired}`);

  // 7. Drive: hold forward and assert both the effect (cart leaves spawn) AND the mechanism
  //    (inputs are sampled + queued, pendingInputs > 0). With the axis unwired both stay at zero.
  await sleep(1000);
  const before = await joiner.page.evaluate(() => window.__ccTest.getSelfCart());
  const sampled = await holdForwardSampled(joiner.page, { label: "teardownRejoin-joiner-input" });
  const probe = await joiner.page.evaluate(readNet);
  console.log(`[scenario] after keydown — pendingInputs=${probe.pendingInputs} axisWired=${probe.axisWired}`);
  let maxDisp = 0;
  // * Seed with what holdForwardSampled saw — its probe (__ccTest pending) and readNet's
  // * pendingInputs read the same queue, and the retry's observation must count.
  let maxPending = Math.max(sampled, typeof probe.pendingInputs === "number" ? probe.pendingInputs : 0);
  const t0 = Date.now();
  while (Date.now() - t0 < 3500) {
    // eslint-disable-next-line no-await-in-loop
    const now = await joiner.page.evaluate(() => window.__ccTest.getSelfCart());
    if (now && before) maxDisp = Math.max(maxDisp, Math.hypot(now.x - before.x, now.z - before.z));
    // eslint-disable-next-line no-await-in-loop
    const n = await joiner.page.evaluate(readNet);
    if (n && typeof n.pendingInputs === "number") maxPending = Math.max(maxPending, n.pendingInputs);
    // eslint-disable-next-line no-await-in-loop
    await sleep(100);
  }
  await releaseKey(joiner.page, "KeyW");
  const after = await joiner.page.evaluate(() => window.__ccTest.getSelfCart());
  const dispSelf = after && before ? Math.hypot(after.x - before.x, after.z - before.z) : 0;
  console.log(
    `[scenario] post-rejoin drive — peak ${maxDisp.toFixed(2)}m, final ${dispSelf.toFixed(2)}m, maxPending ${maxPending}`,
  );

  // * Verdict split with one EXTRA guard: pending 0 + cart still is ALSO the signature of
  // * the real 07-17 axis-unwire bug this scenario exists to catch. Only downgrade to
  // * INCONCLUSIVE when step 6 proved the axis IS wired (netRe.axisWired === true) — then a
  // * dead pending queue can only be the starved loop. Axis unwired stays a red FAIL here
  // * AND in the step-6 check above.
  if (netRe?.axisWired === true && maxPending === 0 && maxDisp < 0.5) {
    inconclusive(
      "joiner cart moves off spawn after menu→rejoin",
      `axis wired but input never sampled even after retry — starved loop (NET-2 class), peak ${maxDisp.toFixed(2)}m proves nothing`,
    );
    inconclusive(
      "joiner input is sampled + queued after rejoin (pendingInputs > 0)",
      "axis wired but the starved loop never ran a sampling tick — no evidence either way",
    );
  } else {
    check(
      "joiner cart moves off spawn after menu→rejoin",
      maxDisp > 0.5,
      `peak displacement ${maxDisp.toFixed(2)}m (need > 0.5m)`,
    );
    check(
      "joiner input is sampled + queued after rejoin (pendingInputs > 0)",
      maxPending > 0,
      `peak pendingInputs ${maxPending} (need > 0)`,
    );
  }

  if (results.slice(mark).some((r) => !r.pass)) {
    await dumpFailureBundle(joiner.page, { scenario: "teardownRejoin", label: "joiner", log: nlog });
  }
  await joiner.context.close();
  await host.context.close();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const baseUrl = str(args.url) || `http://127.0.0.1:${CLIENT_PORT}/`;

  let devProc = null;
  try {
    devProc = await maybeStartDevStack(args, nlog);
    await preflightStack(baseUrl, nlog);
  } catch (err) {
    console.error("[netharness]", err instanceof Error ? err.message : err);
    killDevStack(devProc);
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

  // * Default is spawnlock (unchanged behavior of `npm run netharness`); mpIntegration is opt-in.
  const scenario = str(args.scenario) || "spawnlock";
  const SCENARIOS = {
    spawnlock: scenarioSpawnLock,
    mpIntegration: scenarioMpIntegration,
    hostMigration: scenarioHostMigration,
    teardownRejoin: scenarioTeardownRejoin,
  };
  const run = SCENARIOS[scenario];
  if (!run) {
    console.error(`[netharness] unknown scenario "${scenario}" (have: ${Object.keys(SCENARIOS).join(", ")})`);
    process.exit(2);
  }

  let hadError = false;
  try {
    await run(browserHost, browserJoiner, baseUrl);
  } catch (err) {
    hadError = true;
    console.error("[netharness] scenario error:", err instanceof Error ? err.stack : err);
  } finally {
    await browserHost.close();
    await browserJoiner.close();
    killDevStack(devProc);
  }

  const failed = results.filter((r) => !r.pass && !r.inconclusive);
  const inconcl = results.filter((r) => r.inconclusive);
  console.log(
    `\n[netharness] ${results.length - failed.length - inconcl.length}/${results.length} checks passed` +
      (inconcl.length ? ` (${inconcl.length} INCONCLUSIVE — starved environment, no regression evidence)` : ""),
  );
  const tallyOut = str(args.tallyOut);
  if (tallyOut) writeTallySync(tallyOut, `netharness:${scenario}`, results, hadError);
  process.exit(resolveExitCode(results, hadError));
}

main().catch((e) => {
  console.error("[netharness] FATAL:", e instanceof Error ? e.stack : e);
  process.exit(2);
});
