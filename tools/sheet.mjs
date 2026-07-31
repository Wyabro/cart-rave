#!/usr/bin/env node
/**
 * sheet.mjs — `npm run sheet`, the in-match HUD contact sheet (SHEET-1).
 *
 * `shoot.mjs` is menu-only and `blackframes.mjs` samples black-pixel ratios, so nothing in
 * the toolkit could reach an **in-match** frame at N viewports — which is exactly what the
 * responsive HUD work needs. This boots one solo round per {viewport × arena × reduced-motion}
 * cell, pins the match into a fixed state, and writes two PNGs per cell plus an index.html
 * montage.
 *
 * Usage:
 *   npm run sheet                                   # default matrix: 1920, 390, 1920+RM
 *   npm run sheet -- --all                          # UI-SCALE union + FIGHT-VERIFY pairs
 *   npm run sheet -- --viewports 1920x1080,390x844
 *   npm run sheet -- --arenas classicRecord,zanzibar
 *   npm run sheet -- --reduced-motion               # add an RM twin for every viewport
 *   npm run sheet -- --url http://127.0.0.1:3000/   # attach to a running dev stack
 *
 * Flags take `--flag value` (the shared parseArgs convention); `--flag=value` also works.
 *
 * WHAT THIS IS: a **layout baseline, not a golden render.** `launchClientBrowser` passes no
 * GPU flags, so headless runs on SwiftShader at the LOW tier — spotlights, lasers and skybox
 * are off. Each montage card prints `qualityTier` + `gpuClass` so that is never mistaken for
 * a visual regression.
 *
 * EXIT CONTRACT (CheckTally): 0 when, for every cell, the pin applied, the pin held on the
 * DOM, and both PNGs were written. Image MAE is deliberately NOT a check here — see the
 * chrome-shot note below.
 */

import { mkdir, writeFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import {
  CAPTURE_DIR,
  CLIENT_PORT,
  CheckTally,
  ensurePlaywright,
  killDevStack,
  launchClientBrowser,
  makeClient,
  makeLogger,
  maybeStartDevStack,
  parseArgs,
  preflightStack,
  str,
  waitForState,
} from "./lib/harness.mjs";

const log = makeLogger("sheet");

/** Default matrix — deliberately small; wall-clock is the main cost of this tool. */
const DEFAULT_CELLS = [
  { w: 1920, h: 1080, rm: false },
  { w: 390, h: 844, rm: false },
  { w: 1920, h: 1080, rm: true },
];

/**
 * `--all`: the UI-SCALE-1 union plus the FIGHT-VERIFY-1 pairs (deduped by {w,h,rm}).
 *
 * The landscape-phone row is not decoration. The first `--all` sweep was portrait-only, so
 * it proved the kill feed at nine widths and still missed that landscape phones take a
 * different CSS branch entirely (`orientation: landscape and max-height: 600px`) with its
 * own width cap — a defect that only surfaced when Wyatt filmed production at 900×390.
 * Any HUD rule with an orientation-scoped twin is invisible to a portrait-only matrix.
 */
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
  // Landscape phones — the `max-height: 600px` branch.
  { w: 900, h: 390 },
  { w: 812, h: 375 },
  { w: 667, h: 375 },
  // Touch pass — the `#hud.hud-touch` branch, which NO non-touch cell can reach. Every cell
  // above runs with a fine pointer, so touch-only rules were invisible to the whole sweep:
  // that is how `#hud.hud-touch .hud-scoreLabel{display:none}` shipped a HUD whose score
  // chips named nobody. These four straddle the 900px threshold that rule now keys on.
  { w: 1200, h: 528, touch: true },
  { w: 900, h: 390, touch: true },
  { w: 812, h: 375, touch: true },
  { w: 390, h: 844, touch: true },
];

/**
 * Mid-round pin. Deliberately NOT `gameharness`'s `rewindRoundClock(1200)`: that lever *sets*
 * remaining time, so 1200 means "1.2 s left" — a fast-end that would race podium mid-capture.
 * 90 s leaves the round comfortably running. Scores are asymmetric so the score strip renders
 * a real leader/trailer split rather than four zeroes.
 */
const PIN_SCORES = { 0: 2, 1: 1, 2: 0, 3: 0 };
const PIN_REMAIN_MS = 90_000;
/**
 * The clock keeps ticking through `settle` (headless SwiftShader runs the loop at ~5 fps, so
 * a 12-frame settle can burn seconds). The assert proves the rewind APPLIED — an unpinned
 * round reads ~150 000 here — so the band is one-sided and generous rather than ±1 s.
 */
const PIN_REMAIN_FLOOR_MS = 80_000;
const PIN_REMAIN_CEIL_MS = PIN_REMAIN_MS + 500;

/** Page-side probe reads (Node-side fns, no string eval — the waitForState convention). */
const readRound = () => /** @type {any} */ (window).__ccDiag.snapshot("round");

/**
 * Is the thing on screen actually the in-match HUD? Overlays replace the subject without
 * touching any store the pin reads, so this is a DOM question, not a state question.
 */
const readSubject = () => {
  const esc = document.getElementById("esc-overlay");
  const softGl = document.getElementById("cr-softgl-notice");
  const feed = document.querySelector(".hud-feed");
  const hud = document.getElementById("hud");
  return {
    // * Did the touch branch actually engage? A "touch" cell that quietly rendered the
    // * desktop HUD would re-create the blind spot this pass exists to close.
    touchBranch: Boolean(hud?.classList.contains("hud-touch")),
    scoreLabelShown: [...document.querySelectorAll("#hud .hud-scoreLabel")].filter(
      (el) => getComputedStyle(el).display !== "none",
    ).length,
    escVisible: Boolean(esc) && /** @type {HTMLElement} */ (esc).offsetParent !== null,
    softGlVisible: Boolean(softGl) && /** @type {HTMLElement} */ (softGl).offsetParent !== null,
    timerText: document.querySelector(".hud-timer-num")?.textContent?.trim() ?? "",
    feedRows: document.querySelectorAll(".hud-feed-row").length,
    feedShown: Boolean(feed) && getComputedStyle(/** @type {Element} */ (feed)).display !== "none",
  };
};

/** `--flag=value` → `--flag value`, so the documented spelling and the repo convention agree. */
function normalizeArgv(argv) {
  return argv.flatMap((a) => {
    const m = /^(--[^=]+)=(.*)$/.exec(a);
    return m ? [m[1], m[2]] : [a];
  });
}

/** "1920x1080,390x844" → [{w,h}, …]. Throws on a malformed token rather than silently dropping it. */
function parseViewports(spec) {
  return spec
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => {
      const m = /^(\d+)x(\d+)$/i.exec(t);
      if (!m) throw new Error(`bad --viewports token "${t}" (want WxH, e.g. 1920x1080)`);
      return { w: Number(m[1]), h: Number(m[2]) };
    });
}

/** Dedupe by {w,h,rm,touch} so `--reduced-motion` adds twins instead of stacking duplicates. */
function dedupeCells(cells) {
  const seen = new Set();
  return cells.filter((c) => {
    const key = `${c.w}x${c.h}${c.rm ? "-rm" : ""}${c.touch ? "-touch" : ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Stable, sortable, filesystem-safe cell id. */
const cellId = (arena, c) =>
  `${arena}-${c.w}x${c.h}${c.rm ? "-rm" : ""}${c.touch ? "-touch" : ""}`;

/**
 * Boot one cell, pin it, and capture both PNGs.
 *
 * Capture ORDER is load-bearing — the hide happens BETWEEN the two shots, never before both:
 *   settle → pin + assert ok → full-viewport PNG → hide canvas + nametags → *-hud.png → restore.
 *
 * @returns {Promise<Record<string, unknown>>} One montage card record.
 */
async function captureCell(browser, baseUrl, { arena, cell, outDir, settleFrames, tally }) {
  const id = cellId(arena, cell);
  const label = `sheet:${id}`;
  const fullPng = resolve(outDir, `${id}.png`);
  const hudPng = resolve(outDir, `${id}-hud.png`);
  log(`[cell] ${id}`);

  const { context, page } = await makeClient(browser, {
    baseUrl,
    label,
    username: "SheetBot",
    // * harness=1 is REQUIRED: installVisualHarness only runs behind one of the debug flags
    // * (main.js:5450), and without it __cartRave.settle is undefined. harness=1 alone is
    // * right — freeze/cam lock the camera and hud=0 would hide the very subject.
    params: { room: "solo", diag: "1", perfPump: "1", harness: "1" },
    storage: { cartRaveLevel: arena },
    viewport: { width: cell.w, height: cell.h },
    ...(cell.rm ? { reducedMotion: "reduce" } : {}),
    // * Both flags, not just hasTouch — the game's touch branch needs a coarse pointer too.
    ...(cell.touch ? { hasTouch: true, isMobile: true } : {}),
  });

  /** @type {Record<string, unknown>} */
  const card = {
    id, arena, w: cell.w, h: cell.h, rm: cell.rm, touch: Boolean(cell.touch),
    full: `${id}.png`, hud: `${id}-hud.png`,
  };

  try {
    // * A fresh page per cell, never a post-boot viewport change: resizing after boot does
    // * not re-run the entrance cascade, so the HUD would be captured mid-life.
    await waitForState(page, (s) => s?.phase === "running", {
      read: readRound,
      timeout: 90_000,
      label,
    });

    // * Dismiss the software-rendering advisory (#cr-softgl-notice, main.js:1030-1060). It is
    // * a fixed full-screen backdrop at z-index 20010 sitting dead centre, and because this
    // * tool ALWAYS runs headless on SwiftShader it fires on every single cell — left up it
    // * would occlude the middle of every frame (countdown, SUDDEN DEATH banner, directive
    // * card). Removing the node is exactly what its PLAY ANYWAY handler does.
    card.softGlNoticeDismissed = await page.evaluate(() => {
      const el = document.getElementById("cr-softgl-notice");
      if (!el) return false;
      el.remove();
      return true;
    });

    // Pin. Both levers are host-gated AND running-round-gated (devControl.js:26-34) and
    // return { ok, message, reason } — a refusal is a silent no-op, so assert ok on both.
    // Solo satisfies the host gate (netcode.js:2264-2268 sets isHost = true) and the phase
    // gate is satisfied by the wait above.
    const pin = await page.evaluate(
      ({ scores, remainMs }) => {
        const c = /** @type {any} */ (window).__ccDiag?.control;
        if (!c) return { ok: false, reason: "no-control", message: "__ccDiag.control is absent" };
        const s = c.setScores?.(scores);
        if (!s?.ok) return { ok: false, reason: s?.reason ?? "no-setScores", message: s?.message ?? "setScores unavailable" };
        const r = c.rewindRoundClock?.(remainMs);
        if (!r?.ok) return { ok: false, reason: r?.reason ?? "no-rewind", message: r?.message ?? "rewindRoundClock unavailable" };
        return { ok: true, reason: null, message: `${s.message} ${r.message}` };
      },
      { scores: PIN_SCORES, remainMs: PIN_REMAIN_MS },
    );
    tally.check(`${id} · pin applied`, pin.ok === true, pin.ok ? pin.message : `reason=${pin.reason} — ${pin.message}`);

    await page.evaluate(async (n) => {
      await /** @type {any} */ (window).__cartRave?.settle?.(n);
    }, settleFrames);

    // * The subject must actually BE the in-match HUD. The store pin survives anything —
    // * pausing does not touch it — so without this gate an overlay ships as a green cell.
    // * That is exactly what happened on the first --all sweep: one cell captured the PAUSE
    // * overlay ("MATCH HELD") and still passed 4/4, because in solo an open pause overlay
    // * freezes physics AND frame timing (main.js:5157), leaving the pinned clock looking
    // * perfect. Recover once via the production RESUME path, then fail loudly if it sticks.
    let subject = await page.evaluate(readSubject);
    if (subject.escVisible) {
      log(`[cell] ${id} — pause overlay was open; resuming and re-settling`);
      card.pauseRecovered = true;
      await page.evaluate(() => {
        const btn = document.querySelector("#esc-overlay .esc-btn--resume");
        if (btn instanceof HTMLElement) btn.click();
      });
      await page.evaluate(async (n) => {
        await /** @type {any} */ (window).__cartRave?.settle?.(n);
      }, settleFrames);
      subject = await page.evaluate(readSubject);
    }
    tally.check(
      `${id} · subject is the in-match HUD`,
      subject.escVisible === false && subject.softGlVisible === false && subject.timerText !== "",
      `esc=${subject.escVisible} softGl=${subject.softGlVisible} timer="${subject.timerText}"` +
        (card.pauseRecovered ? " (recovered from pause)" : ""),
    );
    // * A touch cell must prove it reached the touch branch, and a non-touch cell must prove
    // * it did NOT — otherwise the two halves of the matrix silently test the same thing.
    tally.check(
      `${id} · ${cell.touch ? "touch" : "pointer"} branch as declared`,
      subject.touchBranch === Boolean(cell.touch),
      `hud-touch=${subject.touchBranch} expected=${Boolean(cell.touch)} scoreLabelsVisible=${subject.scoreLabelShown}`,
    );
    card.touchBranch = subject.touchBranch;
    card.scoreLabelShown = subject.scoreLabelShown;
    // * Kill feed: force one row. Cells are captured a few seconds into the round, before any
    // * NPC has scored, and `.hud-feed` keeps `is-empty` (display:none, hud.css:690) until a
    // * row exists — so without this the redesigned feed plates are absent from every cell and
    // * read as "fine" when they are simply UNVERIFIED. The lever renders through the real
    // * rebuildKOEvent -> killFeedReactor path, so the plate is the product's own markup.
    // * Fired late (rows auto-fade after a few seconds) and never at the local player, whose
    // * slot the lever rejects as both attacker and victim.
    const feed = await page.evaluate(() => {
      const d = /** @type {any} */ (window).__ccDiag;
      const c = d?.control;
      if (!c?.forceKillFeed) {
        return { ok: false, reason: "no-lever", message: "forceKillFeed absent — DEV build required" };
      }
      const local = d.snapshot("round")?.localSlotIndex;
      const victim = [1, 2, 3, 0].find((s) => s !== local);
      return c.forceKillFeed({ victimSlotIndex: victim, comboTier: 2, comboMultiplier: 2.0 });
    });
    await page.evaluate(async () => {
      await /** @type {any} */ (window).__cartRave?.settle?.(3);
    });
    subject = await page.evaluate(readSubject);
    card.feedRows = subject.feedRows;
    card.feedShown = subject.feedShown;
    tally.check(
      `${id} · kill feed rendered`,
      feed.ok === true && subject.feedRows > 0 && subject.feedShown === true,
      `${feed.message} rows=${subject.feedRows} shown=${subject.feedShown}`,
    );
    const held = await page.evaluate(() => {
      const d = /** @type {any} */ (window).__ccDiag;
      return {
        scores: d.snapshot("score")?.scores ?? null,
        remainingMs: d.snapshot("round")?.remainingMs ?? null,
        timerText: document.querySelector(".hud-timer-num")?.textContent?.trim() ?? null,
      };
    });
    const scoresHeld =
      held.scores != null && [0, 1, 2, 3].every((slot) => Number(held.scores[slot]) === PIN_SCORES[slot]);
    const clockHeld =
      typeof held.remainingMs === "number" &&
      held.remainingMs >= PIN_REMAIN_FLOOR_MS &&
      held.remainingMs <= PIN_REMAIN_CEIL_MS;
    tally.check(`${id} · pin held (scores)`, scoresHeld, JSON.stringify(held.scores));
    tally.check(
      `${id} · pin held (clock)`,
      clockHeld,
      `remainingMs=${held.remainingMs} timer="${held.timerText}"`,
    );
    card.timerText = held.timerText;

    // Runtime context for the card. Trap: the field is `qualityTier` (camelCase —
    // `quality_tier` is the CaptureLog column), and the probe reads settingsStore, not the
    // session force, so it can read HIGHER than what actually rendered. gpuClass beside it
    // is what surfaces the SwiftShader/LOW story.
    const runtime = await page.evaluate(() => /** @type {any} */ (window).__ccDiag.snapshot("runtime") ?? {});
    card.qualityTier = runtime.qualityTier ?? "?";
    card.gpuClass = runtime.gpuClass ?? "?";

    // 1/2 — the composite frame: HUD chrome over the live arena.
    await page.screenshot({ path: fullPng, fullPage: false });

    // 2/2 — chrome only. NOT a clip to #hud: that is `position:fixed; inset:0;
    // pointer-events:none` (hud.css:4,23-26), a transparent full-viewport overlay, so its
    // rect is the whole frame and the canvas composites straight through it. Hide instead.
    await page.evaluate(() => {
      // * __cartRave exposes no canvas getter (visualHarness.js:200) — deps.getCanvas is
      // * internal — so the query selector is the only page-reachable route, the same one
      // * sampleBlack falls back to (visualHarness.js:134).
      const c = document.querySelector("canvas");
      if (c instanceof HTMLElement) c.style.visibility = "hidden";
    });
    // * Hiding the canvas alone does NOT remove the nametags: labelRenderer.domElement is a
    // * SEPARATE div appended to document.body at z-index 19985 (main.js:1633-1644). They
    // * track live cart poses, so left visible they are pure run-to-run drift in the chrome
    // * shot. Target the class (main.js:3678) — that container div carries no id or class,
    // * only inline styles, so any selector for it would key off inline-style text.
    const hideNametags = await page.addStyleTag({
      content: ".cart-nametag { visibility: hidden !important; }",
    });
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(undefined))));
    await page.screenshot({ path: hudPng, fullPage: false });

    await hideNametags.evaluate((el) => el.remove());
    await page.evaluate(() => {
      const c = document.querySelector("canvas");
      if (c instanceof HTMLElement) c.style.visibility = "";
    });

    const wrote = await Promise.all(
      [fullPng, hudPng].map((p) =>
        stat(p)
          .then((s) => s.size > 0)
          .catch(() => false),
      ),
    );
    tally.check(`${id} · both PNGs written`, wrote.every(Boolean), `${fullPng} + ${hudPng}`);
  } catch (e) {
    tally.markError();
    tally.check(`${id} · captured`, false, e instanceof Error ? e.message : String(e));
    card.error = e instanceof Error ? e.message : String(e);
  } finally {
    await context.close().catch(() => {});
  }
  return card;
}

const esc = (s) =>
  String(s ?? "").replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]);

/** Montage page — own file, same card shape as the Command Center (dashboard.mjs:255-262). */
function montageHtml(cards, meta) {
  const body = cards
    .map(
      (c) => `      <div class="card${c.error ? " bad" : ""}">
        <a href="${esc(c.full)}"><img src="${esc(c.full)}" alt="${esc(c.id)}" loading="lazy"></a>
        <div class="cardbody">
          <b>${esc(c.arena)}</b> <span class="dim">${c.w}×${c.h}${c.rm ? " · RM" : ""}${c.touch ? " · TOUCH" : ""}</span><br>
          <span class="chip">${esc(c.qualityTier ?? "?")}</span><span class="chip">${esc(c.gpuClass ?? "?")}</span>
          ${c.timerText ? `<span class="chip">⏱ ${esc(c.timerText)}</span>` : ""}
          <span class="chip">feed ${Number(c.feedRows ?? 0)}</span>
          <span class="chip">names ${Number(c.scoreLabelShown ?? 0)}/4</span>
          ${c.pauseRecovered ? `<span class="chip warn">resumed from pause</span>` : ""}<br>
          ${c.error ? `<span class="err">${esc(c.error)}</span><br>` : ""}
          <a href="${esc(c.full)}">full</a> · <a href="${esc(c.hud)}">chrome only</a>
        </div>
      </div>`,
    )
    .join("\n");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Cart Clash — HUD contact sheet</title>
<style>
  :root { --bg:#0a0a0f; --panel:#14141c; --panel2:#191922; --edge:#26263a; --edge2:#3a3a55;
          --text:#e8e8f0; --dim:#8a8aa0; --neon:#ff2d95; --cyan:#39d7ff; --bad:#ff5470; }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--text); font:14px/1.5 system-ui,Segoe UI,sans-serif; }
  .shell { max-width:1440px; margin:0 auto; padding:20px 24px 48px; }
  h1 { margin:0 0 2px; font-size:20px; letter-spacing:3px; font-weight:800; }
  h1 .neon { color:var(--neon); text-shadow:0 0 18px rgba(255,45,149,.55); }
  .stamp { color:var(--dim); font-size:12px; }
  .banner { margin:16px 0 20px; padding:12px 16px; border:1px solid var(--edge2); border-left:3px solid var(--neon);
            border-radius:8px; background:var(--panel); font-size:13px; }
  .banner b { color:var(--neon); }
  .cards { display:grid; grid-template-columns:repeat(auto-fill, minmax(300px, 1fr)); gap:12px; }
  .card { background:var(--panel2); border:1px solid var(--edge); border-radius:10px; overflow:hidden; }
  .card:hover { border-color:var(--edge2); }
  .card.bad { border-color:var(--bad); }
  .card img { width:100%; display:block; aspect-ratio:16/9; object-fit:cover; background:#000; }
  .cardbody { padding:10px 12px; font-size:12px; }
  .dim { color:var(--dim); }
  .err { color:var(--bad); }
  .chip { display:inline-block; margin:4px 4px 0 0; padding:1px 7px; border:1px solid var(--edge2);
          border-radius:999px; font-size:11px; color:var(--cyan); }
  .chip.warn { color:#ffb45c; border-color:#7a5326; }
  a { color:var(--cyan); }
  footer { margin-top:28px; padding-top:16px; border-top:1px solid var(--edge); color:var(--dim); font-size:12px; }
</style>
</head>
<body>
  <div class="shell">
    <h1>CART <span class="neon">CLASH</span> — HUD CONTACT SHEET</h1>
    <div class="stamp">${esc(meta.when)} · ${cards.length} cells · arenas: ${esc(meta.arenas)} · pin: scores 2/1/0/0, ${PIN_REMAIN_MS / 1000}s left</div>

    <div class="banner">
      This is a <b>layout baseline, not a golden render.</b> Cells run headless with no GPU
      flags — SwiftShader, LOW tier — so spotlights, lasers and the skybox are off by design.
      Read each card's tier + GPU chips before calling a difference a visual regression.
      Determinism is asserted on the DOM pin, never on pixels: the chrome-only shot hides the
      canvas and the CSS2D nametags, but <b>opponent names and the active directive are
      randomised per run</b> and this repo has no gameplay RNG seed, so cross-run image diffs
      are for eyeballing only and can never be a gate.
      <br><br>
      <b>The kill-feed row is forced, not organic.</b> Cells are captured a few seconds into
      the round, before any NPC has scored, and <code>.hud-feed</code> stays
      <code>display:none</code> while empty (hud.css:690) — so each cell fires one row through
      the real <code>rebuildKOEvent</code> → <code>killFeedReactor</code> path (DEV-only lever,
      presentation only, no score or progression writes). The plate markup, verb, colours and
      combo pip are the product's own. Every card's <code>feed</code> chip reports the row
      count actually observed: <code>feed 0</code> means the plates are UNVERIFIED in that
      cell, not that they are fine.
    </div>

    <div class="cards">
${body}
    </div>

    <footer>Generated by <code>npm run sheet</code> (tools/sheet.mjs) — SHEET-1.</footer>
  </div>
</body>
</html>
`;
}

async function main() {
  const args = parseArgs(normalizeArgv(process.argv.slice(2)));
  const baseUrl = str(args.url) || `http://127.0.0.1:${CLIENT_PORT}/`;
  const outDir = resolve(str(args.out) || resolve(CAPTURE_DIR, "sheet"));
  const settleFrames = Number(str(args.settle) ?? "") || 12;
  const arenas = (str(args.arenas) || "classicRecord")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  let cells;
  if (str(args.viewports)) {
    // * `--touch` marks every explicit viewport as a touch cell — the quick way to exercise
    // * the `#hud.hud-touch` branch without running the whole --all matrix.
    const touch = args.touch === true;
    cells = parseViewports(/** @type {string} */ (str(args.viewports))).map((v) => ({ ...v, rm: false, touch }));
  } else if (args.all === true) {
    cells = ALL_VIEWPORTS.map((v) => ({ ...v, rm: false }));
  } else {
    cells = DEFAULT_CELLS.slice();
  }
  // * --reduced-motion means "an RM twin for every selected viewport", then dedupe by
  // * {w,h,rm} so the default matrix's built-in 1920+RM cell is not doubled.
  if (args["reduced-motion"] === true) {
    cells = [...cells, ...cells.filter((c) => !c.rm).map((c) => ({ ...c, rm: true }))];
  }
  cells = dedupeCells(cells);

  const tally = new CheckTally("sheet", log);
  let devProc = null;
  let browser = null;
  /** @type {Record<string, unknown>[]} */
  const cards = [];

  try {
    // * Bring the stack up ONCE, before any cell. Without this the tool silently assumes a
    // * hand-started server and every cell burns its full boot timeout instead of failing
    // * once with the preflight's own (wedged-workerd aware) message.
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
  console.error("[sheet] fatal:", err instanceof Error ? err.stack : err);
  process.exit(2);
});
