// Pure per-connection message rate-limit accounting extracted from CartRaveServer
// so the sliding-window allow/deny rule is unit-testable without a Workers runtime.
// index.ts keeps the Map storage and drops the message when !allowed.
//
// Invariant: after each advance, count is the number of messages in the current
// window (including this one). Reject when count > RATE_LIMIT_MAX_PER_SEC.

import {
  RATE_LIMIT_MAX_PER_SEC,
  RATE_LIMIT_WINDOW_MS,
} from './constants';

export type RateLimitBucket = {
  count: number;
  windowStart: number;
};

export type RateLimitAdvanceResult = {
  allowed: boolean;
  nextBucket: RateLimitBucket;
};

/**
 * Advances a connection's rate-limit bucket by one message at `now`.
 * Missing or expired buckets start a fresh window at `now` with count 1.
 *
 * @param bucket Prior bucket for this connection, or undefined if none.
 * @param now Server monotonic ms.
 * @param maxPerSec Cap (defaults to RATE_LIMIT_MAX_PER_SEC).
 * @param windowMs Window length (defaults to RATE_LIMIT_WINDOW_MS).
 */
export function advanceRateLimit(
  bucket: RateLimitBucket | undefined,
  now: number,
  maxPerSec: number = RATE_LIMIT_MAX_PER_SEC,
  windowMs: number = RATE_LIMIT_WINDOW_MS,
): RateLimitAdvanceResult {
  let next: RateLimitBucket;
  if (!bucket || now - bucket.windowStart >= windowMs) {
    next = { count: 0, windowStart: now };
  } else {
    next = { count: bucket.count, windowStart: bucket.windowStart };
  }
  next = { count: next.count + 1, windowStart: next.windowStart };
  return {
    allowed: next.count <= maxPerSec,
    nextBucket: next,
  };
}
