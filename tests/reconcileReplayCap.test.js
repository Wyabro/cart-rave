// reconcileReplayCap.test.js — NET-PERF-1 bound on non-host Rapier replay (run-7 Match A)
import { describe, it, expect } from "vitest";
import { trimPendingForReconcileReplay } from "../src/utils/reconcileReplay.js";
import { CONFIG } from "../src/config.js";

describe("trimPendingForReconcileReplay", () => {
  it("leaves short queues untouched", () => {
    const pending = [{ seq: 1 }, { seq: 2 }, { seq: 3 }];
    expect(trimPendingForReconcileReplay(pending, 8)).toBe(0);
    expect(pending.map((p) => p.seq)).toEqual([1, 2, 3]);
  });

  it("keeps oldest frames (continuous after host ack) and drops newest", () => {
    // * seq 1 is the first unacked after host ack — must stay index 0 for correct replay.
    const pending = Array.from({ length: 20 }, (_, i) => ({ seq: i + 1 }));
    expect(trimPendingForReconcileReplay(pending, 8)).toBe(12);
    expect(pending).toHaveLength(8);
    expect(pending[0].seq).toBe(1);
    expect(pending[7].seq).toBe(8);
  });

  it("no-ops on empty / bad cap", () => {
    expect(trimPendingForReconcileReplay([], 8)).toBe(0);
    const pending = [{ seq: 1 }, { seq: 2 }];
    expect(trimPendingForReconcileReplay(pending, 0)).toBe(0);
    expect(trimPendingForReconcileReplay(pending, -1)).toBe(0);
    expect(pending).toHaveLength(2);
  });
});

describe("CONFIG.net prediction caps (run-7)", () => {
  it("keeps pending history and reconcile replay in the same tight budget", () => {
    expect(CONFIG.net.predictionPendingInputsMax).toBeLessThanOrEqual(32);
    expect(CONFIG.net.prediction.reconcileReplayMaxSteps).toBeGreaterThan(0);
    expect(CONFIG.net.prediction.reconcileReplayMaxSteps).toBeLessThanOrEqual(
      CONFIG.net.predictionPendingInputsMax,
    );
  });
});
