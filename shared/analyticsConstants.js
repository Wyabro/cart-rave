// analyticsConstants.js — analytics product-metric thresholds shared by client emit
// and Worker summary. Not round timing (see roundConstants.js).
//
// ANLX-BULK-1: scripted/tool match ends (e.g. 4–12 ms, endReason=timer) poisoned
// matchesByArena / mode / resultSplit. Ends shorter than this floor are non-product
// for summary; the client also skips emitting match_ended when durationMs is a
// finite value below the floor (null duration still emits — summary drops it).

/** ms — minimum counted match length for product aggregates + short-end client skip. */
export const MIN_MATCH_DURATION_MS = 3_000;
