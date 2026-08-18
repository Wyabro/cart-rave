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
import { setupInput, getAxis, setUiMode, __pollGamepadForTest, __resetInputAxisEaseForTest } from "../../src/input.js";

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
    Reflect.deleteProperty(navigator, "getGamepads");
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

    it("suppresses held boost while UI-active and requires a fresh keyboard press", () => {
      const onBoost = vi.fn();
      const input = setupInput(null, undefined, undefined, undefined, onBoost);
      keydown("ShiftLeft");
      expect(input.isNitroHeld()).toBe(true);
      setUiMode(true);
      expect(getAxis().boostHeld).toBe(false);
      expect(input.isNitroHeld()).toBe(false);

      keydown("ShiftLeft");
      expect(input.isNitroHeld()).toBe(false);
      setUiMode(false);
      expect(input.isNitroHeld()).toBe(false);
      keyup("ShiftLeft");
      keydown("ShiftLeft");
      expect(input.isNitroHeld()).toBe(true);
    });

    it("does not turn the A press used to resume into a boost", () => {
      let pressed = true;
      Object.defineProperty(navigator, "getGamepads", { configurable: true, value: () => ([{
        index: 0,
        axes: [0, 0],
        buttons: Array.from({ length: 17 }, (_, index) => ({ pressed: index === 0 && pressed, value: 0 })),
      }]) });
      const onBoost = vi.fn();
      setupInput(null, undefined, undefined, undefined, onBoost);

      setUiMode(true);
      setUiMode(false);
      __pollGamepadForTest();
      expect(onBoost).not.toHaveBeenCalled();
      expect(getAxis().boostHeld).toBe(false);

      pressed = false;
      __pollGamepadForTest();
      pressed = true;
      __pollGamepadForTest();
      expect(onBoost).toHaveBeenCalledOnce();
      expect(getAxis().boostHeld).toBe(true);
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

function keyupOnInput(code) {
  const input = document.createElement("input");
  document.body.appendChild(input);
  input.dispatchEvent(new KeyboardEvent("keyup", { code, bubbles: true, cancelable: true }));
  input.remove();
}

// KEYUP-STUCK-1: a movement / Shift key released while an INPUT is focused must
// still clear keys / localNitroHeld. preventDefault stays gated on INPUT.
describe("KEYUP-STUCK-1: keyup over a focused INPUT still releases hold state", () => {
  beforeEach(() => {
    mockNowMs = 0;
    vi.spyOn(performance, "now").mockImplementation(() => mockNowMs);
    __resetInputAxisEaseForTest();
    setupInput(null, undefined, undefined, undefined, undefined);
    setUiMode(false);
    tick(0);
  });

  afterEach(() => {
    keyup("KeyW");
    keyup("ShiftLeft");
    setUiMode(false);
    vi.restoreAllMocks();
  });

  it("releases a held movement key when keyup targets an INPUT", () => {
    keydown("KeyW");
    settle(300);
    expect(tick().forward).toBe(1);

    keyupOnInput("KeyW");
    expect(settle(RELEASE_S * 1000 + 20).forward).toBe(0);
  });

  it("clears nitro hold when Shift keyup targets an INPUT", () => {
    const onBoost = vi.fn();
    const input = setupInput(null, undefined, undefined, undefined, onBoost);
    keydown("ShiftLeft");
    expect(input.isNitroHeld()).toBe(true);

    keyupOnInput("ShiftLeft");
    expect(input.isNitroHeld()).toBe(false);
    expect(getAxis().boostHeld).toBe(false);
  });
});

// GAMEPAD-FREEZE-1: a pad left held while the tab is hidden must not keep driving the
// cart through the hidden-host physics pump. pollGamepad() is rAF-bound, so a hidden
// tab freezes the last sampled axis/boost; blur + visibilitychange→hidden now reset it.
describe("GAMEPAD-FREEZE-1: blur / tab-hide reset of frozen gamepad input", () => {
  function mockPad({ axes, boost, hop, menu }) {
    const pad = {
      index: 0,
      axes,
      buttons: Array.from({ length: 17 }, (_, i) => ({
        pressed: (i === 6 && boost) || (i === 7 && hop) || (i === 9 && menu),
        value: 0,
      })),
    };
    Object.defineProperty(navigator, "getGamepads", { configurable: true, value: () => [pad] });
    return pad;
  }

  beforeEach(() => {
    mockPad({ axes: [0, 0], boost: false, hop: false, menu: false });
    __resetInputAxisEaseForTest();
    __pollGamepadForTest(); // baseline: pad connected, nothing held
  });

  afterEach(() => {
    Reflect.deleteProperty(navigator, "getGamepads");
    // * Restore the real hidden getter so a leaked mock can't poison later tests
    // * (accumulated visibilitychange listeners would keep resetting input).
    Reflect.deleteProperty(document, "hidden");
    __resetInputAxisEaseForTest();
  });

  it("blur clears a frozen pad axis + boost, suppressing the still-held boost", () => {
    mockPad({ axes: [0, -1], boost: true, hop: false, menu: false }); // stick forward + LT
    const onBoost = vi.fn();
    setupInput(null, undefined, undefined, undefined, onBoost);
    __pollGamepadForTest();
    expect(onBoost).toHaveBeenCalledOnce();
    expect(getAxis()).toEqual({ forward: 1, turn: 0, boostHeld: true });

    window.dispatchEvent(new Event("blur"));
    expect(getAxis()).toEqual({ forward: 0, turn: 0, boostHeld: false });

    // * Still physically held: suppressed — no fresh charge, no re-fire.
    __pollGamepadForTest();
    expect(getAxis().boostHeld).toBe(false);
    expect(onBoost).toHaveBeenCalledOnce();
  });

  it("release + fresh press after blur fires boost exactly once more", () => {
    mockPad({ axes: [0, -1], boost: true, hop: false, menu: false });
    const onBoost = vi.fn();
    setupInput(null, undefined, undefined, undefined, onBoost);
    __pollGamepadForTest();
    window.dispatchEvent(new Event("blur"));

    mockPad({ axes: [0, -1], boost: false, hop: false, menu: false }); // released
    __pollGamepadForTest();
    expect(getAxis().boostHeld).toBe(false);

    mockPad({ axes: [0, -1], boost: true, hop: false, menu: false }); // fresh press
    __pollGamepadForTest();
    expect(onBoost).toHaveBeenCalledTimes(2);
    expect(getAxis().boostHeld).toBe(true);
  });

  it("tab-hide (visibilitychange → hidden) clears the frozen pad state", () => {
    mockPad({ axes: [0, -1], boost: true, hop: false, menu: false });
    setupInput(null, undefined, undefined, undefined, undefined);
    __pollGamepadForTest();
    expect(getAxis().boostHeld).toBe(true);

    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(getAxis()).toEqual({ forward: 0, turn: 0, boostHeld: false });
  });

  it("re-primes one-shot edges across blur: held RT does not re-fire or get lost", () => {
    const onHop = vi.fn();
    setupInput(null, undefined, undefined, onHop, undefined);
    mockPad({ axes: [0, 0], boost: false, hop: true, menu: false });
    __pollGamepadForTest();
    expect(onHop).toHaveBeenCalledOnce(); // original press

    window.dispatchEvent(new Event("blur"));
    __pollGamepadForTest(); // still held — edge consumed by re-primed prevBtnStates
    expect(onHop).toHaveBeenCalledOnce();

    mockPad({ axes: [0, 0], boost: false, hop: false, menu: false }); // released while away
    __pollGamepadForTest();
    expect(onHop).toHaveBeenCalledOnce();

    mockPad({ axes: [0, 0], boost: false, hop: true, menu: false }); // fresh press
    __pollGamepadForTest();
    expect(onHop).toHaveBeenCalledTimes(2);
  });

  it("re-primes the menu edge across blur: held START at hide does not re-open pause", () => {
    const onEscape = vi.fn();
    setupInput(null, onEscape, undefined, undefined, undefined);
    mockPad({ axes: [0, 0], boost: false, hop: false, menu: true });
    __pollGamepadForTest();
    expect(onEscape).toHaveBeenCalledOnce();

    window.dispatchEvent(new Event("blur"));
    __pollGamepadForTest(); // still held
    expect(onEscape).toHaveBeenCalledOnce();

    mockPad({ axes: [0, 0], boost: false, hop: false, menu: false }); // released
    __pollGamepadForTest();
    expect(onEscape).toHaveBeenCalledOnce();
  });
});
