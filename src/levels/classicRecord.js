// classicRecord.js — Classic Record vinyl arena (current default level)

import { initArena } from "../arena.js";

/**
 * Builds the Classic Record dancefloor arena: vinyl record mesh, physics ring,
 * center pit wall, and four spawn booths.
 *
 * @param {THREE.Scene} scene Root Three.js scene.
 * @param {import("@dimforge/rapier3d-compat").World} world Active Rapier physics world.
 * @param {object} config Full game CONFIG (record, booth, debug sections).
 * @returns {ReturnType<typeof initArena>}
 */
export function initClassicRecord(scene, world, config, options = {}) {
  return initArena(scene, world, config, options);
}
