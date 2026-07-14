// @vitest-environment happy-dom
// happy-dom: gameLoop.js transitively imports nipplejs (via touchControls), which
// touches `window` at module load; the default node environment throws on import.
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { runGameLoop, createGameLoopState } from "../src/gameLoop.js";

// * Drive the rAF game loop deterministically: the loop self-schedules via
// * requestAnimationFrame, so we capture the scheduled step and invoke it by hand
// * one frame at a time. This exercises the unrecoverable-error circuit breaker
// * without a real Rapier crash (which can't be reproduced on demand).
describe("gameLoop resilience — circuit breaker", () => {
  /** @type {((now: number) => void)[]} */
  let scheduled;
  let originalRaf;

  function tick(now) {
    const cb = scheduled.pop();
    scheduled = [];
    cb(now);
  }

  const WASM_POISON = "recursive use of an object detected which would lead to unsafe aliasing in rust";

  beforeEach(() => {
    scheduled = [];
    originalRaf = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = (cb) => {
      scheduled.push(cb);
      return scheduled.length;
    };
  });

  afterEach(() => {
    globalThis.requestAnimationFrame = originalRaf;
  });

  it("bails to menu exactly once on an unrecoverable wasm error, and keeps the outer loop alive", () => {
    const onFatalError = vi.fn();
    const onStepError = vi.fn();
    const onFrame = vi.fn(() => {
      throw new Error(WASM_POISON);
    });

    runGameLoop(createGameLoopState(), {
      shouldSkipTiming: () => false,
      onFrame,
      onStepError,
      onFatalError,
    });

    // Three consecutive poisoned frames.
    tick(16);
    tick(32);
    tick(48);

    // Fatal handler fires once (not on every re-throw — that was the beacon-flood bug).
    expect(onFatalError).toHaveBeenCalledTimes(1);
    // Unrecoverable errors never route through the recoverable onStepError path.
    expect(onStepError).not.toHaveBeenCalled();
    // Outer rAF stays alive so the menu (post-bail) still animates.
    expect(scheduled.length).toBe(1);
  });

  it("treats a transient error as recoverable — onStepError each frame, never fatal", () => {
    const onFatalError = vi.fn();
    const onStepError = vi.fn();
    const onFrame = vi.fn(() => {
      throw new Error("transient cosmetic glitch");
    });

    runGameLoop(createGameLoopState(), {
      shouldSkipTiming: () => false,
      onFrame,
      onStepError,
      onFatalError,
    });

    tick(16);
    tick(32);

    expect(onStepError).toHaveBeenCalledTimes(2);
    expect(onFatalError).not.toHaveBeenCalled();
    expect(scheduled.length).toBe(1);
  });

  it("escalates a sustained streak of transient errors to fatal", () => {
    const onFatalError = vi.fn();
    const onStepError = vi.fn();
    const onFrame = vi.fn(() => {
      throw new Error("transient cosmetic glitch");
    });

    runGameLoop(createGameLoopState(), {
      shouldSkipTiming: () => false,
      onFrame,
      onStepError,
      onFatalError,
    });

    // 60th consecutive throw trips the streak ceiling (MAX_STEP_ERROR_STREAK).
    for (let i = 1; i <= 60; i += 1) tick(i * 16);

    expect(onStepError).toHaveBeenCalledTimes(59);
    expect(onFatalError).toHaveBeenCalledTimes(1);
  });

  it("a clean frame resets the tripwire so a later fault can trip fresh", () => {
    const onFatalError = vi.fn();
    let shouldThrow = true;
    const onFrame = vi.fn(() => {
      if (shouldThrow) throw new Error(WASM_POISON);
    });

    runGameLoop(createGameLoopState(), {
      shouldSkipTiming: () => false,
      onFrame,
      onFatalError,
    });

    tick(16); // fatal #1
    shouldThrow = false;
    tick(32); // clean frame — clears fatalHandled
    shouldThrow = true;
    tick(48); // fatal #2 (must fire again, not be suppressed by the earlier handling)

    expect(onFatalError).toHaveBeenCalledTimes(2);
  });

  it("a menu/overlay frame (shouldSkipTiming) resets the tripwire without running onFrame", () => {
    const onFatalError = vi.fn();
    const onFrame = vi.fn(() => {
      throw new Error(WASM_POISON);
    });
    let skip = false;

    runGameLoop(createGameLoopState(), {
      shouldSkipTiming: () => skip,
      onFrame,
      onFatalError,
    });

    tick(16); // fatal #1
    skip = true;
    tick(32); // menu frame — onFrame not called, tripwire reset
    expect(onFrame).toHaveBeenCalledTimes(1);
    skip = false;
    tick(48); // fatal #2 fires fresh after the reset
    expect(onFatalError).toHaveBeenCalledTimes(2);
  });
});

describe("gameLoop resilience — resume guard (tab-focus stutter)", () => {
  /** @type {((now: number) => void)[]} */
  let scheduled;
  let originalRaf;

  function tick(now) {
    const cb = scheduled.pop();
    scheduled = [];
    cb(now);
  }

  beforeEach(() => {
    scheduled = [];
    originalRaf = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = (cb) => {
      scheduled.push(cb);
      return scheduled.length;
    };
  });

  afterEach(() => {
    globalThis.requestAnimationFrame = originalRaf;
  });

  it("drops the debt on a long stall instead of replaying it as a catch-up burst", () => {
    /** @type {{ dt: number, acc: number }[]} */
    const frames = [];
    const state = createGameLoopState();
    runGameLoop(state, {
      shouldSkipTiming: () => false,
      onFrame: (ctx) => {
        // Capture accumulator AFTER the loop's dt bookkeeping (onFrame runs post-bump).
        frames.push({ dt: ctx.dt, acc: +state.accumulator.toFixed(4) });
      },
    });

    state.lastT = 1000; // known baseline (bypass the performance.now() seed)
    tick(1016); // +16ms — normal frame
    tick(6016); // +5000ms gap — resume guard must fire
    tick(6032); // +16ms — normal cadence resumes

    expect(frames[0].dt).toBeCloseTo(0.016, 3);
    expect(frames[0].acc).toBeCloseTo(0.016, 3);

    // Resume frame: dt forced to 0 and the ~5s of debt dropped (not clamped to 50ms
    // and replayed — that would leave acc ≈ 0.066 and burst physics substeps).
    expect(frames[1].dt).toBe(0);
    expect(frames[1].acc).toBe(0);

    // Next frame is a clean 16ms again.
    expect(frames[2].dt).toBeCloseTo(0.016, 3);
    expect(frames[2].acc).toBeCloseTo(0.016, 3);
  });

  it("treats a merely-slow frame (below the resume threshold) as normal, clamped time", () => {
    /** @type {{ dt: number }[]} */
    const frames = [];
    const state = createGameLoopState();
    runGameLoop(state, {
      shouldSkipTiming: () => false,
      onFrame: (ctx) => frames.push({ dt: ctx.dt }),
    });

    state.lastT = 1000;
    tick(1200); // +200ms — a bad hitch but below RESUME_GAP_S (250ms): clamp, don't reset
    expect(frames[0].dt).toBeCloseTo(0.05, 3); // clamped to the 50ms ceiling, not zeroed
  });
});
