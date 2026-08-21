// Pure per-room TURN credential cache rule extracted from CartRaveServer so the
// mint-once-per-TTL reuse + safety-skew decisions are unit-testable without a
// Workers runtime or a live CF Calls fetch. index.ts owns the single per-room
// (per-DO) cache instance, the in-flight mint promise, and the failure-backoff
// timestamp.
//
// Invariant: a room mints at most one CF Calls token per TURN_TOKEN_TTL_MS;
// every request inside the token's usable window is answered from cache, so a
// connected client flooding request_turn_credentials cannot translate into a
// flood of live API calls carrying the account token.

/** Cloudflare Calls TURN token validity (matches the mint body ttl: 7200). */
export const TURN_TOKEN_TTL_MS = 7_200_000;

/**
 * Safety skew: stop handing out a cached token during its final minute so a
 * client never receives a credential that expires mid-ICE handshake. Costs at
 * most one extra mint per ~2h per room.
 */
export const TURN_CACHE_SAFETY_MS = 60_000;

/** After a failed mint, refuse another live CF Calls fetch for this long. */
export const TURN_FAIL_RETRY_MS = 5_000;

export type TurnCache = {
  /** TURN server entries from the CF Calls mint (client consumes verbatim). */
  servers: unknown[];
  /** Wall-clock ms when the minted token expires (mint time + TTL). */
  expiresAtMs: number;
};

/** True when the cached token still has usable validity left to hand out. */
export function isTurnCacheFresh(cache: TurnCache | undefined, nowMs: number): boolean {
  return cache !== undefined && nowMs < cache.expiresAtMs - TURN_CACHE_SAFETY_MS;
}

/**
 * Validate a CF Calls mint response into a cacheable server list. Throws on
 * every failure shape so the caller's catch/backoff path runs and nothing
 * empty gets latched into the room cache for the full TTL:
 * - non-ok HTTP status,
 * - a body without an array `servers` field (error envelope),
 * - a 200 with an empty `servers` array.
 */
export function extractCacheableServers(responseOk: boolean, resBody: unknown): unknown[] {
  if (!responseOk) {
    throw new Error('CF Calls TURN mint request failed');
  }
  let servers: unknown[] = [];
  if (resBody && typeof resBody === 'object' && 'servers' in resBody) {
    const raw = (resBody as Record<string, unknown>).servers;
    if (Array.isArray(raw)) servers = raw;
  }
  if (servers.length === 0) {
    throw new Error('CF Calls TURN mint returned no usable servers');
  }
  return servers;
}
