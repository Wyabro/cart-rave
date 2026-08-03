/**
 * Menu → gameplay bootstrap orchestration.
 * Owns play-entry loading, world warm-up, and session cart readiness promises.
 * Level mesh loading is orchestrated by levelManager.js; Rapier warm-up stays here.
 */

import { prefetchRaveGltf } from "./cartRaveGltf.js";
import { resolveLevelId, LEVEL_STORAGE_KEY } from "./levels/index.js";
import { storageGet } from "./utils/storage.js";
import { withModeEntryLoading, yieldForPaint } from "./ui/loadingScreen.js";
import { getNetSlots } from "./netcode.js";
import { markBootPhase } from "./utils/bootTimeline.js";

/** @type {import("./bootstrap.js").BootstrapDeps | null} */
let deps = null;

/** @type {Promise<void> | null} */
let activePlayBootstrapPromise = null;

/**
 * Bumped by {@link invalidateActivePlayEntry} on session teardown. An in-flight
 * play entry finishes its (harmless) arena work, but its deferred menu-hide must
 * not fire after a returnToMenu — the stale commitMenuHiddenForGame would fight
 * initMenu and strand the menu drawn over a dead/live session (host-reload
 * mid-round stuck-menu, 07-17 playtest).
 */
let playEntryGeneration = 0;

/** Invalidates the deferred menu-hide of any in-flight play entry. */
export function invalidateActivePlayEntry() {
  playEntryGeneration += 1;
}

let worldBootstrapDone = false;
/** @type {Promise<void> | null} */
let worldBootstrapPromise = null;
/**
 * BOOT-PERF-1: bumped when a mid-flight warm is retargeted to a different arena.
 * Stale flights must not set {@link worldBootstrapDone} for the wrong level.
 */
let worldBootstrapGen = 0;
/** Level id the current in-flight (or last completed) bootstrap is targeting. */
let worldBootstrapTarget = /** @type {string | null} */ (null);

/**
 * Set when the player commits to play entry (Solo / Quickplay / Friends).
 * Stops the delayed menu idle-warm from starting a cold-load for a stale
 * selection that would then be thrown away and rebuilt for the selected level.
 */
let idleWorldWarmSuppressed = false;

/** @type {Promise<unknown> | null} */
let sessionCartBootstrapPromise = null;

/** Tracks the last hello generation for which carts were successfully created. */
let lastSuccessfulHelloGen = null;

/**
 * True when the most recent enterPlayMode skipped a full arena rebuild (same-level warm).
 * Consumed by ensureSessionCartsReady so shader warm uses a short compileAsync budget.
 */
let lastPlayEntryWarm = false;

/**
 * @typedef {object} BootstrapDeps
 * @property {() => string} detectGameMode
 * @property {() => boolean} getMenuVisible
 * @property {() => void} commitMenuHiddenForGame
 * @property {() => string} getLoadedLevelId
 * @property {() => void} [stopMenuMusicForPlay] Synchronous menu-music stop at play
 *   entry — must run before the deferred menu-hide (bleed race, run-6).
 * @property {() => string | null | undefined} [getSelectedLevelId]
 * @property {() => void} [cancelMenuPreviewTimers]
 * @property {() => Promise<void> | null | undefined} [getMenuLevelPreviewPromise]
 * @property {() => Promise<void> | null | undefined} [getLevelRebuildPromise]
 * @property {() => boolean} [getMenuPreviewNeedsFinalize]
 * @property {() => boolean} [getPreviewNeedsFullRebuild]
 * @property {(levelId?: string | null, onProgress?: (pct: number, label: string) => void) => Promise<void>} rebuildLevelIfNeeded
 * @property {() => void} finalizeArenaForPlay
 * @property {() => Promise<void>} ensureRapierPhysics
 * @property {(levelIdOverride?: string) => Promise<void>} bootstrapWorldCore
 * @property {() => { getGeneration: () => number, isReceived: () => boolean, getFirstPromise: () => Promise<void> }} getHelloGate
 * @property {() => Array<object> | null | undefined} getAllCartsRef
 * @property {(expectedGen: number) => Array<object> | null} bootstrapSessionCarts
 * @property {(opts?: { warm?: boolean, juiceFresh?: boolean }) => Promise<void>} [warmupBeforeRoundStart] Compiles the live
 *   scene's shader programs (carts + arena + VFX warmup anchors) after carts exist. Solo's
 *   game-start fires when ensureSessionCartsReady resolves, so awaiting this inside
 *   the cart bootstrap keeps the first countdown from starting into a compile freeze.
 *   `warm: true` uses a short compileAsync budget (arena already compiled).
 *   `juiceFresh: true` forces the full budget even when warm (rave juice first-built this entry).
 * @property {() => boolean} [consumeRaveJuiceJustBuilt] True once if lasers/billboard were
 *   first-built since last consume (menu attract is includeJuice:false).
 */

/**
 * Wires main-owned arena/session helpers into the bootstrap module.
 * Call once from main() before menu auto-entry paths run.
 * @param {BootstrapDeps} dependencies
 */
export function initBootstrap(dependencies) {
  deps = dependencies;
}

function requireDeps() {
  if (!deps) {
    throw new Error("[bootstrap] initBootstrap() must run before enterPlayMode()");
  }
  return deps;
}

function resolveSelectedLevelId(levelId) {
  if (levelId != null) return resolveLevelId(levelId);
  return resolveLevelId(storageGet(LEVEL_STORAGE_KEY));
}

/**
 * Whether the Rapier world and core arena geometry have finished their first load.
 * @returns {boolean}
 */
export function isWorldBootstrapped() {
  return worldBootstrapDone;
}

/**
 * True once play entry has claimed the cold-load path (or the world is already warm).
 * Menu idle-warm should no-op when this is true so it cannot race Solo with the wrong level.
 * @returns {boolean}
 */
export function isIdleWorldWarmSuppressed() {
  return idleWorldWarmSuppressed || worldBootstrapDone;
}

/**
 * True while a cold-load is in flight and not yet marked done (BOOT-PERF-1 retarget window).
 * @returns {boolean}
 */
export function isWorldBootstrapInFlight() {
  return Boolean(worldBootstrapPromise) && !worldBootstrapDone;
}

/**
 * Ensures Rapier WASM and the core arena are loaded.
 *
 * BOOT-PERF-1: not sticky-first-wins. Callers pass the **selected** arena; a mid-flight
 * retarget bumps a generation so the stale flight does not latch `worldBootstrapDone`
 * for the wrong level. Concurrent flights are serialized (newer awaits prior settle).
 *
 * @param {string | null | undefined} [levelIdOverride] Arena to cold-load when still cold.
 *   Omitting reads {@link LEVEL_STORAGE_KEY} (menu selection). Once done, no-ops —
 *   play-entry uses rebuildLevelIfNeeded for a later level mismatch.
 * @returns {Promise<void>}
 */
export function ensureWorldBootstrapped(levelIdOverride) {
  requireDeps();
  const levelArg =
    levelIdOverride != null && String(levelIdOverride).trim() !== ""
      ? resolveLevelId(levelIdOverride)
      : resolveLevelId(storageGet(LEVEL_STORAGE_KEY));

  // * Not async: callers must share the same Promise identity on same-target join
  // * (async/await would wrap a new outer promise every call).
  if (worldBootstrapDone) return Promise.resolve();

  // * Join the in-flight warm when it already targets this arena.
  if (worldBootstrapPromise && worldBootstrapTarget === levelArg) {
    return worldBootstrapPromise;
  }

  // * First start or mid-flight retarget: new generation owns done-latch.
  worldBootstrapGen += 1;
  const gen = worldBootstrapGen;
  const prev = worldBootstrapPromise;
  worldBootstrapTarget = levelArg;

  // * Boot timeline: world-ready − world-init-start is the cold-load stall window
  // * (Rapier WASM + arena build) — the NET-2 join-freeze mechanism, now measurable.
  markBootPhase("world-init-start", { level: levelArg, gen });

  worldBootstrapPromise = (async () => {
    if (prev) {
      try {
        await prev;
      } catch {
        // * Prior flight failed or was abandoned — continue if we still own gen.
      }
    }
    if (gen !== worldBootstrapGen || worldBootstrapDone) return;

    await deps.ensureRapierPhysics();
    if (gen !== worldBootstrapGen || worldBootstrapDone) return;

    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.log("[bootstrap] arena core load start", levelArg, { gen });
    }
    await deps.bootstrapWorldCore(levelArg);
    if (gen !== worldBootstrapGen) {
      // * Stale: do not latch done for the wrong arena. A newer flight owns the promise.
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.log("[bootstrap] arena core load discarded (retargeted)", levelArg, { gen });
      }
      return;
    }

    worldBootstrapDone = true;
    markBootPhase("world-ready", { level: levelArg });
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.log("[bootstrap] arena core load done", levelArg);
    }
  })().catch((err) => {
    if (gen === worldBootstrapGen) {
      worldBootstrapPromise = null;
      worldBootstrapTarget = null;
    }
    throw err;
  });

  return worldBootstrapPromise;
}

/** @returns {string | null} Target of the current/last bootstrap (test + diag). */
export function getWorldBootstrapTarget() {
  return worldBootstrapTarget;
}

/** @returns {number} Current bootstrap generation (test + diag). */
export function getWorldBootstrapGen() {
  return worldBootstrapGen;
}

/**
 * Test-only: reset cold-load latch between cases. Not used by game code.
 */
export function resetWorldBootstrapForTest() {
  worldBootstrapDone = false;
  worldBootstrapPromise = null;
  worldBootstrapGen = 0;
  worldBootstrapTarget = null;
  idleWorldWarmSuppressed = false;
}

/**
 * True once session carts exist and any in-flight cart/shader bootstrap has finished.
 * Cap-59: non-host must not surface countdown UI mid play-shader (Intel/Firefox multi-s freeze).
 * @returns {boolean}
 */
export function isSessionCartsReady() {
  try {
    const d = requireDeps();
    // * In-flight bootstrap still includes play-shader warm — not ready yet.
    if (sessionCartBootstrapPromise) return false;
    const carts = d.getAllCartsRef?.();
    if (!Array.isArray(carts) || carts.length === 0) return false;
    const helloGate = d.getHelloGate?.();
    if (helloGate && !helloGate.isReceived()) return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * Ensures slot carts exist after the first server hello (idempotent).
 * @returns {Promise<Array<object> | null | undefined>}
 */
export async function ensureSessionCartsReady() {
  const d = requireDeps();
  const existing = d.getAllCartsRef();

  const helloGate = d.getHelloGate();
  const bootstrapGen = helloGate.getGeneration();

  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.log("[bootstrap] ensureSessionCartsReady called", {
      helloGen: bootstrapGen,
      hasHello: helloGate.isReceived(),
    });
  }

  if (lastSuccessfulHelloGen === bootstrapGen && existing?.length) {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.log("[bootstrap] Skipping ensureSessionCartsReady — carts already exist for current hello gen");
    }
    return existing;
  }

  if (existing?.length) return existing;

  if (!sessionCartBootstrapPromise) {
    sessionCartBootstrapPromise = (async () => {
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.log("[bootstrap] Starting cart bootstrap (waiting for hello)...");
      }
      if (!helloGate.isReceived()) {
        await helloGate.getFirstPromise();
      }
      if (bootstrapGen !== helloGate.getGeneration()) {
        if (import.meta.env.DEV) {
          // eslint-disable-next-line no-console
          console.log("[bootstrap] Aborting cart bootstrap — hello generation changed (race)");
        }
        return null;
      }
      if (d.getAllCartsRef()?.length) return d.getAllCartsRef();
      await ensureWorldBootstrapped();
      await prefetchRaveGltf().catch((err) => {
        console.warn(
          "[bootstrap] Rave GLTF prefetch failed — rave carts will use procedural fallback.",
          err,
        );
      });
      await yieldForPaint();
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.log("[bootstrap] Hello received, creating carts from slots", {
          slotCount: getNetSlots()?.length,
        });
      }
      const created = d.bootstrapSessionCarts(bootstrapGen);
      if (bootstrapGen === helloGate.getGeneration()) {
        lastSuccessfulHelloGen = bootstrapGen;
      }
      if (created) markBootPhase("play-carts-spawned");
      // * Warm-compile everything now in scene (carts, arena, VFX anchors) BEFORE this
      // * promise resolves — netcode's solo path fires game start off this resolution,
      // * so the countdown must not begin while shader compiles would freeze the frame.
      // * Warm play-entry passes warm:true → short compileAsync budget (see scene.js)
      // * UNLESS juice first-built this entry (FV-LOAD-1b) — full budget then.
      if (created && typeof d.warmupBeforeRoundStart === "function") {
        const juiceFresh =
          typeof d.consumeRaveJuiceJustBuilt === "function"
            ? d.consumeRaveJuiceJustBuilt()
            : false;
        const warm = lastPlayEntryWarm && !juiceFresh;
        markBootPhase("play-shader-start", { warm, juiceFresh });
        await d.warmupBeforeRoundStart({ warm: lastPlayEntryWarm, juiceFresh });
        markBootPhase("play-shader-end", { warm, juiceFresh });
      }
      // * Boot timeline: carts seated + shaders warmed — the round can truly start.
      if (created) markBootPhase("carts-ready");
      return created;
    })().finally(() => {
      if (bootstrapGen === helloGate.getGeneration()) {
        sessionCartBootstrapPromise = null;
      }
    });
  }
  // @ts-expect-error - Promise vs any[] mismatch from bootstrap chain; safe at runtime
  return sessionCartBootstrapPromise;
}

/** Clears in-flight session cart bootstrap (e.g. session teardown). */
export function resetSessionCartBootstrap() {
  sessionCartBootstrapPromise = null;
  lastSuccessfulHelloGen = null;
}

export function getLastSuccessfulHelloGen() {
  return lastSuccessfulHelloGen;
}

/**
 * Main entry for menu → gameplay: loading overlay, arena warm-up, optional menu hide.
 * Idempotent while a bootstrap is already in flight (returns the existing promise).
 *
 * @param {{
 *   gameMode?: string | null,
 *   levelId?: string | null,
 *   commitMenuHidden?: boolean,
 *   skipBootstrap?: boolean,
 *   onArenaReady?: (reportProgress: (pct: number, label: string) => void) => Promise<void> | void,
 * }} [opts]
 * `onArenaReady` runs under the loading overlay after the arena + cart GLB are
 * ready — solo/test-drive pass their netcode bootstrap here so cart creation and
 * shader warm-up finish before the overlay dismisses (and before game start fires).
 * @returns {Promise<void>}
 */
export async function enterPlayMode(opts = {}) {
  const d = requireDeps();
  const {
    gameMode: gameModeOpt,
    levelId: levelIdOpt,
    commitMenuHidden: commitMenuHiddenOpt,
    skipBootstrap = false,
    onArenaReady,
  } = opts;

  const entryGen = playEntryGeneration;
  const gameMode = gameModeOpt ?? d.detectGameMode();
  const levelId = levelIdOpt ?? (d.getSelectedLevelId
    ? d.getSelectedLevelId()
    : resolveSelectedLevelId(null));
  const commitMenuHidden = commitMenuHiddenOpt ?? (gameMode === "solo" || gameMode === "testdrive");

  // * Run-6 bleed fix: the menu-music stop must NOT ride the 320ms visual deferral
  // * below — that window is exactly the race a53f231 closed (late ctx.resume /
  // * onload replays start the menu track before commitMenuHiddenForGame stops it).
  // * Kill the music synchronously at the click; the deferral stays visual-only.
  d.stopMenuMusicForPlay?.();

  // * Run-5 "attract → loading is rough": hiding the menu HERE hard-cut to a bare
  // * canvas frame before the overlay had faded in. Instead let the overlay fade in
  // * OVER the menu (260ms CSS fade) and drop the menu once it's opaque; the
  // * end-of-task commit below stays as the idempotent backstop for fast loads.
  if (commitMenuHidden && d.getMenuVisible() && !skipBootstrap) {
    window.setTimeout(() => {
      if (playEntryGeneration === entryGen && d.getMenuVisible()) {
        d.commitMenuHiddenForGame();
      }
    }, 320);
  }

  if (skipBootstrap) {
    if (d.getMenuVisible()) d.commitMenuHiddenForGame();
    return;
  }

  // * Quickplay hello can arrive while arena warm-up is still running — piggyback.
  if (activePlayBootstrapPromise) {
    return activePlayBootstrapPromise.then(() => {
      if (commitMenuHidden && playEntryGeneration === entryGen && d.getMenuVisible()) {
        d.commitMenuHiddenForGame();
      }
    });
  }

  d.cancelMenuPreviewTimers?.();
  // * Play entry owns the cold-load from here — don't let delayed menu idle-warm
  // * start a default-arena bootstrap that we'd immediately tear down.
  idleWorldWarmSuppressed = true;
  markBootPhase("play-entry", { mode: gameMode, level: levelId ?? null });

  // * LOAD-PROGRESS-1: the meter's 15 → 88 window is one un-awaited world bootstrap
  // * (line 443 below, or main.js:5667 under ?harness=1), so the overlay anchors on the
  // * boot marks stamped inside it instead of on reports that do not exist. The
  // * `backfillBootMarks` predicate answers the one question it cannot: do ALREADY-STAMPED
  // * marks describe THIS load or a previous one? It is a callback rather than an import
  // * because loadingScreen.js may not import this module — it is imported BY it.
  activePlayBootstrapPromise = withModeEntryLoading(async (reportProgress) => {
    reportProgress(5, "Preparing…");

    // * Cart GLB in parallel with arena work (previously waited until session cart bootstrap).
    const cartPrefetch = prefetchRaveGltf().catch((err) => {
      console.warn(
        "[bootstrap] cart GLTF prefetch during play entry failed — procedural fallback may apply.",
        err,
      );
    });

    // * Claim cold load for the *selected* level ASAP so we win the race vs any
    // * idle warm that already scheduled with the storage default.
    void ensureWorldBootstrapped(levelId);

    const previewPromise = d.getMenuLevelPreviewPromise?.();
    if (previewPromise) await previewPromise;
    const rebuildPromise = d.getLevelRebuildPromise?.();
    if (rebuildPromise) await rebuildPromise;

    // * Recompute after in-flight menu work — idle warm / preview may have finished
    // * while we waited, making a full rebuild unnecessary (or newly necessary).
    const resolvedLevel = resolveLevelId(levelId);
    const sameLevelWarm =
      worldBootstrapDone && resolvedLevel === d.getLoadedLevelId();
    const needsFullRebuild =
      !sameLevelWarm || d.getPreviewNeedsFullRebuild?.() === true;
    // * Latch for cart bootstrap shader policy (short compile wait when no full rebuild).
    lastPlayEntryWarm = !needsFullRebuild;

    if (needsFullRebuild) {
      reportProgress(15, "Building arena…");
      await d.rebuildLevelIfNeeded(levelId, reportProgress);
      reportProgress(88, "Warming physics…");
      await ensureWorldBootstrapped(levelId);
    } else {
      // * Same full-quality arena: still promote deferred extras / materials / reflector.
      // * Mark warm so mode-entry can skip most of the artificial min-visible floor.
      reportProgress(88, "Arena ready…", { warm: true });
      d.finalizeArenaForPlay();
    }
    markBootPhase("play-arena-done", {
      warm: lastPlayEntryWarm,
      level: resolvedLevel,
    });

    reportProgress(94, "Loading carts…");
    await cartPrefetch;
    markBootPhase("play-cart-glb-done");
    if (typeof onArenaReady === "function") {
      // * Solo/test-drive: netcode bootstrap + cart creation + shader warm-up run
      // * here so the overlay only lifts when the round can truly start.
      await onArenaReady(reportProgress);
    }
    reportProgress(100, "Ready!");
    if (commitMenuHidden && playEntryGeneration === entryGen) {
      d.commitMenuHiddenForGame();
    }
  }, { gameMode, levelId, backfillBootMarks: () => isWorldBootstrapInFlight() }).finally(() => {
    activePlayBootstrapPromise = null;
  });

  return activePlayBootstrapPromise;
}
