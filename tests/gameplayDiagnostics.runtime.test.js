// @vitest-environment happy-dom
// DIAG-TIER-1 — exercises the real installGameplayDiagnostics "runtime" probe
// (not a mocked registerDiagProbe stub in diagnostics.test.js).

import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { installDiagnostics, __resetDiagnosticsForTest } from "../src/utils/diagnostics.js";
import {
  installGameplayDiagnostics,
  __resetPerfRoundWindowsForTest,
} from "../src/utils/gameplayDiagnostics.js";
import { gameStore, RoundPhase } from "../src/stores/gameStore.js";
import {
  setMenuPreviewVisualLod,
  setQualityTier,
  setSessionQualityTier,
} from "../src/utils/qualityMode.js";

const STUB_DEPS = {
  getCarts: () => null,
  getNetSlots: () => null,
  getCamera: () => null,
};

function runtimeQuality() {
  const runtime = window.__ccDiag.snapshot("runtime");
  expect(runtime).toBeTruthy();
  expect(runtime.error).toBeUndefined();
  return {
    qualityTier: runtime.qualityTier,
    qualityTierStored: runtime.qualityTierStored,
    qualityTierOverride: runtime.qualityTierOverride,
  };
}

beforeAll(() => {
  __resetDiagnosticsForTest();
  installDiagnostics({ flags: { enabled: true } });
  installGameplayDiagnostics(STUB_DEPS);
});

beforeEach(() => {
  // * Reset qualityMode module state + persisted store tier between cases.
  setMenuPreviewVisualLod(false);
  setSessionQualityTier(null);
  setQualityTier("medium");
});

describe("DIAG-TIER-1 — gameplayDiagnostics runtime quality fields", () => {
  it("reports effective low after a session demotion while stored stays medium", () => {
    setQualityTier("medium");
    setSessionQualityTier("low");

    expect(runtimeQuality()).toEqual({
      qualityTier: "low",
      qualityTierStored: "medium",
      qualityTierOverride: "low",
    });
  });

  it("effective equals stored only when session override and menu-preview LOD are both off", () => {
    setQualityTier("medium");
    setMenuPreviewVisualLod(false);
    setSessionQualityTier(null);

    expect(runtimeQuality()).toEqual({
      qualityTier: "medium",
      qualityTierStored: "medium",
      qualityTierOverride: null,
    });
  });

  it("menu-preview LOD forces effective low without writing an override", () => {
    setQualityTier("medium");
    setMenuPreviewVisualLod(true);

    expect(runtimeQuality()).toEqual({
      qualityTier: "low",
      qualityTierStored: "medium",
      qualityTierOverride: null,
    });
  });
});

// ————— PERF-PASS-1 — per-round frame-time windows —————
// The whole design exists because `window.__ccLoopDbg` is CUMULATIVE for the page load and has
// no reset path: a naive read reports the session, not the round. These cases pin the
// differencing, because getting it wrong produces a plausible number rather than an error.

/** Advance the cumulative loop counters as `frames` frames each costing `msPerFrame`. */
function advanceLoop({ frames, msPerFrame, simShare = 0.5, visShare = 0.25 }) {
  const d = (window.__ccLoopDbg = window.__ccLoopDbg || {
    frames: 0, resumeZeroed: 0, chronicSlow: 0, maxDt: 0, lastDt: 0, over33: 0, over66: 0,
    timed: 0, sumMs: 0, over16: 0, simMs: 0, visMs: 0,
  });
  d.frames += frames;
  d.timed += frames;
  d.sumMs += frames * msPerFrame;
  d.simMs += frames * msPerFrame * simShare;
  d.visMs += frames * msPerFrame * visShare;
  if (msPerFrame > 16.7) d.over16 += frames;
  if (msPerFrame > 33) d.over33 += frames;
  if (msPerFrame > 66) d.over66 += frames;
}

function perf() {
  return window.__ccDiag.snapshot("perf");
}

describe("PERF-PASS-1 — per-round frame-time windows", () => {
  beforeEach(() => {
    __resetPerfRoundWindowsForTest();
    // * The real loop creates this on its first frame, long before any round starts — a window
    // * opened with no counters yet has no baseline to difference against and is dropped.
    window.__ccLoopDbg = {
      frames: 0, resumeZeroed: 0, chronicSlow: 0, maxDt: 0, lastDt: 0, over33: 0, over66: 0,
      timed: 0, sumMs: 0, over16: 0, simMs: 0, visMs: 0,
    };
    gameStore.setState({ roundPhase: RoundPhase.LOBBY });
  });

  it("reports the round's own mean, not the session's", () => {
    // A long, cheap warm-up before the round must not pull the round's mean down.
    advanceLoop({ frames: 3000, msPerFrame: 8 });
    gameStore.setState({ roundPhase: RoundPhase.RUNNING });
    advanceLoop({ frames: 1000, msPerFrame: 25 });
    gameStore.setState({ roundPhase: RoundPhase.PODIUM });

    const rounds = perf().rounds;
    expect(rounds).toHaveLength(1);
    expect(rounds[0].meanMs).toBeCloseTo(25, 3);
    expect(rounds[0].fps).toBeCloseTo(40, 1);
    expect(rounds[0].timed).toBe(1000);
    expect(rounds[0].pass).toBe(false);
  });

  it("differences a second round against the first, not against zero", () => {
    gameStore.setState({ roundPhase: RoundPhase.RUNNING });
    advanceLoop({ frames: 1000, msPerFrame: 25 });
    gameStore.setState({ roundPhase: RoundPhase.PODIUM });

    gameStore.setState({ roundPhase: RoundPhase.RUNNING });
    advanceLoop({ frames: 1000, msPerFrame: 12 });
    gameStore.setState({ roundPhase: RoundPhase.PODIUM });

    const rounds = perf().rounds;
    expect(rounds).toHaveLength(2);
    expect(rounds[0].meanMs).toBeCloseTo(25, 3);
    // Cumulative counters now read 37ms/frame overall — the second window must not.
    expect(rounds[1].meanMs).toBeCloseTo(12, 3);
    expect(rounds[1].pass).toBe(true);
  });

  it("exposes loopRound live during RUNNING and null outside it", () => {
    expect(perf().loopRound).toBeNull();

    gameStore.setState({ roundPhase: RoundPhase.RUNNING });
    advanceLoop({ frames: 600, msPerFrame: 20 });
    // Mid-round read — this is what makes an F8 at 60-90s a complete measurement.
    const live = perf().loopRound;
    expect(live).toBeTruthy();
    expect(live.meanMs).toBeCloseTo(20, 3);
    expect(live.timed).toBe(600);

    gameStore.setState({ roundPhase: RoundPhase.PODIUM });
    expect(perf().loopRound).toBeNull();
  });

  it("splits CPU from the unaccounted remainder", () => {
    gameStore.setState({ roundPhase: RoundPhase.RUNNING });
    advanceLoop({ frames: 500, msPerFrame: 20, simShare: 0.4, visShare: 0.35 });
    gameStore.setState({ roundPhase: RoundPhase.PODIUM });

    const r = perf().rounds[0];
    expect(r.simMeanMs).toBeCloseTo(8, 3);
    expect(r.visMeanMs).toBeCloseTo(7, 3);
    expect(r.cpuMeanMs).toBeCloseTo(15, 3);
    // 20ms frame, 15ms on the main thread — the rest is present-wait, not a GPU timer.
    expect(r.unaccountedMeanMs).toBeCloseTo(5, 3);
  });

  it("passes only when the mean is inside 16.7ms", () => {
    gameStore.setState({ roundPhase: RoundPhase.RUNNING });
    advanceLoop({ frames: 800, msPerFrame: 16.6 });
    gameStore.setState({ roundPhase: RoundPhase.PODIUM });
    expect(perf().rounds[0].pass).toBe(true);
    expect(perf().rounds[0].over16).toBe(0);
  });

  it("keeps at most 8 windows", () => {
    for (let i = 0; i < 11; i += 1) {
      gameStore.setState({ roundPhase: RoundPhase.RUNNING });
      advanceLoop({ frames: 100, msPerFrame: 10 + i });
      gameStore.setState({ roundPhase: RoundPhase.PODIUM });
    }
    const rounds = perf().rounds;
    expect(rounds).toHaveLength(8);
    // Oldest dropped, newest kept.
    expect(rounds[rounds.length - 1].meanMs).toBeCloseTo(20, 3);
  });

  it("degrades to null when the loop counters do not exist", () => {
    delete window.__ccLoopDbg;
    gameStore.setState({ roundPhase: RoundPhase.RUNNING });
    expect(perf().loopRound).toBeNull();
    gameStore.setState({ roundPhase: RoundPhase.PODIUM });
    expect(perf().rounds).toHaveLength(0);
  });
});
