/**
 * Level preview and play-entry swap orchestration.
 * Owns preview vs full quality paths, coalesced rebuild promises, and safety guards.
 * Low-level `loadLevel()` mesh/collider work stays in main via injected deps.
 */

import { resolveLevelId, LEVEL_STORAGE_KEY } from "./levels/index.js";
import { yieldForPaint } from "./ui/loadingScreen.js";

/** Preview reflector resolution — full play uses 256 in main's load path. */
const PREVIEW_REFLECTOR_SIZE = 128;
const FULL_REFLECTOR_SIZE = 256;

/** @type {import("./levelManager.js").LevelManagerDeps | null} */
let deps = null;

let loadedLevelId = resolveLevelId(
  typeof localStorage !== "undefined" ? localStorage.getItem(LEVEL_STORAGE_KEY) : null,
);

/** True while the arena is in lightweight menu-preview quality. */
let previewMode = false;

/** Heavy rave extras deferred until idle finalize or play entry. */
let menuPreviewNeedsFinalize = false;

let levelRebuildInFlight = false;
let isSwappingLevel = false;

/** @type {Promise<void> | null} */
let menuLevelPreviewPromise = null;
/** @type {Promise<void> | null} */
let levelRebuildPromise = null;
/** @type {ReturnType<typeof setTimeout> | null} */
let menuPreviewFinalizeId = null;
/** @type {ReturnType<typeof setTimeout> | null} */
let menuLevelDebounceId = null;

/**
 * @typedef {object} LevelManagerDeps
 * @property {() => boolean} getMenuVisible
 * @property {() => Array<unknown> | null | undefined} getAllCartsRef
 * @property {() => boolean} isWorldBootstrapped
 * @property {() => import("@dimforge/rapier3d-compat").World | null} getWorld
 * @property {() => Promise<void>} ensureWorldBootstrapped
 * @property {(levelId: string, opts: { menuPreview: boolean, reflectorTextureSize: number }) => void} performLevelLoad
 * @property {(levelId: string) => void} [onPreviewSwapComplete]
 * @property {() => void} finalizeArenaForPlay
 * @property {(el: HTMLElement, fn: () => void) => Promise<void>} crossfadeElement
 * @property {() => HTMLElement | null} getCanvas
 */

/**
 * Wires main-owned scene/physics load helpers into the level manager.
 * @param {LevelManagerDeps} dependencies
 */
export function initLevelManager(dependencies) {
  deps = dependencies;
}

function requireDeps() {
  if (!deps) {
    throw new Error("[levelManager] initLevelManager() must run before level swaps");
  }
  return deps;
}

/**
 * @param {string | null | undefined} [levelId]
 * @returns {string}
 */
function resolveTargetLevelId(levelId) {
  if (levelId != null) return resolveLevelId(levelId);
  const stored = typeof localStorage !== "undefined"
    ? localStorage.getItem(LEVEL_STORAGE_KEY)
    : null;
  return resolveLevelId(stored);
}

/**
 * Resolved id of the arena currently loaded in the scene.
 * @returns {string}
 */
export function getCurrentLevelId() {
  return loadedLevelId;
}

/**
 * Whether the loaded arena is in menu-preview quality (lower reflector res, deferred extras).
 * @returns {boolean}
 */
export function isPreviewMode() {
  return previewMode;
}

/**
 * Whether a play-entry crossfade swap is pausing physics/render this frame.
 * @returns {boolean}
 */
export function isLevelSwapping() {
  return isSwappingLevel;
}

/** @returns {boolean} */
export function getMenuPreviewNeedsFinalize() {
  return menuPreviewNeedsFinalize;
}

/** @returns {Promise<void> | null} */
export function getMenuLevelPreviewPromise() {
  return menuLevelPreviewPromise;
}

/** @returns {Promise<void> | null} */
export function getLevelRebuildPromise() {
  return levelRebuildPromise;
}

/** Clears debounced menu preview timers (e.g. before play-entry bootstrap). */
export function cancelMenuPreviewTimers() {
  if (menuLevelDebounceId != null) {
    clearTimeout(menuLevelDebounceId);
    menuLevelDebounceId = null;
  }
  if (menuPreviewFinalizeId != null) {
    clearTimeout(menuPreviewFinalizeId);
    menuPreviewFinalizeId = null;
  }
}

/**
 * Level dispose is unsafe once slot carts exist — menu-only, pre-join.
 * @returns {boolean}
 */
export function canSafelyRebuildLevel() {
  if (!deps) return false;
  const carts = deps.getAllCartsRef();
  return deps.getMenuVisible() && (!carts || carts.length === 0);
}

function scheduleMenuPreviewFinalize() {
  menuPreviewNeedsFinalize = true;
  if (menuPreviewFinalizeId != null) clearTimeout(menuPreviewFinalizeId);
  menuPreviewFinalizeId = setTimeout(() => {
    menuPreviewFinalizeId = null;
    if (!deps?.getMenuVisible() || !menuPreviewNeedsFinalize) return;
    void idleFinalizeMenuPreview();
  }, 500);
}

async function idleFinalizeMenuPreview() {
  const d = requireDeps();
  if (!d.getMenuVisible() || !d.isWorldBootstrapped() || !menuPreviewNeedsFinalize) return;
  if (menuLevelPreviewPromise) await menuLevelPreviewPromise;
  await yieldForPaint();
  previewMode = false;
  menuPreviewNeedsFinalize = false;
  d.finalizeArenaForPlay();
}

/**
 * Swaps arena geometry in place (preview or full quality).
 * @param {string | null | undefined} [levelId]
 * @param {{ menuPreview?: boolean }} [opts]
 * @returns {Promise<void>}
 */
export async function swapLoadedLevel(levelId, opts = {}) {
  const d = requireDeps();
  const selected = resolveTargetLevelId(levelId);
  const menuPreview = opts.menuPreview === true;
  previewMode = menuPreview;

  d.performLevelLoad(selected, {
    menuPreview,
    reflectorTextureSize: menuPreview ? PREVIEW_REFLECTOR_SIZE : FULL_REFLECTOR_SIZE,
  });
  loadedLevelId = selected;

  if (menuPreview) {
    d.onPreviewSwapComplete?.(selected);
    scheduleMenuPreviewFinalize();
    return;
  }

  previewMode = false;
  menuPreviewNeedsFinalize = false;
  d.finalizeArenaForPlay();
}

/**
 * Play-entry rebuild: ensures arena matches menu selection at full quality.
 * @param {string | null | undefined} [levelId]
 * @returns {Promise<void>}
 */
export async function rebuildLevelIfNeeded(levelId) {
  const d = requireDeps();
  if (!canSafelyRebuildLevel()) return;
  if (levelRebuildPromise) return levelRebuildPromise;

  const selected = resolveTargetLevelId(levelId);

  levelRebuildPromise = (async () => {
    await d.ensureWorldBootstrapped();
    if (selected !== loadedLevelId) {
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.log("[bootstrap] play-entry level swap", loadedLevelId, "→", selected);
      }
      isSwappingLevel = true;
      await yieldForPaint();
      const canvas = d.getCanvas();
      const runSwap = () => { void swapLoadedLevel(selected); };
      if (canvas) {
        await d.crossfadeElement(canvas, runSwap);
      } else {
        runSwap();
      }
      await yieldForPaint();
      isSwappingLevel = false;
    } else if (menuPreviewNeedsFinalize) {
      previewMode = false;
      menuPreviewNeedsFinalize = false;
      d.finalizeArenaForPlay();
    }
  })().catch((err) => {
    isSwappingLevel = false;
    throw err;
  }).finally(() => {
    levelRebuildPromise = null;
  });

  return levelRebuildPromise;
}

/**
 * Lightweight menu level preview — no loading overlay, no Rapier cold-start.
 * Coalesces rapid picks; chunks sync load across animation frames.
 * @param {string | null | undefined} [levelId]
 * @returns {Promise<void>}
 */
export async function previewMenuLevelIfNeeded(levelId) {
  const d = requireDeps();
  if (!canSafelyRebuildLevel()) return;
  if (menuLevelPreviewPromise) return menuLevelPreviewPromise;

  const selectedOverride = levelId != null ? resolveTargetLevelId(levelId) : null;

  menuLevelPreviewPromise = (async () => {
    if (!d.isWorldBootstrapped() || !d.getWorld()) {
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.log("[menu-preview] skipped — arena warms on play entry");
      }
      return;
    }

    levelRebuildInFlight = true;
    try {
      while (canSafelyRebuildLevel()) {
        const selected = selectedOverride ?? resolveTargetLevelId(null);
        if (selected === loadedLevelId) break;

        if (import.meta.env.DEV) {
          // eslint-disable-next-line no-console
          console.log("[menu-preview] swap", loadedLevelId, "→", selected);
        }

        await yieldForPaint();
        await swapLoadedLevel(selected, { menuPreview: true });
        await yieldForPaint();
      }
    } finally {
      levelRebuildInFlight = false;
    }
  })().finally(() => {
    menuLevelPreviewPromise = null;
  });

  return menuLevelPreviewPromise;
}

/**
 * Debounced handler for menu level-picker changes.
 */
export function scheduleMenuLevelPreview() {
  if (!canSafelyRebuildLevel()) return;
  if (menuLevelDebounceId != null) clearTimeout(menuLevelDebounceId);
  menuLevelDebounceId = setTimeout(() => {
    menuLevelDebounceId = null;
    const levelId = resolveTargetLevelId(null);
    if (levelId === loadedLevelId) return;
    const runPreview = () => { void previewMenuLevelIfNeeded(); };
    // * Run geometry swap on idle so picker taps never block the menu UI thread.
    if (typeof requestIdleCallback === "function") {
      requestIdleCallback(runPreview, { timeout: 900 });
    } else {
      runPreview();
    }
  }, 120);
}

/**
 * Promotes a preview-quality arena to full play quality (clears preview flags first).
 */
export function finalizeArenaForPlayEntry() {
  previewMode = false;
  menuPreviewNeedsFinalize = false;
  requireDeps().finalizeArenaForPlay();
}
