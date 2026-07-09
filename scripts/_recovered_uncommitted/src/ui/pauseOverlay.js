import "./styles/pauseOverlay.css";
import {
  animateMenuCardEnter,
  animateMenuReveal,
  animateMuteToggle,
  animateVolumeTick,
  cancelAnimationsIn,
  fadeIn,
  wireButtonPressFeedback,
} from "../animations.js";
import { isLowQualityMode } from "../utils.js";
import { settingsStore } from "../stores/settingsStore.js";
import { isolationAllowsBloom } from "../scene.js";


/** Cancels in-flight Esc overlay entrance animations when reopening or closing. */
let escEntranceToken = 0;

/** @type {Record<string, any>} */
let _options = {};
/** @type {Record<string, any>} */
let _hudContext = {};

/** @type {Record<string, any>} */
const elements = {
  escOverlay: null,
  escBackdrop: null,
  escPanel: null,
  escTitle: null,
  escSections: [],
  resumeBtn: null,
  quitBtn: null,
  postFxBtn: null,
  lowQualityBtn: null,
  escMuteBtn: null,
  escMusicVol: null,
  escSfxVol: null,
  announcerVoiceBtn: null,
  announcerCalloutsBtn: null,
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function clampInt(value, min, max) {
  const v = Math.round(value);
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, v));
}

/**
 * Builds a pointer-friendly volume slider row for the Esc overlay.
 * @param {string} labelText
 * @param {(gain: number) => void} onChange
 * @param {string} ariaLabel
 */
function createEscVolumeRow(labelText, onChange, ariaLabel) {
  const row = document.createElement("div");
  row.className = "esc-vol-row";

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
    updateAudioState(isMuted, musicGain, sfxVolume, valueMax);
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
 * Builds a labeled Esc overlay section card with a dashed header divider.
 * @param {string} label
 * @param {string} [tag]
 * @returns {{ section: HTMLElement, body: HTMLElement }}
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
  return { section, body };
}

/**
 * Builds a controls reference row with keycaps and a label.
 * @param {string|string[]} keys
 * @param {string} labelText
 * @param {boolean} [wide=false]
 */
function createEscControlRow(keys, labelText, wide = false) {
  const row = document.createElement("div");
  row.className = "esc-ctl-row";

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

  for (const section of elements.escSections) {
    if (!section) continue;
    section.style.opacity = "0";
    section.style.transform = "translateY(10px)";
  }

  for (const btn of [elements.resumeBtn, elements.quitBtn, elements.postFxBtn, elements.lowQualityBtn]) {
    if (!btn) continue;
    btn.style.opacity = "0";
    btn.style.transform = "translateY(8px)";
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
    for (const section of elements.escSections) {
      if (!section) continue;
      section.style.opacity = "1";
      section.style.transform = "";
    }
    for (const btn of [elements.resumeBtn, elements.quitBtn, elements.postFxBtn, elements.lowQualityBtn]) {
      if (!btn) continue;
      btn.style.opacity = "1";
      btn.style.transform = "";
    }
    return;
  }

  if (backdrop) fadeIn(backdrop, 180, { ease: "outQuad" });

  window.setTimeout(() => {
    if (token !== escEntranceToken) return;

    animateMenuCardEnter(panel, { duration: 300, y: 18, ease: "outBack(1.25)" });
    animateMenuReveal(title, { delay: 40, duration: 260, y: 10, ease: "outExpo" });

    elements.escSections.forEach((section, i) => {
      if (!section) return;
      animateMenuReveal(section, {
        delay: 90 + i * 45,
        duration: 260,
        y: 10,
        ease: "outExpo",
      });
    });

    [elements.resumeBtn, elements.quitBtn, elements.postFxBtn, elements.lowQualityBtn].forEach((btn, i) => {
      if (!btn) return;
      animateMenuReveal(btn, {
        delay: 210 + i * 35,
        duration: 240,
        y: 8,
        ease: "outBack(1.2)",
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
 * @param {number} [audioVolumeMax=1.15]
 */
export function updateAudioState(isMuted, musicGain, sfxVolume, audioVolumeMax = 1.15) {
  if (!elements.escMuteBtn) return;
  const musicPercent = Math.round((musicGain / audioVolumeMax) * 100);
  const sfxPercent = Math.round((sfxVolume / audioVolumeMax) * 100);
  const musicPct = isMuted ? 0 : musicPercent;
  const sfxPct = isMuted ? 0 : sfxPercent;

  if (elements.escMuteBtn) {
    elements.escMuteBtn.textContent = isMuted ? "✕" : "♪";
    elements.escMuteBtn.classList.toggle("muted", isMuted);
  }
  if (elements.escMusicVol?.setPct) {
    elements.escMusicVol.setPct(musicPct, isMuted);
  }
  if (elements.escSfxVol?.setPct) {
    elements.escSfxVol.setPct(sfxPct, isMuted);
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

    const isMuted = _options.getIsMuted ? _options.getIsMuted() : false;
    const musicGain = _options.getMusicGain ? _options.getMusicGain() : 0.5;
    const sfxVolume = _options.getSfxVolume ? _options.getSfxVolume() : 0.5;
    const audioVolumeMax = _options.getAudioVolumeMax ? _options.getAudioVolumeMax() : 1.15;
    updateAudioState(isMuted, musicGain, sfxVolume, audioVolumeMax);

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
  if (elements.escOverlay) {
    escEntranceToken += 1;
    cancelAnimationsIn(elements.escOverlay);
    elements.escOverlay.style.display = "none";
    elements.escOverlay.classList.remove("is-open");

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
  }
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
  elements.escOverlay.setAttribute("aria-label", "Settings");
  elements.escOverlay.setAttribute("aria-modal", "true");
  elements.escOverlay.style.display = "none";

  elements.escBackdrop = document.createElement("div");
  elements.escBackdrop.className = "esc-backdrop";
  elements.escBackdrop.addEventListener("click", hide);

  elements.escPanel = document.createElement("div");
  elements.escPanel.className = "esc-panel";
  elements.escPanel.addEventListener("click", (e) => e.stopPropagation());

  elements.escTitle = document.createElement("h2");
  elements.escTitle.className = "esc-title";
  elements.escTitle.textContent = "MENU";

  const controlsSection = createEscSection("◇ CONTROLS", touchDevice ? "TOUCH" : "KEYBOARD");
  controlsSection.section.classList.add("esc-section--controls");
  const controlsList = document.createElement("div");
  controlsList.className = "esc-ctl-list";

  if (touchDevice) {
    /** @type {Array<[string[], string]>} */
    const touchControls = [
      [["Stick"], "Drive"],
      [["Boost"], "Nitro (hold)"],
      [["Hop"], "Hop"],
      [["Menu"], "Open / close"],
    ];
    touchControls.forEach(([keys, labelText]) => {
      controlsList.appendChild(createEscControlRow(keys, labelText));
    });
  } else {
    controlsList.appendChild(createEscControlRow(["WASD / Arrows"], "Drive", true));
    /** @type {Array<[string[], string, boolean?]>} */
    const kbControls = [
      [["Shift"], "Nitro", true],
      [["Space"], "Hop", true],
      [["M"], "Mute"],
      [["Esc"], "Close menu"],
    ];
    kbControls.forEach(([keys, labelText, wide]) => {
      controlsList.appendChild(createEscControlRow(keys, labelText, wide));
    });
  }
  controlsSection.body.appendChild(controlsList);

  const audioSection = createEscSection("◇ AUDIO");
  audioSection.section.classList.add("esc-section--audio");
  const escAudioRow = document.createElement("div");
  escAudioRow.className = "esc-audio-row";

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
    const audioVolumeMax = _options.getAudioVolumeMax ? _options.getAudioVolumeMax() : 1.15;
    updateAudioState(isMuted, musicGain, sfxVolume, audioVolumeMax);
  });
  wireButtonPressFeedback(elements.escMuteBtn, { scale: 0.92 });

  elements.escMusicVol = createEscVolumeRow("♫", (v) => {
    if (_options.setMusicGain) _options.setMusicGain(v);
  }, "Music volume");
  elements.escSfxVol = createEscVolumeRow("⚡", (v) => {
    if (_options.setSfxVolume) _options.setSfxVolume(v);
  }, "SFX volume");

  const escVolStack = document.createElement("div");
  escVolStack.className = "esc-vol-stack";
  escVolStack.appendChild(elements.escMusicVol.row);
  escVolStack.appendChild(elements.escSfxVol.row);
  escAudioRow.appendChild(elements.escMuteBtn);
  escAudioRow.appendChild(escVolStack);
  audioSection.body.appendChild(escAudioRow);

  // * Store PA announcer toggles — own compact section rather than crowding
  // * AUDIO further; ANNOUNCER gates all announcer audio (voice + stings),
  // * CALLOUTS gates only the on-screen banner (announcerDisplay.js).
  const announcerSection = createEscSection("◇ ANNOUNCER");
  announcerSection.section.classList.add("esc-section--announcer");
  const announcerRow = document.createElement("div");
  announcerRow.className = "esc-announcer-row";

  const syncAnnouncerVoiceButtonState = (enabled) => {
    if (!elements.announcerVoiceBtn) return;
    elements.announcerVoiceBtn.textContent = enabled ? "ANNOUNCER: ON" : "ANNOUNCER: OFF";
    elements.announcerVoiceBtn.classList.toggle("esc-btn--off", !enabled);
  };
  elements.announcerVoiceBtn = document.createElement("button");
  elements.announcerVoiceBtn.type = "button";
  elements.announcerVoiceBtn.className = "esc-btn";
  syncAnnouncerVoiceButtonState(settingsStore.getState().announcerVoiceEnabled);
  elements.announcerVoiceBtn.addEventListener("click", () => {
    const next = !settingsStore.getState().announcerVoiceEnabled;
    settingsStore.getState().setAnnouncerVoiceEnabled(next);
    syncAnnouncerVoiceButtonState(next);
  });

  const syncAnnouncerCalloutsButtonState = (enabled) => {
    if (!elements.announcerCalloutsBtn) return;
    elements.announcerCalloutsBtn.textContent = enabled ? "CALLOUTS: ON" : "CALLOUTS: OFF";
    elements.announcerCalloutsBtn.classList.toggle("esc-btn--off", !enabled);
  };
  elements.announcerCalloutsBtn = document.createElement("button");
  elements.announcerCalloutsBtn.type = "button";
  elements.announcerCalloutsBtn.className = "esc-btn";
  syncAnnouncerCalloutsButtonState(settingsStore.getState().announcerCalloutsEnabled);
  elements.announcerCalloutsBtn.addEventListener("click", () => {
    const next = !settingsStore.getState().announcerCalloutsEnabled;
    settingsStore.getState().setAnnouncerCalloutsEnabled(next);
    syncAnnouncerCalloutsButtonState(next);
  });

  wireEscButtonFeedback(elements.announcerVoiceBtn);
  wireEscButtonFeedback(elements.announcerCalloutsBtn);

  announcerRow.appendChild(elements.announcerVoiceBtn);
  announcerRow.appendChild(elements.announcerCalloutsBtn);
  announcerSection.body.appendChild(announcerRow);

  const scoringSection = createEscSection("◇ SCORING");
  scoringSection.section.classList.add("esc-section--scoring", "esc-scoring-block");

  const scoreList = document.createElement("ul");
  scoreList.className = "esc-score-list";
  [
    ["Edge knockout", "◆", "+1"],
    ["Center hole", "◆◆", "+2"],
    ["High-speed hit", "◆◆◆", "+1 bonus"],
    ["Hit the leader", "◆◆◆◆", "+1 bonus"],
  ].forEach(([name, icon, pts]) => {
    const item = document.createElement("li");
    item.className = "esc-score-row";

    const nameEl = document.createElement("span");
    nameEl.className = "esc-score-name";
    nameEl.textContent = name;

    const ptsEl = document.createElement("span");
    ptsEl.className = "esc-score-pts";
    const iconEl = document.createElement("span");
    iconEl.className = "esc-score-icon";
    iconEl.textContent = icon;
    iconEl.setAttribute("aria-hidden", "true");
    ptsEl.appendChild(iconEl);
    ptsEl.appendChild(document.createTextNode(pts));

    item.appendChild(nameEl);
    item.appendChild(ptsEl);
    scoreList.appendChild(/** @type {any} */ (item));
  });
  scoringSection.body.appendChild(scoreList);

  const scoreFootnote = document.createElement("p");
  scoreFootnote.className = "esc-score-footnote";
  scoreFootnote.textContent = "Bonuses stack — up to 4 pts per play";
  scoringSection.body.appendChild(scoreFootnote);

  const leaderHint = document.createElement("p");
  leaderHint.className = "esc-leader-hint";
  const leaderDot = document.createElement("span");
  leaderDot.className = "esc-leader-dot";
  leaderDot.setAttribute("aria-hidden", "true");
  leaderHint.appendChild(leaderDot);
  leaderHint.appendChild(document.createTextNode("Leader glows white"));
  scoringSection.body.appendChild(leaderHint);

  const actions = document.createElement("div");
  actions.className = "esc-actions";

  elements.resumeBtn = document.createElement("button");
  elements.resumeBtn.type = "button";
  elements.resumeBtn.className = "esc-btn";
  elements.resumeBtn.textContent = "RESUME";

  elements.quitBtn = document.createElement("button");
  elements.quitBtn.type = "button";
  elements.quitBtn.className = "esc-btn esc-btn--quit";
  elements.quitBtn.textContent = "QUIT TO MENU";

  const postFxEnabled = () => (_options.getBloomEnabled ? _options.getBloomEnabled() : true) && (_options.getFxPassEnabled ? _options.getFxPassEnabled() : true);
  elements.postFxBtn = document.createElement("button");
  elements.postFxBtn.type = "button";
  elements.postFxBtn.className = "esc-btn";
  syncPostFxButtonState(postFxEnabled());
  elements.postFxBtn.addEventListener("click", () => {
    const next = !postFxEnabled();
    if (_options.setBloomEnabled) _options.setBloomEnabled(next);
    if (_options.setFxPassEnabled) _options.setFxPassEnabled(next);
    const bloomPass = _options.getBloomPass ? _options.getBloomPass() : null;
    const fxPass = _options.getFxPass ? _options.getFxPass() : null;
    if (bloomPass) bloomPass.enabled = next && isolationAllowsBloom();
    if (fxPass) fxPass.enabled = next;
    syncPostFxButtonState(next);
  });

  const syncLowQualityButtonState = (enabled) => {
    if (!elements.lowQualityBtn) return;
    elements.lowQualityBtn.textContent = enabled ? "LOW QUALITY: ON" : "HIGH QUALITY: ON";
    elements.lowQualityBtn.classList.toggle("esc-btn--lq-on", enabled);
  };
  elements.lowQualityBtn = document.createElement("button");
  elements.lowQualityBtn.type = "button";
  elements.lowQualityBtn.className = "esc-btn";
  syncLowQualityButtonState(isLowQualityMode());
  elements.lowQualityBtn.addEventListener("click", () => {
    const next = !isLowQualityMode();
    syncLowQualityButtonState(next);
    if (_options.onLowQualityToggle) _options.onLowQualityToggle(next);
  });

  actions.appendChild(elements.resumeBtn);
  actions.appendChild(elements.quitBtn);
  actions.appendChild(elements.postFxBtn);
  actions.appendChild(elements.lowQualityBtn);

  wireEscButtonFeedback(elements.resumeBtn);
  wireEscButtonFeedback(elements.quitBtn);
  wireEscButtonFeedback(elements.postFxBtn);
  wireEscButtonFeedback(elements.lowQualityBtn);

  elements.escSections = [
    controlsSection.section,
    audioSection.section,
    announcerSection.section,
    scoringSection.section,
  ];

  elements.escPanel.appendChild(elements.escTitle);

  const escBody = document.createElement("div");
  escBody.className = "esc-body";

  const escColPrimary = document.createElement("div");
  escColPrimary.className = "esc-col-primary";
  escColPrimary.appendChild(controlsSection.section);
  escColPrimary.appendChild(audioSection.section);
  escColPrimary.appendChild(announcerSection.section);

  escBody.appendChild(escColPrimary);
  escBody.appendChild(scoringSection.section);
  escBody.appendChild(actions);
  elements.escPanel.appendChild(escBody);
  elements.escOverlay.appendChild(elements.escBackdrop);
  elements.escOverlay.appendChild(elements.escPanel);
  document.body.appendChild(elements.escOverlay);

  elements.resumeBtn.addEventListener("click", hide);
  elements.quitBtn.addEventListener("click", () => {
    if (typeof _options.onQuitToMenu === "function") {
      _options.onQuitToMenu();
      return;
    }
    const url = new URL(window.location.href);
    url.searchParams.delete("room");
    window.location.href = url.pathname;
  });

  const isMuted = _options.getIsMuted ? _options.getIsMuted() : false;
  const musicGain = _options.getMusicGain ? _options.getMusicGain() : 0.5;
  const sfxVolume = _options.getSfxVolume ? _options.getSfxVolume() : 0.5;
  const audioVolumeMax = _options.getAudioVolumeMax ? _options.getAudioVolumeMax() : 1.15;
  updateAudioState(isMuted, musicGain, sfxVolume, audioVolumeMax);

  return {
    escOverlay: elements.escOverlay,
    escBackdrop: elements.escBackdrop,
    escPanel: elements.escPanel,
    escTitle: elements.escTitle,
    escSections: elements.escSections,
    resumeBtn: elements.resumeBtn,
    quitBtn: elements.quitBtn,
    postFxBtn: elements.postFxBtn,
    lowQualityBtn: elements.lowQualityBtn,
    escMuteBtn: elements.escMuteBtn,
    escMusicVol: elements.escMusicVol,
    escSfxVol: elements.escSfxVol,
    announcerVoiceBtn: elements.announcerVoiceBtn,
    announcerCalloutsBtn: elements.announcerCalloutsBtn,
  };
}
