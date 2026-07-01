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
  const boostHeld = localNitroHeld || isBoostHeld();

  // * Joystick-active: per-axis max magnitude so a Bluetooth keyboard still works on tablets.
  if (isJoystickActive()) {
    return {
      forward: Math.abs(touch.forward) >= Math.abs(keyboard.forward)
        ? touch.forward
        : keyboard.forward,
      turn: Math.abs(touch.turn) >= Math.abs(keyboard.turn)
        ? touch.turn
        : keyboard.turn,
      boostHeld,
    };
  }

  if (Math.abs(touch.forward) > 0 || Math.abs(touch.turn) > 0) {
    return { ...touch, boostHeld };
  }

  return { ...keyboard, boostHeld };
}

export { setupTouchControls, setTouchControlsVisible };
