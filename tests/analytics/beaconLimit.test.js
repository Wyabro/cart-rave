// beaconLimit.test.js — pure per-IP accounting for the three open POST beacons.
// Covers the exports the log DOs call: the bucket rule (advanceBeaconLimit), the
// map bound (pruneBeaconBuckets), and the facade that owns the unknown-IP
// exemption (checkBeaconLimit). Sibling of rateLimit.test.js.

import { describe, expect, it } from "vitest";
import {
  UNKNOWN_IP,
  advanceBeaconLimit,
  checkBeaconLimit,
  pruneBeaconBuckets,
} from "../../party/beaconLimit.ts";
import { BEACON_MAX_PER_WINDOW, BEACON_WINDOW_MS } from "../../party/constants.ts";

describe("advanceBeaconLimit", () => {
  it("starts a fresh window at count 1 when the bucket is missing", () => {
    const r = advanceBeaconLimit(undefined, 1000);
    expect(r.allowed).toBe(true);
    expect(r.nextBucket).toEqual({ count: 1, windowStart: 1000 });
  });

  it("increments within the same window without moving windowStart", () => {
    const r1 = advanceBeaconLimit(undefined, 1000);
    const r2 = advanceBeaconLimit(r1.nextBucket, 1000 + 250);
    expect(r2.nextBucket).toEqual({ count: 2, windowStart: 1000 });
    expect(r2.allowed).toBe(true);
  });

  it("allows exactly BEACON_MAX_PER_WINDOW beacons in one window", () => {
    let bucket;
    let last;
    for (let i = 0; i < BEACON_MAX_PER_WINDOW; i += 1) {
      last = advanceBeaconLimit(bucket, 5000);
      bucket = last.nextBucket;
      expect(last.allowed).toBe(true);
    }
    expect(last.nextBucket.count).toBe(BEACON_MAX_PER_WINDOW);
  });

  it("rejects the beacon after the cap is exceeded", () => {
    const bucket = { count: BEACON_MAX_PER_WINDOW, windowStart: 0 };
    const r = advanceBeaconLimit(bucket, 100);
    expect(r.allowed).toBe(false);
    expect(r.nextBucket.count).toBe(BEACON_MAX_PER_WINDOW + 1);
  });

  it("rolls over to a fresh window once BEACON_WINDOW_MS has elapsed", () => {
    const bucket = { count: BEACON_MAX_PER_WINDOW + 9, windowStart: 0 };
    const r = advanceBeaconLimit(bucket, BEACON_WINDOW_MS);
    expect(r.allowed).toBe(true);
    expect(r.nextBucket).toEqual({ count: 1, windowStart: BEACON_WINDOW_MS });
  });
});

describe("pruneBeaconBuckets", () => {
  it("drops expired buckets and keeps live ones", () => {
    const now = 100_000;
    const map = new Map([
      ["stale", { count: 5, windowStart: now - 60_000 }],
      ["live", { count: 5, windowStart: now - 10 }],
    ]);
    // maxEntries well above size — only the expired bucket should go.
    expect(pruneBeaconBuckets(map, now, 10, 60_000)).toBe(1);
    expect(map.has("stale")).toBe(false);
    expect(map.has("live")).toBe(true);
  });

  it("evicts oldest windowStart first when still over capacity", () => {
    const now = 100_000;
    const map = new Map([
      ["oldest", { count: 1, windowStart: now - 50 }],
      ["middle", { count: 1, windowStart: now - 40 }],
      ["newest", { count: 1, windowStart: now - 30 }],
    ]);
    expect(pruneBeaconBuckets(map, now, 2, 60_000)).toBe(1);
    expect([...map.keys()]).toEqual(["middle", "newest"]);
  });

  it("never evicts the hottest bucket — an attacker cannot win a fresh budget", () => {
    const now = 100_000;
    const map = new Map([
      ["cold-a", { count: 1, windowStart: now - 5_000 }],
      ["cold-b", { count: 1, windowStart: now - 4_000 }],
      ["flooder", { count: 999, windowStart: now }],
    ]);
    pruneBeaconBuckets(map, now, 1, 60_000);
    expect([...map.keys()]).toEqual(["flooder"]);
    expect(map.get("flooder").count).toBe(999);
  });

  it("counts every removal it makes", () => {
    const now = 100_000;
    const map = new Map([
      ["stale", { count: 1, windowStart: now - 90_000 }],
      ["a", { count: 1, windowStart: now - 3 }],
      ["b", { count: 1, windowStart: now - 2 }],
      ["c", { count: 1, windowStart: now - 1 }],
    ]);
    // 1 expired + 2 over the cap of 1.
    expect(pruneBeaconBuckets(map, now, 1, 60_000)).toBe(3);
    expect(map.size).toBe(1);
  });

  it("leaves a map already under capacity untouched", () => {
    const now = 100_000;
    const map = new Map([["a", { count: 1, windowStart: now }]]);
    expect(pruneBeaconBuckets(map, now, 10, 60_000)).toBe(0);
    expect(map.size).toBe(1);
  });
});

describe("checkBeaconLimit", () => {
  it("exempts UNKNOWN_IP — dev and the harness must never be throttled", () => {
    const map = new Map();
    for (let i = 0; i < BEACON_MAX_PER_WINDOW * 2; i += 1) {
      expect(checkBeaconLimit(map, UNKNOWN_IP, 1000)).toBe(true);
    }
    expect(map.size).toBe(0);
  });

  it("exempts an empty ip", () => {
    const map = new Map();
    expect(checkBeaconLimit(map, "", 1000)).toBe(true);
    expect(map.size).toBe(0);
  });

  it("allows up to the cap then rejects, for a real ip", () => {
    const map = new Map();
    for (let i = 0; i < 3; i += 1) {
      expect(checkBeaconLimit(map, "1.2.3.4", 1000, 3, 60_000)).toBe(true);
    }
    expect(checkBeaconLimit(map, "1.2.3.4", 1000, 3, 60_000)).toBe(false);
  });

  it("keeps budgets independent per ip", () => {
    const map = new Map();
    for (let i = 0; i < 3; i += 1) checkBeaconLimit(map, "1.2.3.4", 1000, 3, 60_000);
    expect(checkBeaconLimit(map, "1.2.3.4", 1000, 3, 60_000)).toBe(false);
    expect(checkBeaconLimit(map, "5.6.7.8", 1000, 3, 60_000)).toBe(true);
  });

  it("writes the advanced bucket back into the map", () => {
    const map = new Map();
    checkBeaconLimit(map, "1.2.3.4", 1000, 3, 60_000);
    checkBeaconLimit(map, "1.2.3.4", 1200, 3, 60_000);
    expect(map.get("1.2.3.4")).toEqual({ count: 2, windowStart: 1000 });
  });

  it("keeps the map bounded once it passes maxEntries", () => {
    const map = new Map();
    for (let i = 0; i < 40; i += 1) {
      checkBeaconLimit(map, `10.0.0.${i}`, 1000 + i, 100, 60_000, 20);
    }
    expect(map.size).toBeLessThanOrEqual(20);
    // Hysteresis prunes to 90% of the cap, and the newest entry always survives.
    expect(map.has("10.0.0.39")).toBe(true);
  });
});
