// analyticsGeoInsights.test.js — Wave A: CF country/region into props, returning flag,
// summary byCountry / byRegion / avgSessionMs / returningSessions.

import { describe, it, expect, beforeEach } from "vitest";
import { clearAllLogs, postBeacon, listFrom, logStub } from "./beaconClient.js";

function batch(events, clientId = "c-geo") {
  return {
    sessionId: `s-${clientId}`,
    clientId,
    build: "test",
    events,
  };
}

async function summaryFromAnalytics() {
  const res = await logStub("ANALYTICS_LOG").fetch("https://do/summary");
  expect(res.status).toBe(200);
  return res.json();
}

beforeEach(async () => {
  await clearAllLogs();
});

describe("Wave A — geo + session insights", () => {
  it("stamps country + region into props and rolls them into summary", async () => {
    const res = await postBeacon(
      "/api/analytics",
      batch([{ name: "session_start", mode: "solo", t: 1 }]),
      "1.2.3.4",
      { "cf-ipcountry": "US", "cf-region-code": "UT" },
    );
    expect(res.status).toBe(204);

    const { rows } = await listFrom("ANALYTICS_LOG", "events", 5);
    expect(rows).toHaveLength(1);
    const props = JSON.parse(String(rows[0].props));
    expect(props.country).toBe("US");
    expect(props.region).toBe("UT");
    expect(props.returning).toBe(0);

    const s = await summaryFromAnalytics();
    expect(s.byCountry).toEqual([{ country: "US", n: 1 }]);
    expect(s.byRegion).toEqual([{ country: "US", region: "UT", n: 1 }]);
    expect(s.returningSessions).toEqual({ first: 1, returning: 0 });
  });

  it("marks returning=1 on a second session_start for the same clientId", async () => {
    const geo = { "cf-ipcountry": "US", "cf-region-code": "CA" };
    expect(
      (await postBeacon("/api/analytics", batch([{ name: "session_start", t: 1 }], "c-ret"), "5.5.5.5", geo))
        .status,
    ).toBe(204);
    expect(
      (await postBeacon("/api/analytics", batch([{ name: "session_start", t: 2 }], "c-ret"), "5.5.5.5", geo))
        .status,
    ).toBe(204);

    const { rows } = await listFrom("ANALYTICS_LOG", "events", 5);
    const propsList = rows.map((r) => JSON.parse(String(r.props)));
    // * Newest first.
    expect(propsList[0].returning).toBe(1);
    expect(propsList[1].returning).toBe(0);

    const s = await summaryFromAnalytics();
    expect(s.returningSessions).toEqual({ first: 1, returning: 1 });
  });

  it("avgSessionMs averages session_end duration_ms", async () => {
    const res = await postBeacon(
      "/api/analytics",
      batch([
        { name: "session_end", durationMs: 10_000, t: 1 },
        { name: "session_end", durationMs: 30_000, t: 2 },
      ]),
      "9.9.9.9",
      { "cf-ipcountry": "CA" },
    );
    expect(res.status).toBe(204);
    const s = await summaryFromAnalytics();
    expect(s.avgSessionMs).toBe(20_000);
  });

  it("server geo overwrites a spoofed client country/region", async () => {
    const res = await postBeacon(
      "/api/analytics",
      batch([{ name: "session_start", country: "XX", region: "FAKE", t: 1 }]),
      "8.8.8.8",
      { "cf-ipcountry": "GB", "cf-region-code": "ENG" },
    );
    expect(res.status).toBe(204);
    const { rows } = await listFrom("ANALYTICS_LOG", "events", 1);
    const props = JSON.parse(String(rows[0].props));
    expect(props.country).toBe("GB");
    expect(props.region).toBe("ENG");
  });
});
