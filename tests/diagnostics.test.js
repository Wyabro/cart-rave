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
