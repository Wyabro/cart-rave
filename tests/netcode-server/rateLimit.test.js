// rateLimit.test.js — pure sliding-window allow/deny for party WS messages.
// Covers advanceRateLimit extracted from CartRaveServer.#checkRateLimit.

import { describe, expect, it } from "vitest";
import {
  RATE_LIMIT_MAX_PER_SEC,
  RATE_LIMIT_WINDOW_MS,
} from "../../party/constants.ts";
import { advanceRateLimit } from "../../party/rateLimit.ts";

describe("advanceRateLimit", () => {
  it("starts a fresh window at count 1 when bucket is missing", () => {
    const r = advanceRateLimit(undefined, 1000);
    expect(r.allowed).toBe(true);
    expect(r.nextBucket).toEqual({ count: 1, windowStart: 1000 });
  });

  it("increments within the same window", () => {
    const r1 = advanceRateLimit(undefined, 1000);
    const r2 = advanceRateLimit(r1.nextBucket, 1000 + 10);
    expect(r2.nextBucket.count).toBe(2);
    expect(r2.nextBucket.windowStart).toBe(1000);
    expect(r2.allowed).toBe(true);
  });

  it("allows exactly RATE_LIMIT_MAX_PER_SEC messages in a window", () => {
    let bucket;
    let last;
    for (let i = 0; i < RATE_LIMIT_MAX_PER_SEC; i += 1) {
      last = advanceRateLimit(bucket, 5000);
      bucket = last.nextBucket;
      expect(last.allowed).toBe(true);
    }
    expect(last.nextBucket.count).toBe(RATE_LIMIT_MAX_PER_SEC);
  });

  it("rejects the message after the cap is exceeded", () => {
    let bucket = { count: RATE_LIMIT_MAX_PER_SEC, windowStart: 0 };
    const r = advanceRateLimit(bucket, 100);
    expect(r.nextBucket.count).toBe(RATE_LIMIT_MAX_PER_SEC + 1);
    expect(r.allowed).toBe(false);
  });

  it("resets the window after RATE_LIMIT_WINDOW_MS elapses", () => {
    const stale = { count: RATE_LIMIT_MAX_PER_SEC, windowStart: 0 };
    const r = advanceRateLimit(stale, RATE_LIMIT_WINDOW_MS);
    expect(r.allowed).toBe(true);
    expect(r.nextBucket).toEqual({ count: 1, windowStart: RATE_LIMIT_WINDOW_MS });
  });
});
