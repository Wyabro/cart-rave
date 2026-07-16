/**
 * bootTimeline.js — named boot-phase marks for loading diagnostics.
 *
 * Extends the single `cr:menu-ready` performance mark (main.js) into a proper boot
 * timeline: every phase calls {@link markBootPhase}, which stamps a standard
 * `performance.mark("cr:<name>")` (prod-safe, near-free, visible in DevTools →
 * Performance) and mirrors it onto the __ccDiag "boot" event channel when diagnostics
 * are active. {@link readBootTimeline} returns all `cr:*` marks so the `boot` probe —
 * and therefore every capture bundle — carries the full load story.
 *
 * Why this exists: the open NET-2 "quickplay join = frozen cart" bug is a LOADING
 * problem (cold world bootstrap blocks the main thread), yet until now the only
 * measurable boot instant was menu-ready. With world-init-start / world-ready /
 * carts-ready stamped, a harness or a capture bundle can report the exact stall
 * window (world-ready − world-init-start) on any device instead of eyeballing it.
 */

import { recordDiagEvent } from "./diagnostics.js";

/** Prefix shared with the pre-existing `cr:menu-ready` mark in main.js. */
const MARK_PREFIX = "cr:";

/**
 * Stamp one boot phase: a `cr:<name>` performance mark plus a "boot" diag event.
 * Safe to call unconditionally from production code — the mark is standard Web API
 * (no-throw guarded for exotic embeds) and the diag event is a no-op without ?diag.
 *
 * @param {string} name  Short kebab-case phase name (e.g. "world-ready").
 * @param {Record<string, unknown>} [data]  Extra primitives for the diag event only.
 * @returns {void}
 */
export function markBootPhase(name, data) {
  try {
    performance.mark(`${MARK_PREFIX}${name}`);
  } catch {
    /* performance.mark unavailable — timeline degrades, never breaks boot */
  }
  recordDiagEvent("boot", name, {
    tMs: typeof performance !== "undefined" && performance.now ? Math.round(performance.now()) : 0,
    ...(data || {}),
  });
}

/**
 * All `cr:*` marks stamped so far (navigation-start-relative ms), oldest first.
 * Consumed by the `boot` diag probe so snapshots/capture bundles carry the timeline.
 *
 * @returns {Array<{ name: string, tMs: number }>}
 */
export function readBootTimeline() {
  try {
    return performance
      .getEntriesByType("mark")
      .filter((e) => e.name.startsWith(MARK_PREFIX))
      .map((e) => ({ name: e.name.slice(MARK_PREFIX.length), tMs: Math.round(e.startTime) }));
  } catch {
    return [];
  }
}
