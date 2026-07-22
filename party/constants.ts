// Room-server thresholds shared by CartRaveServer and the pure decision helpers.
// Single home so tests and DO code cannot drift on magic numbers.
//
// Type-sharing rule: structural types (MinimalSlot, bucket shapes, etc.) stay
// local to each helper unless two or more helpers need the same shape. When that
// happens, promote the type here (or to a tiny party/types.ts if constants is the
// wrong home) and name the consumers in a comment on the export.

/** Max WS messages accepted per connection per RATE_LIMIT_WINDOW_MS. */
export const RATE_LIMIT_MAX_PER_SEC = 100;

/** Sliding window length for per-connection message rate limiting. */
export const RATE_LIMIT_WINDOW_MS = 1_000;

/**
 * Connections with no message for this long are forcibly removed.
 * PartyKit onClose is not guaranteed (tab crash, airplane mode, phone sleep).
 */
export const REAP_TIMEOUT_MS = 20_000;

/** Minimum gap between silent-connection reap passes (onMessage throttle). */
export const REAP_THROTTLE_MS = 5_000;

/** Pending color-pickers that never seat are closed after this. */
export const PICKER_TIMEOUT_MS = 30_000;
