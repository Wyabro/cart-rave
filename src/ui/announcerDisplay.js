// announcerDisplay.js — visual presenter for "The Store PA" announcer callouts.
// Module-singleton pattern (mirrors hud.js / pauseOverlay.js): initAnnouncerDisplay()
// builds the DOM once (idempotent) and returns a presenter object matching the
// AnnouncerPresenter contract from announcerManager.js. Wired up in main.js via
// setAnnouncerPresenter(initAnnouncerDisplay()).
//
// Callouts claim the HUD's Center Stage event slot (centerStage.js) so they
// never stack on top of challenge/unlock toasts — announcer wins (priority 3),
// preempting any active toast; announcer-vs-announcer arbitration stays in
// announcerManager.js (replaceSameKind).

import "./styles/announcer.css";
import { claimStage, STAGE_PRIORITY } from "./centerStage.js";

/**
 * @typedef {object} AnnouncerCalloutPayload
 * @property {string} eventId
 * @property {string} kicker
 * @property {string | null} text
 * @property {string} accent CSS color.
 * @property {number} holdMs
 * @property {string} [cls]
 * @property {boolean} [focus] Feature-size directive callout — renders full-size via
 *   announcer.css [data-focus]; regular callouts display 25% smaller.
 */

const ROOT_ID = "announcer-display";

/** Entrance duration (ms) — slapped on from camera: shrink-to-fit, hard stop. */
const ENTER_MS = 160;
/** Exit duration (ms) — yanked off, not sighed away. */
const EXIT_MS = 160;
/** Fallback hold duration when a payload omits/malforms holdMs. */
const DEFAULT_HOLD_MS = 1400;
/** Delay before writing the live region so identical back-to-back callouts still get announced. */
const LIVE_REGION_DELAY_MS = 30;

/** @type {Record<string, HTMLElement | null>} */
const elements = {
  root: null,
  live: null,
  callout: null,
  inner: null,
  kicker: null,
  text: null,
};

/** @type {ReturnType<typeof setTimeout> | null} */
let _holdTimer = null;
/** @type {ReturnType<typeof setTimeout> | null} */
let _liveResetTimer = null;
/** @type {Animation[]} */
let _activeAnimations = [];

/** @returns {boolean} */
function prefersReducedMotion() {
  try {
    return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
  } catch {
    return false;
  }
}

/**
 * Cancels any in-flight entrance/exit animation and the pending hold timer.
 * Does NOT touch the aria-live region — screen readers need time to read it.
 * @returns {void}
 */
function clearScheduled() {
  if (_holdTimer) {
    clearTimeout(_holdTimer);
    _holdTimer = null;
  }
  for (const anim of _activeAnimations) {
    try {
      anim.cancel();
    } catch {
      // Animation may already be finished.
    }
  }
  _activeAnimations = [];
}

/**
 * Updates the visually-hidden aria-live region. Clears first so two identical
 * consecutive announcements are still picked up by assistive tech.
 * @param {string} kickerText
 * @param {string} mainText
 * @returns {void}
 */
function updateLiveRegion(kickerText, mainText) {
  if (!elements.live) return;
  const combined = [kickerText, mainText].filter(Boolean).join(" — ");
  if (_liveResetTimer) {
    clearTimeout(_liveResetTimer);
    _liveResetTimer = null;
  }
  elements.live.textContent = "";
  _liveResetTimer = setTimeout(() => {
    _liveResetTimer = null;
    if (elements.live) elements.live.textContent = combined;
  }, LIVE_REGION_DELAY_MS);
}

/**
 * Plays the punchy scale-in entrance on the inner (animated) wrapper.
 * Reduced motion: sets opacity directly and lets the CSS transition (see
 * announcer.css) handle a simple fade instead.
 * @param {HTMLElement} el
 * @param {boolean} reduced
 * @returns {Animation | null}
 */
function playEnter(el, reduced) {
  if (reduced) {
    el.style.opacity = "1";
    return null;
  }
  // * From camera, not from floor: arrive big, land on an undershoot squash,
  // * settle. Overshoot is authored in the keyframes, so the curve hard-stops.
  return el.animate(
    [
      { opacity: 0, transform: "scale(1.45)" },
      { opacity: 1, transform: "scale(0.96)", offset: 0.5 },
      { opacity: 1, transform: "scale(1)" },
    ],
    { duration: ENTER_MS, easing: "cubic-bezier(0.1, 0.9, 0.2, 1)", fill: "forwards" },
  );
}

/**
 * Plays the fast fade/slide-out exit on the inner (animated) wrapper.
 * @param {HTMLElement} el
 * @param {boolean} reduced
 * @param {() => void} onDone
 * @returns {Animation | null}
 */
function playExit(el, reduced, onDone) {
  if (reduced) {
    el.style.opacity = "0";
    onDone();
    return null;
  }
  const anim = el.animate(
    [
      { opacity: 1, transform: "scale(1) translateY(0)" },
      { opacity: 0, transform: "scale(0.9) translateY(-16px)" },
    ],
    { duration: EXIT_MS, easing: "cubic-bezier(0.55, 0, 1, 0.45)", fill: "forwards" },
  );
  anim.onfinish = () => onDone();
  return anim;
}

/**
 * Claims the Center Stage event slot, then plays the full
 * entrance -> hold -> exit cycle. Same-kind requests replace the current
 * callout immediately (the announcer manager already arbitrated them).
 * @param {AnnouncerCalloutPayload} payload
 * @returns {void}
 */
function showCallout(payload) {
  if (!elements.root || !elements.inner || !elements.kicker || !elements.text) return;
  const claimHoldMs = Number.isFinite(payload?.holdMs) ? Math.max(0, payload.holdMs) : DEFAULT_HOLD_MS;
  claimStage({
    kind: "announcer",
    priority: STAGE_PRIORITY.ANNOUNCER,
    durationMs: claimHoldMs,
    replaceSameKind: true,
    show: () => presentCallout(payload),
    hide: hideCallout,
  });
}

/**
 * Renders the callout DOM and runs its animation cycle — only ever called by
 * the Center Stage grant.
 * @param {AnnouncerCalloutPayload} payload
 * @returns {void}
 */
function presentCallout(payload) {
  if (!elements.root || !elements.inner || !elements.kicker || !elements.text) return;
  clearScheduled();

  const accent = payload?.accent || "#22e6ff";
  const kickerText = payload?.kicker || "";
  const mainText = payload?.text || "";

  elements.root.style.setProperty("--callout-accent", accent);
  elements.kicker.textContent = kickerText;
  elements.text.textContent = mainText;
  elements.text.classList.toggle("announcer-text--empty", !mainText);
  if (elements.callout) {
    if (payload?.eventId) elements.callout.dataset.event = payload.eventId;
    else delete elements.callout.dataset.event;
    // * Feature-size flag — directives keep the big lettering; everything else
    // * renders 25% smaller (announcer.css sizes on [data-focus]).
    if (payload?.focus) elements.callout.dataset.focus = "true";
    else delete elements.callout.dataset.focus;
  }

  updateLiveRegion(kickerText, mainText);

  const reduced = prefersReducedMotion();
  elements.inner.style.opacity = "0";

  const enterAnim = playEnter(elements.inner, reduced);
  if (enterAnim) _activeAnimations.push(enterAnim);

  // * Critical-class events get a one-flick chromatic edge on entry. Animated
  // * as a container filter — the kicker/text children declare their own
  // * text-shadows, which would override an inherited textShadow keyframe.
  if (!reduced && payload?.cls === "critical" && typeof elements.inner.animate === "function") {
    _activeAnimations.push(elements.inner.animate(
      [
        { filter: "drop-shadow(-3px 0 0 #22e6ff) drop-shadow(3px 0 0 #ff2bd6)" },
        { filter: "none" },
      ],
      { duration: 140, easing: "steps(2, end)" },
    ));
  }

  const holdMs = Number.isFinite(payload?.holdMs) ? Math.max(0, payload.holdMs) : DEFAULT_HOLD_MS;
  const exitDelay = Math.max(0, holdMs - EXIT_MS);

  _holdTimer = setTimeout(() => {
    _holdTimer = null;
    if (!elements.inner) return;
    const exitAnim = playExit(elements.inner, reduced, () => {
      if (elements.inner) elements.inner.style.opacity = "0";
    });
    if (exitAnim) _activeAnimations.push(exitAnim);
  }, exitDelay);
}

/**
 * Immediately hides the current callout (used on interrupt / hard stop).
 * Cancels pending timers/animations but leaves the aria-live region alone.
 * @returns {void}
 */
function hideCallout() {
  if (!elements.root) return;
  clearScheduled();
  if (elements.inner) elements.inner.style.opacity = "0";
  if (elements.callout) {
    delete elements.callout.dataset.event;
    delete elements.callout.dataset.focus;
  }
}

/**
 * Builds the announcer overlay DOM and appends it to document.body.
 * @returns {void}
 */
function buildDom() {
  const root = document.createElement("div");
  root.id = ROOT_ID;

  const live = document.createElement("div");
  live.className = "announcer-live";
  live.setAttribute("aria-live", "polite");
  live.setAttribute("aria-atomic", "true");
  root.appendChild(live);

  const callout = document.createElement("div");
  callout.className = "announcer-callout";
  callout.setAttribute("aria-hidden", "true");

  const inner = document.createElement("div");
  inner.className = "announcer-callout-inner";
  inner.style.opacity = "0";

  const kicker = document.createElement("div");
  kicker.className = "announcer-kicker";

  const text = document.createElement("div");
  text.className = "announcer-text";

  inner.appendChild(kicker);
  inner.appendChild(text);
  callout.appendChild(inner);
  root.appendChild(callout);

  document.body.appendChild(root);

  elements.root = root;
  elements.live = live;
  elements.callout = callout;
  elements.inner = inner;
  elements.kicker = kicker;
  elements.text = text;
}

/**
 * Initializes the announcer display. Safe to call more than once — removes
 * any existing instance first (mirrors hud.js's #hud teardown-and-rebuild).
 * @returns {{ showCallout: (payload: AnnouncerCalloutPayload) => void, hideCallout: () => void }}
 */
export function initAnnouncerDisplay() {
  destroyAnnouncerDisplay();
  buildDom();
  return { showCallout, hideCallout };
}

/**
 * Tears down the announcer display: removes its DOM and clears all pending
 * timers/animations (including the live-region write timer). Runs before every
 * (re-)build in initAnnouncerDisplay().
 * @returns {void}
 */
function destroyAnnouncerDisplay() {
  clearScheduled();
  if (_liveResetTimer) {
    clearTimeout(_liveResetTimer);
    _liveResetTimer = null;
  }
  const existing = document.getElementById(ROOT_ID);
  if (existing) existing.remove();
  elements.root = null;
  elements.live = null;
  elements.callout = null;
  elements.inner = null;
  elements.kicker = null;
  elements.text = null;
}
