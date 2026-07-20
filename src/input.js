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
let _onMute = null;
let _onHop = null;
let _onBoost = null;
let _isUiMode = false;

/** @type {'keyboard'|'gamepad'|'touch'} */
let currentInputMode = "keyboard";

/** @type {Set<(mode: 'keyboard'|'gamepad'|'touch') => void>} */
const inputModeListeners = new Set();

/**
 * Subscribe to input-mode changes (keyboard / gamepad / touch).
 * Used by HOW TO PLAY + Settings overlays so their controls tables rematch
 * the live device the same way the main-menu controls box does.
 * @param {(mode: 'keyboard'|'gamepad'|'touch') => void} fn
 * @returns {() => void} Unsubscribe.
 */
export function onInputModeChange(fn) {
  inputModeListeners.add(fn);
  return () => {
    inputModeListeners.delete(fn);
  };
}

/**
 * Updates active input mode and refreshes the main menu controls panel UI if visible.
 * @param {'keyboard'|'gamepad'|'touch'} mode
 */
export function setInputMode(mode) {
  if (currentInputMode === mode) return;
  currentInputMode = mode;
  updateControlsPanelUI(mode);
  for (const fn of inputModeListeners) {
    try {
      fn(mode);
    } catch {
      // * Listener failures must not break input routing.
    }
  }
}

/** @returns {'keyboard'|'gamepad'|'touch'} */
export function getInputMode() {
  return currentInputMode;
}

/**
 * Renders the controls guide panel in the main menu corresponding to the active input mode.
 * @param {'keyboard'|'gamepad'|'touch'} [mode]
 * @param {Record<string, any>} [palette]
 */
export function updateControlsPanelUI(mode = currentInputMode, palette = null) {
  const panel = document.getElementById("cr-controls");
  if (!panel) return;

  const cMove = palette?.secondary || "#22e6ff";
  const cBoost = palette?.tertiary || "#ffe53d";
  const cHop = palette?.primary || "#ff2bd6";
  const cMute = palette?.players?.[2] || "#2bff7a";
  const cMenu = palette?.players?.[4] || "#ff7a1a";

  if (mode === "gamepad") {
    panel.innerHTML = `
      <div class="cr-controls-hd">
        <span>◇ CONTROLS</span>
        <span class="cr-ctl-badge" style="color: ${cMove}; text-shadow: 0 0 8px ${cMove};">CONTROLLER</span>
      </div>
      <div class="cr-ctl-row">
        <span class="cr-ctl-keys" id="ctl-wasd" style="--kc: ${cMove}"><kbd class="wide">L-STICK</kbd><kbd>D-PAD</kbd></span>
        <span class="cr-ctl-lbl">Steer / Nav</span>
      </div>
      <div class="cr-ctl-row">
        <span class="cr-ctl-keys" id="ctl-shift" style="--kc: ${cBoost}"><kbd>A</kbd><kbd>LT</kbd></span>
        <span class="cr-ctl-lbl">Tap fire · Hold charge</span>
      </div>
      <div class="cr-ctl-row">
        <span class="cr-ctl-keys" id="ctl-space" style="--kc: ${cHop}"><kbd>B</kbd><kbd>RT</kbd></span>
        <span class="cr-ctl-lbl">Hop</span>
      </div>
      <div class="cr-ctl-row">
        <span class="cr-ctl-keys" id="ctl-m" style="--kc: ${cMute}"><kbd class="wide">SELECT</kbd></span>
        <span class="cr-ctl-lbl">Mute Audio</span>
      </div>
      <div class="cr-ctl-row">
        <span class="cr-ctl-keys" id="ctl-esc" style="--kc: ${cMenu}"><kbd class="wide">START</kbd></span>
        <span class="cr-ctl-lbl">Open Menu</span>
      </div>
    `;
  } else if (mode === "touch") {
    panel.innerHTML = `
      <div class="cr-controls-hd">
        <span>◇ CONTROLS</span>
        <span class="cr-ctl-badge" style="color: ${cBoost}; text-shadow: 0 0 8px ${cBoost};">TOUCH</span>
      </div>
      <div class="cr-ctl-row">
        <span class="cr-ctl-keys" id="ctl-wasd" style="--kc: ${cMove}"><kbd class="wide">JOYSTICK</kbd></span>
        <span class="cr-ctl-lbl">Steer Cart</span>
      </div>
      <div class="cr-ctl-row">
        <span class="cr-ctl-keys" id="ctl-shift" style="--kc: ${cBoost}"><kbd class="wide">BOOST</kbd></span>
        <span class="cr-ctl-lbl">Tap fire · Hold charge</span>
      </div>
      <div class="cr-ctl-row">
        <span class="cr-ctl-keys" id="ctl-space" style="--kc: ${cHop}"><kbd class="wide">HOP</kbd></span>
        <span class="cr-ctl-lbl">Hop</span>
      </div>
      <div class="cr-ctl-row">
        <span class="cr-ctl-keys" id="ctl-esc" style="--kc: ${cMenu}"><kbd class="wide">TAP MENU</kbd></span>
        <span class="cr-ctl-lbl">Open Menu</span>
      </div>
    `;
  } else {
    panel.innerHTML = `
      <div class="cr-controls-hd">
        <span>◇ CONTROLS</span>
        <span class="cr-ctl-badge" style="opacity:.6">KEYBOARD</span>
      </div>
      <div class="cr-ctl-row">
        <span class="cr-ctl-keys" id="ctl-wasd" style="--kc: ${cMove}">
          <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd>
        </span>
        <span class="cr-ctl-lbl">Move Cart</span>
      </div>
      <div class="cr-ctl-row">
        <span class="cr-ctl-keys" id="ctl-shift" style="--kc: ${cBoost}"><kbd class="wide">SHIFT</kbd></span>
        <span class="cr-ctl-lbl">Tap fire · Hold charge</span>
      </div>
      <div class="cr-ctl-row">
        <span class="cr-ctl-keys" id="ctl-space" style="--kc: ${cHop}"><kbd class="wide">SPACE</kbd></span>
        <span class="cr-ctl-lbl">Hop</span>
      </div>
      <div class="cr-ctl-row">
        <span class="cr-ctl-keys" id="ctl-m" style="--kc: ${cMute}"><kbd>M</kbd></span>
        <span class="cr-ctl-lbl">Mute Audio</span>
      </div>
      <div class="cr-ctl-row">
        <span class="cr-ctl-keys" id="ctl-esc" style="--kc: ${cMenu}"><kbd>ESC</kbd></span>
        <span class="cr-ctl-lbl">Open Menu</span>
      </div>
    `;
  }
}

/**
 * Returns the currently active Gamepad object, auto-detecting pre-connected pads if needed.
 * @returns {Gamepad|null}
 */
export function getActiveGamepad() {
  const pads = typeof navigator.getGamepads === "function" ? navigator.getGamepads() : [];
  if (gamepadIndex !== null && pads[gamepadIndex]) {
    return pads[gamepadIndex];
  }
  for (let i = 0; i < pads.length; i++) {
    if (pads[i]) {
      gamepadIndex = i;
      return pads[i];
    }
  }
  return null;
}

/**
 * Toggles UI mode for gamepad input. When enabled, driving inputs (axes, boost, hop)
 * are suppressed so D-Pad/A/Start can navigate menus instead.
 * @param {boolean} enabled
 */
export function setUiMode(enabled) {
  const transitioningFromUi = _isUiMode && !enabled;
  _isUiMode = enabled;
  if (enabled) {
    gamepadAxis = { forward: 0, turn: 0 };
    gamepadBoostHeld = false;
  } else if (transitioningFromUi) {
    gamepadAxis = { forward: 0, turn: 0 };
    gamepadBoostHeld = false;
    // Pre-populate prevBtnStates on UI exit so buttons held during UI clicks (e.g. A button)
    // don't trigger rising-edge callbacks (nitro boost / hop) on the first frame of gameplay.
    const gp = getActiveGamepad();
    if (gp) {
      const isPressed = (idx) => {
        const btn = gp.buttons[idx];
        return btn && (btn.value > 0.5 || btn.pressed);
      };
      const boostPressed = isPressed(6) || isPressed(0);
      const hopPressed = isPressed(7) || isPressed(1);
      prevBtnStates = {
        boost: boostPressed,
        hop: hopPressed,
        menu: isPressed(9),
        mute: isPressed(8) || isPressed(11),
      };
      if (boostPressed) {
        gamepadBoostHeld = true;
      }
    }
  }
}

// * Guarded for non-browser contexts (vitest imports this module transitively via netcode.js).
if (typeof window !== "undefined") {
  window.addEventListener("gamepadconnected", (e) => {
    if (import.meta.env.DEV) console.log("[CartRave] Gamepad connected:", e.gamepad.id);
    gamepadIndex = e.gamepad.index;
  });
  window.addEventListener("gamepaddisconnected", (e) => {
    if (e.gamepad.index === gamepadIndex) {
      gamepadIndex = null;
      gamepadAxis = { forward: 0, turn: 0 };
      gamepadBoostHeld = false;
    }
  });
}

// --- Gamepad polling ---
function pollGamepad() {
  const gp = getActiveGamepad();
  if (!gp) {
    gamepadAxis = { forward: 0, turn: 0 };
    gamepadBoostHeld = false;
    return;
  }

  let lx = gp.axes[0] || 0;
  let ly = gp.axes[1] || 0;

  // Smooth radial deadzone calculation
  const deadzone = 0.15;
  const mag = Math.sqrt(lx * lx + ly * ly);
  if (mag < deadzone) {
    lx = 0;
    ly = 0;
  } else {
    // Re-scale magnitude from [deadzone, 1] to [0, 1]
    const normalizedMag = Math.min(1, (mag - deadzone) / (1 - deadzone));
    lx = (lx / mag) * normalizedMag;
    ly = (ly / mag) * normalizedMag;
  }

  const anyBtn = gp.buttons.some((b) => b && (b.pressed || b.value > 0.3));
  if (mag > 0.2 || anyBtn) {
    setInputMode("gamepad");
  }

  let f = -ly; // Push up = forward
  let t = -lx; // Push right = negative turn

  // D-Pad overrides
  if (gp.buttons[12]?.pressed) f = 1;
  if (gp.buttons[13]?.pressed) f = -1;
  if (gp.buttons[14]?.pressed) t = 1;
  if (gp.buttons[15]?.pressed) t = -1;

  gamepadAxis = { forward: f, turn: t };

  const isPressed = (idx) => {
    const btn = gp.buttons[idx];
    return btn && (btn.value > 0.5 || btn.pressed);
  };

  const menuPressed = isPressed(9);
  if (menuPressed && !prevBtnStates.menu) {
    _onEscape?.();
  }

  const mutePressed = isPressed(8) || isPressed(11);
  if (mutePressed && !prevBtnStates.mute) {
    _onMute?.();
  }

  if (_isUiMode) {
    gamepadAxis = { forward: 0, turn: 0 };
    gamepadBoostHeld = false;
    // Still update prevBtnStates so we don't double-fire when exiting UI mode
    const currBtnStates = {};
    currBtnStates.boost = isPressed(6) || isPressed(0);
    currBtnStates.hop = isPressed(7) || isPressed(1);
    currBtnStates.menu = menuPressed;
    currBtnStates.mute = mutePressed;
    prevBtnStates = currBtnStates;
    return;
  }

  const currBtnStates = {};

  // Boost (LT or A)
  const boostPressed = isPressed(6) || isPressed(0);
  if (boostPressed && !gamepadBoostHeld) {
    gamepadBoostHeld = true;
    _onBoost?.();
  } else if (!boostPressed && gamepadBoostHeld) {
    gamepadBoostHeld = false;
  }
  currBtnStates.boost = boostPressed;

  // Hop (RT or B - One-shot)
  const hopPressed = isPressed(7) || isPressed(1);
  if (hopPressed && !prevBtnStates.hop) {
    _onHop?.();
  }
  currBtnStates.hop = hopPressed;

  currBtnStates.menu = menuPressed;
  currBtnStates.mute = mutePressed;

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
  _onMute = onMute;
  _onHop = onHop;
  _onBoost = onBoost;

  function onKeyDown(e) {
    setInputMode("keyboard");
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

  // * Window-only: key events on the focused canvas bubble to window anyway.
  // * A duplicate canvas listener made every non-Escape key fire handlers twice
  // * when the canvas had focus (in-game) — M-unmute double-toggled to a no-op.
  window.addEventListener("keydown", onKeyDown, { passive: false });
  window.addEventListener("keyup", onKeyUp, { passive: false });

  window.addEventListener("blur", () => {
    keys.clear();
    localNitroHeld = false;
    hopRequested = false;
    resetTouchControls();
  });

  return {
    getAxis,
    // * Must match getAxis().boostHeld — sampleLocalInputForTick / non-host prediction
    // * used to omit gamepadBoostHeld, so LT/A started charge SFX once then never held
    // * boostHeld (bar stuck, charge cancelled or orphaned loop) (NH-BOOST).
    isNitroHeld: () => localNitroHeld || isBoostHeld() || gamepadBoostHeld,
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
