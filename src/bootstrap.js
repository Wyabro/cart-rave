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

/** @type {import("./bootstrap.js").BootstrapDeps | null} */
let deps = null;

/** @type {Promise<void> | null} */
let activePlayBootstrapPromise = null;

let worldBootstrapDone = false;
/** @type {Promise<void> | null} */
let worldBootstrapPromise = null;

/**
 * Set when the player commits to play entry (Solo / Quickplay / Friends).
 * Stops the delayed menu idle-warm from starting a *default* arena cold-load
 * that would then be thrown away and rebuilt for the selected level.
 */
let idleWorldWarmSuppressed = false;

/** @type {Promise<unknown> | null} */
let sessionCartBootstrapPromise = null;

/** Tracks the last hello generation for which carts were successfully created. */
let lastSuccessfulHelloGen = null;

/**
 * @typedef {object} BootstrapDeps
 * @property {() => string} detectGameMode
 * @property {() => boolean} getMenuVisible
 * @property {() => void} commitMenuHiddenForGame
 * @property {() => string} getLoadedLevelId
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
 * Ensures Rapier WASM and the core arena are loaded (idempotent).
 *
 * @param {string | null | undefined} [levelIdOverride] When the world is still cold,
 *   load this arena as the first build (avoids default-level → selected-level double load
 *   on first Solo). Ignored once a bootstrap is already in flight or complete.
 * @returns {Promise<void>}
 */
export async function ensureWorldBootstrapped(levelIdOverride) {
  requireDeps();
  if (worldBootstrapDone) return;
  if (!worldBootstrapPromise) {
    const levelArg =
      levelIdOverride != null && String(levelIdOverride).trim() !== ""
        ? resolveLevelId(levelIdOverride)
        : undefined;
    worldBootstrapPromise = deps.ensureRapierPhysics()
      .then(async () => {
        if (!worldBootstrapDone) {
          if (import.meta.env.DEV) {
            // eslint-disable-next-line no-console
            console.log(
              "[bootstrap] arena core load start",
              levelArg ?? "(storage default)",
            );
          }
          await deps.bootstrapWorldCore(levelArg);
          worldBootstrapDone = true;
          if (import.meta.env.DEV) {
            // eslint-disable-next-line no-console
            console.log("[bootstrap] arena core load done");
          }
        }
      })
      .catch((err) => {
        worldBootstrapPromise = null;
        throw err;
      });
  }
  return worldBootstrapPromise;
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

  console.log("[bootstrap] ensureSessionCartsReady called", {
    helloGen: bootstrapGen,
    hasHello: helloGate.isReceived(),
  });

  if (lastSuccessfulHelloGen === bootstrapGen && existing?.length) {
    console.log("[bootstrap] Skipping ensureSessionCartsReady — carts already exist for current hello gen");
    return existing;
  }

  if (existing?.length) return existing;

  if (!sessionCartBootstrapPromise) {
    sessionCartBootstrapPromise = (async () => {
      console.log("[bootstrap] Starting cart bootstrap (waiting for hello)...");
      if (!helloGate.isReceived()) {
        await helloGate.getFirstPromise();
      }
      if (bootstrapGen !== helloGate.getGeneration()) {
        console.log("[bootstrap] Aborting cart bootstrap — hello generation changed (race)");
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
      console.log("[bootstrap] Hello received, creating carts from slots", {
        slotCount: getNetSlots()?.length,
      });
      const created = d.bootstrapSessionCarts(bootstrapGen);
      if (bootstrapGen === helloGate.getGeneration()) {
        lastSuccessfulHelloGen = bootstrapGen;
      }
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
 * }} [opts]
 * @returns {Promise<void>}
 */
export async function enterPlayMode(opts = {}) {
  const d = requireDeps();
  const {
    gameMode: gameModeOpt,
    levelId: levelIdOpt,
    commitMenuHidden: commitMenuHiddenOpt,
    skipBootstrap = false,
  } = opts;

  const gameMode = gameModeOpt ?? d.detectGameMode();
  const levelId = levelIdOpt ?? (d.getSelectedLevelId
    ? d.getSelectedLevelId()
    : resolveSelectedLevelId(null));
  const commitMenuHidden = commitMenuHiddenOpt ?? (gameMode === "solo" || gameMode === "testdrive");

  // * Immediately hide main menu HTML overlay if requested (prevent UI overlap while loading screen warms up)
  if (commitMenuHidden && d.getMenuVisible()) {
    d.commitMenuHiddenForGame();
  }

  if (skipBootstrap) {
    if (d.getMenuVisible()) d.commitMenuHiddenForGame();
    return;
  }

  // * Quickplay hello can arrive while arena warm-up is still running — piggyback.
  if (activePlayBootstrapPromise) {
    return activePlayBootstrapPromise.then(() => {
      if (commitMenuHidden && d.getMenuVisible()) {
        d.commitMenuHiddenForGame();
      }
    });
  }

  d.cancelMenuPreviewTimers?.();
  // * Play entry owns the cold-load from here — don't let delayed menu idle-warm
  // * start a default-arena bootstrap that we'd immediately tear down.
  idleWorldWarmSuppressed = true;

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

    if (needsFullRebuild) {
      reportProgress(15, "Building arena…");
      await d.rebuildLevelIfNeeded(levelId, reportProgress);
      reportProgress(88, "Warming physics…");
      await ensureWorldBootstrapped(levelId);
    } else {
      // * Same full-quality arena: still promote deferred extras / materials / reflector.
      d.finalizeArenaForPlay();
    }

    reportProgress(94, "Loading carts…");
    await cartPrefetch;
    reportProgress(100, "Ready!");
    if (commitMenuHidden) {
      d.commitMenuHiddenForGame();
    }
  }, { gameMode, levelId }).finally(() => {
    activePlayBootstrapPromise = null;
  });

  return activePlayBootstrapPromise;
}
