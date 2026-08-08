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
 * LOAD-TIPS-1: mode-entry subtitle teaches rules, not flavor gags.
 * Mechanical truth must match HOW TO PLAY (`index.html` #cr-howto-screen) —
 * AISLE tags below; do not invent SD win conditions here (no SD aisle).
 * Shared across arenas: rules are not arena-specific. Warm loads often never
 * rotate (floor 200ms); value is one random tip per show + swap on long cold.
 * loadshots.mjs mirrors this list on purpose — keep them in lockstep.
 * @type {readonly string[]}
 */
export const LOAD_TIPS = Object.freeze([
  "Tap boost for a quick shove · hold to wind up a harder one.", // AISLE 2
  "Hop to clear a pit or land on someone.", // AISLE 1
  "You only score when you force a rival off the edge.", // AISLE 3
  "Chain KOs before the streak fades — RAMPAGE · SAVAGE · CARNAGE.", // AISLE 5
  "Every ~18s the PA calls a directive that rewrites the round.", // AISLE 7
  "Scoring fills your cargo bay — fuller means heavier and a bigger spill.", // AISLE 6
]);

/**
 * Kickers are the store voice the rest of the redesign speaks in ("WEEKLY
 * RESTOCK", "STORE POLICY · ALL SALES FINAL", "THE STORE IS NOW CLOSED") — a
 * loading screen is the store getting an aisle ready for you.
 * Subtitle rotation uses {@link LOAD_TIPS}, not per-theme flavor.
 * @type {Record<"classic" | "backrooms" | "zanzibar", { title: string, titleLines: string[], meta: string, kicker: string }>}
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
  },
  backrooms: {
    title: "THE STOREROOMS",
    titleLines: ["THE", "STOREROOMS"],
    meta: "AISLE 02",
    kicker: "AISLE INVENTORY IN PROGRESS",
  },
  zanzibar: {
    title: "SUNDIAL STATION",
    titleLines: ["SUNDIAL", "STATION"],
    meta: "AISLE 03",
    kicker: "OPENING THE SUNDECK",
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
   those require literal `span` elements (`.cr-load__crowd span`, `.sea-water
   span`), so those two layers must stay HTML; the rest are free to live inside
   the SVG, and `.cr-load__vinyl` / `.cr-load__laser` do, because an HTML overlay
   positioned in % slides off the artwork as soon as `slice` crops at a non-16:9
   aspect. Re-use these nodes as scene elements; do not add, drop or rename one
   without owning the gate change (and `tools/` is off-limits during a game card).

   Each scene is traced from a real GPU capture rather than imagined — the
   reference for each is named in its builder's doc comment. */

/**
 * Cart Rave — the arena as the flyover sees it (radius 28 / height 14, ~25° of
 * elevation): the giant vinyl-record floor with its concentric neon rings, the
 * label with CART RAVE arced into it, the lit pit at the spindle, and the crowd
 * bowl wrapping the back. Drawn from `.diag-captures/bl-classic-on.png` rather
 * than invented — an earlier pass drew a generic nightclub, and the whole point
 * of this arena is that you drive on a record.
 * @returns {HTMLDivElement}
 */
function buildClassicDecor() {
  const wrap = document.createElement("div");
  wrap.className = "cr-load__visual cr-load__visual--rave";

  // Seating tiers: concentric arcs banked up the bowl. Dark benches first;
  // the HTML crowd spans supply the sparse people blobs on top.
  let tiers = "";
  for (let t = 0; t < 7; t += 1) {
    const y0 = 48 + t * 28;
    const y1 = y0 + 22;
    const bulge = 18 + t * 14;
    tiers +=
      `<path d="M ${-80 - bulge} ${y1} Q 800 ${y0 - 36 - t * 4} ${1680 + bulge} ${y1} ` +
      `L ${1680 + bulge} ${y1 + 10} Q 800 ${y0 - 20 - t * 4} ${-80 - bulge} ${y1 + 10} Z" ` +
      `fill="${t % 2 === 0 ? "#140a22" : "#1a0e2c"}" opacity="0.92"/>`;
  }

  wrap.innerHTML =
    '<svg class="cr-load__svg" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">' +
    "<defs>" +
    '<radialGradient id="crRaveRoom" cx="0.5" cy="0.3" r="0.85">' +
    '<stop offset="0" stop-color="#1a0530"/><stop offset="0.55" stop-color="#0a0116"/><stop offset="1" stop-color="#030006"/>' +
    "</radialGradient>" +
    '<linearGradient id="crRaveStand" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0" stop-color="#1c0e30"/><stop offset="1" stop-color="#0a0514"/>' +
    "</linearGradient>" +
    '<radialGradient id="crRaveLabel" cx="0.5" cy="0.42" r="0.62">' +
    '<stop offset="0" stop-color="#cfcad6"/><stop offset="0.7" stop-color="#b3aec0"/><stop offset="1" stop-color="#8d8799"/>' +
    "</radialGradient>" +
    '<radialGradient id="crRavePitGlow" cx="0.5" cy="0.5" r="0.5">' +
    '<stop offset="0" stop-color="#ffffff" stop-opacity="0.9"/><stop offset="0.45" stop-color="#ff6be8" stop-opacity="0.5"/><stop offset="1" stop-color="#ff2bd6" stop-opacity="0"/>' +
    "</radialGradient>" +
    // The arcs the label lettering rides — top half upright, bottom half inverted,
    // exactly as it reads on the real record.
    '<path id="crRaveArcTop" d="M 612 700 A 188 65 0 0 1 988 700" fill="none"/>' +
    '<path id="crRaveArcBot" d="M 988 706 A 188 65 0 0 1 612 706" fill="none"/>' +
    "</defs>" +
    '<rect width="1600" height="900" fill="url(#crRaveRoom)"/>' +
    // ── amphitheatre bowl: mass + tiered benches + aisle cuts ──
    '<path d="M -200 310 Q 800 -40 1800 310 L 1800 20 Q 800 -250 -200 20 Z" fill="url(#crRaveStand)"/>' +
    `<g>${tiers}</g>` +
    // radial aisles (dark gaps between seating sections)
    '<g stroke="#0a0514" stroke-width="14" opacity="0.55" fill="none">' +
    '<path d="M 180 90 L 120 300"/><path d="M 480 28 L 430 280"/>' +
    '<path d="M 800 8 L 800 270"/><path d="M 1120 28 L 1170 280"/>' +
    '<path d="M 1420 90 L 1480 300"/>' +
    "</g>" +
    // rim rail of the bowl
    '<path d="M -160 300 Q 800 -20 1760 300" fill="none" stroke="#2e1848" stroke-width="8"/>' +
    '<path d="M -160 300 Q 800 -20 1760 300" fill="none" stroke="#4a2870" stroke-width="2" opacity="0.5"/>' +
    // soft house washes (not solid panels)
    '<g opacity="0.22">' +
    '<ellipse cx="220" cy="160" rx="160" ry="90" fill="#ff6a2b"/>' +
    '<ellipse cx="800" cy="90" rx="140" ry="70" fill="#ff2bd6"/>' +
    '<ellipse cx="1380" cy="160" rx="160" ry="90" fill="#22e6ff"/>' +
    "</g>" +
    // DJ booth at the back of the bowl
    "<g>" +
    '<rect x="712" y="70" width="176" height="66" rx="4" fill="#12081e"/>' +
    '<rect x="726" y="84" width="148" height="10" rx="3" fill="#ff2bd6" opacity="0.9"/>' +
    '<rect x="748" y="104" width="104" height="6" rx="3" fill="#22e6ff" opacity="0.7"/>' +
    '<rect x="756" y="136" width="88" height="36" fill="#0b0512"/>' +
    "</g>" +
    // ── the record floor ──
    '<ellipse cx="800" cy="700" rx="1250" ry="432" fill="#0b0716"/>' +
    '<g fill="none" stroke="#1b1230" stroke-width="2" opacity="0.9">' +
    '<ellipse cx="800" cy="700" rx="1175" ry="406"/><ellipse cx="800" cy="700" rx="1100" ry="380"/>' +
    '<ellipse cx="800" cy="700" rx="1025" ry="354"/><ellipse cx="800" cy="700" rx="950" ry="328"/>' +
    '<ellipse cx="800" cy="700" rx="875" ry="302"/><ellipse cx="800" cy="700" rx="800" ry="276"/>' +
    '<ellipse cx="800" cy="700" rx="725" ry="251"/><ellipse cx="800" cy="700" rx="650" ry="225"/>' +
    '<ellipse cx="800" cy="700" rx="575" ry="199"/><ellipse cx="800" cy="700" rx="500" ry="173"/>' +
    '<ellipse cx="800" cy="700" rx="425" ry="147"/><ellipse cx="800" cy="700" rx="350" ry="121"/>' +
    "</g>" +
    // the neon ring pairs that band the arena
    '<ellipse cx="800" cy="700" rx="1138" ry="393" fill="none" stroke="#ff2bd6" stroke-width="5" opacity="0.7"/>' +
    '<ellipse cx="800" cy="700" rx="1063" ry="367" fill="none" stroke="#22e6ff" stroke-width="3" opacity="0.45"/>' +
    '<ellipse cx="800" cy="700" rx="700" ry="242" fill="none" stroke="#ff2bd6" stroke-width="4" opacity="0.55"/>' +
    '<ellipse cx="800" cy="700" rx="625" ry="216" fill="none" stroke="#22e6ff" stroke-width="3" opacity="0.4"/>' +
    // ── the label ──
    '<ellipse cx="800" cy="700" rx="262" ry="91" fill="url(#crRaveLabel)"/>' +
    '<g fill="none" stroke="#a49eaf" stroke-width="1" opacity="0.5">' +
    '<ellipse cx="800" cy="700" rx="240" ry="83"/><ellipse cx="800" cy="700" rx="218" ry="75"/>' +
    '<ellipse cx="800" cy="700" rx="196" ry="68"/>' +
    "</g>" +
    '<g fill="#7e7889" font-family="Road Rage, Goldman, sans-serif" font-size="32" letter-spacing="4">' +
    '<text><textPath href="#crRaveArcTop" startOffset="50%" text-anchor="middle">CART RAVE</textPath></text>' +
    '<text><textPath href="#crRaveArcBot" startOffset="50%" text-anchor="middle">CART RAVE</textPath></text>' +
    "</g>" +
    '<g fill="#6f6a7a"><path d="M 664 700 l 9 -12 l 9 12 l -9 12 Z"/><path d="M 918 700 l 9 -12 l 9 12 l -9 12 Z"/></g>' +
    // Beams from the rig. INSIDE the svg on purpose: an HTML overlay positioned in
    // % drifts off the artwork the moment `slice` crops at a non-16:9 aspect, and
    // these have to stay pinned to the rig they come from.
    '<g opacity="0.4">' +
    '<polygon class="cr-load__laser" points="790,126 810,126 1010,646 906,646" fill="#ff2bd6" opacity="0.16"/>' +
    '<polygon class="cr-load__laser" points="790,126 810,126 694,646 590,646" fill="#22e6ff" opacity="0.13"/>' +
    '<polygon class="cr-load__laser" points="794,126 806,126 858,652 742,652" fill="#ff6be8" opacity="0.1"/>' +
    "</g>" +
    // The pit at the spindle — same reason it lives in the svg: it has to sit
    // exactly in the label's hole at every aspect ratio.
    '<ellipse cx="800" cy="700" rx="200" ry="72" fill="url(#crRavePitGlow)"/>' +
    '<ellipse class="cr-load__vinyl" cx="800" cy="700" rx="104" ry="36" fill="#08000e" stroke="#fff0fb" stroke-width="8"/>' +
    '<ellipse cx="800" cy="700" rx="92" ry="29" fill="none" stroke="#ff2bd6" stroke-width="4" opacity="0.9"/>' +
    "</svg>" +
    '<div class="cr-load__crowd" aria-hidden="true">' +
    "<span></span><span></span><span></span><span></span><span></span>" +
    "</div>";
  return wrap;
}

/**
 * The Storerooms — the room as the flyover sees it: pale carpet floor, four
 * square corner voids (HOLE_CENTER ±20 m), wall rack bays, and the central junk
 * pile. Drawn from `.diag-captures/bl-storerooms-on.png` + level constants in
 * `backroomsSupermarket.js`. Stays LIMINAL — flat light, no neon, no glow
 * (art-direction.md:65-80).
 * @returns {HTMLDivElement}
 */
function buildBackroomsDecor() {
  const wrap = document.createElement("div");
  wrap.className = "cr-load__visual cr-load__furniture";

  // Floor: far edge y=318, near y=900. Half-width grows toward the viewer.
  // World → UV: ARENA_HALF=38, holes at |x|=|z|=20 size 8.5 → u=x/38, v=(z+38)/76.
  const FAR_Y = 318;
  const NEAR_Y = 900;
  const FAR_HW = 430;
  const NEAR_HW = 1680;

  /** @param {number} u -1..1 left-right @param {number} v 0 far .. 1 near */
  const floorPt = (u, v) => {
    const y = FAR_Y + (NEAR_Y - FAR_Y) * v;
    const hw = FAR_HW + (NEAR_HW - FAR_HW) * v;
    return [800 + u * hw, y];
  };

  let grid = "";
  for (let i = -8; i <= 8; i += 1) {
    const f = i / 8;
    grid += `<line x1="${(800 + f * NEAR_HW).toFixed(0)}" y1="${NEAR_Y}" x2="${(800 + f * FAR_HW).toFixed(0)}" y2="${FAR_Y}"/>`;
  }
  for (let r = 1; r <= 8; r += 1) {
    const y = FAR_Y + (NEAR_Y - FAR_Y) * Math.pow(r / 8, 1.7);
    const hw = FAR_HW + ((NEAR_HW - FAR_HW) * (y - FAR_Y)) / (NEAR_Y - FAR_Y);
    grid += `<line x1="${(800 - hw).toFixed(0)}" y1="${y.toFixed(0)}" x2="${(800 + hw).toFixed(0)}" y2="${y.toFixed(0)}"/>`;
  }

  /**
   * Square void in floor UV (axis-aligned in world → trapezoid in perspective).
   * Soft carpet lip on the near edge only — matches the real chamfer read.
   * @param {number} cu @param {number} cv @param {number} hu @param {number} hv
   */
  const squarePit = (cu, cv, hu, hv) => {
    const tl = floorPt(cu - hu, cv - hv);
    const tr = floorPt(cu + hu, cv - hv);
    const br = floorPt(cu + hu, cv + hv);
    const bl = floorPt(cu - hu, cv + hv);
    const lip = 0.018;
    const ntl = floorPt(cu - hu, cv + hv);
    const ntr = floorPt(cu + hu, cv + hv);
    const nbl = floorPt(cu - hu, cv + hv + lip);
    const nbr = floorPt(cu + hu, cv + hv + lip);
    return (
      `<polygon points="${tl[0].toFixed(0)},${tl[1].toFixed(0)} ${tr[0].toFixed(0)},${tr[1].toFixed(0)} ` +
      `${br[0].toFixed(0)},${br[1].toFixed(0)} ${bl[0].toFixed(0)},${bl[1].toFixed(0)}" fill="#04040a"/>` +
      `<polygon points="${ntl[0].toFixed(0)},${ntl[1].toFixed(0)} ${ntr[0].toFixed(0)},${ntr[1].toFixed(0)} ` +
      `${nbr[0].toFixed(0)},${nbr[1].toFixed(0)} ${nbl[0].toFixed(0)},${nbl[1].toFixed(0)}" fill="#cabe87" opacity="0.28"/>`
    );
  };

  // Four corner holes: world (±20, ±20). Far pair use full poster-scale; near
  // pair are smaller in UV so perspective doesn't blow them past ~½ the visual
  // area of the old mid-floor pits (and leave room for the junk pile + title).
  const FAR_HU = 0.085;
  const FAR_HV = 0.058;
  const NEAR_HU = 0.042;
  const NEAR_HV = 0.032;
  const pits =
    squarePit(-0.52, 0.26, FAR_HU, FAR_HV) +
    squarePit(0.52, 0.26, FAR_HU, FAR_HV) +
    squarePit(-0.52, 0.68, NEAR_HU, NEAR_HV) +
    squarePit(0.52, 0.68, NEAR_HU, NEAR_HV);

  /**
   * One wall rack bay: uprights + shelves + a couple of cartons. Coordinates
   * are screen-space so perspective is hand-set per bay.
   * @param {number} x @param {number} y @param {number} w @param {number} h
   * @param {number} skew lean toward centre (px at top)
   */
  const rackBay = (x, y, w, h, skew) => {
    const x2 = x + w;
    const topL = x + skew;
    const topR = x2 - skew;
    let s =
      `<polygon points="${topL},${y} ${topR},${y} ${x2},${y + h} ${x},${y + h}" fill="#1a1a14" stroke="#2c2c22" stroke-width="1.5"/>` +
      `<line x1="${topL}" y1="${y}" x2="${x}" y2="${y + h}" stroke="#3a3a2e" stroke-width="3"/>` +
      `<line x1="${topR}" y1="${y}" x2="${x2}" y2="${y + h}" stroke="#3a3a2e" stroke-width="3"/>`;
    for (let i = 1; i <= 3; i += 1) {
      const t = i / 4;
      const ly = y + h * t;
      const lx = topL + (x - topL) * t;
      const rx = topR + (x2 - topR) * t;
      s += `<line x1="${lx.toFixed(0)}" y1="${ly.toFixed(0)}" x2="${rx.toFixed(0)}" y2="${ly.toFixed(0)}" stroke="#4a4a3a" stroke-width="2"/>`;
      // carton on every other shelf
      if (i % 2 === 1) {
        const bw = (rx - lx) * 0.28;
        const bx = lx + (rx - lx) * 0.15;
        s += `<rect x="${bx.toFixed(0)}" y="${(ly - 14).toFixed(0)}" width="${bw.toFixed(0)}" height="12" fill="#7a6238"/>`;
      }
    }
    return s;
  };

  wrap.innerHTML =
    '<svg class="cr-load__svg" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">' +
    "<defs>" +
    '<linearGradient id="crStoreFloor" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0" stop-color="#6d6b4c"/><stop offset="0.35" stop-color="#8c8964"/><stop offset="1" stop-color="#a39f77"/>' +
    "</linearGradient>" +
    '<linearGradient id="crStoreWall" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0" stop-color="#08080a"/><stop offset="1" stop-color="#1d1c14"/>' +
    "</linearGradient>" +
    '<radialGradient id="crStoreFall" cx="0.5" cy="0.62" r="0.72">' +
    '<stop offset="0.5" stop-color="#000000" stop-opacity="0"/><stop offset="1" stop-color="#000000" stop-opacity="0.55"/>' +
    "</radialGradient>" +
    "</defs>" +
    '<rect width="1600" height="900" fill="#0a0a0b"/>' +
    '<rect x="0" y="0" width="1600" height="318" fill="url(#crStoreWall)"/>' +
    '<rect x="0" y="302" width="1600" height="18" fill="#2a2818" opacity="0.7"/>' +
    // side wall rack bays (receding into the dark)
    `<g opacity="0.85">${rackBay(40, 140, 110, 170, 18)}${rackBay(1450, 140, 110, 170, 18)}</g>` +
    // far wall racks left / right of centre
    `<g opacity="0.9">${rackBay(280, 175, 130, 130, 8)}${rackBay(1190, 175, 130, 130, 8)}</g>` +
    // freestanding shelf unit dead-centre on the far edge (matches the real prop)
    "<g>" +
    '<rect x="724" y="228" width="152" height="78" fill="#14140e" stroke="#2a2a20" stroke-width="1.5"/>' +
    '<rect x="732" y="242" width="136" height="5" fill="#3a3826"/>' +
    '<rect x="732" y="264" width="136" height="5" fill="#3a3826"/>' +
    '<rect x="732" y="286" width="136" height="5" fill="#3a3826"/>' +
    '<rect x="744" y="216" width="36" height="14" fill="#8a6a3a"/>' +
    '<rect x="820" y="216" width="36" height="14" fill="#8a6a3a"/>' +
    "</g>" +
    `<polygon points="${800 - FAR_HW},${FAR_Y} ${800 + FAR_HW},${FAR_Y} ${800 + NEAR_HW},${NEAR_Y} ${800 - NEAR_HW},${NEAR_Y}" fill="url(#crStoreFloor)"/>` +
    `<g stroke="#6b6849" stroke-width="1.5" opacity="0.45">${grid}</g>` +
    // four corner voids under the grid so the lips read as carpet
    `<g>${pits}</g>` +
    // SVG bulk under the HTML pile — grey cabinets / desks so the heap reads dense
    // without adding counted .furn-box nodes
    '<g opacity="0.92">' +
    '<rect x="720" y="560" width="70" height="55" fill="#2a2a24" stroke="#141410" stroke-width="2" transform="rotate(-6 755 587)"/>' +
    '<rect x="800" y="548" width="62" height="70" fill="#32322a" stroke="#141410" stroke-width="2" transform="rotate(4 831 583)"/>' +
    '<rect x="760" y="520" width="78" height="42" fill="#3a3a30" stroke="#141410" stroke-width="2" transform="rotate(-2 799 541)"/>' +
    '<rect x="845" y="575" width="48" height="40" fill="#252520" stroke="#141410" stroke-width="2" transform="rotate(11 869 595)"/>' +
    '<rect x="700" y="590" width="55" height="38" fill="#2e2e26" stroke="#141410" stroke-width="2" transform="rotate(-12 727 609)"/>' +
    // small wood desktop top peeking out
    '<rect x="775" y="505" width="58" height="10" fill="#7a5a32" transform="rotate(8 804 510)"/>' +
    "</g>" +
    '<rect width="1600" height="900" fill="url(#crStoreFall)"/>' +
    "</svg>" +
    // Centre junk heap — counted decor: 3 crates + 1 chair (chair stays a chair,
    // tipped into the heap; only .furn-box nodes are crates).
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

/**
 * Sundial Station — the platform as the flyover sees it: the ringed planet low in
 * an alien sunset, the far city and the horizon arch, the sea, and the dark
 * octagonal deck with the golden hologram + sundial ring at its centre. Drawn
 * from `.diag-captures/sundial-planet-fixed.png` and `bl-sundial-wide-*.png`.
 * @returns {HTMLDivElement}
 */
function buildZanzibarDecor() {
  const wrap = document.createElement("div");
  wrap.className = "cr-load__visual cr-load__seaside";

  // Star field, derived rather than hand-placed so the spacing stays even and the
  // markup stays short. Fixed arithmetic — no RNG, so captures are reproducible.
  let stars = "";
  for (let i = 0; i < 26; i += 1) {
    const x = ((i * 617) % 1580) + 10;
    const y = ((i * 233) % 420) + 30;
    const r = i % 3 === 0 ? 2.4 : 1.5;
    const o = i % 2 === 0 ? 0.45 : 0.75;
    stars += `<circle cx="${x}" cy="${y}" r="${r}" opacity="${o}"/>`;
  }

  /**
   * Distant wind turbine: tower + nacelle + three blades at 120°.
   * @param {number} cx hub x @param {number} cy hub y
   * @param {number} towerH @param {number} bladeLen @param {number} rotDeg
   */
  const turbine = (cx, cy, towerH, bladeLen, rotDeg) => {
    const baseY = cy + towerH;
    let blades = "";
    for (let b = 0; b < 3; b += 1) {
      const a = ((rotDeg + b * 120) * Math.PI) / 180;
      const tipX = cx + Math.sin(a) * bladeLen;
      const tipY = cy - Math.cos(a) * bladeLen;
      // slim diamond blade (not a stick)
      const px = Math.cos(a) * (bladeLen * 0.08);
      const py = Math.sin(a) * (bladeLen * 0.08);
      const midX = cx + Math.sin(a) * bladeLen * 0.45;
      const midY = cy - Math.cos(a) * bladeLen * 0.45;
      blades +=
        `<polygon points="${(cx - px).toFixed(1)},${(cy - py).toFixed(1)} ` +
        `${(midX + px * 1.6).toFixed(1)},${(midY + py * 1.6).toFixed(1)} ` +
        `${tipX.toFixed(1)},${tipY.toFixed(1)} ` +
        `${(midX - px * 1.6).toFixed(1)},${(midY - py * 1.6).toFixed(1)}" fill="#2a1018"/>`;
    }
    return (
      `<g opacity="0.75">` +
      `<line x1="${cx}" y1="${baseY}" x2="${cx}" y2="${cy}" stroke="#2a1018" stroke-width="4"/>` +
      `<rect x="${cx - 7}" y="${cy - 5}" width="18" height="10" rx="2" fill="#2a1018"/>` +
      blades +
      `<circle cx="${cx}" cy="${cy}" r="4" fill="#1a0a12"/>` +
      `</g>`
    );
  };

  wrap.innerHTML =
    '<svg class="cr-load__svg" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">' +
    "<defs>" +
    '<linearGradient id="crSunSky" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0" stop-color="#150a26"/><stop offset="0.3" stop-color="#3d1030"/>' +
    '<stop offset="0.58" stop-color="#8f2a25"/><stop offset="0.82" stop-color="#d8481c"/>' +
    '<stop offset="1" stop-color="#ff8534"/>' +
    "</linearGradient>" +
    '<linearGradient id="crSunSea" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0" stop-color="#f4702f"/><stop offset="0.22" stop-color="#a83a1e"/>' +
    '<stop offset="0.62" stop-color="#5a1e2c"/><stop offset="1" stop-color="#25101f"/>' +
    "</linearGradient>" +
    "</defs>" +
    '<rect width="1600" height="900" fill="url(#crSunSky)"/>' +
    `<g fill="#ffe7c4">${stars}</g>` +
    // the faint ring arc hanging over the whole sky
    '<path d="M -200 300 Q 800 -120 1800 246" fill="none" stroke="#c9a8ff" stroke-width="5" opacity="0.16"/>' +
    '<path d="M -200 336 Q 800 -84 1800 282" fill="none" stroke="#c9a8ff" stroke-width="2" opacity="0.1"/>' +
    // far city / island silhouettes on the left horizon
    '<g fill="#3a1220">' +
    '<rect x="18" y="404" width="34" height="238"/><rect x="60" y="470" width="26" height="172"/>' +
    '<rect x="96" y="512" width="40" height="130"/><rect x="146" y="556" width="22" height="86"/>' +
    "</g>" +
    '<g fill="#ff9a4a" opacity="0.55">' +
    '<rect x="18" y="404" width="4" height="238"/><rect x="60" y="470" width="3" height="172"/>' +
    '<rect x="96" y="512" width="3" height="130"/>' +
    "</g>" +
    // the arch out on the right
    '<circle cx="1318" cy="700" r="176" fill="none" stroke="#ff6a2b" stroke-width="11" opacity="0.75"/>' +
    '<circle cx="1318" cy="700" r="176" fill="none" stroke="#ffd0a0" stroke-width="3" opacity="0.4"/>' +
    // offshore wind farm — three distant turbines with proper 3-blade rotors
    turbine(1480, 500, 140, 52, 18) +
    turbine(1565, 540, 95, 36, 55) +
    turbine(1410, 555, 70, 28, 100) +
    // sea + horizon
    '<rect x="0" y="642" width="1600" height="258" fill="url(#crSunSea)"/>' +
    '<rect x="0" y="638" width="1600" height="4" fill="#ffd9a0" opacity="0.6"/>' +
    // Observation tower offset from centre (lockup sits on the middle of the frame)
    "<g>" +
    '<rect x="1108" y="548" width="116" height="12" fill="#2a1420"/>' +
    '<rect x="1120" y="560" width="10" height="82" fill="#2a1420"/><rect x="1202" y="560" width="10" height="82" fill="#2a1420"/>' +
    '<rect x="1114" y="512" width="104" height="40" fill="#1c0d18"/>' +
    '<rect x="1122" y="524" width="88" height="6" fill="#ff7a3a" opacity="0.85"/>' +
    "</g>" +
    // Floor dial + hologram are HTML siblings of .sea-deck (not SVG — the
    // deck is opaque and clip-path would eat pseudos). .sea-holo is uncounted;
    // gate only requires one .sea-deck. Tower stays offset right for the lockup.
    "</svg>" +
    '<div class="sea-sun" aria-hidden="true"></div>' +
    '<div class="sea-water" aria-hidden="true"><span></span><span></span><span></span></div>' +
    '<div class="sea-deck" aria-hidden="true"></div>' +
    '<div class="sea-holo" aria-hidden="true"></div>';
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

/* ── Mode-entry tip rotation (LOAD-TIPS-1) ── */

/**
 * Paints a random tip immediately; swaps only on long cold loads.
 * Reduced-motion: static first tip (no timer — aria-live is on the overlay).
 * @param {readonly string[]} tips
 */
function startModeMessageRotation(tips) {
  stopModeMessageRotation();
  if (!tips || tips.length === 0) return;
  let last = pickRandom(tips);
  if (modeSubtitleEl) modeSubtitleEl.textContent = last;
  if (prefersReducedMotion()) return;
  const nextMessage = () => {
    if (tips.length < 2) return last;
    let pick = last;
    while (pick === last) pick = pickRandom(tips);
    last = pick;
    return pick;
  };
  // * First swap at 1.2s (past cold min floor 720ms); then 2s so tips stay
  // * readable. Warm path (~200ms) never reaches a swap — one tip is enough.
  const rotate = (delay) => {
    modeMsgIntervalId = window.setTimeout(() => {
      if (modeSubtitleEl) modeSubtitleEl.textContent = nextMessage();
      rotate(2000);
    }, delay);
  };
  rotate(1200);
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

  startModeMessageRotation(LOAD_TIPS);
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
  // * No label — LOAD-TIPS-1 owns the subtitle until a real milestone reports one.
  // * "Starting..." was dead air that stomped the tip on every warm flash.
  modeProgressValue = 0;
  setProgress(0);

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
 * Yields until `frames` frames have actually been painted.
 *
 * One rAF callback runs *before* the frame it belongs to is painted, so a paint is
 * only confirmed once the *next* rAF fires — hence `frames + 1` chained callbacks.
 * Used both to get an overlay on screen before blocking work (frames = 1) and to
 * hold it across the first expensive post-swap frames (shader link + first draw).
 * @param {number} [frames=1] Painted frames to wait for (clamped to >= 1).
 * @returns {Promise<void>}
 */
export function waitForPaintedFrames(frames = 1) {
  const target = Math.max(1, Math.floor(frames));
  return new Promise((resolve) => {
    let remaining = target + 1;
    const tick = () => {
      remaining -= 1;
      if (remaining <= 0) {
        resolve();
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

/**
 * Yields until the browser has painted (avoids microtask-before-paint jank).
 * @returns {Promise<void>}
 */
export function yieldForPaint() {
  return waitForPaintedFrames(1);
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
