// clientIdAuth.test.js — CLIENT-ID-AUTH-1: proof-of-ownership for MSG.join clientId claims.
//
// Before this guard, any join naming a victim's clientId triggered ghost exorcism:
// the victim's live socket was closed with 4010, their human slot converted to NPC,
// and a sole-human room promoted the *joiner* to host ahead of oldest-connection
// order. Griefing-only vector (clientId is not broadcast), but free to exploit.
//
// Pure registry logic runs node-side; source-shape assertions pin the wiring so the
// exorcism block can never silently lose its gate (same convention as quickplayShards).

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  ClientIdTokenRegistry,
  MAX_TRACKED_CLIENT_IDS,
} from "../../party/clientIdAuth.ts";

const mintFixed = () => "minted-token";

describe("ClientIdTokenRegistry", () => {
  it("mints on first-ever claim and reports the token", () => {
    const reg = new ClientIdTokenRegistry();
    const v = reg.claim("client-a", "", mintFixed);
    expect(v).toEqual({ action: "mint", token: "minted-token" });
    expect(reg.has("client-a")).toBe(true);
  });

  it("verifies the owner presenting the minted token", () => {
    const reg = new ClientIdTokenRegistry();
    reg.claim("client-a", "", mintFixed);
    expect(reg.claim("client-a", "minted-token", mintFixed)).toEqual({ action: "verified" });
  });

  it("rejects a wrong token as unverified", () => {
    const reg = new ClientIdTokenRegistry();
    reg.claim("client-a", "", mintFixed);
    expect(reg.claim("client-a", "attacker-guess", mintFixed)).toEqual({ action: "unverified" });
  });

  it("rejects a missing token once one is stored (hijack attempt)", () => {
    const reg = new ClientIdTokenRegistry();
    reg.claim("victim-client", "", mintFixed);
    // Attacker joins claiming victim's clientId with no sessionToken at all.
    expect(reg.claim("victim-client", undefined, mintFixed)).toEqual({ action: "unverified" });
    // The stored secret was not rotated by the failed claim.
    expect(reg.claim("victim-client", "minted-token", mintFixed)).toEqual({ action: "verified" });
  });

  it("treats distinct clientIds independently", () => {
    const reg = new ClientIdTokenRegistry();
    reg.claim("client-a", "", mintFixed);
    expect(reg.claim("client-b", "", () => "b-token")).toEqual({
      action: "mint",
      token: "b-token",
    });
    expect(reg.claim("client-b", "minted-token", mintFixed)).toEqual({ action: "unverified" });
  });

  it("stays bounded at MAX_TRACKED_CLIENT_IDS (oldest-inserted evicted)", () => {
    const reg = new ClientIdTokenRegistry();
    let n = 0;
    const mintCounter = () => `t${n++}`;
    for (let i = 0; i < MAX_TRACKED_CLIENT_IDS + 10; i++) {
      reg.claim(`client-${i}`, "", mintCounter);
    }
    expect(reg.size).toBe(MAX_TRACKED_CLIENT_IDS);
    expect(reg.has("client-0")).toBe(false);
    expect(reg.has(`client-${MAX_TRACKED_CLIENT_IDS + 9}`)).toBe(true);
  });

  it("re-mints after eviction without crashing", () => {
    const reg = new ClientIdTokenRegistry();
    let n = 0;
    const mintCounter = () => `t${n++}`;
    // One extra claim evicts client-0 (oldest-inserted).
    for (let i = 0; i <= MAX_TRACKED_CLIENT_IDS; i++) reg.claim(`client-${i}`, "", mintCounter);
    expect(reg.has("client-0")).toBe(false);
    expect(reg.claim("client-0", "", mintCounter)).toEqual({ action: "mint", token: `t${n - 1}` });
  });
});

describe("CLIENT-ID-AUTH-1 wiring (source shape)", () => {
  const serverSrc = readFileSync(new URL("../../party/index.ts", import.meta.url), "utf8");
  const clientSrc = readFileSync(new URL("../../src/netcode.js", import.meta.url), "utf8");
  const protocolSrc = readFileSync(new URL("../../shared/protocol.js", import.meta.url), "utf8");

  it("server resets an unverified clientId before the exorcism block", () => {
    expect(serverSrc).toContain('verdict.action === "unverified"');
    expect(serverSrc).toContain('clientId = "";');
    // Gate must run before ghost scanning (#connClientId.entries loop).
    const gateAt = serverSrc.indexOf('verdict.action === "unverified"');
    const exorciseAt = serverSrc.indexOf("#connClientId.entries()");
    expect(gateAt).toBeGreaterThan(-1);
    expect(exorciseAt).toBeGreaterThan(gateAt);
  });

  it("server delivers the minted token via MSG.sessionToken", () => {
    expect(serverSrc).toContain("type: MSG.sessionToken");
  });

  it("protocol defines the session_token server→client message", () => {
    expect(protocolSrc).toMatch(/sessionToken:\s*"session_token"/);
  });

  it("client sends its sessionToken with MSG.join", () => {
    expect(clientSrc).toContain("sessionToken");
    expect(clientSrc).toMatch(/\{\s*type:\s*MSG\.join,[^}]*sessionToken/);
  });

  it("client persists a minted sessionToken", () => {
    expect(clientSrc).toContain("cartRaveSessionToken");
    expect(clientSrc).toContain("MSG.sessionToken");
  });
});
