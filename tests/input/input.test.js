// @vitest-environment happy-dom
// input.js — keyboard axis UI-mode parity + digital-to-analog ease (INPUT-KB-1).
//
// UI-mode parity: gamepad driving axis was already zeroed by setUiMode(true) (main.js
// isUiActive, e.g. MP ESC pause where round physics keeps stepping) so a controller can't
// steer while a menu is open. Keyboard had no equivalent — holding W/A/S/D kept driving the
// cart in the background.
//
// Digital-to-analog ease: a keyboard key is either fully pressed or not, but the drive
// physics (simulation.js) reads axis.turn/forward as if it were an analog stick deflection
// — every A/D tap used to be an instant full-lock max-rate turn, which is why keyboard felt
// harsh next to a gamepad. getAxis() now ramps the raw -1/0/1 key target toward its value
// over KEY_AXIS_ATTACK_S (held) / KEY_AXIS_RELEASE_S (released) of wall-clock time, capped
// per-call at 0.1s so a real gap (tab hidden, breakpoint) can't be replayed as one giant
// ease step — tests step in ~10ms increments to match real per-frame calling.
// 07-21: halved from the original 0.14s/0.09s — full ramp read as "too controller-y".

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { setupInput, getAxis, setUiMode, __resetInputAxisEaseForTest } from "../../src/input.js";

const ATTACK_S = 0.07;
const RELEASE_S = 0.05;
const STEP_MS = 10;

function keydown(code) {
  window.dispatchEvent(new KeyboardEvent("keydown", { code, bubbles: true, cancelable: true }));
}

function keyup(code) {
  window.dispatchEvent(new KeyboardEvent("keyup", { code, bubbles: true, cancelable: true }));
}

let mockNowMs = 0;

/** One getAxis() read after advancing the mocked clock by `ms` (default: one frame step). */
function tick(ms = STEP_MS) {
  mockNowMs += ms;
  return getAxis();
}

/** Repeated small-step reads totalling `ms`, matching real per-frame calling cadence. */
function settle(ms) {
  let result;
  let remaining = ms;
  while (remaining > 0) {
    const step = Math.min(STEP_MS, remaining);
    result = tick(step);
    remaining -= step;
  }
  return result;
}

describe("input.js getAxis", () => {
  beforeEach(() => {
    mockNowMs = 0;
    vi.spyOn(performance, "now").mockImplementation(() => mockNowMs);
    __resetInputAxisEaseForTest();
    setupInput(null, undefined, undefined, undefined, undefined);
    setUiMode(false);
    tick(0); // establish a lastAxisEaseMs baseline so the first real tick has a real dt
  });

  afterEach(() => {
    keyup("KeyW");
    keyup("KeyA");
    keyup("KeyD");
    setUiMode(false);
    vi.restoreAllMocks();
  });

  describe("UI-mode parity with gamepad", () => {
    it("zeroes the keyboard axis while UI-active, even with keys still held", () => {
      keydown("KeyW");
      keydown("KeyA");
      settle(300);
      expect(tick().forward).toBe(1);

      setUiMode(true);
      expect(tick().forward).toBe(0);
      expect(tick().turn).toBe(0);
    });

    it("resumes ramping the held key once UI-active clears (does not jump to full)", () => {
      keydown("KeyW");
      settle(300);
      setUiMode(true);
      expect(tick(50).forward).toBe(0);

      setUiMode(false);
      // * Held the whole time, but UI-active reset the ease to 0 on entry — resuming
      // * ramps up again rather than snapping back to the pre-pause value.
      const justResumed = tick(0).forward;
      expect(justResumed).toBeGreaterThanOrEqual(0);
      expect(justResumed).toBeLessThan(1);
      expect(settle(300).forward).toBe(1);
    });
  });

  describe("digital-to-analog ease", () => {
    it("does not snap to full deflection on the instant of a keypress", () => {
      keydown("KeyW");
      expect(tick(0).forward).toBe(0);
    });

    it("ramps forward toward 1 over the attack window and clamps there", () => {
      keydown("KeyW");
      const halfway = settle(ATTACK_S * 1000 * 0.5).forward;
      expect(halfway).toBeCloseTo(0.5, 1);

      const full = settle(ATTACK_S * 1000 * 0.5 + 20).forward; // cross the full window
      expect(full).toBe(1);

      // * Clamps, doesn't overshoot past 1 with more held time.
      expect(settle(500).forward).toBe(1);
    });

    it("ramps back to 0 after release, faster than the attack ramp", () => {
      keydown("KeyW");
      settle(300); // reach full deflection
      keyup("KeyW");

      const midRelease = settle(RELEASE_S * 1000 * 0.5).forward;
      expect(midRelease).toBeCloseTo(0.5, 1);

      expect(settle(RELEASE_S * 1000 * 0.5 + 20).forward).toBe(0);
    });

    it("reversing direction (A -> D) ramps through center at the attack rate, not release", () => {
      keydown("KeyA");
      settle(300); // reach turn = 1
      keyup("KeyA");
      keydown("KeyD"); // target flips straight to -1 — a key is still held, never released to 0

      // * A full +1 -> -1 swing is two attack-window units (280ms); halfway through that
      // * should sit near center, not already at -1 (which the faster release rate would
      // * reach well before this point).
      const partway = settle(ATTACK_S * 1000).turn;
      expect(partway).toBeGreaterThan(-0.9);
      expect(partway).toBeLessThan(0.5);

      expect(settle(300).turn).toBe(-1);
    });

    it("clamps a large wall-clock gap (e.g. a tab-hidden pause) instead of jumping instantly", () => {
      keydown("KeyW");
      // * A single multi-second gap must not resolve as "already at full" in one ease
      // * step — the internal per-call dt clamp (below the attack window) caps how much
      // * ground one call crosses, regardless of how much real time actually passed.
      const MAX_DT_S = 0.05;
      const afterGap = tick(5000).forward;
      expect(afterGap).toBeCloseTo(MAX_DT_S / ATTACK_S, 2);
      expect(afterGap).toBeLessThan(1);
    });
  });
});
