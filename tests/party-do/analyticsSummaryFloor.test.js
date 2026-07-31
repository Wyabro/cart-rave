// analyticsSummaryFloor.test.js — ANLX-BULK-1 L1: product match metrics ignore short /
// null-duration match_ended; byName stays raw (P-A).

import { describe, it, expect, beforeEach } from "vitest";
import { clearAllLogs, postBeacon, logStub } from "./beaconClient.js";
import { MIN_MATCH_DURATION_MS } from "../../shared/analyticsConstants.js";

async function summaryFromAnalytics() {
  const res = await logStub("ANALYTICS_LOG").fetch("https://do/summary");
  expect(res.status).toBe(200);
  return res.json();
}

function batch(events) {
  return {
    sessionId: "s-bulk",
    clientId: "c-bulk",
    build: "test",
    events,
  };
}

beforeEach(async () => {
  await clearAllLogs();
});

describe("ANLX-BULK-1 L1 — summary duration floor", () => {
  it("excludes short and null-duration match_ended from arena/mode/result but keeps byName raw", async () => {
    const res = await postBeacon(
      "/api/analytics",
      batch([
        {
          name: "match_ended",
          arena: "classicRecord",
          mode: "quickplay",
          result: "loss",
          durationMs: 5,
          kos: 24,
        },
        {
          name: "match_ended",
          arena: "classicRecord",
          mode: "quickplay",
          result: "loss",
          durationMs: null,
          kos: 0,
        },
        {
          name: "match_ended",
          arena: "classicRecord",
          mode: "solo",
          result: "win",
          durationMs: MIN_MATCH_DURATION_MS,
          kos: 3,
        },
        {
          name: "match_ended",
          arena: "backrooms",
          mode: "quickplay",
          result: "loss",
          durationMs: 150_000,
          kos: 2,
        },
        { name: "match_started", arena: "classicRecord", mode: "quickplay" },
      ]),
      "1.1.1.1",
    );
    expect(res.status).toBe(204);

    const s = await summaryFromAnalytics();

    // * P-A: byName is raw volume — all four match_ended + one match_started.
    const byName = Object.fromEntries((s.byName ?? []).map((r) => [r.name, r.n]));
    expect(byName.match_ended).toBe(4);
    expect(byName.match_started).toBe(1);

    // * Product metrics: only duration_ms >= MIN (3000 and 150000) — not 5ms, not null.
    const arenaN = Object.fromEntries((s.matchesByArena ?? []).map((r) => [r.arena, r.n]));
    expect(arenaN.classicRecord).toBe(1);
    expect(arenaN.backrooms).toBe(1);

    const modeN = Object.fromEntries((s.matchesByMode ?? []).map((r) => [r.mode, r.n]));
    expect(modeN.solo).toBe(1);
    expect(modeN.quickplay).toBe(1);

    const resultN = Object.fromEntries((s.resultSplit ?? []).map((r) => [r.result, r.n]));
    expect(resultN.win).toBe(1);
    expect(resultN.loss).toBe(1);
  });
});
