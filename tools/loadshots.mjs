#!/usr/bin/env node
/**
 * loadshots.mjs — `npm run loadshots`, the loading-screen contact sheet
 * (FIGHT-VERIFY-1 Phase C).
 *
 * Two surfaces, ~950 lines of CSS between them, and NOTHING in this toolkit has ever
 * rendered either one:
 *
 *   --surface mode  the mode-entry overlay (`src/ui/loadingScreen.js` + `loadingScreen.css`
 *                   ~620 lines) — three arena themes nobody has seen themed.
 *   --surface boot  the initial boot splash (`index.html` inline markup :419-553 + inline
 *                   CSS :59-406) — the two-cart crash tableau, frozen beat by beat.
 *
 * `npm run sheet` structurally cannot reach either: `makeClient` seeds `cartRaveBootSeen`
 * and every sheet cell waits for `phase === "running"`, which is already past both screens.
 *
 * ── THESE ARE HELD FRAMES, NOT NATURAL ONES ────────────────────────────────────────────
 * Both screens dismiss themselves in well under a second, so this tool does not chase the
 * window — it HOLDS it. A MutationObserver armed through `makeClient({ initScripts })`
 * (harness.mjs:310-317, a CONTEXT-level init script that runs before `goto`) strips the
 * hiding classes as the app adds them, and re-appends the boot splash when the app removes
 * the node. The app itself proceeds normally throughout: the dismissal promises still
 * resolve, `modeEntryHiddenWaiters` still flush, the round still starts. So a held frame
 * sits on top of a LIVE app — `revealAppShell()` (loadingScreen.js:286-292) has already
 * dropped `body.cr-boot-pending` and made the menu visible underneath. The montage says so
 * on its own face; not saying so would be the exact D-SHEET-1 sin.
 *
 * ── ARMING DISCIPLINE IS THE WHOLE GAME (mode) ─────────────────────────────────────────
 * `ensureModeOverlay()` (loadingScreen.js:151-193) creates `#cr-mode-load` early, ALREADY
 * carrying `cr-load--hidden` (:156) and un-themed. A naive "strip cr-load--hidden whenever
 * you see it" observer would therefore paint an empty shell and call it a loading screen.
 * So the observer LATCHES on the first genuine hidden→visible transition — the app's own
 * `showModeEntryLoading` removing the class and setting `aria-busy="true"` (:399-400) — and
 * only strips re-adds after that. THAT LATCH IS THE SUBJECT PROOF: if it never fires, the
 * tool reports "the app never showed the mode-entry overlay" instead of screenshotting a
 * blank shell.
 *
 * ── FREEZING THE CRASH TABLEAU (boot) ──────────────────────────────────────────────────
 * Every animated splash element shares one master timeline (`--boot-loop: 2800ms`, all
 * `linear infinite`, phase map at index.html:74-79). This tool parks the whole scene at a
 * beat with the Web Animations API — `anim.pause(); anim.currentTime = beatMs` — NOT with
 * the `animation-delay: -Xms !important` CSS recipe. See BEAT_FREEZE_NOTE below: the CSS
 * form is measurably NOT deterministic, and the tool measures it rather than asserting it.
 *
 * Usage:
 *   npm run loadshots                              # both surfaces — 8 mode cells + 12 boot cells
 *   npm run loadshots -- --surface mode
 *   npm run loadshots -- --surface boot
 *   npm run loadshots -- --arenas zanzibar
 *   npm run loadshots -- --url http://127.0.0.1:4000/   # attach to a running dev stack
 *   npm run loadshots -- --headed
 *
 * EXIT CONTRACT (CheckTally, harness.mjs:529-534): 0 when every cell latched, held, proved
 * its own identity and wrote its PNGs. `finish()` exits 1 on ANY `pass:false` and can never
 * exit 3, so surfaces this tool provably cannot reach are declared in the montage banner and
 * NOT emitted as check rows.
 *
 * NO IMAGE GATING, EVER (D-SHEET-1): the mode overlay picks its flavour line with
 * `Math.random()` (loadingScreen.js:105-107) and this repo has no gameplay RNG seed. The
 * DOM/computed-style assertions are the gate; the PNGs are for eyeballing.
 */

import { mkdir, writeFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import {
  CAPTURE_DIR,
  CLIENT_PORT,
  CheckTally,
  cellId,
  ensurePlaywright,
  killDevStack,
  launchClientBrowser,
  makeClient,
  makeLogger,
  maybeStartDevStack,
  normalizeArgv,
  parseArgs,
  parseViewports,
  preflightStack,
  sleep,
  str,
  waitForState,
} from "./lib/harness.mjs";
import { esc, montagePage } from "./lib/montage.mjs";

const log = makeLogger("loadshots");

/* ───────────────────────────── expectations (the gate) ─────────────────────────────── */

/**
 * Mirror of LOAD_TIPS (loadingScreen.js) — shared across arenas (LOAD-TIPS-1).
 * Duplicated ON PURPOSE: an assertion that imports its own expected value proves
 * nothing. `title`/`kicker` stay per-theme identity; `messages` is the tip pool
 * the rotation timer picks from (same list for every theme).
 * @type {readonly string[]}
 */
const LOAD_TIPS = Object.freeze([
  "Tap boost for a quick shove · hold to wind up a harder one.",
  "Hop to clear a pit or land on someone.",
  "You only score when you force a rival off the edge.",
  "Chain KOs before the streak fades — RAMPAGE · SAVAGE · CARNAGE.",
  "Every ~18s the PA calls a directive that rewrites the round.",
  "Scoring fills your cargo bay — fuller means heavier and a bigger spill.",
]);

/**
 * Mirror of `THEME_COPY` identity strings + tip pool (loadingScreen.js).
 * @type {Record<"classic"|"backrooms"|"zanzibar", { title: string, kicker: string, messages: readonly string[] }>}
 */
const THEME_COPY = {
  classic: {
    title: "CART RAVE",
    kicker: "RESTOCKING THE DANCE FLOOR",
    messages: LOAD_TIPS,
  },
  backrooms: {
    title: "THE STOREROOMS",
    kicker: "AISLE INVENTORY IN PROGRESS",
    messages: LOAD_TIPS,
  },
  zanzibar: {
    title: "SUNDIAL STATION",
    kicker: "OPENING THE SUNDECK",
    messages: LOAD_TIPS,
  },
};

/**
 * The theme each arena id resolves to — `showModeEntryLoading` (loadingScreen.js:388-394)
 * keys on `levelId` ONLY (gameMode is ignored), and anything not backrooms/zanzibar —
 * including `testArena` and any unknown id, via `resolveLevelId`'s DEFAULT_LEVEL_ID
 * fallback — lands on classic.
 * @param {string} arena
 */
const themeForArena = (arena) =>
  arena === "backrooms" ? "backrooms" : arena === "zanzibar" ? "zanzibar" : "classic";

/**
 * Theme signature nodes — the decor `applyTheme` builds into `.cr-load__stage`. Counting
 * these is what separates "an overlay is up" from "the RIGHT arena's overlay is up".
 * classic  buildClassicDecor    loadingScreen.js:111-123
 * backrooms buildBackroomsDecor loadingScreen.js:125-139
 * zanzibar  buildZanzibarDecor  loadingScreen.js:141-149
 */
const DECOR_SIGNATURE = {
  classic: { vinyl: 1, laser: 3, crowdSpan: 5, furnBox: 0, furnChair: 0, seaSun: 0, seaWaterSpan: 0, seaDeck: 0 },
  backrooms: { vinyl: 0, laser: 0, crowdSpan: 0, furnBox: 3, furnChair: 1, seaSun: 0, seaWaterSpan: 0, seaDeck: 0 },
  zanzibar: { vinyl: 0, laser: 0, crowdSpan: 0, furnBox: 0, furnChair: 0, seaSun: 1, seaWaterSpan: 3, seaDeck: 1 },
};

/** The splash's master loop, `--boot-loop` (index.html:81). Every beat below is a slice of it. */
const BOOT_LOOP_MS = 2800;

/**
 * The five beats worth looking at, from the phase map the design documents at
 * index.html:74-79 (percentages of --boot-loop):
 *   0–8 anticipation · 8–36 charge · 36–46 IMPACT · 46–74 recoil · 74–100 roll home.
 * `b2-impact` at 1150ms = 41.1% is the beat the whole splash exists for, and the one frame
 * no human has ever seen still.
 */
const BOOT_BEATS = [
  { key: "b0-anticipation", ms: 0 },
  { key: "b1-charge", ms: 560 },
  { key: "b2-impact", ms: 1150 },
  { key: "b3-recoil", ms: 1680 },
  { key: "b4-rollhome", ms: 2450 },
];
const IMPACT_BEAT = BOOT_BEATS[2];

/**
 * WHY THE WEB ANIMATIONS API AND NOT `animation-delay: -Xms !important`.
 *
 * The plan's recipe was to inject `#cr-boot-splash * { animation-delay: -1150ms !important;
 * animation-play-state: paused !important }`. That is not deterministic. Changing
 * `animation-delay` on an ALREADY-RUNNING CSS animation updates the effect's delay but does
 * NOT move the animation's start time, so the frozen local time is
 * `(now - startTime) + 1150ms`, not `1150ms` — it depends on how long the page had been up
 * when the style landed, and drifts by a full 2800ms loop every 2.8 seconds of boot jitter.
 * (Negative delay only means "start 1150ms in" for an animation that starts AT THAT MOMENT.)
 *
 * `anim.pause(); anim.currentTime = ms` sets the hold time outright and is exact.
 * `--probe-css-freeze` measures the CSS form once per run so the claim above is a number in
 * the log rather than an argument in a comment.
 */
const BEAT_FREEZE_NOTE = "WAAPI currentTime (not CSS animation-delay — see BEAT_FREEZE_NOTE)";

/** Progress tolerance for "frozen at the declared beat" — one 60Hz frame is 0.006 of the loop. */
const BEAT_PROGRESS_EPS = 0.002;

/* ───────────────────────────── cell matrices ─────────────────────────────── */

const MODE_VIEWPORTS = [
  { w: 1920, h: 1080 },
  { w: 390, h: 844 },
];
const MODE_ARENAS = ["classicRecord", "backrooms", "zanzibar"];

const BOOT_VIEWPORTS = [
  { w: 1920, h: 1080 },
  { w: 390, h: 844 },
];

/* ───────────────────────── page-side observers (init scripts) ───────────────────────── */

/**
 * BOOT hold observer. Installed via `context.addInitScript`, so it runs at document_start —
 * before the parser has even reached `#cr-boot-splash` (index.html:419), which is the only
 * moment early enough to matter for markup served in the HTML itself.
 *
 * The splash is torn down by TWO independent paths, so attributes alone are not enough:
 *   loadingScreen.js:342+349 — adds cr-load--exit/cr-load--hidden, then `splash.remove()`
 *   index.html:1052+1053     — `shedBootSplash()` does the same at DOMContentLoaded+3500ms
 * Hence: an attribute observer on the node AND a childList observer on `document.body`,
 * which re-appends the node when either `remove()` lands.
 */
function bootHoldScript() {
  const S = {
    seenAtMs: null,
    seenReadyState: null,
    strips: 0,
    firstStripAtMs: null,
    reappends: 0,
    firstReappendAtMs: null,
    tickerKilledAtMs: null,
    floorProbe: null,
  };
  /** @type {any} */ (window).__crHold = { boot: S };

  /** @type {any} */
  let el = null;

  const hold = () => {
    if (!el) return;
    if (!el.isConnected && document.body) {
      document.body.appendChild(el);
      S.reappends += 1;
      if (S.firstReappendAtMs == null) S.firstReappendAtMs = Math.round(performance.now());
    }
    if (el.classList.contains("cr-load--hidden") || el.classList.contains("cr-load--exit")) {
      el.classList.remove("cr-load--hidden", "cr-load--exit");
      S.strips += 1;
      if (S.firstStripAtMs == null) S.firstStripAtMs = Math.round(performance.now());
    }
  };

  const watchBody = () => {
    if (!document.body) {
      requestAnimationFrame(watchBody);
      return;
    }
    new MutationObserver(hold).observe(document.body, { childList: true });
  };

  const attach = (node) => {
    el = node;
    S.seenAtMs = Math.round(performance.now());
    // * "loading" here is the proof of FIRST PAINT: the parser is still inside <body> and
    // * the module bundle has not run, so the splash we are holding is the served markup,
    // * not something the app painted later.
    S.seenReadyState = document.readyState;
    new MutationObserver(hold).observe(el, { attributes: true, attributeFilter: ["class"] });
    watchBody();
  };

  const found = document.getElementById ? document.getElementById("cr-boot-splash") : null;
  if (found) {
    attach(found);
  } else {
    // * observe(document, …) not documentElement — at document_start there is no <html> yet.
    const disco = new MutationObserver(() => {
      const n = document.getElementById("cr-boot-splash");
      if (n) {
        disco.disconnect();
        attach(n);
      }
    });
    disco.observe(document, { childList: true, subtree: true });
  }

  // * Kill the inline fake ticker (index.html:588) at the FIRST frame — before its first
  // * 200ms tick — so `bootProgress` is still 0 and `__crBootFloor` (index.html:600-605) can
  // * be tested from a known floor. Both timers are real page globals; clearing them is
  // * exactly what the app's own dismissal does (loadingScreen.js:325-327).
  const probe = () => {
    const w = /** @type {any} */ (window);
    if (typeof w.__crBootFloor !== "function") {
      requestAnimationFrame(probe);
      return;
    }
    if (w.bootTimer) {
      clearInterval(w.bootTimer);
      w.bootTimer = null;
    }
    if (w.bootMsgTimer) {
      clearInterval(w.bootMsgTimer);
      w.bootMsgTimer = null;
    }
    S.tickerKilledAtMs = Math.round(performance.now());
    const read = () => ({
      pct: document.getElementById("cr-boot-pct")?.textContent ?? null,
      width: /** @type {any} */ (document.getElementById("cr-boot-fill"))?.style?.width ?? null,
      aria: document.getElementById("boot-seg-bar")?.getAttribute("aria-valuenow") ?? null,
    });
    const before = read();
    w.__crBootFloor(45);
    S.floorProbe = { atMs: S.tickerKilledAtMs, before, after: read() };
  };
  requestAnimationFrame(probe);
}

/**
 * MODE hold observer + copy timeline.
 *
 * The latch (see the file header) is the subject proof. Before it fires this observer strips
 * NOTHING — `ensureModeOverlay()` ships the node pre-hidden and un-themed, and holding THAT
 * open would produce a screenshot of a blank shell that passes every "an overlay is visible"
 * check while showing no loading screen at all.
 *
 * The text timeline is reconstructed from the MutationRecords rather than by reading
 * `textContent` in the callback, and that is deliberate: `showModeEntryLoading` sets a random
 * flavour message (via applyTheme → startModeMessageRotation) and then immediately overwrites
 * it with `setProgress(0, "Starting...")` IN THE SAME TASK. A post-batch read sees only the
 * last value, so the flavour line would be invisible to the tool — and measuring how long
 * each line actually survives is precisely the interesting part.
 */
function modeHoldScript() {
  const S = {
    created: false,
    createdAtMs: null,
    latched: false,
    latchAtMs: null,
    latchSnapshot: null,
    strips: 0,
    firstStripAtMs: null,
    dismissSeenAtMs: null,
    subtitles: /** @type {{t:number,v:string}[]} */ ([]),
    pcts: /** @type {{t:number,v:string}[]} */ ([]),
  };
  /** @type {any} */ (window).__crHold = { mode: S };

  const MAX = 400;
  const push = (arr, v) => {
    if (arr.length < MAX && (arr.length === 0 || arr[arr.length - 1].v !== v.v)) arr.push(v);
  };

  /** @type {any} */
  let el = null;

  const snap = () => {
    if (!el) return null;
    const q = (s) => el.querySelector(s);
    return {
      cls: [...el.classList],
      ariaBusy: el.getAttribute("aria-busy"),
      title: q(".cr-load__title")?.textContent ?? "",
      kicker: q(".cr-load__kicker")?.textContent ?? "",
      subtitle: q(".cr-load__subtitle")?.textContent ?? "",
      pct: q(".cr-load__pct")?.textContent ?? "",
    };
  };

  const noteText = (node, t) => {
    const p = node.parentElement;
    if (!p || !p.classList) return;
    if (p.classList.contains("cr-load__subtitle")) push(S.subtitles, { t, v: node.data });
    else if (p.classList.contains("cr-load__pct")) push(S.pcts, { t, v: node.data });
  };

  const onMut = (records) => {
    if (!el) return;
    const t = Math.round(performance.now());
    for (const r of records) {
      if (r.type === "childList") {
        for (const n of r.addedNodes) if (n.nodeType === 3) noteText(n, t);
      } else if (r.type === "characterData") {
        noteText(r.target, t);
      }
    }

    const hidden = el.classList.contains("cr-load--hidden");
    const exiting = el.classList.contains("cr-load--exit");

    if (!S.latched) {
      // * The ONE genuine hidden→visible transition: showModeEntryLoading (:399-400).
      if (!hidden && el.getAttribute("aria-busy") === "true") {
        S.latched = true;
        S.latchAtMs = t;
        S.latchSnapshot = snap();
      }
      return;
    }

    if (hidden || exiting) {
      if (S.dismissSeenAtMs == null) S.dismissSeenAtMs = t;
      el.classList.remove("cr-load--hidden", "cr-load--exit");
      S.strips += 1;
      if (S.firstStripAtMs == null) S.firstStripAtMs = t;
    }
  };

  const attach = (node) => {
    el = node;
    S.created = true;
    S.createdAtMs = Math.round(performance.now());
    new MutationObserver(onMut).observe(el, {
      attributes: true,
      attributeFilter: ["class", "aria-busy"],
      childList: true,
      subtree: true,
      characterData: true,
    });
    // * Evaluate the CURRENT state once: if the node was created and shown inside the same
    // * task we discovered it in, no future record would ever carry that transition.
    onMut([]);
  };

  const disco = new MutationObserver(() => {
    const n = document.getElementById("cr-mode-load");
    if (n) {
      disco.disconnect();
      attach(n);
    }
  });
  disco.observe(document, { childList: true, subtree: true });
}

/* ───────────────────────────── page-side reads ─────────────────────────────── */

/** Node-side page functions — the waitForState / readSubject convention from podium.mjs. */
const readBootHold = () => /** @type {any} */ (window).__crHold?.boot ?? null;
const readModeHold = () => /** @type {any} */ (window).__crHold?.mode ?? null;

/** Everything the boot checks need, in one read. */
const readBootSubject = () => {
  const rect = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const n = (v) => Math.round(v * 10) / 10;
    return { top: n(r.top), left: n(r.left), right: n(r.right), bottom: n(r.bottom), width: n(r.width), height: n(r.height) };
  };
  const el = document.getElementById("cr-boot-splash");
  const cs = el ? getComputedStyle(el) : null;
  const q = (s) => document.querySelectorAll(`#cr-boot-splash ${s}`).length;
  const firstSpark = document.querySelector("#cr-boot-splash .cr-bspark");
  const root = document.getElementById("cr-root");
  return {
    present: Boolean(el),
    connected: el ? el.isConnected : false,
    display: cs?.display ?? null,
    opacity: cs?.opacity ?? null,
    visibility: cs?.visibility ?? null,
    zIndex: cs?.zIndex ?? null,
    classes: el ? [...el.classList] : [],
    ariaBusy: el?.getAttribute("aria-busy") ?? null,
    carts: q(".cr-bcart"),
    sparks: q(".cr-bspark"),
    wheels: q(".cr-bwheel"),
    shades: q(".cr-bshades"),
    speed: q(".cr-bspeed"),
    flash: q(".cr-bflash"),
    ring: q(".cr-bring"),
    ground: q(".cr-boot-ground"),
    title: document.querySelector("#cr-boot-splash .cr-boot-title")?.textContent?.trim() ?? "",
    kicker: document.querySelector("#cr-boot-splash .cr-boot-kicker")?.textContent?.trim() ?? "",
    pct: document.getElementById("cr-boot-pct")?.textContent?.trim() ?? "",
    fillWidth: /** @type {any} */ (document.getElementById("cr-boot-fill"))?.style?.width ?? "",
    msg: document.getElementById("cr-boot-msg")?.textContent?.trim() ?? "",
    sparkDisplay: firstSpark ? getComputedStyle(firstSpark).display : null,
    stageRect: rect(document.querySelector("#cr-boot-splash .cr-boot-stage")),
    stripRect: rect(document.querySelector("#cr-boot-splash .cr-boot-strip")),
    titleRect: rect(document.querySelector("#cr-boot-splash .cr-boot-title")),
    // * Evidence for the montage's "held frame over a live app" claim, not decoration:
    // * revealAppShell()/revealAppShellEarly() drop cr-boot-pending and un-hide #cr-root
    // * while this tool is still holding the splash on top of it.
    bodyBootPending: document.body.classList.contains("cr-boot-pending"),
    crRootVisibility: root ? getComputedStyle(root).visibility : null,
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
  };
};

/** Everything the mode checks need, in one read. */
const readModeSubject = () => {
  const rect = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const n = (v) => Math.round(v * 10) / 10;
    return { top: n(r.top), left: n(r.left), right: n(r.right), bottom: n(r.bottom), width: n(r.width), height: n(r.height) };
  };
  const shownEl = (el) => {
    if (!el || !el.isConnected) return false;
    const cs = getComputedStyle(el);
    return cs.display !== "none" && cs.visibility !== "hidden" && Number(cs.opacity) > 0.01;
  };
  const el = document.getElementById("cr-mode-load");
  const boot = document.getElementById("cr-boot-splash");
  const softGl = document.getElementById("cr-softgl-notice");
  const base = {
    bootSplashVisible: shownEl(boot),
    softGlVisible: shownEl(softGl),
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
  };
  if (!el) return { ...base, present: false };

  const cs = getComputedStyle(el);
  const q = (s) => el.querySelector(s);
  const n = (s) => el.querySelectorAll(s).length;
  const fill = q(".cr-load__fill");
  const track = q(".cr-load__track");
  return {
    ...base,
    present: true,
    connected: el.isConnected,
    display: cs.display,
    opacity: cs.opacity,
    visibility: cs.visibility,
    zIndex: cs.zIndex,
    classes: [...el.classList],
    themeClasses: ["classic", "backrooms", "zanzibar", "solo"].filter((t) =>
      el.classList.contains(`cr-load--${t}`),
    ),
    ariaBusy: el.getAttribute("aria-busy"),
    title: q(".cr-load__title")?.textContent?.trim() ?? "",
    kicker: q(".cr-load__kicker")?.textContent?.trim() ?? "",
    subtitle: q(".cr-load__subtitle")?.textContent?.trim() ?? "",
    pct: q(".cr-load__pct")?.textContent?.trim() ?? "",
    ariaValueNow: track?.getAttribute("aria-valuenow") ?? null,
    fillWidthPx: fill ? Math.round(fill.getBoundingClientRect().width * 10) / 10 : 0,
    trackWidthPx: track ? Math.round(track.getBoundingClientRect().width * 10) / 10 : 0,
    decor: {
      visual: n(".cr-load__visual"),
      vinyl: n(".cr-load__vinyl"),
      laser: n(".cr-load__laser"),
      crowdSpan: n(".cr-load__crowd span"),
      furnBox: n(".furn-box"),
      furnChair: n(".furn-chair"),
      chairLeg: n(".furn-chair .chair-leg"),
      seaSun: n(".sea-sun"),
      seaWaterSpan: n(".sea-water span"),
      seaDeck: n(".sea-deck"),
    },
    titleRect: rect(q(".cr-load__title")),
    kickerRect: rect(q(".cr-load__kicker")),
    stageRect: rect(q(".cr-load__stage")),
    meterRect: rect(q(".cr-load__meter")),
    subtitleRect: rect(q(".cr-load__subtitle")),
    stripRect: rect(q(".cr-load__strip")),
  };
};

/**
 * Park every splash animation at `ms` into its own loop and report where each one landed —
 * or, with `ms == null`, report where they are WITHOUT touching them.
 *
 * The read-only mode is not a convenience. Re-inserting an element CANCELS its CSS animations
 * and starts fresh ones, and this tool re-appends the splash every time the app removes it —
 * so a `remove()` landing between the freeze and the screenshot silently un-freezes the scene
 * while the pre-shot reading still says "paused at the beat". That is a green check whose PNG
 * shows something else, i.e. exactly the D-SHEET-1 failure class this whole card exists to
 * avoid. Observed live: at 390×844 the app's `remove()` fired 427ms after the first
 * class-strip, mid-capture, and the `b2-impact` frame came out with both carts still parked at
 * the screen edges while the check read `progress=0.41071`. The caller therefore re-reads with
 * `null` AFTER the screenshot and gates the check on that.
 *
 * Returns the MEASURED phase, so "frozen at the declared beat" is a reading, not a promise.
 */
const freezeBootAt = (ms) => {
  const splash = document.getElementById("cr-boot-splash");
  if (!splash) return { ok: false, reason: "no-splash", n: 0, anims: [] };
  // * CSS ANIMATIONS ONLY — `getAnimations()` also returns CSSTransition objects, and the
  // * splash carries a real one: `#cr-boot-splash { transition: opacity 260ms, visibility
  // * 260ms }` (index.html:93) fires every time this tool strips the app's `cr-load--hidden`.
  // * A transition has no `animationName`, is one-shot rather than `infinite`, and is not part
  // * of the `--boot-loop` master timeline, so parking it at a beat would freeze the splash
  // * at a partial opacity and fail the beat check for a scene that is perfectly fine. Left
  // * alone it settles back to opacity 1, which `held open past its natural dismissal`
  // * independently verifies on the same read.
  const anims = document.getAnimations().filter((a) => {
    const t = /** @type {any} */ (a.effect)?.target;
    const name = /** @type {any} */ (a).animationName;
    return t && splash.contains(t) && typeof name === "string" && name.length > 0;
  });
  if (ms != null) {
    for (const a of anims) {
      try {
        a.pause();
        a.currentTime = ms;
      } catch {
        /* a cancelled/finished animation can refuse — reported via playState below */
      }
    }
  }
  return {
    ok: true,
    reason: null,
    n: anims.length,
    anims: anims.map((a) => {
      const ct = /** @type {any} */ (a.effect)?.getComputedTiming?.() ?? {};
      return {
        name: /** @type {any} */ (a).animationName ?? null,
        duration: typeof ct.duration === "number" ? ct.duration : null,
        progress: typeof ct.progress === "number" ? Math.round(ct.progress * 100000) / 100000 : null,
        currentTime: typeof a.currentTime === "number" ? Math.round(a.currentTime) : null,
        state: a.playState,
      };
    }),
  };
};

/**
 * Strip the two things the DEV SERVER puts on screen that production never has. Both are
 * removed the same way their own dismiss handlers remove them, and neither is app UI:
 *
 *  - `#cr-softgl-notice` — the software-rendering advisory. Fires on every headless cell
 *    (SwiftShader) and is a fixed full-screen backdrop dead centre. Same as sheet.mjs:220-225.
 *  - `#eruda` — the Eruda mobile dev console, CDN-injected 4s after boot behind an
 *    `isLocal` hostname gate (index.html:36-55), so it exists on localhost/LAN and NOWHERE
 *    else. Its floating entry button is a cog in the bottom-right corner; left in, it lands
 *    in every frame on this contact sheet looking exactly like a settings control the game
 *    does not have.
 *
 * Idempotent, and called before EVERY frame rather than once per cell — eruda arrives on a
 * 4000ms timer and the softGL notice can appear at any point during a load.
 */
const clearDevServerChrome = () => {
  document.getElementById("cr-softgl-notice")?.remove();
  document.getElementById("eruda")?.remove();
};

/** Paint yield — two rAFs, the same shape `yieldForPaint` uses (loadingScreen.js:457-463). */
const paintYield = () =>
  new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(undefined))));

/* ───────────────────────────── boot surface ─────────────────────────────── */

/**
 * One boot page load → N frozen beats. All beats share the load: the splash is held open
 * indefinitely, so re-freezing and re-shooting costs a style recalc, not a navigation.
 *
 * @returns {Promise<Record<string, unknown>[]>} One montage card per beat.
 */
async function captureBootLoad(browser, baseUrl, { view, beats, outDir, tally, cssProbe }) {
  const loadId = `boot-${view.w}x${view.h}${view.rm ? "-rm" : ""}${view.touch ? "-touch" : ""}`;
  const label = `loadshots:${loadId}`;
  log(`[load] ${loadId} — ${beats.length} beat(s)`);
  /** @type {Record<string, unknown>[]} */
  const cards = [];

  let context = null;
  try {
    const client = await makeClient(browser, {
      baseUrl,
      label,
      username: "LoadBot",
      // * No `room` → boots to the menu. That is the honest backdrop for a held splash:
      // * the menu comes up underneath it, which is exactly what the banner warns about.
      params: { diag: "1", harness: "1" },
      viewport: { width: view.w, height: view.h },
      ...(view.rm ? { reducedMotion: /** @type {const} */ ("reduce") } : {}),
      ...(view.touch ? { hasTouch: true, isMobile: true } : {}),
      initScripts: [bootHoldScript],
      // * The gate is the HOLD ITSELF: `strips > 0` means the app reached its own dismissal
      // * and this tool blocked it. Waiting for __ccDiag instead would prove the bundle ran
      // * but say nothing about whether the splash we are about to photograph is still the
      // * app's or a corpse we resurrected.
      readyExpr: () => Number(/** @type {any} */ (window).__crHold?.boot?.strips ?? 0) > 0,
      log,
    });
    context = client.context;
    const page = client.page;

    // * Fonts settle before any shot — the splash title is Road Rage and the kicker Goldman
    // * (index.html:409-415); a fallback-font capture is a misleading picture, not a bug.
    await page.evaluate(
      () => Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 5000))]),
    );
    await page.evaluate(clearDevServerChrome);

    // * Drain the app's pending teardown before shooting anything. `readyExpr` returns on the
    // * FIRST class-strip, and `loadingScreen.js:349`'s `splash.remove()` lands 420ms after
    // * that — so without this wait the very first `remove()`/re-append reliably fires inside
    // * the capture loop and costs a retry. This does not replace the post-shutter check
    // * below (`shedBootSplash` can still fire at DOMContentLoaded+3500ms); it just makes the
    // * common case a single pass.
    await sleep(700);

    const hold0 = await page.evaluate(readBootHold);
    tally.check(
      `${loadId} · boot splash present at first paint`,
      hold0?.seenAtMs != null && hold0.seenReadyState === "loading",
      `first seen ${hold0?.seenAtMs}ms into the document, document.readyState="${hold0?.seenReadyState}" `
        + `(="loading" ⇒ the parser was still inside <body> and the module bundle had not run)`,
    );

    // * The floor probe ran page-side at the first rAF, before the ticker's first 200ms tick,
    // * so `bootProgress` was still 0 and __crBootFloor(45) is a real raise rather than a
    // * no-op against a bar the app had already pushed past 45.
    const fp = hold0?.floorProbe;
    tally.check(
      `${loadId} · progress floor honored`,
      fp?.after?.pct === "45%" && fp?.after?.width === "45%" && fp?.after?.aria === "45",
      fp
        ? `__crBootFloor(45) at ${fp.atMs}ms: pct ${fp.before.pct}→${fp.after.pct}, `
          + `fill width ${fp.before.width}→${fp.after.width}, aria-valuenow ${fp.before.aria}→${fp.after.aria}`
        : "the floor probe never ran — window.__crBootFloor was never defined",
    );

    // * One-shot measurement of the CSS recipe this tool deliberately does NOT use. See
    // * BEAT_FREEZE_NOTE. Runs on the first load only; the reading goes in the montage.
    if (cssProbe && cssProbe.result == null) {
      cssProbe.result = await page.evaluate(async (beatMs) => {
        const st = document.createElement("style");
        st.id = "cr-loadshots-cssprobe";
        st.textContent =
          `#cr-boot-splash, #cr-boot-splash * { animation-delay: -${beatMs}ms !important; `
          + "animation-play-state: paused !important; }";
        document.head.appendChild(st);
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(undefined))));
        const splash = document.getElementById("cr-boot-splash");
        const a = document.getAnimations().find((an) => {
          const t = /** @type {any} */ (an.effect)?.target;
          return t && splash?.contains(t) && /** @type {any} */ (an).animationName === "bootTravel";
        });
        const ct = /** @type {any} */ (a?.effect)?.getComputedTiming?.() ?? {};
        const out = {
          found: Boolean(a),
          progress: typeof ct.progress === "number" ? Math.round(ct.progress * 100000) / 100000 : null,
          duration: typeof ct.duration === "number" ? ct.duration : null,
          currentTime: typeof a?.currentTime === "number" ? Math.round(a.currentTime) : null,
          uptimeMs: Math.round(performance.now()),
        };
        st.remove();
        return out;
      }, IMPACT_BEAT.ms);
      const expected = Math.round((IMPACT_BEAT.ms / BOOT_LOOP_MS) * 100000) / 100000;
      cssProbe.expected = expected;
      log(
        `[probe] CSS animation-delay:-${IMPACT_BEAT.ms}ms freeze → bootTravel progress `
          + `${cssProbe.result.progress} (a deterministic -${IMPACT_BEAT.ms}ms would read ${expected}); `
          + `page uptime at probe ${cssProbe.result.uptimeMs}ms, animation currentTime ${cssProbe.result.currentTime}ms`,
      );
    }

    for (const beat of beats) {
      const id = cellId("boot", { ...view, outcome: beat.key });
      const png = resolve(outDir, `${id}.png`);
      /** @type {Record<string, unknown>} */
      const card = {
        id, surface: "boot", beat: beat.key, beatMs: beat.ms,
        w: view.w, h: view.h, rm: Boolean(view.rm), touch: Boolean(view.touch),
        png: `${id}.png`,
      };

      // * Freeze → paint → SHOOT → re-read, and judge the re-read. See the note on
      // * freezeBootAt: a `remove()`/re-append landing inside this window cancels the paused
      // * animations and starts live ones, so only a reading taken AFTER the shutter describes
      // * the pixels on disk. Up to 3 attempts: each `remove()` is a one-shot app action (two
      // * exist in total), so a retry cannot keep losing the same race — and if all three land
      // * off-beat the check FAILS rather than shipping a frame it cannot vouch for.
      const offBeat = (r) =>
        r.n === 0
        || r.anims.some((a) => {
          if (a.state !== "paused") return true;
          if (!a.duration || a.progress == null) return true;
          return Math.abs(a.progress - (beat.ms % a.duration) / a.duration) > BEAT_PROGRESS_EPS;
        });
      let frozen = null;
      let attempts = 0;
      do {
        attempts += 1;
        // eslint-disable-next-line no-await-in-loop
        await page.evaluate(freezeBootAt, beat.ms);
        // eslint-disable-next-line no-await-in-loop
        await page.evaluate(paintYield);
        // eslint-disable-next-line no-await-in-loop
        await page.screenshot({ path: png, fullPage: false });
        // eslint-disable-next-line no-await-in-loop
        frozen = await page.evaluate(freezeBootAt, null);
      } while (view.rm !== true && offBeat(frozen) && attempts < 3);
      card.freezeAttempts = attempts;
      // eslint-disable-next-line no-await-in-loop
      const subject = await page.evaluate(readBootSubject);
      // * Re-read the hold state PER BEAT, not once: `shedBootSplash` fires at
      // * DOMContentLoaded + 3500ms (index.html:1175-1182) and calls `remove()`, which can
      // * land in the middle of this loop — the re-append counter has to reflect that.
      // eslint-disable-next-line no-await-in-loop
      const hold = await page.evaluate(readBootHold);
      card.animCount = frozen.n;
      card.pct = subject.pct;
      card.bodyBootPending = subject.bodyBootPending;
      card.crRootVisibility = subject.crRootVisibility;
      card.strips = hold?.strips ?? 0;
      card.reappends = hold?.reappends ?? 0;

      tally.check(
        `${id} · held open past its natural dismissal`,
        (hold?.strips ?? 0) > 0
          && subject.connected === true
          && subject.opacity === "1"
          && subject.visibility === "visible",
        `${hold?.strips} class-strip(s) (first at ${hold?.firstStripAtMs}ms), `
          + `${hold?.reappends} re-append(s) after remove() (first at ${hold?.firstReappendAtMs}ms) · `
          + `now opacity=${subject.opacity} visibility=${subject.visibility} connected=${subject.connected} `
          + `· underneath: body.cr-boot-pending=${subject.bodyBootPending} #cr-root visibility=${subject.crRootVisibility}`,
      );

      // * .cr-bspark is TEN (index.html:528-537), not eight. Under reduced motion they are
      // * `display: none` (index.html:401) but still in the DOM, so the count holds and the
      // * computed display is what distinguishes the RM tableau.
      tally.check(
        `${id} · crash tableau intact`,
        subject.carts === 2
          && subject.sparks === 10
          && subject.wheels === 4
          && subject.shades === 2
          && subject.flash === 1
          && subject.ring === 1
          && subject.ground === 1
          && subject.title === "CART CLASH"
          && subject.kicker === "THE STORE IS NOW OPENING",
        `carts=${subject.carts}/2 sparks=${subject.sparks}/10 wheels=${subject.wheels}/4 `
          + `shades=${subject.shades}/2 flash=${subject.flash} ring=${subject.ring} ground=${subject.ground} `
          + `title="${subject.title}" kicker="${subject.kicker}" · meter reads ${subject.pct} `
          + `(fill width ${subject.fillWidth}) · spark display=${subject.sparkDisplay}`,
      );

      if (view.rm) {
        // * The splash's own RM branch (index.html:396-405) sets `animation: none !important`
        // * on every moving part and display:none on the FX, parking both carts nose-to-nose
        // * as a static tableau. Zero running animations IS the assertion.
        tally.check(
          `${id} · RM tableau is static`,
          frozen.n === 0 && subject.sparkDisplay === "none",
          `${frozen.n} animation(s) on the splash subtree (want 0 — every one is `
            + `\`animation: none !important\` under prefers-reduced-motion), spark display=${subject.sparkDisplay}`,
        );
      } else {
        const off = frozen.anims.filter((a) => {
          if (a.state !== "paused") return true;
          if (!a.duration || a.progress == null) return true;
          const want = (beat.ms % a.duration) / a.duration;
          return Math.abs(a.progress - want) > BEAT_PROGRESS_EPS;
        });
        const travel = frozen.anims.find((a) => a.name === "bootTravel");
        tally.check(
          `${id} · frozen at the declared beat`,
          frozen.n > 0 && off.length === 0,
          `${frozen.n} splash animation(s) parked at ${beat.ms}ms via ${BEAT_FREEZE_NOTE}; `
            + `${off.length} off-beat. bootTravel progress=${travel?.progress} `
            + `(want ${Math.round((beat.ms / BOOT_LOOP_MS) * 100000) / 100000} = ${beat.ms}/${BOOT_LOOP_MS}ms, `
            + `state=${travel?.state}) · READ BACK AFTER THE SHUTTER, ${attempts} capture attempt(s)`,
        );
        card.travelProgress = travel?.progress ?? null;
      }

      // eslint-disable-next-line no-await-in-loop
      const wrote = await stat(png).then((s) => s.size > 0).catch(() => false);
      tally.check(`${id} · PNG written`, wrote, png);
      cards.push(card);
    }
  } catch (e) {
    tally.markError();
    const msg = e instanceof Error ? e.message : String(e);
    tally.check(`${loadId} · captured`, false, msg);
    cards.push({ id: loadId, surface: "boot", w: view.w, h: view.h, rm: Boolean(view.rm), touch: Boolean(view.touch), error: msg });
  } finally {
    await context?.close().catch(() => {});
  }
  return cards;
}

/* ───────────────────────────── mode surface ─────────────────────────────── */

/**
 * One mode-entry cell → three frames of the SAME held overlay: first-visible, mid-progress,
 * and pinned at the terminal 100% the app leaves behind when it dismisses.
 *
 * @returns {Promise<Record<string, unknown>>}
 */
async function captureModeCell(browser, baseUrl, { arena, cell, outDir, tally }) {
  const id = cellId("mode", { ...cell, outcome: arena });
  const label = `loadshots:${id}`;
  const theme = themeForArena(arena);
  const want = THEME_COPY[theme];
  log(`[cell] ${id} (theme ${theme})`);

  /** @type {Record<string, unknown>} */
  const card = {
    id, surface: "mode", arena, theme,
    w: cell.w, h: cell.h, rm: Boolean(cell.rm), touch: Boolean(cell.touch),
    frames: [`${id}-a-first.png`, `${id}-b-mid.png`, `${id}-c-done.png`],
  };

  let context = null;
  try {
    const client = await makeClient(browser, {
      baseUrl,
      label,
      username: "LoadBot",
      // * The sheet's flags (sheet.mjs:189-197) minus nothing — ?room=solo is what drives
      // * enterPlayMode → withModeEntryLoading (bootstrap.js:430), the SOLE call site.
      params: { room: "solo", diag: "1", perfPump: "1", harness: "1" },
      // * Theme is chosen by levelId alone (loadingScreen.js:388-394), read from storage.
      // * `cartRaveDevUnlocks: "all"` is load-bearing against a PRODUCTION build and a no-op
      // * against the dev server: isDevUnlockAll() (unlockStore.js:60-65) defaults to
      // * import.meta.env.DEV, so a dev server unlocks every arena for free while a prod
      // * bundle does not. Without it, a fresh profile has backrooms/zanzibar LOCKED,
      // * getSavedLevel() clamps the seeded selection back to classic (cart-rave-menu.js:355-360)
      // * and every non-classic cell silently photographs the classic overlay — which reads as
      // * a theme regression when it is really the harness never reaching that branch.
      storage: { cartRaveLevel: arena, cartRaveDevUnlocks: "all" },
      viewport: { width: cell.w, height: cell.h },
      ...(cell.rm ? { reducedMotion: /** @type {const} */ ("reduce") } : {}),
      ...(cell.touch ? { hasTouch: true, isMobile: true } : {}),
      initScripts: [modeHoldScript],
      // * THE LATCH IS THE READY GATE. Returning the instant the app genuinely shows the
      // * overlay is what makes frame A a first-visible frame instead of a late one; and if
      // * it never fires, makeClient times out saying so, which is the honest failure.
      readyExpr: () => Boolean(/** @type {any} */ (window).__crHold?.mode?.latched),
      log,
    });
    context = client.context;
    const page = client.page;

    const hold0 = await page.evaluate(readModeHold);
    tally.check(
      `${id} · mode-entry overlay was shown by the app`,
      hold0?.latched === true && hold0?.latchSnapshot != null,
      hold0?.latched
        ? `latched on the hidden→visible transition at ${hold0.latchAtMs}ms `
          + `(node created at ${hold0.createdAtMs}ms already carrying cr-load--hidden); `
          + `at latch: classes=[${hold0.latchSnapshot?.cls?.join(" ")}] aria-busy=${hold0.latchSnapshot?.ariaBusy} `
          + `title="${hold0.latchSnapshot?.title}" pct=${hold0.latchSnapshot?.pct}`
        : "the app never showed the mode-entry overlay — nothing was captured",
    );

    // * The boot splash (z-index 999999) outranks the mode overlay (loadingScreen.css:271 —
    // * 999995), and in DEV its dismissal chain is ~620ms of macrotasks. Wait it out before
    // * calling anything a first-visible MODE frame, and record how long that took.
    const splashClearStart = Date.now();
    for (;;) {
      // eslint-disable-next-line no-await-in-loop
      const s = await page.evaluate(readModeSubject);
      if (!s.bootSplashVisible || Date.now() - splashClearStart > 4000) break;
      // eslint-disable-next-line no-await-in-loop
      await sleep(60);
    }
    card.splashClearedAfterMs = Date.now() - splashClearStart;

    /** @type {any[]} */
    const frames = [];
    const shoot = async (suffix) => {
      await page.evaluate(clearDevServerChrome);
      await page.evaluate(paintYield);
      const s = await page.evaluate(readModeSubject);
      const p = resolve(outDir, `${id}-${suffix}.png`);
      await page.screenshot({ path: p, fullPage: false });
      frames.push({ suffix, subject: s, path: p });
      return s;
    };

    const frameA = await shoot("a-first");

    // * Mid-progress: hold until the meter has actually moved AND the 1200ms first tip
    // * swap has had its chance (LOAD-TIPS-1), but never past the dismissal —
    // * after that there is no "mid" left to photograph.
    const midStart = Date.now();
    for (;;) {
      // eslint-disable-next-line no-await-in-loop
      const h = await page.evaluate(readModeHold);
      // eslint-disable-next-line no-await-in-loop
      const s = await page.evaluate(readModeSubject);
      const n = Number.parseInt(String(s.pct), 10);
      const elapsed = Date.now() - midStart;
      if (h?.dismissSeenAtMs != null) break;
      if (Number.isFinite(n) && n > 0 && n < 100 && elapsed > 1300) break;
      if (elapsed > 8000) break;
      // eslint-disable-next-line no-await-in-loop
      await sleep(100);
    }
    const frameB = await shoot("b-mid");

    // * Terminal: the app's own dismissal ran (setProgress(100,"Ready") then the exit/hidden
    // * classes this tool strips). Everything after this point is a held frame by definition.
    await waitForState(page, (s) => s?.dismissSeenAtMs != null, {
      read: readModeHold,
      timeout: 120_000,
      interval: 150,
      label: `${label}:dismissal`,
    });
    await sleep(400); // let the app finish its exit-class sequence so the strip count settles
    const frameC = await shoot("c-done");

    const hold = await page.evaluate(readModeHold);
    card.latchAtMs = hold?.latchAtMs ?? null;
    card.dismissSeenAtMs = hold?.dismissSeenAtMs ?? null;
    card.visibleWindowMs =
      hold?.dismissSeenAtMs != null && hold?.latchAtMs != null ? hold.dismissSeenAtMs - hold.latchAtMs : null;
    card.strips = hold?.strips ?? 0;
    card.subtitles = hold?.subtitles ?? [];
    card.pcts = hold?.pcts ?? [];
    card.title = frameC.title;
    card.kicker = frameC.kicker;
    card.subtitle = frameC.subtitle;
    card.pct = frameC.pct;

    tally.check(
      `${id} · theme matches the requested arena`,
      Array.isArray(frameC.themeClasses)
        && frameC.themeClasses.length === 1
        && frameC.themeClasses[0] === theme,
      `classes=[${(frameC.classes || []).join(" ")}] → theme classes [${(frameC.themeClasses || []).join(" ")}], `
        + `expected exactly one: cr-load--${theme} (arena "${arena}")`,
    );

    const sig = DECOR_SIGNATURE[theme];
    const d = frameC.decor || {};
    const decorOk = Object.entries(sig).every(([k, v]) => d[k] === v) && d.visual === 1;
    tally.check(
      `${id} · decor built for ${theme}`,
      decorOk,
      `got ${JSON.stringify(d)} · want ${JSON.stringify(sig)} inside exactly 1 .cr-load__visual`,
    );

    // * Title + kicker are the identity strings: applyTheme writes them once and nothing
    // * overwrites them. (The subtitle is NOT usable for this — see the montage banner.)
    const copyOk =
      frameC.title === want.title
      && frameC.kicker === want.kicker
      && hold0?.latchSnapshot?.title === want.title
      && hold0?.latchSnapshot?.kicker === want.kicker;
    tally.check(
      `${id} · copy belongs to ${theme}`,
      copyOk,
      `title="${frameC.title}" (want "${want.title}") kicker="${frameC.kicker}" (want "${want.kicker}") · `
        + `at latch title="${hold0?.latchSnapshot?.title}" kicker="${hold0?.latchSnapshot?.kicker}"`,
    );

    const pctsOk = frames.every((f) => /^\d+%$/.test(String(f.subject.pct)));
    const firstPct = Number.parseInt(String(frameA.pct), 10);
    const lastPct = Number.parseInt(String(frameC.pct), 10);
    tally.check(
      `${id} · meter renders progress`,
      pctsOk
        && Number.isFinite(firstPct)
        && Number.isFinite(lastPct)
        && lastPct >= firstPct
        && lastPct === 100
        && frameC.fillWidthPx > 0
        && frameC.ariaValueNow === "100",
      `pct ${frameA.pct} → ${frameB.pct} → ${frameC.pct} (aria-valuenow ${frameC.ariaValueNow}), `
        + `fill ${frameC.fillWidthPx}px of a ${frameC.trackWidthPx}px track · `
        // * The full meter timeline, printed whether or not the check passes: it is the only
        // * place the SHAPE of the load is visible. A cold arena build spends nearly all of
        // * its time on one value, which no single frame can show.
        + `every value the meter took: ${JSON.stringify((hold?.pcts ?? []).map((p) => `${p.t}ms ${p.v}`))}`,
    );

    // * LOAD-PROGRESS-1's two regression gates. The timeline above was already printed;
    // * these turn it into checks, because "read the numbers" is exactly how a decorative
    // * meter survived a whole build. Consecutive repeats are collapsed first: assigning
    // * textContent fires a mutation even when the string is identical, so the raw record
    // * list would score a re-paint of "54%" as the meter moving.
    const moves = [];
    for (const p of hold?.pcts ?? []) {
      const n = Number.parseInt(String(p.v), 10);
      if (!Number.isFinite(n)) continue;
      if (moves.length > 0 && moves[moves.length - 1].n === n) continue;
      moves.push({ t: p.t, n });
    }

    const backwards = moves.filter((m, i) => i > 0 && m.n < moves[i - 1].n);
    tally.check(
      `${id} · meter never goes backwards`,
      moves.length > 0 && backwards.length === 0,
      moves.length === 0
        ? "the meter never painted a parseable value — nothing to check"
        : backwards.length === 0
          ? `${moves.length} distinct values, monotonic: ${moves.map((m) => m.n).join(" → ")}`
          : `${backwards.length} backwards step(s): `
            + `${backwards.map((m) => `${moves[moves.indexOf(m) - 1].n}→${m.n} at ${m.t}ms`).join(", ")} · `
            + `full sequence ${moves.map((m) => m.n).join(" → ")}`,
    );

    // * The bug itself: 15% held for 11.5s of a cold arena build while real work ran.
    // * The ambient ticker (loadingScreen.js startModeTicker) is what keeps this green;
    // * a segment that outruns its creep budget saturates below its ceiling and this
    // * check is what says so.
    // * TWO budgets, because the last step is a different phenomenon from the rest.
    // * Everything up to the final milestone is the meter's own job and holds 1500ms. The
    // * terminal step into 100 is not: `onArenaReady` (cart creation + warmupBeforeRoundStart,
    // * bootstrap.js:479-484) blocks the main thread outright, no timer fires inside it, and
    // * no meter design can paint through it — measured, not assumed. Holding that step to
    // * 1500ms measures BOOT-PERF-1 and fails on dev-server slowness (seen at 1593ms), so it
    // * gets its own looser bound. Bounded, not exempt: a genuine multi-second freeze there
    // * still fails, which is the only claim this row can honestly make.
    const MAX_PROGRESS_GAP_MS = 1500;
    const MAX_TERMINAL_GAP_MS = 3000;
    const allGaps = moves
      .map((m, i) => (i > 0 ? { from: moves[i - 1], to: m, dt: m.t - moves[i - 1].t } : null))
      .filter(Boolean);
    const isTerminal = (g) => g.to === moves[moves.length - 1] && g.to.n === 100;
    const gaps = allGaps.filter((g) =>
      g.dt > (isTerminal(g) ? MAX_TERMINAL_GAP_MS : MAX_PROGRESS_GAP_MS),
    );
    const midGaps = allGaps.filter((g) => !isTerminal(g));
    const terminal = allGaps.find(isTerminal);
    tally.check(
      `${id} · no progress gap > ${MAX_PROGRESS_GAP_MS}ms (${MAX_TERMINAL_GAP_MS}ms into 100)`,
      moves.length > 0 && gaps.length === 0,
      moves.length === 0
        ? "the meter never painted a parseable value — nothing to check"
        : gaps.length === 0
          ? `largest mid-load gap ${Math.max(0, ...midGaps.map((g) => g.dt))}ms across ${moves.length} `
            + `values spanning ${moves[moves.length - 1].t - moves[0].t}ms · terminal step into 100 `
            + `${terminal ? `${terminal.from.n}%→100% in ${terminal.dt}ms` : "n/a"}`
          : `${gaps.length} gap(s) over budget: `
            + `${gaps.map((g) => `${g.from.n}%→${g.to.n}% stalled ${g.dt}ms (at ${g.from.t}ms`
              + `${isTerminal(g) ? `, terminal, budget ${MAX_TERMINAL_GAP_MS}ms` : ""})`).join(", ")}`,
    );

    // * Conditional BY DESIGN, and a PASS when the condition is not met: the first tip swap
    // * is a 1200ms timer (LOAD-TIPS-1), so a load that finished sooner never had one.
    // * Per the exit-code contract a not-applicable case must not emit pass:false.
    // * want.messages is LOAD_TIPS (shared); progress labels may also appear on the timeline.
    const seen = (hold?.subtitles ?? []).map((s) => s.v);
    const rotated = seen.filter((v) => want.messages.includes(v));
    const window_ = card.visibleWindowMs;
    const rotationApplicable = typeof window_ === "number" && window_ > 1200;
    tally.check(
      `${id} · message rotation ran`,
      rotationApplicable ? rotated.length > 0 : true,
      rotationApplicable
        ? `${rotated.length} of the ${want.messages.length} load tips appeared across a `
          + `${window_}ms visible window: ${JSON.stringify(rotated)} · full subtitle timeline `
          + `${JSON.stringify(hold?.subtitles ?? [])}`
        : `not applicable — the overlay's own visible window was ${window_}ms, under the 1200ms `
          + `first-swap timer, so no rotation was due. timeline ${JSON.stringify(hold?.subtitles ?? [])}`,
    );

    tally.check(
      `${id} · overlay held past its own dismissal`,
      (hold?.strips ?? 0) > 0
        && frameC.opacity === "1"
        && frameC.visibility === "visible"
        && frameC.connected === true
        && frameC.bootSplashVisible === false
        && frameC.softGlVisible === false,
      `${hold?.strips} class-strip(s) after the app began dismissing at ${hold?.dismissSeenAtMs}ms · `
        + `now opacity=${frameC.opacity} visibility=${frameC.visibility} aria-busy=${frameC.ariaBusy} · `
        + `boot splash visible=${frameC.bootSplashVisible} softGL notice visible=${frameC.softGlVisible}`,
    );

    // * Layout: the shell is a full-bleed screen, so nothing in it should reach past the
    // * frame. This is the check that would catch a Fight Night regression at 390px.
    const overflow = [
      ["title", frameC.titleRect], ["kicker", frameC.kickerRect], ["meter", frameC.meterRect],
      ["subtitle", frameC.subtitleRect], ["strip", frameC.stripRect], ["stage", frameC.stageRect],
    ].filter(([, r]) => r && (r.right > frameC.innerWidth + 1 || r.left < -1 || r.bottom > frameC.innerHeight + 1));
    tally.check(
      `${id} · overlay fits the viewport`,
      overflow.length === 0,
      overflow.length === 0
        ? `all six shell parts inside ${frameC.innerWidth}×${frameC.innerHeight}`
        : `outside ${frameC.innerWidth}×${frameC.innerHeight}: `
          + overflow.map(([k, r]) => `${k} ${JSON.stringify(r)}`).join(" · "),
    );

    const wrote = await Promise.all(
      frames.map((f) => stat(f.path).then((s) => s.size > 0).catch(() => false)),
    );
    tally.check(
      `${id} · all 3 PNGs written`,
      wrote.length === 3 && wrote.every(Boolean),
      frames.map((f) => f.path).join(" + "),
    );
  } catch (e) {
    tally.markError();
    const msg = e instanceof Error ? e.message : String(e);
    tally.check(`${id} · captured`, false, msg);
    card.error = msg;
  } finally {
    await context?.close().catch(() => {});
  }
  return card;
}

/* ───────────────────────────── montage ─────────────────────────────── */

function montageHtml(cards, meta) {
  const bootCards = cards.filter((c) => c.surface === "boot");
  const modeCards = cards.filter((c) => c.surface === "mode");

  const bootBody = bootCards
    .map((c) => `      <div class="card${c.error ? " bad" : ""}">
        <a href="${esc(c.png ?? "")}"><img src="${esc(c.png ?? "")}" alt="${esc(c.id)}" loading="lazy" style="aspect-ratio:auto;object-fit:contain;max-height:460px"></a>
        <div class="cardbody">
          <b>${esc(String(c.beat ?? "").toUpperCase())}</b> <span class="dim">${c.w}×${c.h}${c.rm ? " · RM" : ""}${c.touch ? " · TOUCH" : ""}</span><br>
          <span class="chip">t=${esc(String(c.beatMs ?? "?"))}ms of ${BOOT_LOOP_MS}ms</span>
          <span class="chip">${Number(c.animCount ?? 0)} anim paused</span>
          ${c.travelProgress != null ? `<span class="chip">bootTravel ${esc(String(c.travelProgress))}</span>` : ""}
          ${Number(c.freezeAttempts ?? 1) > 1 ? `<span class="chip warn">re-shot ×${Number(c.freezeAttempts)}</span>` : ""}
          <span class="chip">meter ${esc(String(c.pct ?? "?"))}</span>
          <span class="chip warn">held: ${Number(c.strips ?? 0)} strip / ${Number(c.reappends ?? 0)} re-append</span><br>
          <span class="dim">underneath — body.cr-boot-pending=${esc(String(c.bodyBootPending))} · #cr-root visibility=${esc(String(c.crRootVisibility))}</span><br>
          ${c.error ? `<span class="err">${esc(c.error)}</span><br>` : ""}
          <a href="${esc(c.png ?? "")}">open</a>
        </div>
      </div>`)
    .join("\n");

  const modeBody = modeCards
    .flatMap((c) => {
      if (c.error) {
        return [`      <div class="card bad"><div class="cardbody"><b>${esc(c.id)}</b><br><span class="err">${esc(c.error)}</span></div></div>`];
      }
      const names = ["a-first", "b-mid", "c-done"];
      const labels = ["FIRST VISIBLE", "MID PROGRESS", "TERMINAL 100% (HELD)"];
      return names.map((n, i) => {
        const file = `${c.id}-${n}.png`;
        return `      <div class="card">
        <a href="${esc(file)}"><img src="${esc(file)}" alt="${esc(file)}" loading="lazy" style="aspect-ratio:auto;object-fit:contain;max-height:460px"></a>
        <div class="cardbody">
          <b>${esc(labels[i])}</b> <span class="dim">${esc(c.theme)} · ${esc(c.arena)} · ${c.w}×${c.h}${c.rm ? " · RM" : ""}${c.touch ? " · TOUCH" : ""}</span><br>
          <span class="chip">${esc(c.title ?? "")}</span>
          <span class="chip">visible window ${esc(String(c.visibleWindowMs ?? "?"))}ms</span>
          <span class="chip warn">held: ${Number(c.strips ?? 0)} strip</span>
          <span class="chip">splash cleared +${esc(String(c.splashClearedAfterMs ?? "?"))}ms</span><br>
          <span class="dim">${esc(c.kicker ?? "")}</span><br>
          ${i === 2 ? `<span class="dim">subtitle timeline: ${esc(JSON.stringify((c.subtitles ?? []).map((s) => `${s.t}ms "${s.v}"`)))}</span><br>` : ""}
          <a href="${esc(file)}">open</a>
        </div>
      </div>`;
      });
    })
    .join("\n");

  const cardsHtml = [
    modeBody ? `      <div style="grid-column:1/-1"><h2 style="margin:18px 0 2px;font-size:15px;letter-spacing:2px">MODE-ENTRY OVERLAY</h2><div class="stamp">src/ui/loadingScreen.js + loadingScreen.css — three arena themes, three frames each</div></div>` : "",
    modeBody,
    bootBody ? `      <div style="grid-column:1/-1"><h2 style="margin:26px 0 2px;font-size:15px;letter-spacing:2px">BOOT SPLASH</h2><div class="stamp">index.html inline markup :419-553 + inline CSS :59-406 — the crash tableau, frozen beat by beat</div></div>` : "",
    bootBody,
  ]
    .filter(Boolean)
    .join("\n");

  const probeLine = meta.cssProbe?.result
    ? `      <br><br>
      <b>Measured, not assumed — why the beats are frozen with the Web Animations API.</b> The
      obvious recipe is <code>animation-delay: -${IMPACT_BEAT.ms}ms !important; animation-play-state:
      paused !important</code>. This run measured it: applying that CSS left
      <code>bootTravel</code> at progress <b>${esc(String(meta.cssProbe.result.progress))}</b>, where a
      genuine &minus;${IMPACT_BEAT.ms}ms freeze reads <b>${esc(String(meta.cssProbe.expected))}</b>
      (page uptime at the probe was ${esc(String(meta.cssProbe.result.uptimeMs))}ms). Changing
      <code>animation-delay</code> on an already-running animation shifts the effect's delay but not
      the animation's start time, so the frozen phase is <code>(now − startTime) + delay</code> and
      drifts a whole loop every 2.8s of boot jitter. Every frame here instead uses
      <code>anim.pause(); anim.currentTime = beat</code>, and each cell's
      <code>bootTravel</code> chip is the measured phase.`
    : "";

  return montagePage({
    title: "loading screens contact sheet",
    stamp: `${esc(meta.when)} · ${cards.length} cell(s) · ${modeCards.length} mode + ${bootCards.length} boot · arenas: ${esc(meta.arenas)}`,
    banner: `      <b>EVERY FRAME ON THIS PAGE IS A HELD FRAME, NOT A NATURAL ONE.</b> Both loading screens
      dismiss themselves in well under a second, so this tool does not catch them — it pins them
      open. A MutationObserver armed before navigation strips the hiding classes as the app adds
      them (<code>cr-load--exit</code> / <code>cr-load--hidden</code>) and re-appends the boot
      splash when the app calls <code>remove()</code> on it — which it does from
      <b>two independent paths</b> (<code>loadingScreen.js:349</code> and
      <code>index.html:1053</code>). The app is not paused or patched: its dismissal promises
      still resolve, the round still starts. <b>So these frames sit on top of a LIVE app</b> —
      <code>revealAppShell()</code> has already dropped <code>body.cr-boot-pending</code> and made
      the menu visible <i>underneath</i> the splash you are looking at. Each card prints the
      <code>cr-boot-pending</code> / <code>#cr-root visibility</code> state it was captured in.
      <br><br>
      <b>The mode-entry observer latches; it does not just strip.</b>
      <code>ensureModeOverlay()</code> creates <code>#cr-mode-load</code> early, already carrying
      <code>cr-load--hidden</code> and with no theme applied. Stripping <i>that</i> would produce a
      blank shell that passes an "overlay is visible" check while showing no loading screen at all.
      The observer therefore waits for the app's own hidden→visible transition
      (<code>showModeEntryLoading</code>) and only holds afterwards — so a green row here means
      the app genuinely showed this screen.
      <br><br>
      <b>The subtitle line is not a theme signature — read the title and kicker instead.</b> The
      rotating load tips (LOAD-TIPS-1, shared pool, 1200ms first swap) teach rules, but every
      <code>reportProgress()</code> milestone (<code>bootstrap.js:431-476</code>) overwrites the
      same element with a generic label, and the dismissal ends on <code>"Ready"</code>. The
      per-cell subtitle timeline on the TERMINAL card shows exactly how long each tip
      survived. Identity is asserted on <code>.cr-load__title</code> /
      <code>.cr-load__kicker</code>, which <code>applyTheme</code> writes once.
      <br><br>
      <b>The boot meter reads 100% on these frames, and that is honest.</b>
      <code>dismissInitialBootSplash</code> writes the bar to 100% directly before the fade, and
      in DEV <code>MIN_BOOT_MS</code> is 0 — so by the time any external tool can act, the meter is
      already terminal. The <code>progress floor honored</code> check proves the meter tracks
      <code>window.__crBootFloor</code> by driving it 0→45% page-side at the first frame, before
      the inline ticker's first tick.
      <br><br>
      <b>UNVERIFIED — the production boot hold.</b> <code>MIN_BOOT_MS</code> is
      <code>DEV ? 0 : returning ? 1300 : 1600</code> (<code>loadingScreen.js:318</code>). This tool
      runs against the dev server, so it can show what the splash <i>looks like</i> but can never
      show that the production hold arithmetic is right. That is a three-line branch and belongs in
      <code>tests/loadingScreenGate.test.js</code>, not in a screenshot — it is
      <b>not covered by any check row on this page</b>, deliberately.
      <br><br>
      Cells run headless with no GPU flags (SwiftShader), and the mode overlay picks its flavour
      line with <code>Math.random()</code> with no gameplay RNG seed anywhere in this repo, so
      <b>image diffs can never gate this tool</b>. The DOM assertions are the gate.${probeLine}`,
    cardsHtml,
    footer: "Generated by <code>npm run loadshots</code> (tools/loadshots.mjs) — FIGHT-VERIFY-1 Phase C.",
  });
}

/* ───────────────────────────── main ─────────────────────────────── */

async function main() {
  const args = parseArgs(normalizeArgv(process.argv.slice(2)));
  const baseUrl = str(args.url) || `http://127.0.0.1:${CLIENT_PORT}/`;
  const outDir = resolve(str(args.out) || resolve(CAPTURE_DIR, "loadshots"));
  const surface = (str(args.surface) || "both").toLowerCase();
  if (!["boot", "mode", "both"].includes(surface)) {
    log(`bad --surface "${surface}" (want boot, mode or both)`);
    process.exit(2);
  }
  const arenas = (str(args.arenas) || MODE_ARENAS.join(","))
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  let viewports = MODE_VIEWPORTS;
  let bootViewports = BOOT_VIEWPORTS;
  if (str(args.viewports)) {
    const vs = parseViewports(/** @type {string} */ (str(args.viewports)));
    viewports = vs;
    bootViewports = vs;
  }

  /** Mode cells: every arena × every viewport, plus one RM and one touch cell. */
  const modeCells = [];
  if (surface !== "boot") {
    for (const arena of arenas) {
      for (const v of viewports) modeCells.push({ arena, ...v });
    }
    // * RM earns its place: dismissModeEntryLoading finishes INSTANTLY under reduced motion
    // * (loadingScreen.js:436-439) — a window this tool's hold is the only way to see — and
    // * loadingScreen.css kills every decor animation. classic has the most to kill.
    modeCells.push({ arena: arenas[0] ?? "classicRecord", w: 1920, h: 1080, rm: true });
    // * Touch on a second theme, so the coarse-pointer layout gets free theme coverage.
    modeCells.push({ arena: arenas[1] ?? arenas[0] ?? "classicRecord", w: 390, h: 844, touch: true });
  }

  /** Boot loads: one page load per viewport carries all five beats. */
  const bootLoads = [];
  if (surface !== "mode") {
    for (const v of bootViewports) bootLoads.push({ view: v, beats: BOOT_BEATS });
    bootLoads.push({ view: { ...bootViewports[0], rm: true }, beats: [{ key: "rm-static", ms: 0 }] });
    bootLoads.push({
      view: { ...(bootViewports[1] ?? bootViewports[0]), touch: true },
      beats: [IMPACT_BEAT],
    });
  }

  const tally = new CheckTally("loadshots", log);
  let devProc = null;
  let browser = null;
  /** @type {Record<string, unknown>[]} */
  const cards = [];
  /** @type {{ result: any, expected: number | null }} */
  const cssProbe = { result: null, expected: null };

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

    const bootCellCount = bootLoads.reduce((n, l) => n + l.beats.length, 0);
    log(
      `${modeCells.length} mode cell(s) × 3 frames + ${bootCellCount} boot cell(s) `
        + `from ${bootLoads.length} load(s) → ${outDir}`,
    );

    for (const cell of modeCells) {
      // eslint-disable-next-line no-await-in-loop
      cards.push(await captureModeCell(browser, baseUrl, { arena: cell.arena, cell, outDir, tally }));
    }
    for (const load of bootLoads) {
      // eslint-disable-next-line no-await-in-loop
      cards.push(...(await captureBootLoad(browser, baseUrl, { ...load, outDir, tally, cssProbe })));
    }

    const indexPath = resolve(outDir, "index.html");
    await writeFile(
      indexPath,
      montageHtml(cards, { when: new Date().toISOString(), arenas: arenas.join(", "), cssProbe }),
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
  console.error("[loadshots] fatal:", err instanceof Error ? err.stack : err);
  process.exit(2);
});
