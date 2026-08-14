// adminAuth.test.js — SEC-TOKEN-1 pure helpers (Bearer extract + timing-safe equal + gate).

import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import {
  bearerToken,
  timingSafeEqualString,
  requireAdminToken,
  denyLogAdminIfConfigured,
  isLogAdminRoute,
  logRouteTail,
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

describe("log admin route tails", () => {
  it("maps party paths and internal DO paths to the same tail", () => {
    expect(logRouteTail("/parties/analytics-log/v1/summary")).toBe("summary");
    expect(logRouteTail("https://do/list")).toBe("list");
    expect(isLogAdminRoute("/parties/capture-log/v1/clear")).toBe(true);
    expect(isLogAdminRoute("/ingest")).toBe(false);
  });

  it("denyLogAdminIfConfigured allows Worker-internal /list even when a secret exists", () => {
    const r = new Request("https://do/list");
    expect(denyLogAdminIfConfigured(r, "secret")).toBeNull();
  });

  it("denyLogAdminIfConfigured forbids a public summary without Bearer when set", () => {
    const r = new Request("https://example.test/parties/analytics-log/v1/summary");
    expect(denyLogAdminIfConfigured(r, "secret")?.status).toBe(403);
  });
});

describe("errorReporter global", () => {
  it("does not assign window.__cartRaveSendErrorLog", () => {
    const src = readFileSync(new URL("../../src/utils/errorReporter.js", import.meta.url), "utf8");
    expect(src).not.toMatch(/__cartRaveSendErrorLog\s*=/);
  });
});
