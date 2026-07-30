// Room-server thresholds shared by CartRaveServer and the pure decision helpers.
// Single home so tests and DO code cannot drift on magic numbers.
//
// Type-sharing rule: structural types (MinimalSlot, bucket shapes, etc.) stay
// local to each helper unless two or more helpers need the same shape. When that
// happens, promote the type here (or to a tiny party/types.ts if constants is the
// wrong home) and name the consumers in a comment on the export.

import { PLAY_READY_TIMEOUT_MS } from "../shared/roundConstants.js";

/** Max WS messages accepted per connection per RATE_LIMIT_WINDOW_MS. */
export const RATE_LIMIT_MAX_PER_SEC = 100;

/** Sliding window length for per-connection message rate limiting. */
export const RATE_LIMIT_WINDOW_MS = 1_000;

/** Max simultaneous WS connections accepted from one IP (SEC-BEACON-1). */
export const IP_CONNECTION_CAP = 5;

/**
 * Max open-beacon POSTs accepted per IP per BEACON_WINDOW_MS — enforced
 * independently inside EACH log DO (ErrorLog / CaptureLog / AnalyticsLog), so the
 * aggregate across all three routes is 3× this. Each DO defends its own ring.
 */
export const BEACON_MAX_PER_WINDOW = 30;

/** Sliding window length for open-beacon rate limiting. */
export const BEACON_WINDOW_MS = 60_000;

/** Max distinct IPs a log DO tracks before it starts evicting cold buckets. */
export const BEACON_MAX_TRACKED_IPS = 5_000;

/**
 * Connections with no message for this long are forcibly removed.
 * PartyKit onClose is not guaranteed (tab crash, airplane mode, phone sleep).
 */
export const REAP_TIMEOUT_MS = 20_000;

/** Minimum gap between silent-connection reap passes (onMessage throttle). */
export const REAP_THROTTLE_MS = 5_000;

/** Pending color-pickers that never seat are closed after this. */
export const PICKER_TIMEOUT_MS = 30_000;

// ── Test-only reap overrides ──────────────────────────────────────────────
// Used by tests/party-do to exercise silent-drop without waiting 20s.
// Production never calls setReapOverrides. Pass null to clear.
let reapTimeoutOverrideMs: number | null = null;
let reapThrottleOverrideMs: number | null = null;

/** Test-only. Shorten silence / throttle thresholds. Pass null to clear both. */
export function setReapOverrides(
  opts: { timeoutMs?: number; throttleMs?: number } | null,
): void {
  if (opts == null) {
    reapTimeoutOverrideMs = null;
    reapThrottleOverrideMs = null;
    return;
  }
  if (typeof opts.timeoutMs === "number") reapTimeoutOverrideMs = opts.timeoutMs;
  if (typeof opts.throttleMs === "number") reapThrottleOverrideMs = opts.throttleMs;
}

/** Effective silence threshold (override ?? REAP_TIMEOUT_MS). */
export function getReapTimeoutMs(): number {
  return reapTimeoutOverrideMs ?? REAP_TIMEOUT_MS;
}

/** Effective reap throttle (override ?? REAP_THROTTLE_MS). */
export function getReapThrottleMs(): number {
  return reapThrottleOverrideMs ?? REAP_THROTTLE_MS;
}

// ── Test-only play-ready wait override (COUNTDOWN-ARM-1) ───────────────────
// Production never calls setPlayReadyTimeoutOverride. Pass null to clear.
let playReadyTimeoutOverrideMs: number | null = null;

/** Test-only. Shorten continuous playReady wait. Pass null to clear. */
export function setPlayReadyTimeoutOverride(ms: number | null): void {
  playReadyTimeoutOverrideMs = ms;
}

/** Effective playReady ceiling (override ?? PLAY_READY_TIMEOUT_MS). */
export function getPlayReadyTimeoutMs(): number {
  return playReadyTimeoutOverrideMs ?? PLAY_READY_TIMEOUT_MS;
}

// ── Test-only beacon-limit overrides (SEC-BEACON-1) ────────────────────────
// Used by tests/party-do so a flood case doesn't need 30 requests inside a real
// 60s window. Production never calls setBeaconLimitOverrides. Pass null to clear.
let beaconMaxOverride: number | null = null;
let beaconWindowOverrideMs: number | null = null;

/** Test-only. Shrink the beacon cap / window. Pass null to clear both. */
export function setBeaconLimitOverrides(
  opts: { maxPerWindow?: number; windowMs?: number } | null,
): void {
  if (opts == null) {
    beaconMaxOverride = null;
    beaconWindowOverrideMs = null;
    return;
  }
  if (typeof opts.maxPerWindow === "number") beaconMaxOverride = opts.maxPerWindow;
  if (typeof opts.windowMs === "number") beaconWindowOverrideMs = opts.windowMs;
}

/** Effective beacon cap (override ?? BEACON_MAX_PER_WINDOW). */
export function getBeaconMaxPerWindow(): number {
  return beaconMaxOverride ?? BEACON_MAX_PER_WINDOW;
}

/** Effective beacon window (override ?? BEACON_WINDOW_MS). */
export function getBeaconWindowMs(): number {
  return beaconWindowOverrideMs ?? BEACON_WINDOW_MS;
}
