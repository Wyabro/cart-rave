// turnCache.test.js — pure per-room TURN credential cache rule (TURN-CACHE-1).
// Covers isTurnCacheFresh extracted from CartRaveServer's requestTurnCredentials
// handler: reuse across the token's validity window, and the safety skew that
// refuses to hand out a credential about to expire mid-ICE.

import { describe, expect, it } from "vitest";
import {
  TURN_CACHE_SAFETY_MS,
  TURN_TOKEN_TTL_MS,
  extractCacheableServers,
  isTurnCacheFresh,
} from "../../party/turnCache.ts";

describe("isTurnCacheFresh", () => {
  it("mints when no cache exists yet", () => {
    expect(isTurnCacheFresh(undefined, 1000)).toBe(false);
  });

  it("serves a freshly minted token", () => {
    const cache = { servers: [{ urls: "turn:example" }], expiresAtMs: 1000 + TURN_TOKEN_TTL_MS };
    expect(isTurnCacheFresh(cache, 1000)).toBe(true);
  });

  it("reuses the token across its validity window", () => {
    const cache = { servers: [{ urls: "turn:example" }], expiresAtMs: 1000 + TURN_TOKEN_TTL_MS };
    const lastUsableMs = 1000 + TURN_TOKEN_TTL_MS - TURN_CACHE_SAFETY_MS - 1;
    expect(isTurnCacheFresh(cache, lastUsableMs)).toBe(true);
  });

  it("refuses a token inside the final safety-skew minute", () => {
    const cache = { servers: [{ urls: "turn:example" }], expiresAtMs: 1000 + TURN_TOKEN_TTL_MS };
    const skewStartMs = 1000 + TURN_TOKEN_TTL_MS - TURN_CACHE_SAFETY_MS;
    expect(isTurnCacheFresh(cache, skewStartMs)).toBe(false);
    expect(isTurnCacheFresh(cache, skewStartMs + 30_000)).toBe(false);
  });

  it("refuses an expired token", () => {
    const cache = { servers: [{ urls: "turn:example" }], expiresAtMs: 5000 };
    expect(isTurnCacheFresh(cache, 5000)).toBe(false);
    expect(isTurnCacheFresh(cache, 10_000)).toBe(false);
  });
});

describe("extractCacheableServers", () => {
  it("returns the server list from a valid mint", () => {
    const servers = [{ urls: "turn:example", credential: "c" }];
    expect(extractCacheableServers(true, { servers })).toEqual(servers);
  });

  it("throws on a non-ok HTTP status so nothing is cached", () => {
    expect(() => extractCacheableServers(false, { servers: [{ urls: "turn:x" }] })).toThrow();
    expect(() => extractCacheableServers(false, null)).toThrow();
  });

  it("throws on a 200 error envelope without a servers field", () => {
    expect(() => extractCacheableServers(true, { success: false, errors: ["boom"] })).toThrow();
    expect(() => extractCacheableServers(true, null)).toThrow();
  });

  it("throws on a non-array servers field", () => {
    expect(() => extractCacheableServers(true, { servers: "nope" })).toThrow();
    expect(() => extractCacheableServers(true, { servers: {} })).toThrow();
  });

  it("throws on an empty servers array on 200", () => {
    expect(() => extractCacheableServers(true, { servers: [] })).toThrow();
  });
});
