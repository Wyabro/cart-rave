/// <reference path="./env.d.ts" />
// SEC-ROUTE-1 — the five public /api/* routes match EXACTLY, not by substring.
//
// Before this, `url.pathname.includes("/api/errors")` swallowed any path CONTAINING
// the string — /x/api/errors, /assets/api/errors.js, /parties/…/x/api/errors — ahead
// of the /parties/ check and ASSETS.
//
// Asserts on handler FINGERPRINTS, never on a fallthrough status. An unmatched path
// falls through to env.ASSETS, and scripts/prepare-party-do.mjs only guarantees that
// dist/index.html exists — it writes a stub when dist/ is empty but leaves a real Vite
// build alone. So fallthrough is usually 200 HTML whose body varies by whether anyone
// ran `npm run build`. Keying on status alone would be non-deterministic across
// machines and CI.
//
// No cf-connecting-ip anywhere in this file: unknown IPs are exempt from the
// SEC-BEACON-1 cap by design, so a hot limiter from a sibling test cannot flake these.

import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { setPlayingShardNamesOverride } from "../../party/beaconLimit.ts";
import { clearAllLogs, postBeacon, requestPath } from "./beaconClient.js";

beforeAll(() => {
  setPlayingShardNamesOverride([]);
});

/** Reached the errors/token-gated handler: 503 "read endpoint disabled" or 403 forbidden. */
async function isTokenGateFingerprint(res) {
  if (res.status !== 503 && res.status !== 403) return false;
  const body = await res.text();
  return body.includes("read endpoint disabled") || body.includes("forbidden");
}

const capture = (label) => ({ label, body: JSON.stringify({ phase: "running" }) });

describe("SEC-ROUTE-1 exact route matching", () => {
  beforeEach(clearAllLogs);

  describe("/api/log-error", () => {
    it("still handles the exact path", async () => {
      expect((await postBeacon("/api/log-error", { message: "real" }, null)).status).toBe(204);
    });

    it("no longer swallows a path that merely contains it", async () => {
      expect((await postBeacon("/x/api/log-error", { message: "hijack" }, null)).status).not.toBe(204);
    });
  });

  describe("/api/captures", () => {
    it("still handles the exact path", async () => {
      const res = await postBeacon("/api/captures", capture("ROUTE-OK"), null);
      expect(res.status).toBe(200);
      expect((await res.json()).ok).toBe(true);
    });

    it("no longer swallows a prefixed path", async () => {
      const res = await postBeacon("/prefix/api/captures", capture("HIJACK"), null);
      const hitHandler = res.status === 200 && (await res.clone().json().catch(() => ({}))).ok === true;
      expect(hitHandler).toBe(false);
    });
  });

  describe("/api/playing", () => {
    it("still handles the exact path", async () => {
      const res = await requestPath("/api/playing");
      expect(res.status).toBe(200);
      expect((await res.json()).n).toEqual(expect.any(Number));
    });

    it("no longer swallows a path that merely contains it", async () => {
      const res = await requestPath("/x/api/playing");
      expect(res.status).not.toBe(200);
    });

    it("does not reach it for a trailing slash or suffix", async () => {
      expect((await requestPath("/api/playing/")).status).not.toBe(200);
      expect((await requestPath("/api/playingfoo")).status).not.toBe(200);
    });
  });

  describe("/api/analytics", () => {
    it("still handles the exact path", async () => {
      const body = { sessionId: "route-test", events: [{ name: "match_started" }] };
      expect((await postBeacon("/api/analytics", body, null)).status).toBe(204);
    });

    // * POST, not GET: GET /api/analytics runs the same token gate as /api/errors and
    // * returns the 503/403 shape, so a GET negative against a "204" fingerprint would
    // * be asserting against the wrong signature.
    it("no longer swallows a prefixed path", async () => {
      const body = { sessionId: "route-test", events: [{ name: "match_started" }] };
      expect((await postBeacon("/prefix/api/analytics", body, null)).status).not.toBe(204);
    });
  });

  describe("/api/errors — the suffix cases startsWith would still admit", () => {
    it("still reaches the token gate on the exact path", async () => {
      expect(await isTokenGateFingerprint(await requestPath("/api/errors"))).toBe(true);
    });

    it("does not reach it for /api/errorsfoo", async () => {
      expect(await isTokenGateFingerprint(await requestPath("/api/errorsfoo"))).toBe(false);
    });

    it("does not reach it for a trailing slash", async () => {
      expect(await isTokenGateFingerprint(await requestPath("/api/errors/"))).toBe(false);
    });

    it("does not reach it for an embedded path", async () => {
      expect(await isTokenGateFingerprint(await requestPath("/x/api/errors"))).toBe(false);
    });
  });

  describe("unmatched-path fallback", () => {
    // * routePartykitRequest returns null when nothing matches, and returning null
    // * from fetch() is a runtime TypeError. Prod 500s on unknown paths today; exact
    // * matching makes that reachable for near-miss API paths, so the fallback shipped
    // * with this card. Guard it — a 500 here is a user-visible regression.
    it("returns 404, not a 500, for a path nothing claims", async () => {
      const res = await requestPath("/definitely-not-a-real-path-xyz");
      expect(res.status).toBe(404);
    });

    it("does not dump analytics via the public party namespace", async () => {
      const res = await requestPath("/parties/analytics-log/v1/summary");
      expect(res.status).not.toBe(200);
      const text = await res.text();
      expect(text).not.toMatch(/byCountry|events/);
    });

    it("does not 500 on the near-miss API paths this card newly lets through", async () => {
      for (const path of ["/api/errorsfoo", "/api/errors/", "/x/api/errors"]) {
        expect((await requestPath(path)).status).not.toBe(500);
      }
    });
  });
});
