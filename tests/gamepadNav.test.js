// @vitest-environment happy-dom
// Gamepad UI nav scoping + focus reclaim (RC bug-hunt 07-19, reported-not-fixed pair):
// (1) getFocusables was document-wide, so a pad could navigate to and click
//     buttons BEHIND an open overlay — including main-menu PLAY.
// (2) updateNav re-seized focus every idle frame whenever document.activeElement
//     was outside the focusables list (stole focus from the name-edit input).
// Also pinned here: the B-button back query is layer-scoped and no longer
// clicks hidden back buttons (old query hit the invisible customize back on
// the main menu, and used the dead `.cr-esc-resume` selector on pause).
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { setInputMode } from "../src/input.js";

// * Feed the nav loop a hand-built pad; the real input.js touches
// * navigator.getGamepads + the controls panel DOM.
const padRef = vi.hoisted(() => ({ pad: /** @type {any} */ (null) }));
vi.mock("../src/input.js", () => ({
  getActiveGamepad: () => padRef.pad,
  setInputMode: vi.fn(),
}));

const BTN = { a: 0, b: 1, lb: 4, rb: 5, up: 12, down: 13, left: 14, right: 15 };

function makePad(pressed = []) {
  return {
    buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: pressed.includes(i), value: 0 })),
    axes: [0, 0],
  };
}

// * Fixture mirrors the real ids/classes gamepadNav scopes and queries by.
// * #hud-note is focusable via tabindex but outside the nav selector set.
// * The .cr-join row mirrors index.html: an input + GO button nested in a
// * container that must stay out of the ring. The color row + range mirror the
// * customize screen (chips rebuilt via innerHTML on selection; hue is a bare
// * input[type=range], nudged by d-pad left/right).
// * Arena pager mirrors index.html SOLO context. Happy-dom's isElementVisible
// * polyfill only walks inline style.display === "none" — it ignores the
// * `hidden` attribute and stylesheets. For non-SOLO tests set
// * #cr-context-arena style.display = "none" (same open/closed contract as overlays).
const FIXTURE = `
<div id="cr-root">
  <button id="play-btn">PLAY</button>
  <div class="cr-join" id="cr-join">
    <input class="cr-join-input" id="cr-join-code" type="text" name="room-code" placeholder="ROOM CODE" />
    <button class="cr-join-go" id="cr-join-go" type="button">GO</button>
  </div>
  <button id="customize-btn">CUSTOMIZE</button>
  <div id="cr-context-arena">
    <button class="cr-arena-page" id="cr-arena-prev" type="button" aria-label="Previous arena">◂</button>
    <button class="cr-arena-page" id="cr-arena-next" type="button" aria-label="Next arena">▸</button>
  </div>
  <div id="hud-note" tabindex="0"></div>
  <input id="cr-name-input" style="display:none" />
</div>
<div id="cr-customize-screen" style="display:none">
  <button class="cr-overlay-back" id="cr-customize-back">BACK</button>
  <div id="color-row" role="radiogroup">
    <button id="chip-0" type="button" role="radio" aria-checked="true">RED</button>
    <button id="chip-1" type="button" role="radio" aria-checked="false">BLUE</button>
  </div>
  <input type="range" id="hue-slider" min="0" max="360" value="280" />
</div>
<div id="cr-settings-screen" style="display:none">
  <button class="cr-overlay-back" id="cr-settings-back">BACK</button>
  <button id="cr-settings-done">DONE</button>
</div>
<div id="esc-overlay" style="display:none">
  <button class="esc-btn esc-btn--resume" id="esc-resume">RESUME</button>
  <button id="esc-quit">QUIT</button>
</div>
`;

let scheduled = [];

// Runs exactly one updateNav tick (the loop re-schedules itself each frame).
function frame() {
  const cbs = scheduled;
  scheduled = [];
  for (const cb of cbs) cb(performance.now());
}

// Rising edge + release so the next press edges again.
function press(button) {
  padRef.pad = makePad([button]);
  frame();
  padRef.pad = makePad();
  frame();
}

function idleFrames(n) {
  padRef.pad = makePad();
  for (let i = 0; i < n; i++) frame();
}

function show(id) {
  document.getElementById(id).style.display = "flex";
}

function hide(id) {
  document.getElementById(id).style.display = "none";
}

function clickSpy(id) {
  const spy = vi.fn();
  document.getElementById(id).addEventListener("click", spy);
  return spy;
}

/** pointerdown → pointerup → click order (A-button / bumper squash path). */
function pressFeedbackSpies(id) {
  const el = document.getElementById(id);
  const order = [];
  el.addEventListener("pointerdown", () => order.push("pointerdown"));
  el.addEventListener("pointerup", () => order.push("pointerup"));
  el.addEventListener("click", () => order.push("click"));
  return order;
}

function pressKey(code) {
  window.dispatchEvent(new KeyboardEvent("keydown", { code, bubbles: true, cancelable: true }));
}

/** @type {typeof import("../src/ui/gamepadNav.js")} */
let navModule;

beforeEach(async () => {
  scheduled = [];
  padRef.pad = makePad();
  vi.mocked(setInputMode).mockClear();
  vi.stubGlobal("requestAnimationFrame", (cb) => {
    scheduled.push(cb);
    return scheduled.length;
  });
  if (typeof globalThis.PointerEvent === "undefined") {
    // eslint-disable-next-line no-undef
    globalThis.PointerEvent = globalThis.MouseEvent;
  }

  // * happy-dom lacks Element.checkVisibility, and its zeroed layout would make
  // * the getBoundingClientRect fallback report everything invisible. Polyfill
  // * from inline display — the overlays' actual open/closed contract — so
  // * tests never depend on layout. (Zero rects also mean navigateSpatial
  // * always takes its linear DOM-order wrap fallback: down/right = +1.)
  Element.prototype.checkVisibility = function () {
    for (let el = this; el; el = el.parentElement) {
      if (el.style && el.style.display === "none") return false;
    }
    return true;
  };

  document.body.innerHTML = FIXTURE;

  // * Module holds top-level nav state (navIndex, prevDpad, lastScope) and
  // * self-schedules rAF — fresh module per test, stepped manually via frame().
  vi.resetModules();
  navModule = await import("../src/ui/gamepadNav.js");
  navModule.startGamepadUiNav();
});

afterEach(() => {
  // * Each test imports a fresh module instance but window.addEventListener persists
  // * across tests on the shared happy-dom window — undo the keydown listener or a later
  // * test's key press would also run this test's stale-closure handler.
  navModule?.__teardownGamepadUiNavForTest?.();
  vi.unstubAllGlobals();
  delete Element.prototype.checkVisibility;
  document.body.innerHTML = "";
});

describe("modal scoping", () => {
  it("keeps focus inside an open overlay — menu buttons behind it are unreachable", () => {
    show("cr-settings-screen");
    press(BTN.down);
    press(BTN.down);
    press(BTN.down);
    const active = document.activeElement;
    expect(active && active.closest("#cr-settings-screen")).toBeTruthy();
    expect(document.getElementById("play-btn").classList.contains("gamepad-focused")).toBe(false);
  });

  it("A press cannot click PLAY behind an open overlay", () => {
    show("cr-settings-screen");
    const playSpy = clickSpy("play-btn");
    const backSpy = clickSpy("cr-settings-back");
    press(BTN.down); // seed focus inside the overlay
    press(BTN.a);
    expect(backSpy).toHaveBeenCalledTimes(1);
    expect(playSpy).not.toHaveBeenCalled();
  });

  it("falls back to the whole document when no overlay is open", () => {
    press(BTN.down);
    expect(document.activeElement).toBe(document.getElementById("play-btn"));
  });

  it("topmost layer wins when multiple overlays are open", () => {
    show("cr-settings-screen");
    show("esc-overlay");
    press(BTN.down);
    expect(document.activeElement).toBe(document.getElementById("esc-resume"));
  });
});

describe("B button", () => {
  it("clicks the open overlay's own back button, not another layer's", () => {
    show("cr-settings-screen");
    const settingsBack = clickSpy("cr-settings-back");
    const customizeBack = clickSpy("cr-customize-back");
    press(BTN.b);
    expect(settingsBack).toHaveBeenCalledTimes(1);
    expect(customizeBack).not.toHaveBeenCalled();
  });

  it("clicks RESUME on the pause overlay (old .cr-esc-resume selector was dead)", () => {
    show("esc-overlay");
    const resumeSpy = clickSpy("esc-resume");
    press(BTN.b);
    expect(resumeSpy).toHaveBeenCalledTimes(1);
  });

  it("dispatches Escape on the main menu instead of clicking a hidden back button", () => {
    const customizeBack = clickSpy("cr-customize-back");
    const keys = [];
    window.addEventListener("keydown", (e) => keys.push(e.key));
    press(BTN.b);
    expect(customizeBack).not.toHaveBeenCalled();
    expect(keys).toEqual(["Escape"]);
  });
});

describe("join row + text inputs are not nav stops", () => {
  it("d-pad down past FRIENDS lands on CUSTOMIZE, never GO or the join input", () => {
    press(BTN.down); // seed → PLAY
    press(BTN.down); // → CUSTOMIZE (join row skipped)
    expect(document.activeElement).toBe(document.getElementById("customize-btn"));
    expect(document.getElementById("cr-join-go").classList.contains("gamepad-focused")).toBe(false);
    expect(document.getElementById("cr-join-code").classList.contains("gamepad-focused")).toBe(false);
  });

  it("keyboard arrows skip the join row exactly like the gamepad", () => {
    pressKey("ArrowDown");
    pressKey("ArrowDown");
    expect(document.activeElement).toBe(document.getElementById("customize-btn"));
    expect(document.getElementById("cr-join-go").classList.contains("gamepad-focused")).toBe(false);
  });

  it("a visible text input is not a nav stop either", () => {
    const input = document.getElementById("cr-name-input");
    input.style.display = "";
    press(BTN.down); // seed → PLAY
    press(BTN.down); // → CUSTOMIZE (name input skipped)
    expect(document.activeElement).toBe(document.getElementById("customize-btn"));
  });
});

describe("range sliders stay in the ring and nudge on left/right", () => {
  it("d-pad left/right nudges a focused range instead of navigating away", () => {
    show("cr-customize-screen");
    press(BTN.down); // seed → BACK
    press(BTN.down); // → chip-0
    press(BTN.down); // → chip-1
    press(BTN.down); // → hue-slider
    expect(document.activeElement).toBe(document.getElementById("hue-slider"));
    const keys = [];
    document.getElementById("hue-slider").addEventListener("keydown", (e) => keys.push(e.key));
    press(BTN.right);
    press(BTN.left);
    expect(keys).toEqual(["ArrowRight", "ArrowLeft"]);
    expect(document.activeElement).toBe(document.getElementById("hue-slider"));
  });
});

describe("ring re-seed after the focused node is rebuilt away", () => {
  it("re-seeds the ring to the rebuilt chip on the next idle frame; next press navigates", () => {
    show("cr-customize-screen");
    press(BTN.down); // seed → BACK (navIndex 0)
    press(BTN.down); // → chip-0 (navIndex 1)
    expect(document.activeElement).toBe(document.getElementById("chip-0"));
    // * Simulate a chip select: the row rebuilds via innerHTML and the browser
    // * parks focus on body because the focused node was removed.
    document.getElementById("color-row").innerHTML =
      '<button id="chip-0" type="button" role="radio" aria-checked="true">RED</button>' +
      '<button id="chip-1" type="button" role="radio" aria-checked="false">BLUE</button>';
    document.body.focus();
    idleFrames(2);
    expect(document.activeElement).toBe(document.getElementById("chip-0"));
    expect(document.getElementById("chip-0").classList.contains("gamepad-focused")).toBe(true);
    // * The next press navigates — it is not eaten re-seeding the ring.
    press(BTN.down);
    expect(document.activeElement).toBe(document.getElementById("chip-1"));
  });

  it("prefers the row's active chip over a stale out-of-range navIndex", () => {
    show("cr-customize-screen");
    press(BTN.down); // seed → BACK
    press(BTN.down); // → chip-0
    press(BTN.down); // → chip-1 (navIndex 2)
    // * Tab switch: the row is replaced by a single active chip.
    document.getElementById("color-row").innerHTML =
      '<button id="chip-new" type="button" role="radio" aria-checked="true">NEW</button>';
    document.body.focus();
    idleFrames(2);
    // * navIndex 2 is out of range for [BACK, chip-new] — a naive clamp would
    // * land on BACK; the active chip in the focused row must win.
    expect(document.activeElement).toBe(document.getElementById("chip-new"));
  });

  it("does not re-seed when focus left the ring but the node is still connected", () => {
    press(BTN.down); // seed → PLAY (ring on play-btn)
    document.body.focus(); // mouse click on empty chrome
    idleFrames(3);
    // * The ring stays visual but focus is not stolen back from the root.
    expect(document.getElementById("play-btn").classList.contains("gamepad-focused")).toBe(true);
    expect(document.activeElement).not.toBe(document.getElementById("play-btn"));
  });
});

describe("focus re-yank", () => {
  it("never steals focus on idle frames while a pad is connected", () => {
    const note = document.getElementById("hud-note");
    note.focus();
    idleFrames(5);
    expect(document.activeElement).toBe(note);
  });

  it("leaves the name-edit input alone while it is visible and focused", () => {
    const input = document.getElementById("cr-name-input");
    input.style.display = "";
    input.focus();
    idleFrames(5);
    expect(document.activeElement).toBe(input);
  });

  it("a press after lost focus seeds focus and is consumed (no navigation)", () => {
    document.getElementById("hud-note").focus();
    press(BTN.down);
    expect(document.activeElement).toBe(document.getElementById("play-btn"));
  });

  it("restores the remembered navIndex within the same scope", () => {
    press(BTN.down); // seed → PLAY
    press(BTN.down); // → CUSTOMIZE
    expect(document.activeElement).toBe(document.getElementById("customize-btn"));
    document.getElementById("hud-note").focus();
    idleFrames(3);
    press(BTN.down); // reclaim → CUSTOMIZE again, not PLAY
    expect(document.activeElement).toBe(document.getElementById("customize-btn"));
  });

  it("resets stale navIndex when the scope layer changes", () => {
    press(BTN.down);
    press(BTN.down); // menu navIndex now 1 (CUSTOMIZE)
    show("cr-settings-screen");
    press(BTN.down); // scope change → seed from index 0 inside settings
    expect(document.activeElement).toBe(document.getElementById("cr-settings-back"));
    hide("cr-settings-screen");
    press(BTN.down); // back to document scope, seed from index 0
    expect(document.activeElement).toBe(document.getElementById("play-btn"));
  });
});

// * INPUT-KB-1: arrow keys had zero menu-navigation effect before this — only native Tab
// * order worked. These pin the keyboard path onto the same engine the gamepad tests above
// * already cover (scoping, seed-on-first-press, focus re-yank), so only the
// * keyboard-specific wiring (gating, preventDefault, typing targets) needs its own cases.
// * ARENA-BUMPER-HINT-1: menu hint advertises LB/RB arena; wire rising-edge to pager buttons.
describe("LB/RB arena paging", () => {
  it("LB edge fires pointerdown/up/click on #cr-arena-prev when pager is visible", () => {
    const order = pressFeedbackSpies("cr-arena-prev");
    const nextSpy = clickSpy("cr-arena-next");
    press(BTN.lb);
    expect(order).toEqual(["pointerdown", "pointerup", "click"]);
    expect(nextSpy).not.toHaveBeenCalled();
  });

  it("RB edge fires pointerdown/up/click on #cr-arena-next when pager is visible", () => {
    const order = pressFeedbackSpies("cr-arena-next");
    const prevSpy = clickSpy("cr-arena-prev");
    press(BTN.rb);
    expect(order).toEqual(["pointerdown", "pointerup", "click"]);
    expect(prevSpy).not.toHaveBeenCalled();
  });

  it("held bumper pages once only (rising edge)", () => {
    const prevSpy = clickSpy("cr-arena-prev");
    // * 3-frame: press → hold → release (not the 2-frame press() helper).
    padRef.pad = makePad([BTN.lb]);
    frame();
    padRef.pad = makePad([BTN.lb]);
    frame();
    padRef.pad = makePad();
    frame();
    expect(prevSpy).toHaveBeenCalledTimes(1);
  });

  it("does not page arena while an overlay owns the nav scope", () => {
    show("cr-settings-screen");
    const prevSpy = clickSpy("cr-arena-prev");
    const nextSpy = clickSpy("cr-arena-next");
    press(BTN.lb);
    press(BTN.rb);
    expect(prevSpy).not.toHaveBeenCalled();
    expect(nextSpy).not.toHaveBeenCalled();
  });

  it("does not page when the arena context is hidden (non-SOLO)", () => {
    // * A1: polyfill only sees inline display:none — wrap.hidden = true would NOT hide.
    document.getElementById("cr-context-arena").style.display = "none";
    const prevSpy = clickSpy("cr-arena-prev");
    const nextSpy = clickSpy("cr-arena-next");
    press(BTN.lb);
    press(BTN.rb);
    expect(prevSpy).not.toHaveBeenCalled();
    expect(nextSpy).not.toHaveBeenCalled();
  });

  it("LB alone flips input mode to gamepad from the nav loop", () => {
    press(BTN.lb);
    expect(setInputMode).toHaveBeenCalledWith("gamepad");
  });

  it("RB alone flips input mode to gamepad from the nav loop", () => {
    press(BTN.rb);
    expect(setInputMode).toHaveBeenCalledWith("gamepad");
  });

  it("does not steal focus from the current nav ring when paging", () => {
    press(BTN.down); // seed → PLAY
    expect(document.activeElement).toBe(document.getElementById("play-btn"));
    press(BTN.rb);
    expect(document.activeElement).toBe(document.getElementById("play-btn"));
  });
});

describe("keyboard arrow-key navigation", () => {
  it("ArrowDown seeds focus, a second ArrowDown navigates to the next control", () => {
    pressKey("ArrowDown");
    expect(document.activeElement).toBe(document.getElementById("play-btn"));
    pressKey("ArrowDown");
    expect(document.activeElement).toBe(document.getElementById("customize-btn"));
  });

  it("respects overlay scoping exactly like the gamepad path", () => {
    show("cr-settings-screen");
    pressKey("ArrowDown");
    const active = document.activeElement;
    expect(active && active.closest("#cr-settings-screen")).toBeTruthy();
    expect(document.getElementById("play-btn").classList.contains("gamepad-focused")).toBe(false);
  });

  it("does nothing while nav is inactive (driving) and does not preventDefault", () => {
    navModule.setGamepadNavActive(false);
    const evt = new KeyboardEvent("keydown", { code: "ArrowDown", bubbles: true, cancelable: true });
    window.dispatchEvent(evt);
    expect(document.activeElement).not.toBe(document.getElementById("play-btn"));
    expect(evt.defaultPrevented).toBe(false);
  });

  it("leaves a focused text input alone (typing, not navigating)", () => {
    const input = document.getElementById("cr-name-input");
    input.style.display = "";
    input.focus();
    const evt = new KeyboardEvent("keydown", { code: "ArrowLeft", bubbles: true, cancelable: true });
    window.dispatchEvent(evt);
    expect(document.activeElement).toBe(input);
    expect(evt.defaultPrevented).toBe(false);
  });

  it("non-arrow keys are ignored (no preventDefault, e.g. typed letters elsewhere)", () => {
    const evt = new KeyboardEvent("keydown", { code: "KeyW", bubbles: true, cancelable: true });
    window.dispatchEvent(evt);
    expect(evt.defaultPrevented).toBe(false);
  });

  it("gamepad presses and keyboard presses share the same navIndex/focus state", () => {
    pressKey("ArrowDown"); // seed → PLAY
    press(BTN.down); // gamepad continues the same sequence → CUSTOMIZE
    expect(document.activeElement).toBe(document.getElementById("customize-btn"));
  });
});
