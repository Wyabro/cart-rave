// levels/index.js — Central level loader (dynamic imports for code-splitting)

import { computeSpawnRingRadius } from "../config.js";
import { STORAGE_KEYS, storageGet } from "../utils/storage.js";
import { setMenuPreviewVisualLod } from "../utils/qualityMode.js";
import { clearLevelLod } from "../utils/levelLod.js";
import { clearKoHitmarkers } from "../effects/koHitmarkerFx.js";
import { QUICKPLAY_ARENA_IDS } from "../../shared/arenaPool.js";
import { ARENA_BY_ID } from "./arenaCatalog.js";
import { FREE_LEVEL } from "../unlockConfig.js";

/** Re-exported for existing importers — the key itself lives in utils/storage.js. */
export const LEVEL_STORAGE_KEY = STORAGE_KEYS.level;
// * resolveLevelId's fallback. Must resolve to an arena every player has unlocked, so it
// * tracks the free level rather than naming an arena (UNLOCK-ORDER-1).
const DEFAULT_LEVEL_ID = FREE_LEVEL;

/** Lazy dynamic importers — each level ships as its own Vite chunk. */
export const LEVEL_IMPORTERS = {
  classicRecord: () => import("./classicRecord.js").then((m) => m.initClassicRecord),
  backrooms: () => import("./backroomsSupermarket.js").then((m) => m.initBackroomsSupermarket),
  zanzibar: () => import("./zanzibarPlatform.js").then((m) => m.initZanzibarPlatform),
  rooftop: () => import("./rooftop.js").then((m) => m.initRooftop),
  testArena: () => import("./testArena.js").then((m) => m.initTestArena),
};

/**
 * Arena chunks the menu can switch between — testArena is dev-only, excluded.
 * Also the Quickplay arena-rotation pool (nextQuickplayArenaId / QP-ORDER-1) and
 * the server's initial-arena pool (party/index.ts). Sourced from shared/ so the
 * Worker and client can't drift out of sync.
 */
const PREFETCHABLE_LEVEL_IDS = QUICKPLAY_ARENA_IDS;

let levelChunksPrefetched = false;

/**
 * Warms the arena code chunks (network fetch + parse) so the first menu arena
 * switch — or a play-entry into a non-default arena — never waits on a lazy
 * `import()` round-trip. Fire-and-forget from idle; no scene/physics work here.
 * Idempotent: the browser module cache dedupes, and we latch after the first call.
 *
 * @returns {Promise<void>}
 */
export function prefetchLevelChunks() {
  if (levelChunksPrefetched) return Promise.resolve();
  levelChunksPrefetched = true;
  return Promise.allSettled(
    PREFETCHABLE_LEVEL_IDS.map((id) => LEVEL_IMPORTERS[id]?.()),
  ).then(() => undefined);
}

/**
 * Resolves a raw level id from storage or menu to a supported loader key.
 *
 * @param {string | null | undefined} raw
 * @returns {"classicRecord" | "backrooms" | "zanzibar" | "rooftop" | "testArena"}
 */
export function resolveLevelId(raw) {
  if (raw && Object.hasOwn(ARENA_BY_ID, raw)) {
    return /** @type {"classicRecord" | "backrooms" | "zanzibar" | "rooftop" | "testArena"} */ (raw);
  }
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
 * @param {{ menuPreview?: boolean, reflectorTextureSize?: number, onProgress?: (pct: number, label: string) => void }} [options]
 * @returns {Promise<{
 *   recordMesh: import("three").Object3D,
 *   recordCollider?: import("@dimforge/rapier3d").Collider,
 *   recordColliderHandles?: number[],
 *   pitWallColliderHandle?: number | null,
 *   boothColliderHandles?: number[],
 *   bollardColliderHandles?: number[],
 *   boothNeonMeshes?: import("three").Mesh[],
 *   spindleLight?: import("three").PointLight | null,
 *   spindleLightColorPink?: import("three").Color | null,
 *   spindleLightColorCyan?: import("three").Color | null,
 *   pitInnerRadius?: number,
 *   recordLabelMat?: import("three").Material | null,
 *   aiHazards?: object | null,
 *   update?: (timeMs: number) => void,
 *   upgradeRecordReflector?: ((size: number) => void) | null,
 *   setReflectorVisible?: ((visible: boolean) => void) | null,
 *   applyQualityTier?: ((knobs: import("../utils/qualityTiers.js").QualityKnobs) => void) | null,
 *   dispose: () => void,
 * }>}
 */
export async function loadLevel(levelId, scene, world, config, options = {}) {
  const stored = levelId ?? storageGet(LEVEL_STORAGE_KEY);
  const resolved = resolveLevelId(stored);

  const onProgress = options.onProgress;
  onProgress?.(20, "Fetching level…");

  const importer = Object.hasOwn(LEVEL_IMPORTERS, resolved)
    ? LEVEL_IMPORTERS[resolved]
    : LEVEL_IMPORTERS[DEFAULT_LEVEL_ID];
  const initFn = await importer();

  // * Per-level overrides (radius, booth gap, spawn ring, and spawn angle).
  // * Applied before the level builds — levels read them live — and restored on dispose so
  // * the next level always starts from the base values. The formula-derived spawn ring
  // * must be recomputed when EITHER input moves: Storerooms
  // * overrides only the gap, so keying the recompute off the radius alone would leave
  // * carts spawning on the old ring while the booths moved out from under them.
  const overrideRadius = config.record.radiusByLevel?.[resolved];
  const overrideGap = config.booth.gapDistanceByLevel?.[resolved];
  const overrideSpawnRing = config.cart.spawnRingRadiusByLevel?.[resolved];
  const overrideSpawnAngle = config.cart.spawnAngleOffsetByLevel?.[resolved];
  const prevRadius = config.record.radius;
  const prevGap = config.booth.gapDistance;
  const prevSpawnRing = config.cart.spawnRingRadius;
  const prevSpawnAngle = config.cart.spawnAngleOffset;
  const restoreOverrides = () => {
    config.record.radius = prevRadius;
    config.booth.gapDistance = prevGap;
    config.cart.spawnRingRadius = prevSpawnRing;
    config.cart.spawnAngleOffset = prevSpawnAngle;
  };
  if (overrideSpawnAngle != null) config.cart.spawnAngleOffset = overrideSpawnAngle;
  if (overrideRadius != null || overrideGap != null) {
    if (overrideRadius != null) config.record.radius = overrideRadius;
    if (overrideGap != null) config.booth.gapDistance = overrideGap;
    config.cart.spawnRingRadius = computeSpawnRingRadius(config);
  }
  if (overrideSpawnRing != null) config.cart.spawnRingRadius = overrideSpawnRing;

  onProgress?.(60, "Building arena geometry…");
  clearLevelLod();
  clearKoHitmarkers();
  let result;
  const t0 = typeof performance !== "undefined" ? performance.now() : 0;
  // * Menu preview: force visual LOD gates (isLowQualityMode) for the init only —
  // * does not touch the user's stored quality preference.
  const menuPreview = options.menuPreview === true;
  if (menuPreview) setMenuPreviewVisualLod(true);
  try {
    result = await initFn(scene, world, config, options);
  } catch (err) {
    restoreOverrides();
    throw err;
  } finally {
    if (menuPreview) setMenuPreviewVisualLod(false);
  }
  if (import.meta.env.DEV && typeof location !== "undefined"
    && /(?:^|[?&])perf=1(?:&|$)/.test(location.search || "")) {
    const ms = (typeof performance !== "undefined" ? performance.now() : t0) - t0;
    // eslint-disable-next-line no-console
    console.log(
      `[perf] loadLevel ${resolved} menuPreview=${menuPreview} build=${ms.toFixed(1)}ms`,
    );
  }

  {
    const levelDispose = result.dispose;
    result.dispose = () => {
      clearLevelLod();
      clearKoHitmarkers();
      levelDispose();
      restoreOverrides();
    };
  }

  onProgress?.(90, "Physics colliders ready");
  return result;
}
