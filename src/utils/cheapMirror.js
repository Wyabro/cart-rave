/**
 * cheapMirror.js — Classic vinyl floor reflection: cart-first pass.
 *
 * The stock Reflector re-renders the entire scene, including thousands of
 * crowd instances + stadium shell. Those drown out the carts that actually
 * matter in the spinning floor. This module:
 * 1. Registers heavy décor roots to hide during the reflection sub-render.
 * 2. Wraps Reflector.onBeforeRender so those roots stay out of the RT.
 *
 * Intentionally does NOT skip frames or reuse a stale RT — that read as
 * jitter on the rotating vinyl (see revert of budget-gated mirror).
 */

/** @type {import("three").Object3D[]} */
const mirrorExcludeRoots = [];

/**
 * Registers a root that must not appear in the Classic floor reflection.
 * Safe to call multiple times with the same object.
 * @param {import("three").Object3D | null | undefined} obj
 */
export function registerMirrorExclude(obj) {
  if (!obj) return;
  if (mirrorExcludeRoots.includes(obj)) return;
  mirrorExcludeRoots.push(obj);
}

/** Clears the exclude list (fresh Classic rave build). */
export function clearMirrorExcludes() {
  mirrorExcludeRoots.length = 0;
}

/** @returns {number} */
export function getMirrorExcludeCount() {
  return mirrorExcludeRoots.length;
}

/**
 * Wraps a three.js Reflector's onBeforeRender so the reflection pass hides
 * registered décor for the duration of the sub-render, then restores it.
 * Carts, booths, stage, and the record stay visible in the mirror.
 *
 * @param {import("three").Mesh & { onBeforeRender?: Function, isReflector?: boolean }} reflector
 * @returns {import("three").Mesh & { onBeforeRender?: Function, isReflector?: boolean }}
 */
export function installCheapMirrorPass(reflector) {
  if (!reflector || typeof reflector.onBeforeRender !== "function") return reflector;

  const baseOnBeforeRender = reflector.onBeforeRender.bind(reflector);

  reflector.onBeforeRender = function cartFirstMirrorOnBeforeRender(renderer, scene, camera) {
    /** @type {import("three").Object3D[]} */
    const hidden = [];
    for (let i = 0; i < mirrorExcludeRoots.length; i += 1) {
      const root = mirrorExcludeRoots[i];
      if (!root || !root.visible) continue;
      root.visible = false;
      hidden.push(root);
    }

    try {
      baseOnBeforeRender(renderer, scene, camera);
    } finally {
      for (let i = 0; i < hidden.length; i += 1) {
        hidden[i].visible = true;
      }
    }
  };

  reflector.userData = reflector.userData || {};
  reflector.userData.cheapMirror = true;
  return reflector;
}
