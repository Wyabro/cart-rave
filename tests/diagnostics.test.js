// @vitest-environment happy-dom
// diagnostics.test.js — the __ccDiag core: zero-cost when inactive, probe registry, and the
// bounded event ring buffer. Deterministic (no browser, no rAF) — the module is a pure hub.

import { describe, it, expect, beforeEach } from "vitest";
import {
  installDiagnostics,
  registerDiagProbe,
  recordDiagEvent,
  isDiagActive,
  diagUrlFlags,
  __resetDiagnosticsForTest,
} from "../src/utils/diagnostics.js";

beforeEach(() => {
  __resetDiagnosticsForTest();
});

describe("diagnostics — inactive (no ?diag)", () => {
  it("is inert before install: no events, no probes, no window handle", () => {
    expect(isDiagActive()).toBe(false);
    expect(recordDiagEvent("round", "phase", { to: "running" })).toBe(0);
    registerDiagProbe("round", () => ({ phase: "running" }));
    expect(window.__ccDiag).toBeUndefined();
    expect(window.__ccDiagActive).toBeUndefined();
  });
});

describe("diagnostics — active (?diag)", () => {
  beforeEach(() => {
    installDiagnostics({ flags: { enabled: true } });
  });

  it("installs the read-only hub on window", () => {
    expect(isDiagActive()).toBe(true);
    expect(window.__ccDiagActive).toBe(true);
    expect(window.__ccDiag.version).toBe(1);
    expect(window.__ccDiag.active).toBe(true);
    expect(window.__ccDiag.control).toBeNull();
  });

  it("records events with a monotonic seq and channel/type", () => {
    const s1 = recordDiagEvent("round", "phase", { from: "lobby", to: "countdown" });
    const s2 = recordDiagEvent("score", "change", { slot: 0, delta: 1 });
    expect(s2).toBe(s1 + 1);
    const events = window.__ccDiag.events();
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ seq: s1, ch: "round", type: "phase", to: "countdown" });
    expect(events[1]).toMatchObject({ ch: "score", type: "change", slot: 0, delta: 1 });
    expect(typeof events[0].t).toBe("number");
  });

  it("events(sinceSeq) returns only newer records", () => {
    recordDiagEvent("a", "1");
    const cursor = window.__ccDiag.tail;
    recordDiagEvent("b", "2");
    recordDiagEvent("b", "3");
    const delta = window.__ccDiag.events(cursor);
    expect(delta.map((e) => e.ch)).toEqual(["b", "b"]);
  });

  it("bounds the ring buffer, dropping the oldest first", () => {
    for (let i = 0; i < 600; i += 1) recordDiagEvent("spam", String(i), { i });
    const events = window.__ccDiag.events();
    expect(events.length).toBe(512);
    // oldest surviving event is the (600-512)=88th, and seq keeps climbing.
    expect(events[0].i).toBe(600 - 512);
    expect(events[events.length - 1].i).toBe(599);
  });

  it("snapshot() runs all probes; snapshot(ns) runs one", () => {
    registerDiagProbe("round", () => ({ phase: "running" }));
    registerDiagProbe("score", () => ({ scores: { 0: 3 } }));
    const all = window.__ccDiag.snapshot();
    expect(all.round).toEqual({ phase: "running" });
    expect(all.score).toEqual({ scores: { 0: 3 } });
    expect(window.__ccDiag.snapshot("round")).toEqual({ phase: "running" });
    expect(window.__ccDiag.snapshot("missing")).toBeNull();
    expect(window.__ccDiag.probes().sort()).toEqual(["round", "score"]);
  });

  it("isolates a throwing probe as { error } instead of breaking the read", () => {
    registerDiagProbe("ok", () => ({ v: 1 }));
    registerDiagProbe("boom", () => {
      throw new Error("nope");
    });
    const all = window.__ccDiag.snapshot();
    expect(all.ok).toEqual({ v: 1 });
    expect(all.boom).toEqual({ error: "nope" });
  });

  it("attaches DEV-only control levers when provided", () => {
    __resetDiagnosticsForTest();
    const grantKos = () => {};
    installDiagnostics({ control: { grantKos } });
    expect(window.__ccDiag.control.grantKos).toBe(grantKos);
  });

  describe("captureBundle", () => {
    it("assembles a serializable bundle from probes + events", () => {
      registerDiagProbe("round", () => ({ phase: "podium", winnerSlotIndex: 1 }));
      registerDiagProbe("runtime", () => ({ userAgent: "test-ua", qualityTier: "high" }));
      recordDiagEvent("round", "phase", { from: "running", to: "podium" });
      recordDiagEvent("ko", "kill", { victim: 0, attacker: 1 });

      const bundle = window.__ccDiag.captureBundle({ scenario: "roundflow", reason: "unit" });
      expect(bundle.bundleVersion).toBe(1);
      expect(bundle.scenario).toBe("roundflow");
      expect(bundle.reason).toBe("unit");
      expect(bundle.phase).toBe("podium"); // pulled from the round probe snapshot
      expect(bundle.seed).toBeNull(); // no gameplay RNG seed exists to record
      expect(bundle.events).toHaveLength(2);
      expect(bundle.eventCounts).toEqual({ round: 1, ko: 1 });
      expect(bundle.snapshot.round).toEqual({ phase: "podium", winnerSlotIndex: 1 });
      expect(bundle.snapshot.runtime).toEqual({ userAgent: "test-ua", qualityTier: "high" });
      // The whole bundle must round-trip through JSON (it ships to disk / clipboard).
      expect(() => JSON.stringify(bundle)).not.toThrow();
    });

    it("survives a throwing probe (phase falls back, no throw)", () => {
      registerDiagProbe("round", () => {
        throw new Error("boom");
      });
      const bundle = window.__ccDiag.captureBundle({ scenario: "x" });
      expect(bundle.phase).toBeNull(); // degraded round probe → { error }, so no phase
      expect(bundle.snapshot.round).toEqual({ error: "boom" });
    });

    it("defaults scenario/reason to null when omitted", () => {
      const bundle = window.__ccDiag.captureBundle();
      expect(bundle.scenario).toBeNull();
      expect(bundle.reason).toBeNull();
      expect(Array.isArray(bundle.events)).toBe(true);
    });
  });
});

describe("diagUrlFlags", () => {
  it("enables on ?diag / ?diag=1 and stays off otherwise", () => {
    expect(diagUrlFlags("?diag").enabled).toBe(true);
    expect(diagUrlFlags("?diag=1").enabled).toBe(true);
    expect(diagUrlFlags("?diag=0").enabled).toBe(false);
    expect(diagUrlFlags("?diag=off").enabled).toBe(false);
    expect(diagUrlFlags("?nettest=1").enabled).toBe(false);
    expect(diagUrlFlags("").enabled).toBe(false);
  });
});
