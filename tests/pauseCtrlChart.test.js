// @vitest-environment happy-dom
// PAUSE-CTRL-CHART-1 — the pause-overlay CONTROLS card used to freeze its tag and
// chart on the init-time touchDevice flag: `touchDevice ? "TOUCH" : "KEYBOARD"`
// with no gamepad branch, and no subscription to input-mode changes. A pad player
// pausing mid-match saw a KEYBOARD (or TOUCH, on a Steam Deck) chart. The card now
// consumes the same onInputModeChange signal as the main-menu / Settings / HOW TO
// PLAY charts, so the tag and rows rematch the live device.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { init as initPauseOverlay } from "../src/ui/pauseOverlay.js";
import { setInputMode } from "../src/input.js";

/**
 * @param {Record<string, any>} refs Overlay refs returned by init()
 * @returns {HTMLElement}
 */
function controlsSection(refs) {
  return refs.escSections.find((s) => s.classList.contains("esc-section--controls"));
}

/** @param {Record<string, any>} refs */
function tagOf(refs) {
  return controlsSection(refs)?.querySelector(".esc-section-tag")?.textContent ?? "";
}

/** @param {Record<string, any>} refs */
function keyCaps(refs) {
  return [...controlsSection(refs).querySelectorAll("kbd")].map((k) => k.textContent);
}

/** @param {Record<string, any>} refs */
function labels(refs) {
  return [...controlsSection(refs).querySelectorAll(".esc-ctl-lbl")].map((l) => l.textContent);
}

beforeEach(() => {
  document.body.innerHTML = "";
  // * input.js is module-stateful (currentInputMode persists across tests in this
  // * file) — re-anchor the baseline so every test starts from KEYBOARD.
  setInputMode("keyboard");
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("pause overlay CONTROLS card input-mode chart (PAUSE-CTRL-CHART-1)", () => {
  it("shows KEYBOARD on init for a non-touch device before any input fires", () => {
    const refs = initPauseOverlay({ getIsTouchDevice: () => false });
    expect(tagOf(refs)).toBe("KEYBOARD");
    expect(keyCaps(refs)).toEqual(["W", "A", "S", "D", "SHIFT", "SPACE", "M", "ESC"]);
    expect(labels(refs)).toEqual(["MOVE", "BOOST", "HOP", "MUTE", "MENU"]);
  });

  it("shows TOUCH on init for a touch-capable device before any input fires", () => {
    const refs = initPauseOverlay({ getIsTouchDevice: () => true });
    expect(tagOf(refs)).toBe("TOUCH");
    expect(keyCaps(refs)).toEqual(["STICK", "BOOST", "HOP", "MENU"]);
  });

  it("flips the tag and rows to GAMEPAD live after init when the mode subscription fires", () => {
    const refs = initPauseOverlay({ getIsTouchDevice: () => false });
    expect(tagOf(refs)).toBe("KEYBOARD");

    setInputMode("gamepad");

    expect(tagOf(refs)).toBe("GAMEPAD");
    expect(labels(refs)).toEqual(["MOVE", "BOOST", "HOP", "MUTE", "MENU"]);
    const caps = keyCaps(refs);
    // * Analog mapping mirrors the Settings chart (input.js buttons 0/6/7/8/9).
    expect(caps).toContain("L-STICK");
    expect(caps).toContain("D-PAD");
    expect(caps).toContain("A");
    expect(caps).toContain("LT");
    expect(caps).toContain("B");
    expect(caps).toContain("RT");
    expect(caps).toContain("SELECT");
    expect(caps).toContain("START");
    // * Keyboard-only caps are gone.
    expect(caps).not.toContain("W");
    expect(caps).not.toContain("SHIFT");
    expect(caps).not.toContain("SPACE");
    expect(caps).not.toContain("ESC");
  });

  it("keeps updating live as the mode changes keyboard -> gamepad -> touch", () => {
    const refs = initPauseOverlay({ getIsTouchDevice: () => false });

    setInputMode("gamepad");
    expect(tagOf(refs)).toBe("GAMEPAD");

    setInputMode("keyboard");
    expect(tagOf(refs)).toBe("KEYBOARD");
    expect(keyCaps(refs)).toContain("W");

    setInputMode("touch");
    expect(tagOf(refs)).toBe("TOUCH");
    expect(keyCaps(refs)).toEqual(["STICK", "BOOST", "HOP", "MENU"]);
  });

  it("updates a touch-capable device (Steam Deck) to GAMEPAD when the pad engages", () => {
    const refs = initPauseOverlay({ getIsTouchDevice: () => true });
    expect(tagOf(refs)).toBe("TOUCH");

    setInputMode("gamepad");
    expect(tagOf(refs)).toBe("GAMEPAD");
  });
});
