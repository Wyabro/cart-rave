/// <reference path="./env.d.ts" />
// SEC-BEACON-1 — open POST beacon rate limiting, driven end-to-end through the
// real Worker fetch entry (party/index.ts) into the three log DOs.
//
// Isolation is load-bearing: the log DOs are idFromName("v1") singletons that
// outlive any single test, and isolatedStorage resets SQLite but NOT instance
// memory — so the limiter's bucket map survives too. Every test clears both
// through the DO's /clear route, which resets ring + limiter together.
//
// Readback goes to the DO stub directly, never GET /api/errors: that route is
// gated on the ERROR_LOG_TOKEN secret, which is absent in CI.

import { beforeEach, describe, expect, it } from "vitest";
import { ANALYTICS_MAX_PER_WINDOW, BEACON_MAX_PER_WINDOW } from "../../party/constants.ts";
import { clearAllLogs, getCapture, listFrom, postBeacon } from "./beaconClient.js";

const CAP = BEACON_MAX_PER_WINDOW;

const capture = (label) => ({ label, body: JSON.stringify({ phase: "running" }) });

describe("SEC-BEACON-1 open beacon rate limit", () => {
  beforeEach(clearAllLogs);

  it("caps a flooding IP and 429s the beacon past the cap", async () => {
    const ip = "10.9.9.1";
    for (let i = 0; i < CAP; i += 1) {
      const res = await postBeacon("/api/log-error", { message: `flood-${i}` }, ip);
      expect(res.status).toBe(204);
    }
    const over = await postBeacon("/api/log-error", { message: "over-cap" }, ip);
    expect(over.status).toBe(429);

    const { count } = await listFrom("ERROR_LOG", "errors");
    expect(count).toBe(CAP);
  });

  it("limits per IP — a second IP is untouched by the first one's flood", async () => {
    const flooder = "10.9.9.1";
    for (let i = 0; i < CAP; i += 1) {
      await postBeacon("/api/log-error", { message: `flood-${i}` }, flooder);
    }
    expect((await postBeacon("/api/log-error", { message: "x" }, flooder)).status).toBe(429);
    expect((await postBeacon("/api/log-error", { message: "y" }, "10.9.9.2")).status).toBe(204);
  });

  // TEST-MARGIN-1: explicit timeout, because this case is 201 sequential round trips
  // through the real Worker entry into a DO — the slowest test in the suite by an order
  // of magnitude. On the default 5000ms it ran with no headroom in CI (10681ms for this
  // FILE against 4.66s locally), so unrelated load elsewhere in the run tipped it over
  // and turned the gate red. The flood size is deliberately NOT reduced to buy that
  // margin back: the cap admits exactly CAP of 200, which is what the assertion needs.
  it("stops a flood from evicting a real capture out of the ring", async () => {
    // The whole point of the card: unbounded, ~80 junk POSTs erase a playtest's
    // F8 bundles. Capped, one IP can never reach the ring depth.
    const sentinel = await postBeacon("/api/captures", capture("SENTINEL"), "10.9.9.3");
    expect(sentinel.status).toBe(200);
    expect((await sentinel.json()).ok).toBe(true);

    let accepted = 0;
    for (let i = 0; i < 200; i += 1) {
      const res = await postBeacon("/api/captures", capture(`junk-${i}`), "10.9.9.4");
      if (res.status !== 429) accepted += 1;
    }
    expect(accepted).toBe(CAP);

    const { rows } = await listFrom("CAPTURE_LOG", "captures", 200);
    expect(rows.some((r) => r.label === "SENTINEL")).toBe(true);
  }, 30_000);

  it("budgets per route, not shared — each log DO defends its own ring", async () => {
    const ip = "10.9.9.5";
    for (let i = 0; i < CAP; i += 1) {
      await postBeacon("/api/log-error", { message: `flood-${i}` }, ip);
    }
    expect((await postBeacon("/api/log-error", { message: "x" }, ip)).status).toBe(429);

    const analytics = await postBeacon(
      "/api/analytics",
      { sessionId: "s1", events: [{ name: "match_ended" }] },
      ip,
    );
    expect(analytics.status).toBe(204);
  });

  it("caps analytics POSTs at ANALYTICS_MAX_PER_WINDOW per ip", async () => {
    const ip = "10.9.9.7";
    let accepted = 0;
    for (let i = 0; i < ANALYTICS_MAX_PER_WINDOW + 5; i += 1) {
      const res = await postBeacon(
        "/api/analytics",
        { sessionId: "s3", events: [{ name: "match_ended", durationMs: 4000 }] },
        ip,
      );
      if (res.status === 204) accepted += 1;
    }
    expect(accepted).toBe(ANALYTICS_MAX_PER_WINDOW);
  });

  it("exempts requests with no cf-connecting-ip so local dev is never throttled", async () => {
    for (let i = 0; i < CAP + 10; i += 1) {
      const res = await postBeacon("/api/log-error", { message: `local-${i}` }, null);
      expect(res.status).toBe(204);
    }
    const { count } = await listFrom("ERROR_LOG", "errors");
    expect(count).toBe(CAP + 10);
  });

  it("accepts a gzip-base64 F8 envelope whose JSON exceeds the request cap", async () => {
    const bulky = {
      phase: "running",
      events: Array.from({ length: 120 }, (_unused, i) => ({
        ch: "cart_pop",
        seq: i,
        supportTimeline: Array.from({ length: 60 }, () => ({
          t: 1, y: 0.375, radius: 15.8, vy: 0, recordPairs: 3, supportPairs: 1, supportPoints: 5,
        })),
      })),
    };
    const json = JSON.stringify(bulky);
    expect(json.length).toBeGreaterThan(350_000);
    const bytes = new Uint8Array(
      await new Response(new Blob([json]).stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer(),
    );
    let binary = "";
    for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
    const res = await postBeacon(
      "/api/captures",
      { label: "GZIP-WAVE-G", encoding: "gzip-base64", body: btoa(binary) },
      null,
    );
    expect(res.status).toBe(200);
    const { id } = await res.json();
    const { status, row } = await getCapture(id);
    expect(status).toBe(200);
    expect(JSON.parse(String(row.body)).events).toHaveLength(120);
  });

  it("rejects a gzip bomb before store and does not 500", async () => {
    const zeros = new Uint8Array(8_000_000);
    const bytes = new Uint8Array(
      await new Response(new Blob([zeros]).stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer(),
    );
    let binary = "";
    for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
    const res = await postBeacon(
      "/api/captures",
      { label: "GZIP-BOMB", encoding: "gzip-base64", body: btoa(binary) },
      null,
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: "rejected" });
    const { count, rows } = await listFrom("CAPTURE_LOG", "captures");
    expect(count).toBe(0);
    expect(rows.some((r) => r.label === "GZIP-BOMB")).toBe(false);
  });

  it("returns bad_gzip for a corrupt gzip-base64 body", async () => {
    const res = await postBeacon(
      "/api/captures",
      { label: "BAD-GZIP", encoding: "gzip-base64", body: btoa("not-gzip") },
      null,
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: "bad_gzip" });
  });

  it("leaves the normal path unchanged", async () => {
    const cap = await postBeacon("/api/captures", capture("F8"), "10.9.9.6");
    expect(cap.status).toBe(200);
    expect((await cap.json()).ok).toBe(true);

    const analytics = await postBeacon(
      "/api/analytics",
      { sessionId: "s2", events: [{ name: "match_started" }] },
      "10.9.9.6",
    );
    expect(analytics.status).toBe(204);

    const err = await postBeacon("/api/log-error", { message: "ordinary crash" }, "10.9.9.6");
    expect(err.status).toBe(204);
  });
});
