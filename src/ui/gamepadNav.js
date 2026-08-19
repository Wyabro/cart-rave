import { getActiveGamepad, setInputMode, setUiMode } from "../input.js";
import { hapticMenuConfirm, hapticMenuFocus } from "../haptics.js";

let _navActive = true;
let navIndex = 0;
let prevDpad = {
  up: false, down: false, left: false, right: false, a: false, b: false, x: false, y: false, start: false, lb: false, rb: false,
};

// * The last node the ring actually focused, plus the radiogroup row it lived
// * in. The row survives a chip rebuild (innerHTML replaces its children), which
// * is what lets restoreDeadFocusRing find the new active chip after selection.
let lastFocusedEl = /** @type {HTMLElement|null} */ (null);
let lastFocusedRow = /** @type {HTMLElement|null} */ (null);

// * Overlay containers that scope gamepad nav while open, topmost z-order
// * first (esc 26000 > results 25000 > lobby 24000 > menu screens 1002 > 1001).
// * Menu overlays share inline style.display === "flex" — the same contract
// * closeActiveOverlay() in cart-rave-menu.js uses. The Friends lobby uses the
// * hidden attribute + CSS display:grid instead. Keep this list in sync when
// * adding an overlay, or a pad will reach buttons under it.
const OVERLAY_SCOPE_SELECTORS = [
  "#cr-gamepad-text-entry",
  "#esc-overlay",
  "#results-overlay",
  ".hud-lobby",
  "#cr-howto-screen",
  "#cr-challenges-screen",
  "#cr-settings-screen",
  "#cr-customize-screen",
];

let lastScope = /** @type {HTMLElement|Document|null} */ (null);

// * A held menu direction acts once immediately, then repeats after a short
// * pause. Never catch up after a stalled frame: one rAF tick may move focus
// * only once.
const DIRECTION_REPEAT_DELAY_MS = 300;
const DIRECTION_REPEAT_INTERVAL_MS = 100;
const STICK_ENTER_THRESHOLD = 0.55;
const STICK_RELEASE_THRESHOLD = 0.35;
let heldDirection = /** @type {"up"|"down"|"left"|"right"|null} */ (null);
let stickDirection = /** @type {"up"|"down"|"left"|"right"|null} */ (null);
let nextDirectionRepeatAt = 0;
let lastFocusHapticAt = -Infinity;
const FOCUS_HAPTIC_INTERVAL_MS = 200;

function resetDirectionRepeat() {
  heldDirection = null;
  stickDirection = null;
  nextDirectionRepeatAt = 0;
}

/** @param {"up"|"down"|"left"|"right"} direction @param {number} lx @param {number} ly */
function stickDirectionMagnitude(direction, lx, ly) {
  if (direction === "up") return -ly;
  if (direction === "down") return ly;
  if (direction === "left") return -lx;
  return lx;
}

/**
 * Resolve exactly one menu direction. D-pad wins over the stick. A stick uses
 * its strongest axis on entry, then stays on that axis until it crosses the
 * lower release threshold so light drift cannot restart repeat timing.
 * @param {(button: number) => boolean} isPressed
 * @param {number} lx
 * @param {number} ly
 * @returns {"up"|"down"|"left"|"right"|null}
 */
function resolveMenuDirection(isPressed, lx, ly) {
  if (isPressed(12)) { stickDirection = null; return "up"; }
  if (isPressed(13)) { stickDirection = null; return "down"; }
  if (isPressed(14)) { stickDirection = null; return "left"; }
  if (isPressed(15)) { stickDirection = null; return "right"; }

  if (stickDirection && stickDirectionMagnitude(stickDirection, lx, ly) >= STICK_RELEASE_THRESHOLD) {
    return stickDirection;
  }
  stickDirection = null;

  const x = Math.abs(lx);
  const y = Math.abs(ly);
  if (Math.max(x, y) < STICK_ENTER_THRESHOLD) return null;
  stickDirection = x >= y ? (lx < 0 ? "left" : "right") : (ly < 0 ? "up" : "down");
  return stickDirection;
}

/**
 * @param {"up"|"down"|"left"|"right"|null} direction
 * @param {number} now
 * @returns {"initial"|"repeat"|null}
 */
function consumeDirectionEvent(direction, now) {
  if (!direction) {
    heldDirection = null;
    nextDirectionRepeatAt = 0;
    return null;
  }
  if (direction !== heldDirection) {
    heldDirection = direction;
    nextDirectionRepeatAt = now + DIRECTION_REPEAT_DELAY_MS;
    return "initial";
  }
  if (now < nextDirectionRepeatAt) return null;
  nextDirectionRepeatAt = now + DIRECTION_REPEAT_INTERVAL_MS;
  return "repeat";
}

/**
 * @param {HTMLElement|null} el
 * @returns {el is HTMLElement}
 */
function isOverlayScopeOpen(el) {
  if (!el) return false;
  // * Lobby is shown by clearing [hidden] (CSS display:grid). Menu overlays
  // * stay on the flex contract. Do not require flex here or the lobby never
  // * becomes a scope and mute / menu buttons stay in the ring.
  const lobbyOpen = el.classList.contains("hud-lobby") && !el.hidden;
  const menuOpen = !el.classList.contains("hud-lobby") && el.style.display === "flex";
  return (lobbyOpen || menuOpen) && isElementVisible(el, { ignoreOpacity: true });
}

/**
 * The container gamepad nav may reach: the topmost open overlay, or the
 * whole document when none is open (main menu / HUD).
 * @returns {HTMLElement|Document}
 */
function getNavScope() {
  for (const sel of OVERLAY_SCOPE_SELECTORS) {
    const el = /** @type {HTMLElement|null} */ (document.querySelector(sel));
    if (isOverlayScopeOpen(el)) return el;
  }
  return document;
}

/** @param {HTMLElement} el @param {{ ignoreOpacity?: boolean }} [options] */
function isElementVisible(el, { ignoreOpacity = false } = {}) {
  if (el.disabled) return false;
  if (typeof el.checkVisibility === "function") {
    return el.checkVisibility({ checkOpacity: !ignoreOpacity, checkVisibilityCSS: true });
  }
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return false;
  const style = window.getComputedStyle(el);
  return style.display !== "none" && style.visibility !== "hidden" && (ignoreOpacity || style.opacity !== "0");
}

/**
 * Whether a control belongs in the pad/keyboard nav ring. Bare text inputs
 * are out — a pad cannot type into them. The room-code field opts back in via
 * `data-gamepad-entry` so the ring can reach it; GO stays out so FRIENDS ↓
 * does not land on a second join control. Range sliders stay in so d-pad
 * left/right can nudge them like the role="slider" tracks. `data-nav-skip` is
 * the inverse of `data-gamepad-entry`: a control that must stay out of the ring
 * because activating it leaves the page (the receipt's survey link — a pad
 * mashing A on the podium must never background the tab).
 * @param {HTMLElement} el
 */
function isNavReachable(el) {
  if (el.dataset?.gamepadEntry) return true;
  if (el.dataset?.navSkip) return false;
  if (el.closest?.(".cr-join")) return false;
  if (el.tagName === "TEXTAREA") return false;
  if (el instanceof HTMLInputElement && el.type !== "range") return false;
  return true;
}

/**
 * @param {HTMLElement|Document} scope
 */
function getFocusables(scope) {
  const elements = /** @type {HTMLElement[]} */ (Array.from(scope.querySelectorAll('button, a, [role="button"], [role="slider"], input, select, textarea')));
  const pauseResume = scope instanceof HTMLElement && scope.id === "esc-overlay"
    ? /** @type {HTMLElement|null} */ (scope.querySelector(".esc-btn--resume"))
    : null;
  return elements.filter((el) => isElementVisible(el, { ignoreOpacity: el === pauseResume }) && isNavReachable(el));
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

function setFocus(targetEl, focusables, gamepadIndex = undefined, hapticNow = performance.now()) {
  if (!targetEl) return;
  // * Sweep document-wide, not just the current focusables — a ring left on a
  // * button behind a newly opened overlay is outside the scoped list.
  document.querySelectorAll('.gamepad-focused').forEach(el => el.classList.remove('gamepad-focused'));
  targetEl.classList.add('gamepad-focused');
  try {
    targetEl.focus({ focusVisible: true });
  } catch {
    targetEl.focus();
  }
  navIndex = focusables.indexOf(targetEl);
  lastFocusedEl = targetEl;
  lastFocusedRow = targetEl.closest?.('[role="radiogroup"]') ?? null;
  if (gamepadIndex != null) {
    if (hapticNow - lastFocusHapticAt >= FOCUS_HAPTIC_INTERVAL_MS) {
      lastFocusHapticAt = hapticNow;
      hapticMenuFocus(gamepadIndex);
    }
  }
}

/**
 * True when focus has fallen back to the document root — the browser parks
 * focus there both when the focused node is removed from the DOM and when the
 * user clicks dead chrome. Both cases look identical from here, so the rest of
 * the restore guard (ring node actually gone) separates them.
 */
function focusLostToRoot() {
  const a = document.activeElement;
  return !a || a === document.body || a === document.documentElement;
}

/**
 * Re-seed the ring after the focused node was destroyed by a rebuild
 * (customize chips re-assign their row's innerHTML on selection). Runs only when
 * focus is on the root AND the last ring node is disconnected — a click on dead
 * chrome parks focus on body with the ring node still live, which must NOT
 * restore (that is the old focus-steal bug).
 * Prefers the row's `[aria-checked="true"]` chip (a tab switch can shorten the
 * list, so clamping navIndex alone could land on BACK/DONE), else the clamped
 * navIndex.
 * @param {HTMLElement[]} focusables
 * @returns {HTMLElement|null}
 */
function restoreDeadFocusRing(focusables) {
  if (!focusLostToRoot()) return null;
  if (!lastFocusedEl || lastFocusedEl.isConnected) return null;
  if (lastFocusedRow) {
    const checked = lastFocusedRow.querySelector('[aria-checked="true"]');
    const idx = checked ? focusables.indexOf(/** @type {HTMLElement} */ (checked)) : -1;
    if (idx >= 0) return focusables[idx];
  }
  const idx = navIndex >= 0 && navIndex < focusables.length ? navIndex : 0;
  return focusables[idx] || null;
}

function navigateSpatial(dir, focusables, gamepadIndex = undefined, hapticNow = performance.now()) {
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
    setFocus(bestCand, focusables, gamepadIndex, hapticNow);
  } else {
    // Spatial search found no candidate in that direction -> fall back to linear 1D wrap
    const curIdx = focusables.indexOf(currentEl);
    const delta = (dir === "down" || dir === "right") ? 1 : -1;
    const nextIdx = (curIdx + delta + focusables.length) % focusables.length;
    setFocus(focusables[nextIdx], focusables, gamepadIndex, hapticNow);
  }
}

function updateNav(now = performance.now()) {
  if (!_navActive) {
    resetDirectionRepeat();
    requestAnimationFrame(updateNav);
    return;
  }

  const gp = getActiveGamepad();
  if (!gp) {
    resetDirectionRepeat();
    requestAnimationFrame(updateNav);
    return;
  }

  const isPressed = (i) => gp.buttons[i] && (gp.buttons[i].pressed || gp.buttons[i].value > 0.5);

  const lx = gp.axes[0] || 0;
  const ly = gp.axes[1] || 0;
  const direction = resolveMenuDirection(isPressed, lx, ly);
  const a = isPressed(0);
  const b = isPressed(1);
  const x = isPressed(2);
  const y = isPressed(3);
  const start = isPressed(9);
  // * Standard Gamepad: buttons[4]/[5] = LB / RB. Unused in-match (boost/hop are
  // * triggers + face). Menu hint advertises them for arena paging (ARENA-BUMPER-HINT-1).
  const lb = isPressed(4);
  const rb = isPressed(5);

  if (direction || a || b || x || y || start || lb || rb) {
    setInputMode("gamepad");
  }

  const scope = getNavScope();
  if (scope !== lastScope) {
    // * Layer changed (overlay opened/closed): navIndex from the old list is
    // * meaningless in the new one. Overlays focus their primary button on
    // * open, so the adopt branch below re-derives the right index.
    navIndex = 0;
    lastScope = scope;
    resetDirectionRepeat();

    // * Pause explicitly focuses RESUME on open. Paint the same controller ring
    // * on that real focus target immediately, before the player has to press a
    // * direction. Other overlays keep their established first-press behavior.
    if (scope !== document) {
      const scopeFocusables = getFocusables(scope);
      const active = /** @type {HTMLElement|null} */ (document.activeElement);
      if (active && scopeFocusables.includes(active)) {
        setFocus(active, scopeFocusables, gp.index, now);
      }
    }
  }

  const directionEvent = consumeDirectionEvent(direction, now);

  // * LB/RB keep the established arena pager contract. The normal D-pad ring
  // * still reaches setup controls; overlays never page menu controls behind
  // * their active layer.
  if (scope === document && !isTypingTarget(document.activeElement)) {
    const arenaPrev = /** @type {HTMLElement|null} */ (document.getElementById("cr-arena-prev"));
    const arenaNext = /** @type {HTMLElement|null} */ (document.getElementById("cr-arena-next"));
    if (lb && !prevDpad.lb && arenaPrev && isElementVisible(arenaPrev)) {
      hapticMenuConfirm(gp.index);
      arenaPrev.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      arenaPrev.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
      arenaPrev.click();
    }
    if (rb && !prevDpad.rb && arenaNext && isElementVisible(arenaNext)) {
      hapticMenuConfirm(gp.index);
      arenaNext.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      arenaNext.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
      arenaNext.click();
    }
  }

  const focusables = getFocusables(scope);
  if (focusables.length > 0) {
    let activeEl = /** @type {HTMLElement|null} */ (document.activeElement);
    let focusInScope = !!activeEl && focusables.includes(activeEl);
    if (focusInScope && activeEl) {
      navIndex = focusables.indexOf(activeEl);
    } else {
      const restored = restoreDeadFocusRing(focusables);
      if (restored) {
        // * A rebuild (customize chip innerHTML, …) destroyed the focused node
        // * and the browser parked focus on body. Re-seed the ring now — on an
        // * idle frame, before any press — so the next press navigates instead
        // * of being consumed re-seeding. Only fires when the ring node is
        // * actually gone, never while focus sits on a live control.
        setFocus(restored, focusables, gp.index, now);
      } else if (
        directionEvent === "initial" ||
        (a && !prevDpad.a)
      ) {
        // * Reclaim only on an actual press — re-seizing every idle frame still
        // * steals mouse/keyboard focus. On the desktop main menu, however, the
        // * first controller press also performs its requested move/select so it
        // * does not feel like a dead focus-seed press.
        setFocus(focusables[navIndex] || focusables[0], focusables, gp.index, now);
        activeEl = /** @type {HTMLElement|null} */ (document.activeElement);
        focusInScope = !!activeEl && focusables.includes(activeEl);
        if (scope !== document) focusInScope = false;
      }
    }

    if (focusInScope && activeEl) {
      // * A focused slider claims left/right for value adjustment; up/down still
      // * navigate away from it to the next control. Range inputs behave the
      // * same way — the customize hue slider is a bare input[type=range] with
      // * no role, so treat both by the same rule.
      const activeIsSlider = activeEl.getAttribute?.("role") === "slider"
        || (activeEl instanceof HTMLInputElement && activeEl.type === "range");

      // * Sliders accept one 5% left/right nudge per new press. Their hold
      // * behavior stays unchanged; other directions repeat through the ring.
      const sliderHorizontal = activeIsSlider && (direction === "left" || direction === "right");
      if (directionEvent && (directionEvent === "initial" || !sliderHorizontal)) {
        if (direction === "up" || direction === "down") {
          navigateSpatial(direction, focusables, gp.index, now);
        } else if (direction === "left") {
          if (activeIsSlider) nudgeSlider(activeEl, "ArrowLeft");
          else navigateSpatial("left", focusables, gp.index, now);
        } else if (direction === "right") {
          if (activeIsSlider) nudgeSlider(activeEl, "ArrowRight");
          else navigateSpatial("right", focusables, gp.index, now);
        }
      }

      if (a && !prevDpad.a) {
        const el = /** @type {HTMLElement|null} */ (document.activeElement);
        if (el) {
          // * Press-feedback wiring listens for pointerdown/up, which a bare
          // * .click() never dispatches — so gamepad confirm used to skip the
          // * squash/release. Fire them first (skip sliders and ranges, which
          // * use d-pad left/right and would misread a synthetic pointer),
          // * then click.
          if (el.getAttribute("role") !== "slider" && !(el instanceof HTMLInputElement && el.type === "range")) {
            hapticMenuConfirm(gp.index);
            el.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
            el.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
          }
          const gamepadActivation = new CustomEvent("cartrave:gamepad-activate", { bubbles: true, cancelable: true });
          if (el.dispatchEvent(gamepadActivation)) el.click();
        }
      }
    }

    // * Back is focus-independent, but must respect the active layer: query
    // * within scope and skip hidden matches (document scope would otherwise
    // * click an invisible overlay back button).
    if (b && !prevDpad.b) {
      const activeClose = /** @type {HTMLElement|null} */ (scope.querySelector('.cr-overlay-back, .esc-btn--resume, [data-action="back"], [data-gamepad-keyboard-action="cancel"]'));
      const isPauseResume = scope instanceof HTMLElement && scope.id === "esc-overlay"
        && activeClose?.classList.contains("esc-btn--resume");
      if (activeClose && isElementVisible(activeClose, { ignoreOpacity: isPauseResume })) {
        hapticMenuConfirm(gp.index);
        activeClose.click();
      } else {
        window.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape", key: "Escape", bubbles: true }));
      }
    }

    if (scope instanceof HTMLElement && scope.id === "cr-gamepad-text-entry") {
      const action = x && !prevDpad.x ? "backspace"
        : y && !prevDpad.y ? "clear"
        : start && !prevDpad.start ? "submit"
        : null;
      if (action) {
        /** @type {HTMLElement|null} */ (scope.querySelector(`[data-gamepad-keyboard-action="${action}"]`))?.click();
      }
    }
  }

  prevDpad = { up: direction === "up", down: direction === "down", left: direction === "left", right: direction === "right", a, b, x, y, start, lb, rb };
  requestAnimationFrame(updateNav);
}

function isTypingTarget(el) {
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable === true;
}

const ARROW_DIRS = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right" };
const WASD_DIRS = { KeyW: "up", KeyA: "left", KeyS: "down", KeyD: "right" };

/**
 * INPUT-KB-1 / MENU-ARROW-1: keyboard menu movement uses the same spatial ring
 * as the gamepad D-pad. Arrows always move focus, including out of a text
 * field (the room-code box used to trap them). WASD move focus only when the
 * player is not typing — a code like OATS3 or MILK2 must still type (FRIENDS-JOIN-1).
 * @param {KeyboardEvent} e
 */
function onKeyboardNav(e) {
  if (!_navActive) return;
  const typing = isTypingTarget(document.activeElement);
  const dir = ARROW_DIRS[e.code] || (!typing ? WASD_DIRS[e.code] : undefined);
  if (!dir) return;

  const scope = getNavScope();
  if (scope !== lastScope) {
    navIndex = 0;
    lastScope = scope;
  }
  const focusables = getFocusables(scope);
  if (focusables.length === 0) return;

  const activeEl = /** @type {HTMLElement|null} */ (document.activeElement);
  const focusInScope = !!activeEl && focusables.includes(activeEl);

  // * A focused slider already handles real arrow keys itself (unlike the gamepad
  // * path, which synthesizes a keydown). Range inputs have no role, so match
  // * them the same way the pad poll does — otherwise that synthetic ArrowLeft
  // * would also leave the track.
  const activeIsSlider = activeEl?.getAttribute?.("role") === "slider"
    || (activeEl instanceof HTMLInputElement && activeEl.type === "range");
  if (focusInScope && activeIsSlider && (dir === "left" || dir === "right")) {
    return;
  }

  e.preventDefault();
  setInputMode("keyboard");

  if (!focusInScope) {
    // * Same restore-first rule as the gamepad idle path: a rebuild killed the
    // * focused node, so seed the ring back to it (consuming this press) before
    // * falling back to the generic seed-from-navIndex.
    const restored = restoreDeadFocusRing(focusables);
    if (restored) {
      setFocus(restored, focusables);
      return;
    }
    // * Mirrors the gamepad "first press seeds focus, doesn't navigate yet" behavior.
    setFocus(focusables[navIndex] || focusables[0], focusables);
    return;
  }
  navigateSpatial(dir, focusables);
}

let _keydownNavInstalled = false;

export function startGamepadUiNav() {
  requestAnimationFrame(updateNav);
  if (!_keydownNavInstalled) {
    _keydownNavInstalled = true;
    window.addEventListener("keydown", onKeyboardNav, { passive: false });
  }
}

export function setGamepadNavActive(active) {
  const next = !!active;
  // * gameBoot onFrame calls setGamepadUiActive(true) every lobby/pause frame.
  // * Resetting hold on a no-op "still on" made every tick an initial move, so
  // * the ring toured at frame rate and wrapped to COPY.
  if (_navActive === next) return;
  _navActive = next;
  resetDirectionRepeat();
  if (!next) {
    document.querySelectorAll('.gamepad-focused').forEach(el => el.classList.remove('gamepad-focused'));
    lastFocusedEl = null;
    lastFocusedRow = null;
  }
}

/** Keep gameplay-input suppression and menu navigation on the same UI transition. */
export function setGamepadUiActive(active) {
  setUiMode(active);
  setGamepadNavActive(active);
}

/** Test-only: undoes {@link startGamepadUiNav}'s keydown listener so resetModules-based
 * tests don't leak a stale-closure handler onto the shared happy-dom window. */
export function __teardownGamepadUiNavForTest() {
  window.removeEventListener("keydown", onKeyboardNav);
  _keydownNavInstalled = false;
}

