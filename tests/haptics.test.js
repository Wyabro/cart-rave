// @vitest-environment happy-dom
//
// Regression tests for controller haptics (playtest 2026-07-16: "add haptics for
// controller users" — rumble was already wired but read as absent). The two contract
// holes: the loop stopped at the FIRST pad with a vibrationActuator (Chrome keeps
// stale/phantom entries in getGamepads(), so a dead slot could eat the pulse), and
// Firefox's hapticActuators[].pulse() spec variant was never handled.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { hapticPulse } from "../src/haptics.js";

/** Chrome-style pad: vibrationActuator.playEffect. */
function chromePad(overrides = {}) {
  return {
    connected: true,
    vibrationActuator: { playEffect: vi.fn(() => Promise.resolve("complete")) },
    ...overrides,
  };
}

/** Firefox-style pad: hapticActuators list, no vibrationActuator. */
function firefoxPad(overrides = {}) {
  return {
    connected: true,
    hapticActuators: [{ pulse: vi.fn(() => Promise.resolve(true)) }],
    ...overrides,
  };
}

beforeEach(() => {
  navigator.vibrate = vi.fn();
});

describe("hapticPulse gamepad rumble", () => {
  it("pulses EVERY connected pad, not just the first with an actuator", () => {
    const a = chromePad();
    const b = chromePad();
    navigator.getGamepads = () => [a, b];

    hapticPulse(0.8, 0.4, 100);

    expect(a.vibrationActuator.playEffect).toHaveBeenCalledTimes(1);
    expect(b.vibrationActuator.playEffect).toHaveBeenCalledTimes(1);
    expect(a.vibrationActuator.playEffect).toHaveBeenCalledWith("dual-rumble", {
      duration: 100,
      strongMagnitude: 0.8,
      weakMagnitude: 0.4,
    });
  });

  it("skips null/disconnected/actuator-less slots and still reaches the live pad", () => {
    // * Chrome's getGamepads() shape: null holes + stale disconnected entries + a pad
    // * that exposes no actuator at all — the real controller sits last.
    const dead = chromePad({ connected: false });
    const bare = { connected: true };
    const live = chromePad();
    navigator.getGamepads = () => [null, dead, bare, live];

    hapticPulse(1, 1, 60);

    expect(dead.vibrationActuator.playEffect).not.toHaveBeenCalled();
    expect(live.vibrationActuator.playEffect).toHaveBeenCalledTimes(1);
  });

  it("falls back to the Firefox hapticActuators pulse() variant", () => {
    const pad = firefoxPad();
    navigator.getGamepads = () => [pad];

    hapticPulse(0.3, 0.9, 80);

    // * Single-motor spec — the stronger of the two magnitudes wins.
    expect(pad.hapticActuators[0].pulse).toHaveBeenCalledWith(0.9, 80);
  });

  it("clamps magnitude to 0..1 and duration to 20..300", () => {
    const pad = chromePad();
    navigator.getGamepads = () => [pad];

    hapticPulse(2.5, -1, 5000);

    expect(pad.vibrationActuator.playEffect).toHaveBeenCalledWith("dual-rumble", {
      duration: 300,
      strongMagnitude: 1,
      weakMagnitude: 0,
    });
  });

  it("one throwing pad never blocks the others (or the vibrate fallback)", () => {
    const bad = {
      connected: true,
      vibrationActuator: { playEffect: vi.fn(() => { throw new Error("boom"); }) },
    };
    const good = chromePad();
    navigator.getGamepads = () => [bad, good];

    expect(() => hapticPulse(0.5, 0.5, 50)).not.toThrow();
    expect(good.vibrationActuator.playEffect).toHaveBeenCalledTimes(1);
    expect(navigator.vibrate).toHaveBeenCalledWith(50);
  });

  it("is a safe no-op with no gamepad API at all", () => {
    navigator.getGamepads = undefined;
    expect(() => hapticPulse(1, 1, 100)).not.toThrow();
    expect(navigator.vibrate).toHaveBeenCalled();
  });
});
