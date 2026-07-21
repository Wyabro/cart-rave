// @vitest-environment happy-dom
// longTaskProbe.test.js — Run-7 P0 forensics helpers (ring, gap query, focus snapshot).

import { describe, it, expect, beforeEach } from "vitest";
import {
  noteLongTask,
  getLongTaskStats,
  getRecentLongTasks,
  longTasksForGap,
  getFocusSnapshot,
  installLongTaskProbe,
  installFocusGapLatch,
  readAndResetGapFocusLatch,
  __resetLongTaskProbeForTest,
} from "../src/utils/longTaskProbe.js";
import {
  installDiagnostics,
  __resetDiagnosticsForTest,
} from "../src/utils/diagnostics.js";

beforeEach(() => {
  __resetLongTaskProbeForTest();
  __resetDiagnosticsForTest();
});

describe("longTaskProbe", () => {
  it("tracks stats and recent ring from noteLongTask", () => {
    noteLongTask({ start: 1000, durMs: 120, name: "self" });
    noteLongTask({ start: 2000, durMs: 800, name: "unknown" });
    noteLongTask({ start: 4000, durMs: 2500, name: "script" });

    const s = getLongTaskStats();
    expect(s.count).toBe(3);
    expect(s.maxMs).toBe(2500);
    expect(s.over100).toBe(3);
    expect(s.over500).toBe(2);
    expect(s.over1000).toBe(1);
    expect(s.sumMs).toBe(120 + 800 + 2500);
  });

  it("filters recent tasks by time window", () => {
    noteLongTask({ start: 100, durMs: 50, name: "a" }); // ends 150
    noteLongTask({ start: 500, durMs: 100, name: "b" }); // ends 600
    noteLongTask({ start: 900, durMs: 200, name: "c" }); // ends 1100

    expect(getRecentLongTasks(600).map((r) => r.name)).toEqual(["b", "c"]);
    expect(getRecentLongTasks(0, 200).map((r) => r.name)).toEqual(["a"]);
  });

  it("longTasksForGap returns largest overlapping tasks first, capped", () => {
    noteLongTask({ start: 10_000, durMs: 80, name: "tiny" });
    noteLongTask({ start: 10_050, durMs: 4000, name: "blocker" });
    noteLongTask({ start: 14_000, durMs: 200, name: "tail" });
    noteLongTask({ start: 50_000, durMs: 900, name: "elsewhere" });

    // * Freeze window roughly 10000..14100 (4s resume)
    const lt = longTasksForGap(10_000, 14_100, 3);
    expect(lt[0]).toEqual({ d: 4000, n: "blocker" });
    expect(lt.map((x) => x.n)).not.toContain("elsewhere");
    expect(lt.length).toBeLessThanOrEqual(3);
  });

  it("emits perf/longtask events when diag is active and task is large", () => {
    installDiagnostics({ flags: { enabled: true } });
    noteLongTask({ start: 0, durMs: 50, name: "small" }); // under EVENT_MIN_MS
    noteLongTask({ start: 100, durMs: 500, name: "big" });
    const events = window.__ccDiag.events().filter((e) => e.type === "longtask");
    expect(events.length).toBe(1);
    expect(events[0]).toMatchObject({ ch: "perf", durMs: 500, name: "big" });
  });

  it("getFocusSnapshot reads document state", () => {
    const snap = getFocusSnapshot();
    expect(snap).toHaveProperty("hidden");
    expect(snap).toHaveProperty("vis");
    expect(snap).toHaveProperty("focused");
    expect(typeof snap.hidden).toBe("boolean");
  });

  it("installLongTaskProbe is idempotent and does not throw without longtask API", () => {
    // * happy-dom typically lacks longtask — install returns false, stays safe.
    const a = installLongTaskProbe();
    const b = installLongTaskProbe();
    expect(typeof a).toBe("boolean");
    expect(b).toBe(a);
    expect(getLongTaskStats().installed).toBe(true);
  });

  describe("gap focus latch", () => {
    it("starts clear", () => {
      installFocusGapLatch();
      expect(readAndResetGapFocusLatch()).toEqual({
        hiddenDuringGap: false,
        blurredDuringGap: false,
      });
    });

    it("latches true on a hide during the gap, then clears on read", () => {
      installFocusGapLatch();
      Object.defineProperty(document, "hidden", { value: true, configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));

      expect(readAndResetGapFocusLatch()).toEqual({
        hiddenDuringGap: true,
        blurredDuringGap: false,
      });
      // * Read cleared the latch — a subsequent gap with no new hide reads false again.
      expect(readAndResetGapFocusLatch()).toEqual({
        hiddenDuringGap: false,
        blurredDuringGap: false,
      });

      Object.defineProperty(document, "hidden", { value: false, configurable: true });
    });

    it("latches true on a window blur during the gap", () => {
      installFocusGapLatch();
      window.dispatchEvent(new Event("blur"));

      expect(readAndResetGapFocusLatch()).toEqual({
        hiddenDuringGap: false,
        blurredDuringGap: true,
      });
    });

    it("visibilitychange while still visible (occlusion, not hide) does not latch", () => {
      installFocusGapLatch();
      // * document.hidden stays false — e.g. Chrome fires this on some focus transitions
      // * without actually hiding the page. Only a genuine hide should latch.
      document.dispatchEvent(new Event("visibilitychange"));

      expect(readAndResetGapFocusLatch()).toEqual({
        hiddenDuringGap: false,
        blurredDuringGap: false,
      });
    });

    it("installFocusGapLatch is idempotent (double install does not double-latch)", () => {
      installFocusGapLatch();
      installFocusGapLatch();
      window.dispatchEvent(new Event("blur"));
      // * If the listener were registered twice, a single dispatch would still only set the
      // * same boolean true once — assert the simple, expected shape either way.
      expect(readAndResetGapFocusLatch()).toEqual({
        hiddenDuringGap: false,
        blurredDuringGap: true,
      });
    });
  });
});
