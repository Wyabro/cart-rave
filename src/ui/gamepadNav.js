// gamepadNav.js — D-Pad + A-button UI navigation for gamepad / Steam Deck

let navIndex = 0;
let prevDpad = { up: false, down: false, left: false, right: false, a: false };

function getFocusables() {
  const elements = Array.from(document.querySelectorAll('button, a, [role="button"]'));
  return elements.filter(el => el.offsetParent !== null && !el.disabled);
}

function updateNav() {
  const pads = navigator.getGamepads();
  const gp = pads[0]; // Use gamepad slot 0 for UI
  if (!gp) {
    requestAnimationFrame(updateNav);
    return;
  }

  const isPressed = (i) => gp.buttons[i] && (gp.buttons[i].pressed || gp.buttons[i].value > 0.5);

  const up = isPressed(12);
  const down = isPressed(13);
  const left = isPressed(14);
  const right = isPressed(15);
  const a = isPressed(0);

  const focusables = getFocusables();
  if (focusables.length > 0) {
    // Sync active element with navIndex
    let activeIdx = focusables.indexOf(document.activeElement);
    if (activeIdx !== -1) {
      navIndex = activeIdx;
    }

    const moveNext = (dir) => {
      navIndex = (navIndex + dir + focusables.length) % focusables.length;
      focusables[navIndex].focus();
    };

    if (up && !prevDpad.up) moveNext(-1);
    if (down && !prevDpad.down) moveNext(1);
    if (left && !prevDpad.left) moveNext(-1);
    if (right && !prevDpad.right) moveNext(1);

    if (a && !prevDpad.a) {
      if (document.activeElement && typeof document.activeElement.click === 'function') {
        document.activeElement.click();
      }
    }
  }

  prevDpad = { up, down, left, right, a };
  requestAnimationFrame(updateNav);
}

export function startGamepadUiNav() {
  requestAnimationFrame(updateNav);
}
