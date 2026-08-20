// Pure per-IP rate-limit accounting for the three open POST beacons
// (/api/log-error, /api/captures, /api/analytics), extracted from the log DOs so
// the allow/deny rule AND the bucket-eviction policy are unit-testable without a
// Workers runtime.
//
// Each log DO owns its own Map<ip, bucket> and calls checkBeaconLimit before the
// INSERT — the budget is per-DO, not shared, because each DO is defending its own
// SQLite ring. party/index.ts owns forwarding cf-connecting-ip inward and turning
// a false result into a 429 outward.
//
// Invariant: after each advance, count is the number of beacons in the current
// window (including this one). Reject when count > cap.

import {
  BEACON_MAX_PER_WINDOW,
  BEACON_MAX_TRACKED_IPS,
  BEACON_WINDOW_MS,
} from './constants';
import { listQuickplayShardNames } from "../shared/roomCodes.js";

/** Stand-in when cf-connecting-ip is absent — local dev, harnesses, odd proxies. */
export const UNKNOWN_IP = 'unknown';

export type BeaconBucket = {
  count: number;
  windowStart: number;
};

export type BeaconAdvanceResult = {
  allowed: boolean;
  nextBucket: BeaconBucket;
};

/**
 * Advances one IP's bucket by a single beacon at `now`.
 * Missing or expired buckets start a fresh window at `now` with count 1.
 *
 * @param bucket Prior bucket for this IP, or undefined if none.
 * @param now Wall-clock ms.
 * @param maxPerWindow Cap (defaults to BEACON_MAX_PER_WINDOW).
 * @param windowMs Window length (defaults to BEACON_WINDOW_MS).
 */
export function advanceBeaconLimit(
  bucket: BeaconBucket | undefined,
  now: number,
  maxPerWindow: number = BEACON_MAX_PER_WINDOW,
  windowMs: number = BEACON_WINDOW_MS,
): BeaconAdvanceResult {
  const expired = !bucket || now - bucket.windowStart >= windowMs;
  const nextBucket: BeaconBucket = expired
    ? { count: 1, windowStart: now }
    : { count: bucket.count + 1, windowStart: bucket.windowStart };
  return {
    allowed: nextBucket.count <= maxPerWindow,
    nextBucket,
  };
}

/**
 * Keeps a DO's bucket map bounded. Expired buckets go first — they cost nothing
 * to lose. Only if the map is still over capacity do live buckets get evicted,
 * **oldest windowStart first**.
 *
 * That ordering is the point: a flooding IP refreshes its windowStart on every
 * request, so it sorts last and is the final thing evicted. Eviction can never
 * hand an attacker a fresh budget.
 *
 * @param map Mutated in place.
 * @returns How many entries were removed.
 */
export function pruneBeaconBuckets(
  map: Map<string, BeaconBucket>,
  now: number,
  maxEntries: number = BEACON_MAX_TRACKED_IPS,
  windowMs: number = BEACON_WINDOW_MS,
): number {
  let evicted = 0;
  for (const [ip, bucket] of map) {
    if (now - bucket.windowStart >= windowMs) {
      map.delete(ip);
      evicted += 1;
    }
  }
  if (map.size <= maxEntries) return evicted;

  const oldestFirst = [...map.entries()].sort(
    (a, b) => a[1].windowStart - b[1].windowStart,
  );
  const overflow = map.size - Math.max(0, maxEntries);
  for (let i = 0; i < overflow; i += 1) {
    map.delete(oldestFirst[i][0]);
    evicted += 1;
  }
  return evicted;
}

/**
 * Accounts one beacon from `ip` against `map` and says whether to accept it.
 * The façade each log DO calls.
 *
 * UNKNOWN_IP is **exempt**: cf-connecting-ip is absent in local dev and in the
 * test harness, so limiting the shared "unknown" bucket would break every dev F8
 * upload at once rather than throttling any real attacker.
 */
export function checkBeaconLimit(
  map: Map<string, BeaconBucket>,
  ip: string,
  now: number,
  maxPerWindow: number = BEACON_MAX_PER_WINDOW,
  windowMs: number = BEACON_WINDOW_MS,
  maxEntries: number = BEACON_MAX_TRACKED_IPS,
): boolean {
  if (!ip || ip === UNKNOWN_IP) return true;

  const { allowed, nextBucket } = advanceBeaconLimit(
    map.get(ip),
    now,
    maxPerWindow,
    windowMs,
  );
  map.set(ip, nextBucket);

  // * Prune with hysteresis — drop to 90% of the cap so a saturated map doesn't
  // * pay a sort on every subsequent request.
  if (map.size > maxEntries) {
    pruneBeaconBuckets(map, now, Math.floor(maxEntries * 0.9), windowMs);
  }
  return allowed;
}

// ── QP-PLAYING-1: GET /api/playing ──────────────────────────────────────────
// Same per-IP bucket machinery as the POST beacons. Isolate Map; skip when
// cf-connecting-ip is absent. Sums every public shard — leftover overflow is real.

/** Generous enough for an 8s menu poll + a second tab. */
export const PLAYING_MAX_PER_WINDOW = 30;

export const PLAYING_CACHE_MAX_AGE_S = 8;

type PlayingCountNamespace = {
  idFromName(name: string): unknown;
  get(id: unknown): { playingCount(): Promise<number> };
};

let playingShardNamesOverride: string[] | null = null;

/** Test-only. Pass null to restore the public Quickplay list. */
export function setPlayingShardNamesOverride(names: string[] | null): void {
  playingShardNamesOverride = names;
}

function playingShardNames(): string[] {
  return playingShardNamesOverride ?? listQuickplayShardNames();
}

function clampPlayingCount(n: unknown): number {
  if (typeof n !== "number" || !Number.isFinite(n)) return 0;
  const i = Math.floor(n);
  return i > 0 ? i : 0;
}

/**
 * Sum live seated humans across every public Quickplay shard.
 * One shard throw becomes 0 for that shard; the rest still count.
 */
export async function sumQuickplayPlaying(
  ns: PlayingCountNamespace,
): Promise<number> {
  const counts = await Promise.all(
    playingShardNames().map(async (name) => {
      try {
        return clampPlayingCount(await ns.get(ns.idFromName(name)).playingCount());
      } catch {
        return 0;
      }
    }),
  );
  return counts.reduce((a, b) => a + b, 0);
}

const playingBuckets = new Map<string, BeaconBucket>();

/**
 * Best-effort per-IP cap on GET /api/playing. Caller skips this when
 * cf-connecting-ip is absent (local / harness) so unknown IPs never lock out.
 */
export function allowPlayingCount(ip: string, now: number): boolean {
  pruneBeaconBuckets(playingBuckets, now, BEACON_MAX_TRACKED_IPS, BEACON_WINDOW_MS);
  const { allowed, nextBucket } = advanceBeaconLimit(
    playingBuckets.get(ip),
    now,
    PLAYING_MAX_PER_WINDOW,
    BEACON_WINDOW_MS,
  );
  playingBuckets.set(ip, nextBucket);
  return allowed;
}

/** Test seam — the isolate Map outlives a single test. */
export function resetPlayingCountLimitForTests() {
  playingBuckets.clear();
}
