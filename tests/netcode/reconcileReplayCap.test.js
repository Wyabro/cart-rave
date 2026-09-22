// reconcileReplayCap.test.js — NET-PERF-1 bound on non-host Rapier replay (run-7 Match A)
import { describe, it, expect } from "vitest";
import { selectPendingForReconcileReplay } from "../../src/utils/reconcileReplay.js";
import { CONFIG } from "../../src/config.js";

describe("selectPendingForReconcileReplay", () => {
  it("returns a short queue without changing live prediction history", () => {
    const pending = [{ seq: 1 }, { seq: 2 }, { seq: 3 }];
    const selection = selectPendingForReconcileReplay(pending, 8);

    expect(selection.inputs.map((p) => p.seq)).toEqual([1, 2, 3]);
    expect(selection.deferredCount).toBe(0);
    expect(pending.map((p) => p.seq)).toEqual([1, 2, 3]);
  });

  it("replays a continuous oldest-first budget without deleting deferred input", () => {
    // * seq 1 is the first unacked after host ack — must stay index 0 for correct replay.
    const pending = Array.from({ length: 20 }, (_, i) => ({ seq: i + 1 }));
    const selection = selectPendingForReconcileReplay(pending, 8);

    expect(selection.inputs.map((p) => p.seq)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(selection.deferredCount).toBe(12);
    expect(pending.map((p) => p.seq)).toEqual(
      Array.from({ length: 20 }, (_, i) => i + 1),
    );
  });

  it("returns no replay work for empty input or a disabled budget", () => {
    expect(selectPendingForReconcileReplay([], 8)).toEqual({ inputs: [], deferredCount: 0 });
    const pending = [{ seq: 1 }, { seq: 2 }];
    expect(selectPendingForReconcileReplay(pending, 0)).toEqual({
      inputs: [],
      deferredCount: 2,
    });
    expect(selectPendingForReconcileReplay(pending, -1)).toEqual({
      inputs: [],
      deferredCount: 2,
    });
    expect(pending).toHaveLength(2);
  });

  it("makes deferred frames eligible after later host acknowledgements", () => {
    const pending = Array.from({ length: 14 }, (_, i) => ({ seq: i + 1 }));
    const first = selectPendingForReconcileReplay(pending, 12);

    expect(first.inputs.at(-1)?.seq).toBe(12);
    expect(first.deferredCount).toBe(2);

    const afterAck = pending.filter((item) => item.seq > 2);
    const second = selectPendingForReconcileReplay(afterAck, 12);
    expect(second.inputs.map((item) => item.seq)).toEqual(
      Array.from({ length: 12 }, (_, i) => i + 3),
    );
    expect(second.deferredCount).toBe(0);
  });
});

describe("CONFIG.net prediction caps (run-7)", () => {
  it("retains the captured 718 ms ack spike without increasing replay work", () => {
    const retainedHistoryMs = CONFIG.net.predictionPendingInputsMax * (1000 / 60);
    expect(retainedHistoryMs).toBeGreaterThanOrEqual(1000);
    expect(CONFIG.net.prediction.reconcileReplayMaxSteps).toBeGreaterThan(0);
    expect(CONFIG.net.prediction.reconcileReplayMaxSteps).toBeLessThanOrEqual(12);
    expect(CONFIG.net.predictionPendingInputsMax).toBeGreaterThan(
      CONFIG.net.prediction.reconcileReplayMaxSteps,
    );
  });

  it("holds live prediction after a short host silence (combat ghost-world guard)", () => {
    // * Below normal multi-tick jitter (40Hz ≈ 25ms) would freeze feel; multi-second
    // * host freezes (Match A F8 snapGapMax 1–5s) must trip the hold.
    expect(CONFIG.net.prediction.holdAfterSnapGapMs).toBeGreaterThanOrEqual(100);
    expect(CONFIG.net.prediction.holdAfterSnapGapMs).toBeLessThanOrEqual(300);
  });

  it("skip-replay is gap-gated rather than replay-budget-gated", () => {
    // * Cap-13: skip-on-any-drop caused hard reverses on nearly-full pending.
    // * A budgeted replay still leaves continuous oldest-N; only long snap gaps skip replay.
    expect(CONFIG.net.prediction.skipReplayAfterSnapGapMs).toBeGreaterThanOrEqual(500);
    expect(CONFIG.net.prediction.skipReplayAfterSnapGapMs).toBeGreaterThan(
      CONFIG.net.prediction.holdAfterSnapGapMs,
    );
  });
});
