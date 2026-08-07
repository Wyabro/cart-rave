// @vitest-environment happy-dom
// PODIUM-FOCUS-1 — the non-host podium must expose a pad-focusable control
// distinct from MAIN MENU. gamepadNav's isElementVisible rejects `disabled`
// elements, so `playAgain.disabled = !isHost` left MAIN MENU as a guest's only
// pad-reachable podium button — a guest mashing A through the rematch window
// silently left the room. The fix keeps the guest rematch button enabled (so
// the pad lands on it) but inert: dimmed (.cc-btn--disabled) + aria-disabled +
// the "WAITING FOR HOST…" label, and the guarded onHostPlayAgainClick handler
// swallows the press. Host PLAY AGAIN is unchanged.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// * Feed the nav loop a hand-built pad (same harness as gamepadNav.test.js).
const padRef = vi.hoisted(() => ({ pad: /** @type {any} */ (null) }));
vi.mock("../src/input.js", () => ({
  getActiveGamepad: () => padRef.pad,
  setInputMode: vi.fn(),
}));

const BTN = { a: 0, b: 1, up: 12, down: 13, left: 14, right: 15 };

function makePad(pressed = []) {
  return {
    buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: pressed.includes(i), value: 0 })),
    axes: [0, 0],
  };
}

// * Mirrors initResultsOverlay's action row (resultsOverlay.js): the rematch
// * button + MAIN MENU, with the same classes/attrs gamepadNav scopes to.
const FIXTURE = `
<div id="results-overlay" style="display:none">
  <div class="results-panel">
    <div class="results-actions">
      <button id="results-play-again" type="button" class="results-btn cc-btn cc-btn--primary" data-gamepad-focusable="true">PLAY AGAIN</button>
      <button id="results-main-menu" type="button" class="results-btn results-btn--ghost cc-btn cc-btn--ghost" data-gamepad-focusable="true">MAIN MENU</button>
    </div>
  </div>
</div>
`;

let scheduled = [];

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

// * Mirrors the playAgain state block in roundLifecycle.js updateResultsOverlay
// * (the PODIUM-FOCUS-1 fix). Kept in sync with that block; the fixture DOM
// * mirrors initResultsOverlay's action row.
function applyPlayAgainState(isHost) {
  const playAgain = document.getElementById("results-play-again");
  playAgain.disabled = false;
  playAgain.classList.toggle("cc-btn--disabled", !isHost);
  if (isHost) {
    playAgain.removeAttribute("aria-disabled");
    playAgain.textContent = "PLAY AGAIN";
  } else {
    playAgain.setAttribute("aria-disabled", "true");
    playAgain.textContent = "WAITING FOR HOST…";
  }
}

function showResultsOverlay() {
  document.getElementById("results-overlay").style.display = "flex";
}

function get(id) {
  return document.getElementById(id);
}

function clickSpy(id) {
  const spy = vi.fn();
  get(id).addEventListener("click", spy);
  return spy;
}

/** @type {typeof import("../src/ui/gamepadNav.js")} */
let navModule;

beforeEach(async () => {
  scheduled = [];
  padRef.pad = makePad();
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
  // * from inline display — the overlays' actual open/closed contract.
  Element.prototype.checkVisibility = function () {
    for (let el = this; el; el = el.parentElement) {
      if (el.style && el.style.display === "none") return false;
    }
    return true;
  };

  document.body.innerHTML = FIXTURE;

  vi.resetModules();
  navModule = await import("../src/ui/gamepadNav.js");
  navModule.startGamepadUiNav();
});

afterEach(() => {
  navModule?.__teardownGamepadUiNavForTest?.();
  vi.unstubAllGlobals();
  delete Element.prototype.checkVisibility;
  document.body.innerHTML = "";
});

describe("podium play-again state (PODIUM-FOCUS-1)", () => {
  it("guest: rematch button stays enabled (pad-focusable) but inert-looking with the waiting label", () => {
    applyPlayAgainState(false);
    const playAgain = get("results-play-again");
    const mainMenu = get("results-main-menu");
    // * disabled would drop it from gamepadNav's focusables — the core of the fix.
    expect(playAgain.disabled).toBe(false);
    expect(playAgain.classList.contains("cc-btn--disabled")).toBe(true);
    expect(playAgain.getAttribute("aria-disabled")).toBe("true");
    expect(playAgain.textContent).toContain("WAITING FOR HOST");
    // * A second, distinct pad target that is NOT MAIN MENU.
    expect(playAgain).not.toBe(mainMenu);
    expect(mainMenu.disabled).toBe(false);
  });

  it("host: PLAY AGAIN is enabled with the plain label and no inert markers", () => {
    applyPlayAgainState(true);
    const playAgain = get("results-play-again");
    expect(playAgain.disabled).toBe(false);
    expect(playAgain.classList.contains("cc-btn--disabled")).toBe(false);
    expect(playAgain.hasAttribute("aria-disabled")).toBe(false);
    expect(playAgain.textContent).toBe("PLAY AGAIN");
  });
});

describe("podium gamepad behavior", () => {
  it("regression: pre-fix disabled guest rematch leaves MAIN MENU as the only pad target", () => {
    showResultsOverlay();
    get("results-play-again").disabled = true; // pre-fix state
    const mainMenuSpy = clickSpy("results-main-menu");
    press(BTN.down); // seed focus
    expect(document.activeElement).toBe(get("results-main-menu")); // only target
    press(BTN.a); // mash lands on MAIN MENU → leaves the room
    expect(mainMenuSpy).toHaveBeenCalledTimes(1);
  });

  it("guest: focus seeds onto the waiting rematch button, not MAIN MENU", () => {
    showResultsOverlay();
    applyPlayAgainState(false);
    press(BTN.down);
    expect(document.activeElement).toBe(get("results-play-again"));
    expect(get("results-main-menu").classList.contains("gamepad-focused")).toBe(false);
  });

  it("guest: A on the waiting rematch button never leaves the room, even on a mash", () => {
    showResultsOverlay();
    applyPlayAgainState(false);
    let leftRoom = false;
    get("results-main-menu").addEventListener("click", () => { leftRoom = true; });
    // * Mirrors gameBoot.js wiring: the play-again click handler is the guarded
    // * onHostPlayAgainClick, which returns immediately for non-hosts.
    const playAgainClicks = clickSpy("results-play-again");
    press(BTN.down); // seed → rematch button
    press(BTN.a);
    press(BTN.a); // a mash: second press must land on the same inert target
    expect(playAgainClicks).toHaveBeenCalledTimes(2);
    expect(leftRoom).toBe(false);
    expect(document.activeElement).toBe(get("results-play-again"));
  });

  it("host: A on PLAY AGAIN fires the rematch handler once and never MAIN MENU", () => {
    showResultsOverlay();
    applyPlayAgainState(true);
    const playAgainSpy = clickSpy("results-play-again"); // onHostPlayAgainClick
    const mainMenuSpy = clickSpy("results-main-menu");
    press(BTN.down); // seed → PLAY AGAIN
    expect(document.activeElement).toBe(get("results-play-again"));
    press(BTN.a);
    expect(playAgainSpy).toHaveBeenCalledTimes(1);
    expect(mainMenuSpy).not.toHaveBeenCalled();
  });
});
