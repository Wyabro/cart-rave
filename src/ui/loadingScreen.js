/**
 * Cart Clash loading screens — initial boot splash + mode-entry overlay.
 */

import "./styles/tokens.css";
import "./loadingScreen.css";
import { resolveLevelId, LEVEL_STORAGE_KEY } from "../levels/index.js";
import { storageGet, storageSet, STORAGE_KEYS } from "../utils/storage.js";

const MODE_OVERLAY_ID = "cr-mode-load";
const FADE_MS = 420;
/** Minimum time the mode-entry overlay stays up so cold paths remain visible. */
const MIN_MODE_ENTRY_VISIBLE_MS = 720;
/** Warm same-level path: skip most of the artificial floor (brand flash only). */
const MIN_MODE_ENTRY_WARM_MS = 200;

/** @type {Record<"classic" | "backrooms" | "zanzibar", { title: string, subtitle: string, progress: string, messages: string[] }>} */
const THEME_COPY = {
  classic: {
    title: "CART RAVE",
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

function buildProgressBlock() {
  const wrap = document.createElement("div");
  wrap.className = "cr-load__progress-wrap";
  
  const segBar = document.createElement("div");
  segBar.className = "cr-seg-bar cr-seg-bar--theme";
  segBar.setAttribute("role", "progressbar");
  segBar.setAttribute("aria-valuemin", "0");
  segBar.setAttribute("aria-valuemax", "100");
  segBar.setAttribute("aria-valuenow", "0");

  for (let i = 0; i < 20; i++) {
    const seg = document.createElement("div");
    seg.className = "cr-seg";
    segBar.appendChild(seg);
  }
  
  wrap.appendChild(segBar);
  return wrap;
}

function ensureModeOverlay() {
  if (modeOverlayEl) return modeOverlayEl;

  modeOverlayEl = document.createElement("div");
  modeOverlayEl.id = MODE_OVERLAY_ID;
  modeOverlayEl.className = "cr-load cr-load--hidden";
  modeOverlayEl.setAttribute("aria-live", "polite");
  modeOverlayEl.setAttribute("aria-busy", "false");
  modeOverlayEl.innerHTML =
    '<div class="cr-load__bg"></div>' +
    '<div class="cr-load__scan"></div>' +
    '<div class="cr-load__vignette"></div>' +
    '<div class="cr-load__panel">' +
    '<div class="cr-load__tag">◆ LOADING ◆</div>' +
    '<div class="cr-load__title"></div>' +
    '<div class="cr-load__subtitle"></div>' +
    "</div>";

  const panel = modeOverlayEl.querySelector(".cr-load__panel");
  modeTitleEl = modeOverlayEl.querySelector(".cr-load__title");
  modeSubtitleEl = modeOverlayEl.querySelector(".cr-load__subtitle");
  modeVisualSlot = document.createElement("div");
  const progressWrap = buildProgressBlock();
  panel?.appendChild(modeVisualSlot);
  panel?.appendChild(progressWrap);

  document.body.appendChild(modeOverlayEl);
  return modeOverlayEl;
}

function setProgress(pct, label) {
  const clamped = Math.max(0, Math.min(100, pct));
  const segBar = modeOverlayEl?.querySelector(".cr-seg-bar--theme");
  if (segBar) {
    segBar.setAttribute("aria-valuenow", Math.round(clamped).toString());
    const segments = segBar.children;
    const litCount = Math.round((clamped / 100) * 20);
    for (let i = 0; i < segments.length; i++) {
      if (i < litCount) segments[i].classList.add("lit");
      else segments[i].classList.remove("lit");
    }
  }
  if (label && modeSubtitleEl) {
    modeSubtitleEl.textContent = label;
  }
}

/**
 * Reports real loading progress to the mode-entry overlay.
 * Called by level loading tasks at key milestones:
 * 20% module fetched, 60% geometry built, 90% colliders ready, 100% done.
 * @param {number} pct 0–100 progress percentage
 * @param {string} label Human-readable milestone label
 */
function reportProgress(pct, label) {
  setProgress(pct, label);
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

    // 2. Force to 100%
    const bar = document.getElementById('boot-seg-bar');
    if (bar) {
      bar.setAttribute('aria-valuenow', '100');
      const segments = bar.children;
      for (let i = 0; i < segments.length; i++) {
        segments[i].classList.add('lit');
      }
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
        window.CartRave?.show?.();
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
 * @param {{ gameMode?: string | null, levelId?: string | null }} opts
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
  setProgress(0, "Starting...");
}

/** @returns {Promise<void>} */
function dismissModeEntryLoading() {
  stopModeMessageRotation();

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

    window.setTimeout(() => {
      modeOverlayEl.classList.add("cr-load--exit");
      window.setTimeout(finish, FADE_MS);
    }, 180);
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
 * @param {{ gameMode?: string | null, levelId?: string | null, onShown?: () => void, minVisibleMs?: number | null }} opts
 *   `minVisibleMs` — override the floor (e.g. warm path). Pass null to decide inside task via report.
 * @returns {Promise<void>}
 */
export async function withModeEntryLoading(task, opts = {}) {
  const { gameMode, levelId, onShown } = opts;
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
    showModeEntryLoading({ gameMode, levelId });
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
    console.error("[CartClash] Mode entry bootstrap failed:", err);
    throw err;
  } finally {
    modeEntryDepth -= 1;
    if (isOwner) {
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
  if (modeSubtitleEl) modeSubtitleEl.textContent = "Applying quality settings…";
  setProgress(100, "Applying…");
  modeEntryShownAt = performance.now();
  modeEntryVisible = true;
  modeEntryShowGen += 1;
}
