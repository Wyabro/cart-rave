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
 *     scenarios: roundflow | unlockFunnel | arenas | soak
 *   node tools/gameharness.mjs --scenario soak --soakCycles 5   # deeper leak soak
 *   node tools/gameharness.mjs --headed                         # visible browser (debug)
 *
 * Requires Playwright Chromium. Exit 0 = all checks passed, 1 = a check failed, 2 = setup error.
 */

import {
  parseArgs,
  str,
  makeLogger,
  maybeStartDevStack,
  preflightStack,
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
  killDevStack,
} from "./lib/harness.mjs";
// * arenaCatalog.js is pure authoring data with zero imports, so a Node tool can read the
// * progression gates straight from the source of truth the game uses (HARNESS-UNLOCK-1).
import { ARENA_BY_ID } from "../src/levels/arenaCatalog.js";

const log = makeLogger("gameharness");

/** Read the round probe (compact) in-page. */
const readRound = () => /** @type {any} */ (window).__ccDiag.snapshot("round");

/** Options parsed once in main() so scenarios can read tunables (e.g. --soakCycles). */
const RUN_OPTS = { soakCycles: 3 };

/**
 * Crown the local player and fast-end the running round via the DEV control levers
 * (the roundflow pattern, shared by soak/arenas). Returns the crowned local slot,
 * or null when the levers are absent (prod build).
 * @param {import('playwright').Page} page
 * @returns {Promise<number | null>}
 */
async function crownAndFastEnd(page) {
  return page.evaluate(() => {
    const c = /** @type {any} */ (window).__ccDiag.control;
    if (!c || typeof c.rewindRoundClock !== "function") return null;
    const local = /** @type {any} */ (window).__ccDiag.snapshot("round").localSlotIndex;
    if (typeof local === "number" && local >= 0 && typeof c.setScores === "function") {
      const scores = { 0: 0, 1: 0, 2: 0, 3: 0 };
      scores[local] = 5;
      c.setScores(scores);
    }
    c.rewindRoundClock(1200);
    return local;
  });
}

/** Count events on a channel (optionally one type) since a cursor. */
async function countEvents(page, channel, type = null, sinceSeq = 0) {
  return page.evaluate(
    ({ ch, ty, since }) =>
      /** @type {any} */ (window)
        .__ccDiag.events(since)
        .filter((e) => e.ch === ch && (ty === null || e.type === ty)).length,
    { ch: channel, ty: type, since: sinceSeq },
  );
}

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

    // Solo rematch: PLAY AGAIN off the results panel must land in a fresh round with reset
    // scores (the podium→rematch seam, previously human-only). The button is the production
    // path (solo player is host, so it's enabled once the panel shows).
    const clicked = await page
      .click('button.results-btn:has-text("PLAY AGAIN")', { timeout: 15_000 })
      .then(() => true)
      .catch(() => false);
    tally.check("PLAY AGAIN button is clickable on the results panel", clicked);
    if (clicked) {
      const rematch = await waitForState(
        page,
        (s) => s?.phase === "countdown" || s?.phase === "running",
        { read: readRound, timeout: 20_000, label: "solo-rematch" },
      ).catch(() => null);
      tally.check(
        "rematch reaches a fresh round (countdown/running)",
        rematch?.phase === "countdown" || rematch?.phase === "running",
        `phase=${rematch?.phase}`,
      );
      const rematchScores = await page.evaluate(
        () => /** @type {any} */ (window).__ccDiag.snapshot("score").scores,
      );
      const allZero = rematchScores && Object.values(rematchScores).every((v) => (v ?? 0) === 0);
      tally.check("scores reset for the rematch round", allZero === true, JSON.stringify(rematchScores));
    }
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
 * The Storerooms unlock gate as the game defines it: `killsOnLevel` names the arena the KOs
 * must be scored on, `goal` is how many. Read, never restated — see the scenario below.
 */
const GATE = ARENA_BY_ID.backrooms?.unlock ?? {};

/**
 * Scenario: the KO→unlock funnel. With real locks enforced, granting enough KOs on whichever
 * arena gates The Storerooms unlocks it — the S2 progression check, automated.
 *
 * HARNESS-UNLOCK-1: the gating arena and the goal are READ FROM THE CATALOG, never named here.
 * They used to be hardcoded as `grantKos("classicRecord", 10)`, and UNLOCK-ORDER-1 (`11df427`)
 * reversed the chain — Storerooms now gates on Sundial — so this scenario went on crediting an
 * arena that gates nothing and reported the funnel broken when the game was correct. The unit
 * tests were updated with that commit and stayed green; only this browser rig, which runs in
 * `npm run battery` rather than `npm run qa`, was left behind. Deriving the gate means the next
 * reorder cannot desync it.
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
  // * If Storerooms ever becomes free (or the gate is reshaped), there is no KO funnel to
  // * exercise — skip loudly rather than granting KOs on `undefined` and reporting a failure
  // * that says nothing about the game.
  if (!GATE.killsOnLevel || !GATE.goal) {
    log("[scenario] Storerooms carries no KO gate in the catalog — skipping unlock-funnel");
    await context.close();
    return;
  }

  const before = await page.evaluate(
    () => /** @type {any} */ (window).__ccDiag.snapshot("unlocks").levels.backrooms.unlocked,
  );
  tally.check("Storerooms starts locked (real locks on)", before === false, `unlocked=${before}`);

  const cursor = await page.evaluate(() => /** @type {any} */ (window).__ccDiag.tail);
  await page.evaluate(
    ([levelId, kos]) => /** @type {any} */ (window).__ccDiag.control.grantKos(levelId, kos),
    [GATE.killsOnLevel, GATE.goal],
  );
  await sleep(200);

  const after = await page.evaluate(
    () => /** @type {any} */ (window).__ccDiag.snapshot("unlocks").levels.backrooms.unlocked,
  );
  tally.check(
    `granting ${GATE.goal} KOs on ${GATE.killsOnLevel} unlocks Storerooms`,
    after === true,
    `unlocked=${after}`,
  );

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

  // Persistence: the unlock must survive a full page reload (localStorage-backed progression —
  // the "did my progress save?" player question, previously never machine-checked).
  await page.reload({ waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForFunction(() => Boolean(/** @type {any} */ (window).__ccDiag?.active), undefined, {
    timeout: 60_000,
  });
  const persisted = await page.evaluate(
    () => /** @type {any} */ (window).__ccDiag.snapshot("unlocks").levels.backrooms.unlocked,
  );
  tally.check("unlock persists across a page reload", persisted === true, `unlocked=${persisted}`);

  if (tally.failedSince(mark)) {
    await dumpFailureBundle(page, { scenario: "unlockFunnel", label: "unlock", log });
  }
  await context.close();
}

/**
 * Scenario: per-arena stability baseline (playtest kit "Session 0", automated). Each arena
 * must cold-boot into a solo round, run cleanly, and fast-end to podium with zero page/sim
 * errors and zero invariant asserts. The selected level rides the production menu path
 * (localStorage cartRaveLevel), not a debug flag.
 */
async function scenarioArenas(browser, baseUrl, tally) {
  const levels = ["classicRecord", "backrooms", "zanzibar"];
  for (const levelId of levels) {
    log(`[scenario] arenas — ${levelId} boots, runs, and ends cleanly`);
    const mark = tally.count;
    const { context, page } = await makeClient(browser, {
      baseUrl,
      label: `arena-${levelId}`,
      username: "ArenaBot",
      params: { room: "solo", diag: "1", perfPump: "1" },
      storage: { cartRaveLevel: levelId },
    });

    const running = await waitForState(page, (s) => s?.phase === "running", {
      read: readRound,
      timeout: 90_000,
      label: `${levelId}-running`,
    }).catch(() => null);
    tally.check(`${levelId}: solo round reaches RUNNING`, running?.phase === "running");
    tally.check(
      `${levelId}: the selected arena actually loaded`,
      running?.levelId === levelId,
      `levelId=${running?.levelId}`,
    );

    // * Boot timeline is stamped (world-init-start → world-ready = the cold-load window).
    const timeline = await page.evaluate(
      () => /** @type {any} */ (window).__ccDiag.snapshot("boot").timeline ?? [],
    );
    const names = timeline.map((m) => m.name);
    const init = timeline.find((m) => m.name === "world-init-start");
    const ready = timeline.find((m) => m.name === "world-ready");
    tally.check(
      `${levelId}: boot timeline stamped (world-init-start + world-ready)`,
      Boolean(init && ready),
      init && ready ? `cold-load ${ready.tMs - init.tMs}ms — [${names.join(",")}]` : `marks=[${names.join(",")}]`,
    );

    // Drive briefly, then fast-end; the arena must reach podium without wedging.
    await holdKey(page, "KeyW");
    await sleep(1500);
    await releaseKey(page, "KeyW");
    const controlled = await crownAndFastEnd(page);
    if (controlled === null) {
      log("[scenario] control levers absent (prod build?) — skipping fast-end checks");
    } else {
      const podium = await waitForState(page, (s) => s?.phase === "podium", {
        read: readRound,
        timeout: 20_000,
        label: `${levelId}-podium`,
      }).catch(() => null);
      tally.check(`${levelId}: round ends to PODIUM`, podium?.phase === "podium");
    }

    const errors = await countEvents(page, "error");
    tally.check(`${levelId}: zero error events`, errors === 0, `errors=${errors}`);
    const asserts = await countEvents(page, "assert");
    tally.check(`${levelId}: zero invariant violations`, asserts === 0, `asserts=${asserts}`);

    if (tally.failedSince(mark)) {
      await dumpFailureBundle(page, { scenario: "arenas", label: levelId, log });
    }
    await context.close();
  }
}

/**
 * Scenario: rematch soak — the leak sentinel. Runs N solo rematch cycles (--soakCycles,
 * default 3) on one arena and asserts GPU/audio resource counts do NOT grow across cycles.
 * Every past leak in this codebase (suction rings on later arenas, boost-ring meshes,
 * countdown pulse timers, per-event VFX dispose) was found by a human noticing; this turns
 * that whole bug class into a regression gate. Also automates the structural half of the
 * playtest kit's long-session soak (Session 4).
 */
async function scenarioSoak(browser, baseUrl, tally) {
  const cycles = RUN_OPTS.soakCycles;
  log(`[scenario] soak — ${cycles} rematch cycles, resource counts must stay flat`);
  const mark = tally.count;
  const { context, page } = await makeClient(browser, {
    baseUrl,
    label: "soak",
    username: "SoakBot",
    params: { room: "solo", diag: "1", perfPump: "1" },
  });

  await waitForState(page, (s) => s?.phase === "running", {
    read: readRound,
    timeout: 90_000,
    label: "soak-running",
  });

  const hasControl = await page.evaluate(() =>
    Boolean(/** @type {any} */ (window).__ccDiag.control?.rewindRoundClock),
  );
  if (!hasControl) {
    log("[scenario] control levers absent (prod build?) — skipping soak");
    await context.close();
    return;
  }

  const readResources = () => /** @type {any} */ (window).__ccDiag.snapshot("resources");
  /** @type {any[]} */
  const samples = [];

  for (let cycle = 1; cycle <= cycles; cycle += 1) {
    // Exercise the round a little so per-round VFX/audio paths actually allocate.
    await holdKey(page, "KeyW");
    await sleep(1500);
    await releaseKey(page, "KeyW");

    await crownAndFastEnd(page);
    await waitForState(page, (s) => s?.phase === "podium", {
      read: readRound,
      timeout: 20_000,
      label: `soak-podium-${cycle}`,
    });
    // * Sample at podium (quietest, comparable point) after a short settle for round-end FX.
    await sleep(1000);
    const sample = await page.evaluate(readResources);
    samples.push(sample);
    log(`  cycle ${cycle}/${cycles}: ${JSON.stringify(sample)}`);

    if (cycle < cycles) {
      const clicked = await page
        .click('button.results-btn:has-text("PLAY AGAIN")', { timeout: 15_000 })
        .then(() => true)
        .catch(() => false);
      if (!clicked) {
        tally.check(`soak: PLAY AGAIN clickable on cycle ${cycle}`, false);
        break;
      }
      await waitForState(page, (s) => s?.phase === "running", {
        read: readRound,
        timeout: 30_000,
        label: `soak-rematch-${cycle}`,
      });
    }
  }

  // Growth gate: same arena, same flow — counts at the first and last podium must match
  // within tolerance. A real leak (k objects per round) grows linearly and blows past it.
  const first = samples[0];
  const last = samples[samples.length - 1];
  tally.check("soak: completed all rematch cycles", samples.length === cycles, `cycles=${samples.length}/${cycles}`);
  const TOLERANCE = { geometries: 8, textures: 4, programs: 4, sceneNodes: 60, howls: 4 };
  for (const [metric, tol] of Object.entries(TOLERANCE)) {
    const a = first?.[metric];
    const b = last?.[metric];
    if (typeof a !== "number" || typeof b !== "number") {
      log(`  soak: ${metric} unavailable (prod build / no __cartRavePerf) — skipped`);
      continue;
    }
    tally.check(
      `soak: ${metric} stays flat across rematches`,
      b - a <= tol,
      `${a} → ${b} (Δ${b - a}, tol ${tol})`,
    );
  }
  if (typeof first?.heapMB === "number" && typeof last?.heapMB === "number") {
    log(`  soak: heap ${first.heapMB}MB → ${last.heapMB}MB (informational — GC noise, not gated)`);
  }

  const errors = await countEvents(page, "error");
  tally.check("soak: zero error events across all cycles", errors === 0, `errors=${errors}`);
  const asserts = await countEvents(page, "assert");
  tally.check("soak: zero invariant violations", asserts === 0, `asserts=${asserts}`);

  if (tally.failedSince(mark)) {
    await dumpFailureBundle(page, { scenario: "soak", label: "soak", log });
  }
  await context.close();
}

const SCENARIOS = {
  roundflow: scenarioRoundflow,
  unlockFunnel: scenarioUnlockFunnel,
  arenas: scenarioArenas,
  soak: scenarioSoak,
};

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const baseUrl = str(args.url) || `http://127.0.0.1:${CLIENT_PORT}/`;
  const which = str(args.scenario);
  const toRun = which && SCENARIOS[which] ? [which] : Object.keys(SCENARIOS);
  const soakCycles = Number(str(args.soakCycles));
  if (Number.isFinite(soakCycles) && soakCycles >= 2) RUN_OPTS.soakCycles = Math.floor(soakCycles);

  let devProc = null;
  try {
    devProc = await maybeStartDevStack(args, log);
    await preflightStack(baseUrl, log);
  } catch (err) {
    log(err instanceof Error ? err.message : err);
    killDevStack(devProc);
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
    killDevStack(devProc);
  }

  tally.finish(str(args.tallyOut));
}

main().catch((e) => {
  console.error("[gameharness] FATAL:", e instanceof Error ? e.stack : e);
  process.exit(2);
});
