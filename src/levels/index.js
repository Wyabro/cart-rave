// levels/index.js — Central level loader (dynamic imports for code-splitting)

export const LEVEL_STORAGE_KEY = "cartRaveLevel";
const DEFAULT_LEVEL_ID = "classicRecord";

/** Lazy dynamic importers — each level ships as its own Vite chunk. */
const LEVEL_IMPORTERS = {
  classicRecord: () => import("./classicRecord.js").then((m) => m.initClassicRecord),
  backrooms: () => import("./backroomsSupermarket.js").then((m) => m.initBackroomsSupermarket),
  testArena: () => import("./testArena.js").then((m) => m.initTestArena),
};

/**
 * Resolves a raw level id from storage or menu to a supported loader key.
 *
 * @param {string | null | undefined} raw
 * @returns {"classicRecord" | "backrooms" | "testArena"}
 */
export function resolveLevelId(raw) {
  if (raw === "testArena") return "testArena";
  if (raw === "backrooms") return "backrooms";
  if (raw === "classicRecord") return "classicRecord";
  return DEFAULT_LEVEL_ID;
}

/**
 * Loads the selected arena level into the scene and physics world.
 * When `levelId` is omitted, reads `cartRaveLevel` from localStorage.
 *
 * @param {string | null | undefined} levelId Level id override (optional).
 * @param {THREE.Scene} scene Root Three.js scene.
 * @param {import("@dimforge/rapier3d").World} world Active Rapier physics world.
 * @param {object} config Full game CONFIG passed through to the level init.
 * @param {{ reflectorTextureSize?: number, onProgress?: (pct: number, label: string) => void }} [options]
 * @returns {Promise<ReturnType<import("./classicRecord.js").initClassicRecord>>}
 */
export async function loadLevel(levelId, scene, world, config, options = {}) {
  const stored =
    levelId ??
    (typeof localStorage !== "undefined"
      ? localStorage.getItem(LEVEL_STORAGE_KEY)
      : null);
  const resolved = resolveLevelId(stored);

  const onProgress = options.onProgress;
  onProgress?.(20, "Fetching level…");

  const importer = LEVEL_IMPORTERS[resolved] ?? LEVEL_IMPORTERS[DEFAULT_LEVEL_ID];
  const initFn = await importer();

  onProgress?.(60, "Building arena geometry…");
  const result = initFn(scene, world, config, options);

  onProgress?.(90, "Physics colliders ready");
  return result;
}
