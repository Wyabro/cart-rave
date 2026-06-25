// levels/index.js — Central level loader

import { initClassicRecord } from "./classicRecord.js";
import { initBackroomsSupermarket } from "./backroomsSupermarket.js";

export const LEVEL_STORAGE_KEY = "cartRaveLevel";
const DEFAULT_LEVEL_ID = "classicRecord";

const LEVEL_INIT = {
  classicRecord: initClassicRecord,
  backrooms: initBackroomsSupermarket,
};

/**
 * Resolves a raw level id from storage or menu to a supported loader key.
 *
 * @param {string | null | undefined} raw
 * @returns {"classicRecord" | "backrooms"}
 */
export function resolveLevelId(raw) {
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
 * @param {import("@dimforge/rapier3d-compat").World} world Active Rapier physics world.
 * @param {object} config Full game CONFIG passed through to the level init.
 * @returns {ReturnType<typeof initClassicRecord>}
 */
export function loadLevel(levelId, scene, world, config, options = {}) {
  const stored =
    levelId ??
    (typeof localStorage !== "undefined"
      ? localStorage.getItem(LEVEL_STORAGE_KEY)
      : null);
  const resolved = resolveLevelId(stored);
  const initFn = LEVEL_INIT[resolved] ?? initClassicRecord;
  return initFn(scene, world, config, options);
}
