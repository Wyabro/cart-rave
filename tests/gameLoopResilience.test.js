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

  it("keeps the sim stepping on a chronically slow device (every frame over the gap)", () => {
    // * The NET-2 "welded to spawn" mechanism: a SwiftShader/overloaded client renders every
    // * frame slower than RESUME_GAP_S. Zeroing the accumulator on each of those frames means
    // * no physics substep — and non-host input sampling lives inside the substep loop — so
    // * the player can never move. Only the FIRST over-gap frame may be treated as a resume.
    /** @type {{ dt: number, acc: number }[]} */
    const frames = [];
    const state = createGameLoopState();
    runGameLoop(state, {
      shouldSkipTiming: () => false,
      onFrame: (ctx) => frames.push({ dt: ctx.dt, acc: +state.accumulator.toFixed(4) }),
    });

    state.lastT = 1000;
    tick(1300); // +300ms — first over-gap frame: genuine resume (debt dropped)
    tick(1600); // +300ms — second consecutive: chronic slowness, must step
    tick(1900); // +300ms — third: still stepping
    expect(frames[0].dt).toBe(0);
    expect(frames[0].acc).toBe(0);
    expect(frames[1].dt).toBeCloseTo(0.05, 3); // clamped, NOT zeroed
    expect(frames[1].acc).toBeCloseTo(0.05, 3); // accumulator grows → substeps will run
    expect(frames[2].dt).toBeCloseTo(0.05, 3);
    expect(frames[2].acc).toBeCloseTo(0.1, 3);
  });

  it("a normal frame re-arms the resume guard for the next genuine pause", () => {
    /** @type {{ dt: number }[]} */
    const frames = [];
    const state = createGameLoopState();
    runGameLoop(state, {
      shouldSkipTiming: () => false,
      onFrame: (ctx) => frames.push({ dt: ctx.dt }),
    });

    state.lastT = 1000;
    tick(1300); // over-gap #1 → resume (dt 0)
    tick(1316); // normal 16ms frame → streak reset
    tick(6316); // +5s pause → must be treated as a fresh resume again
    expect(frames[0].dt).toBe(0);
    expect(frames[1].dt).toBeCloseTo(0.016, 3);
    expect(frames[2].dt).toBe(0);
  });
});

describe("gameLoop hidden-host frame driver", () => {
  /** @type {Map<number, (now: number) => void>} */
  let scheduled;
  let nextRafId;
  let originalRaf;
  let originalCancelRaf;
  let hidden;

  beforeEach(() => {
    vi.useFakeTimers();
    scheduled = new Map();
    nextRafId = 1;
    originalRaf = globalThis.requestAnimationFrame;
    originalCancelRaf = globalThis.cancelAnimationFrame;
    globalThis.requestAnimationFrame = (cb) => {
      const id = nextRafId;
      nextRafId += 1;
      scheduled.set(id, cb);
      return id;
    };
    globalThis.cancelAnimationFrame = (id) => {
      scheduled.delete(id);
    };
    hidden = false;
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => hidden,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    globalThis.requestAnimationFrame = originalRaf;
    globalThis.cancelAnimationFrame = originalCancelRaf;
  });

  it("cancels rAF before pumping and restores exactly one rAF on visibility", () => {
    const onFrame = vi.fn();
    const driver = runGameLoop(createGameLoopState(), {
      shouldPumpWhileHidden: () => true,
      shouldSkipTiming: () => false,
      onFrame,
    });

    expect(scheduled.size).toBe(1);
    hidden = true;
    driver.refresh();
    expect(scheduled.size).toBe(0);
    expect(driver.isPumping()).toBe(true);

    vi.advanceTimersByTime(17);
    expect(onFrame).toHaveBeenCalledTimes(1);
    expect(driver.getPumpTickCount()).toBe(1);
    expect(scheduled.size).toBe(0);

    hidden = false;
    driver.refresh();
    expect(driver.isPumping()).toBe(false);
    expect(scheduled.size).toBe(1);
  });

  it("stops pumping after hidden authority is lost", () => {
    let isHost = true;
    const driver = runGameLoop(createGameLoopState(), {
      shouldPumpWhileHidden: () => isHost,
      shouldSkipTiming: () => false,
      onFrame: vi.fn(),
    });

    hidden = true;
    driver.refresh();
    vi.advanceTimersByTime(17);
    expect(driver.isPumping()).toBe(true);

    isHost = false;
    vi.advanceTimersByTime(17);
    expect(driver.isPumping()).toBe(false);
    expect(scheduled.size).toBe(1);
  });

  it("does not pump while the hidden predicate is false", () => {
    const driver = runGameLoop(createGameLoopState(), {
      shouldPumpWhileHidden: () => false,
      shouldSkipTiming: () => false,
      onFrame: vi.fn(),
    });

    hidden = true;
    driver.refresh();
    expect(driver.isPumping()).toBe(false);
    expect(driver.getPumpTickCount()).toBe(0);
    expect(scheduled.size).toBe(1);
  });
});
