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

// * The desktop menu has two separate jobs: choose a mode on the left, then
// * configure that mode on the right. A geometric search across both columns
// * made the controller route depend on viewport shape. Keep those jobs as
// * explicit panels instead. Text entry is intentionally not here yet: its
// * controller keyboard belongs to GAMEPAD-TEXT-ENTRY-1, and native inputs must
// * not be focused by a pad before that exists.
const MAIN_MENU_GROUPS = Object.freeze([
  Object.freeze({ id: "commands", selector: "#cr-commandlist .cr-cmd" }),
  Object.freeze({ id: "setup", selector: "#cr-context-arena .cr-arena-page, #cr-diff-row .cr-diff-btn" }),
]);
let mainMenuGroupIndex = 0;

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
 * Returns only visible main-menu panels. `#cr-context-arena` and the difficulty
 * row are mode-dependent, so the setup panel disappears cleanly for Quickplay
 * and the other menu commands.
 * @returns {Array<{ id: string, focusables: HTMLElement[] }>}
 */
function getMainMenuGroups() {
  return MAIN_MENU_GROUPS
    .map((group) => ({
      id: group.id,
      focusables: /** @type {HTMLElement[]} */ (Array.from(document.querySelectorAll(group.selector)))
        .filter((el) => isElementVisible(/** @type {HTMLElement} */ (el))),
    }))
    .filter((group) => group.focusables.length > 0);
}

/** @param {Array<{ id: string, focusables: HTMLElement[] }>} groups */
function syncMainMenuGroupToFocus(groups) {
  const active = /** @type {HTMLElement|null} */ (document.activeElement);
  const focusedIndex = groups.findIndex((group) => !!active && group.focusables.includes(active));
  if (focusedIndex >= 0) mainMenuGroupIndex = focusedIndex;
  if (mainMenuGroupIndex >= groups.length) mainMenuGroupIndex = 0;
}

/**
 * Main-menu controller navigation owns an authored panel at a time. Overlay
 * navigation remains a local spatial ring, and keyboard arrows retain their
 * existing all-control path.
 * @param {HTMLElement|Document} scope
 * @returns {HTMLElement[]}
 */
function getGamepadFocusables(scope) {
  if (scope !== document) return getFocusables(scope);
  const groups = getMainMenuGroups();
  if (groups.length === 0) return getFocusables(scope);
  syncMainMenuGroupToFocus(groups);
  return groups[mainMenuGroupIndex].focusables;
}

/**
 * @param {-1|1} delta
 * @param {number} gamepadIndex
 * @param {number} now
 * @returns {boolean} True when a panel switch occurred.
 */
function switchMainMenuGroup(delta, gamepadIndex, now) {
  const groups = getMainMenuGroups();
  if (groups.length < 2) return false;
  syncMainMenuGroupToFocus(groups);
  mainMenuGroupIndex = (mainMenuGroupIndex + delta + groups.length) % groups.length;
  const next = groups[mainMenuGroupIndex].focusables;
  setFocus(next[0], next, gamepadIndex, now);
  return true;
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
  // * Standard Gamepad: buttons[4]/[5] = LB / RB. Unused in-match (boost/hop are
  // * triggers + face). Menu hint advertises them for arena paging (ARENA-BUMPER-HINT-1).
  const lb = isPressed(4);
  const rb = isPressed(5);

  if (direction || a || b || lb || rb) {
    setInputMode("gamepad");
  }

  const scope = getNavScope();
  if (scope !== lastScope) {
    // * Layer changed (overlay opened/closed): navIndex from the old list is
    // * meaningless in the new one. Overlays focus their primary button on
    // * open, so the adopt branch below re-derives the right index.
    navIndex = 0;
    mainMenuGroupIndex = 0;
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

  // * Main-menu panels replace the old global arena bumper shortcut. A player
  // * can now reach the live arena/difficulty controls from any mode without a
  // * geometry-dependent jump. Overlays never receive this switch, so their
  // * bumper presses cannot move focus behind the topmost layer.
  if (scope === document && !isTypingTarget(document.activeElement)) {
    if (lb && !prevDpad.lb) switchMainMenuGroup(-1, gp.index, now);
    if (rb && !prevDpad.rb) switchMainMenuGroup(1, gp.index, now);
  }

  const focusables = getGamepadFocusables(scope);
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

  prevDpad = { up: direction === "up", down: direction === "down", left: direction === "left", right: direction === "right", a, b, lb, rb };
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
  resetDirectionRepeat();
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

