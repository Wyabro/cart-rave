import { getActiveGamepad, setInputMode } from "../input.js";
import { hapticMenuConfirm, hapticMenuFocus } from "../haptics.js";

let _navActive = true;
let navIndex = 0;
let prevDpad = {
  up: false, down: false, left: false, right: false, a: false, b: false, lb: false, rb: false,
};

// * The last node the ring actually focused, plus the radiogroup row it lived
// * in. The row survives a chip rebuild (innerHTML replaces its children), which
// * is what lets restoreDeadFocusRing find the new active chip after selection.
let lastFocusedEl = /** @type {HTMLElement|null} */ (null);
let lastFocusedRow = /** @type {HTMLElement|null} */ (null);

// * Overlay containers that scope gamepad nav while open, topmost z-order
// * first (esc 26000 > results 25000 > menu screens 1002 > 1001). They all
// * share the same open contract — inline style.display === "flex" — the
// * check closeActiveOverlay() in cart-rave-menu.js also relies on. Keep this
// * list in sync when adding an overlay, or a pad will reach buttons under it.
const OVERLAY_SCOPE_SELECTORS = [
  "#esc-overlay",
  "#results-overlay",
  "#cr-howto-screen",
  "#cr-challenges-screen",
  "#cr-settings-screen",
  "#cr-customize-screen",
];

let lastScope = /** @type {HTMLElement|Document|null} */ (null);

/**
 * The container gamepad nav may reach: the topmost open overlay, or the
 * whole document when none is open (main menu / HUD).
 * @returns {HTMLElement|Document}
 */
function getNavScope() {
  for (const sel of OVERLAY_SCOPE_SELECTORS) {
    const el = /** @type {HTMLElement|null} */ (document.querySelector(sel));
    if (el && el.style.display === "flex") return el;
  }
  return document;
}

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

/**
 * Whether a control belongs in the pad/keyboard nav ring. Text-typing controls
 * are out — a pad cannot type into them, and the W/S command list already skips
 * the whole `#cr-join` row (it is deliberately not `.cr-cmd`). Without this the
 * FRIENDS ↓ fall would land on the room-code field / GO button and the ring
 * would disagree with the yellow command selection. Range sliders stay in so
 * d-pad left/right can nudge them like the role="slider" tracks.
 * @param {HTMLElement} el
 */
function isNavReachable(el) {
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
  return elements.filter((el) => isElementVisible(el) && isNavReachable(el));
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

function setFocus(targetEl, focusables, gamepadIndex = undefined) {
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
  if (gamepadIndex != null) hapticMenuFocus(gamepadIndex);
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

function navigateSpatial(dir, focusables, gamepadIndex = undefined) {
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
    setFocus(bestCand, focusables, gamepadIndex);
  } else {
    // Spatial search found no candidate in that direction -> fall back to linear 1D wrap
    const curIdx = focusables.indexOf(currentEl);
    const delta = (dir === "down" || dir === "right") ? 1 : -1;
    const nextIdx = (curIdx + delta + focusables.length) % focusables.length;
    setFocus(focusables[nextIdx], focusables, gamepadIndex);
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
  // * Standard Gamepad: buttons[4]/[5] = LB / RB. Unused in-match (boost/hop are
  // * triggers + face). Menu hint advertises them for arena paging (ARENA-BUMPER-HINT-1).
  const lb = isPressed(4);
  const rb = isPressed(5);

  if (up || down || left || right || a || b || lb || rb) {
    setInputMode("gamepad");
  }

  const scope = getNavScope();
  if (scope !== lastScope) {
    // * Layer changed (overlay opened/closed): navIndex from the old list is
    // * meaningless in the new one. Overlays focus their primary button on
    // * open, so the adopt branch below re-derives the right index.
    navIndex = 0;
    lastScope = scope;
  }

  // * ARENA-BUMPER-HINT-1: LB/RB → arena pager (same handlers as mouse/keyboard).
  // * Document scope only (overlays must not page the menu behind them). Visibility
  // * via isElementVisible beats attribute-only checks — matches real CSS [hidden]
  // * + author display rules. pointerdown/up before click matches A-button squash.
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
    const activeEl = /** @type {HTMLElement|null} */ (document.activeElement);
    const focusInScope = !!activeEl && focusables.includes(activeEl);
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
        setFocus(restored, focusables, gp.index);
      } else if (
        (up && !prevDpad.up) || (down && !prevDpad.down) ||
        (left && !prevDpad.left) || (right && !prevDpad.right) ||
        (a && !prevDpad.a)
      ) {
        // * Focus lives outside the nav set (name input mid-edit, or nothing).
        // * Reclaim it only on an actual press — re-seizing every idle frame
        // * stole focus while a pad sat connected. The press is consumed as the
        // * reveal; navigation/confirm start from the next press.
        setFocus(focusables[navIndex] || focusables[0], focusables, gp.index);
      }
    }

    if (focusInScope && activeEl) {
      // * A focused slider claims left/right for value adjustment; up/down still
      // * navigate away from it to the next control. Range inputs behave the
      // * same way — the customize hue slider is a bare input[type=range] with
      // * no role, so treat both by the same rule.
      const activeIsSlider = activeEl.getAttribute?.("role") === "slider"
        || (activeEl instanceof HTMLInputElement && activeEl.type === "range");

      if (up && !prevDpad.up) navigateSpatial("up", focusables, gp.index);
      if (down && !prevDpad.down) navigateSpatial("down", focusables, gp.index);
      if (left && !prevDpad.left) {
        if (activeIsSlider) nudgeSlider(activeEl, "ArrowLeft");
        else navigateSpatial("left", focusables, gp.index);
      }
      if (right && !prevDpad.right) {
        if (activeIsSlider) nudgeSlider(activeEl, "ArrowRight");
        else navigateSpatial("right", focusables, gp.index);
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
          el.click();
        }
      }
    }

    // * Back is focus-independent, but must respect the active layer: query
    // * within scope and skip hidden matches (document scope would otherwise
    // * click an invisible overlay back button).
    if (b && !prevDpad.b) {
      const activeClose = /** @type {HTMLElement|null} */ (scope.querySelector('.cr-overlay-back, .esc-btn--resume, [data-action="back"]'));
      if (activeClose && isElementVisible(activeClose)) {
        hapticMenuConfirm(gp.index);
        activeClose.click();
      } else {
        window.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape", key: "Escape", bubbles: true }));
      }
    }
  }

  prevDpad = { up, down, left, right, a, b, lb, rb };
  requestAnimationFrame(updateNav);
}

function isTypingTarget(el) {
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable === true;
}

const ARROW_DIRS = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right" };

/**
 * INPUT-KB-1: keyboard had no menu/overlay navigation at all beyond native Tab order (no
 * arrow-key movement, unlike the gamepad's full D-pad/stick spatial nav below). Reuses the
 * exact same scope/focus/spatial-nav engine as the gamepad poll loop, gated on the same
 * `_navActive` flag main.js already drives from `isUiActive` — so arrow keys navigate
 * menus while a menu is open and steer the cart otherwise, exactly like the gamepad split.
 * @param {KeyboardEvent} e
 */
function onKeyboardNav(e) {
  if (!_navActive) return;
  const dir = ARROW_DIRS[e.code];
  if (!dir) return;
  if (isTypingTarget(document.activeElement)) return;

  const scope = getNavScope();
  if (scope !== lastScope) {
    navIndex = 0;
    lastScope = scope;
  }
  const focusables = getFocusables(scope);
  if (focusables.length === 0) return;

  const activeEl = /** @type {HTMLElement|null} */ (document.activeElement);
  const focusInScope = !!activeEl && focusables.includes(activeEl);

  // * A focused slider already handles real arrow keys itself (unlike the gamepad path,
  // * which must synthesize a keydown since a pad has no native key semantics) — leave it
  // * alone rather than risk double-stepping its value.
  if (focusInScope && activeEl?.getAttribute?.("role") === "slider" && (dir === "left" || dir === "right")) {
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
  _navActive = active;
  if (!active) {
    document.querySelectorAll('.gamepad-focused').forEach(el => el.classList.remove('gamepad-focused'));
    lastFocusedEl = null;
    lastFocusedRow = null;
  }
}

/** Test-only: undoes {@link startGamepadUiNav}'s keydown listener so resetModules-based
 * tests don't leak a stale-closure handler onto the shared happy-dom window. */
export function __teardownGamepadUiNavForTest() {
  window.removeEventListener("keydown", onKeyboardNav);
  _keydownNavInstalled = false;
}

