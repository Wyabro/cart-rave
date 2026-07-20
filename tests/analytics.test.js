// @vitest-environment happy-dom
// analytics.test.js — the analytics core: gating (uninitialized / opted-out = no-op),
// bounded queue, deferred batching, sink abstraction. Deterministic (memory sink, no network).

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  initAnalytics,
  trackEvent,
  flushAnalytics,
  getAnalyticsDebugState,
  isAnalyticsOptedOut,
  __resetAnalyticsForTest,
} from "../src/analytics/analytics.js";
import { STORAGE_KEYS } from "../src/utils/storage.js";

/** A sink that just records payloads. */
function memorySink() {
  const batches = [];
  return { name: "memory", batches, send: (p) => batches.push(p) };
}

beforeEach(() => {
  __resetAnalyticsForTest();
  localStorage.clear();
});

describe("analytics — gating", () => {
  it("trackEvent is a no-op before init (single null check)", () => {
    expect(trackEvent("match_started", { arena: "classicRecord" })).toBe(false);
    expect(getAnalyticsDebugState()).toEqual({ enabled: false });
  });

  it("declines init when the player opted out via localStorage", () => {
    localStorage.setItem(STORAGE_KEYS.analytics, "off");
    expect(initAnalytics({ sink: memorySink() })).toBe(false);
    expect(trackEvent("match_started")).toBe(false);
  });

  it("isAnalyticsOptedOut honors the URL kill switch", () => {
    expect(isAnalyticsOptedOut("?analytics=off")).toBe(true);
    expect(isAnalyticsOptedOut("?analytics=0")).toBe(true);
    expect(isAnalyticsOptedOut("?analytics=false")).toBe(true);
    expect(isAnalyticsOptedOut("?analytics=on")).toBe(false);
    expect(isAnalyticsOptedOut("")).toBe(false);
  });

  it("init is idempotent", () => {
    const sink = memorySink();
    expect(initAnalytics({ sink })).toBe(true);
    expect(initAnalytics({ sink: memorySink() })).toBe(true);
    trackEvent("session_start");
    flushAnalytics();
    expect(sink.batches).toHaveLength(1); // first sink kept
  });
});

describe("analytics — queue + batching", () => {
  it("queues events and flushes them as one serialized batch", () => {
    const sink = memorySink();
    initAnalytics({ sink });
    trackEvent("match_started", { arena: "backrooms", mode: "solo" });
    trackEvent("match_ended", { arena: "backrooms", durationMs: 150000, result: "win" });
    expect(sink.batches).toHaveLength(0); // nothing sent per event
    const flushed = flushAnalytics("test");
    expect(flushed).toBe(2);
    expect(sink.batches).toHaveLength(1);
    const batch = sink.batches[0];
    expect(batch.v).toBe(1);
    expect(typeof batch.sessionId).toBe("string");
    expect(batch.reason).toBe("test");
    expect(batch.events.map((e) => e.name)).toEqual(["match_started", "match_ended"]);
    expect(batch.events[0].arena).toBe("backrooms");
    expect(typeof batch.events[0].t).toBe("number");
    expect(() => JSON.stringify(batch)).not.toThrow();
  });

  it("keeps props flat: drops nested objects, clamps long strings", () => {
    const sink = memorySink();
    initAnalytics({ sink });
    trackEvent("weird", { ok: 1, nested: { a: 1 }, fn: () => {}, long: "x".repeat(500), nul: null });
    flushAnalytics();
    const evt = sink.batches[0].events[0];
    expect(evt.ok).toBe(1);
    expect(evt.nested).toBeUndefined();
    expect(evt.fn).toBeUndefined();
    expect(evt.nul).toBeUndefined();
    expect(evt.long.length).toBe(80);
  });

  it("an event storm becomes bounded batches, never an unbounded queue", () => {
    const sink = memorySink();
    initAnalytics({ sink });
    for (let i = 0; i < 200; i += 1) trackEvent("spam", { i });
    // The batch threshold flushes every 20 events, so the queue never grows past it
    // (QUEUE_MAX is a deeper backstop) and nothing is lost.
    expect(sink.batches).toHaveLength(10);
    expect(sink.batches.every((b) => b.events.length === 20)).toBe(true);
    expect(getAnalyticsDebugState().queued).toBe(0);
    expect(getAnalyticsDebugState().dropped).toBe(0);
  });

  it("auto-flushes when the queue reaches the batch threshold", () => {
    const sink = memorySink();
    initAnalytics({ sink });
    for (let i = 0; i < 20; i += 1) trackEvent("evt", { i });
    expect(sink.batches).toHaveLength(1);
    expect(sink.batches[0].events).toHaveLength(20);
    expect(getAnalyticsDebugState().queued).toBe(0);
  });

  it("arms a timer on first event and flushes on it (no standing interval)", () => {
    vi.useFakeTimers();
    try {
      const sink = memorySink();
      initAnalytics({ sink });
      trackEvent("evt", { i: 1 });
      expect(sink.batches).toHaveLength(0);
      vi.advanceTimersByTime(31_000);
      expect(sink.batches).toHaveLength(1);
      // queue empty → no timer alive → advancing again sends nothing
      vi.advanceTimersByTime(120_000);
      expect(sink.batches).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("flushing an empty queue is a no-op", () => {
    const sink = memorySink();
    initAnalytics({ sink });
    expect(flushAnalytics()).toBe(0);
    expect(sink.batches).toHaveLength(0);
  });

  it("visibilitychange→hidden flushes the queue", () => {
    const sink = memorySink();
    initAnalytics({ sink });
    trackEvent("evt");
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(sink.batches).toHaveLength(1);
  });

  it("pagehide runs the onPageHide provider before the final flush", () => {
    const sink = memorySink();
    initAnalytics({
      sink,
      onPageHide: () => trackEvent("session_end", { matches: 2 }),
    });
    trackEvent("match_started");
    window.dispatchEvent(new Event("pagehide"));
    expect(sink.batches).toHaveLength(1);
    expect(sink.batches[0].events.map((e) => e.name)).toEqual(["match_started", "session_end"]);
    expect(sink.batches[0].reason).toBe("pagehide");
  });
});

describe("gameplayAnalytics — challenge_completed from isComplete", () => {
  it("emits exactly one challenge_completed on isComplete transition (no duplicate on later updates)", async () => {
    const sink = memorySink();
    initAnalytics({ sink });

    const { installGameplayAnalytics } = await import("../src/analytics/gameplayAnalytics.js");
    const { challengeStore, CHALLENGE_POOL } = await import("../src/stores/challengeStore.js");
    const { PROGRESSION_EVENTS } = await import("../src/progression/eventIds.js");

    const meta = CHALLENGE_POOL.find((c) => c.id === "spill_15");
    expect(meta).toBeTruthy();
    challengeStore.setState({
      dailyChallenges: [{ id: "spill_15", progress: meta.goal - 1, isComplete: false }],
      weeklyChallenges: [],
    });

    installGameplayAnalytics({});

    challengeStore.getState().record(PROGRESSION_EVENTS.SPILL, 1);
    flushAnalytics("test");
    const completed = sink.batches.flatMap((b) => b.events).filter((e) => e.name === "challenge_completed");
    expect(completed).toHaveLength(1);
    expect(completed[0].id).toBe("spill_15");

    challengeStore.getState().record(PROGRESSION_EVENTS.SPILL, 1);
    challengeStore.setState({
      dailyChallenges: [{ id: "spill_15", progress: meta.goal, isComplete: true }],
      weeklyChallenges: [],
    });
    flushAnalytics("test2");
    const again = sink.batches.flatMap((b) => b.events).filter((e) => e.name === "challenge_completed");
    expect(again).toHaveLength(1);
  });
});
