/**
 * rapierInstance.js — Shared, lazily-initialized Rapier3D WASM module.
 *
 * Loads the standard `@dimforge/rapier3d` by default. The `-simd` build is
 * OPT-IN (`?rapier=simd` or localStorage `cartRaveRapierSimd=1`). 0.20.0 wraps
 * Rust 0.35 (new sleep, CCD, and solver). The 0.19.3 SIMD wasm tripped a
 * wasm-bindgen "recursive use of an object … unsafe aliasing" RefCell error
 * mid-gameplay (e.g. `RigidBody.translation()` in updateGameFlow) that the
 * standard build did not. Keep SIMD opt-in until 0.20's `-simd` build is
 * proven stable. Do not flip the default without Wyatt's ack.
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
 * Whether the SIMD build was explicitly opted into. Default is the standard build
 * because the 0.19.3 `-simd` wasm threw a "recursive use / unsafe aliasing" borrow
 * error mid-gameplay (see module docstring). 0.20 is unproven on that path. Opt
 * in with `?rapier=simd` or localStorage `cartRaveRapierSimd=1` to test SIMD.
 * @returns {boolean}
 */
function simdRequested() {
  try {
    if (typeof location !== "undefined" && /[?&]rapier=simd\b/.test(location.search)) {
      return true;
    }
    if (typeof localStorage !== "undefined" && localStorage.getItem("cartRaveRapierSimd") === "1") {
      return true;
    }
  } catch {
    // location/localStorage unavailable (SSR, sandbox) — fall through to standard.
  }
  return false;
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
      // * SIMD is opt-in only — the 0.19.3 -simd build broke gameplay with a wasm
      // * "recursive use / unsafe aliasing" RefCell error. 0.20 is unproven (see
      // * module docstring).
      const simdOk = simdRequested() && supportsWasmSimd();
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
