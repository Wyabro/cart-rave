import { getActiveGamepad, setInputMode } from "../input.js";

let _navActive = true;
let navIndex = 0;
let prevDpad = { up: false, down: false, left: false, right: false, a: false, b: false };

function isElementVisible(el) {
  if (el.disabled) return false;
  if (typeof el.checkVisibility === "function") {
    return el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
  }
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return false;
  const style = window.getComputedStyle(el);
  return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
}

function getFocusables() {
  const elements = /** @type {HTMLElement[]} */ (Array.from(document.querySelectorAll('button, a, [role="button"], [role="slider"], input, select, textarea')));
  return elements.filter(isElementVisible);
}

/**
 * Nudges a focused role="slider" via its own keyboard handler, so the d-pad
 * adjusts the value instead of navigating away (pause volume sliders).
 * @param {HTMLElement} el
 * @param {"ArrowLeft"|"ArrowRight"} key
 */
function nudgeSlider(el, key) {
  el.dispatchEvent(new KeyboardEvent("keydown", { key, code: key, bubbles: true }));
}

function setFocus(targetEl, focusables) {
  if (!targetEl) return;
  focusables.forEach(el => el.classList.remove('gamepad-focused'));
  targetEl.classList.add('gamepad-focused');
  try {
    targetEl.focus({ focusVisible: true });
  } catch {
    targetEl.focus();
  }
  navIndex = focusables.indexOf(targetEl);
}

function navigateSpatial(dir, focusables) {
  if (!focusables || focusables.length === 0) return;

  const currentEl = document.activeElement && focusables.includes(/** @type {HTMLElement} */ (document.activeElement))
    ? /** @type {HTMLElement} */ (document.activeElement)
    : (focusables[navIndex] || focusables[0]);

  if (!currentEl) return;

  const currentRect = currentEl.getBoundingClientRect();
  const cX = currentRect.left + currentRect.width / 2;
  const cY = currentRect.top + currentRect.height / 2;

  let bestCand = null;
  let bestScore = Infinity;

  for (const cand of focusables) {
    if (cand === currentEl) continue;
    const candRect = cand.getBoundingClientRect();
    const candX = candRect.left + candRect.width / 2;
    const candY = candRect.top + candRect.height / 2;
    const dx = candX - cX;
    const dy = candY - cY;

    let isMatch = false;
    let score = Infinity;

    if (dir === "up" && dy < -4) {
      isMatch = true;
      score = Math.abs(dy) + 2.5 * Math.abs(dx);
    } else if (dir === "down" && dy > 4) {
      isMatch = true;
      score = Math.abs(dy) + 2.5 * Math.abs(dx);
    } else if (dir === "left" && dx < -4) {
      isMatch = true;
      score = Math.abs(dx) + 2.5 * Math.abs(dy);
    } else if (dir === "right" && dx > 4) {
      isMatch = true;
      score = Math.abs(dx) + 2.5 * Math.abs(dy);
    }

    if (isMatch && score < bestScore) {
      bestScore = score;
      bestCand = cand;
    }
  }

  if (bestCand) {
    setFocus(bestCand, focusables);
  } else {
    // Spatial search found no candidate in that direction -> fall back to linear 1D wrap
    const curIdx = focusables.indexOf(currentEl);
    const delta = (dir === "down" || dir === "right") ? 1 : -1;
    const nextIdx = (curIdx + delta + focusables.length) % focusables.length;
    setFocus(focusables[nextIdx], focusables);
  }
}

function updateNav() {
  if (!_navActive) {
    requestAnimationFrame(updateNav);
    return;
  }

  const gp = getActiveGamepad();
  if (!gp) {
    requestAnimationFrame(updateNav);
    return;
  }

  const isPressed = (i) => gp.buttons[i] && (gp.buttons[i].pressed || gp.buttons[i].value > 0.5);

  const lx = gp.axes[0] || 0;
  const ly = gp.axes[1] || 0;
  const threshold = 0.55;

  const stickUp = ly < -threshold;
  const stickDown = ly > threshold;
  const stickLeft = lx < -threshold;
  const stickRight = lx > threshold;

  const up = isPressed(12) || stickUp;
  const down = isPressed(13) || stickDown;
  const left = isPressed(14) || stickLeft;
  const right = isPressed(15) || stickRight;
  const a = isPressed(0);
  const b = isPressed(1);

  if (up || down || left || right || a || b) {
    setInputMode("gamepad");
  }

  const focusables = getFocusables();
  if (focusables.length > 0) {
    if (document.activeElement && focusables.includes(/** @type {HTMLElement} */ (document.activeElement))) {
      const activeIdx = focusables.indexOf(/** @type {HTMLElement} */ (document.activeElement));
      if (activeIdx !== -1) {
        navIndex = activeIdx;
      }
    } else {
      const target = focusables[navIndex] || focusables[0];
      setFocus(target, focusables);
    }

    // * A focused slider claims left/right for value adjustment; up/down still
    // * navigate away from it to the next control.
    const activeEl = /** @type {HTMLElement|null} */ (document.activeElement);
    const activeIsSlider = activeEl?.getAttribute?.("role") === "slider";

    if (up && !prevDpad.up) navigateSpatial("up", focusables);
    if (down && !prevDpad.down) navigateSpatial("down", focusables);
    if (left && !prevDpad.left) {
      if (activeIsSlider && activeEl) nudgeSlider(activeEl, "ArrowLeft");
      else navigateSpatial("left", focusables);
    }
    if (right && !prevDpad.right) {
      if (activeIsSlider && activeEl) nudgeSlider(activeEl, "ArrowRight");
      else navigateSpatial("right", focusables);
    }

    if (a && !prevDpad.a) {
      if (document.activeElement) {
        /** @type {HTMLElement} */ (document.activeElement).click();
      }
    }

    if (b && !prevDpad.b) {
      const activeClose = /** @type {HTMLElement|null} */ (document.querySelector('.cr-customize-back, .cr-overlay-back, .cr-esc-resume, [data-action="back"]'));
      if (activeClose) {
        activeClose.click();
      } else {
        window.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape", key: "Escape", bubbles: true }));
      }
    }
  }

  prevDpad = { up, down, left, right, a, b };
  requestAnimationFrame(updateNav);
}

export function startGamepadUiNav() {
  requestAnimationFrame(updateNav);
}

export function setGamepadNavActive(active) {
  _navActive = active;
  if (!active) {
    document.querySelectorAll('.gamepad-focused').forEach(el => el.classList.remove('gamepad-focused'));
  }
}

