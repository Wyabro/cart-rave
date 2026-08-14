import { describe, it, expect, vi, afterEach } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  parseArgs,
  buildCachePayload,
  formatSummary,
  pullAnalytics,
  writeAnalyticsCache,
} from "../../tools/pull-analytics.mjs";
import { parseAnalyticsCache } from "../../tools/lib/projectHealth.mjs";

describe("pull-analytics parseArgs / cache schema", () => {
  it("parses flags", () => {
    expect(parseArgs(["--list", "--limit", "25", "--url", "https://example.test"])).toEqual({
      limit: 25,
      list: true,
      url: "https://example.test",
      help: false,
    });
  });

  it("buildCachePayload matches projectHealth schema", () => {
    const summary = { sessions: 2, clients: 1 };
    const payload = buildCachePayload({
      url: "https://cart-rave.wyabro.workers.dev",
      summary,
      pulledAt: "2026-07-22T00:00:00.000Z",
    });
    expect(payload).toMatchObject({
      pulledAt: "2026-07-22T00:00:00.000Z",
      url: "https://cart-rave.wyabro.workers.dev",
      summary: { sessions: 2, clients: 1 },
    });
    expect(parseAnalyticsCache(payload)).toEqual(payload);
  });

  it("parseAnalyticsCache rejects partial payloads", () => {
    expect(parseAnalyticsCache(null)).toBeNull();
    expect(parseAnalyticsCache({ pulledAt: "x" })).toBeNull();
    expect(parseAnalyticsCache({ pulledAt: "x", url: "y" })).toBeNull();
  });
});

describe("formatSummary null-guards window", () => {
  it("handles missing window (empty DO)", () => {
    const text = formatSummary({ sessions: 0, clients: 0, byName: [] });
    expect(text).toContain("no data yet");
    expect(text).toContain("sessions=0");
  });

  it("prints window when present", () => {
    const text = formatSummary({
      window: { rows: 3, oldest: 1, newest: 9 },
      sessions: 1,
      clients: 1,
      matchesByArena: [{ arena: "classic", n: 2, avgDurationMs: 1000, avgKos: 1.5 }],
    });
    expect(text).toContain("rows=3");
    expect(text).toContain("classic");
  });

  it("prints Wave A geo + session rollups when present", () => {
    const text = formatSummary({
      window: { rows: 2, oldest: 1, newest: 2 },
      sessions: 2,
      clients: 1,
      avgSessionMs: 45000,
      returningSessions: { first: 1, returning: 1 },
      byCountry: [{ country: "US", n: 2 }],
      byRegion: [{ country: "US", region: "UT", n: 1 }],
    });
    expect(text).toContain("avgSessionMs=45000");
    expect(text).toContain("returning=1");
    expect(text).toContain("US=2");
    expect(text).toContain("US-UT=1");
  });
});

describe("pullAnalytics fetch paths", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns summary on 200 with Bearer auth (no ?token=)", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ sessions: 4, clients: 2, byName: [] }),
    }));
    const result = await pullAnalytics({
      url: "https://example.test/",
      token: "tok",
      fetchImpl: fetchMock,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toEqual({ sessions: 4, clients: 2, byName: [] });
    expect(fetchMock.mock.calls[0][0]).toBe("https://example.test/api/analytics");
    expect(String(fetchMock.mock.calls[0][0])).not.toContain("token=");
    expect(fetchMock.mock.calls[0][1]).toEqual({
      headers: { Authorization: "Bearer tok" },
    });
  });

  it("surfaces HTTP failures", async () => {
    const result = await pullAnalytics({
      url: "https://example.test",
      token: "tok",
      fetchImpl: vi.fn(async () => ({
        ok: false,
        status: 403,
        text: async () => "forbidden",
      })),
    });
    expect(result).toEqual({ ok: false, status: 403, body: "forbidden" });
  });

  it("requests list view when list=true (Bearer, no ?token=)", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ count: 0, events: [] }),
    }));
    await pullAnalytics({
      url: "https://example.test",
      token: "secret",
      list: true,
      limit: 10,
      fetchImpl: fetchMock,
    });
    const [reqUrl, init] = fetchMock.mock.calls[0];
    expect(reqUrl).toContain("view=list");
    expect(reqUrl).toContain("limit=10");
    expect(String(reqUrl)).not.toContain("token=");
    expect(init).toEqual({ headers: { Authorization: "Bearer secret" } });
  });
});

describe("writeAnalyticsCache atomic rename", () => {
  it("writes the final cache file", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "cc-anlx-"));
    try {
      const payload = buildCachePayload({
        url: "https://example.test",
        summary: { sessions: 1 },
        pulledAt: "2026-07-22T12:00:00.000Z",
      });
      const dest = await writeAnalyticsCache(payload, { outDir: dir });
      const raw = JSON.parse(await readFile(dest, "utf8"));
      expect(parseAnalyticsCache(raw)).toEqual(payload);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
