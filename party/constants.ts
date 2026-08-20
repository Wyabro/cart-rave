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

/**
 * Analytics is capped tighter than the other beacons: each POST carries up to
 * MAX_EVENTS_PER_BATCH events and the analytics ring feeds product aggregates,
 * so the per-IP fabrication budget here is the real ceiling, not the shared
 * BEACON_MAX_PER_WINDOW. Applied only inside AnalyticsLog (CAPTURE-RING-LIMIT-1).
 */
export const ANALYTICS_MAX_PER_WINDOW = 5;

/** Sliding window length for open-beacon rate limiting. */
export const BEACON_WINDOW_MS = 60_000;

/**
 * Raw POST /api/captures body cap (chars). Wave G support timelines made uncompressed
 * F8 bundles 1.6–2.9 MB; the client now gzip-base64s the inner JSON so the HTTP
 * envelope stays under this cap. Hostile uncompressed floods still drop here.
 */
export const CAPTURE_REQUEST_MAX_CHARS = 350_000;

/**
 * Decompressed capture JSON stored in the CaptureLog DO. Gzip bomb guard: a 200 KB
 * POST cannot expand past this. 4 MB holds a full Wave G F8 with 170 pop timelines.
 */
export const CAPTURE_STORE_MAX_CHARS = 4_000_000;

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

// ── Test-only platform-live override (CONN-TRACK-LEAK-1) ────────────────
// Production never calls setPlatformLiveIdsOverride. Pass null to clear.
// Lets party-do tests fake a socket the platform dropped without onClose firing
// (the zombie-prune path) by overriding what #platformLiveConnIds sees as live.
let platformLiveIdsOverride: Set<string> | null = null;

/** Test-only. Force the platform-live connection-id set. Pass null to clear. */
export function setPlatformLiveIdsOverride(ids: Set<string> | null): void {
  platformLiveIdsOverride = ids;
}

/** Current override, or null when production getConnections() applies. */
export function getPlatformLiveIdsOverride(): Set<string> | null {
  return platformLiveIdsOverride;
}
