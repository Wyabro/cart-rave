// input.js — keyboard + input handling

const keys = new Set();
const handledCodes = new Set([
  "KeyW", "KeyA", "KeyS", "KeyD",
  "ArrowUp", "ArrowLeft", "ArrowDown", "ArrowRight",
]);

let localNitroHeld = false;

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
    if (handledCodes.has(e.code)) e.preventDefault();
    keys.add(e.code);
  }

  function onKeyUp(e) {
    if (e.target.tagName === "INPUT") return;
    if (e.code === "ShiftLeft" || e.code === "ShiftRight") {
      e.preventDefault();
      localNitroHeld = false;
    }
    if (handledCodes.has(e.code)) e.preventDefault();
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

export function isNitroHeld() {
  return localNitroHeld;
}