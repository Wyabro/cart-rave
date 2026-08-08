/**
 * Level preview and play-entry swap orchestration.
 * Owns preview vs full quality paths, coalesced rebuild promises, and safety guards.
 * Low-level `loadLevel()` mesh/collider work stays in main via injected deps.
 */

import { resolveLevelId, LEVEL_STORAGE_KEY } from "./levels/index.js";
import { storageGet } from "./utils/storage.js";
import { yieldForPaint } from "./ui/loadingScreen.js";

/**
 * Reflector resolution ladder: menu preview 128² → play entry 256² → idle
 * upgrade to REFLECTOR_TEXTURE_SIZE_FULL in arena.js (high tier, non-touch,
 * scheduled by scheduleReflectorUpgrade in main.js).
 */
const PREVIEW_REFLECTOR_SIZE = 128;
const PLAY_ENTRY_REFLECTOR_SIZE = 256;

/** @type {import("./levelManager.js").LevelManagerDeps | null} */
let deps = null;

/** @type {"classicRecord" | "backrooms" | "zanzibar" | "testArena"} */
let loadedLevelId = resolveLevelId(
  storageGet(LEVEL_STORAGE_KEY),
);

/** True while the arena is in lightweight menu-preview quality. */
let previewMode = false;

/**
 * True when the currently loaded arena was built with menu-preview LOD and still needs
 * a full-quality rebuild before play (Backrooms dressing skip, lowQ visual gates, etc.).
 */
let previewNeedsFullRebuild = false;

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
 * @property {() => import("@dimforge/rapier3d").World | null} getWorld
 * @property {(levelId?: string | null) => Promise<void>} ensureWorldBootstrapped
 * @property {(levelId: string, opts: { menuPreview: boolean, reflectorTextureSize: number, onProgress?: (pct: number, label: string) => void }) => Promise<void>} performLevelLoad
 * @property {(levelId: string) => void} [onPreviewSwapComplete]
 * @property {() => void} finalizeArenaForPlay
 * @property {() => void} [finalizeArenaShellForMenu]
 *   Classic menu attract only: skybox + stadium bowl + stage (no lasers). Idempotent.
 * @property {(el: HTMLElement, fn: () => void) => Promise<void>} crossfadeElement
 * @property {() => HTMLElement | null} getCanvas
 * @property {(runSwap: () => Promise<void>, opts?: { fade?: boolean }) => Promise<void>} [maskMenuPreviewSwap]
 *   Wraps menu-time scene mutation in an attract-hold + shader warm-up (plus a canvas
 *   cross-fade when `fade` is true) so the arena picker never freezes the menu.
 * @property {(opts?: { forPlay?: boolean }) => Promise<void>} [warmupAfterLevelSwap]
 *   Warm-compiles the freshly swapped scene before attract/gameplay renders it.
 *   `forPlay: false` = menu-light (skip reinstalling VFX anchors).
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

import { settingsStore } from "./stores/settingsStore.js";

/**
 * @param {string | null | undefined} [levelId]
 * @returns {"classicRecord" | "backrooms" | "zanzibar" | "testArena"}
 */
function resolveTargetLevelId(levelId) {
  if (levelId != null) return resolveLevelId(levelId);
  const stored = (
    storageGet(LEVEL_STORAGE_KEY)
  ) || settingsStore.getState().selectedLevelId;
  return resolveLevelId(stored);
}

/**
 * Arena the menu pager is BROWSING (MENU-LOCK-HINT-1). Null = not browsing.
 *
 * * Browsing a locked arena never touches storage or settingsStore — it must not, or SOLO
 * * would start an arena the player has not unlocked — so the preview has no other way to
 * * learn where the pager is pointing.
 * @type {string | null}
 */
let menuBrowseLevelId = null;

/**
 * Point the menu preview at an arena without selecting it. Pass null when a real selection
 * commits, so the preview falls back to storage.
 * @param {string | null | undefined} levelId
 * @returns {void}
 */
export function setMenuBrowseLevel(levelId) {
  menuBrowseLevelId = levelId ?? null;
}

/**
 * Preview target: the browse cursor if the menu is browsing, else the committed selection.
 *
 * * Deliberately a SEPARATE resolver rather than folding the cursor into resolveTargetLevelId:
 * * that one also serves swapLoadedLevel and rebuildLevelIfNeeded, and a browse cursor leaking
 * * into play entry is precisely the bug the SOLO gate exists to prevent.
 * *
 * * Also deliberately re-read (not captured): previewMenuLevelIfNeeded consumes its target
 * * INSIDE the swap loop, and a second schedule early-returns while one is in flight. A frozen
 * * value would strand a stale load — Storerooms finishing after the cursor moved back to
 * * Sundial, with the corrective schedule short-circuited.
 * @returns {"classicRecord" | "backrooms" | "zanzibar" | "testArena"}
 */
function resolvePreviewTargetLevelId() {
  if (menuBrowseLevelId != null) return resolveLevelId(menuBrowseLevelId);
  return resolveTargetLevelId(null);
}

/**
 * Resolved id of the arena currently loaded in the scene.
 * @returns {string}
 */
export function getCurrentLevelId() {
  return loadedLevelId;
}

/**
 * Whether a play-entry crossfade swap is pausing physics/render this frame.
 * @returns {boolean}
 */
export function isLevelSwapping() {
  return isSwappingLevel;
}

/**
 * Forces the level-swapping gate open/closed. Used by in-place quality rebuild
 * so the game loop skips physics while the arena is torn down and rebuilt.
 * @param {boolean} swapping
 */
export function setLevelSwapping(swapping) {
  isSwappingLevel = swapping;
}

/** @returns {boolean} */
export function getMenuPreviewNeedsFinalize() {
  return menuPreviewNeedsFinalize;
}

/** @returns {boolean} */
export function getPreviewNeedsFullRebuild() {
  return previewNeedsFullRebuild;
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
 * Level dispose is unsafe once slot carts exist — menu or pre-join play entry only.
 * Play entry may hide the menu before rebuild; allow that when a preview LOD rebuild
 * is pending (or preview mode is still active) as long as no carts exist yet.
 * @returns {boolean}
 */
function canSafelyRebuildLevel() {
  if (!deps) return false;
  const carts = deps.getAllCartsRef();
  if (carts && carts.length > 0) return false;
  if (deps.getMenuVisible()) return true;
  return previewNeedsFullRebuild || previewMode;
}

/**
 * After a menu preview load: ensure Classic has sky+stadium for attract (shell),
 * without the old delayed "full juice + second compile" path that froze the menu.
 * Shell build is idempotent — first Classic visit pays once; later swaps only toggle.
 */
function ensureMenuAttractShellAfterPreview() {
  menuPreviewNeedsFinalize = false;
  if (menuPreviewFinalizeId != null) {
    clearTimeout(menuPreviewFinalizeId);
    menuPreviewFinalizeId = null;
  }
  const d = deps;
  if (!d?.finalizeArenaShellForMenu) return;
  // * Only Classic uses the rave shell; other levels no-op inside the helper.
  d.finalizeArenaShellForMenu();
}

/**
 * Swaps arena geometry in place (preview or full quality).
 * @param {string | null | undefined} [levelId]
 * @param {{ menuPreview?: boolean, onProgress?: (pct: number, label: string) => void }} [opts]
 * @returns {Promise<void>}
 */
export async function swapLoadedLevel(levelId, opts = {}) {
  const d = requireDeps();
  const selected = resolveTargetLevelId(levelId);
  const menuPreview = opts.menuPreview === true;
  previewMode = menuPreview;

  const t0 = typeof performance !== "undefined" ? performance.now() : 0;
  await d.performLevelLoad(selected, {
    menuPreview,
    reflectorTextureSize: menuPreview ? PREVIEW_REFLECTOR_SIZE : PLAY_ENTRY_REFLECTOR_SIZE,
    onProgress: opts.onProgress,
  });
  loadedLevelId = selected;

  if (import.meta.env.DEV && typeof location !== "undefined"
    && /(?:^|[?&])perf=1(?:&|$)/.test(location.search || "")) {
    const ms = (typeof performance !== "undefined" ? performance.now() : t0) - t0;
    // eslint-disable-next-line no-console
    console.log(`[perf] swapLoadedLevel ${selected} menuPreview=${menuPreview} ${ms.toFixed(1)}ms`);
  }

  if (menuPreview) {
    previewNeedsFullRebuild = true;
    d.onPreviewSwapComplete?.(selected);
    // * Inside the caller's attract mask: sky + stadium for Classic (not lasers).
    ensureMenuAttractShellAfterPreview();
    return;
  }

  previewMode = false;
  previewNeedsFullRebuild = false;
  menuPreviewNeedsFinalize = false;
  d.finalizeArenaForPlay();
}

/**
 * Play-entry rebuild: ensures arena matches menu selection at full quality.
 * @param {string | null | undefined} [levelId]
 * @param {(pct: number, label: string) => void} [onProgress]
 * @returns {Promise<void>}
 */
export async function rebuildLevelIfNeeded(levelId, onProgress) {
  const d = requireDeps();
  if (!canSafelyRebuildLevel()) return;
  if (levelRebuildPromise) return levelRebuildPromise;

  const selected = resolveTargetLevelId(levelId);

  levelRebuildPromise = (async () => {
    // * Cold-load the *selected* arena when the world is still empty — avoids
    // * bootstrapWorldCore(default) then an immediate full swap to `selected`.
    await d.ensureWorldBootstrapped(selected);
    const needsFullSwap = selected !== loadedLevelId || previewNeedsFullRebuild || previewMode;
    if (needsFullSwap) {
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.log(
          "[bootstrap] play-entry level rebuild",
          loadedLevelId,
          "→",
          selected,
          previewNeedsFullRebuild ? "(from preview LOD)" : "",
        );
      }
      isSwappingLevel = true;
      await yieldForPaint();
      const canvas = d.getCanvas();
      /** @type {Promise<void>} */
      let swapPromise = Promise.resolve();
      const runSwap = () => {
        // * crossfade midway is sync — capture the async load so we can await it after fade.
        swapPromise = swapLoadedLevel(selected, { onProgress });
      };
      if (canvas) {
        await d.crossfadeElement(canvas, runSwap);
      } else {
        runSwap();
      }
      await swapPromise;
      // * Play entry runs behind the loading overlay — full warm (arena + VFX anchors).
      if (d.warmupAfterLevelSwap) await d.warmupAfterLevelSwap({ forPlay: true });
      await yieldForPaint();
      isSwappingLevel = false;
    } else if (menuPreviewNeedsFinalize) {
      // * Same level already full-quality, finalize-only: clear preview flags + promote extras.
      // * (previewMode true always takes the full-swap branch above.)
      previewMode = false;
      menuPreviewNeedsFinalize = false;
      d.finalizeArenaForPlay();
      if (d.warmupAfterLevelSwap) await d.warmupAfterLevelSwap({ forPlay: true });
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
async function previewMenuLevelIfNeeded(levelId) {
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
        const selected = selectedOverride ?? resolvePreviewTargetLevelId();
        if (selected === loadedLevelId) break;

        if (import.meta.env.DEV) {
          // eslint-disable-next-line no-console
          console.log("[menu-preview] swap", loadedLevelId, "→", selected);
        }

        await yieldForPaint();
        // * Masked swap: attract-hold + opaque-backdrop reveal + light compile so the
        // * first attract frame after reveal does not sync-compile. The swap hides
        // * behind the menu's own backdrop (see maskMenuPreviewSwap); the release
        // * crossfades the new arena in underneath the persistent menu. Menu uses
        // * light warm (no VFX anchors — those install once at play entry).
        const runSwap = async () => {
          await swapLoadedLevel(selected, { menuPreview: true });
          if (d.warmupAfterLevelSwap) await d.warmupAfterLevelSwap({ forPlay: false });
        };
        if (d.maskMenuPreviewSwap) {
          await d.maskMenuPreviewSwap(runSwap, { fade: true });
        } else {
          await runSwap();
        }
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
    const levelId = resolvePreviewTargetLevelId();
    if (levelId === loadedLevelId) return;
    const runPreview = () => { void previewMenuLevelIfNeeded(); };
    // * Run geometry swap on idle so picker taps never block the menu UI thread.
    // * Run-6: timeout 900→2000 — the forced-at-900ms swap landed exactly while the
    // * player was still clicking through the picker (the multi-second lobby stalls in
    // * the captures); a longer leash waits for genuine idle far more often.
    if (typeof requestIdleCallback === "function") {
      requestIdleCallback(runPreview, { timeout: 2000 });
    } else {
      runPreview();
    }
  // * Slightly longer than 120ms so rapid arena cycling coalesces into one swap.
  }, 200);
}

/**
 * Promotes a preview-quality arena to full play quality (clears preview flags first).
 */
export function finalizeArenaForPlayEntry() {
  previewMode = false;
  menuPreviewNeedsFinalize = false;
  requireDeps().finalizeArenaForPlay();
}
