import "./styles/tokens.css";
import "./styles/pauseOverlay.css";
import {
  animateMenuCardEnter,
  animateMenuDismiss,
  animateMenuReveal,
  animateMuteToggle,
  animateTogglePop,
  animateVolumeTick,
  cancelAnimationsIn,
  fadeIn,
  wireButtonPressFeedback,
} from "../animations.js";
import { getQualityTier } from "../utils/qualityMode.js";
import { clamp, clampInt } from "../utils.js";
import { settingsStore } from "../stores/settingsStore.js";
import { getInputMode, onInputModeChange } from "../input.js";
import { svgIcon } from "./icons.js";
import { menuReturnHref } from "../utils/captureUpload.js";


/** Cancels in-flight Esc overlay entrance animations when reopening or closing. */
let escEntranceToken = 0;

/** @type {Record<string, any>} */
let _options = {};
/** @type {Record<string, any>} */
let _hudContext = {};

/** @type {(() => void) | null} Unsubscribes the CONTROLS-card input-mode subscription on re-init. */
let _unsubscribeInputMode = null;

/** @type {Record<string, any>} */
const elements = {
  escOverlay: null,
  escBackdrop: null,
  escPanel: null,
  escTitle: null,
  escContext: null,
  escSections: [],
  resumeBtn: null,
  restartBtn: null,
  quitBtn: null,
  postFxBtn: null,
  lowQualityBtn: null,
  escMuteBtn: null,
  escMusicVol: null,
  escSfxVol: null,
  escVoiceVol: null,
  announcerVoiceBtn: null,
  announcerCalloutsBtn: null,
};

/**
 * Shows RESTART only in single-player (solo / test-drive), where it's a clean
 * local re-entry. Resolved per-open because the game mode isn't known when the
 * overlay is built at startup.
 */
function syncRestartVisibility() {
  if (!elements.restartBtn) return;
  const mode = _options.detectGameMode ? _options.detectGameMode() : "";
  const solo = mode === "solo" || mode === "testdrive";
  // * Hide the flex slot (not only the button) so an empty cell doesn't hold
  // * space when RESTART is solo-only.
  const slot = elements.restartBtn.closest?.(".esc-action-slot");
  const target = slot || elements.restartBtn;
  target.style.display = solo ? "" : "none";
}

/**
 * Fills the sub-title context line with the live round + clock.
 *
 * Read straight off the HUD timer's own DOM rather than re-deriving from the
 * round store — the HUD is suppressed (not destroyed) while paused, so its
 * last painted "RD n" / ":37" is exactly the frozen state the player left, and
 * the round-duration source stays single-sourced in hud.js.
 */
function syncPauseContext() {
  if (!elements.escContext) return;
  const rd = document.querySelector(".hud-timer-rd")?.textContent?.trim() || "";
  const clock = document.querySelector(".hud-timer-num")?.textContent?.trim() || "";
  // * HUD renders sub-minute time as ":37" and longer as "1:23".
  const clockText = clock.startsWith(":") ? `${clock.slice(1)}S LEFT` : `${clock} LEFT`;
  const parts = [rd, clock ? clockText : ""].filter(Boolean);
  elements.escContext.textContent = parts.length ? parts.join(" · ") : "MATCH HELD";
}

/**
 * Syncs the quality cycle button label to the active (or pending) tier.
 * Module-scope so show() can re-sync after auto-quality step-downs.
 * @param {string} [tierOverride]
 */
function syncQualityTierButtonState(tierOverride) {
  if (!elements.lowQualityBtn) return;
  const tier = tierOverride ?? (_options.getQualityTier ? _options.getQualityTier() : getQualityTier());
  elements.lowQualityBtn.textContent = `QUALITY: ${tier.toUpperCase()}`;
  elements.lowQualityBtn.classList.toggle("esc-btn--lq-on", tier === "low");
}

/**
 * Builds a pointer-friendly volume slider row for the Esc overlay.
 * @param {string} labelText
 * @param {(gain: number) => void} onChange
 * @param {string} ariaLabel
 * @param {string} [variant] Row modifier ("music" / "sfx" / "voice") — drives the accent.
 */
function createEscVolumeRow(labelText, onChange, ariaLabel, variant = "") {
  const row = document.createElement("div");
  row.className = variant ? `esc-vol-row esc-vol-row--${variant}` : "esc-vol-row";

  const label = document.createElement("span");
  label.className = "esc-vol-label";
  label.textContent = labelText;

  const trackWrap = document.createElement("div");
  trackWrap.className = "esc-vol-track-wrap";
  trackWrap.setAttribute("role", "slider");
  trackWrap.setAttribute("aria-label", ariaLabel);
  trackWrap.setAttribute("aria-valuemin", "0");
  trackWrap.setAttribute("aria-valuemax", "100");
  trackWrap.tabIndex = 0;

  const track = document.createElement("div");
  track.className = "esc-vol-track";
  const fill = document.createElement("div");
  fill.className = "esc-vol-fill";
  track.appendChild(fill);
  trackWrap.appendChild(track);

  const val = document.createElement("span");
  val.className = "esc-vol-val";

  const setPct = (pct, muted = false) => {
    const clamped = clampInt(pct, 0, 100);
    fill.style.width = `${clamped}%`;
    trackWrap.style.setProperty("--esc-vol-thumb", `${clamped}%`);
    trackWrap.setAttribute("aria-valuenow", String(clamped));
    val.textContent = muted ? "OFF" : String(clamped);
  };

  const applyClientX = (clientX) => {
    const rect = track.getBoundingClientRect();
    const x = clamp((clientX - rect.left) / Math.max(1, rect.width), 0, 1);
    const pct = Math.round(x * 100);
    const valueMax = _options.getAudioVolumeMax ? _options.getAudioVolumeMax() : 1.15;
    setPct(pct);
    onChange(clamp((pct / 100) * valueMax, 0, valueMax));
    animateVolumeTick(val);
    const isMuted = _options.getIsMuted ? _options.getIsMuted() : false;
    const musicGain = _options.getMusicGain ? _options.getMusicGain() : 0.5;
    const sfxVolume = _options.getSfxVolume ? _options.getSfxVolume() : 0.5;
    const voiceVolume = _options.getVoiceVolume ? _options.getVoiceVolume() : 0.5;
    updateAudioState(isMuted, musicGain, sfxVolume, voiceVolume, valueMax);
  };

  trackWrap.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    trackWrap.setPointerCapture(e.pointerId);
    applyClientX(e.clientX);
  });
  trackWrap.addEventListener("pointermove", (e) => {
    if (!trackWrap.hasPointerCapture(e.pointerId)) return;
    e.preventDefault();
    applyClientX(e.clientX);
  });
  const releasePointer = (e) => {
    if (!trackWrap.hasPointerCapture(e.pointerId)) return;
    try {
      trackWrap.releasePointerCapture(e.pointerId);
    } catch {
      // Pointer may already be released.
    }
  };
  trackWrap.addEventListener("pointerup", releasePointer);
  trackWrap.addEventListener("pointercancel", releasePointer);

  // * Keyboard + controller reach: arrows/Home/End nudge the value. Gamepad nav
  // * dispatches these same ArrowLeft/Right keys when a slider is focused, so this
  // * one handler covers keyboard a11y and d-pad adjustment.
  const nudgeByPct = (deltaPct) => {
    const current = parseInt(trackWrap.getAttribute("aria-valuenow") || "0", 10);
    const next = clampInt(current + deltaPct, 0, 100);
    const valueMax = _options.getAudioVolumeMax ? _options.getAudioVolumeMax() : 1.15;
    setPct(next);
    onChange(clamp((next / 100) * valueMax, 0, valueMax));
    animateVolumeTick(val);
    const isMuted = _options.getIsMuted ? _options.getIsMuted() : false;
    const musicGain = _options.getMusicGain ? _options.getMusicGain() : 0.5;
    const sfxVolume = _options.getSfxVolume ? _options.getSfxVolume() : 0.5;
    const voiceVolume = _options.getVoiceVolume ? _options.getVoiceVolume() : 0.5;
    updateAudioState(isMuted, musicGain, sfxVolume, voiceVolume, valueMax);
  };
  trackWrap.addEventListener("keydown", (e) => {
    let delta = 0;
    if (e.key === "ArrowRight" || e.key === "ArrowUp") delta = 5;
    else if (e.key === "ArrowLeft" || e.key === "ArrowDown") delta = -5;
    else if (e.key === "Home") delta = -100;
    else if (e.key === "End") delta = 100;
    else return;
    e.preventDefault();
    nudgeByPct(delta);
  });

  row.appendChild(label);
  row.appendChild(trackWrap);
  row.appendChild(val);

  return { row, trackWrap, fill, val, setPct };
}

/**
 * Snappy Anime.js press feedback for Esc overlay action buttons.
 * @param {HTMLElement} btn
 */
function wireEscButtonFeedback(btn) {
  wireButtonPressFeedback(btn, { scale: 0.96 });
}

/**
 * Press feedback animates the INNER node of a skewed slab: anime.js writes
 * `transform` inline, which would wipe the outer skewX() for the duration of
 * the press and snap the parallelogram flat (the 7a bug, `0d20900`).
 * @param {HTMLElement} btn
 * @returns {HTMLElement}
 */
function escPressTarget(btn) {
  return /** @type {HTMLElement} */ (btn.querySelector(".esc-btn-inner") || btn);
}

/**
 * Builds one bottom-row action slab — outer owns the skew, inner is the press
 * target, label counter-skews. Same three-layer split as the menu sub-screens.
 * @param {string} label
 * @param {string} variantClasses
 * @returns {HTMLButtonElement}
 */
function makeEscActionButton(label, variantClasses) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = `esc-btn cc-btn ${variantClasses}`;
  const inner = document.createElement("span");
  inner.className = "esc-btn-inner";
  const labelEl = document.createElement("span");
  labelEl.className = "esc-btn-label";
  labelEl.textContent = label;
  inner.appendChild(labelEl);
  btn.appendChild(inner);
  wireButtonPressFeedback(btn, { scale: 0.96, getTarget: escPressTarget });
  return btn;
}

/**
 * Stable flex cell for one action slab. Lift/skew live on the button inside so
 * hovering one slab cannot tug its row-mates (slot geometry never transforms).
 * @param {HTMLButtonElement} btn
 * @param {{ resume?: boolean }} [opts]
 * @returns {HTMLDivElement}
 */
function wrapEscActionSlot(btn, opts = {}) {
  const slot = document.createElement("div");
  slot.className = opts.resume ? "esc-action-slot esc-action-slot--resume" : "esc-action-slot";
  slot.appendChild(btn);
  return slot;
}

/**
 * Builds a labeled Esc overlay section card with a dashed header divider.
 * @param {string} label
 * @param {string} [tag]
 * @returns {{ section: HTMLElement, hd: HTMLElement, body: HTMLElement }}
 */
function createEscSection(label, tag = "") {
  const section = document.createElement("section");
  section.className = "esc-section";

  const hd = document.createElement("header");
  hd.className = "esc-section-hd";

  const labelEl = document.createElement("span");
  labelEl.className = "esc-section-label";
  labelEl.textContent = label;
  hd.appendChild(labelEl);

  if (tag) {
    const tagEl = document.createElement("span");
    tagEl.className = "esc-section-tag";
    tagEl.textContent = tag;
    hd.appendChild(tagEl);
  }

  const body = document.createElement("div");
  body.className = "esc-section-body";

  section.appendChild(hd);
  section.appendChild(body);
  return { section, hd, body };
}

/**
 * Builds a controls reference row with keycaps and a label.
 *
 * Mirrors the SETTINGS controls chart (`.cr-settings-ctl-*`, 7c) exactly: the
 * same key splits, the same all-caps labels, and a per-action accent on the
 * lettering. The accent comes from a row modifier in CSS rather than an inline
 * `--kc` like Settings uses, because Settings tints from the live arena palette
 * in the menu module's closure, which this module can't reach.
 * @param {string|string[]} keys
 * @param {string} labelText
 * @param {boolean} [wide=false]
 * @param {string} [action] Row modifier ("move"/"boost"/"hop"/"mute"/"menu").
 */
function createEscControlRow(keys, labelText, wide = false, action = "") {
  const row = document.createElement("div");
  row.className = action ? `esc-ctl-row esc-ctl-row--${action}` : "esc-ctl-row";

  const keysEl = document.createElement("span");
  keysEl.className = "esc-ctl-keys";

  const keyList = Array.isArray(keys) ? keys : [keys];
  keyList.forEach((key) => {
    const kbd = document.createElement("kbd");
    if (wide) kbd.classList.add("wide");
    kbd.textContent = key;
    keysEl.appendChild(kbd);
  });

  const label = document.createElement("span");
  label.className = "esc-ctl-lbl";
  label.textContent = labelText;

  row.appendChild(keysEl);
  row.appendChild(label);
  return row;
}

/**
 * Resets inline animation styles before replaying the entrance sequence.
 * @param {HTMLElement | null} overlay
 */
function resetEscOverlayAnimState(overlay) {
  if (!overlay) return;

  const backdrop = elements.escBackdrop;
  const panel = elements.escPanel;
  const title = elements.escTitle;

  if (backdrop) backdrop.style.opacity = "0";
  if (panel) {
    panel.style.opacity = "0";
    panel.style.transform = "translateY(18px) scale(0.96)";
  }
  if (title) title.style.opacity = "0";
  if (elements.escContext) elements.escContext.style.opacity = "0";

  for (const section of elements.escSections) {
    if (!section) continue;
    section.style.opacity = "0";
    section.style.transform = "translateY(10px)";
  }

  // * Opacity ONLY on the action slabs. They carry their skew in CSS `transform`,
  // * and anime.js writes `transform` inline — a translateY reveal here silently
  // * flattened the parallelograms and left their counter-skewed labels slanted.
  for (const btn of [elements.resumeBtn, elements.restartBtn, elements.quitBtn]) {
    if (!btn) continue;
    btn.style.opacity = "0";
  }
}

/**
 * Plays backdrop fade, panel pop, and staggered section reveals.
 */
function animateEscOverlayShow() {
  const overlay = elements.escOverlay;
  const backdrop = elements.escBackdrop;
  const panel = elements.escPanel;
  const title = elements.escTitle;
  if (!overlay || !panel) return;

  const token = ++escEntranceToken;
  cancelAnimationsIn(overlay);
  resetEscOverlayAnimState(overlay);

  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
  if (reduced) {
    if (backdrop) backdrop.style.opacity = "1";
    panel.style.opacity = "1";
    panel.style.transform = "";
    if (title) title.style.opacity = "1";
    if (elements.escContext) elements.escContext.style.opacity = "1";
    for (const section of elements.escSections) {
      if (!section) continue;
      section.style.opacity = "1";
      section.style.transform = "";
    }
    for (const btn of [elements.resumeBtn, elements.restartBtn, elements.quitBtn]) {
      if (!btn) continue;
      btn.style.opacity = "1";
    }
    return;
  }

  if (backdrop) fadeIn(backdrop, 180, { ease: "outQuad" });

  window.setTimeout(() => {
    if (token !== escEntranceToken) return;

    animateMenuCardEnter(panel, { duration: 300, y: 18, ease: "outBack(1.25)" });
    animateMenuReveal(title, { delay: 40, duration: 260, y: 10, ease: "outExpo" });
    animateMenuReveal(elements.escContext, { delay: 70, duration: 240, y: 8, ease: "outExpo" });

    // Action slabs fade in staggered — deliberately NOT animateMenuReveal, which
    // writes `transform` inline and would overwrite their CSS skew (see the
    // reset above). Nothing may animate transform on these buttons. fadeIn has
    // no delay of its own, so the stagger is a timer (token-guarded like the
    // rest of the entrance).
    [elements.resumeBtn, elements.restartBtn, elements.quitBtn].forEach((btn, i) => {
      if (!btn) return;
      window.setTimeout(() => {
        if (token !== escEntranceToken) return;
        fadeIn(btn, 240, { ease: "outQuad" });
      }, 90 + i * 35);
    });

    elements.escSections.forEach((section, i) => {
      if (!section) return;
      animateMenuReveal(section, {
        delay: 180 + i * 40,
        duration: 260,
        y: 10,
        ease: "outExpo",
      });
    });
  }, 16);
}

/**
 * Updates Post-FX button label and glow state.
 * @param {boolean} enabled
 */
function syncPostFxButtonState(enabled) {
  if (!elements.postFxBtn) return;
  elements.postFxBtn.textContent = enabled ? "POST-FX: ON" : "POST-FX: OFF";
  elements.postFxBtn.classList.toggle("esc-btn--fx-off", !enabled);
}

/**
 * Syncs Esc overlay audio controls with given volumes.
 * @param {boolean} isMuted
 * @param {number} musicGain
 * @param {number} sfxVolume
 * @param {number} [voiceVolume=0.5]
 * @param {number} [audioVolumeMax=1.15]
 */
export function updateAudioState(isMuted, musicGain, sfxVolume, voiceVolume = 0.5, audioVolumeMax = 1.15) {
  if (!elements.escMuteBtn) return;
  const musicPercent = Math.round((musicGain / audioVolumeMax) * 100);
  const sfxPercent = Math.round((sfxVolume / audioVolumeMax) * 100);
  const voicePercent = Math.round((voiceVolume / audioVolumeMax) * 100);
  const musicPct = isMuted ? 0 : musicPercent;
  const sfxPct = isMuted ? 0 : sfxPercent;
  const voicePct = isMuted ? 0 : voicePercent;

  if (elements.escMuteBtn) {
    // * Proper sticker speaker glyph (icons.js), matching the HUD mute — replaces
    // * the plain ✕/♪ text so all three mute surfaces agree.
    elements.escMuteBtn.innerHTML = svgIcon(isMuted ? "speakerMuted" : "speaker", {
      label: isMuted ? "Unmute" : "Mute",
      size: "1.1em",
    });
    elements.escMuteBtn.classList.toggle("muted", isMuted);
  }
  if (elements.escMusicVol?.setPct) {
    elements.escMusicVol.setPct(musicPct, isMuted);
  }
  if (elements.escSfxVol?.setPct) {
    elements.escSfxVol.setPct(sfxPct, isMuted);
  }
  if (elements.escVoiceVol?.setPct) {
    elements.escVoiceVol.setPct(voicePct, isMuted);
  }
}

/**
 * Opens the Esc overlay and triggers HUD suppression.
 */
export function show() {
  const menuVisible = _options.getMenuVisible ? _options.getMenuVisible() : false;
  if (menuVisible) return;
  if (elements.escOverlay) {
    escEntranceToken += 1;
    elements.escOverlay.style.display = "flex";
    elements.escOverlay.classList.add("is-open");

    if (typeof _hudContext.setHudSuppressed === "function") {
      _hudContext.setHudSuppressed(true);
    }
    const labelRenderer = typeof _hudContext.getLabelRenderer === "function"
      ? _hudContext.getLabelRenderer()
      : (_options.getLabelRenderer ? _options.getLabelRenderer() : null);
    if (labelRenderer) labelRenderer.domElement.style.display = "none";

    // * Re-sync in case the auto-quality watchdog stepped the session tier down.
    syncQualityTierButtonState();
    // * Freeze-frame the round/time the player paused on.
    syncPauseContext();
    // * Solo-only RESTART — resolve per-open (mode unknown at build time).
    syncRestartVisibility();

    const isMuted = _options.getIsMuted ? _options.getIsMuted() : false;
    const musicGain = _options.getMusicGain ? _options.getMusicGain() : 0.5;
    const sfxVolume = _options.getSfxVolume ? _options.getSfxVolume() : 0.5;
    const voiceVolume = _options.getVoiceVolume ? _options.getVoiceVolume() : 0.5;
    const audioVolumeMax = _options.getAudioVolumeMax ? _options.getAudioVolumeMax() : 1.15;
    updateAudioState(isMuted, musicGain, sfxVolume, voiceVolume, audioVolumeMax);

    syncPostFxButtonState(
      (_options.getBloomEnabled ? _options.getBloomEnabled() : true)
      && (_options.getFxPassEnabled ? _options.getFxPassEnabled() : true),
    );

    if (typeof _hudContext.updateMenuButtonVisibility === "function") {
      _hudContext.updateMenuButtonVisibility(menuVisible);
    }
    if (typeof _hudContext.scheduleHudLayoutSync === "function") {
      _hudContext.scheduleHudLayoutSync();
    }

    animateEscOverlayShow();
    if (_options.onEscOverlayChange) _options.onEscOverlayChange(true);
    if (elements.resumeBtn) elements.resumeBtn.focus();
  }
}

/**
 * Closes the Esc overlay and restores HUD and label visibility.
 */
export function hide() {
  if (!elements.escOverlay) return;
  // * Safe to call repeatedly — a fully hidden overlay is a no-op. Mid-dismiss
  // * (still display:flex) re-entry falls through to the double-close guard in
  // * animateMenuDismiss, which snaps it hidden.
  if (elements.escOverlay.style.display === "none") return;

  escEntranceToken += 1;
  elements.escOverlay.classList.remove("is-open");

  // * Gameplay unpause and HUD restore are SYNCHRONOUS — they never wait on the
  // * exit VFX; only the panel drop + backdrop fade run over the next ~180ms.
  const menuVisible = _options.getMenuVisible ? _options.getMenuVisible() : false;
  const labelRenderer = typeof _hudContext.getLabelRenderer === "function"
    ? _hudContext.getLabelRenderer()
    : (_options.getLabelRenderer ? _options.getLabelRenderer() : null);
  if (labelRenderer) labelRenderer.domElement.style.display = menuVisible ? "none" : "block";

  if (typeof _hudContext.setHudSuppressed === "function") {
    _hudContext.setHudSuppressed(false);
  }
  if (typeof _hudContext.updateMenuButtonVisibility === "function") {
    _hudContext.updateMenuButtonVisibility(menuVisible);
  }
  if (typeof _hudContext.scheduleHudLayoutSync === "function") {
    _hudContext.scheduleHudLayoutSync();
  }

  if (_options.onEscOverlayChange) _options.onEscOverlayChange(false);

  // * Animate the panel out + fade the backdrop, then flip the overlay to
  // * display:none. If show() re-adds is-open mid-exit, abort the hide.
  animateMenuDismiss(elements.escPanel, {
    container: elements.escOverlay,
    backdrop: elements.escBackdrop,
    abortIf: () => elements.escOverlay?.classList.contains("is-open") ?? false,
  });
}

/**
 * Returns true if the Esc overlay is currently visible.
 * @returns {boolean}
 */
export function isVisible() {
  if (!elements.escOverlay) return false;
  return getComputedStyle(elements.escOverlay).display !== "none";
}

/**
 * Initializes Esc overlay DOM, wires listeners, and returns element references.
 * @param {Record<string, any>} options
 * @param {Record<string, any>} hudContext
 * @returns {Record<string, any>}
 */
export function init(options = {}, hudContext = {}) {
  _options = options || {};
  _hudContext = hudContext || {};
  escEntranceToken = 0;

  const existing = document.getElementById("esc-overlay");
  if (existing) existing.remove();

  const touchDevice = _options.getIsTouchDevice ? _options.getIsTouchDevice() : false;

  elements.escOverlay = document.createElement("div");
  elements.escOverlay.id = "esc-overlay";
  elements.escOverlay.setAttribute("role", "dialog");
  elements.escOverlay.setAttribute("aria-label", "Pause menu");
  elements.escOverlay.setAttribute("aria-modal", "true");
  elements.escOverlay.style.display = "none";

  elements.escBackdrop = document.createElement("div");
  elements.escBackdrop.className = "esc-backdrop cc-scrim";
  elements.escBackdrop.addEventListener("click", hide);

  elements.escPanel = document.createElement("div");
  // * No .cc-panel: this panel carries the mock's own material (softer ink, 14px
  // * radius, 4px extrude, blur) and .cc-panel's `backdrop-filter: none` fights it.
  elements.escPanel.className = "esc-panel";
  elements.escPanel.addEventListener("click", (e) => e.stopPropagation());

  elements.escTitle = document.createElement("h2");
  // * No .cc-title: the mock's PAUSED is the same flat warm-white + magenta glow
  // * as every other 7x screen title, not the die-cut stroke + hard extrude.
  elements.escTitle.className = "esc-title";
  elements.escTitle.textContent = "PAUSED";

  // * Round/time context under the title — the HUD is suppressed while paused,
  // * so this is the only place the frozen clock is still readable.
  elements.escContext = document.createElement("p");
  elements.escContext.className = "esc-context";
  elements.escContext.textContent = "MATCH HELD";

  // * The CONTROLS card tag + chart live-subscribe to the input mode
  // * (PAUSE-CTRL-CHART-1): it used to freeze on the init-time touchDevice flag,
  // * so a pad player pausing mid-match saw a KEYBOARD (or TOUCH, on a
  // * touch-capable device like Steam Deck) chart. Same setInputMode signal the
  // * main menu, Settings and HOW TO PLAY charts consume (onInputModeChange).
  const controlsSection = createEscSection("CONTROLS", "KEYBOARD");
  controlsSection.section.classList.add("esc-section--controls");
  const controlsList = document.createElement("div");
  controlsList.className = "esc-ctl-list";
  controlsSection.body.appendChild(controlsList);

  // * Key splits, casing and wording track the SETTINGS chart row for row — a
  // * player who reads the keys there and then pauses must see one chart. The
  // * gamepad mapping mirrors updateSettingsControlsUI (input.js button indices
  // * 0/6/7/8/9: A/LT boost, B/RT hop, SELECT mute, START menu).
  /** @type {Record<'keyboard'|'gamepad'|'touch', Array<[string[], string, boolean, string]>>} */
  const escControlsChart = {
    keyboard: [
      [["W", "A", "S", "D"], "MOVE", false, "move"],
      [["SHIFT"], "BOOST", true, "boost"],
      [["SPACE"], "HOP", true, "hop"],
      [["M"], "MUTE", false, "mute"],
      [["ESC"], "MENU", false, "menu"],
    ],
    gamepad: [
      [["L-STICK", "D-PAD"], "MOVE", false, "move"],
      [["A", "LT"], "BOOST", false, "boost"],
      [["B", "RT"], "HOP", false, "hop"],
      [["SELECT"], "MUTE", true, "mute"],
      [["START"], "MENU", true, "menu"],
    ],
    touch: [
      [["STICK"], "MOVE", true, "move"],
      [["BOOST"], "BOOST", true, "boost"],
      [["HOP"], "HOP", true, "hop"],
      [["MENU"], "MENU", true, "menu"],
    ],
  };

  /** @param {'keyboard'|'gamepad'|'touch'} mode */
  const syncControlsChart = (mode) => {
    const tagEl = controlsSection.hd.querySelector(".esc-section-tag");
    if (tagEl) {
      tagEl.textContent = mode === "gamepad" ? "GAMEPAD" : mode === "touch" ? "TOUCH" : "KEYBOARD";
    }
    const rows = escControlsChart[mode] ?? escControlsChart.keyboard;
    controlsList.replaceChildren(
      ...rows.map(([keys, labelText, wide, action]) =>
        createEscControlRow(keys, labelText, wide, action),
      ),
    );
  };

  // * input.js starts at "keyboard" and only flips on device activity, so the
  // * init-time touchDevice flag still picks the label for touch-capable
  // * hardware that has not taken input yet.
  const initialMode = getInputMode() === "keyboard" && touchDevice ? "touch" : getInputMode();
  syncControlsChart(initialMode);
  _unsubscribeInputMode?.();
  _unsubscribeInputMode = onInputModeChange((mode) => syncControlsChart(mode));

  const audioSection = createEscSection("AUDIO");
  audioSection.section.classList.add("esc-section--audio");
  elements.escMuteBtn = document.createElement("button");
  elements.escMuteBtn.type = "button";
  elements.escMuteBtn.className = "esc-mute-btn";
  elements.escMuteBtn.setAttribute("aria-label", "Toggle mute");
  elements.escMuteBtn.addEventListener("click", () => {
    if (_options.setIsMuted) {
      _options.setIsMuted(!(_options.getIsMuted ? _options.getIsMuted() : false));
    }
    animateMuteToggle(elements.escMuteBtn);
    const isMuted = _options.getIsMuted ? _options.getIsMuted() : false;
    const musicGain = _options.getMusicGain ? _options.getMusicGain() : 0.5;
    const sfxVolume = _options.getSfxVolume ? _options.getSfxVolume() : 0.5;
    const voiceVolume = _options.getVoiceVolume ? _options.getVoiceVolume() : 0.5;
    const audioVolumeMax = _options.getAudioVolumeMax ? _options.getAudioVolumeMax() : 1.15;
    updateAudioState(isMuted, musicGain, sfxVolume, voiceVolume, audioVolumeMax);
  });
  wireButtonPressFeedback(elements.escMuteBtn, { scale: 0.92 });

  // * Mock 7f labels these in words, not glyphs — same as the SETTINGS sliders.
  elements.escMusicVol = createEscVolumeRow("MUSIC", (v) => {
    if (_options.setMusicGain) _options.setMusicGain(v);
  }, "Music volume", "music");
  elements.escSfxVol = createEscVolumeRow("SFX", (v) => {
    if (_options.setSfxVolume) _options.setSfxVolume(v);
  }, "SFX volume", "sfx");
  elements.escVoiceVol = createEscVolumeRow("VOICE", (v) => {
    if (_options.setVoiceVolume) _options.setVoiceVolume(v);
  }, "Announcer volume", "voice");

  const escVolStack = document.createElement("div");
  escVolStack.className = "esc-vol-stack";
  escVolStack.appendChild(elements.escMusicVol.row);
  escVolStack.appendChild(elements.escSfxVol.row);
  escVolStack.appendChild(elements.escVoiceVol.row);
  // * Mute rides the card header, not the slider row: sitting beside MUSIC/SFX
  // * it crowded their labels and pushed the whole stack off the card's left
  // * edge, out of line with the mock (and with the CONTROLS card beside it).
  audioSection.hd.appendChild(elements.escMuteBtn);
  audioSection.body.appendChild(escVolStack);

  // * 7f: the four in-match toggles share ONE 2×2 grid (QUALITY / POST-FX /
  // * ANNOUNCER / CALLOUTS) and live INSIDE the AUDIO card, per the mock — the
  // * body is exactly two cards, AUDIO and CONTROLS. The chips self-label
  // * ("QUALITY: HIGH"), so the retired OPTIONS header would only add noise.
  // * ANNOUNCER gates all announcer audio (voice + stings); CALLOUTS gates only
  // * the on-screen banner (announcerDisplay.js).
  const togglesGrid = document.createElement("div");
  togglesGrid.className = "esc-toggle-grid";

  const syncAnnouncerVoiceButtonState = (enabled) => {
    if (!elements.announcerVoiceBtn) return;
    elements.announcerVoiceBtn.textContent = enabled ? "ANNOUNCER: ON" : "ANNOUNCER: OFF";
    elements.announcerVoiceBtn.classList.toggle("esc-btn--off", !enabled);
  };
  elements.announcerVoiceBtn = document.createElement("button");
  elements.announcerVoiceBtn.type = "button";
  elements.announcerVoiceBtn.className = "esc-btn cc-btn cc-btn--ghost";
  syncAnnouncerVoiceButtonState(settingsStore.getState().announcerVoiceEnabled);
  elements.announcerVoiceBtn.addEventListener("click", () => {
    const next = !settingsStore.getState().announcerVoiceEnabled;
    settingsStore.getState().setAnnouncerVoiceEnabled(next);
    syncAnnouncerVoiceButtonState(next);
    animateTogglePop(elements.announcerVoiceBtn);
  });

  const syncAnnouncerCalloutsButtonState = (enabled) => {
    if (!elements.announcerCalloutsBtn) return;
    elements.announcerCalloutsBtn.textContent = enabled ? "CALLOUTS: ON" : "CALLOUTS: OFF";
    elements.announcerCalloutsBtn.classList.toggle("esc-btn--off", !enabled);
  };
  elements.announcerCalloutsBtn = document.createElement("button");
  elements.announcerCalloutsBtn.type = "button";
  elements.announcerCalloutsBtn.className = "esc-btn cc-btn cc-btn--ghost";
  syncAnnouncerCalloutsButtonState(settingsStore.getState().announcerCalloutsEnabled);
  elements.announcerCalloutsBtn.addEventListener("click", () => {
    const next = !settingsStore.getState().announcerCalloutsEnabled;
    settingsStore.getState().setAnnouncerCalloutsEnabled(next);
    syncAnnouncerCalloutsButtonState(next);
    animateTogglePop(elements.announcerCalloutsBtn);
  });

  wireEscButtonFeedback(elements.announcerVoiceBtn);
  wireEscButtonFeedback(elements.announcerCalloutsBtn);

  // ── Actions — one row along the bottom (mock 7f), RESUME leading ──────────
  const actions = document.createElement("div");
  actions.className = "esc-actions";

  elements.resumeBtn = makeEscActionButton("RESUME", "esc-btn--resume cc-btn--primary");
  // * Restart is a clean local re-entry only in single-player; online rematch is
  // * host-authoritative and lives on the podium PLAY AGAIN flow. The overlay is
  // * built once at startup before any room exists, so visibility is resolved on
  // * every show() (see syncRestartVisibility) rather than here.
  elements.restartBtn = makeEscActionButton("RESTART ROUND", "cc-btn--secondary");

  // * 7f: leaving the match is the recessive choice — ghost, not danger red.
  elements.quitBtn = makeEscActionButton("MAIN MENU", "cc-btn--ghost");

  // * Slots own flex share; buttons inside keep skew/lift without moving siblings.
  const resumeSlot = wrapEscActionSlot(elements.resumeBtn, { resume: true });
  const restartSlot = wrapEscActionSlot(elements.restartBtn);
  restartSlot.style.display = "none";
  const quitSlot = wrapEscActionSlot(elements.quitBtn);
  actions.appendChild(resumeSlot);
  actions.appendChild(restartSlot);
  actions.appendChild(quitSlot);

  // ── DISPLAY settings — grouped with AUDIO/ANNOUNCER, out of the actions row ──
  const postFxEnabled = () => (_options.getBloomEnabled ? _options.getBloomEnabled() : true) && (_options.getFxPassEnabled ? _options.getFxPassEnabled() : true);
  elements.postFxBtn = document.createElement("button");
  elements.postFxBtn.type = "button";
  elements.postFxBtn.className = "esc-btn cc-btn cc-btn--ghost";
  syncPostFxButtonState(postFxEnabled());
  elements.postFxBtn.addEventListener("click", () => {
    const next = !postFxEnabled();
    if (_options.setBloomEnabled) _options.setBloomEnabled(next);
    if (_options.setFxPassEnabled) _options.setFxPassEnabled(next);
    const bloomPass = _options.getBloomPass ? _options.getBloomPass() : null;
    const fxPass = _options.getFxPass ? _options.getFxPass() : null;
    if (bloomPass) bloomPass.enabled = next;
    if (fxPass) fxPass.enabled = next;
    syncPostFxButtonState(next);
    animateTogglePop(elements.postFxBtn);
  });

  elements.lowQualityBtn = document.createElement("button");
  elements.lowQualityBtn.type = "button";
  elements.lowQualityBtn.className = "esc-btn cc-btn cc-btn--ghost";
  syncQualityTierButtonState();
  elements.lowQualityBtn.addEventListener("click", () => {
    const order = ["low", "medium", "high-lite", "high"];
    const current = _options.getQualityTier ? _options.getQualityTier() : getQualityTier();
    const next = order[(order.indexOf(current) + 1) % order.length];
    syncQualityTierButtonState(next);
    animateTogglePop(elements.lowQualityBtn);
    if (_options.onQualityTierChange) _options.onQualityTierChange(next);
  });

  // * Grid order reads left→right, top→bottom: QUALITY · POST-FX / ANNOUNCER · CALLOUTS.
  togglesGrid.appendChild(elements.lowQualityBtn);
  togglesGrid.appendChild(elements.postFxBtn);
  togglesGrid.appendChild(elements.announcerVoiceBtn);
  togglesGrid.appendChild(elements.announcerCalloutsBtn);
  audioSection.body.appendChild(togglesGrid);

  // * The three action slabs wire their own press feedback (inner node) in
  // * makeEscActionButton — only the toggle chips need the plain wiring.
  wireEscButtonFeedback(elements.postFxBtn);
  wireEscButtonFeedback(elements.lowQualityBtn);

  // * Entrance order matches the read: AUDIO then CONTROLS.
  elements.escSections = [
    audioSection.section,
    controlsSection.section,
  ];

  // Header row (mock 7f): PAUSED left, frozen round/clock hard right.
  const escHd = document.createElement("div");
  escHd.className = "esc-hd";
  escHd.appendChild(elements.escTitle);
  escHd.appendChild(elements.escContext);
  elements.escPanel.appendChild(escHd);

  // Body = the two cards side by side; it is the only zone that scrolls, so the
  // actions row below stays reachable on a short viewport.
  const escBody = document.createElement("div");
  escBody.className = "esc-body";
  escBody.appendChild(audioSection.section);
  escBody.appendChild(controlsSection.section);

  elements.escPanel.appendChild(escBody);
  elements.escPanel.appendChild(actions);
  elements.escOverlay.appendChild(elements.escBackdrop);
  elements.escOverlay.appendChild(elements.escPanel);
  document.body.appendChild(elements.escOverlay);

  elements.resumeBtn.addEventListener("click", hide);
  elements.restartBtn.addEventListener("click", () => {
    // * Close the pause overlay (restores HUD + unpauses) then re-run the match.
    // * The 3s restart countdown absorbs the ~180ms dismiss animation.
    hide();
    if (typeof _options.onRestart === "function") _options.onRestart();
  });
  elements.quitBtn.addEventListener("click", () => {
    if (typeof _options.onQuitToMenu === "function") {
      _options.onQuitToMenu();
      return;
    }
    // * Bare pathname would drop ?diag and permanently disarm F8 for this session; carry
    // * the diag params only (never `room` — dropping it here is the whole point).
    window.location.href = menuReturnHref(window.location.href);
  });

  const isMuted = _options.getIsMuted ? _options.getIsMuted() : false;
  const musicGain = _options.getMusicGain ? _options.getMusicGain() : 0.5;
  const sfxVolume = _options.getSfxVolume ? _options.getSfxVolume() : 0.5;
  const voiceVolume = _options.getVoiceVolume ? _options.getVoiceVolume() : 0.5;
  const audioVolumeMax = _options.getAudioVolumeMax ? _options.getAudioVolumeMax() : 1.15;
  updateAudioState(isMuted, musicGain, sfxVolume, voiceVolume, audioVolumeMax);

  return {
    escOverlay: elements.escOverlay,
    escBackdrop: elements.escBackdrop,
    escPanel: elements.escPanel,
    escTitle: elements.escTitle,
    escSections: elements.escSections,
    resumeBtn: elements.resumeBtn,
    restartBtn: elements.restartBtn,
    quitBtn: elements.quitBtn,
    postFxBtn: elements.postFxBtn,
    lowQualityBtn: elements.lowQualityBtn,
    escMuteBtn: elements.escMuteBtn,
    escMusicVol: elements.escMusicVol,
    escSfxVol: elements.escSfxVol,
    escVoiceVol: elements.escVoiceVol,
    announcerVoiceBtn: elements.announcerVoiceBtn,
    announcerCalloutsBtn: elements.announcerCalloutsBtn,
  };
}
