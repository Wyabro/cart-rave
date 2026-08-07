// @vitest-environment happy-dom
// analyticsGating.test.js — ANLX-ATTRACT-1: match_started/match_ended mean "I was an active
// participant in this round", not "my client saw RUNNING".
//
// A mid-round joiner adopts the room's `running` phase from hello/MSG.round while still on
// the menu with no cart, which booked phantom matches (162 of 212 recent match_ended rows
// were <3s all-draw quickplay phantoms). The gate is a live cart body, with a latch so a
// joiner still counts once its cart appears.
//
// getLocalCartActive is injected as a MUTABLE mock, so "cart appears later" is just a flag
// flip plus fake-timer advance — no fake game loop needed.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/** Records every batched payload so we can assert on emitted event names. */
function memorySink() {
  const batches = [];
  return { name: "memory", batches, send: (p) => batches.push(p) };
}

let sink;
/** Mutable participation flag — the thing under test. */
let cartActive;

// * installGameplayAnalytics subscribes to the gameStore singleton and never unsubscribes,
// * so re-installing across tests would stack live subscribers and multiply every event.
// * Reset the module registry per test and re-import, giving each case its own store.
let installGameplayAnalytics;
let initAnalytics;
let flushAnalytics;
let gameStore;
let RoundPhase;

/**
 * All events emitted so far. Events sit in a queue until a batch flush (30s idle timer in
 * production), so force one — otherwise every assertion reads an empty sink.
 */
function names() {
  flushAnalytics();
  return sink.batches.flatMap((b) => (b.events ?? []).map((e) => e.name));
}

function install() {
  installGameplayAnalytics({
    getMode: () => "quickplay",
    getLevelId: () => "classicRecord",
    getLocalSlot: () => 0,
    getLocalCartActive: () => cartActive,
  });
}

/** Drive a phase transition the way netcode/gameFlow would. */
function setPhase(phase) {
  gameStore.setState({ roundPhase: phase });
}

beforeEach(async () => {
  vi.useFakeTimers();
  vi.resetModules();
  ({ installGameplayAnalytics } = await import("../src/analytics/gameplayAnalytics.js"));
  ({ initAnalytics, flushAnalytics } = await import("../src/analytics/analytics.js"));
  ({ gameStore, RoundPhase } = await import("../src/stores/gameStore.js"));

  localStorage.clear();
  sink = memorySink();
  cartActive = false;
  gameStore.setState({ roundPhase: RoundPhase.LOBBY });
  initAnalytics({ sink });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("ANLX-ATTRACT-1 — participation gate", () => {
  it("emits nothing when a client adopts RUNNING with no cart (the phantom)", () => {
    install();
    setPhase(RoundPhase.RUNNING);
    vi.advanceTimersByTime(250);
    expect(names()).not.toContain("match_started");
  });

  it("emits exactly one match_started once the joiner's cart appears", () => {
    install();
    setPhase(RoundPhase.RUNNING);
    vi.advanceTimersByTime(250);
    expect(names().filter((n) => n === "match_started")).toHaveLength(0);

    cartActive = true;
    vi.advanceTimersByTime(250);

    const started = names().filter((n) => n === "match_started");
    expect(started).toHaveLength(1);

    // Latch must not keep firing once it has qualified.
    vi.advanceTimersByTime(1000);
    expect(names().filter((n) => n === "match_started")).toHaveLength(1);
  });

  it("emits immediately when the local player already has a cart", () => {
    cartActive = true;
    install();
    setPhase(RoundPhase.RUNNING);
    expect(names().filter((n) => n === "match_started")).toHaveLength(1);
  });

  it("does not emit match_ended when no match_started was emitted", async () => {
    install();
    setPhase(RoundPhase.RUNNING);
    vi.advanceTimersByTime(250);
    setPhase(RoundPhase.PODIUM);
    await Promise.resolve();
    expect(names()).not.toContain("match_ended");
  });

  it("emits a paired match_ended for a round it did start", async () => {
    // * durationMs uses performance.now(), which vitest fake timers do not advance — drive it.
    let now = 10_000;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    cartActive = true;
    install();
    setPhase(RoundPhase.RUNNING);
    now += 4_000; // past MIN_MATCH_DURATION_MS
    setPhase(RoundPhase.PODIUM);
    await Promise.resolve();
    expect(names().filter((n) => n === "match_started")).toHaveLength(1);
    expect(names().filter((n) => n === "match_ended")).toHaveLength(1);
  });

  it("match_ended carries per-match frame telemetry unconditionally (FREEZE-TELEMETRY-1)", async () => {
    let now = 10_000;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    cartActive = true;
    install();
    setPhase(RoundPhase.RUNNING);
    now += 4_000; // past MIN_MATCH_DURATION_MS
    setPhase(RoundPhase.PODIUM);
    await Promise.resolve();

    flushAnalytics();
    const events = sink.batches.flatMap((b) => b.events ?? []);
    const matchEnded = events.find((e) => e.name === "match_ended");

    // * No real gameLoop.js frames ticked in this test — asserts the fields are present,
    // * numeric, and unconditional (not gated behind any diag flag), not the accumulation
    // * math itself (covered directly in gameLoopResilience.test.js).
    expect(matchEnded).toBeDefined();
    expect(matchEnded.maxFrameMs).toBe(0);
    expect(matchEnded.framesOver33).toBe(0);
  });

  it("does not emit match_ended when duration is below MIN_MATCH_DURATION_MS (ANLX-BULK-1 L2)", async () => {
    let now = 10_000;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    cartActive = true;
    install();
    setPhase(RoundPhase.RUNNING);
    now += 50; // non-null short — must not emit (null still emits; L1 drops those in summary)
    setPhase(RoundPhase.PODIUM);
    await Promise.resolve();
    expect(names().filter((n) => n === "match_started")).toHaveLength(1);
    expect(names()).not.toContain("match_ended");
  });

  it("drops the latch on leaving RUNNING so a spectated round cannot fire into the next", () => {
    install();
    setPhase(RoundPhase.RUNNING); // spectated: no cart
    vi.advanceTimersByTime(250);
    setPhase(RoundPhase.LOBBY); // round ended without us ever joining

    // A cart appearing now belongs to no round — the stale latch must be gone.
    cartActive = true;
    vi.advanceTimersByTime(1000);
    expect(names()).not.toContain("match_started");
  });

  it("keeps working when the dep is absent (back-compat: treated as participating)", () => {
    installGameplayAnalytics({
      getMode: () => "solo",
      getLevelId: () => "classicRecord",
      getLocalSlot: () => 0,
    });
    setPhase(RoundPhase.RUNNING);
    expect(names().filter((n) => n === "match_started")).toHaveLength(1);
  });
});
