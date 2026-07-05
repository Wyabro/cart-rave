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

export const PAUSE_OVERLAY_CSS = `
    #esc-overlay {
      --esc-ui: "Russo One", sans-serif;
      --esc-display: "Road Rage", "Goldman", sans-serif;
      --esc-mono: "Goldman", ui-monospace, monospace;
      --esc-cyan: #22e6ff;
      --esc-magenta: #ff2bd6;
      --esc-surface: rgba(0, 0, 0, 0.52);
      --esc-border: rgba(255, 255, 255, 0.1);
      --esc-section-gap: clamp(10px, 2vw, 14px);
      position: fixed;
      inset: 0;
      z-index: 26000;
      display: none;
      align-items: center;
      justify-content: center;
      padding: clamp(12px, 3vw, 24px);
      pointer-events: auto;
      font-family: var(--esc-mono);
      color: #fff;
      -webkit-font-smoothing: antialiased;
      text-rendering: optimizeLegibility;
    }

    #esc-overlay .esc-backdrop {
      position: absolute;
      inset: 0;
      background: rgba(5, 5, 20, 0.72);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
    }

    #esc-overlay .esc-panel {
      position: relative;
      z-index: 1;
      pointer-events: auto;
      width: min(680px, 96vw);
      max-height: min(92vh, 720px);
      padding: clamp(14px, 2.5vw, 20px);
      border-radius: 18px;
      background: linear-gradient(165deg, rgba(12, 8, 28, 0.92) 0%, rgba(4, 4, 16, 0.88) 100%);
      border: 1px solid rgba(255, 255, 255, 0.12);
      box-shadow:
        0 0 48px rgba(34, 230, 255, 0.07),
        0 0 80px rgba(255, 43, 214, 0.05),
        0 20px 56px rgba(0, 0, 0, 0.55);
      backdrop-filter: blur(14px);
      -webkit-backdrop-filter: blur(14px);
      display: flex;
      flex-direction: column;
      gap: clamp(10px, 2vw, 14px);
      overflow: hidden;
    }

    #esc-overlay .esc-title {
      font-family: var(--esc-ui);
      font-size: clamp(18px, 3.6vw, 26px);
      font-weight: 400;
      letter-spacing: 0.08em;
      margin: 0;
      text-align: center;
      line-height: 1.1;
      color: var(--esc-cyan);
      text-shadow: 0 0 12px var(--esc-cyan), 0 0 28px color-mix(in oklab, var(--esc-cyan), transparent 50%);
      flex-shrink: 0;
    }

    #esc-overlay .esc-body {
      display: grid;
      grid-template-columns: 1fr 1fr;
      grid-template-rows: minmax(0, 1fr) auto;
      grid-template-areas:
        "primary scoring"
        "actions actions";
      gap: var(--esc-section-gap);
      min-height: 0;
      flex: 1 1 auto;
    }

    #esc-overlay .esc-col-primary {
      grid-area: primary;
      display: flex;
      flex-direction: column;
      gap: var(--esc-section-gap);
      min-height: 0;
      min-width: 0;
    }

    #esc-overlay .esc-scoring-block {
      grid-area: scoring;
      min-height: 0;
      min-width: 0;
    }

    #esc-overlay .esc-actions {
      grid-area: actions;
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: clamp(8px, 1.5vw, 10px);
      flex-shrink: 0;
    }

    #esc-overlay .esc-section {
      display: flex;
      flex-direction: column;
      gap: clamp(6px, 1.2vw, 8px);
      padding: clamp(10px, 2vw, 12px);
      border-radius: 12px;
      background: var(--esc-surface);
      border: 1px solid var(--esc-border);
      min-height: 0;
      min-width: 0;
    }

    #esc-overlay .esc-section-hd {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding-bottom: clamp(4px, 1vw, 6px);
      border-bottom: 1px dashed rgba(255, 255, 255, 0.12);
      flex-shrink: 0;
    }

    #esc-overlay .esc-section-label {
      font-family: var(--esc-mono);
      font-size: clamp(9px, 1.8vw, 10px);
      letter-spacing: 0.2em;
      color: rgba(255, 255, 255, 0.55);
      text-transform: uppercase;
    }

    #esc-overlay .esc-section-tag {
      font-family: var(--esc-mono);
      font-size: clamp(8px, 1.6vw, 9px);
      letter-spacing: 0.16em;
      color: rgba(255, 255, 255, 0.35);
      text-transform: uppercase;
    }

    #esc-overlay .esc-section-body {
      display: flex;
      flex-direction: column;
      gap: clamp(4px, 1vw, 6px);
      min-height: 0;
    }

    #esc-overlay .esc-section--scoring .esc-section-body {
      flex: 1 1 auto;
    }

    #esc-overlay .esc-ctl-list {
      display: flex;
      flex-direction: column;
      gap: clamp(4px, 1vw, 6px);
    }

    #esc-overlay .esc-ctl-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: clamp(6px, 1.5vw, 10px);
    }

    #esc-overlay .esc-ctl-keys {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      flex-shrink: 0;
    }

    #esc-overlay .esc-ctl-keys kbd {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: clamp(26px, 6vw, 30px);
      height: clamp(24px, 5.5vw, 28px);
      padding: 0 6px;
      border-radius: 5px;
      background: rgba(0, 0, 0, 0.55);
      border: 1.5px solid rgba(34, 230, 255, 0.35);
      font-family: var(--esc-ui);
      font-size: clamp(9px, 1.8vw, 10px);
      letter-spacing: 0.04em;
      color: var(--esc-cyan);
      text-shadow: 0 0 8px var(--esc-cyan);
      box-shadow: 0 0 8px rgba(34, 230, 255, 0.12);
    }

    #esc-overlay .esc-ctl-keys kbd.wide {
      min-width: clamp(48px, 12vw, 58px);
      font-size: clamp(8px, 1.6vw, 9px);
      letter-spacing: 0.1em;
    }

    #esc-overlay .esc-ctl-lbl {
      font-family: var(--esc-mono);
      font-size: clamp(9px, 1.8vw, 10px);
      letter-spacing: 0.1em;
      color: rgba(255, 255, 255, 0.72);
      text-transform: uppercase;
      text-align: right;
    }

    #esc-overlay .esc-audio-row {
      display: flex;
      align-items: center;
      gap: clamp(8px, 1.8vw, 12px);
    }

    #esc-overlay .esc-mute-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: clamp(42px, 10vw, 46px);
      height: clamp(42px, 10vw, 46px);
      flex-shrink: 0;
      border-radius: 10px;
      border: 2px solid rgba(255, 255, 255, 0.16);
      background: rgba(0, 0, 0, 0.45);
      color: #ffffff;
      font-size: clamp(14px, 3.5vw, 16px);
      cursor: pointer;
      touch-action: manipulation;
      transition: border-color 80ms ease, background 80ms ease;
    }

    #esc-overlay .esc-mute-btn.muted {
      color: #888;
      border-color: rgba(255, 80, 80, 0.35);
    }

    #esc-overlay .esc-vol-stack {
      display: flex;
      flex-direction: column;
      gap: clamp(6px, 1.4vw, 8px);
      flex: 1;
      min-width: 0;
    }

    #esc-overlay .esc-vol-row {
      display: grid;
      grid-template-columns: clamp(18px, 4vw, 22px) 1fr clamp(28px, 7vw, 36px);
      align-items: center;
      gap: clamp(6px, 1.5vw, 8px);
    }

    #esc-overlay .esc-vol-label {
      text-align: center;
      color: rgba(255, 255, 255, 0.6);
      font-size: clamp(11px, 2.6vw, 12px);
    }

    #esc-overlay .esc-vol-track-wrap {
      position: relative;
      height: clamp(34px, 8vw, 40px);
      display: flex;
      align-items: center;
      touch-action: none;
      cursor: pointer;
    }

    #esc-overlay .esc-vol-track {
      position: relative;
      width: 100%;
      height: clamp(8px, 2vw, 10px);
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.12);
      overflow: visible;
    }

    #esc-overlay .esc-vol-fill {
      position: absolute;
      left: 0;
      top: 0;
      bottom: 0;
      width: 0%;
      border-radius: 999px;
      background: linear-gradient(90deg, var(--esc-magenta), var(--esc-cyan));
      box-shadow: 0 0 10px rgba(34, 230, 255, 0.35);
      pointer-events: none;
    }

    #esc-overlay .esc-vol-track-wrap::after {
      content: "";
      position: absolute;
      top: 50%;
      left: var(--esc-vol-thumb, 0%);
      width: clamp(18px, 4.5vw, 22px);
      height: clamp(18px, 4.5vw, 22px);
      transform: translate(-50%, -50%);
      border-radius: 50%;
      background: #ffffff;
      box-shadow: 0 0 8px rgba(255, 255, 255, 0.45);
      pointer-events: none;
    }

    #esc-overlay .esc-vol-val {
      font-family: var(--esc-mono);
      font-size: clamp(10px, 2.2vw, 11px);
      font-weight: 700;
      color: rgba(255, 255, 255, 0.55);
      text-align: right;
      letter-spacing: 0.04em;
    }

    #esc-overlay .esc-score-list {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: clamp(4px, 1vw, 6px);
      flex: 1 1 auto;
      min-height: 0;
    }

    #esc-overlay .esc-score-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: clamp(6px, 1.5vw, 10px);
      padding: clamp(5px, 1.2vw, 7px) clamp(8px, 1.8vw, 10px);
      border-radius: 8px;
      background: rgba(0, 0, 0, 0.35);
      border: 1px solid rgba(255, 255, 255, 0.06);
    }

    #esc-overlay .esc-score-name {
      font-family: var(--esc-mono);
      font-size: clamp(9px, 1.8vw, 10px);
      letter-spacing: 0.06em;
      color: rgba(255, 255, 255, 0.78);
      text-transform: uppercase;
      line-height: 1.25;
    }

    #esc-overlay .esc-score-pts {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      flex-shrink: 0;
      font-family: var(--esc-ui);
      font-size: clamp(11px, 2.2vw, 13px);
      letter-spacing: 0.06em;
      color: var(--esc-cyan);
      text-shadow: 0 0 8px var(--esc-cyan);
    }

    #esc-overlay .esc-score-icon {
      font-size: 0.85em;
      opacity: 0.85;
      letter-spacing: -0.08em;
    }

    #esc-overlay .esc-score-footnote {
      margin: clamp(4px, 1vw, 6px) 0 0;
      font-family: var(--esc-mono);
      font-size: clamp(8px, 1.6vw, 9px);
      letter-spacing: 0.08em;
      color: rgba(255, 255, 255, 0.42);
      text-align: center;
      line-height: 1.35;
      flex-shrink: 0;
    }

    #esc-overlay .esc-leader-hint {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      margin: clamp(6px, 1.2vw, 8px) 0 0;
      padding: clamp(6px, 1.2vw, 8px) clamp(8px, 1.8vw, 10px);
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid rgba(255, 255, 255, 0.1);
      font-family: var(--esc-mono);
      font-size: clamp(9px, 1.8vw, 10px);
      letter-spacing: 0.12em;
      color: rgba(255, 255, 255, 0.72);
      text-transform: uppercase;
      flex-shrink: 0;
    }

    #esc-overlay .esc-leader-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: #fff;
      box-shadow: 0 0 10px #fff, 0 0 18px rgba(255, 255, 255, 0.65);
      flex-shrink: 0;
      animation: esc-leader-pulse 1.6s ease-in-out infinite;
    }

    @keyframes esc-leader-pulse {
      0%, 100% { opacity: 0.75; transform: scale(0.92); }
      50% { opacity: 1; transform: scale(1); }
    }

    #esc-overlay .esc-btn {
      width: 100%;
      min-height: 44px;
      padding: clamp(10px, 2vw, 12px) clamp(10px, 2vw, 14px);
      border-radius: 8px;
      font-family: var(--esc-ui);
      font-size: clamp(12px, 2.4vw, 14px);
      letter-spacing: 0.06em;
      cursor: pointer;
      text-decoration: none;
      text-align: center;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 2px solid var(--btn-glow, var(--esc-magenta));
      background: rgba(0, 0, 0, 0.55);
      color: var(--btn-glow, var(--esc-magenta));
      text-shadow: 0 0 10px var(--btn-glow, var(--esc-magenta));
      box-shadow: 0 0 12px var(--btn-glow, var(--esc-magenta)), 0 0 28px color-mix(in oklab, var(--btn-glow, var(--esc-magenta)), transparent 60%);
      touch-action: manipulation;
      transition: background 180ms ease, box-shadow 180ms ease;
    }

    #esc-overlay .esc-btn:hover:not(:disabled) {
      background: rgba(0, 0, 0, 0.35);
      box-shadow: 0 0 20px var(--btn-glow, var(--esc-magenta)), 0 0 44px var(--btn-glow, var(--esc-magenta));
    }

    #esc-overlay .esc-btn--quit {
      --btn-glow: var(--esc-cyan);
    }

    #esc-overlay .esc-btn--fx-off {
      --btn-glow: rgba(255, 255, 255, 0.55);
      color: rgba(255, 255, 255, 0.72);
      text-shadow: none;
      box-shadow: 0 0 8px rgba(255, 255, 255, 0.08);
    }

    #esc-overlay .esc-btn--lq-on {
      --btn-glow: rgba(255, 255, 255, 0.55);
      color: rgba(255, 255, 255, 0.72);
      text-shadow: none;
      box-shadow: 0 0 8px rgba(255, 255, 255, 0.08);
    }

    @media (pointer: coarse) {
      #esc-overlay {
        align-items: stretch;
        justify-content: stretch;
        padding: 0;
      }

      #esc-overlay .esc-backdrop {
        background: rgba(5, 5, 20, 0.92);
      }

      #esc-overlay .esc-panel {
        width: 100%;
        height: 100%;
        max-width: none;
        max-height: none;
        border-radius: 0;
        border: none;
        box-shadow: none;
        padding:
          max(10px, env(safe-area-inset-top, 0px))
          max(12px, env(safe-area-inset-right, 0px))
          max(10px, env(safe-area-inset-bottom, 0px))
          max(12px, env(safe-area-inset-left, 0px));
        gap: clamp(8px, 1.5vh, 12px);
      }

      #esc-overlay .esc-title {
        font-size: clamp(16px, 4.5vw, 20px);
      }

      #esc-overlay .esc-body {
        grid-template-columns: 1fr;
        grid-template-rows: auto auto auto;
        grid-template-areas:
          "primary"
          "scoring"
          "actions";
        gap: clamp(8px, 1.5vh, 10px);
        overflow-y: auto;
        overscroll-behavior: contain;
        -webkit-overflow-scrolling: touch;
      }

      #esc-overlay .esc-section {
        padding: clamp(10px, 2.5vw, 12px);
      }

      #esc-overlay .esc-mute-btn {
        width: 48px;
        height: 48px;
      }

      #esc-overlay .esc-vol-track-wrap {
        height: 40px;
      }

      #esc-overlay .esc-actions {
        grid-template-columns: 1fr;
        gap: clamp(8px, 1.8vw, 10px);
        position: sticky;
        bottom: 0;
        padding-top: 4px;
        background: linear-gradient(180deg, transparent 0%, rgba(4, 4, 16, 0.92) 24%);
      }

      #esc-overlay .esc-btn {
        min-height: 48px;
        font-size: clamp(13px, 3.4vw, 15px);
      }

      #hud.hud-suppressed .hud-timer,
      #hud.hud-suppressed .hud-scores,
      #hud.hud-suppressed .hud-status,
      #hud.hud-suppressed .hud-ready-btn,
      #hud.hud-suppressed .hud-audio,
      #hud.hud-suppressed .hud-menu-btn,
      #hud.hud-suppressed .hud-feed {
        display: none !important;
      }
    }

    @media (pointer: coarse) and (orientation: landscape) {
      #esc-overlay .esc-body {
        grid-template-columns: 1.05fr 0.95fr;
        grid-template-rows: minmax(0, 1fr) auto;
        grid-template-areas:
          "primary scoring"
          "actions actions";
        overflow: hidden;
      }

      #esc-overlay .esc-col-primary {
        overflow-y: auto;
        overscroll-behavior: contain;
      }

      #esc-overlay .esc-scoring-block {
        overflow-y: auto;
        overscroll-behavior: contain;
      }

      #esc-overlay .esc-actions {
        grid-template-columns: repeat(4, minmax(0, 1fr));
        position: static;
        background: none;
        padding-top: 0;
      }

      #esc-overlay .esc-btn {
        min-height: 42px;
        font-size: clamp(11px, 2.2vw, 13px);
      }
    }

    @media (max-width: 620px) {
      #esc-overlay .esc-body {
        grid-template-columns: 1fr;
        grid-template-rows: auto auto auto;
        grid-template-areas:
          "primary"
          "scoring"
          "actions";
      }

      #esc-overlay .esc-actions {
        grid-template-columns: 1fr;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      #esc-overlay .esc-leader-dot {
        animation: none;
        opacity: 1;
      }
    }
`.trim();

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
    if (bloomPass) bloomPass.enabled = next;
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
    scoringSection.section,
  ];

  elements.escPanel.appendChild(elements.escTitle);

  const escBody = document.createElement("div");
  escBody.className = "esc-body";

  const escColPrimary = document.createElement("div");
  escColPrimary.className = "esc-col-primary";
  escColPrimary.appendChild(controlsSection.section);
  escColPrimary.appendChild(audioSection.section);

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
  };
}
