/**
 * Cart Clash loading screens — initial boot splash + mode-entry overlay.
 */

import "./styles/tokens.css";
import "./loadingScreen.css";
import { resolveLevelId, LEVEL_STORAGE_KEY } from "../levels/index.js";
import { storageGet, storageSet, STORAGE_KEYS } from "../utils/storage.js";
import { markBootPhase, onBootPhase, readBootTimeline } from "../utils/bootTimeline.js";
import { noteModeEntryHidden, noteModeEntryShown } from "../utils/autoQuality.js";

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
 * @type {Record<"classic" | "backrooms" | "zanzibar", { title: string, titleLines: string[], meta: string, kicker: string, subtitle: string, progress: string, messages: string[] }>}
 */
const THEME_COPY = {
  classic: {
    title: "CART RAVE",
    // * LOAD-POSTER-1: the poster lockup breaks at an authored point, never by
    // * wrapping — the break must not move between viewports. `title` stays the
    // * flat string because loadshots asserts textContent equality against it.
    titleLines: ["CART", "RAVE"],
    meta: "AISLE 01",
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
    titleLines: ["THE", "STOREROOMS"],
    meta: "AISLE 02",
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
    titleLines: ["SUNDIAL", "STATION"],
    meta: "AISLE 03",
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
let modeMetaEl = null;
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

/* ── Mode-entry theme visual builders ─────────────────────────────────────────
   LOAD-POSTER-1: each theme is one full-stage scene — an inline SVG backdrop
   (`slice`, so it covers like a background image at any aspect) with the decor
   nodes layered over it as foreground.

   The decor node NAMES AND COUNTS are a gate, not a style choice:
   tools/loadshots.mjs:147-151 asserts exactly 1 `.cr-load__vinyl` / 3
   `.cr-load__laser` / 5 `.cr-load__crowd span` for classic, 3 `.furn-box` +
   1 `.furn-chair` for backrooms, 1 `.sea-sun` / 3 `.sea-water span` /
   1 `.sea-deck` for zanzibar — and zero of every other theme's selectors. Two of
   those require literal `span` elements, which is why the counted layers stay
   HTML over the SVG instead of becoming SVG groups. Re-use these nodes as scene
   elements; do not add, drop or rename one without owning the gate change (and
   `tools/` is off-limits during a game card). */

/**
 * Cart Rave — looking across a dark warehouse floor: truss, speaker stacks, a
 * mirror-ball, laser fans, and a crowd whose heads break the title's baseline.
 * @returns {HTMLDivElement}
 */
function buildClassicDecor() {
  const wrap = document.createElement("div");
  wrap.className = "cr-load__visual cr-load__visual--rave";
  wrap.innerHTML =
    '<svg class="cr-load__svg" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">' +
    "<defs>" +
    '<linearGradient id="crRaveWall" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0" stop-color="#0a0014"/><stop offset="0.58" stop-color="#1b0432"/><stop offset="1" stop-color="#06000d"/>' +
    "</linearGradient>" +
    '<radialGradient id="crRaveHaze" cx="0.5" cy="0.44" r="0.55">' +
    '<stop offset="0" stop-color="#ff2bd6" stop-opacity="0.34"/><stop offset="0.5" stop-color="#7a0e6a" stop-opacity="0.14"/><stop offset="1" stop-color="#000000" stop-opacity="0"/>' +
    "</radialGradient>" +
    '<linearGradient id="crRaveFloor" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0" stop-color="#2b0a3e"/><stop offset="1" stop-color="#04000a"/>' +
    "</linearGradient>" +
    '<linearGradient id="crRaveSmear" x1="0" y1="0" x2="1" y2="0">' +
    '<stop offset="0" stop-color="#22e6ff" stop-opacity="0"/><stop offset="0.28" stop-color="#22e6ff" stop-opacity="0.4"/>' +
    '<stop offset="0.6" stop-color="#ff2bd6" stop-opacity="0.45"/><stop offset="1" stop-color="#ff2bd6" stop-opacity="0"/>' +
    "</linearGradient>" +
    "</defs>" +
    '<rect width="1600" height="900" fill="url(#crRaveWall)"/>' +
    '<ellipse cx="800" cy="396" rx="740" ry="340" fill="url(#crRaveHaze)"/>' +
    // truss + hangers
    '<g fill="#0d0618">' +
    '<rect x="60" y="150" width="1480" height="10"/><rect x="60" y="112" width="1480" height="8"/>' +
    '<rect x="250" y="112" width="6" height="48"/><rect x="560" y="112" width="6" height="48"/>' +
    '<rect x="1034" y="112" width="6" height="48"/><rect x="1344" y="112" width="6" height="48"/>' +
    "</g>" +
    '<g fill="#1e1030"><rect x="60" y="160" width="1480" height="4"/></g>' +
    // speaker stacks
    '<g fill="#0b0616">' +
    '<rect x="70" y="330" width="176" height="330" rx="6"/><rect x="1354" y="330" width="176" height="330" rx="6"/>' +
    "</g>" +
    '<g fill="#170c26">' +
    '<circle cx="158" cy="404" r="46"/><circle cx="158" cy="520" r="34"/><circle cx="158" cy="612" r="24"/>' +
    '<circle cx="1442" cy="404" r="46"/><circle cx="1442" cy="520" r="34"/><circle cx="1442" cy="612" r="24"/>' +
    "</g>" +
    // floor + reflected smear
    '<rect x="0" y="662" width="1600" height="238" fill="url(#crRaveFloor)"/>' +
    '<rect x="0" y="658" width="1600" height="3" fill="#ff2bd6" opacity="0.55"/>' +
    '<rect x="180" y="704" width="1240" height="150" fill="url(#crRaveSmear)" opacity="0.3"/>' +
    "</svg>" +
    '<div class="cr-load__lasers" aria-hidden="true">' +
    '<div class="cr-load__laser"></div><div class="cr-load__laser"></div><div class="cr-load__laser"></div>' +
    "</div>" +
    '<div class="cr-load__vinyl" aria-hidden="true"></div>' +
    '<div class="cr-load__crowd" aria-hidden="true">' +
    "<span></span><span></span><span></span><span></span><span></span>" +
    "</div>";
  return wrap;
}

/**
 * The Storerooms — one-point perspective down an endless aisle. Stays LIMINAL:
 * flat fluorescent wash, no neon, no glow (art-direction.md:65-80 — this arena
 * must not be pushed toward a rave). The lone chair mid-aisle is the focal joke;
 * the boxes are foreground and break the title.
 * @returns {HTMLDivElement}
 */
function buildBackroomsDecor() {
  const wrap = document.createElement("div");
  wrap.className = "cr-load__visual cr-load__furniture";
  wrap.innerHTML =
    '<svg class="cr-load__svg" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">' +
    "<defs>" +
    '<linearGradient id="crAisleFloor" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0" stop-color="#6c6f3d"/><stop offset="1" stop-color="#3d3f22"/>' +
    "</linearGradient>" +
    '<linearGradient id="crAisleWallL" x1="0" y1="0" x2="1" y2="0">' +
    '<stop offset="0" stop-color="#5d5f34"/><stop offset="1" stop-color="#9aa05c"/>' +
    "</linearGradient>" +
    '<linearGradient id="crAisleWallR" x1="0" y1="0" x2="1" y2="0">' +
    '<stop offset="0" stop-color="#9aa05c"/><stop offset="1" stop-color="#5d5f34"/>' +
    "</linearGradient>" +
    "</defs>" +
    '<rect width="1600" height="900" fill="#4c4e2b"/>' +
    // ceiling, floor, side walls converging on 800,470
    '<polygon points="0,0 1600,0 902,392 698,392" fill="#5a5c31"/>' +
    '<polygon points="0,900 1600,900 902,548 698,548" fill="url(#crAisleFloor)"/>' +
    '<polygon points="0,0 698,392 698,548 0,900" fill="url(#crAisleWallL)"/>' +
    '<polygon points="1600,0 902,392 902,548 1600,900" fill="url(#crAisleWallR)"/>' +
    '<rect x="698" y="392" width="204" height="156" fill="#8b915180"/>' +
    // shelf runs receding on both sides
    '<g fill="#3c3e21" opacity="0.75">' +
    '<polygon points="0,232 698,420 698,436 0,286"/><polygon points="0,470 698,470 698,486 0,548"/>' +
    '<polygon points="0,714 698,520 698,536 0,790"/>' +
    '<polygon points="1600,232 902,420 902,436 1600,286"/><polygon points="1600,470 902,470 902,486 1600,548"/>' +
    '<polygon points="1600,714 902,520 902,536 1600,790"/>' +
    "</g>" +
    // shelf uprights, thinning with distance
    '<g fill="#33351c" opacity="0.6">' +
    '<rect x="120" y="180" width="14" height="640"/><rect x="360" y="286" width="11" height="440"/>' +
    '<rect x="552" y="356" width="8" height="270"/>' +
    '<rect x="1466" y="180" width="14" height="640"/><rect x="1229" y="286" width="11" height="440"/>' +
    '<rect x="1040" y="356" width="8" height="270"/>' +
    "</g>" +
    // ceiling fluorescents — one is class="cr-load__fluoro" and flickers
    '<g fill="#e8ecc0">' +
    '<rect x="716" y="96" width="168" height="20" rx="6" opacity="0.92"/>' +
    '<rect x="742" y="212" width="116" height="15" rx="5" opacity="0.85"/>' +
    '<rect x="770" y="306" width="60" height="10" rx="4" opacity="0.7"/>' +
    "</g>" +
    '<rect class="cr-load__fluoro" x="756" y="360" width="88" height="9" rx="4" fill="#f2f6cc" opacity="0.8"/>' +
    // the yellow line on the floor, receding
    '<polygon points="742,900 858,900 812,548 788,548" fill="#c9b23f" opacity="0.5"/>' +
    "</svg>" +
    '<div class="cr-load__furniture-inner" aria-hidden="true">' +
    '<div class="furn-box b1"></div>' +
    '<div class="furn-box b2"></div>' +
    '<div class="furn-box b3"></div>' +
    "</div>" +
    '<div class="furn-chair" aria-hidden="true">' +
    '<div class="chair-back"></div>' +
    '<div class="chair-seat"></div>' +
    '<div class="chair-leg left"></div>' +
    '<div class="chair-leg right"></div>' +
    "</div>";
  return wrap;
}

function buildZanzibarDecor() {
  const wrap = document.createElement("div");
  wrap.className = "cr-load__visual cr-load__seaside";
  // * GOLDEN HOUR, not dark (art-direction.md:65-80). The sun sits behind the
  // * title so the letterforms read as silhouette; the deck carries the gnomon on
  // * ::after — the old standalone .sea-gnomon node is gone, two spindles fight.
  wrap.innerHTML =
    '<svg class="cr-load__svg" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">' +
    "<defs>" +
    '<linearGradient id="crSunSky" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0" stop-color="#f8c778"/><stop offset="0.42" stop-color="#ffb15e"/>' +
    '<stop offset="0.78" stop-color="#ff8340"/><stop offset="1" stop-color="#ff5e3a"/>' +
    "</linearGradient>" +
    '<linearGradient id="crSunSea" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0" stop-color="#ff7a45"/><stop offset="0.22" stop-color="#c2563f"/>' +
    '<stop offset="0.6" stop-color="#2c5566"/><stop offset="1" stop-color="#123243"/>' +
    "</linearGradient>" +
    "</defs>" +
    '<rect width="1600" height="900" fill="url(#crSunSky)"/>' +
    // haze bands across the sky
    '<g fill="#ffe0a8" opacity="0.28">' +
    '<rect x="120" y="196" width="560" height="12" rx="6"/><rect x="980" y="150" width="420" height="10" rx="5"/>' +
    '<rect x="700" y="268" width="720" height="9" rx="4"/><rect x="160" y="330" width="380" height="8" rx="4"/>' +
    "</g>" +
    // sea + horizon
    '<rect x="0" y="596" width="1600" height="304" fill="url(#crSunSea)"/>' +
    '<rect x="0" y="592" width="1600" height="5" fill="#ffd9a0" opacity="0.85"/>' +
    // sun column on the water
    '<polygon points="756,596 844,596 940,900 660,900" fill="#ffcf8a" opacity="0.35"/>' +
    // far bollards along the water line
    '<g fill="#43281f" opacity="0.55">' +
    '<rect x="196" y="560" width="14" height="36" rx="4"/><rect x="352" y="566" width="12" height="30" rx="4"/>' +
    '<rect x="1240" y="566" width="12" height="30" rx="4"/><rect x="1396" y="560" width="14" height="36" rx="4"/>' +
    "</g>" +
    "</svg>" +
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
  // * Shell geometry, mirroring `.cr-screen`: header row (Goldman kicker + aisle
  // * meta over a hairline rule), centre stage carrying the arena scene WITH the
  // * poster title layered over it, full-bleed strip along the bottom.
  // *
  // * LOAD-POSTER-1: the title is a PERMANENT child of the stage, sibling to
  // * `.cr-load__scene`. Only the scene is swapped per arena — `applyTheme` and the
  // * quality overlay both `replaceChildren()` the slot, so a title parked directly
  // * under `.cr-load__stage` (as the slot used to be) would be deleted every show.
  modeOverlayEl.innerHTML =
    '<div class="cr-load__bg"></div>' +
    '<div class="cr-load__vignette"></div>' +
    '<div class="cr-load__shell">' +
    '<div class="cr-load__hd">' +
    '<div class="cr-load__hd-row">' +
    '<div class="cr-load__kicker"></div>' +
    '<div class="cr-load__meta"></div>' +
    "</div>" +
    '<div class="cr-load__rule"></div>' +
    "</div>" +
    '<div class="cr-load__stage">' +
    '<div class="cr-load__scene"></div>' +
    '<div class="cr-load__title"></div>' +
    "</div>" +
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
  modeMetaEl = modeOverlayEl.querySelector(".cr-load__meta");
  modeSubtitleEl = modeOverlayEl.querySelector(".cr-load__subtitle");
  // * The SCENE is the decor slot, not the stage — the stage also holds the
  // * permanent title, which a stage-level replaceChildren() would eat.
  modeVisualSlot = modeOverlayEl.querySelector(".cr-load__scene");

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
 * Writes the poster title as a stacked span lockup.
 *
 * The ONLY path allowed to set `.cr-load__title` — a bare `textContent =` write
 * flattens the lockup back to one line, which is exactly how the arena path and
 * the quality overlay used to do it.
 *
 * Lines are joined by a real space text node so the element's `textContent` still
 * reads "SUNDIAL STATION": loadshots asserts it equals `THEME_COPY[theme].title`
 * character for character (tools/loadshots.mjs:1028-1040).
 * @param {string[]} lines
 * @returns {void}
 */
function setTitleLines(lines) {
  if (!modeTitleEl) return;
  const parts = Array.isArray(lines) && lines.length ? lines : [""];
  /** @type {Node[]} */
  const nodes = [];
  parts.forEach((line, i) => {
    if (i > 0) nodes.push(document.createTextNode(" "));
    const span = document.createElement("span");
    span.className = "cr-load__title-line";
    span.textContent = line;
    nodes.push(span);
  });
  modeTitleEl.replaceChildren(...nodes);
}

/**
 * @param {"classic" | "backrooms" | "zanzibar"} theme
 */
function applyTheme(theme) {
  ensureModeOverlay();
  modeOverlayEl.classList.remove("cr-load--solo", "cr-load--classic", "cr-load--backrooms", "cr-load--zanzibar");
  modeOverlayEl.classList.add(`cr-load--${theme}`);

  const copy = THEME_COPY[theme] || THEME_COPY.classic;
  setTitleLines(copy.titleLines || [copy.title]);
  if (modeKickerEl) modeKickerEl.textContent = copy.kicker;
  if (modeMetaEl) modeMetaEl.textContent = copy.meta || "";

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
  // * FV-BOOT-1 measure: floor wait is not the gate — module eval until this dismiss is.
  markBootPhase("boot-dismiss-armed", {
    minBootMs: MIN_BOOT_MS,
    elapsedMs: Math.round(elapsed),
    delayMs: Math.round(delay),
    returning,
  });

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
        markBootPhase("boot-splash-dismissed", {
          tMs: Math.round(performance.now()),
        });
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
  // * FV-LOAD-1b: suppress auto-quality for the whole overlay window so entry freezes
  // * cannot demote the session (cap-229 high→medium during Cart Rave countdown).
  noteModeEntryShown();
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
      // * Start the 2s post-entry grace; sample ring clears when it ends.
      noteModeEntryHidden();
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

  // * Through the same helper as the arena path — a raw textContent write here
  // * would leave the quality overlay as the one screen without the lockup.
  setTitleLines(["QUALITY"]);
  if (modeKickerEl) modeKickerEl.textContent = "ADJUSTING THE HOUSE LIGHTS";
  if (modeMetaEl) modeMetaEl.textContent = "";
  if (modeSubtitleEl) modeSubtitleEl.textContent = "Applying quality settings…";
  setProgress(100, "Applying…");
  modeEntryShownAt = performance.now();
  modeEntryVisible = true;
  modeEntryShowGen += 1;
}
