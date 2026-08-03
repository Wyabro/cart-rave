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
export const COUNTDOWN_MS = 3600;

/**
 * ms — CAM-PT-MP-1 opening-orbit pre-roll. The server pushes game_start's
 * startsAtMs out by this on top of COUNTDOWN_MS; every client shows the
 * fly-over + GET READY during the window, then the normal 3-2-1 begins at
 * exactly COUNTDOWN_MS remaining. One uniform absolute anchor shared by all
 * clients — NOT a per-client readiness gate (the reverted c8df8fd). Solo keeps
 * its own SOLO_FLYOVER_PREROLL_MS (same value, offline timing domain).
 */
export const FLYOVER_PREROLL_MS = 2000;

/**
 * ms — continuous-mode ceiling waiting for clientPlayReady before arming
 * game_start anyway (fresh full COUNTDOWN_MS window). Invisible when all
 * humans warm in 1–3s; only bounds hung clients.
 */
export const PLAY_READY_TIMEOUT_MS = 12_000;
