// @vitest-environment happy-dom
// bootTimeline.test.js — cr:* boot-phase marks + their __ccDiag "boot" event mirror, and the
// pure phase-transition invariant table consumed by the diagnostics watchdog.

import { describe, it, expect, beforeEach } from "vitest";
import { markBootPhase, readBootTimeline } from "../../src/utils/bootTimeline.js";
import { isLegalPhaseTransition } from "../../src/utils/invariants.js";
import { installDiagnostics, __resetDiagnosticsForTest } from "../../src/utils/diagnostics.js";

beforeEach(() => {
  __resetDiagnosticsForTest();
  try {
    performance.clearMarks();
  } catch {
    /* environment without clearMarks — readBootTimeline tolerates leftovers below */
  }
});

describe("bootTimeline", () => {
  it("stamps a cr:<name> performance mark readable via readBootTimeline", () => {
    markBootPhase("world-init-start");
    markBootPhase("world-ready");
    const names = readBootTimeline().map((m) => m.name);
    expect(names).toContain("world-init-start");
    expect(names).toContain("world-ready");
    const timeline = readBootTimeline();
    for (const m of timeline) expect(typeof m.tMs).toBe("number");
    // Oldest-first: init precedes ready.
    expect(names.indexOf("world-init-start")).toBeLessThan(names.indexOf("world-ready"));
  });

  it("mirrors marks onto the boot event channel when diagnostics are active", () => {
    installDiagnostics({});
    markBootPhase("carts-ready", { level: "classicRecord" });
    const events = window.__ccDiag.events().filter((e) => e.ch === "boot");
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: "carts-ready", level: "classicRecord" });
    expect(typeof events[0].tMs).toBe("number");
  });

  it("is a silent mark-only stamp when diagnostics are inactive (prod path)", () => {
    expect(() => markBootPhase("play-entry", { mode: "solo" })).not.toThrow();
    expect(window.__ccDiag).toBeUndefined();
    expect(readBootTimeline().map((m) => m.name)).toContain("play-entry");
  });

  it("records play-entry sub-phases in order when stamped", () => {
    for (const name of [
      "play-entry",
      "play-arena-done",
      "play-cart-glb-done",
      "play-carts-spawned",
      "play-shader-start",
      "play-shader-end",
      "carts-ready",
    ]) {
      markBootPhase(name);
    }
    const names = readBootTimeline().map((m) => m.name);
    const idx = (n) => names.indexOf(n);
    expect(idx("play-entry")).toBeLessThan(idx("play-arena-done"));
    expect(idx("play-arena-done")).toBeLessThan(idx("play-carts-spawned"));
    expect(idx("play-shader-start")).toBeLessThan(idx("play-shader-end"));
    expect(idx("play-shader-end")).toBeLessThan(idx("carts-ready"));
  });
});

describe("isLegalPhaseTransition (invariant table)", () => {
  it("accepts every real phase-machine flow", () => {
    const legal = [
      ["lobby", "countdown"], // round start
      ["lobby", "running"], // mid-round join seats into a live round
      ["countdown", "running"], // GO
      ["countdown", "lobby"], // abort / host loss
      ["running", "podium"], // round end
      ["running", "lobby"], // leave / return to menu
      ["podium", "countdown"], // rematch
      ["podium", "lobby"], // back to menu
    ];
    for (const [from, to] of legal) expect(isLegalPhaseTransition(from, to), `${from}→${to}`).toBe(true);
  });

  it("flags the wedge-class transitions as illegal", () => {
    const illegal = [
      ["lobby", "podium"],
      ["countdown", "podium"],
      ["running", "countdown"],
      ["podium", "running"],
    ];
    for (const [from, to] of illegal) expect(isLegalPhaseTransition(from, to), `${from}→${to}`).toBe(false);
  });

  it("treats unknown phases, nulls, and self-transitions as legal (no assert spam)", () => {
    expect(isLegalPhaseTransition("running", "running")).toBe(true);
    expect(isLegalPhaseTransition(null, "running")).toBe(true);
    expect(isLegalPhaseTransition("running", undefined)).toBe(true);
    expect(isLegalPhaseTransition("futurePhase", "running")).toBe(true);
  });
});
