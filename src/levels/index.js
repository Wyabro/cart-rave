// levels/index.js — Central level loader (dynamic imports for code-splitting)

import { computeSpawnRingRadius } from "../config.js";
import { STORAGE_KEYS, storageGet } from "../utils/storage.js";
import { setMenuPreviewVisualLod } from "../utils/qualityMode.js";
import { clearLevelLod } from "../utils/levelLod.js";

/** Re-exported for existing importers — the key itself lives in utils/storage.js. */
export const LEVEL_STORAGE_KEY = STORAGE_KEYS.level;
const DEFAULT_LEVEL_ID = "classicRecord";

/** Lazy dynamic importers — each level ships as its own Vite chunk. */
const LEVEL_IMPORTERS = {
  classicRecord: () => import("./classicRecord.js").then((m) => m.initClassicRecord),
  backrooms: () => import("./backroomsSupermarket.js").then((m) => m.initBackroomsSupermarket),
  zanzibar: () => import("./zanzibarPlatform.js").then((m) => m.initZanzibarPlatform),
  testArena: () => import("./testArena.js").then((m) => m.initTestArena),
};

/**
 * Resolves a raw level id from storage or menu to a supported loader key.
 *
 * @param {string | null | undefined} raw
 * @returns {"classicRecord" | "backrooms" | "zanzibar" | "testArena"}
 */
export function resolveLevelId(raw) {
  if (raw === "testArena") return "testArena";
  if (raw === "zanzibar") return "zanzibar";
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
 * @param {{ menuPreview?: boolean, reflectorTextureSize?: number, onProgress?: (pct: number, label: string) => void }} [options]
 * @returns {Promise<{
 *   recordMesh: import("three").Object3D,
 *   recordCollider?: import("@dimforge/rapier3d").Collider,
 *   recordColliderHandles?: number[],
 *   pitWallColliderHandle?: number | null,
 *   boothColliderHandles?: number[],
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
 *   dispose: () => void,
 * }>}
 */
export async function loadLevel(levelId, scene, world, config, options = {}) {
  const stored = levelId ?? storageGet(LEVEL_STORAGE_KEY);
  const resolved = resolveLevelId(stored);

  const onProgress = options.onProgress;
  onProgress?.(20, "Fetching level…");

  const importer = LEVEL_IMPORTERS[resolved] ?? LEVEL_IMPORTERS[DEFAULT_LEVEL_ID];
  const initFn = await importer();

  // * Per-level arena radius override (config.record.radiusByLevel). Applied before the
  // * level builds — levels read record.radius live — and restored on dispose so the next
  // * level always starts from the base value. Spawn ring is the one cached derived value.
  const overrideRadius = config.record.radiusByLevel?.[resolved];
  const prevRadius = config.record.radius;
  const prevSpawnRing = config.cart.spawnRingRadius;
  if (overrideRadius != null) {
    config.record.radius = overrideRadius;
    config.cart.spawnRingRadius = computeSpawnRingRadius(config);
  }

  onProgress?.(60, "Building arena geometry…");
  clearLevelLod();
  let result;
  const t0 = typeof performance !== "undefined" ? performance.now() : 0;
  // * Menu preview: force visual LOD gates (isLowQualityMode) for the init only —
  // * does not touch the user's stored quality preference.
  const menuPreview = options.menuPreview === true;
  if (menuPreview) setMenuPreviewVisualLod(true);
  try {
    result = initFn(scene, world, config, options);
  } catch (err) {
    if (overrideRadius != null) {
      config.record.radius = prevRadius;
      config.cart.spawnRingRadius = prevSpawnRing;
    }
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
      levelDispose();
      if (overrideRadius != null) {
        config.record.radius = prevRadius;
        config.cart.spawnRingRadius = prevSpawnRing;
      }
    };
  }

  onProgress?.(90, "Physics colliders ready");
  return result;
}
