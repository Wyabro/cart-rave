#!/usr/bin/env node
/**
 * podium.mjs — `npm run podium`, the end-of-round results/podium contact sheet
 * (FIGHT-VERIFY-1 Phase A).
 *
 * `results.css` is ~684 lines of CSS that has never been rendered by anything in this
 * toolkit. `npm run sheet` structurally cannot reach it: the HUD sheet pins
 * `rewindRoundClock(90_000)` *specifically to keep the round running* and away from podium.
 * This tool does the opposite — it pins a decided scoreline 800 ms from expiry, lets the
 * real timer-expiry path end the round, skips the winner camera, waits out the entrance
 * animation on the DOM, and captures the results overlay at N viewports × both outcomes.
 *
 * Usage:
 *   npm run podium                                   # 4 viewports × victory/defeat = 8 cells
 *   npm run podium -- --all                          # the sheet's 16 viewports × 2 = 32
 *   npm run podium -- --viewports 1025x600 --touch
 *   npm run podium -- --outcomes victory
 *   npm run podium -- --reduced-motion               # + 2 RM victory cells
 *   npm run podium -- --url http://127.0.0.1:3000/   # attach to a running dev stack
 *
 * WHY A SIBLING TOOL AND NOT `sheet --podium`: four of `captureCell`'s eight checks invert
 * the moment the round ends. `snapshot("round").remainingMs` is `null` outside RUNNING
 * (gameplayDiagnostics.js:88-92), `HUD.clearFeed()` runs in `endRound` (main.js:4736), and
 * `#hud` gets `.hud-suppressed`, which `hud.js:1975` sets for `roundPhase === "podium"` — so
 * the sheet's touch-branch and timer-text gates are meaningless here. Branching a one-day-old
 * green file four ways is worse than a sibling that shares plumbing through tools/lib/.
 *
 * This header used to claim `#hud`'s children were already `display:none !important` under
 * that class. They were not — the rule was an 8-name allow-list that never named `.hud-boost`,
 * so the BOOST meter sat over the results screen in every capture this tool took and the doc
 * said it could not. Fixed 08-01 (HUD-BOOST-PODIUM-1: `#hud.hud-suppressed > *`), and the
 * `no gameplay HUD over the podium` check below now proves it per cell instead of asserting it
 * in a comment.
 *
 * EXIT CONTRACT (CheckTally, harness.mjs:445-450): 0 when every cell pinned, landed on
 * podium with the intended winner, showed the real results podium, fitted the panel, and
 * wrote both PNGs. `finish()` exits 1 on ANY `pass:false` and can never exit 3, so the one
 * surface this tool provably cannot reach — the NON-HOST podium, which needs a second
 * client — is declared in the montage banner and NOT emitted as a check row. A tool that
 * always exits non-zero is a tool everyone learns to ignore.
 *
 * NO IMAGE GATING, EVER (D-SHEET-1): opponent names are randomised per run and this repo
 * has no gameplay RNG seed. The DOM/computed-style assertions are the gate; the PNGs are
 * for eyeballing.
 */

import { mkdir, writeFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import {
  CAPTURE_DIR,
  CLIENT_PORT,
  CheckTally,
  cellId,
  dedupeCells,
  ensurePlaywright,
  holdKey,
  killDevStack,
  launchClientBrowser,
  makeClient,
  makeLogger,
  maybeStartDevStack,
  normalizeArgv,
  parseArgs,
  parseViewports,
  preflightStack,
  releaseKey,
  sleep,
  str,
  waitForState,
} from "./lib/harness.mjs";
import { esc, montagePage } from "./lib/montage.mjs";

const log = makeLogger("podium");

/**
 * Default matrix — the four bands where `results.css` is genuinely unverified, not a
 * viewport parade. `main.js:3424`'s [250,170,120,80] block heights never render raw
 * (`results.css:255` caps them at `min(var(--podium-h), 34vh)`), so height bands matter
 * more than width here:
 *   1920×1080 — the composed two-column desktop layout, the design's home ground.
 *   390×844   — `results.css:538`'s `(pointer: coarse), (max-width: 768px)` full-bleed
 *               branch; the podium columns drop to `flex: 1 1 0` (`:600-603`).
 *   900×390   — landscape phone; ALSO lands in the stacking branch below.
 *   1025×600  — `results.css:81`'s `(max-height:640px) and (min-width:769px) and
 *               (pointer:fine)` stacking branch. Nothing in this toolkit has ever
 *               rendered it, and it is the only band that turns the panel into a scroller.
 */
const DEFAULT_VIEWPORTS = [
  { w: 1920, h: 1080 },
  { w: 390, h: 844 },
  { w: 900, h: 390 },
  { w: 1025, h: 600 },
];

/** `--all`: the HUD sheet's full union, so both sheets sweep the same frames. */
const ALL_VIEWPORTS = [
  { w: 3440, h: 1440 },
  { w: 1920, h: 1080 },
  { w: 1512, h: 982 },
  { w: 1366, h: 768 },
  { w: 768, h: 1024 },
  { w: 390, h: 844 },
  { w: 1025, h: 600 },
  { w: 1024, h: 768 },
  { w: 380, h: 800 },
  { w: 900, h: 390 },
  { w: 812, h: 375 },
  { w: 667, h: 375 },
  { w: 1200, h: 528, touch: true },
  { w: 900, h: 390, touch: true },
  { w: 812, h: 375, touch: true },
  { w: 390, h: 844, touch: true },
];

/**
 * `--reduced-motion` cells. Deliberately only two, and victory only: the point is NOT the
 * confetti (which `spawnResultsConfetti` suppresses outright under RM) but that
 * `animateResultsPodiumShow` takes a completely different early-return branch
 * (`resultsOverlay.js:453-460`) that nobody has ever looked at.
 */
const RM_VIEWPORTS = [
  { w: 1920, h: 1080 },
  { w: 390, h: 844 },
];

const OUTCOMES = ["victory", "defeat"];

/**
 * The score pin. **20 vs 1 — do not tighten this later.**
 *
 * Two hard constraints on any pin here:
 *   - NO TIE AT THE TOP. A tie at expiry with a human tied enters Sudden Death
 *     (`gameFlow.js:526-546`) and the phase stays `running` — the cell would hang.
 *   - TOP SCORE > 0. `pickTimerWinner` returns `"draw"` at `topScore === 0`
 *     (`stores/gameStore.js` `pickTimerWinner`), which yields neither `results-victory` nor `results-defeat`.
 *
 * The gap has to survive whatever the NPCs do in the 800 ms before expiry. At
 * `rewindRoundClock(800)` the round is deep inside `CONFIG.directives.quietFinaleMs`
 * (30 000 ms, `src/config.js`: "no directive may run inside this tail of the round
 * clock"), so the directive multiplier is OFF and the endgame ceiling for one KO is
 * `(2+1+1+1) × combo(≤3)` = **15 points** — not the ~12 an earlier draft assumed and not
 * the 30 a directive-on window would allow. 19 clears that with room. There is no
 * NPC-freeze lever in `devControl.js`, so the gap is the only mitigation available;
 * `winnerSlotIndex === expectedWinner` then catches a flip anyway, so a bad run fails
 * loudly instead of mislabelling a defeat panel "victory".
 */
const PIN_TOP = 20;
const PIN_RUNNER_UP = 1;

/** Remaining ms to rewind to. Short enough to end fast, long enough to survive a slow frame. */
const PIN_REMAIN_MS = 800;

/**
 * How long to wait after the podium phase flip before dispatching the winner-cam skip.
 * `PODIUM_SKIP_GRACE_MS = 450` (`main.js:595-599`) treats anything earlier as round-end
 * input spillover: the skip is **silently discarded and nothing re-arms it**, so an eager
 * tool would sit through the full 3000 ms cam believing its skip worked.
 *
 * 600 rather than a longer guess, because the poll below RE-DISPATCHES until the overlay
 * appears. The app measures its grace from `podiumPhaseEnteredAtMs`, which is set in the
 * render pass and so can trail the store flip this tool anchors on by a whole frame — and
 * at SwiftShader frame times that gap is hundreds of milliseconds, not a rounding error.
 * A fixed sleep can only ever be a bet on frame duration; repeating an idempotent lever
 * cannot lose.
 */
const SKIP_GRACE_SLEEP_MS = 600;

/** `CameraMod.PODIUM_WINNER_CAM_MS` is 3000 (`camera.js:371`); an honored skip lands well under this. */
const SKIP_HONORED_CEIL_MS = 1500;

/** Page-side probe read (Node-side fn, no string eval — the waitForState convention). */
const readRound = () => /** @type {any} */ (window).__ccDiag.snapshot("round");

/**
 * The whole subject gate in one page read: structure AND identity.
 *
 * The failure mode this exists for is "an overlay is up and looks plausible but is the
 * wrong outcome" — an NPC scoring inside the 800 ms window silently produces a cell
 * LABELLED victory SHOWING a defeat panel. So this reads the outcome class, the winner
 * badge, the `is-you` column and the verdict text, not merely "something is displayed".
 *
 * Visibility is computed-style, NOT `offsetParent !== null`: `#esc-overlay` is
 * `position: fixed` (`pauseOverlay.css:12`) and per CSSOM-View `offsetParent` is null for
 * every fixed element, so an offsetParent probe can never see it. `escOffsetParentNull` is
 * reported alongside purely as evidence.
 */
const readSubject = () => {
  const all = (s) => [...document.querySelectorAll(s)];
  const rect = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return {
      top: Math.round(r.top * 10) / 10,
      left: Math.round(r.left * 10) / 10,
      right: Math.round(r.right * 10) / 10,
      bottom: Math.round(r.bottom * 10) / 10,
      width: Math.round(r.width * 10) / 10,
      height: Math.round(r.height * 10) / 10,
    };
  };
  const shownEl = (el) => {
    if (!el || !el.isConnected) return false;
    const cs = getComputedStyle(el);
    return cs.display !== "none" && cs.visibility !== "hidden" && Number(cs.opacity) > 0.01;
  };

  const escEl = document.getElementById("esc-overlay");
  const softGl = document.getElementById("cr-softgl-notice");
  const overlay = document.getElementById("results-overlay");

  // * HUD-BOOST-PODIUM-1: the results overlay is not the only thing on screen. #hud sits at
  // * z-index 20000 under the overlay's 25000 + 78%-opaque scrim, so leaked gameplay chrome
  // * reads through it AND still occupies its screen rect — the BOOST meter used to land on
  // * top of MAIN MENU at 390x844. Probe DIRECT CHILDREN only: getComputedStyle on a
  // * descendant still returns that descendant's own `display` inside a hidden parent, so a
  // * deep walk would lean entirely on height>0 and name irrelevant inner nodes. `#hud > *`
  // * is exactly the set `#hud.hud-suppressed > *` hides, so probe and rule stay coupled.
  const hud = document.getElementById("hud");
  const hudLeaks = hud
    ? [...hud.children]
        .filter((el) => {
          const cs = getComputedStyle(el);
          return cs.display !== "none" && el.getBoundingClientRect().height > 0;
        })
        .map((el) => el.className || el.tagName.toLowerCase())
    : [];

  const base = {
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    escVisible: shownEl(escEl),
    escOffsetParentNull: escEl ? escEl.offsetParent === null : null,
    softGlVisible: shownEl(softGl),
    hudPresent: Boolean(hud),
    hudSuppressed: hud ? hud.classList.contains("hud-suppressed") : false,
    hudLeaks,
  };
  if (!overlay) return { ...base, present: false, shown: false };

  const ocs = getComputedStyle(overlay);
  const panel = overlay.querySelector(".results-panel");
  const final = overlay.querySelector(".results-final");
  const actions = overlay.querySelector(".results-actions");
  const playAgain = overlay.querySelector(".results-actions .cc-btn--primary");
  const receiptLines = all("#results-overlay .results-receipt-line");
  const blocks = all("#results-overlay .results-podium-block");

  return {
    ...base,
    present: true,
    shown: ocs.display !== "none",
    display: ocs.display,
    // — entrance gates (opacity only; see the RM note at the call site) —
    overlayOpacity: ocs.opacity,
    panelOpacity: panel ? getComputedStyle(panel).opacity : null,
    playAgainOpacity: playAgain ? getComputedStyle(playAgain).opacity : null,
    lastReceiptOpacity: receiptLines.length
      ? getComputedStyle(receiptLines[receiptLines.length - 1]).opacity
      : null,
    // — identity —
    victoryClass: overlay.classList.contains("results-victory"),
    defeatClass: overlay.classList.contains("results-defeat"),
    cols: all("#results-overlay .results-podium-col").length,
    winnerCols: all("#results-overlay .results-podium-col.is-winner").length,
    youCols: all("#results-overlay .results-podium-col.is-you").length,
    winnerBadgeSvg: all("#results-overlay .results-winner-badge svg").length,
    // * First TEXT node only — the name element also carries the cyan YOU pill and the
    // * NEW PB! badge as children, so textContent reads "PodiumBotYOUNEW PB!".
    winnerName: (() => {
      const el = document.querySelector(
        "#results-overlay .results-podium-col.is-winner .results-podium-name",
      );
      if (!el) return "";
      const t = [...el.childNodes].find((n) => n.nodeType === 3);
      return (t?.textContent ?? el.textContent ?? "").trim();
    })(),
    verdict: overlay.querySelector(".results-verdict")?.textContent?.trim() ?? "",
    title: overlay.querySelector(".results-title")?.textContent?.trim() ?? "",
    receiptLines: receiptLines.length,
    confetti: Boolean(overlay.querySelector("canvas.results-confetti")),
    wilt: Boolean(overlay.querySelector("canvas.results-defeat-wilt")),
    playAgainDisabled: playAgain instanceof HTMLButtonElement ? playAgain.disabled : null,
    playAgainText: playAgain?.textContent?.trim() ?? "",
    // — geometry —
    panelRect: rect(panel),
    blockRects: blocks.map(rect),
    actionsRect: rect(actions),
    finalScrollWidth: final ? final.scrollWidth : 0,
    finalClientWidth: final ? final.clientWidth : 0,
    // Context for reading a geometry failure: the `results.css:81` band turns the panel
    // into a scroller, so "below the panel" there means "below the fold", not "clipped".
    panelScrollHeight: panel ? panel.scrollHeight : 0,
    panelClientHeight: panel ? panel.clientHeight : 0,
    panelOverflowY: panel ? getComputedStyle(panel).overflowY : null,
  };
};

/** True once the entrance timeline has finished writing its opacities. */
const entranceSettled = (s) =>
  s.overlayOpacity === "1"
  && s.panelOpacity === "1"
  && s.playAgainOpacity === "1"
  && (s.lastReceiptOpacity === null || s.lastReceiptOpacity === "1");

/**
 * Boot one cell, pin a decided scoreline, end the round, and capture the podium.
 *
 * @returns {Promise<Record<string, unknown>>} One montage card record.
 */
async function captureCell(browser, baseUrl, { arena, cell, outDir, settleFrames, tally }) {
  const id = cellId(arena, cell);
  const label = `podium:${id}`;
  const fullPng = resolve(outDir, `${id}.png`);
  const chromePng = resolve(outDir, `${id}-chrome.png`);
  log(`[cell] ${id}`);

  const { context, page } = await makeClient(browser, {
    baseUrl,
    label,
    username: "PodiumBot",
    // * Exactly the sheet's flags. harness=1 is REQUIRED — installVisualHarness only runs
    // * behind a debug flag (main.js:5450) and without it __cartRave.settle is undefined.
    params: { room: "solo", diag: "1", perfPump: "1", harness: "1" },
    storage: { cartRaveLevel: arena },
    viewport: { width: cell.w, height: cell.h },
    ...(cell.rm ? { reducedMotion: "reduce" } : {}),
    // * Both flags, not just hasTouch — results.css:538 keys on `(pointer: coarse)`, and
    // * only mobile emulation makes the pointer coarse (device.js:22).
    ...(cell.touch ? { hasTouch: true, isMobile: true } : {}),
  });

  /** @type {Record<string, unknown>} */
  const card = {
    id, arena, outcome: cell.outcome, w: cell.w, h: cell.h,
    rm: Boolean(cell.rm), touch: Boolean(cell.touch),
    full: `${id}.png`, chrome: `${id}-chrome.png`,
  };

  try {
    await waitForState(page, (s) => s?.phase === "running", {
      read: readRound,
      timeout: 90_000,
      label,
    });

    // * The software-rendering advisory fires on EVERY headless cell (SwiftShader) and is a
    // * fixed full-screen backdrop dead centre. Removing the node is exactly what its own
    // * PLAY ANYWAY handler does. Same as sheet.mjs:220-225.
    card.softGlNoticeDismissed = await page.evaluate(() => {
      const el = document.getElementById("cr-softgl-notice");
      if (!el) return false;
      el.remove();
      return true;
    });

    const running = await page.evaluate(readRound);
    const localSlot = Number(running?.localSlotIndex);
    if (!Number.isInteger(localSlot) || localSlot < 0 || localSlot > 3) {
      throw new Error(`local player is unseated (localSlotIndex=${running?.localSlotIndex}) — cannot aim an outcome`);
    }
    const rivals = [0, 1, 2, 3].filter((s) => s !== localSlot);
    // * Which slot gets the 20 IS the outcome. No second client, no src/ change.
    const expectedWinner = cell.outcome === "victory" ? localSlot : rivals[0];
    const runnerUp = cell.outcome === "victory" ? rivals[0] : localSlot;
    /** @type {Record<number, number>} */
    const scores = { 0: 0, 1: 0, 2: 0, 3: 0 };
    scores[expectedWinner] = PIN_TOP;
    scores[runnerUp] = PIN_RUNNER_UP;
    card.localSlot = localSlot;
    card.expectedWinner = expectedWinner;

    // * Both levers are host-gated AND running-gated (devControl.js:36-44) and return
    // * { ok, message, reason } — a refusal is a SILENT NO-OP, so assert ok on both. Solo
    // * satisfies the host gate; the wait above satisfies the phase gate.
    const pin = await page.evaluate(
      ({ s, remainMs }) => {
        const c = /** @type {any} */ (window).__ccDiag?.control;
        if (!c) return { ok: false, reason: "no-control", message: "__ccDiag.control is absent" };
        const a = c.setScores?.(s);
        if (!a?.ok) return { ok: false, reason: a?.reason ?? "no-setScores", message: a?.message ?? "setScores unavailable" };
        const b = c.rewindRoundClock?.(remainMs);
        if (!b?.ok) return { ok: false, reason: b?.reason ?? "no-rewind", message: b?.message ?? "rewindRoundClock unavailable" };
        return { ok: true, reason: null, message: `${a.message} ${b.message}` };
      },
      { s: scores, remainMs: PIN_REMAIN_MS },
    );
    tally.check(
      `${id} · pin applied`,
      pin.ok === true,
      pin.ok ? `${pin.message} (winner slot ${expectedWinner})` : `reason=${pin.reason} — ${pin.message}`,
    );

    // * THROW on Sudden Death INSIDE the predicate. On a tie-with-a-human the phase stays
    // * `running` with isSuddenDeath:true, so a plain `phase === "podium"` poll would burn
    // * the whole 15 s before noticing. waitForState runs predFn in Node (harness.mjs:333)
    // * and does not swallow, so this propagates immediately.
    const podiumState = await waitForState(
      page,
      (s) => {
        if (s?.isSuddenDeath) throw new Error("entered Sudden Death — the score pin tied the top");
        return s?.phase === "podium";
      },
      { read: readRound, timeout: 15_000, label },
    );
    const podiumAtMs = Date.now();
    card.endReason = podiumState.endReason ?? null;
    card.winnerSlotIndex = podiumState.winnerSlotIndex;

    tally.check(
      `${id} · round reached podium`,
      podiumState.phase === "podium" && podiumState.isSuddenDeath !== true,
      `phase=${podiumState.phase} suddenDeath=${podiumState.isSuddenDeath} endReason=${podiumState.endReason}`,
    );

    const finalScores = await page.evaluate(
      () => /** @type {any} */ (window).__ccDiag.snapshot("score")?.scores ?? null,
    );
    card.finalScores = finalScores;
    tally.check(
      `${id} · winner is the intended slot`,
      podiumState.winnerSlotIndex === expectedWinner,
      `winnerSlotIndex=${podiumState.winnerSlotIndex} expected=${expectedWinner} local=${localSlot} `
        + `pinned=${JSON.stringify(scores)} final=${JSON.stringify(finalScores)}`,
    );

    // * Skip the winner cam — but only AFTER the 450 ms grace, or the skip is discarded and
    // * nothing re-arms. holdKey dispatches on `window`, where main.js:617's capture-phase
    // * listener lives. Space, not Escape — main.js:609 exempts Escape to keep its
    // * exit-to-menu semantics.
    const pressSkip = async () => {
      await holdKey(page, "Space");
      await releaseKey(page, "Space");
    };
    await sleep(SKIP_GRACE_SLEEP_MS);
    await pressSkip();
    let skipDispatches = 1;

    // * The particle field is transient (confetti 4000 ms, wilt 3600 ms, both self-removing),
    // * so latch it across every poll rather than reading once at the end.
    let sawConfetti = false;
    let sawWilt = false;
    let subject = null;
    /** @type {number | null} */
    let overlayVisibleMs = null;
    const shownDeadline = Date.now() + 5000;
    for (;;) {
      // eslint-disable-next-line no-await-in-loop
      subject = await page.evaluate(readSubject);
      sawConfetti = sawConfetti || subject.confetti === true;
      sawWilt = sawWilt || subject.wilt === true;
      if (subject.shown) {
        overlayVisibleMs = Date.now() - podiumAtMs;
        break;
      }
      if (Date.now() > shownDeadline) break;
      // * Re-press. `requestPodiumWinnerCamSkip` is idempotent — once honored it removes its
      // * own listeners (main.js:601) — so repeating costs nothing, while a single press
      // * that happened to land inside the app's 450 ms grace is gone with nothing to
      // * re-arm it. This is the difference between "the tool waits 100 ms longer" and
      // * "the tool sits through the entire 3 s cam and reports the skip as broken".
      // eslint-disable-next-line no-await-in-loop
      await pressSkip();
      skipDispatches += 1;
      // eslint-disable-next-line no-await-in-loop
      await sleep(100);
    }
    card.overlayVisibleMs = overlayVisibleMs;
    card.skipDispatches = skipDispatches;
    tally.check(
      `${id} · winner-cam skip honored`,
      overlayVisibleMs != null && overlayVisibleMs < SKIP_HONORED_CEIL_MS,
      `overlay visible ${overlayVisibleMs == null ? "never (>5000ms)" : `${overlayVisibleMs}ms`} `
        + `after the phase flip (cam is 3000ms; first Space at ${SKIP_GRACE_SLEEP_MS}ms, ${skipDispatches} dispatch(es))`,
    );

    // * Gate the entrance on OPACITY, not a frame count. animateResultsPodiumShow
    // * (resultsOverlay.js:435-580) zeroes panel/rows/receipt/buttons then runs
    // * ≈220 + rows*90 + 80 + 300 ms; a fixed settle(12) tears the panel mid-fade.
    // * Under reduced motion the timeline EARLY-RETURNS (:453-460) and never zeroes
    // * playAgain, so a first read of opacity 1 is CORRECT, not a missed wait — which is
    // * exactly why this gates on opacity values alone and never on timeline progress.
    const entranceDeadline = Date.now() + 3000;
    for (;;) {
      // eslint-disable-next-line no-await-in-loop
      subject = await page.evaluate(readSubject);
      sawConfetti = sawConfetti || subject.confetti === true;
      sawWilt = sawWilt || subject.wilt === true;
      if (entranceSettled(subject) || Date.now() > entranceDeadline) break;
      // eslint-disable-next-line no-await-in-loop
      await sleep(100);
    }
    card.entranceMs = Date.now() - podiumAtMs;

    await page.evaluate(async (n) => {
      await /** @type {any} */ (window).__cartRave?.settle?.(n);
    }, settleFrames);

    subject = await page.evaluate(readSubject);
    sawConfetti = sawConfetti || subject.confetti === true;
    sawWilt = sawWilt || subject.wilt === true;
    card.cols = subject.cols;
    card.verdict = subject.verdict;
    card.winnerName = subject.winnerName;
    card.receiptLines = subject.receiptLines;
    card.playAgainText = subject.playAgainText;
    card.escOffsetParentNull = subject.escOffsetParentNull;
    // * Printed, not checked: evidence for the `offsetParent` note on readSubject. If this
    // * reads true while the pause overlay is HIDDEN, it is true while it is shown too —
    // * `position: fixed` makes offsetParent null unconditionally, so any rig probing
    // * `offsetParent !== null` for this element is testing nothing.
    log(`[cell] ${id} — #esc-overlay offsetParent===null → ${subject.escOffsetParentNull}`);
    card.particle = sawConfetti ? "confetti" : sawWilt ? "wilt" : "none";

    tally.check(
      `${id} · subject is the results podium`,
      subject.shown === true
        && subject.display === "flex"
        && subject.cols === 4
        && subject.winnerCols === 1
        && subject.youCols === 1
        && subject.winnerBadgeSvg >= 1
        && subject.verdict !== ""
        && subject.escVisible === false
        && subject.softGlVisible === false,
      `display=${subject.display} cols=${subject.cols} winner=${subject.winnerCols} you=${subject.youCols} `
        + `badgeSvg=${subject.winnerBadgeSvg} verdict="${subject.verdict}" receipt=${subject.receiptLines} `
        + `esc=${subject.escVisible} softGl=${subject.softGlVisible}`,
    );

    // * Order matters: assert the HUD is PRESENT and SUPPRESSED before asserting nothing
    // * leaked. A missing #hud, or one that never got .hud-suppressed, would otherwise pass
    // * this vacuously with zero leaks — the D-SHEET-1 rule, applied to an absence.
    card.hudLeaks = subject.hudLeaks;
    tally.check(
      `${id} · no gameplay HUD over the podium`,
      subject.hudPresent === true
        && subject.hudSuppressed === true
        && subject.hudLeaks.length === 0,
      subject.hudPresent
        ? `#hud suppressed=${subject.hudSuppressed} leaked children=${subject.hudLeaks.length}`
          + (subject.hudLeaks.length ? ` → ${subject.hudLeaks.join(" · ")}` : "")
        : "#hud is absent — the probe cannot prove anything",
    );

    const wantVictory = cell.outcome === "victory";
    tally.check(
      `${id} · outcome class as declared`,
      subject.victoryClass === wantVictory && subject.defeatClass === !wantVictory,
      `results-victory=${subject.victoryClass} results-defeat=${subject.defeatClass} expected=${cell.outcome} `
        + `winnerName="${subject.winnerName}"`,
    );

    // * Under reduced motion BOTH particle fields return before spawning anything
    // * (resultsOverlay.js:176-177 / :310-311), so absence is the correct result — assert
    // * the design, not the pixels.
    const particleOk = cell.rm
      ? sawConfetti === false && sawWilt === false
      : wantVictory
        ? sawConfetti === true
        : sawWilt === true;
    tally.check(
      `${id} · particle field as declared`,
      particleOk,
      cell.rm
        ? `confetti=${sawConfetti} wilt=${sawWilt} (rm — suppressed by design)`
        : `confetti=${sawConfetti} wilt=${sawWilt} expected=${wantVictory ? "confetti" : "wilt"}`,
    );

    // * Does the podium physically fit? Every block bottom inside the panel, and the four
    // * columns' hard minimum (4×88 + 3×8 = 376px at the narrow end of `width: clamp(88px,
    // * 11vw, 200px)`) inside the column that holds them.
    const panelBottom = subject.panelRect?.bottom ?? 0;
    const overflowing = (subject.blockRects || []).filter((r) => r && r.bottom > panelBottom + 1);
    const finalOverflows = subject.finalScrollWidth > subject.finalClientWidth + 1;
    tally.check(
      `${id} · podium fits the panel`,
      overflowing.length === 0 && !finalOverflows,
      `blocks below the panel: ${overflowing.length}/${(subject.blockRects || []).length} `
        + `(panel bottom ${panelBottom}, lowest block ${Math.max(0, ...(subject.blockRects || []).map((r) => r?.bottom ?? 0))}) · `
        + `.results-final scrollWidth ${subject.finalScrollWidth} vs clientWidth ${subject.finalClientWidth} · `
        + `panel overflow-y=${subject.panelOverflowY} scrollHeight ${subject.panelScrollHeight} / clientHeight ${subject.panelClientHeight}`,
    );

    const ar = subject.actionsRect;
    tally.check(
      `${id} · actions are on screen`,
      Boolean(ar) && ar.top >= 0 && ar.bottom <= subject.innerHeight + 1,
      `.results-actions top=${ar?.top} bottom=${ar?.bottom} viewport height=${subject.innerHeight} `
        + `playAgain="${subject.playAgainText}" disabled=${subject.playAgainDisabled}`,
    );

    // 1/2 — the composite frame: results overlay over the live arena.
    await page.screenshot({ path: fullPng, fullPage: false });

    // 2/2 — chrome only. #hud is already suppressed at podium (hud.js:1975), so this is the
    // results overlay alone once the canvas and the CSS2D nametags are hidden. Same order
    // and rationale as sheet.mjs:341-369 — the hide happens BETWEEN the two shots.
    await page.evaluate(() => {
      const c = document.querySelector("canvas");
      if (c instanceof HTMLElement) c.style.visibility = "hidden";
    });
    const hideNametags = await page.addStyleTag({
      content: ".cart-nametag { visibility: hidden !important; }",
    });
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(undefined))));
    await page.screenshot({ path: chromePng, fullPage: false });
    await hideNametags.evaluate((el) => el.remove());
    await page.evaluate(() => {
      const c = document.querySelector("canvas");
      if (c instanceof HTMLElement) c.style.visibility = "";
    });

    const runtime = await page.evaluate(
      () => /** @type {any} */ (window).__ccDiag.snapshot("runtime") ?? {},
    );
    card.qualityTier = runtime.qualityTier ?? "?";
    card.gpuClass = runtime.gpuClass ?? "?";

    const wrote = await Promise.all(
      [fullPng, chromePng].map((p) => stat(p).then((s) => s.size > 0).catch(() => false)),
    );
    tally.check(`${id} · both PNGs written`, wrote.every(Boolean), `${fullPng} + ${chromePng}`);
  } catch (e) {
    tally.markError();
    tally.check(`${id} · captured`, false, e instanceof Error ? e.message : String(e));
    card.error = e instanceof Error ? e.message : String(e);
  } finally {
    await context.close().catch(() => {});
  }
  return card;
}

/** Montage page — shell from lib/montage.mjs; the chips below are this tool's own. */
function montageHtml(cards, meta) {
  const body = cards
    .map((c) => {
      const bad = c.error || c.winnerSlotIndex !== c.expectedWinner;
      return `      <div class="card${bad ? " bad" : ""}">
        <a href="${esc(c.full)}"><img src="${esc(c.full)}" alt="${esc(c.id)}" loading="lazy" style="aspect-ratio:auto;object-fit:contain;max-height:460px"></a>
        <div class="cardbody">
          <b>${esc(String(c.outcome ?? "").toUpperCase())}</b> <span class="dim">${esc(c.arena)} · ${c.w}×${c.h}${c.rm ? " · RM" : ""}${c.touch ? " · TOUCH" : ""}</span><br>
          <span class="chip">${esc(c.qualityTier ?? "?")}</span><span class="chip">${esc(c.gpuClass ?? "?")}</span>
          <span class="chip">winner slot ${esc(String(c.winnerSlotIndex ?? "?"))}${c.winnerSlotIndex === c.expectedWinner ? "" : ` ≠ ${esc(String(c.expectedWinner ?? "?"))}`}</span>
          <span class="chip">${esc(c.particle ?? "?")}</span>
          <span class="chip">cam skip ${esc(String(c.overlayVisibleMs ?? "?"))}ms</span>
          <span class="chip">receipt ${Number(c.receiptLines ?? 0)}</span><br>
          <span class="dim">${esc(c.verdict ?? "")}</span><br>
          ${c.error ? `<span class="err">${esc(c.error)}</span><br>` : ""}
          <a href="${esc(c.full)}">full</a> · <a href="${esc(c.chrome)}">chrome only</a>
        </div>
      </div>`;
    })
    .join("\n");

  return montagePage({
    title: "results podium contact sheet",
    stamp: `${esc(meta.when)} · ${cards.length} cells · arenas: ${esc(meta.arenas)} · pin: ${PIN_TOP} vs ${PIN_RUNNER_UP}, ${PIN_REMAIN_MS}ms left`,
    banner: `      This is a <b>layout baseline, not a golden render.</b> Cells run headless with no GPU
      flags — SwiftShader, LOW tier — so the arena behind the results scrim is missing its
      spotlights, lasers and skybox by design. Read each card's tier + GPU chips before
      calling a difference a visual regression. Opponent names are randomised per run and
      this repo has no gameplay RNG seed, so <b>image diffs can never gate this tool</b>;
      the DOM assertions are the gate.
      <br><br>
      <b>The scoreline is pinned, and the winner camera is skipped.</b> Each cell sets
      ${PIN_TOP} points for the intended winner and ${PIN_RUNNER_UP} for the runner-up, rewinds
      the round clock to ${PIN_REMAIN_MS}ms, and lets the real timer-expiry path end the round —
      no second client and no <code>src/</code> change. Victory vs defeat is purely which slot
      holds the ${PIN_TOP}. The 3000ms winner cam is then skipped with a real
      <code>Space</code> keydown after the 450ms input-spillover grace, so these frames are the
      results overlay at rest, not a natural post-match camera beat.
      <br><br>
      <b>UNVERIFIED — the non-host podium.</b> <code>playAgain.disabled</code>,
      <code>WAITING FOR HOST…</code> and the <code>STARTING IN (n)…</code> countdown
      (main.js:3357-3376) only render for a client that is not the host, which needs two
      connected clients. This tool runs <code>?room=solo</code>, so every cell here is a HOST
      podium and that branch is <b>not covered by any check row on this page</b> — deliberately,
      since a failing row for a surface the tool cannot reach would make every clean run exit
      non-zero. Treat the non-host podium as owed, not as passing.`,
    cardsHtml: body,
    footer: "Generated by <code>npm run podium</code> (tools/podium.mjs) — FIGHT-VERIFY-1 Phase A.",
  });
}

async function main() {
  const args = parseArgs(normalizeArgv(process.argv.slice(2)));
  const baseUrl = str(args.url) || `http://127.0.0.1:${CLIENT_PORT}/`;
  const outDir = resolve(str(args.out) || resolve(CAPTURE_DIR, "podium"));
  // * 6, not the sheet's 12: a fixed long settle tears the entrance panel mid-fade, and the
  // * entrance is already waited out on the DOM above.
  const settleFrames = Number(str(args.settle) ?? "") || 6;
  // * The arena is only a backdrop behind a near-opaque panel, so one is the default.
  const arenas = (str(args.arenas) || "classicRecord")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const outcomes = (str(args.outcomes) || OUTCOMES.join(","))
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const o of outcomes) {
    if (!OUTCOMES.includes(o)) {
      log(`bad --outcomes token "${o}" (want ${OUTCOMES.join(" and/or ")})`);
      process.exit(2);
    }
  }

  let viewports;
  if (str(args.viewports)) {
    const touch = args.touch === true;
    viewports = parseViewports(/** @type {string} */ (str(args.viewports))).map((v) => ({ ...v, touch }));
  } else if (args.all === true) {
    viewports = ALL_VIEWPORTS.slice();
  } else {
    viewports = DEFAULT_VIEWPORTS.slice();
  }

  /** @type {any[]} */
  let cells = [];
  for (const outcome of outcomes) {
    for (const v of viewports) cells.push({ ...v, outcome, rm: false });
  }
  // * RM is a fixed 2-cell victory-only pass, not a twin per viewport: the branch worth
  // * looking at is animateResultsPodiumShow's early return, and it is the same branch at
  // * every width.
  if (args["reduced-motion"] === true) {
    cells = [...cells, ...RM_VIEWPORTS.map((v) => ({ ...v, outcome: "victory", rm: true }))];
  }
  cells = dedupeCells(cells);

  const tally = new CheckTally("podium", log);
  let devProc = null;
  let browser = null;
  /** @type {Record<string, unknown>[]} */
  const cards = [];

  try {
    devProc = await maybeStartDevStack(args, log);
    await preflightStack(baseUrl, log);
  } catch (err) {
    log(err instanceof Error ? err.message : err);
    killDevStack(devProc);
    process.exit(2);
  }

  try {
    await mkdir(outDir, { recursive: true });
    const { chromium } = await ensurePlaywright(log);
    browser = await launchClientBrowser(chromium, { headed: args.headed === true });

    log(`${cells.length} cell(s) × ${arenas.length} arena(s) → ${outDir}`);
    for (const arena of arenas) {
      for (const cell of cells) {
        // eslint-disable-next-line no-await-in-loop
        cards.push(await captureCell(browser, baseUrl, { arena, cell, outDir, settleFrames, tally }));
      }
    }

    const indexPath = resolve(outDir, "index.html");
    await writeFile(
      indexPath,
      montageHtml(cards, { when: new Date().toISOString(), arenas: arenas.join(", ") }),
      "utf8",
    );
    log(`montage → ${indexPath}`);
  } catch (err) {
    tally.markError();
    log("run error:", err instanceof Error ? err.stack : err);
  } finally {
    await browser?.close().catch(() => {});
    killDevStack(devProc);
  }

  tally.finish(str(args.tallyOut));
}

main().catch((err) => {
  console.error("[podium] fatal:", err instanceof Error ? err.stack : err);
  process.exit(2);
});
