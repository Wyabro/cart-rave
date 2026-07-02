// input.js — keyboard + touch input handling

import {
  flashBoostActivate,
  getTouchAxis,
  isBoostHeld,
  isJoystickActive,
  resetTouchControls,
  setTouchControlsVisible,
  setupTouchControls,
  syncTouchLayout,
} from "./touchControls.js";

const keys = new Set();
const movementCodes = new Set([
  "KeyW", "KeyA", "KeyS", "KeyD",
  "ArrowUp", "ArrowLeft", "ArrowDown", "ArrowRight",
]);

// --- Gamepad state ---
let gamepadIndex = null;
let gamepadAxis = { forward: 0, turn: 0 };
let gamepadBoostHeld = false;
let prevBtnStates = {};
let _onEscape = null;
let _onHop = null;
let _onBoost = null;
let _isUiMode = false;

/**
 * Toggles UI mode for gamepad input. When enabled, driving inputs (axes, boost, hop)
 * are suppressed so D-Pad/A/Start can navigate menus instead.
 * @param {boolean} enabled
 */
export function setUiMode(enabled) {
  _isUiMode = enabled;
  if (enabled) {
    gamepadAxis = { forward: 0, turn: 0 };
    gamepadBoostHeld = false;
  }
}

window.addEventListener("gamepadconnected", (e) => {
  console.log("Gamepad connected:", e.gamepad.id);
  gamepadIndex = e.gamepad.index;
});
window.addEventListener("gamepaddisconnected", (e) => {
  if (e.gamepad.index === gamepadIndex) {
    gamepadIndex = null;
    gamepadAxis = { forward: 0, turn: 0 };
    gamepadBoostHeld = false;
  }
});

// --- Gamepad polling ---
function pollGamepad() {
  if (gamepadIndex === null) return;
  const pads = navigator.getGamepads();
  const gp = pads[gamepadIndex];
  if (!gp) return;

  const deadzone = 0.1;
  let lx = gp.axes[0] || 0;
  let ly = gp.axes[1] || 0;

  if (Math.abs(lx) < deadzone) lx = 0;
  if (Math.abs(ly) < deadzone) ly = 0;

  let f = -ly; // Push up = forward
  let t = lx;  // Push right = turn right

  // D-Pad overrides
  if (gp.buttons[12]?.pressed) f = 1;
  if (gp.buttons[13]?.pressed) f = -1;
  if (gp.buttons[14]?.pressed) t = -1;
  if (gp.buttons[15]?.pressed) t = 1;

  gamepadAxis = { forward: f, turn: t };

  if (_isUiMode) {
    gamepadAxis = { forward: 0, turn: 0 };
    gamepadBoostHeld = false;
    // Still update prevBtnStates so we don't double-fire when exiting UI mode
    const currBtnStates = {};
    const isPressed = (idx) => {
      const btn = gp.buttons[idx];
      return btn && (btn.value > 0.5 || btn.pressed);
    };
    currBtnStates.boost = isPressed(7) || isPressed(0);
    currBtnStates.hop = isPressed(6) || isPressed(1);
    currBtnStates.menu = isPressed(9);
    prevBtnStates = currBtnStates;
    return;
  }

  const currBtnStates = {};
  const isPressed = (idx) => {
    const btn = gp.buttons[idx];
    return btn && (btn.value > 0.5 || btn.pressed);
  };

  // Boost
  const boostPressed = isPressed(7) || isPressed(0);
  if (boostPressed && !gamepadBoostHeld) {
    gamepadBoostHeld = true;
    _onBoost?.();
  } else if (!boostPressed && gamepadBoostHeld) {
    gamepadBoostHeld = false;
  }
  currBtnStates.boost = boostPressed;

  // Hop (One-shot)
  const hopPressed = isPressed(6) || isPressed(1);
  if (hopPressed && !prevBtnStates.hop) {
    _onHop?.();
  }
  currBtnStates.hop = hopPressed;

  // Escape / Menu (One-shot)
  const menuPressed = isPressed(9);
  if (menuPressed && !prevBtnStates.menu) {
    _onEscape?.();
  }
  currBtnStates.menu = menuPressed;

  prevBtnStates = currBtnStates;
}

function gamepadLoop() {
  pollGamepad();
  requestAnimationFrame(gamepadLoop);
}
gamepadLoop(); // Start the polling loop

let localNitroHeld = false;
/** @type {boolean} One-shot hop flag consumed by the client input send loop. */
let hopRequested = false;

/** Marks a hop press for the next outgoing `client_input` packet (non-host only). */
export function requestHop() {
  hopRequested = true;
}

/** Returns and clears the pending hop request. */
export function consumeHopRequest() {
  const requested = hopRequested;
  hopRequested = false;
  return requested;
}

/**
 * Attaches keyboard listeners for movement, nitro, hop, mute, and Esc.
 * @param {HTMLElement|null|undefined} canvas Focus target for key events (optional).
 * @param {(() => void)|undefined} onEscape Called when Esc is pressed.
 * @param {(() => void)|undefined} onMute Called when M is pressed.
 * @param {(() => void)|undefined} onHop Called when Space is pressed.
 * @param {(() => void)|undefined} onBoost Called when Shift is pressed.
 * @returns {{ getAxis: typeof getAxis, isNitroHeld: () => boolean }}
 */
export function setupInput(canvas, onEscape, onMute, onHop, onBoost) {
  _onEscape = onEscape;
  _onHop = onHop;
  _onBoost = onBoost;

  function onKeyDown(e) {
    if (e.code === "Escape") {
      e.preventDefault();
      e.stopImmediatePropagation();
      onEscape?.();
      return;
    }
    if (e.target.tagName === "INPUT") return;

    if (e.code === "ShiftLeft" || e.code === "ShiftRight") {
      if (e.repeat) return;
      e.preventDefault();
      localNitroHeld = true;
      onBoost?.();
      return;
    }
    if (e.code === "KeyM") {
      if (e.repeat) return;
      e.preventDefault();
      onMute?.();
      return;
    }
    if (e.code === "Space") {
      e.preventDefault();
      if (e.repeat) return;
      onHop?.();
      return;
    }
    if (movementCodes.has(e.code)) e.preventDefault();
    keys.add(e.code);
  }

  function onKeyUp(e) {
    if (e.target.tagName === "INPUT") return;
    if (e.code === "ShiftLeft" || e.code === "ShiftRight") {
      e.preventDefault();
      localNitroHeld = false;
    }
    if (movementCodes.has(e.code)) e.preventDefault();
    keys.delete(e.code);
  }

  window.addEventListener("keydown", onKeyDown, { passive: false });
  window.addEventListener("keyup", onKeyUp, { passive: false });
  canvas?.addEventListener("keydown", onKeyDown, { passive: false });
  canvas?.addEventListener("keyup", onKeyUp, { passive: false });

  window.addEventListener("blur", () => {
    keys.clear();
    localNitroHeld = false;
    hopRequested = false;
    resetTouchControls();
  });

  return {
    getAxis,
    isNitroHeld: () => localNitroHeld || isBoostHeld(),
  };
}

/**
 * Returns normalized tank-steering axes from keyboard and/or touch joystick.
 * @returns {{ forward: number, turn: number, boostHeld: boolean }} Each axis in [-1, 1].
 */
export function getAxis() {
  const forward =
    (keys.has("KeyW") || keys.has("ArrowUp") ? 1 : 0) +
    (keys.has("KeyS") || keys.has("ArrowDown") ? -1 : 0);

  const turn =
    (keys.has("KeyA") || keys.has("ArrowLeft") ? 1 : 0) +
    (keys.has("KeyD") || keys.has("ArrowRight") ? -1 : 0);

  const keyboard = {
    forward: Math.max(-1, Math.min(1, forward)),
    turn: Math.max(-1, Math.min(1, turn)),
  };

  const touch = getTouchAxis();
  const boostHeld = localNitroHeld || isBoostHeld() || gamepadBoostHeld;

  // Start with keyboard
  let finalForward = keyboard.forward;
  let finalTurn = keyboard.turn;

  // Override with gamepad if active
  if (Math.abs(gamepadAxis.forward) > 0) finalForward = gamepadAxis.forward;
  if (Math.abs(gamepadAxis.turn) > 0) finalTurn = gamepadAxis.turn;

  // Override with touch if active
  if (isJoystickActive()) {
    finalForward = Math.abs(touch.forward) >= Math.abs(finalForward) ? touch.forward : finalForward;
    finalTurn = Math.abs(touch.turn) >= Math.abs(finalTurn) ? touch.turn : finalTurn;
  } else if (Math.abs(touch.forward) > 0 || Math.abs(touch.turn) > 0) {
    finalForward = touch.forward;
    finalTurn = touch.turn;
  }

  return { forward: finalForward, turn: finalTurn, boostHeld };
}

export { setupTouchControls, setTouchControlsVisible };
