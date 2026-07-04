/**
 * rapierInstance.js — Shared, lazily-initialized Rapier3D WASM module.
 *
 * All consumers import the mutable `RAPIER` variable.  The actual WASM blob
 * is deferred until `initRapier()` is called (see `ensureRapierPhysics` in
 * main.js).  Only the first call triggers the dynamic import; subsequent
 * calls resolve immediately.
 *
 * @module physics/rapierInstance
 */

/** @type {any} */
let RAPIER = null;

/** @type {Promise<any> | null} */
let _initPromise = null;

/**
 * Dynamically loads @dimforge/rapier3d on first call and returns it.
 * Idempotent — subsequent calls return the cached instance.
 *
 * @returns {Promise<import("@dimforge/rapier3d")>}
 */
export async function initRapier() {
  if (RAPIER) return RAPIER;
  if (!_initPromise) {
    _initPromise = import("@dimforge/rapier3d").then((m) => {
      RAPIER = m.default ?? m;
      return RAPIER;
    });
  }
  return _initPromise;
}

export { RAPIER };
