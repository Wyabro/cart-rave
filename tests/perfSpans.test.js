import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mark, spansOverlapping, _resetSpans } from "../src/utils/perfSpans.js";

/**
 * perfSpans records named durations for freeze attribution. Timing is driven by
 * performance.now(), so we stub it with a controllable queue to make thresholds and
 * overlap windows deterministic (no real busy-waiting / flake).
 */
describe("perfSpans", () => {
  /** @type {number[]} */
  let nowQueue;

  beforeEach(() => {
    _resetSpans();
    nowQueue = [];
    vi.spyOn(performance, "now").mockImplementation(() => {
      // Each mark() reads now() twice (start, end); shift the scripted values.
      return nowQueue.length ? /** @type {number} */ (nowQueue.shift()) : 0;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("records a span that clears the 4ms floor and returns fn()'s value", () => {
    nowQueue = [0, 10]; // 10ms span
    const out = mark("physics.step", () => 42);
    expect(out).toBe(42);
    expect(spansOverlapping(0, 20)).toEqual([{ n: "physics.step", d: 10 }]);
  });

  it("ignores a sub-4ms span (not a freeze suspect)", () => {
    nowQueue = [100, 101]; // 1ms
    mark("pa.sting", () => {});
    expect(spansOverlapping(0, 1000)).toEqual([]);
  });

  it("times and records even when fn throws, then re-throws", () => {
    nowQueue = [0, 8];
    expect(() => mark("vfx.shatter", () => {
      throw new Error("boom");
    })).toThrow("boom");
    expect(spansOverlapping(0, 20)).toEqual([{ n: "vfx.shatter", d: 8 }]);
  });

  it("only returns spans whose end falls inside the window (± slack)", () => {
    nowQueue = [0, 10]; // ends at 10
    mark("early", () => {});
    nowQueue = [100, 120]; // ends at 120
    mark("late", () => {});
    // Window [90,130] captures only the late span; the early one (end=10) is excluded.
    expect(spansOverlapping(90, 130)).toEqual([{ n: "late", d: 20 }]);
  });

  it("sorts longest-first and caps the list", () => {
    for (const [name, dur] of [["a", 5], ["b", 30], ["c", 12]]) {
      nowQueue = [0, dur];
      mark(name, () => {});
    }
    expect(spansOverlapping(0, 100, 2)).toEqual([
      { n: "b", d: 30 },
      { n: "c", d: 12 },
    ]);
  });
});
