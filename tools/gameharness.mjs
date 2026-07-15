/**
 * gameharness.mjs — single-client gameplay E2E rig for Cart Clash.
 *
 * Drives one real browser client into an offline **solo** round (private room + 3 NPCs — the
 * full production round path, no WebRTC) and asserts gameplay invariants that today are only
 * ever checked by a human playing (docs/playtest/solo-checklist.md §A/§C): the round advances
 * lobby→countdown→running→podium without wedging, the PA fires the countdown/result sequence,
 * the loop stays alive, a round fast-ends to a resolved winner, and the KO→unlock funnel works.
 *
 * It reads structured state from the read-only diagnostics hub (window.__ccDiag, ?diag=1) — no
 * DOM scraping — and uses the DEV-only __ccDiag.control levers to fast-end a round and grant
 * KOs deterministically instead of waiting out a 150 s match.
 *
 * Usage:
 *   node tools/gameharness.mjs                                  # auto-starts dev:local, headless
 *   node tools/gameharness.mjs --url http://127.0.0.1:3000/     # attach to a running dev stack
 *   node tools/gameharness.mjs --scenario roundflow             # one scenario (default: all)
 *   node tools/gameharness.mjs --headed                         # visible browser (debug)
 *
 * Requires Playwright Chromium. Exit 0 = all checks passed, 1 = a check failed, 2 = setup error.
 */

import {
  parseArgs,
  str,
  makeLogger,
  maybeStartDevStack,
  ensurePlaywright,
  launchClientBrowser,
  makeClient,
  waitForState,
  holdKey,
  releaseKey,
  sleep,
  CheckTally,
  dumpFailureBundle,
  CLIENT_PORT,
} from "./lib/harness.mjs";

const log = makeLogger("gameharness");

/** Read the round probe (compact) in-page. */
const readRound = () => /** @type {any} */ (window).__ccDiag.snapshot("round");

/**
 * Scenario: a full solo round walks the phase machine and fires the PA sequence, the loop
 * stays live, and it fast-ends to a resolved winner with no sim errors.
 */
async function scenarioRoundflow(browser, baseUrl, tally) {
  log("[scenario] roundflow — solo round advances countdown→running→podium");
  const mark = tally.count;
  const { context, page } = await makeClient(browser, {
    baseUrl,
    label: "solo",
    username: "SoloBot",
    params: { room: "solo", diag: "1", perfPump: "1" },
  });

  // Reach a running round (3 s countdown then RUNNING).
  const running = await waitForState(page, (s) => s?.phase === "running", {
    read: readRound,
    timeout: 45_000,
    label: "solo-running",
  });
  tally.check("solo round reaches RUNNING", running?.phase === "running", `mode=${running?.mode}`);

  // The PA should have fired the countdown sequence by now.
  const annEvents = await page.evaluate(() =>
    /** @type {any} */ (window).__ccDiag.events().filter((e) => e.ch === "announcer").map((e) => e.type),
  );
  tally.check("PA fired GO at round start", annEvents.includes("go"), `announcer=[${annEvents.join(",")}]`);

  // Loop liveness: drive forward briefly and confirm the rAF loop advanced frames.
  const loop0 = await page.evaluate(() => /** @type {any} */ (window).__ccLoopDbg?.frames ?? 0);
  await holdKey(page, "KeyW");
  await sleep(1500);
  await releaseKey(page, "KeyW");
  const loop1 = await page.evaluate(() => /** @type {any} */ (window).__ccLoopDbg?.frames ?? 0);
  tally.check("game loop is alive (frames advancing)", loop1 - loop0 >= 5, `+${loop1 - loop0} frames`);

  // Crown the local player deterministically, then fast-end the round via the DEV control
  // levers. This exercises the full score→timer-end→podium→PA-callout chain (an un-scored
  // round is a legitimate draw, which fires no victory/defeat — so we score first).
  const controlled = await page.evaluate(() => {
    const c = /** @type {any} */ (window).__ccDiag.control;
    if (!c || typeof c.rewindRoundClock !== "function") return null;
    const local = /** @type {any} */ (window).__ccDiag.snapshot("round").localSlotIndex;
    if (typeof local === "number" && local >= 0 && typeof c.setScores === "function") {
      const scores = { 0: 0, 1: 0, 2: 0, 3: 0 };
      scores[local] = 5; // local player wins outright
      c.setScores(scores);
    }
    c.rewindRoundClock(1200);
    return local;
  });
  if (controlled === null) {
    log("[scenario] control levers absent (prod build?) — skipping fast-end + podium checks");
  } else {
    const podium = await waitForState(page, (s) => s?.phase === "podium", {
      read: readRound,
      timeout: 20_000,
      label: "solo-podium",
    });
    tally.check("round ends to PODIUM", podium?.phase === "podium");
    tally.check(
      "podium crowns the crowned winner",
      podium?.winnerSlotIndex === controlled,
      `winnerSlot=${podium?.winnerSlotIndex} expected=${controlled} reason=${podium?.endReason}`,
    );
    const results = await page.evaluate(() =>
      /** @type {any} */ (window).__ccDiag.events().filter((e) => e.ch === "announcer").map((e) => e.type),
    );
    tally.check(
      "PA fires the victory callout for the local winner",
      results.includes("victory"),
      `announcer=[${results.slice(-6).join(",")}]`,
    );
  }

  // No unrecoverable/step sim errors over the whole scenario (the circuit breaker's log).
  const errors = await page.evaluate(() =>
    /** @type {any} */ (window).__ccDiag.events().filter((e) => e.ch === "error"),
  );
  tally.check("no sim errors during the round", errors.length === 0, `errors=${errors.length}`);

  // Phase transitions were actually logged (the event log is wired, not just probes).
  const phases = await page.evaluate(() =>
    /** @type {any} */ (window)
      .__ccDiag.events()
      .filter((e) => e.ch === "round" && e.type === "phase")
      .map((e) => `${e.from}->${e.to}`),
  );
  tally.check("phase transitions logged to event buffer", phases.length >= 1, phases.join(" "));

  // AI stall watchdog is passive evidence, not a pass/fail gate here: report any NPC stalls the
  // watchdog flagged during the round so a real wedge shows up in the log (and the capture).
  const stalls = await page.evaluate(() =>
    /** @type {any} */ (window)
      .__ccDiag.events()
      .filter((e) => e.ch === "ai" && e.type === "stall_detected")
      .map((e) => `slot${e.slot}:${e.personality}:${e.durationMs}ms@${e.state}`),
  );
  if (stalls.length) log(`[scenario] AI stall watchdog flagged ${stalls.length}: ${stalls.join(", ")}`);

  if (tally.failedSince(mark)) {
    await dumpFailureBundle(page, { scenario: "roundflow", label: "solo", log });
  }
  await context.close();
}

/**
 * Scenario: the KO→unlock funnel. With real locks enforced, granting enough KOs on Cart Rave
 * (classicRecord) unlocks The Storerooms — the S2 progression check, automated.
 */
async function scenarioUnlockFunnel(browser, baseUrl, tally) {
  log("[scenario] unlockFunnel — KO credit crosses a real unlock gate");
  const mark = tally.count;
  const { context, page } = await makeClient(browser, {
    baseUrl,
    label: "unlock",
    username: "UnlockBot",
    params: { room: "solo", diag: "1", perfPump: "1" },
    storage: { cartRaveDevUnlocks: "off" }, // enforce real locks (FTUE funnel)
  });
  await waitForState(page, (s) => s?.phase === "running" || s?.phase === "countdown", {
    read: readRound,
    timeout: 45_000,
    label: "unlock-entered",
  });

  const hasControl = await page.evaluate(() =>
    Boolean(/** @type {any} */ (window).__ccDiag.control?.grantKos),
  );
  if (!hasControl) {
    log("[scenario] control levers absent (prod build?) — skipping unlock-funnel");
    await context.close();
    return;
  }

  const before = await page.evaluate(
    () => /** @type {any} */ (window).__ccDiag.snapshot("unlocks").levels.backrooms.unlocked,
  );
  tally.check("Storerooms starts locked (real locks on)", before === false, `unlocked=${before}`);

  const cursor = await page.evaluate(() => /** @type {any} */ (window).__ccDiag.tail);
  await page.evaluate(() => /** @type {any} */ (window).__ccDiag.control.grantKos("classicRecord", 10));
  await sleep(200);

  const after = await page.evaluate(
    () => /** @type {any} */ (window).__ccDiag.snapshot("unlocks").levels.backrooms.unlocked,
  );
  tally.check("granting 10 KOs unlocks Storerooms", after === true, `unlocked=${after}`);

  const unlockEvents = await page.evaluate(
    (c) =>
      /** @type {any} */ (window)
        .__ccDiag.events(c)
        .filter((e) => e.ch === "unlock")
        .map((e) => e.levelId),
    cursor,
  );
  tally.check(
    "unlock event logged for Storerooms",
    unlockEvents.includes("backrooms"),
    `unlocks=[${unlockEvents.join(",")}]`,
  );

  if (tally.failedSince(mark)) {
    await dumpFailureBundle(page, { scenario: "unlockFunnel", label: "unlock", log });
  }
  await context.close();
}

const SCENARIOS = {
  roundflow: scenarioRoundflow,
  unlockFunnel: scenarioUnlockFunnel,
};

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const baseUrl = str(args.url) || `http://127.0.0.1:${CLIENT_PORT}/`;
  const which = str(args.scenario);
  const toRun = which && SCENARIOS[which] ? [which] : Object.keys(SCENARIOS);

  let devProc = null;
  try {
    devProc = await maybeStartDevStack(args, log);
  } catch (err) {
    log(err instanceof Error ? err.message : err);
    process.exit(2);
  }

  const { chromium } = await ensurePlaywright(log);
  const browser = await launchClientBrowser(chromium, { headed: args.headed === true });
  const tally = new CheckTally("gameharness");

  try {
    for (const name of toRun) {
      // eslint-disable-next-line no-await-in-loop
      await SCENARIOS[name](browser, baseUrl, tally);
    }
  } catch (err) {
    tally.markError();
    console.error("[gameharness] scenario error:", err instanceof Error ? err.stack : err);
  } finally {
    await browser.close();
    if (devProc && !devProc.killed) devProc.kill();
  }

  tally.finish();
}

main().catch((e) => {
  console.error("[gameharness] FATAL:", e instanceof Error ? e.stack : e);
  process.exit(2);
});
