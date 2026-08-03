#!/usr/bin/env node
/**
 * HOOK-INDEX-1 — clear stale staged blobs for the pre-commit generated docs.
 *
 * Pathspec commits (`git commit -- <paths>`) assemble the commit from a temporary
 * index. pre-commit still runs `git add` on the *real* index for
 * docs/BRIEFING.md + docs/ARCHITECTURE.json after regenerating them. When the
 * pathspec omits those paths, the commit object can hold the new content while the
 * real index keeps the pre-regen blob. The next pathspec-less commit then ships a
 * silent reversion.
 *
 * Predicate (post-commit, HEAD already has the regen): for each generated path,
 * if the index blob exists and differs from HEAD's blob → `git restore --staged`.
 *
 * Fail-open: any git error exits 0. Invoked from tools/git-hooks/post-commit before
 * the HTML refresh so cleanup is not coupled to dashboard success.
 *
 * @module
 */

import { execFileSync } from "node:child_process";

/** Paths pre-commit regenerates and stages. Keep in lockstep with pre-commit. */
export const GENERATED_DOC_PATHS = ["docs/BRIEFING.md", "docs/ARCHITECTURE.json"];

/**
 * @param {string} revPath e.g. `:0:docs/ARCHITECTURE.json` or `HEAD:docs/ARCHITECTURE.json`
 * @param {{ cwd?: string, execFileSync?: typeof execFileSync }} [opts]
 * @returns {string | null} object id, or null if missing / error
 */
export function revParseBlob(revPath, opts = {}) {
  const run = opts.execFileSync ?? execFileSync;
  try {
    return run("git", ["rev-parse", revPath], {
      cwd: opts.cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch {
    return null;
  }
}

/**
 * Paths whose staged index blob ≠ HEAD blob (the HOOK-INDEX residue shape).
 * @param {{ cwd?: string, paths?: string[], execFileSync?: typeof execFileSync }} [opts]
 * @returns {string[]}
 */
export function findStaleGeneratedIndexPaths(opts = {}) {
  const paths = opts.paths ?? GENERATED_DOC_PATHS;
  const stale = [];
  for (const p of paths) {
    const indexBlob = revParseBlob(`:0:${p}`, opts);
    const headBlob = revParseBlob(`HEAD:${p}`, opts);
    if (indexBlob && headBlob && indexBlob !== headBlob) stale.push(p);
  }
  return stale;
}

/**
 * Unstage generated docs whose index blob differs from HEAD.
 * @param {{ cwd?: string, paths?: string[], execFileSync?: typeof execFileSync }} [opts]
 * @returns {{ cleared: string[], error?: string }}
 */
export function clearStaleGeneratedIndex(opts = {}) {
  const run = opts.execFileSync ?? execFileSync;
  try {
    const stale = findStaleGeneratedIndexPaths(opts);
    if (stale.length === 0) return { cleared: [] };
    run("git", ["restore", "--staged", "--", ...stale], {
      cwd: opts.cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { cleared: stale };
  } catch (err) {
    return { cleared: [], error: err instanceof Error ? err.message : String(err) };
  }
}

const isMain =
  process.argv[1] &&
  (process.argv[1].endsWith("clear-stale-generated-index.mjs") ||
    process.argv[1].replace(/\\/g, "/").endsWith("tools/git-hooks/clear-stale-generated-index.mjs"));

if (isMain) {
  const result = clearStaleGeneratedIndex();
  if (result.error) {
    console.error(`[HOOK-INDEX] cleanup failed (non-fatal): ${result.error}`);
    process.exit(0);
  }
  if (result.cleared.length > 0) {
    console.error(`[HOOK-INDEX] unstaged stale generated docs: ${result.cleared.join(", ")}`);
  }
  process.exit(0);
}
