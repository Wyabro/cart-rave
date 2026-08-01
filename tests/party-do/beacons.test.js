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
import { BEACON_MAX_PER_WINDOW } from "../../party/constants.ts";
import { clearAllLogs, listFrom, postBeacon } from "./beaconClient.js";

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
  // margin back: 200 is what makes "far past the 80-row ring depth" mean anything.
  it("stops a flood from evicting a real capture out of the 80-row ring", async () => {
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

  it("budgets per route, not shared — capped on log-error, still open on analytics", async () => {
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

  it("exempts requests with no cf-connecting-ip so local dev is never throttled", async () => {
    for (let i = 0; i < CAP + 10; i += 1) {
      const res = await postBeacon("/api/log-error", { message: `local-${i}` }, null);
      expect(res.status).toBe(204);
    }
    const { count } = await listFrom("ERROR_LOG", "errors");
    expect(count).toBe(CAP + 10);
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
