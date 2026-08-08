/**
 * matchFrameTelemetry.js — always-on per-match frame-time counters (FREEZE-TELEMETRY-1).
 *
 * Leaf module on purpose: gameplayAnalytics is on the eager menu graph and must never
 * static-import gameLoop.js (that re-eagered ~25 deferred modules into the initial
 * download set — CHUNK-MEMBER-1 L1). gameLoop records into this leaf; analytics reads it.
 *
 * Not ?diag-gated: production match_ended needs maxFrameMs / framesOver33 once real
 * testers replace Wyatt's diag-flagged sessions. Sample, don't stream.
 */

let _matchMaxFrameMs = 0;
let _matchFramesOver33 = 0;

/**
 * Accumulates the per-match frame-time signal. Cheap: two primitive comparisons, no
 * allocation, once per frame. Resume frames (zeroed gap after alt-tab) are excluded
 * so they cannot read as a freeze.
 * @param {number} dtMs
 * @param {boolean} isResume
 */
export function recordMatchFrameForTelemetry(dtMs, isResume) {
  if (isResume) return;
  if (dtMs > _matchMaxFrameMs) _matchMaxFrameMs = dtMs;
  if (dtMs > 33) _matchFramesOver33 += 1;
}

/** Resets the per-match frame-time signal — call on entering RoundPhase.RUNNING. */
export function resetMatchFrameTelemetry() {
  _matchMaxFrameMs = 0;
  _matchFramesOver33 = 0;
}

/** @returns {{ maxFrameMs: number, framesOver33: number }} */
export function getMatchFrameTelemetry() {
  return { maxFrameMs: Math.round(_matchMaxFrameMs), framesOver33: _matchFramesOver33 };
}
