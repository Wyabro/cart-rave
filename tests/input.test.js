// @vitest-environment happy-dom
// input.js — keyboard axis UI-mode parity (INPUT-KB-1).
// Gamepad driving axis was already zeroed by setUiMode(true) (main.js isUiActive, e.g. MP
// ESC pause where round physics keeps stepping) so a controller can't steer while a menu
// is open. Keyboard had no equivalent — holding W/A/S/D kept driving the cart in the
// background. These pin getAxis() zeroing out keyboard input while UI-active, and
// restoring it (still-held keys included) once UI-active clears.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { setupInput, getAxis, setUiMode } from "../src/input.js";

function keydown(code) {
  window.dispatchEvent(new KeyboardEvent("keydown", { code, bubbles: true, cancelable: true }));
}

function keyup(code) {
  window.dispatchEvent(new KeyboardEvent("keyup", { code, bubbles: true, cancelable: true }));
}

describe("getAxis UI-mode parity", () => {
  beforeEach(() => {
    setupInput(null, undefined, undefined, undefined, undefined);
    setUiMode(false);
  });

  afterEach(() => {
    keyup("KeyW");
    keyup("KeyA");
    setUiMode(false);
  });

  it("reads a held key normally while not UI-active", () => {
    keydown("KeyW");
    expect(getAxis().forward).toBe(1);
  });

  it("zeroes the keyboard axis while UI-active, even with keys still held", () => {
    keydown("KeyW");
    keydown("KeyA");
    expect(getAxis().forward).toBe(1);
    expect(getAxis().turn).toBe(1);

    setUiMode(true);
    expect(getAxis()).toMatchObject({ forward: 0, turn: 0 });
  });

  it("resumes reading the held key once UI-active clears", () => {
    keydown("KeyW");
    setUiMode(true);
    expect(getAxis().forward).toBe(0);

    setUiMode(false);
    expect(getAxis().forward).toBe(1);
  });
});
