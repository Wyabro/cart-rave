// adminAuth.test.js — SEC-TOKEN-1 pure helpers (Bearer extract + timing-safe equal + gate).

import { describe, it, expect } from "vitest";
import {
  bearerToken,
  timingSafeEqualString,
  requireAdminToken,
} from "../../party/adminAuth.ts";

function req(headers = {}) {
  return new Request("https://example.test/api/analytics", { headers });
}

describe("bearerToken", () => {
  it("reads Authorization Bearer", () => {
    expect(bearerToken(req({ Authorization: "Bearer secret" }))).toBe("secret");
    expect(bearerToken(req({ authorization: "bearer  secret  " }))).toBe("secret");
  });

  it("ignores missing or malformed headers", () => {
    expect(bearerToken(req())).toBeNull();
    expect(bearerToken(req({ Authorization: "Basic x" }))).toBeNull();
    expect(bearerToken(req({ Authorization: "Bearer" }))).toBeNull();
  });
});

describe("timingSafeEqualString", () => {
  it("accepts equal strings", () => {
    expect(timingSafeEqualString("abc", "abc")).toBe(true);
    expect(timingSafeEqualString("", "")).toBe(true);
  });

  it("rejects unequal strings and length mismatches", () => {
    expect(timingSafeEqualString("abc", "abd")).toBe(false);
    expect(timingSafeEqualString("abc", "ab")).toBe(false);
    expect(timingSafeEqualString("ab", "abc")).toBe(false);
  });
});

describe("requireAdminToken", () => {
  it("returns 503 when secret is unset", () => {
    const res = requireAdminToken(req({ Authorization: "Bearer x" }), undefined);
    expect(res).not.toBeNull();
    expect(res.status).toBe(503);
  });

  it("returns 403 without Bearer or with wrong token", () => {
    expect(requireAdminToken(req(), "secret").status).toBe(403);
    expect(requireAdminToken(req({ Authorization: "Bearer wrong" }), "secret").status).toBe(403);
  });

  it("returns null when Bearer matches (ok to proceed)", () => {
    expect(requireAdminToken(req({ Authorization: "Bearer secret" }), "secret")).toBeNull();
  });
});
