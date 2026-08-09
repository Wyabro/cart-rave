/**
 * netcode/load.js — CHUNK-DEFER-1 L2 latch for the netcode module.
 *
 * Eager menu code must not static-import `netcode.js` (pulls p2p/binary into the
 * initial download set). This leaf only dynamic-imports netcode on demand.
 *
 * Lifecycle (main owns preparePlayNetworking):
 *   1. ensureGameSystems()
 *   2. ensureNetcode()
 *   3. registerGameCallbacks (once)
 *   4. initNetcode / connect (play or invite only)
 */

/** @type {Promise<typeof import("../netcode.js")> | null} */
let netcodeModulePromise = null;
/** @type {typeof import("../netcode.js") | null} */
let netcodeModule = null;

/**
 * Bare chunk fetch — no register, no connect. Shared by ensure + hover prefetch (L5).
 * @returns {Promise<typeof import("../netcode.js")>}
 */
function prefetchNetcodeModule() {
  if (!netcodeModulePromise) {
    netcodeModulePromise = import("../netcode.js")
      .then((m) => {
        netcodeModule = m;
        return m;
      })
      .catch((err) => {
        netcodeModulePromise = null;
        throw err;
      });
  }
  return netcodeModulePromise;
}

/**
 * Load netcode module exactly once (shared promise).
 * Hover/CTA prefetch (L5) can call this fire-and-forget — same as ensure.
 * @returns {Promise<typeof import("../netcode.js")>}
 */
export function ensureNetcode() {
  return prefetchNetcodeModule();
}

/** @returns {typeof import("../netcode.js") | null} */
export function getNetcode() {
  return netcodeModule;
}

/**
 * Sync accessor after ensureNetcode resolved (or gameBoot already evaluated netcode).
 * @returns {typeof import("../netcode.js")}
 */
export function requireNetcode() {
  if (!netcodeModule) {
    throw new Error("[netcodeLoad] netcode not loaded — await ensureNetcode() first");
  }
  return netcodeModule;
}
