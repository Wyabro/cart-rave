// input.js — keyboard + input handling

const keys = new Set();
const movementCodes = new Set([
  "KeyW", "KeyA", "KeyS", "KeyD",
  "ArrowUp", "ArrowLeft", "ArrowDown", "ArrowRight",
]);

let localNitroHeld = false;

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

  window.addEventListener("blur", () => keys.clear());

  return {
    getAxis,
    isNitroHeld: () => localNitroHeld,
  };
}

/**
 * Returns normalized tank-steering axes from currently held movement keys.
 * @returns {{ forward: number, turn: number }} Each axis in [-1, 1].
 */
export function getAxis() {
  const forward =
    (keys.has("KeyW") || keys.has("ArrowUp") ? 1 : 0) +
    (keys.has("KeyS") || keys.has("ArrowDown") ? -1 : 0);

  const turn =
    (keys.has("KeyA") || keys.has("ArrowLeft") ? 1 : 0) +
    (keys.has("KeyD") || keys.has("ArrowRight") ? -1 : 0);

  return {
    forward: Math.max(-1, Math.min(1, forward)),
    turn: Math.max(-1, Math.min(1, turn)),
  };
}
