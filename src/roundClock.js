/**
 * Round lifecycle clock for `startedAtMs` / `countdownStartedAtMs`.
 *
 * Domain matches:
 * - Party server `#serverNowMs` (`performance.timeOrigin + performance.now()`)
 * - Client netcode clock-offset samples (`getMonotonicNow`)
 *
 * Prefer this over `Date.now()` for round duration: wall clock can jump (NTP /
 * user clock changes) while this stays monotonic for the page lifetime.
 *
 * Across well-synced machines, values are approximately absolute UTC and are
 * comparable on host and clients for HUD remaining time.
 */

/**
 * @returns {number} Monotonic-ish absolute ms (timeOrigin + performance.now()).
 */
export function getRoundClockNowMs() {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    const origin = typeof performance.timeOrigin === "number" ? performance.timeOrigin : 0;
    return origin + performance.now();
  }
  return Date.now();
}

/**
 * Elapsed ms since round start, or null if not started.
 * @param {number} startedAtMs
 * @param {number} [nowMs=getRoundClockNowMs()]
 * @returns {number | null}
 */
export function getRoundElapsedMs(startedAtMs, nowMs = getRoundClockNowMs()) {
  if (!(startedAtMs > 0)) return null;
  return nowMs - startedAtMs;
}

/**
 * Remaining ms in a timed round (may be negative if overdue), or null if not started.
 * @param {number} startedAtMs
 * @param {number} durationMs
 * @param {number} [nowMs=getRoundClockNowMs()]
 * @returns {number | null}
 */
export function getRoundRemainingMs(startedAtMs, durationMs, nowMs = getRoundClockNowMs()) {
  const elapsed = getRoundElapsedMs(startedAtMs, nowMs);
  if (elapsed == null) return null;
  const duration = Number.isFinite(durationMs) ? durationMs : 0;
  return duration - elapsed;
}

/**
 * True when the timed round has reached or passed durationMs.
 * @param {number} startedAtMs
 * @param {number} durationMs
 * @param {number} [nowMs=getRoundClockNowMs()]
 * @returns {boolean}
 */
export function isRoundTimerExpired(startedAtMs, durationMs, nowMs = getRoundClockNowMs()) {
  if (!(startedAtMs > 0)) return false;
  const duration = Number.isFinite(durationMs) ? durationMs : 0;
  return nowMs - startedAtMs >= duration;
}
