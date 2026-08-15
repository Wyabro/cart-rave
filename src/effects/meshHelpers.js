/**
 * meshHelpers.js — Shared Three.js subtree disposal helpers.
 *
 * Extracted from src/effects.js (EFFECTS-SPLIT-1): static mesh helpers used by
 * the crowd/arena dressing modules.
 */

import * as THREE from "three";

/** Texture slots a disposed material owns; `material.dispose()` never touches these. */
const DISPOSABLE_MAP_SLOTS = Object.freeze([
  "map",
  "normalMap",
  "roughnessMap",
  "metalnessMap",
  "emissiveMap",
  "alphaMap",
  "aoMap",
  "bumpMap",
]);

/**
 * Safely disposes a Three.js subtree (geometries + materials + the materials' maps).
 *
 * Materials flagged `userData.isSharedMaterial` are skipped whole — flag any material
 * that outlives the subtree, or whose maps do, since there is no shared-texture flag.
 * @param {THREE.Object3D | null | undefined} root
 */
export function disposeObject3D(root) {
  if (!root) return;
  if (root.parent) root.parent.remove(root);

  /**
   * @param {THREE.Material | THREE.Material[]} material
   */
  function disposeMaterial(material) {
    const mats = Array.isArray(material) ? material : [material];
    for (const m of mats) {
      if (!m || typeof m.dispose !== "function") continue;
      // * cart.js keeps SHARED_CHROME_MAT / SHARED_WHEEL_TIRE_MAT / SHARED_FACE_TRIM_MAT
      // * as module singletons bound to every cart in the scene, so disposing one here
      // * deallocates GPU state the live carts still draw with. The geometry branch below
      // * has always honoured its shared flag; the material branch never did, and the one
      // * caller (initCrowd's throwaway measuring cart) is built entirely from them.
      if (m.userData?.isSharedMaterial) continue;
      for (const slot of DISPOSABLE_MAP_SLOTS) m[slot]?.dispose?.();
      m.dispose();
    }
  }

  root.traverse((child) => {
    if (child.material) disposeMaterial(child.material);
    const isShared = Boolean(child.userData && child.userData.isSharedGeometry);
    if (!isShared && child.geometry && typeof child.geometry.dispose === "function") {
      child.geometry.dispose();
    }
  });
}
