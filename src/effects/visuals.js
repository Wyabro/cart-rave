// visuals.js — cart visual updates + misc visual helpers

import * as THREE from "three";
import { resetCartVisualState as _resetCartVisualState } from "../carts/cart.js";

export { _resetCartVisualState as resetCartVisualState };

/**
 * Removes and disposes every ram-boost streak (e.g. between-round reset).
 *
 * @param {Array<{ group?: THREE.Group, mesh?: THREE.Mesh, coreMat?: THREE.Material, glowMat?: THREE.Material, material?: THREE.Material }> | null | undefined} streaks
 * @param {THREE.Scene | null | undefined} scene
 */
export function disposeAllRamBoostStreaks(streaks, scene) {
  if (!streaks) return;

  for (let i = streaks.length - 1; i >= 0; i -= 1) {
    const s = streaks[i];
    if (!s) {
      streaks.splice(i, 1);
      continue;
    }

    if (scene && s.group) {
      scene.remove(s.group);
    } else if (scene && s.mesh) {
      scene.remove(s.mesh);
    }
    if (s.mesh?.geometry) {
      s.mesh.geometry.dispose();
    }
    if (s.coreMat) s.coreMat.dispose();
    if (s.glowMat) s.glowMat.dispose();
    if (s.material) {
      s.material.dispose();
    }
    streaks.splice(i, 1);
  }
}
