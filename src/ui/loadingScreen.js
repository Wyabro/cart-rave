/**
 * Cart Clash loading screens — initial boot splash + mode-entry overlay.
 */

import "./styles/tokens.css";
import "./loadingScreen.css";
import { resolveLevelId, LEVEL_STORAGE_KEY } from "../levels/index.js";
import { storageGet, storageSet, STORAGE_KEYS } from "../utils/storage.js";
import { onBootPhase, readBootTimeline } from "../utils/bootTimeline.js";

const MODE_OVERLAY_ID = "cr-mode-load";
const FADE_MS = 420;
/** Minimum time the mode-entry overlay stays up so cold paths remain visible. */
const MIN_MODE_ENTRY_VISIBLE_MS = 720;
/** Warm same-level path: skip most of the artificial floor (brand flash only). */
const MIN_MODE_ENTRY_WARM_MS = 200;

/**
 * Kickers are the store voice the rest of the redesign speaks in ("WEEKLY
 * RESTOCK", "STORE POLICY · ALL SALES FINAL", "THE STORE IS NOW CLOSED") — a
 * loading screen is the store getting an aisle ready for you.
 * @type {Record<"classic" | "backrooms" | "zanzibar", { title: string, kicker: string, subtitle: string, progress: string, messages: string[] }>}
 */
const THEME_COPY = {
  classic: {
    title: "CART RAVE",
    kicker: "RESTOCKING THE DANCE FLOOR",
    subtitle: "Spinning up the vinyl arena...",
    progress: "Loading crowd & lights...",
    messages: [
      "Polishing the disco ball...",
      "Syncing strobe lights...",
      "Untangling audio cables...",
      "Warming up the subwoofers...",
      "Aligning vinyl grooves...",
      "Charging neon tubes...",
      "Mixing the bass drop...",
      "Setting up the smoke machines...",
      "Calibrating laser grids...",
      "Finding the perfect BPM...",
    ],
  },
  backrooms: {
    title: "THE STOREROOMS",
    kicker: "AISLE INVENTORY IN PROGRESS",
    subtitle: "The fluorescent hum grows louder...",
    progress: "Mapping the liminal aisles...",
    messages: [
      "Mopping the linoleum...",
      "Replacing flickering bulbs...",
      "Avoiding eye contact...",
      "Humming along to the buzz...",
      "Wandering the aisles...",
      "Stocking empty shelves...",
      "Lost in the backrooms...",
      "Checking expiration dates...",
      "Wiping down glass doors...",
      "Following the yellow line...",
    ],
  },
  zanzibar: {
    title: "SUNDIAL STATION",
    kicker: "OPENING THE SUNDECK",
    subtitle: "The tide carries the bassline in...",
    progress: "Aligning the gnomon...",
    messages: [
      "Waxing the sundeck...",
      "Bolting down the bollards...",
      "Chasing gulls off the podium...",
      "Watching the sun refuse to set...",
      "Salting the guard rails...",
      "Untangling the horizon...",
      "Warming up the water glints...",
      "Checking the tide tables...",
      "Polishing the kill edges...",
      "Aiming the deck at the sunset...",
    ],
  },
};

let modeOverlayEl = null;
let modeTitleEl = null;
let modeKickerEl = null;
let modeSubtitleEl = null;
let modeVisualSlot = null;
let modeEntryVisible = false;
/** Resolvers waiting for the mode-entry overlay to finish dismissing. */
let modeEntryHiddenWaiters = [];
let bootDismissed = false;
// * Increments on every show — a dismiss's delayed finish() compares generations so a
// * re-show during the ~600ms fade window can't be clobbered by the stale dismissal
// * (which would also prematurely flush the NEW session's modeEntryHiddenWaiters,
// * releasing the solo-countdown gate while loading is still in flight).
let modeEntryShowGen = 0;
/** Nested mode-entry tasks share one overlay (level switch + play bootstrap). */
let modeEntryDepth = 0;
/** @type {number} */
let modeEntryShownAt = 0;
/** @type {number | null} */
let modeMsgIntervalId = null;

/* ── Mode-entry progress: monotonic floor + ambient ticker (LOAD-PROGRESS-1) ── */

/**
 * Current meter value, fractional. The floor: {@link setProgress} ignores anything
 * below it, exactly like the boot splash's `window.__crBootFloor`
 * (`index.html:597-608`, BOOT-METER-1) — *"Floor only goes up."*
 *
 * Without it `bootstrap.js:463`'s 88 paints over `levels/index.js:154`'s 90 on the
 * world-warm-but-arena-stale path and the bar visibly steps backwards.
 * @type {number}
 */
let modeProgressValue = 0;
/** @type {number | null} */
let modeTickerId = null;
/** Unsubscribe for the live boot-phase listener; null when not subscribed. */
let modeBootPhaseOff = /** @type {(() => void) | null} */ (null);

/**
 * Every value the mode-entry meter is known to land on — the real reports
 * (`bootstrap.js` 5/15/88/94/100, `main.js:1719` 96) plus {@link BOOT_PHASE_ANCHORS}.
 * The ticker creeps toward the next entry above the current value and stops one point
 * short, so ambient motion can never claim a milestone that has not happened.
 */
const MODE_PROGRESS_ANCHORS = [0, 5, 15, 20, 55, 78, 85, 88, 94, 96, 100];

/**
 * Boot phases that bracket the cold-arena silence, mapped to meter values.
 *
 * `bootstrap.js` reports 15 and then nothing until 88 — everything between is one
 * un-awaited `ensureWorldBootstrapped` flight (Rapier WASM, PMREM bake, level chunk,
 * the synchronous `initArena`, shader warm). These four marks already fire at the seams
 * inside that window, so the meter can track real work without any new instrumentation
 * and without threading a reporter through the bootstrap promise.
 *
 * `idle-shader-*` dominates the window and varies 1.7–4.2s by machine (main.js:2878).
 * @type {Record<string, number>}
 */
const BOOT_PHASE_ANCHORS = {
  "world-init-start": 20,
  "idle-shader-start": 55,
  "idle-shader-end": 78,
  "world-ready": 85,
};

/** Ambient ticker cadence, matching the boot splash's 200ms (`index.html:588`). */
const MODE_TICK_MS = 200;
/** Ticks a full segment is paced to fill (~10s) before it saturates below its ceiling. */
const MODE_TICKS_PER_SEGMENT = 50;
/**
 * Floor on the per-tick step, so a nearly-filled segment still repaints a whole point
 * every ~400ms instead of decaying into stillness. Tuned, not guessed: at 0.2 the last
 * band (96 → the 100 cap) changed its ROUNDED text only once a second, which stacked
 * on top of the shader-warm block and put the tail over the loadshots gap gate.
 */
const MODE_MIN_TICK_STEP = 0.5;

/**
 * The next known anchor strictly above `value` — the ticker's ceiling.
 * @param {number} value
 * @returns {number}
 */
function nextProgressAnchor(value) {
  for (const anchor of MODE_PROGRESS_ANCHORS) {
    if (anchor > value) return anchor;
  }
  return 100;
}

function prefersReducedMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/* ── Mode-entry theme visual builders ── */

function buildClassicDecor() {
  const wrap = document.createElement("div");
  wrap.className = "cr-load__visual";
  wrap.innerHTML =
    '<div class="cr-load__lasers" aria-hidden="true">' +
    '<div class="cr-load__laser"></div><div class="cr-load__laser"></div><div class="cr-load__laser"></div>' +
    "</div>" +
    '<div class="cr-load__vinyl" aria-hidden="true"></div>' +
    '<div class="cr-load__crowd" aria-hidden="true">' +
    "<span></span><span></span><span></span><span></span><span></span>" +
    "</div>";
  return wrap;
}

function buildBackroomsDecor() {
  const wrap = document.createElement("div");
  wrap.className = "cr-load__visual cr-load__furniture";
  wrap.innerHTML = 
    '<div class="furn-box b1"></div>' +
    '<div class="furn-box b2"></div>' +
    '<div class="furn-box b3"></div>' +
    '<div class="furn-chair">' +
    '  <div class="chair-back"></div>' +
    '  <div class="chair-seat"></div>' +
    '  <div class="chair-leg left"></div>' +
    '  <div class="chair-leg right"></div>' +
    '</div>';
  return wrap;
}

function buildZanzibarDecor() {
  const wrap = document.createElement("div");
  wrap.className = "cr-load__visual cr-load__seaside";
  wrap.innerHTML =
    '<div class="sea-sun" aria-hidden="true"></div>' +
    '<div class="sea-water" aria-hidden="true"><span></span><span></span><span></span></div>' +
    '<div class="sea-deck" aria-hidden="true"></div>';
  return wrap;
}

function ensureModeOverlay() {
  if (modeOverlayEl) return modeOverlayEl;

  modeOverlayEl = document.createElement("div");
  modeOverlayEl.id = MODE_OVERLAY_ID;
  modeOverlayEl.className = "cr-load cr-load--hidden";
  modeOverlayEl.setAttribute("aria-live", "polite");
  modeOverlayEl.setAttribute("aria-busy", "false");
  // * Shell geometry, mirroring `.cr-screen`: header top-left (Road Rage title
  // * over a Goldman kicker), centre stage for the arena decor, full-bleed strip
  // * along the bottom carrying the progress slab and the rotating line.
  modeOverlayEl.innerHTML =
    '<div class="cr-load__bg"></div>' +
    '<div class="cr-load__vignette"></div>' +
    '<div class="cr-load__shell">' +
    '<div class="cr-load__hd">' +
    '<div class="cr-load__kicker"></div>' +
    '<div class="cr-load__title"></div>' +
    "</div>" +
    '<div class="cr-load__stage"></div>' +
    '<div class="cr-load__strip">' +
    '<div class="cr-load__meter">' +
    '<div class="cr-load__meter-inner">' +
    '<span class="cr-load__meter-label">STOCKING</span>' +
    '<div class="cr-load__track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">' +
    '<span class="cr-load__fill"></span>' +
    "</div>" +
    '<span class="cr-load__pct">0%</span>' +
    "</div>" +
    "</div>" +
    '<div class="cr-load__subtitle"></div>' +
    "</div>" +
    "</div>";

  modeTitleEl = modeOverlayEl.querySelector(".cr-load__title");
  modeKickerEl = modeOverlayEl.querySelector(".cr-load__kicker");
  modeSubtitleEl = modeOverlayEl.querySelector(".cr-load__subtitle");
  // * The stage IS the decor slot — applyTheme() swaps its children per arena.
  modeVisualSlot = modeOverlayEl.querySelector(".cr-load__stage");

  document.body.appendChild(modeOverlayEl);
  return modeOverlayEl;
}

/**
 * Unconditional DOM write. Only {@link setProgress} may call it — everything else must
 * go through the floor.
 * @param {number} clamped 0–100, already clamped
 * @param {string} [label]
 */
function paintProgress(clamped, label) {
  const rounded = Math.round(clamped);
  const track = modeOverlayEl?.querySelector(".cr-load__track");
  const fill = modeOverlayEl?.querySelector(".cr-load__fill");
  const pctEl = modeOverlayEl?.querySelector(".cr-load__pct");
  if (track) track.setAttribute("aria-valuenow", rounded.toString());
  if (fill instanceof HTMLElement) fill.style.width = `${clamped}%`;
  if (pctEl) pctEl.textContent = `${rounded}%`;
  if (label && modeSubtitleEl) {
    modeSubtitleEl.textContent = label;
  }
}

/**
 * Raises the meter to `pct`, never lowers it (see {@link modeProgressValue}).
 * A below-floor call still gets its label — the status line is not the bar, and
 * swallowing it would mute `bootstrap.js:463`'s "Warming physics…" on the stale path.
 * @param {number} pct
 * @param {string} [label]
 */
function setProgress(pct, label) {
  const clamped = Math.max(0, Math.min(100, pct));
  if (clamped < modeProgressValue) {
    if (label && modeSubtitleEl) modeSubtitleEl.textContent = label;
    return;
  }
  modeProgressValue = clamped;
  paintProgress(clamped, label);
}

/**
 * Reports real loading progress to the mode-entry overlay.
 *
 * The milestones are `bootstrap.js`'s (5 preparing → 15 building → 88 physics →
 * 94 carts → `main.js:1719` 96 → 100), plus `levels/index.js`'s 20/60/90 on the paths
 * that forward a reporter. NOTE that `levels/index.js`'s 60 (`:112`) can never render:
 * `:154`'s 90 follows it with no await in between — `initFn` is fully synchronous — so
 * the browser never gets a paint between the two writes. The gaps between the values
 * that DO render are covered by the ambient ticker and the boot-phase anchors, not by
 * more reports.
 * @param {number} pct 0–100 progress percentage
 * @param {string} [label] Human-readable milestone label
 */
function reportProgress(pct, label) {
  setProgress(pct, label);
}

/**
 * Ambient creep between real milestones — the mode-entry twin of the boot splash's
 * fake ticker (`index.html:588-596`). The splash gets away with one hardcoded 90 cap;
 * this overlay has many more anchors, so each segment gets its own ceiling and the bar
 * stops one point below it. Only a real report (or dismissal) crosses an anchor.
 * @returns {void}
 */
function startModeTicker() {
  stopModeTicker();
  let lastTickAt = performance.now();
  modeTickerId = window.setInterval(() => {
    const now = performance.now();
    // * Advance by WALL CLOCK, not by one step per callback. The heaviest stretch of a
    // * cold entry (cart creation + `warmupBeforeRoundStart`, between the 96 and 100
    // * reports) blocks the main thread outright, and a starved interval fires once on
    // * release having lost every tick it slept through. Stepping by elapsed time makes
    // * that first callback repaint immediately instead of ~400ms later, which is the
    // * difference between the tail reading as a pause and reading as a freeze.
    const ticks = Math.max(1, Math.round((now - lastTickAt) / MODE_TICK_MS));
    lastTickAt = now;
    const ceiling = nextProgressAnchor(modeProgressValue);
    // * One point short: landing ON the ceiling would assert a milestone that has not
    // * fired — and at the top of the ladder that milestone is 100 ("Ready!"), which
    // * only bootstrap.js:484 / dismissModeEntryLoading may claim.
    const cap = ceiling - 1;
    if (modeProgressValue >= cap) return;
    const span = ceiling - modeProgressValue;
    // * Deterministic, unlike the splash's `Math.random() * 8`: this meter is a gate
    // * subject (`tools/loadshots.mjs` asserts a max gap between painted values), and
    // * random pacing would make that check flaky for no visible gain.
    const step = Math.max(span / MODE_TICKS_PER_SEGMENT, MODE_MIN_TICK_STEP) * ticks;
    setProgress(Math.min(modeProgressValue + step, cap));
  }, MODE_TICK_MS);
}

/** @returns {void} */
function stopModeTicker() {
  if (modeTickerId != null) {
    window.clearInterval(modeTickerId);
    modeTickerId = null;
  }
}

/* ── Mode-entry message rotation ── */

function startModeMessageRotation(messages) {
  stopModeMessageRotation();
  if (!messages || messages.length === 0) return;
  let last = pickRandom(messages);
  if (modeSubtitleEl) modeSubtitleEl.textContent = last;
  const nextMessage = () => {
    if (messages.length < 2) return last;
    let pick = last;
    while (pick === last) pick = pickRandom(messages);
    last = pick;
    return pick;
  };
  // * First swap comes early so loads that outlive the 720ms floor still show a
  // * second line; the steady cadence stays readable after that. Fast paths
  // * (<1s) are unchanged — they never reach the first swap.
  const rotate = (delay) => {
    modeMsgIntervalId = window.setTimeout(() => {
      if (modeSubtitleEl) modeSubtitleEl.textContent = nextMessage();
      rotate(1600);
    }, delay);
  };
  rotate(1000);
}

function stopModeMessageRotation() {
  if (modeMsgIntervalId != null) {
    window.clearTimeout(modeMsgIntervalId);
    modeMsgIntervalId = null;
  }
}

/**
 * @param {"classic" | "backrooms" | "zanzibar"} theme
 */
function applyTheme(theme) {
  ensureModeOverlay();
  modeOverlayEl.classList.remove("cr-load--solo", "cr-load--classic", "cr-load--backrooms", "cr-load--zanzibar");
  modeOverlayEl.classList.add(`cr-load--${theme}`);

  const copy = THEME_COPY[theme] || THEME_COPY.classic;
  if (modeTitleEl) modeTitleEl.textContent = copy.title;
  if (modeKickerEl) modeKickerEl.textContent = copy.kicker;

  if (modeVisualSlot) {
    modeVisualSlot.replaceChildren();
    const decor =
      theme === "backrooms"
        ? buildBackroomsDecor()
        : theme === "zanzibar"
          ? buildZanzibarDecor()
          : buildClassicDecor();
    modeVisualSlot.appendChild(decor);
  }

  startModeMessageRotation(copy.messages);
}

export function revealGameCanvas() {
  document.body.classList.remove("cr-boot-pending");
  const canvas = document.getElementById("game");
  if (canvas) canvas.style.opacity = "1";
}

/** @returns {any} */
function revealAppShell() {
  document.body.classList.remove("cr-boot-pending");
  const root = document.getElementById("cr-root");
  const canvas = document.getElementById("game");
  if (root) root.style.visibility = "visible";
  if (canvas) canvas.style.opacity = "1";
}

/**
 * Cap-200: whether the deferred boot-splash finish may call CartRave.show().
 * Returns false when play already hid #cr-root (or root is missing) so a late
 * show() cannot resurrect the DOM while menuVisible stays false.
 * @param {HTMLElement | null} [root]
 * @returns {boolean}
 */
export function shouldBootRevealMenu(root = document.getElementById("cr-root")) {
  if (!root) return false;
  return getComputedStyle(root).display !== "none";
}

export function dismissInitialBootSplash() {
  if (bootDismissed) return;
  bootDismissed = true;

  // * Production holds the splash so the crash animation reads as intentional;
  // * dev skips the hold — the app is typically ready in <1s and the wait only
  // * slows iteration. Returning players get a shorter hold: the crash impact
  // * finishes at 46% of the 2800ms loop (~1290ms), so 1300ms keeps the crash
  // * beat while dropping ~1.7s of artificial wait on every repeat launch.
  const returning = storageGet(STORAGE_KEYS.bootSeen) === "1";
  // * First visit still shows the crash beat (~1.3s of the loop) plus a short brand
  // * hold; 3s was pure friction after assets were already ready.
  const MIN_BOOT_MS = import.meta.env.DEV ? 0 : returning ? 1300 : 1600;
  const elapsed = performance.now() - (window.bootStartTime || 0);
  const delay = Math.max(0, MIN_BOOT_MS - elapsed);

  setTimeout(() => {
    // 1. Stop the inline fake progress & msg timers
    // @ts-ignore
    if (window.bootTimer) { clearInterval(window.bootTimer); window.bootTimer = null; }
    // @ts-ignore
    if (window.bootMsgTimer) { clearInterval(window.bootMsgTimer); window.bootMsgTimer = null; }

    // 2. Force to 100% through the inline floor (BOOT-METER-1). Direct DOM writes used
    // * to leave bootProgress stale; noteBootMilestone(75/90) then painted backwards.
    // @ts-ignore — defined by the inline boot script in index.html.
    const bootFloor = window.__crBootFloor;
    if (typeof bootFloor === "function") {
      bootFloor(100);
    } else {
      const bar = document.getElementById('boot-seg-bar');
      if (bar) bar.setAttribute('aria-valuenow', '100');
      const bootFill = document.getElementById('cr-boot-fill');
      if (bootFill instanceof HTMLElement) bootFill.style.width = '100%';
      const bootPct = document.getElementById('cr-boot-pct');
      if (bootPct) bootPct.textContent = '100%';
    }

    // 3. Wait 200ms so the user sees it hit 100%, then fade out cleanly
    setTimeout(() => {
      const splash = document.getElementById('cr-boot-splash');
      if (splash) {
        splash.setAttribute('aria-busy', 'false');
        splash.classList.add('cr-load--exit', 'cr-load--hidden');
      }
      setTimeout(() => {
        revealAppShell();
        // * Cap-200: commitMenuHiddenForGame may have already CartRave.hide()'d;
        // * unconditional show() resurrects DOM while menuVisible stays false (false green).
        if (shouldBootRevealMenu()) window.CartRave?.show?.();
        if (splash) splash.remove();
        storageSet(STORAGE_KEYS.bootSeen, "1");
        // * Best-effort music start as the menu appears — succeeds where the
        // * browser's autoplay policy allows (e.g. returning users with media
        // * engagement); otherwise the first-gesture unlock in main.js covers it.
        window.__cartRaveTryStartMenuMusic?.();
      }, 420);
    }, 200);
  }, delay);
}

/**
 * Raises the boot splash bar to at least `pct` when a real milestone lands
 * (bundle parsed, cart GLB prefetched, menu wired). The inline fake ticker in
 * index.html keeps ambient motion between milestones; this only floors it so
 * the bar tracks actual readiness instead of pure decoration.
 * @param {number} pct
 */
export function noteBootMilestone(pct) {
  // * Gate on the splash ELEMENT, not bootDismissed: main.js calls
  // * dismissInitialBootSplash (which flips bootDismissed synchronously) right after
  // * the 45 milestone, but the splash stays visible for the boot hold + fade —
  // * the 75 (cart GLB prefetched) and 90 (menu wired) floors land in that window.
  if (typeof document === "undefined" || !document.getElementById("cr-boot-splash")) return;
  // @ts-ignore — defined by the inline boot script in index.html.
  window.__crBootFloor?.(pct);
}

/** Clears boot + mode-entry overlays (quit-to-menu, failed join, teardown). */
export function dismissAllLoadingOverlays() {
  void dismissInitialBootSplash();
  void dismissModeEntryLoading();
}

/**
 * @param {{ gameMode?: string | null, levelId?: string | null, backfillBootMarks?: (() => boolean) | null }} opts
 */
function showModeEntryLoading(opts = {}) {
  // * Theme is driven by levelId only — gameMode is ignored.
  const resolvedLevel = resolveLevelId(
    opts.levelId ?? (storageGet(LEVEL_STORAGE_KEY)),
  );
  const theme =
    resolvedLevel === "backrooms" ? "backrooms"
    : resolvedLevel === "zanzibar" ? "zanzibar"
    : "classic";

  applyTheme(theme);
  modeEntryVisible = true;
  modeEntryShowGen += 1;
  modeOverlayEl.classList.remove("cr-load--hidden", "cr-load--exit");
  modeOverlayEl.setAttribute("aria-busy", "true");
  // * Drop the floor before the first write, or the previous session's 100 sticks.
  modeProgressValue = 0;
  setProgress(0, "Starting...");

  // * Subscribe BEFORE backfilling: a mark that lands between the two is then merely a
  // * duplicate raise, which the floor absorbs, rather than a lost anchor.
  modeBootPhaseOff?.();
  modeBootPhaseOff = onBootPhase((name) => {
    const pct = BOOT_PHASE_ANCHORS[name];
    // * No label — the flavour-line rotation owns the subtitle.
    if (pct != null) setProgress(pct);
  });

  // * History is only valid when a cold-load is genuinely still in flight (this overlay
  // * joined it late — `?harness=1` starts one at main.js:5667, before the overlay
  // * exists). `performance` marks live for the whole page, so replaying them on a
  // * SECOND play entry — or on world-warm-but-arena-stale — would pin the bar at 85
  // * through a real arena rebuild. That is worse than the bug being fixed.
  if (opts.backfillBootMarks?.() === true) {
    let seen = 0;
    for (const mark of readBootTimeline()) {
      const pct = BOOT_PHASE_ANCHORS[mark.name];
      if (pct != null && pct > seen) seen = pct;
    }
    if (seen > 0) setProgress(seen);
  }
}

/** @returns {Promise<void>} */
function dismissModeEntryLoading() {
  stopModeMessageRotation();
  // * Any dismissal ends ambient motion, including the quit-to-menu / failed-join path
  // * (dismissAllLoadingOverlays) that runs while a mode-entry task is still in flight.
  stopModeTicker();

  if (!modeEntryVisible) return Promise.resolve();
  ensureModeOverlay();

  setProgress(100, "Ready");

  const dismissGen = modeEntryShowGen;
  return new Promise((resolve) => {
    const finish = () => {
      if (dismissGen !== modeEntryShowGen) {
        // * A newer show owns the overlay — settle this dismissal without touching
        // * the DOM or flushing the new session's waiters.
        resolve();
        return;
      }
      modeEntryVisible = false;
      modeOverlayEl.setAttribute("aria-busy", "false");
      modeOverlayEl.classList.add("cr-load--hidden");
      modeOverlayEl.classList.remove("cr-load--exit");
      resolve();
      // * Release anyone gating on the overlay being gone (e.g. the solo countdown,
      // * which must not begin ticking behind the loading screen).
      const waiters = modeEntryHiddenWaiters;
      modeEntryHiddenWaiters = [];
      for (const w of waiters) {
        try { w(); } catch { /* a waiter must never break dismissal */ }
      }
    };

    if (prefersReducedMotion()) {
      finish();
      return;
    }

    // * Run-5 "loading → level is rough": the old cadence (exit at 180ms, opacity
    // * fade only after a further FADE_MS) left a dead, panel-less dark overlay on
    // * screen for ~400ms. Overlap instead — the panel slap-exit starts almost
    // * immediately and the whole-overlay fade begins mid-slap, so the level
    // * resolves in continuous motion (~540ms total instead of ~860ms).
    window.setTimeout(() => {
      modeOverlayEl.classList.add("cr-load--exit");
      window.setTimeout(finish, 160);
    }, 120);
  });
}

/**
 * Yields until the browser has painted (avoids microtask-before-paint jank).
 * @returns {Promise<void>}
 */
export function yieldForPaint() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });
}

/**
 * Holds the overlay until the min visible budget has elapsed since show.
 * @param {number} shownAt `performance.now()` when the overlay was shown.
 * @param {number} [minMs=MIN_MODE_ENTRY_VISIBLE_MS]
 * @returns {Promise<void>}
 */
async function ensureMinModeEntryVisible(shownAt, minMs = MIN_MODE_ENTRY_VISIBLE_MS) {
  const remaining = minMs - (performance.now() - shownAt);
  if (remaining > 0) {
    await new Promise((resolve) => {
      window.setTimeout(resolve, remaining);
    });
  }
}

/**
 * @param {(reportProgress: (pct: number, label: string, meta?: { warm?: boolean }) => void) => Promise<void> | void} task
 * @param {{ gameMode?: string | null, levelId?: string | null, onShown?: () => void, minVisibleMs?: number | null, backfillBootMarks?: (() => boolean) | null }} opts
 *   `minVisibleMs` — override the floor (e.g. warm path). Pass null to decide inside task via report.
 *   `backfillBootMarks` — predicate: may already-stamped boot marks seed the meter? True
 *   only while a world bootstrap is genuinely in flight. Passed in rather than imported —
 *   `bootstrap.js` imports this module, so reading its state here would be a cycle.
 * @returns {Promise<void>}
 */
export async function withModeEntryLoading(task, opts = {}) {
  const { gameMode, levelId, onShown, backfillBootMarks } = opts;
  const isOwner = modeEntryDepth === 0;
  modeEntryDepth += 1;
  /** @type {{ minVisibleMs: number }} */
  const loadMeta = {
    minVisibleMs: typeof opts.minVisibleMs === "number"
      ? opts.minVisibleMs
      : MIN_MODE_ENTRY_VISIBLE_MS,
  };

  if (isOwner) {
    modeEntryShownAt = performance.now();
    showModeEntryLoading({ gameMode, levelId, backfillBootMarks });
    startModeTicker();
    onShown?.();
    await yieldForPaint();
  }

  /**
   * Progress reporter; optional 3rd arg `{ warm: true }` shortens the min-visible floor.
   * @param {number} pct
   * @param {string} label
   * @param {{ warm?: boolean }} [meta]
   */
  const report = (pct, label, meta) => {
    reportProgress(pct, label);
    if (meta?.warm) loadMeta.minVisibleMs = MIN_MODE_ENTRY_WARM_MS;
  };

  try {
    await task(report);
  } catch (err) {
    // * Console tags stay [CartRave] until the brand cutover (style guide §7).
    console.error("[CartRave] Mode entry bootstrap failed:", err);
    throw err;
  } finally {
    modeEntryDepth -= 1;
    if (isOwner) {
      // * Before the awaits, and owner-only: the task may have thrown, and a nested
      // * call must never tear down the owner's ticker. Leaving either alive leaks a
      // * timer past the overlay (and past the test that runs it).
      stopModeTicker();
      modeBootPhaseOff?.();
      modeBootPhaseOff = null;
      await ensureMinModeEntryVisible(modeEntryShownAt, loadMeta.minVisibleMs);
      await dismissModeEntryLoading();
    }
  }
}

/**
 * Resolves once the mode-entry loading overlay has fully dismissed — or immediately
 * if it is not currently shown. Lets callers hold an action until the loading screen
 * is gone (the solo round countdown uses this so its reveal isn't hidden behind the
 * overlay, i.e. "loading ends before the round starts").
 * @returns {Promise<void>}
 */
export function whenModeEntryHidden() {
  if (!modeEntryVisible) return Promise.resolve();
  return new Promise((resolve) => {
    modeEntryHiddenWaiters.push(resolve);
  });
}

export function initLoadingScreen() {
  ensureModeOverlay();
}

/**
 * Shows the mode-entry loading overlay with quality-apply copy.
 * Call before triggering a page reload so the user sees a brief transition.
 * No-op if the overlay does not exist (initLoadingScreen not yet called).
 */
export function showQualityApplyLoading() {
  ensureModeOverlay();
  stopModeMessageRotation();
  stopModeTicker();
  if (!modeOverlayEl) return;

  // * Strip level-specific themes so the panel renders neutral.
  modeOverlayEl.classList.remove(
    "cr-load--solo",
    "cr-load--classic",
    "cr-load--backrooms",
    "cr-load--zanzibar",
    "cr-load--hidden",
    "cr-load--exit",
  );
  modeOverlayEl.classList.add("cr-load--classic");
  modeOverlayEl.setAttribute("aria-busy", "true");

  if (modeVisualSlot) {
    modeVisualSlot.replaceChildren();
  }

  if (modeTitleEl) modeTitleEl.textContent = "QUALITY";
  if (modeKickerEl) modeKickerEl.textContent = "ADJUSTING THE HOUSE LIGHTS";
  if (modeSubtitleEl) modeSubtitleEl.textContent = "Applying quality settings…";
  setProgress(100, "Applying…");
  modeEntryShownAt = performance.now();
  modeEntryVisible = true;
  modeEntryShowGen += 1;
}
