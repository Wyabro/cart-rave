// roundConstants.js — round timing shared between the client sim and the Worker.
//
// CONFIG.round.durationMs (client) and the server's podium plausibility cap
// (party/roundValidation.ts) MUST agree — a client-side tuning change that
// skipped the server would silently start rejecting legitimate timer podiums.
// This file is the single source of truth for both (AGENTS.md win-condition
// invariant).

/** ms — host-authoritative round length (2.5 min). */
export const ROUND_DURATION_MS = 150_000;

/**
 * ms — 3…2…1…GO countdown window. The server's game_start arming timer and the
 * client's countdown (CONFIG.round.countdownMs, HUD digit cadence) MUST agree,
 * or MP digits pace against a different window than the actual GO moment.
 */
export const COUNTDOWN_MS = 4500;
