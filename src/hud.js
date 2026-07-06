import {
  animateKillFeedEnter,
  animateKillFeedExit,
  animateReadyStateToggle,
  animateScorePop,
  animateMuteToggle,
  animateVolumeTick,
  cancelElementAnimations,
  cancelKillFeedExitTimer,
  scheduleKillFeedExit,
  wireButtonPressFeedback,
} from "./animations.js";
import { resolveCartNeonCss } from "./customization.js";
import * as AudioManager from "./audioManager.js";
import { getServerClockOffsetMs } from "./netcode.js";
import { gameStore } from "./stores/gameStore.js";
import { getNpcPersonality } from "./npcNames.js";
import { isWorldBootstrapped } from "./bootstrap.js";
import {
  PAUSE_OVERLAY_CSS,
  show as showPauseOverlay,
  hide as hidePauseOverlay,
  isVisible as isPauseOverlayVisible,
  updateAudioState as updatePauseOverlayAudioState,
  init as initPauseOverlay,
} from "./ui/pauseOverlay.js";

const PERSONALITY_BADGES = {
  aggressor: { letter: "[A]", color: "#ff4d4d" },
  lurker: { letter: "[L]", color: "#b366ff" },
  scavenger: { letter: "[S]", color: "#4dff88" },
  chaotic: { letter: "[C]", color: "#ffaa33" },
};

/**
 * Applies HUD score-box glow from resolveCartNeonCss (synced lookHex for all humans).
 *
 * @param {HTMLElement | null | undefined} box
 * @param {{ color?: string, kind?: string, connId?: string, lookHex?: number | null } | null | undefined} slot
 * @param {string | null | undefined} youConnId
 */
function applyHudScoreBoxGlow(box, slot, youConnId) {
  if (!box) return;

  if (!slot?.color && !slot?.lookHex) {
    if (box.dataset.hudColor !== "") {
      box.style.removeProperty("--hud-glow");
      delete box.dataset.hudColor;
    }
    return;
  }

  const cssHex = resolveCartNeonCss(slot, { youConnId });
  const currentGlow = box.style.getPropertyValue("--hud-glow");

  if (currentGlow !== cssHex) {
    box.style.setProperty("--hud-glow", cssHex);
    box.dataset.hudColor = "custom";
  }
}

let _options = {};

/** @type {Record<string, any>} */
const elements = {
  root: null,
  status: null,
  timer: null,
  timerNum: null,
  timerRd: null,
  timerFill: null,
  scores: null,
  feed: null,
  scoreBoxes: [],
  readyBtn: null,
  menuBtn: null,
  audio: null,
  comboBadge: null,
  comboMultiplier: null,
  comboTier: null,
  comboBarFill: null,
  escOverlay: null,
  escBackdrop: null,
  escPanel: null,
  escTitle: null,
  escSections: [],
  resumeBtn: null,
  quitBtn: null,
  postFxBtn: null,
  lowQualityBtn: null,
  muteBtn: null,
  escMuteBtn: null,
  musicVol: null,
  sfxVol: null,
  escMusicVol: null,
  escSfxVol: null,
};

// * Cached update() state — avoids recomputing sort order and retriggering animations every frame.
/** Timestamp until which the "GO!" flash is shown after countdown → running. */
let _goUntilMs = 0;
/** True after countdown_go has been played for the current transition; reset when countdown restarts. */
let _goSoundPlayed = false;
/** Previous round phase; used to detect countdown → running transition. */
let _prevRoundPhase = null;
/** Last rendered countdown digit; drives pulse animation only when the number changes. */
let _lastCountdownN = null;
/** Slot index of the local human player from the last score update. */
let _lastLocalIdx = null;
/** Cached score rows in display order (local → humans → NPCs); rebuilt when scores or slot metadata change. */
let _sortedScoreRows = null;
/** Last rendered scores per slot — shallow compare avoids per-frame string allocation. */
let _lastScores = [0, 0, 0, 0];
/** Last rendered slot name:color per slot index. */
let _lastSlotMeta = ["", "", "", ""];
/** Cached display values — skip redundant style.display writes each frame. */
let _statusDisplay = null;
let _timerDisplay = null;
let _scoresDisplay = null;
/** Previous local ready state — drives ready-button toggle animation. */
let _lastReadyState = null;

export const HUD_CSS = `
    #hud {
      --hud-ui: "Russo One", sans-serif;
      --hud-display: "Road Rage", "Goldman", sans-serif;
      --hud-mono: "Goldman", ui-monospace, monospace;
      --hud-glow: #22e6ff;
      --hud-pad: clamp(8px, 1.5vw, 18px);
      --hud-radius: clamp(4px, 0.8vw, 6px);
      --hud-panel-bg: rgba(0,0,0,0.75);
      --hud-border: 2px solid rgba(255,255,255,0.15);
      --hud-timer-reserve: clamp(128px, 15vw, 208px);
      --hud-audio-reserve: clamp(150px, 20vw, 240px);
      --hud-menu-reserve: 0px;
      --hud-feed-top: clamp(96px, 12vh, 120px);
      position: fixed;
      inset: 0;
      z-index: 20000;
      pointer-events: none;
      font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
      color: #ffffff;
      text-shadow: 0 2px 12px rgba(0,0,0,0.85);
    }

    #hud .hud-status {
      position: absolute;
      top: 20vh;
      left: 50%;
      transform: translateX(-50%);
      font-family: var(--hud-ui);
      font-size: clamp(3.15rem, 9vw, 5.4rem);
      font-weight: 900;
      letter-spacing: 0.06em;
      padding: clamp(4px, 1vw, 10px) clamp(8px, 1.5vw, 14px);
      color: #ff2bd6;
      text-shadow: 4px 4px 0 #22e6ff, 0 0 24px #ff2bd6, 0 0 42px #ff2bd6;
      display: none;
      white-space: nowrap;
      z-index: 10;
    }

    /* Rampage Combo HUD Badge */
    #hud .hud-combo-badge {
      position: absolute;
      bottom: clamp(60px, 10vh, 100px);
      left: 50%;
      transform: translateX(-50%) scale(0.8);
      display: none;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: clamp(6px, 1vw, 10px) clamp(16px, 2.5vw, 24px);
      background: var(--hud-panel-bg);
      border: var(--hud-border);
      border-radius: var(--hud-radius);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      pointer-events: none;
      z-index: 15;
      opacity: 0;
      transition: opacity 180ms ease, transform 200ms cubic-bezier(0.175, 0.885, 0.32, 1.275);
    }
    #hud .hud-combo-badge.active {
      display: flex;
      opacity: 1;
      transform: translateX(-50%) scale(1);
    }
    #hud .hud-combo-content {
      display: flex;
      align-items: baseline;
      gap: clamp(6px, 1vw, 10px);
    }
    #hud .hud-combo-multiplier {
      font-family: var(--hud-display);
      font-size: clamp(24px, 4vw, 42px);
      font-weight: 900;
      line-height: 1;
      letter-spacing: 1px;
      color: #ffaa00;
      text-shadow: 0 0 16px #ffaa0088;
    }
    #hud .hud-combo-tier {
      font-family: var(--hud-mono);
      font-size: clamp(12px, 1.8vw, 18px);
      font-weight: 900;
      letter-spacing: 2px;
      text-transform: uppercase;
      color: #ffffff;
    }
    #hud .hud-combo-bar-track {
      width: 100%;
      height: 4px;
      background: rgba(255,255,255,0.15);
      border-radius: 2px;
      margin-top: 6px;
      overflow: hidden;
    }
    #hud .hud-combo-bar-fill {
      height: 100%;
      width: 100%;
      background: #ffaa00;
      box-shadow: 0 0 8px #ffaa00;
      transform-origin: left center;
      transition: width 60ms linear;
    }
    /* Tier specific themes */
    #hud .hud-combo-badge.tier-1 .hud-combo-multiplier { color: #ffaa00; text-shadow: 0 0 16px #ffaa00aa; }
    #hud .hud-combo-badge.tier-1 .hud-combo-bar-fill { background: #ffaa00; box-shadow: 0 0 8px #ffaa00; }
    #hud .hud-combo-badge.tier-2 .hud-combo-multiplier { color: #ff3366; text-shadow: 0 0 20px #ff3366cc; }
    #hud .hud-combo-badge.tier-2 .hud-combo-tier { color: #ff99bb; }
    #hud .hud-combo-badge.tier-2 .hud-combo-bar-fill { background: #ff3366; box-shadow: 0 0 10px #ff3366; }
    #hud .hud-combo-badge.tier-3 .hud-combo-multiplier { color: #00f3ff; text-shadow: 0 0 24px #00f3ff, 0 0 40px #ff0077; animation: comboPulse 0.5s ease-in-out infinite alternate; }
    #hud .hud-combo-badge.tier-3 .hud-combo-tier { color: #ff0077; text-shadow: 0 0 12px #ff0077; }
    #hud .hud-combo-badge.tier-3 .hud-combo-bar-fill { background: linear-gradient(90deg, #00f3ff, #ff0077); box-shadow: 0 0 12px #00f3ff; }

    @keyframes comboPulse {
      0% { transform: scale(1); }
      100% { transform: scale(1.06); }
    }

    #hud .hud-timer {
      position: absolute;
      top: var(--hud-pad);
      left: var(--hud-pad);
      display: none;
      align-items: stretch;
      justify-content: flex-start;
      flex-direction: row;
      background: var(--hud-panel-bg);
      border: var(--hud-border);
      border-radius: var(--hud-radius);
      backdrop-filter: blur(6px);
      -webkit-backdrop-filter: blur(6px);
      overflow: hidden;
      pointer-events: none;
    }

    #hud .hud-timer-stripe {
      width: clamp(4px, 0.8vw, 8px);
      background: #39ff14;
      box-shadow: 0 0 12px #39ff14aa;
      flex: 0 0 auto;
    }

    #hud .hud-timer-body {
      padding: clamp(6px, 1vw, 10px) clamp(10px, 1.5vw, 20px) clamp(8px, 1vw, 12px) clamp(10px, 1vw, 16px);
      min-width: clamp(120px, 15vw, 200px);
      display: flex;
      flex-direction: column;
      gap: clamp(4px, 0.8vw, 8px);
    }

    #hud .hud-timer-meta {
      display: flex;
      align-items: center;
      gap: clamp(4px, 0.8vw, 8px);
      font-family: "Space Grotesk", ui-monospace, monospace;
      font-size: clamp(10px, 1.2vw, 13px);
      letter-spacing: 2px;
      color: rgba(255,255,255,0.6);
      text-transform: uppercase;
      line-height: 1;
    }

    #hud .hud-timer-pip {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #39ff14;
      box-shadow: 0 0 6px #39ff14;
      flex: 0 0 auto;
    }

    #hud .hud-timer-rd {
      margin-left: auto;
      color: rgba(255,255,255,0.45);
      font-size: clamp(10px, 1.1vw, 12px);
      letter-spacing: 1px;
    }

    #hud .hud-timer-num {
      font-family: "Michroma", sans-serif;
      font-size: clamp(28px, 5.5vw, 54px);
      line-height: 1;
      letter-spacing: 4px;
      color: #ffffff;
      text-shadow: 0 0 20px rgba(57,255,20,0.4);
    }

    #hud .hud-timer-bar {
      height: clamp(4px, 0.8vw, 5px);
      background: rgba(255,255,255,0.1);
      border-radius: 3px;
      overflow: hidden;
    }

    #hud .hud-timer-bar i {
      display: block;
      height: 100%;
      width: 0%;
      background: linear-gradient(90deg, #39ff14, #22e6ff);
      border-radius: 3px;
      box-shadow: 0 0 8px #39ff1488;
    }

    #hud .hud-scores {
      position: absolute;
      top: var(--hud-pad);
      left: 50%;
      transform: translateX(-50%);
      display: none;
      flex-direction: row;
      flex-wrap: nowrap;
      gap: 0;
      align-items: center;
      justify-content: center;
      background: var(--hud-panel-bg);
      border: var(--hud-border);
      border-radius: var(--hud-radius);
      backdrop-filter: blur(6px);
      -webkit-backdrop-filter: blur(6px);
      overflow: hidden;
      width: max-content;
      max-width: calc(100% - (var(--hud-pad) * 2) - var(--hud-timer-reserve) - var(--hud-audio-reserve));
    }

    #hud .hud-scoreBox {
      --hud-glow: #22e6ff;
      flex: 0 1 auto;
      min-width: 0;
      padding: clamp(6px, 1.2vw, 14px) clamp(8px, 1.5vw, 18px);
      display: flex;
      flex-direction: row;
      align-items: center;
      gap: clamp(4px, 0.8vw, 8px);
      border-right: 1px solid rgba(255,255,255,0.08);
    }

    #hud .hud-scoreBox:last-child {
      border-right: none;
    }

    #hud .hud-scoreBox[data-hud-color="pink"] { --hud-glow: #ff00ff; }
    #hud .hud-scoreBox[data-hud-color="blue"] { --hud-glow: #00ffff; }
    #hud .hud-scoreBox[data-hud-color="green"] { --hud-glow: #00ff00; }
    #hud .hud-scoreBox[data-hud-color="yellow"] { --hud-glow: #ffff00; }
    #hud .hud-scoreBox[data-hud-color="neonOrange"] { --hud-glow: #ff6600; }

    #hud .hud-scoreRank {
      font-family: "Bungee", cursive, system-ui, sans-serif;
      font-size: clamp(12px, 1.4vw, 16px);
      color: var(--hud-glow);
      text-shadow: 0 0 8px var(--hud-glow);
      min-width: 16px;
      flex-shrink: 0;
    }

    #hud .hud-scoreLabel {
      font-family: "Michroma", sans-serif;
      font-size: clamp(11px, 1.2vw, 14px);
      letter-spacing: 1px;
      text-transform: uppercase;
      flex: 0 1 auto;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: #ffffff;
      text-shadow: 0 0 6px rgba(255,255,255,0.2);
    }

    #hud .hud-scoreValue {
      font-family: "Bungee", cursive, system-ui, sans-serif;
      font-size: clamp(13px, 1.5vw, 18px);
      color: var(--hud-glow);
      text-shadow: 0 0 10px var(--hud-glow);
      min-width: 1.5em;
      flex-shrink: 0;
      text-align: right;
    }

    #hud .hud-scoreYou {
      font-family: "Bungee", cursive, system-ui, sans-serif;
      font-size: 9px;
      background: var(--hud-glow);
      color: #000000;
      padding: 2px 5px;
      border-radius: 3px;
      letter-spacing: 1px;
      box-shadow: 0 0 8px var(--hud-glow);
      flex-shrink: 0;
      display: none;
    }

    #hud .hud-feed {
      position: absolute;
      top: var(--hud-feed-top);
      right: var(--hud-pad);
      max-width: calc(100% - var(--hud-pad) - var(--hud-audio-reserve));
      display: flex;
      flex-direction: column;
      gap: clamp(4px, 0.8vw, 8px);
      z-index: 20000;
      text-align: right;
      pointer-events: none;
    }

    #hud .hud-feed-row {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 8px;
      font-size: clamp(11px, 1.3vw, 14px);
      letter-spacing: 1.5px;
      text-transform: uppercase;
      opacity: 0;
      will-change: transform, opacity;
    }

    #hud .hud-feed-actor {
      font-family: "Michroma", sans-serif;
      font-size: clamp(11px, 1.3vw, 14px);
      color: var(--c);
      text-shadow: 0 0 8px var(--c);
      flex-shrink: 0;
    }

    #hud .hud-feed-verb {
      font-family: "Michroma", sans-serif;
      font-size: clamp(10px, 1.1vw, 12px);
      color: rgba(255,255,255,0.45);
      letter-spacing: 2px;
      flex-shrink: 0;
    }

    #hud .hud-feed-target {
      font-family: "Michroma", sans-serif;
      font-size: clamp(11px, 1.3vw, 14px);
      color: var(--c2);
      text-shadow: 0 0 8px var(--c2);
      flex-shrink: 0;
    }

    @media (prefers-reduced-motion: reduce) {
      #hud .hud-feed-row {
        opacity: 0.9;
        transform: none;
      }
    }

    #hud .hud-scoreBox.isLocal .hud-scoreLabel,
    #hud .hud-scoreBox.isLocal .hud-scoreValue {
      font-weight: 900;
    }

    #hud .hud-ready-btn {
      --btn-glow: #22e6ff;
      position: absolute;
      bottom: clamp(40px, 10vh, 80px);
      left: 50%;
      transform: translateX(-50%);
      font-family: 'Bungee', cursive, system-ui, sans-serif;
      font-size: clamp(1.1rem, 3vw, 1.6rem);
      letter-spacing: 0.1em;
      padding: clamp(8px, 1.5vw, 14px) clamp(20px, 4vw, 40px);
      background: rgba(0, 0, 0, 0.85);
      color: var(--btn-glow);
      border: 2px solid var(--btn-glow);
      border-radius: 6px;
      cursor: pointer;
      pointer-events: auto;
      text-transform: uppercase;
      display: none;
      white-space: nowrap;
      text-shadow: 0 0 10px var(--btn-glow);
      box-shadow: 0 0 12px var(--btn-glow), 0 0 28px color-mix(in oklab, var(--btn-glow), transparent 60%);
      transition: transform 120ms ease, box-shadow 180ms ease, background 180ms ease;
      animation: readyPulse 2s ease-in-out infinite;
    }

    #hud .hud-ready-btn:hover {
      transform: translateX(-50%) translateY(-2px) scale(1.02);
      background: rgba(0, 0, 0, 0.65);
      box-shadow: 0 0 20px var(--btn-glow), 0 0 44px var(--btn-glow);
    }

    #hud .hud-ready-btn.is-ready {
      --btn-glow: #8dff2b;
      animation: readyPulse 1.2s ease-in-out infinite;
    }

    @keyframes readyPulse {
      0%, 100% { box-shadow: 0 0 12px var(--btn-glow, #22e6ff), 0 0 28px color-mix(in oklab, var(--btn-glow, #22e6ff), transparent 60%); }
      50%       { box-shadow: 0 0 20px var(--btn-glow, #22e6ff), 0 0 44px var(--btn-glow, #22e6ff); }
    }

    #hud .hud-audio {
      position: absolute;
      top: var(--hud-pad);
      right: calc(max(var(--hud-pad), env(safe-area-inset-right, 0px)) + var(--hud-menu-reserve));
      display: flex;
      align-items: center;
      gap: clamp(4px, 0.8vw, 8px);
      padding: clamp(4px, 1vw, 8px) clamp(8px, 1.5vw, 14px);
      background: var(--hud-panel-bg);
      border: var(--hud-border);
      border-radius: var(--hud-radius);
      backdrop-filter: blur(6px);
      -webkit-backdrop-filter: blur(6px);
      pointer-events: auto;
      z-index: 20001;
    }

    #hud .hud-mute-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: clamp(24px, 3vw, 28px);
      height: clamp(24px, 3vw, 28px);
      border-radius: 6px;
      border: 1px solid rgba(255,255,255,0.15);
      background: rgba(0, 0, 0, 0.4);
      color: #ffffff;
      cursor: pointer;
      font-size: clamp(12px, 1.5vw, 14px);
      transition: transform 150ms, background 150ms;
    }
    #hud .hud-mute-btn:hover {
      transform: scale(1.08);
      background: rgba(255, 255, 255, 0.08);
    }
    #hud .hud-mute-btn.muted {
      color: #888;
      border-color: rgba(255, 80, 80, 0.3);
    }
    #hud .hud-vol-stack {
      display: flex;
      flex-direction: column;
      gap: clamp(4px, 0.8vw, 6px);
    }
    #hud .hud-vol-row {
      display: flex;
      align-items: center;
      gap: clamp(4px, 0.8vw, 6px);
    }
    #hud .hud-vol-label {
      width: clamp(12px, 1.5vw, 14px);
      text-align: center;
      color: rgba(255,255,255,0.6);
      font-size: clamp(10px, 1.2vw, 12px);
    }
    #hud .hud-vol-track {
      -webkit-appearance: none;
      appearance: none;
      width: clamp(60px, 8vw, 80px);
      height: 16px;
      margin: 0;
      padding: 0;
      border: none;
      background: transparent;
      cursor: pointer;
      flex: 0 0 auto;
      pointer-events: auto;
      --vol-pct: 50%;
    }
    #hud .hud-vol-track::-webkit-slider-runnable-track {
      height: 5px;
      border-radius: 3px;
      background: linear-gradient(
        to right,
        #ffffff var(--vol-pct),
        rgba(255, 255, 255, 0.1) var(--vol-pct)
      );
    }
    #hud .hud-vol-track::-moz-range-track {
      height: 5px;
      border-radius: 3px;
      background: rgba(255, 255, 255, 0.1);
    }
    #hud .hud-vol-track::-moz-range-progress {
      height: 5px;
      border-radius: 3px;
      background: #ffffff;
    }
    #hud .hud-vol-track::-webkit-slider-thumb {
      -webkit-appearance: none;
      width: 10px;
      height: 10px;
      margin-top: -2.5px;
      border-radius: 50%;
      background: #ffffff;
      box-shadow: 0 0 4px rgba(255, 255, 255, 0.5);
    }
    #hud .hud-vol-track::-moz-range-thumb {
      width: 10px;
      height: 10px;
      border: none;
      border-radius: 50%;
      background: #ffffff;
      box-shadow: 0 0 4px rgba(255, 255, 255, 0.5);
    }
    #hud .hud-vol-track:focus-visible {
      outline: 2px solid #22e6ff;
      outline-offset: 2px;
    }
    #hud .hud-vol-val {
      font-family: 'Space Mono', monospace;
      font-size: clamp(9px, 1.1vw, 10px);
      font-weight: 700;
      color: rgba(255,255,255,0.5);
      min-width: clamp(18px, 2vw, 22px);
      text-align: right;
      letter-spacing: 0.05em;
    }

    /* Large desktops — grow to full names; ellipsize only when bar hits timer/audio bounds */
    @media (min-width: 1201px) {
      #hud {
        --hud-timer-reserve: clamp(148px, 11vw, 200px);
        --hud-audio-reserve: clamp(168px, 13vw, 228px);
      }
      #hud .hud-scores {
        width: fit-content;
      }
      #hud .hud-scoreBox {
        flex: 0 1 auto;
        min-width: 0;
        width: auto;
      }
      #hud .hud-scoreLabel {
        flex: 0 1 auto;
        width: auto;
        max-width: none;
      }
    }

    /* Tighter score bar on medium desktops — structural shrink, not scale hacks */
    @media (max-width: 1200px) {
      #hud {
        --hud-timer-reserve: clamp(112px, 14vw, 180px);
        --hud-audio-reserve: clamp(136px, 18vw, 210px);
        --hud-feed-top: clamp(104px, 13vh, 128px);
      }
      #hud .hud-scoreBox {
        padding: clamp(4px, 1vw, 10px) clamp(6px, 1.2vw, 12px);
        gap: clamp(3px, 0.6vw, 6px);
      }
      #hud .hud-scoreRank {
        font-size: clamp(11px, 1.2vw, 14px);
      }
      #hud .hud-scoreLabel {
        font-size: clamp(10px, 1.1vw, 12px);
      }
      #hud .hud-scoreValue {
        font-size: clamp(12px, 1.3vw, 16px);
      }
      #hud .hud-scoreYou {
        display: none !important;
      }
    }

    /* Compact top bar before dock — rank + score only when horizontal space is tight */
    @media (max-width: 1024px) and (min-width: 901px) {
      #hud {
        --hud-timer-reserve: clamp(100px, 13vw, 160px);
        --hud-audio-reserve: clamp(120px, 16vw, 180px);
        --hud-feed-top: clamp(112px, 15vh, 136px);
      }
      #hud .hud-scoreBox {
        flex: 1 1 0;
        min-width: 0;
        padding: clamp(4px, 0.8vw, 8px) clamp(5px, 1vw, 10px);
      }
      #hud .hud-scoreLabel {
        display: none;
      }
    }

    /* Dock score bar to bottom on narrow viewports */
    @media (max-width: 900px) {
      #hud {
        --hud-audio-reserve: clamp(56px, 14vw, 72px);
        --hud-feed-top: clamp(120px, 17vh, 148px);
      }
      #hud .hud-scores {
        top: auto;
        bottom: max(var(--hud-pad), env(safe-area-inset-bottom, 0px));
        left: var(--hud-pad);
        right: var(--hud-pad);
        transform: none;
        width: auto;
        max-width: none;
        border-radius: var(--hud-radius);
        border: var(--hud-border);
      }
      #hud .hud-scoreBox {
        flex: 1 1 0;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 2px;
        padding: clamp(4px, 1.2vw, 6px) clamp(2px, 0.8vw, 4px);
        min-width: 0;
      }
      #hud .hud-scoreRank {
        font-size: clamp(9px, 2.2vw, 11px);
        min-width: 0;
      }
      #hud .hud-scoreLabel {
        display: block;
        font-size: clamp(8px, 2vw, 9px);
        letter-spacing: 0;
        text-align: center;
        width: 100%;
      }
      #hud .hud-scoreValue {
        font-size: clamp(11px, 2.8vw, 13px);
        min-width: 0;
      }
      #hud .hud-scoreYou {
        display: none !important;
      }
      #hud .hud-feed {
        max-width: calc(100% - var(--hud-pad) * 2);
      }
    }

    @media (max-width: 768px) {
      #hud {
        --hud-feed-top: clamp(128px, 18vh, 156px);
      }
    }
    
    @media (max-width: 480px) {
      #hud {
        --hud-feed-top: clamp(116px, 17vh, 140px);
      }
      #hud .hud-audio {
        flex-direction: column;
        gap: 4px;
        padding: 4px 8px;
      }
      #hud .hud-vol-stack {
        display: none;
      }
      #hud .hud-timer-body {
        min-width: clamp(96px, 28vw, 120px);
        padding: 5px 8px 6px 10px;
        gap: 4px;
      }
      #hud .hud-timer-num {
        font-size: clamp(22px, 6vw, 28px);
        letter-spacing: 2px;
      }
      #hud .hud-timer-meta {
        font-size: clamp(9px, 2.2vw, 11px);
        letter-spacing: 1px;
      }
      #hud .hud-scoreLabel {
        display: none;
      }
    }

    /* Sudden Death — red timer theme */
    #hud.hud-sudden-death .hud-timer-stripe {
      background: #ff3333;
      box-shadow: 0 0 12px #ff3333aa;
    }

    #hud.hud-sudden-death .hud-timer-pip {
      background: #ff3333;
      box-shadow: 0 0 6px #ff3333;
    }

    #hud.hud-sudden-death .hud-timer-bar i {
      background: linear-gradient(90deg, #ff3333, #ff6666);
      box-shadow: 0 0 8px #ff333388;
    }

    #hud.hud-sudden-death .hud-timer-num {
      text-shadow: 0 0 20px rgba(255, 51, 51, 0.6);
    }

    @keyframes suddenDeathPulse {
      0%, 100% { opacity: 0.7; transform: translateX(-50%) scale(1); }
      50%      { opacity: 1;    transform: translateX(-50%) scale(1.06); }
    }

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

    /* Touch-only in-game menu button (opens Esc overlay). */
    #hud .hud-menu-btn {
      display: none;
      position: absolute;
      top: max(var(--hud-pad), env(safe-area-inset-top, 0px));
      right: max(var(--hud-pad), env(safe-area-inset-right, 0px));
      z-index: 20002;
      align-items: center;
      justify-content: center;
      width: clamp(44px, 11vmin, 52px);
      height: clamp(44px, 11vmin, 52px);
      min-width: 44px;
      min-height: 44px;
      padding: 0;
      border-radius: clamp(10px, 2.5vmin, 12px);
      border: 2px solid rgba(34, 230, 255, 0.32);
      background: rgba(0, 0, 0, 0.72);
      color: rgba(255, 255, 255, 0.92);
      font-size: clamp(17px, 4.5vmin, 20px);
      line-height: 1;
      cursor: pointer;
      pointer-events: auto;
      touch-action: manipulation;
      box-shadow: 0 0 12px rgba(34, 230, 255, 0.16);
      backdrop-filter: blur(6px);
      -webkit-backdrop-filter: blur(6px);
      transition: transform 80ms ease, border-color 80ms ease, background 80ms ease;
    }

    #hud.hud-has-menu-btn .hud-menu-btn {
      display: flex;
    }

    #hud.hud-hide-audio .hud-audio {
      display: none !important;
    }

    #hud.hud-hide-audio {
      --hud-audio-reserve: 0px;
    }

    #hud .hud-menu-btn:active {
      transform: scale(0.94);
      border-color: rgba(34, 230, 255, 0.55);
      background: rgba(34, 230, 255, 0.12);
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
    #hud.hud-sudden-death .hud-timer-pip {
      background: #ff3333;
      box-shadow: 0 0 6px #ff3333;
    }

    #hud.hud-sudden-death .hud-timer-bar i {
      background: linear-gradient(90deg, #ff3333, #ff6666);
      box-shadow: 0 0 8px #ff333388;
    }

    #hud.hud-sudden-death .hud-timer-num {
      text-shadow: 0 0 20px rgba(255, 51, 51, 0.6);
    }

    @keyframes suddenDeathPulse {
      0%, 100% { opacity: 0.7; transform: translateX(-50%) scale(1); }
      50%      { opacity: 1;    transform: translateX(-50%) scale(1.06); }
    }
  `.trim();


function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function clampInt(value, min, max) {
  const v = Math.round(value);
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, v));
}

/** Returns the client's local clock adjusted to approximate the host's wall clock. */
function adjustedNow() {
  return Date.now() - getServerClockOffsetMs();
}

function setHudSuppressed(suppressed) {
  if (elements.root) {
    elements.root.classList.toggle("hud-suppressed", suppressed);
  }
}

/** @type {number | null} */
let hudLayoutRaf = null;
let hudLayoutBound = false;

/**
 * Returns true when two visible HUD rects overlap (with optional gap).
 * @param {DOMRect} a
 * @param {DOMRect} b
 * @param {number} gap
 */
function hudRectsOverlap(a, b, gap = 6) {
  if (a.width <= 0 || a.height <= 0 || b.width <= 0 || b.height <= 0) return false;
  return (
    a.left < b.right + gap &&
    a.right > b.left - gap &&
    a.top < b.bottom + gap &&
    a.bottom > b.top - gap
  );
}

/**
 * True when the in-game audio widget cannot fit beside the menu button and other HUD chrome.
 */
function detectTightHudSpace() {
  const audio = elements.audio;
  const menu = elements.menuBtn;
  if (!audio || !menu || menu.style.display === "none") return false;

  const audioRect = audio.getBoundingClientRect();
  const menuRect = menu.getBoundingClientRect();
  if (audioRect.width <= 0 || menuRect.width <= 0) return false;

  if (audioRect.right > menuRect.left - 4) return true;

  const timerRect = elements.timer?.getBoundingClientRect();
  if (timerRect && timerRect.width > 0 && hudRectsOverlap(audioRect, timerRect, 8)) {
    return true;
  }

  const scoresRect = elements.scores?.getBoundingClientRect();
  if (scoresRect && scoresRect.height > 0 && scoresRect.top < window.innerHeight * 0.35) {
    if (hudRectsOverlap(audioRect, scoresRect, 8)) return true;
  }

  return false;
}

function applyHudLayoutState(showMenuBtn, hideAudio) {
  if (!elements.root) return;
  elements.root.classList.toggle("hud-has-menu-btn", showMenuBtn);
  elements.root.classList.toggle("hud-hide-audio", hideAudio);
  if (hideAudio) {
    elements.root.style.setProperty("--hud-audio-reserve", "0px");
  } else {
    elements.root.style.removeProperty("--hud-audio-reserve");
  }
}

/**
 * Positions the audio widget beside the menu button when possible; hides it when space is tight.
 */
export function syncHudLayout() {
  if (!elements.root) return;

  const menuVisible = _options.getMenuVisible ? _options.getMenuVisible() : false;
  const touch = _options.getIsTouchDevice ? _options.getIsTouchDevice() : false;
  const escOpen = isEscOverlayVisible();
  const showMenuBtn = touch && !menuVisible && !escOpen;

  if (!showMenuBtn) {
    elements.root.style.setProperty("--hud-menu-reserve", "0px");
    applyHudLayoutState(false, false);
    if (elements.audio && !menuVisible && !escOpen) {
      elements.audio.style.display = "flex";
    }
    return;
  }

  if (elements.menuBtn) {
    elements.menuBtn.style.display = "flex";
  }
  if (elements.audio) {
    elements.audio.style.display = "flex";
  }

  const menuW = elements.menuBtn?.offsetWidth ?? 48;
  elements.root.style.setProperty("--hud-menu-reserve", `${menuW + 8}px`);

  const tight = detectTightHudSpace();
  applyHudLayoutState(true, tight);
  if (elements.audio) {
    elements.audio.style.display = tight ? "none" : "flex";
  }
}

function scheduleHudLayoutSync() {
  if (hudLayoutRaf != null) return;
  hudLayoutRaf = requestAnimationFrame(() => {
    hudLayoutRaf = null;
    syncHudLayout();
  });
}

function bindHudLayoutSync() {
  if (hudLayoutBound) return;
  hudLayoutBound = true;
  window.addEventListener("resize", scheduleHudLayoutSync, { passive: true });
  window.addEventListener("orientationchange", scheduleHudLayoutSync, { passive: true });
}

/**
 * Shows or hides the touch menu button based on game/menu/overlay state.
 * @param {boolean} menuVisible
 */
function updateMenuButtonVisibility(menuVisible) {
  if (!elements.menuBtn) return;
  const touch = _options.getIsTouchDevice ? _options.getIsTouchDevice() : false;
  const escOpen = isEscOverlayVisible();
  const show = touch && !menuVisible && !escOpen;
  const nextDisplay = show ? "flex" : "none";
  if (elements.menuBtn.style.display !== nextDisplay) {
    elements.menuBtn.style.display = nextDisplay;
    scheduleHudLayoutSync();
  }
}

/**
 * Sets element display only when the value changes.
 * @param {HTMLElement|null} el
 * @param {string} display
 * @param {"status"|"timer"|"scores"} cacheKey
 */
function setHudDisplay(el, display, cacheKey) {
  if (!el) return;
  const cache = cacheKey === "status" ? _statusDisplay
    : cacheKey === "timer" ? _timerDisplay
      : _scoresDisplay;
  if (cache === display) return;
  if (cacheKey === "status") _statusDisplay = display;
  else if (cacheKey === "timer") _timerDisplay = display;
  else _scoresDisplay = display;
  el.style.display = display;
}

export function colorHexToCss(hex) {
  return `#${Number(hex || 0).toString(16).padStart(6, "0")}`;
}

export function pickKillFeedVerb(hit) {
  if (hit?.wasCritical) return "BOOSTED OFF";
  const verbs = ["YEETED", "RAMMED", "BOOSTED OFF"];
  return verbs[Math.floor(Math.random() * verbs.length)];
}

/**
 * Picks a random self-death verb for fall/suicide kill feed messages.
 * @returns {string}
 */
export function pickSelfDeathVerb() {
  const verbs = [
    "FELL OFF",
    "ATE PAVEMENT",
    "TAPPED OUT",
    "SELF-DESTRUCTED",
    "NOPED OUT",
    "RAGE QUIT",
  ];
  return verbs[Math.floor(Math.random() * verbs.length)];
}



/**
 * Updates the center status line (GO!, countdown).
 * @param {object} roundState
 */
function updateStatus(roundState) {
  const roundPhase = roundState?.phase;
  const roundCountdownStartedAtMs = roundState?.countdownStartedAtMs;

  const prevPhase = _prevRoundPhase;
  if (prevPhase === "countdown" && roundPhase === "running") {
    _goUntilMs = Date.now() + 500;
    if (!_goSoundPlayed) {
      _goSoundPlayed = true;
      AudioManager.playSfx("countdown_go");
    }
  }
  _prevRoundPhase = roundPhase;

  if (Date.now() < _goUntilMs) {
    setHudDisplay(elements.status, "block", "status");
    elements.status.style.color = "#22e6ff";
    elements.status.textContent = "GO!";
  } else if (roundPhase === "countdown") {
    // * Reset GO sound gate when entering countdown from a non-countdown phase.
    if (prevPhase !== "countdown") {
      _goSoundPlayed = false;
    }
    const countdownMs = roundState?.countdownMs
      ?? (_options.getCountdownMs ? _options.getCountdownMs() : 3000);
    const elapsedMs = adjustedNow() - (roundCountdownStartedAtMs || 0);
    const remainingMs = countdownMs - elapsedMs;
    const n = clampInt(Math.ceil(remainingMs / 1000), 1, Math.ceil(countdownMs / 1000));
    setHudDisplay(elements.status, "block", "status");
    elements.status.style.color = "#ff2bd6";
    elements.status.textContent = `GET READY  ${n}`;
    if (_lastCountdownN !== n) {
      _lastCountdownN = n;
      AudioManager.playSfx(`countdown_${n}`);
      elements.status.animate(
        [
          { transform: "translateX(-50%) scale(1)" },
          { transform: "translateX(-50%) scale(1.3)", offset: 0.4 },
          { transform: "translateX(-50%) scale(1)" },
        ],
        { duration: 200, easing: "ease-out" },
      );
    }
  } else if (roundPhase === "podium") {
    setHudDisplay(elements.status, "none", "status");
    elements.status.textContent = "";
  } else if (roundPhase === "running" && roundState?.isSuddenDeath) {
    setHudDisplay(elements.status, "block", "status");
    elements.status.style.color = "#ff3333";
    elements.status.style.textShadow = "4px 4px 0 #ff000044, 0 0 24px #ff3333, 0 0 48px #ff3333";
    elements.status.textContent = "SUDDEN DEATH";
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
    if (!reduced) {
      elements.status.style.animation = "suddenDeathPulse 0.8s ease-in-out infinite";
    }
  } else {
    setHudDisplay(elements.status, "none", "status");
    elements.status.textContent = "";
    elements.status.style.animation = "";
  }
}

/**
 * Updates the round timer display and progress bar.
 * @param {object} roundState
 * @param {number} matchHistoryLength
 */
function updateTimer(roundState, matchHistoryLength) {
  if (_options.detectGameMode?.() === "testdrive") {
    setHudDisplay(elements.timer, "none", "timer");
    if (elements.timerNum) elements.timerNum.textContent = "";
    if (elements.timerRd) elements.timerRd.textContent = "";
    if (elements.timerFill) elements.timerFill.style.width = "0%";
    return;
  }

  const roundPhase = roundState?.phase;
  const roundStartedAtMs = roundState?.startedAtMs;

  if (roundPhase === "running") {
    const isSuddenDeath = roundState?.isSuddenDeath === true;
    const elapsedMs = adjustedNow() - (roundStartedAtMs || 0);
    const totalRoundMs = roundState?.totalRoundMs
      ?? (_options.getDefaultRoundMs ? _options.getDefaultRoundMs() : 60000);
    const remainingMs = isSuddenDeath ? 0 : totalRoundMs - elapsedMs;
    const seconds = clampInt(Math.ceil(remainingMs / 1000), 0, Math.ceil(totalRoundMs / 1000));
    const minutes = Math.floor(seconds / 60);
    const secondsPart = seconds % 60;
    const text = minutes > 0
      ? `${minutes}:${String(secondsPart).padStart(2, "0")}`
      : `:${String(secondsPart).padStart(2, "0")}`;
    setHudDisplay(elements.timer, "flex", "timer");
    if (elements.timerNum) elements.timerNum.textContent = text;
    if (elements.timerRd) {
      const currentRound = Math.max(1, matchHistoryLength + 1);
      elements.timerRd.textContent = `RD ${currentRound}`;
    }
    if (elements.timerFill) {
      const pct = clamp(remainingMs / totalRoundMs, 0, 1) * 100;
      elements.timerFill.style.width = `${pct}%`;
    }
    // * Sudden Death red theme — applied to HUD root so all timer sub-elements turn red.
    if (elements.root) {
      elements.root.classList.toggle("hud-sudden-death", isSuddenDeath);
    }
  } else {
    setHudDisplay(elements.timer, "none", "timer");
    if (elements.timerNum) elements.timerNum.textContent = "";
    if (elements.timerRd) elements.timerRd.textContent = "";
    if (elements.timerFill) elements.timerFill.style.width = "0%";
    if (elements.root) {
      elements.root.classList.remove("hud-sudden-death");
    }
  }
}

/**
 * Display-order tier: local human, other humans, then NPCs.
 * @param {{ kind?: string, connId?: string|null }} row
 * @param {string|null} youConnId
 * @returns {number}
 */
function scoreboardDisplayTier(row, youConnId) {
  if (row.kind === "human" && row.connId === youConnId) return 0;
  if (row.kind === "human") return 1;
  return 2;
}

/**
 * Sorts scoreboard left-to-right: you, other humans, NPCs; score desc within each tier.
 * @param {{ slotIndex: number, score: number, kind?: string, connId?: string|null }} a
 * @param {{ slotIndex: number, score: number, kind?: string, connId?: string|null }} b
 * @param {string|null} youConnId
 * @returns {number}
 */
function compareScoreboardDisplayOrder(a, b, youConnId) {
  const tierDiff = scoreboardDisplayTier(a, youConnId) - scoreboardDisplayTier(b, youConnId);
  if (tierDiff !== 0) return tierDiff;
  const scoreDiff = b.score - a.score;
  if (scoreDiff !== 0) return scoreDiff;
  return a.slotIndex - b.slotIndex;
}

/**
 * Maps slot index → score rank (1 = highest score).
 * @param {Array<{ slotIndex: number, score: number }>} rows
 * @returns {Map<number, number>}
 */
function scoreRanksBySlot(rows) {
  const ranks = new Map();
  [...rows]
    .sort((a, b) => (b.score - a.score) || (a.slotIndex - b.slotIndex))
    .forEach((row, i) => ranks.set(row.slotIndex, i + 1));
  return ranks;
}

/**
 * Updates the score boxes during a running round.
 * @param {object} roundState
 * @param {Array<object>|null} netSlots
 * @param {string|null} youConnId
 */
function updateScores(roundState, netSlots, youConnId) {
  const roundPhase = roundState?.phase;
  const roundScores = roundState?.scores;

  if (roundPhase === "running") {
    setHudDisplay(elements.scores, "flex", "scores");
    const localIdx = netSlots ? netSlots.findIndex((s) => s && s.kind === "human" && s.connId === youConnId) : -1;

    let dataChanged = false;
    for (let i = 0; i < 4; i += 1) {
      const score = Number(roundScores?.[i] ?? 0);
      const slot = netSlots?.[i];
      const meta = `${slot?.name || `P${i + 1}`}:${slot?.color || ""}:${slot?.kind ?? ""}:${slot?.connId || ""}`;
      if (_lastScores[i] !== score || _lastSlotMeta[i] !== meta) {
        dataChanged = true;
      }
    }
    const localChanged = localIdx !== _lastLocalIdx;
    let prevScoresBySlot = null;

    if (dataChanged) {
      prevScoresBySlot = _lastScores.slice();
      for (let i = 0; i < 4; i += 1) {
        const slot = netSlots?.[i];
        _lastScores[i] = Number(roundScores?.[i] ?? 0);
        _lastSlotMeta[i] = `${slot?.name || `P${i + 1}`}:${slot?.color || ""}:${slot?.kind ?? ""}:${slot?.connId || ""}`;
      }
    }

    if (dataChanged || localChanged) {
      const nextRows = [];
      for (let i = 0; i < 4; i += 1) {
        const slot = netSlots?.[i];
        nextRows.push({
          slotIndex: i,
          score: Number(roundScores?.[i] ?? 0),
          slotName: slot?.name || `P${i + 1}`,
          slotColor: slot?.color || null,
          kind: slot?.kind ?? "",
          connId: slot?.connId || null,
        });
      }
      nextRows.sort((a, b) => compareScoreboardDisplayOrder(a, b, youConnId));
      _sortedScoreRows = nextRows;
    }
    _lastLocalIdx = localIdx;

    if (dataChanged || localChanged) {
      const rows = _sortedScoreRows || [];
      const ranks = scoreRanksBySlot(rows);
      for (let pos = 0; pos < 4; pos += 1) {
        const entry = elements.scoreBoxes[pos];
        const row = rows[pos];
        if (!entry || !row) continue;

        entry.rank.textContent = String(ranks.get(row.slotIndex) ?? pos + 1);
        entry.label.textContent = row.slotName;

        const slot = netSlots?.[row.slotIndex];
        if (slot && slot.kind === "npc") {
          const p = getNpcPersonality(slot.name);
          const info = p ? PERSONALITY_BADGES[p.name] : null;
          if (info) {
            entry.badge.textContent = info.letter;
            entry.badge.style.color = info.color;
            entry.badge.style.display = "inline-block";
          } else {
            entry.badge.style.display = "none";
          }
        } else {
          entry.badge.style.display = "none";
        }

        const isLocal = row.slotIndex === localIdx;
        if (dataChanged && prevScoresBySlot) {
          const oldScore = Number(prevScoresBySlot[row.slotIndex] ?? 0);
          if (row.score > oldScore) {
            animateScorePop(entry.value, { isLocal });
            if (isLocal) {
              animateScorePop(entry.box, { isLocal: true, scalePeak: 1.04, duration: 180 });
            }
          }
        }
        entry.value.textContent = String(row.score);

        if (slot) {
          if (!entry.box.classList.contains("hud-scoreBox")) {
            entry.box.classList.add("hud-scoreBox");
          }
          applyHudScoreBoxGlow(entry.box, slot, youConnId);
        } else {
          entry.box.style.removeProperty("--hud-glow");
          delete entry.box.dataset.hudColor;
        }

        entry.box.classList.toggle("isLocal", isLocal);
        entry.you.style.display = isLocal ? "inline-block" : "none";
      }
    }
  } else {
    setHudDisplay(elements.scores, "none", "scores");
    _lastScores = [0, 0, 0, 0];
    _lastSlotMeta = ["", "", "", ""];
    _sortedScoreRows = null;
    _lastLocalIdx = null;
    for (let i = 0; i < 4; i += 1) {
      const entry = elements.scoreBoxes[i];
      if (entry) {
        entry.box.classList.remove("isLocal");
        entry.value.textContent = "";
        entry.rank.textContent = String(i + 1);
        entry.you.style.display = "none";
      }
    }
  }
}

/**
 * Shows or hides the lobby ready-up button for the local player.
 * @param {string|null|undefined} roundPhase
 * @param {Array<object>|null} netSlots
 * @param {string|null} youConnId
 * @param {boolean} menuVisible
 */
function updateReadyButton(roundPhase, netSlots, youConnId, menuVisible) {
  if (!elements.readyBtn) return;

  const isSolo = _options.detectGameMode?.() === "solo";
  const localSlot = netSlots?.find((s) => s && s.connId === youConnId);
  const isLocalReady = localSlot ? Boolean(localSlot.isReady) : false;
  if (roundPhase === "lobby" && !menuVisible && !isSolo) {
    const nextText = isLocalReady ? "READY!" : "READY UP!";
    elements.readyBtn.style.display = "block";
    if (elements.readyBtn.textContent !== nextText) {
      elements.readyBtn.textContent = nextText;
    }
    elements.readyBtn.classList.toggle("is-ready", isLocalReady);
    if (_lastReadyState !== null && _lastReadyState !== isLocalReady) {
      animateReadyStateToggle(elements.readyBtn, isLocalReady);
    }
    _lastReadyState = isLocalReady;
  } else {
    elements.readyBtn.style.display = "none";
    elements.readyBtn.classList.remove("is-ready");
    _lastReadyState = null;
  }
}

/**
 * Builds HUD DOM, injects styles, and wires event listeners.
 * @param {object} options Callbacks and getters from the game layer.
 * @returns {object} HUD element references and helpers for legacy callers.
 */
export function init(options) {
  _options = options || {};
  _statusDisplay = null;
  _timerDisplay = null;
  _scoresDisplay = null;
  _lastScores = [0, 0, 0, 0];
  _lastSlotMeta = ["", "", "", ""];
  _sortedScoreRows = null;
  _lastLocalIdx = null;
  _lastCountdownN = null;
  _prevRoundPhase = null;
  _goUntilMs = 0;
  _goSoundPlayed = false;
  _lastReadyState = null;

  const existing = document.getElementById("hud");
  if (existing) existing.remove();
  const existingStyle = document.getElementById("hud-style");
  if (existingStyle) existingStyle.remove();

  const style = document.createElement("style");
  style.id = "hud-style";
  style.textContent = HUD_CSS + "\n" + PAUSE_OVERLAY_CSS;
  document.head.appendChild(style);

  elements.root = document.createElement("div");
  elements.root.id = "hud";
  const touchDevice = _options.getIsTouchDevice ? _options.getIsTouchDevice() : false;
  if (touchDevice) elements.root.classList.add("hud-touch");

  elements.status = document.createElement("div");
  elements.status.className = "hud-status";

  elements.timer = document.createElement("div");
  elements.timer.className = "hud-timer";
  const timerStripe = document.createElement("div");
  timerStripe.className = "hud-timer-stripe";
  const timerBody = document.createElement("div");
  timerBody.className = "hud-timer-body";
  const timerMeta = document.createElement("div");
  timerMeta.className = "hud-timer-meta";
  const timerPip = document.createElement("span");
  timerPip.className = "hud-timer-pip";
  const timerMetaText = document.createElement("span");
  timerMetaText.textContent = "TIME LEFT";
  elements.timerRd = document.createElement("span");
  elements.timerRd.className = "hud-timer-rd";
  elements.timerRd.textContent = "";
  timerMeta.appendChild(timerPip);
  timerMeta.appendChild(timerMetaText);
  timerMeta.appendChild(elements.timerRd);

  elements.timerNum = document.createElement("div");
  elements.timerNum.className = "hud-timer-num";
  elements.timerNum.textContent = "";

  const timerBar = document.createElement("div");
  timerBar.className = "hud-timer-bar";
  elements.timerFill = document.createElement("i");
  timerBar.appendChild(elements.timerFill);

  timerBody.appendChild(timerMeta);
  timerBody.appendChild(elements.timerNum);
  timerBody.appendChild(timerBar);
  elements.timer.appendChild(timerStripe);
  elements.timer.appendChild(timerBody);

  elements.scores = document.createElement("div");
  elements.scores.className = "hud-scores";

  elements.feed = document.createElement("div");
  elements.feed.className = "hud-feed";

  elements.scoreBoxes = [];
  for (let i = 0; i < 4; i += 1) {
    const box = document.createElement("div");
    box.className = "hud-scoreBox";

    const rank = document.createElement("div");
    rank.className = "hud-scoreRank";
    rank.textContent = String(i + 1);

    const badge = document.createElement("span");
    badge.className = "hud-scoreBadge";
    badge.style.display = "none";
    badge.style.marginRight = "4px";
    badge.style.fontWeight = "700";

    const label = document.createElement("div");
    label.className = "hud-scoreLabel";
    label.textContent = `P${i + 1}`;

    const you = document.createElement("span");
    you.className = "hud-scoreYou";
    you.textContent = "YOU";

    const value = document.createElement("div");
    value.className = "hud-scoreValue";
    value.textContent = "0";

    box.appendChild(rank);
    box.appendChild(badge);
    box.appendChild(label);
    box.appendChild(you);
    box.appendChild(value);
    elements.scores.appendChild(box);
    elements.scoreBoxes.push({ root: elements.root, box, rank, badge, label, you, value });
  }

  elements.readyBtn = document.createElement("button");
  elements.readyBtn.id = "ready-button";
  elements.readyBtn.className = "hud-ready-btn";
  elements.readyBtn.textContent = "";
  elements.readyBtn.addEventListener("click", () => {
    const pSock = _options.getPartySocket ? _options.getPartySocket() : null;
    const msgType = _options.getReadyToggleMsgType ? _options.getReadyToggleMsgType() : "ready_toggle";
    if (pSock) {
      pSock.send(JSON.stringify({ type: msgType }));
    }
  });
  wireButtonPressFeedback(elements.readyBtn, { scale: 0.96 });

  elements.root.appendChild(elements.status);
  elements.root.appendChild(elements.timer);
  elements.root.appendChild(elements.scores);
  elements.root.appendChild(elements.feed);
  elements.root.appendChild(elements.readyBtn);

  // Rampage Combo HUD Badge
  elements.comboBadge = document.createElement("div");
  elements.comboBadge.className = "hud-combo-badge";
  const comboContent = document.createElement("div");
  comboContent.className = "hud-combo-content";
  elements.comboMultiplier = document.createElement("span");
  elements.comboMultiplier.className = "hud-combo-multiplier";
  elements.comboTier = document.createElement("span");
  elements.comboTier.className = "hud-combo-tier";
  comboContent.appendChild(elements.comboMultiplier);
  comboContent.appendChild(elements.comboTier);
  const comboTrack = document.createElement("div");
  comboTrack.className = "hud-combo-bar-track";
  elements.comboBarFill = document.createElement("div");
  elements.comboBarFill.className = "hud-combo-bar-fill";
  comboTrack.appendChild(elements.comboBarFill);
  elements.comboBadge.appendChild(comboContent);
  elements.comboBadge.appendChild(comboTrack);
  elements.root.appendChild(elements.comboBadge);

  // In-game audio widget
  elements.audio = document.createElement("div");
  elements.audio.className = "hud-audio";

  const isMuted = _options.getIsMuted ? _options.getIsMuted() : false;
  elements.muteBtn = document.createElement("button");
  elements.muteBtn.className = "hud-mute-btn";
  elements.muteBtn.innerHTML = isMuted ? "✕" : "♪";
  if (isMuted) elements.muteBtn.classList.add("muted");
  elements.muteBtn.addEventListener("click", () => {
    if (_options.setIsMuted) {
      _options.setIsMuted(!_options.getIsMuted());
    }
    animateMuteToggle(elements.muteBtn);
    syncAudioControls();
  });
  wireButtonPressFeedback(elements.muteBtn, { scale: 0.92 });

  function createHudVolumeRow(labelText, onChange, ariaLabel, fieldName) {
    const row = document.createElement("div");
    row.className = "hud-vol-row";
    const label = document.createElement("span");
    label.className = "hud-vol-label";
    label.textContent = labelText;
    const input = document.createElement("input");
    input.type = "range";
    input.min = "0";
    input.max = "100";
    input.id = fieldName;
    input.name = fieldName;
    input.className = "hud-vol-track";
    input.setAttribute("aria-label", ariaLabel);
    const val = document.createElement("span");
    val.className = "hud-vol-val";
    input.addEventListener("input", (e) => {
      const valueMax = _options.getAudioVolumeMax ? _options.getAudioVolumeMax() : 1.15;
      const pct = Number(input.value);
      input.style.setProperty("--vol-pct", `${pct}%`);
      onChange(clamp((pct / 100) * valueMax, 0, valueMax));
      animateVolumeTick(val);
      syncAudioControls();
    });
    row.appendChild(label);
    row.appendChild(input);
    row.appendChild(val);
    return { row, input, val };
  }

  elements.musicVol = createHudVolumeRow("♫", (v) => {
    if (_options.setMusicGain) {
      _options.setMusicGain(v);
    }
  }, "Music volume", "hud-music-volume");
  elements.sfxVol = createHudVolumeRow("⚡", (v) => {
    if (_options.setSfxVolume) {
      _options.setSfxVolume(v);
    }
  }, "SFX volume", "hud-sfx-volume");
  const hudVolStack = document.createElement("div");
  hudVolStack.className = "hud-vol-stack";
  hudVolStack.appendChild(elements.musicVol.row);
  hudVolStack.appendChild(elements.sfxVol.row);

  elements.audio.appendChild(elements.muteBtn);
  elements.audio.appendChild(hudVolStack);
  elements.root.appendChild(elements.audio);

  elements.menuBtn = document.createElement("button");
  elements.menuBtn.type = "button";
  elements.menuBtn.className = "hud-menu-btn";
  elements.menuBtn.setAttribute("aria-label", "Open menu");
  elements.menuBtn.textContent = "☰";
  elements.menuBtn.style.display = "none";
  elements.menuBtn.addEventListener("click", () => {
    if (isEscOverlayVisible()) hideEscOverlay();
    else showEscOverlay();
  });
  wireButtonPressFeedback(elements.menuBtn, { scale: 0.94 });
  elements.root.appendChild(elements.menuBtn);

  document.body.appendChild(elements.root);

  const pauseOverlayElements = initPauseOverlay(_options, {
    setHudSuppressed,
    scheduleHudLayoutSync,
    getLabelRenderer: () => (_options.getLabelRenderer ? _options.getLabelRenderer() : null),
    updateMenuButtonVisibility: (menuVisible) => updateMenuButtonVisibility(menuVisible),
  });
  Object.assign(elements, pauseOverlayElements);

  syncAudioControls();
  updateMenuButtonVisibility(_options.getMenuVisible ? _options.getMenuVisible() : true);
  bindHudLayoutSync();

  return {
    root: elements.root,
    status: elements.status,
    timer: elements.timer,
    timerNum: elements.timerNum,
    timerRd: elements.timerRd,
    timerFill: elements.timerFill,
    scores: elements.scores,
    feed: elements.feed,
    scoreBoxes: elements.scoreBoxes,
    readyBtn: elements.readyBtn,
    addKillFeedEntry,
    pickKillFeedVerb: pickKillFeedVerb,
    pickSelfDeathVerb: pickSelfDeathVerb,
    colorHexToCss: colorHexToCss,
    escOverlay: elements.escOverlay,
    syncAudioControls,
    showEscOverlay,
    hideEscOverlay,
    isEscOverlayVisible,
  };
}

/**
 * Refreshes all HUD widgets from current game and network state.
 * @param {object} params
 * @param {string|null} params.youConnId
 * @param {Array<object>|null} params.netSlots
 * @param {object} params.roundState
 * @param {number} params.matchHistoryLength
 * @param {boolean} params.menuVisible
 */
export function update({
  youConnId,
  netSlots,
  roundState,
  matchHistoryLength,
  menuVisible
}) {
  const roundPhase = roundState?.phase;
  const escOpen = isEscOverlayVisible();
  const suppressHud = escOpen || roundPhase === "podium";

  updateMenuButtonVisibility(menuVisible);
  setHudSuppressed(suppressHud);

  if (menuVisible) return;
  if (!isWorldBootstrapped()) return;
  if (!elements.root) return;

  const isTestDrive = _options.detectGameMode?.() === "testdrive";
  if (isTestDrive) {
    setHudDisplay(elements.timer, "none", "timer");
    setHudDisplay(elements.scores, "none", "scores");
    setHudDisplay(elements.status, "none", "status");
    if (elements.readyBtn) elements.readyBtn.style.display = "none";
    if (elements.feed) elements.feed.style.display = "none";
    scheduleHudLayoutSync();
    return;
  }

  if (suppressHud) {
    if (elements.feed) elements.feed.style.display = "none";
    return;
  }

  if (elements.feed) elements.feed.style.display = "";

  updateStatus(roundState);
  updateTimer(roundState, matchHistoryLength);
  updateScores(roundState, netSlots, youConnId);
  updateReadyButton(roundPhase, netSlots, youConnId, menuVisible);
  updateComboWidget();
  scheduleHudLayoutSync();
}

let _prevComboTier = 0;

/**
 * Updates the local player Rampage Combo badge widget and decay bar.
 */
function updateComboWidget() {
  if (!elements.comboBadge) return;
  const state = gameStore.getState();
  const tier = state.localComboTier || 0;
  const expiryMs = state.localComboExpiryMs || 0;
  const multiplier = state.localComboMultiplier || 1.0;
  const now = performance.now();

  if (tier <= 0 || now >= expiryMs) {
    if (elements.comboBadge.classList.contains("active")) {
      elements.comboBadge.classList.remove("active", "tier-1", "tier-2", "tier-3");
    }
    _prevComboTier = 0;
    return;
  }

  const remainingMs = Math.max(0, expiryMs - now);
  const decayPct = (remainingMs / 5000) * 100;

  const tierNames = { 1: "RAMPAGE", 2: "SAVAGE", 3: "CARNAGE" };
  const tierName = tierNames[tier] || "COMBO";

  if (elements.comboMultiplier) elements.comboMultiplier.textContent = `${multiplier.toFixed(1)}x`;
  if (elements.comboTier) elements.comboTier.textContent = tierName;
  if (elements.comboBarFill) elements.comboBarFill.style.width = `${decayPct}%`;

  if (!elements.comboBadge.classList.contains("active")) {
    elements.comboBadge.classList.add("active");
  }
  elements.comboBadge.classList.remove("tier-1", "tier-2", "tier-3");
  elements.comboBadge.classList.add(`tier-${tier}`);

  if (tier > _prevComboTier) {
    elements.comboBadge.animate(
      [
        { transform: "translateX(-50%) scale(1)" },
        { transform: "translateX(-50%) scale(1.35)" },
        { transform: "translateX(-50%) scale(1)" },
      ],
      { duration: 250, easing: "cubic-bezier(0.175, 0.885, 0.32, 1.275)" }
    );
  }
  _prevComboTier = tier;
}

export function refreshScoreBoxGlows(slots, youConnId) {
  if (!elements.scoreBoxes || !Array.isArray(slots)) return;

  const rows = _sortedScoreRows;
  if (rows && rows.length) {
    for (let pos = 0; pos < 4; pos += 1) {
      const entry = elements.scoreBoxes[pos];
      const row = rows[pos];
      if (!entry?.box || !row) continue;
      const slot = slots[row.slotIndex];
      if (!entry.box.classList.contains("hud-scoreBox")) {
        entry.box.classList.add("hud-scoreBox");
      }
      applyHudScoreBoxGlow(entry.box, slot, youConnId);
    }
    return;
  }

  slots.forEach((slot, i) => {
    const entry = elements.scoreBoxes[i];
    if (!entry?.box) return;
    if (!entry.box.classList.contains("hud-scoreBox")) {
      entry.box.classList.add("hud-scoreBox");
    }
    applyHudScoreBoxGlow(entry.box, slot, youConnId);
  });
}

export function syncColors(slots) {
  refreshScoreBoxGlows(slots, _options.getYouConnId ? _options.getYouConnId() : null);
}

/**
 * Prepends a kill-feed row and auto-fades it after a few seconds.
 * @param {string|null} actorName
 * @param {string|null} actorColor
 * @param {string} verb
 * @param {string} targetName
 * @param {string|null} targetColor
 * @param {number} [comboTier=0]
 * @param {number} [comboMultiplier=1.0]
 */
export function addKillFeedEntry(actorName, actorColor, verb, targetName, targetColor, comboTier = 0, comboMultiplier = 1.0) {
  if (!elements.feed) return;
  const row = document.createElement("div");
  row.className = "hud-feed-row";
  row.style.setProperty("--c", actorColor || "rgba(255,255,255,0.9)");
  row.style.setProperty("--c2", targetColor || "rgba(255,255,255,0.9)");

  let displayVerb = verb;
  if (comboTier > 0 && comboMultiplier > 1.0) {
    const tierName = comboTier === 1 ? "RAMPAGE" : comboTier === 2 ? "SAVAGE" : "CARNAGE";
    displayVerb = `${verb} [${comboMultiplier.toFixed(1)}x ${tierName}]`;
  }

  if (actorName) {
    const actor = document.createElement("span");
    actor.className = "hud-feed-actor";
    actor.textContent = actorName;
    const v = document.createElement("span");
    v.className = "hud-feed-verb";
    v.textContent = displayVerb;
    const target = document.createElement("span");
    target.className = "hud-feed-target";
    target.textContent = targetName;
    row.appendChild(actor);
    row.appendChild(v);
    row.appendChild(target);
  } else {
    const target = document.createElement("span");
    target.className = "hud-feed-target";
    target.textContent = targetName;
    const v = document.createElement("span");
    v.className = "hud-feed-verb";
    v.textContent = displayVerb;
    row.appendChild(target);
    row.appendChild(v);
  }

  elements.feed.prepend(row);
  animateKillFeedEnter(row);

  // * Trim overflow synchronously — animated exit is only for timed auto-dismiss.
  while (elements.feed.children.length > 5) {
    const last = elements.feed.lastElementChild;
    if (!last) break;
    if (last instanceof HTMLElement) {
      cancelKillFeedExitTimer(last);
      cancelElementAnimations(last);
    }
    last.remove();
  }

  scheduleKillFeedExit(row);
}

export function hideGameplayElements() {
  setHudDisplay(elements.timer, "none", "timer");
  setHudDisplay(elements.scores, "none", "scores");
  if (elements.readyBtn) elements.readyBtn.style.display = "none";
  setHudDisplay(elements.status, "none", "status");
}

export function showGameplayElements() {
  if (_options.detectGameMode?.() === "testdrive") {
    hideGameplayElements();
    return;
  }
  setHudDisplay(elements.timer, "flex", "timer");
  setHudDisplay(elements.scores, "flex", "scores");
  if (elements.readyBtn && _options.detectGameMode?.() !== "solo") {
    elements.readyBtn.style.display = "block";
  }
  setHudDisplay(elements.status, "block", "status");
}

export function clearFeed() {
  if (elements.feed) {
    elements.feed.style.display = "none";
    while (elements.feed.firstChild) {
      const child = elements.feed.firstChild;
      if (child instanceof HTMLElement) {
        cancelKillFeedExitTimer(child);
        cancelElementAnimations(child);
      }
      elements.feed.removeChild(child);
    }
  }
}

export function showAudioWidget() {
  if (elements.audio) elements.audio.style.display = "flex";
  scheduleHudLayoutSync();
}

export function hideAudioWidget() {
  if (elements.audio) elements.audio.style.display = "none";
  scheduleHudLayoutSync();
}

/**
 * Opens the in-game Esc settings overlay and syncs audio widgets.
 */
export function showEscOverlay() {
  showPauseOverlay();
}

/**
 * Closes the Esc overlay and restores name-label visibility.
 */
export function hideEscOverlay() {
  hidePauseOverlay();
}

export function isEscOverlayVisible() {
  return isPauseOverlayVisible();
}

/**
 * Syncs HUD mute button and volume sliders with persisted audio settings.
 */
export function syncAudioControls() {
  if (!elements.muteBtn || !elements.musicVol || !elements.sfxVol) return;
  const isMuted = _options.getIsMuted ? _options.getIsMuted() : false;
  const musicGain = _options.getMusicGain ? _options.getMusicGain() : 0.5;
  const sfxVolume = _options.getSfxVolume ? _options.getSfxVolume() : 0.5;
  const AUDIO_VOLUME_MAX = _options.getAudioVolumeMax ? _options.getAudioVolumeMax() : 1.15;

  const musicPercent = Math.round((musicGain / AUDIO_VOLUME_MAX) * 100);
  const sfxPercent = Math.round((sfxVolume / AUDIO_VOLUME_MAX) * 100);
  const musicPct = isMuted ? 0 : musicPercent;
  const sfxPct = isMuted ? 0 : sfxPercent;
  elements.muteBtn.innerHTML = isMuted ? "✕" : "♪";
  elements.muteBtn.classList.toggle("muted", isMuted);
  elements.musicVol.input.value = String(musicPct);
  elements.musicVol.input.style.setProperty("--vol-pct", `${musicPct}%`);
  elements.musicVol.val.textContent = isMuted ? "OFF" : musicPercent;
  elements.sfxVol.input.value = String(sfxPct);
  elements.sfxVol.input.style.setProperty("--vol-pct", `${sfxPct}%`);
  elements.sfxVol.val.textContent = isMuted ? "OFF" : sfxPercent;

  updatePauseOverlayAudioState(isMuted, musicGain, sfxVolume, AUDIO_VOLUME_MAX);
}
