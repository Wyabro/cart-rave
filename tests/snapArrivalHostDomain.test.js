// @vitest-environment happy-dom
//
// Run-7 2e residual: non-host snapGaps* / prediction hold used wall time at
// onmessage. A hitchy Intel client inflated gaps and false-tripped hold while
// the host kept 40Hz. Gaps prefer snapshot tHost (host send cadence).
import { describe, it, expect, beforeEach } from "vitest";
import {
  getLastSnapshotArrivalGapMs,
  getNetFlowStats,
  getSnapshotSilenceMs,
  __netcodeTestHooks as hooks,
} from "../src/netcode.js";

describe("snapshot arrival host-domain (2e)", () => {
  beforeEach(() => {
    hooks.resetNetState();
    hooks.resetNetFlowStatsForTest();
    hooks.setHostStateForTest({ isHost: false, youConnId: "c1", netSlots: [] });
  });

  it("counts inter-arrival gaps from tHost (client wall delay does not inflate)", () => {
    // * Steady 25ms host cadence — gap must stay 25 even if wall time between
    // * note* calls is large (client stall then burst process).
    hooks.noteSnapshotArrivalForTest(1_000_000);
    hooks.noteSnapshotArrivalForTest(1_000_025);

    const flow = getNetFlowStats();
    expect(getLastSnapshotArrivalGapMs()).toBe(25);
    expect(flow.snapGapsOver100).toBe(0);
    expect(flow.snapGapMaxMs).toBe(25);
    expect(flow.snapCount).toBe(1);
  });

  it("records a real host send stall as a large tHost gap", () => {
    hooks.noteSnapshotArrivalForTest(2_000_000);
    hooks.noteSnapshotArrivalForTest(2_000_800); // 800ms host silence
    expect(getLastSnapshotArrivalGapMs()).toBe(800);
    expect(getNetFlowStats().snapGapsOver100).toBe(1);
    expect(getNetFlowStats().snapGapMaxMs).toBe(800);
  });

  it("ignores non-positive tHost jumps (reorder / epoch)", () => {
    hooks.noteSnapshotArrivalForTest(3_000_100);
    hooks.noteSnapshotArrivalForTest(3_000_050); // went backwards — ignored
    expect(getNetFlowStats().snapCount).toBe(0);
    hooks.noteSnapshotArrivalForTest(3_000_125);
    // * lastTHost stayed 3_000_100; gap to 125 = 25.
    expect(getLastSnapshotArrivalGapMs()).toBe(25);
    expect(getNetFlowStats().snapCount).toBe(1);
  });

  it("does not report silence on the host peer", () => {
    hooks.setHostStateForTest({ isHost: true });
    hooks.noteSnapshotArrivalForTest(4_000_000);
    expect(getSnapshotSilenceMs()).toBe(0);
  });

  it("a 200ms host tHost gap exceeds holdAfterSnapGapMs (150) for skip/hold gates", () => {
    hooks.noteSnapshotArrivalForTest(4_100_000);
    hooks.noteSnapshotArrivalForTest(4_100_200);
    expect(getLastSnapshotArrivalGapMs()).toBe(200);
    expect(getLastSnapshotArrivalGapMs()).toBeGreaterThan(150);
  });
});
