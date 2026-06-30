/**
 * Menu → gameplay bootstrap orchestration.
 * Owns play-entry loading, world warm-up, and session cart readiness promises.
 * Level mesh loading is orchestrated by levelManager.js; Rapier warm-up stays here.
 */

import { prefetchRaveGltf } from "./cartRaveGltf.js";
import { resolveLevelId, LEVEL_STORAGE_KEY } from "./levels/index.js";
import { withModeEntryLoading, yieldForPaint } from "./ui/loadingScreen.js";
import { getNetSlots } from "./netcode.js";

/** @type {import("./bootstrap.js").BootstrapDeps | null} */
let deps = null;

/** @type {Promise<void> | null} */
let activePlayBootstrapPromise = null;

let worldBootstrapDone = false;
/** @type {Promise<void> | null} */
let worldBootstrapPromise = null;

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
 * @property {() => Promise<void>} rebuildLevelIfNeeded
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
  const stored = typeof localStorage !== "undefined"
    ? localStorage.getItem(LEVEL_STORAGE_KEY)
    : null;
  return resolveLevelId(stored);
}

/**
 * Whether the Rapier world and core arena geometry have finished their first load.
 * @returns {boolean}
 */
export function isWorldBootstrapped() {
  return worldBootstrapDone;
}

/**
 * Ensures Rapier WASM and the core arena are loaded (idempotent).
 * @returns {Promise<void>}
 */
export async function ensureWorldBootstrapped() {
  requireDeps();
  if (worldBootstrapDone) return;
  if (!worldBootstrapPromise) {
    worldBootstrapPromise = deps.ensureRapierPhysics()
      .then(async () => {
        if (!worldBootstrapDone) {
          if (import.meta.env.DEV) {
            // eslint-disable-next-line no-console
            console.log("[bootstrap] arena core load start");
          }
          await deps.bootstrapWorldCore(undefined);
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
  return sessionCartBootstrapPromise;
}

/**
 * Clears play-entry promise tracking so a new enterPlayMode can start.
 * Does not tear down an already-bootstrapped world.
 */
export function cancelBootstrap() {
  activePlayBootstrapPromise = null;
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

  if (skipBootstrap) {
    d.commitMenuHiddenForGame();
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

  const arenaReady = worldBootstrapDone && levelId === d.getLoadedLevelId();

  activePlayBootstrapPromise = withModeEntryLoading(async () => {
    const previewPromise = d.getMenuLevelPreviewPromise?.();
    if (previewPromise) await previewPromise;
    const rebuildPromise = d.getLevelRebuildPromise?.();
    if (rebuildPromise) await rebuildPromise;
    if (!arenaReady) {
      await d.rebuildLevelIfNeeded(levelId);
      await ensureWorldBootstrapped();
    } else if (d.getMenuPreviewNeedsFinalize?.()) {
      d.finalizeArenaForPlay();
    }
    if (commitMenuHidden) {
      d.commitMenuHiddenForGame();
    }
  }, { gameMode, levelId }).finally(() => {
    activePlayBootstrapPromise = null;
  });

  return activePlayBootstrapPromise;
}
