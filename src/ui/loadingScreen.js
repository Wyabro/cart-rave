/**
 * Cart Rave loading screens — initial boot splash + mode-entry overlay.
 */

import "./loadingScreen.css";
import { resolveLevelId, LEVEL_STORAGE_KEY } from "../levels/index.js";

const BOOT_SPLASH_ID = "cr-boot-splash";
const MODE_OVERLAY_ID = "cr-mode-load";
const FADE_MS = 420;
/** Minimum time the mode-entry overlay stays up so fast paths remain visible. */
const MIN_MODE_ENTRY_VISIBLE_MS = 720;

/** @type {Record<"solo" | "classic" | "backrooms", { title: string, subtitle: string, progress: string }>} */
const THEME_COPY = {
  solo: {
    title: "SOLO",
    subtitle: "Warming up your cart…",
    progress: "Rolling out…",
  },
  classic: {
    title: "CART RAVE",
    subtitle: "Spinning up the vinyl arena…",
    progress: "Loading crowd & lights…",
  },
  backrooms: {
    title: "THE STOREROOMS",
    subtitle: "The fluorescent hum grows louder…",
    progress: "Mapping the liminal aisles…",
  },
};

let modeOverlayEl = null;
let modeProgressFill = null;
let modeProgressLabel = null;
let modeTitleEl = null;
let modeSubtitleEl = null;
let modeVisualSlot = null;
let modeEntryVisible = false;
let bootDismissed = false;
/** Nested mode-entry tasks share one overlay (level switch + play bootstrap). */
let modeEntryDepth = 0;
/** @type {number} */
let modeEntryShownAt = 0;

/**
 * @param {{ gameMode?: string | null, levelId?: string | null }} opts
 * @returns {"solo" | "classic" | "backrooms"}
 */
function resolveLoadingTheme({ gameMode, levelId } = {}) {
  const resolvedLevel = resolveLevelId(
    levelId ?? (typeof localStorage !== "undefined" ? localStorage.getItem(LEVEL_STORAGE_KEY) : null),
  );
  if (resolvedLevel === "backrooms") return "backrooms";
  if (gameMode === "solo") return "solo";
  return "classic";
}

function prefersReducedMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
}

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

function buildSoloDecor() {
  const wrap = document.createElement("div");
  wrap.className = "cr-load__visual";
  wrap.innerHTML = '<div class="cr-load__vinyl" aria-hidden="true"></div>';
  return wrap;
}

function buildBackroomsDecor() {
  const wrap = document.createElement("div");
  wrap.className = "cr-load__visual";
  wrap.innerHTML = '<div class="cr-load__fluoro" aria-hidden="true"></div>';
  return wrap;
}

function buildProgressBlock() {
  const wrap = document.createElement("div");
  wrap.className = "cr-load__progress-wrap";
  wrap.innerHTML =
    '<div class="cr-load__progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">' +
    '<div class="cr-load__progress-fill"></div></div>' +
    '<div class="cr-load__progress-label"></div>';
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
  modeProgressFill = progressWrap.querySelector(".cr-load__progress-fill");
  modeProgressLabel = progressWrap.querySelector(".cr-load__progress-label");

  document.body.appendChild(modeOverlayEl);
  return modeOverlayEl;
}

function setProgress(pct, label) {
  const clamped = Math.max(0, Math.min(100, pct));
  if (modeProgressFill) modeProgressFill.style.width = `${clamped}%`;
  const track = modeProgressFill?.parentElement;
  if (track) track.setAttribute("aria-valuenow", String(Math.round(clamped)));
  if (modeProgressLabel && label) modeProgressLabel.textContent = label;
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

/**
 * @param {"solo" | "classic" | "backrooms"} theme
 */
function applyTheme(theme) {
  ensureModeOverlay();
  modeOverlayEl.classList.remove("cr-load--solo", "cr-load--classic", "cr-load--backrooms");
  modeOverlayEl.classList.add(`cr-load--${theme}`);

  const copy = THEME_COPY[theme];
  if (modeTitleEl) modeTitleEl.textContent = copy.title;
  if (modeSubtitleEl) modeSubtitleEl.textContent = copy.subtitle;

  if (modeVisualSlot) {
    modeVisualSlot.replaceChildren();
    const decor =
      theme === "backrooms"
        ? buildBackroomsDecor()
        : theme === "solo"
          ? buildSoloDecor()
          : buildClassicDecor();
    modeVisualSlot.appendChild(decor);
  }
}

export function revealGameCanvas() {
  document.body.classList.remove("cr-boot-pending");
  const canvas = document.getElementById("game");
  if (canvas) canvas.style.opacity = "1";
}

/** @returns {Promise<void>} */
function revealAppShell() {
  document.body.classList.remove("cr-boot-pending");
  const root = document.getElementById("cr-root");
  const canvas = document.getElementById("game");
  if (root) root.style.visibility = "visible";
  if (canvas) canvas.style.opacity = "1";
}

/** @returns {Promise<void>} */
export function dismissInitialBootSplash() {
  revealAppShell();

  const splash = document.getElementById(BOOT_SPLASH_ID);
  if (!splash) {
    bootDismissed = true;
    return Promise.resolve();
  }

  splash.setAttribute("aria-busy", "false");
  if (!splash.classList.contains("cr-load--hidden")) {
    splash.classList.add("cr-load--exit", "cr-load--hidden");
  }

  if (splash.dataset.crBootRemoving === "1") {
    bootDismissed = true;
    return Promise.resolve();
  }

  splash.dataset.crBootRemoving = "1";
  bootDismissed = true;

  return new Promise((resolve) => {
    window.setTimeout(() => {
      document.getElementById(BOOT_SPLASH_ID)?.remove();
      resolve();
    }, prefersReducedMotion() ? 0 : FADE_MS);
  });
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
  const theme = resolveLoadingTheme(opts);
  applyTheme(theme);
  modeEntryVisible = true;
  modeOverlayEl.classList.remove("cr-load--hidden", "cr-load--exit");
  modeOverlayEl.setAttribute("aria-busy", "true");
  setProgress(0, "Starting…");
}

/** @returns {Promise<void>} */
function dismissModeEntryLoading() {
  if (!modeEntryVisible) return Promise.resolve();
  ensureModeOverlay();

  setProgress(100, "Ready");

  return new Promise((resolve) => {
    const finish = () => {
      modeEntryVisible = false;
      modeOverlayEl.setAttribute("aria-busy", "false");
      modeOverlayEl.classList.add("cr-load--hidden");
      modeOverlayEl.classList.remove("cr-load--exit");
      resolve();
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
 * Holds the overlay until MIN_MODE_ENTRY_VISIBLE_MS has elapsed since show.
 * @param {number} shownAt `performance.now()` when the overlay was shown.
 * @returns {Promise<void>}
 */
async function ensureMinModeEntryVisible(shownAt) {
  const remaining = MIN_MODE_ENTRY_VISIBLE_MS - (performance.now() - shownAt);
  if (remaining > 0) {
    await new Promise((resolve) => {
      window.setTimeout(resolve, remaining);
    });
  }
}

/**
 * @param {(reportProgress: (pct: number, label: string) => void) => Promise<void> | void} task
 * @param {{ gameMode?: string | null, levelId?: string | null, onShown?: () => void }} opts
 * @returns {Promise<void>}
 */
export async function withModeEntryLoading(task, opts = {}) {
  const { gameMode, levelId, onShown } = opts;
  const isOwner = modeEntryDepth === 0;
  modeEntryDepth += 1;

  if (isOwner) {
    modeEntryShownAt = performance.now();
    showModeEntryLoading({ gameMode, levelId });
    onShown?.();
    await yieldForPaint();
  }

  try {
    await task(reportProgress);
  } catch (err) {
    console.error("[CartRave] Mode entry bootstrap failed:", err);
    // Re-throw so the caller knows it failed; cleanup runs in finally.
    throw err;
  } finally {
    modeEntryDepth -= 1;
    if (isOwner) {
      // Even on error, wait min visible time so the UI does not flash.
      await ensureMinModeEntryVisible(modeEntryShownAt);
      await dismissModeEntryLoading();
    }
  }
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
  if (!modeOverlayEl) return;

  // * Strip level-specific themes so the panel renders neutral.
  modeOverlayEl.classList.remove(
    "cr-load--solo",
    "cr-load--classic",
    "cr-load--backrooms",
    "cr-load--hidden",
    "cr-load--exit",
  );
  modeOverlayEl.classList.add("cr-load--classic");
  modeOverlayEl.setAttribute("aria-busy", "true");

  if (modeTitleEl) modeTitleEl.textContent = "QUALITY";
  if (modeSubtitleEl) modeSubtitleEl.textContent = "Applying quality settings…";
  setProgress(100, "Reloading…");
  modeEntryVisible = true;
}
