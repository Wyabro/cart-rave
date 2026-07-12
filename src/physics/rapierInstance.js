/**
 * rapierInstance.js — Shared, lazily-initialized Rapier3D WASM module.
 *
 * Prefers `@dimforge/rapier3d-simd` when the browser validates wasm simd128;
 * falls back to `@dimforge/rapier3d` on older engines or load failure.
 *
 * All consumers import the mutable `RAPIER` variable. The actual WASM blob
 * is deferred until `initRapier()` is called (see `ensureRapierPhysics` in
 * main.js). Only the first call triggers the dynamic import; subsequent
 * calls resolve immediately.
 *
 * @module physics/rapierInstance
 */

/** @type {any} */
let RAPIER = null;

/** @type {Promise<any> | null} */
let _initPromise = null;

/**
 * Which Rapier npm package actually loaded after `initRapier()`.
 * @type {"simd" | "standard" | null}
 */
let _build = null;

/**
 * Minimal wasm module that requires simd128 (`i8x16.splat` + `drop`).
 * Used to avoid fetching the SIMD package on browsers that cannot run it.
 *
 * Note: several “classic” simd probes circulating online are truncated and always
 * fail `WebAssembly.validate` — this one is a full valid module (void function).
 * @returns {boolean}
 */
export function supportsWasmSimd() {
  if (typeof WebAssembly === "undefined" || typeof WebAssembly.validate !== "function") {
    return false;
  }
  try {
    // prettier-ignore
    // () -> (); body: i32.const 0; i8x16.splat; drop; end
    return WebAssembly.validate(new Uint8Array([
      0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
      0x01, 0x04, 0x01, 0x60, 0x00, 0x00,
      0x03, 0x02, 0x01, 0x00,
      0x0a, 0x09, 0x01, 0x07, 0x00, 0x41, 0x00, 0xfd, 0x0f, 0x1a, 0x0b,
    ]));
  } catch {
    return false;
  }
}

/**
 * @param {any} mod
 * @returns {any}
 */
function unwrapModule(mod) {
  return mod?.default ?? mod;
}

/**
 * Dynamically loads Rapier on first call (SIMD when available) and returns it.
 * Idempotent — subsequent calls return the cached instance.
 *
 * @returns {Promise<import("@dimforge/rapier3d")>}
 */
export async function initRapier() {
  if (RAPIER) return RAPIER;
  if (!_initPromise) {
    _initPromise = (async () => {
      const simdOk = supportsWasmSimd();
      if (simdOk) {
        try {
          const m = await import("@dimforge/rapier3d-simd");
          RAPIER = unwrapModule(m);
          _build = "simd";
          return RAPIER;
        } catch (err) {
          console.warn(
            "[rapier] SIMD package failed to load; falling back to @dimforge/rapier3d",
            err,
          );
        }
      }

      const m = await import("@dimforge/rapier3d");
      RAPIER = unwrapModule(m);
      _build = "standard";
      if (!simdOk && typeof console !== "undefined" && console.info) {
        console.info("[rapier] wasm simd128 not available; using standard build");
      }
      return RAPIER;
    })();
  }
  return _initPromise;
}

/**
 * @returns {"simd" | "standard" | null} Loaded build, or null before init.
 */
export function getRapierBuild() {
  return _build;
}

export { RAPIER };
