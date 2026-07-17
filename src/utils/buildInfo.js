/**
 * buildInfo.js — read the build identity Vite bakes in at build time.
 *
 * `__CC_BUILD__` is a compile-time define (vite.config.js): { version, sha, builtAt }.
 * Guarded so contexts without the define (unit tests, tools importing modules in
 * isolation) degrade to null instead of throwing. No imports — cycle-safe from anywhere.
 */

/**
 * @returns {{ version: string | null, sha: string, builtAt: string } | null}
 */
export function readBuildInfo() {
  try {
    return typeof __CC_BUILD__ !== "undefined" ? __CC_BUILD__ : null;
  } catch {
    return null;
  }
}
