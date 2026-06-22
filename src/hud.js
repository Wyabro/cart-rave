let _options = {};

/** @type {Record<string, HTMLElement | null | Array<object>>} */
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
  audio: null,
  escOverlay: null,
  resumeBtn: null,
  quitBtn: null,
  postFxBtn: null,
  muteBtn: null,
  musicVol: null,
  sfxVol: null,
};

// * Cached update() state — avoids recomputing sort order and retriggering animations every frame.
/** Timestamp until which the "GO!" flash is shown after countdown → running. */
let _goUntilMs = 0;
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

export const HUD_CSS = `
    #hud {
      --hud-display: "Bungee", "Archivo Black", cursive, sans-serif;
      --hud-mono: "Space Mono", ui-monospace, monospace;
      --hud-glow: #22e6ff;
      --hud-pad: clamp(8px, 1.5vw, 18px);
      --hud-radius: clamp(4px, 0.8vw, 6px);
      --hud-panel-bg: rgba(0,0,0,0.75);
      --hud-border: 2px solid rgba(255,255,255,0.15);
      --hud-timer-reserve: clamp(128px, 15vw, 208px);
      --hud-audio-reserve: clamp(150px, 20vw, 240px);
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
      top: var(--hud-pad);
      left: 50%;
      transform: translateX(-50%);
      font-family: var(--hud-display);
      font-size: clamp(1.4rem, 4vw, 2.4rem);
      font-weight: 900;
      letter-spacing: 0.06em;
      padding: clamp(4px, 1vw, 10px) clamp(8px, 1.5vw, 14px);
      color: #ff2bd6;
      text-shadow: 4px 4px 0 #22e6ff, 0 0 24px #ff2bd6, 0 0 42px #ff2bd6;
      display: none;
      white-space: nowrap;
      z-index: 10;
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
      font-family: "Share Tech Mono", ui-monospace, monospace;
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
      font-family: "Bungee", cursive, system-ui, sans-serif;
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
      font-family: "Bungee", cursive, system-ui, sans-serif;
      font-size: clamp(11px, 1.2vw, 14px);
      letter-spacing: 1px;
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
      opacity: 0.9;
      animation: hud-feed-in 300ms ease-out both;
    }

    #hud .hud-feed-actor {
      font-family: "Bungee", cursive, system-ui, sans-serif;
      font-size: clamp(11px, 1.3vw, 14px);
      color: var(--c);
      text-shadow: 0 0 8px var(--c);
      max-width: clamp(72px, 14vw, 140px);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    #hud .hud-feed-verb {
      font-family: "Share Tech Mono", ui-monospace, monospace;
      font-size: clamp(10px, 1.1vw, 12px);
      color: rgba(255,255,255,0.45);
      letter-spacing: 2px;
    }

    #hud .hud-feed-target {
      font-family: "Bungee", cursive, system-ui, sans-serif;
      font-size: clamp(11px, 1.3vw, 14px);
      color: var(--c2);
      text-shadow: 0 0 8px var(--c2);
      max-width: clamp(72px, 14vw, 140px);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    @keyframes hud-feed-in {
      from { opacity: 0; transform: translateX(20px); }
      to   { opacity: 0.9; transform: translateX(0); }
    }

    @keyframes hud-feed-out {
      from { opacity: 0.9; }
      to   { opacity: 0; }
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
      right: var(--hud-pad);
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

    #esc-overlay {
      --esc-display: "Bungee", "Archivo Black", sans-serif;
      --esc-mono: "Space Mono", ui-monospace, monospace;
      position: fixed;
      inset: 0;
      z-index: 26000;
      display: none;
      align-items: center;
      justify-content: center;
      pointer-events: auto;
      font-family: var(--esc-mono);
      color: #fff;
      -webkit-font-smoothing: antialiased;
      text-rendering: optimizeLegibility;
    }

    #esc-overlay .esc-backdrop {
      position: absolute;
      inset: 0;
      background: rgba(5, 5, 20, 0.7);
      backdrop-filter: blur(6px);
      -webkit-backdrop-filter: blur(6px);
    }

    #esc-overlay .esc-panel {
      position: relative;
      z-index: 1;
      pointer-events: auto;
      min-width: min(420px, 92vw);
      max-width: 460px;
      width: 90%;
      padding: clamp(16px, 3vw, 22px) clamp(16px, 3vw, 22px) clamp(14px, 2.5vw, 18px);
      border-radius: 16px;
      background: rgba(0, 0, 0, 0.6);
      border: 1px solid rgba(255, 255, 255, 0.12);
      box-shadow: 0 0 40px rgba(43, 255, 122, 0.08), 0 16px 48px rgba(0, 0, 0, 0.55);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      display: flex;
      flex-direction: column;
    }

    #esc-overlay .esc-title {
      font-family: var(--esc-display);
      font-size: clamp(20px, 4vw, 28px);
      font-weight: 400;
      letter-spacing: 0.06em;
      margin: 0 0 12px;
      min-height: 1.2em;
      text-align: center;
      line-height: 1.15;
      color: #22e6ff;
      text-shadow: 0 0 12px #22e6ff, 0 0 28px color-mix(in oklab, #22e6ff, transparent 50%);
    }

    #esc-overlay .esc-controls {
      display: grid;
      grid-template-columns: minmax(104px, auto) 1fr;
      gap: 6px;
      margin-bottom: 10px;
    }

    #esc-overlay .esc-control-row {
      display: contents;
    }

    #esc-overlay .esc-keycap,
    #esc-overlay .esc-control-label {
      padding: clamp(6px, 1.5vw, 8px) clamp(8px, 2vw, 12px);
      border-radius: 10px;
      background: rgba(0, 0, 0, 0.45);
      border: 1px solid rgba(255, 255, 255, 0.1);
      font-family: var(--esc-mono);
      font-size: clamp(10px, 2vw, 11px);
      letter-spacing: 0.04em;
      color: rgba(255, 255, 255, 0.88);
      min-width: 0;
    }

    #esc-overlay .esc-keycap {
      color: #22e6ff;
      text-shadow: 0 0 10px #22e6ff;
      text-align: center;
    }

    #esc-overlay .esc-control-label {
      text-transform: uppercase;
    }

    #esc-overlay .esc-scoring-divider {
      border: none;
      border-top: 1px solid rgba(255, 255, 255, 0.15);
      margin: clamp(12px, 2.5vw, 16px) 0;
    }

    #esc-overlay .esc-scoring-title {
      font-family: var(--esc-display);
      font-size: clamp(12px, 2.5vw, 14px);
      font-weight: 400;
      letter-spacing: 0.1em;
      color: #ff2bd6;
      text-shadow: 0 0 8px #ff2bd6;
      text-transform: uppercase;
      margin: 0 0 6px;
      text-align: center;
    }

    #esc-overlay .esc-scoring {
      display: grid;
      grid-template-columns: 1fr max-content;
      gap: clamp(8px, 2vw, 12px) clamp(6px, 1.5vw, 8px);
      margin-bottom: 0;
      padding: clamp(12px, 2.5vw, 16px) 0;
    }

    #esc-overlay .esc-scoring-key,
    #esc-overlay .esc-scoring-val {
      padding: clamp(4px, 1vw, 6px) clamp(8px, 2vw, 10px);
      border-radius: 10px;
      background: rgba(0, 0, 0, 0.45);
      border: 1px solid rgba(255, 255, 255, 0.1);
      font-family: var(--esc-mono);
      font-size: clamp(10px, 2vw, 11px);
      letter-spacing: 0.04em;
      color: rgba(255, 255, 255, 0.88);
      min-width: 0;
    }

    #esc-overlay .esc-scoring-val {
      color: #22e6ff;
      text-shadow: 0 0 8px #22e6ff;
      text-align: left;
      white-space: nowrap;
      font-size: clamp(11px, 2.5vw, 13px);
      font-weight: 700;
    }

    #esc-overlay .esc-scoring-hint {
      grid-column: 1 / -1;
      padding: 6px 10px;
      font-family: var(--esc-display);
      font-size: clamp(12px, 2.5vw, 14px);
      font-weight: 400;
      letter-spacing: 0.1em;
      color: #ff2bd6;
      text-shadow: 0 0 8px #ff2bd6;
      text-transform: uppercase;
      text-align: center;
    }

    #esc-overlay .esc-actions {
      display: flex;
      flex-direction: column;
      gap: 8px;
      width: 100%;
    }

    #esc-overlay .esc-btn {
      width: 100%;
      padding: clamp(10px, 2.5vw, 14px) clamp(16px, 3vw, 22px);
      border-radius: 6px;
      font-family: var(--esc-display);
      font-size: clamp(14px, 3vw, 16px);
      letter-spacing: 0.06em;
      cursor: pointer;
      text-decoration: none;
      text-align: center;
      display: block;
      border: 2px solid var(--btn-glow, #ff2bd6);
      background: rgba(0, 0, 0, 0.55);
      color: var(--btn-glow, #ff2bd6);
      text-shadow: 0 0 10px var(--btn-glow, #ff2bd6);
      box-shadow: 0 0 12px var(--btn-glow, #ff2bd6), 0 0 28px color-mix(in oklab, var(--btn-glow, #ff2bd6), transparent 60%);
      transition: transform 120ms ease, box-shadow 180ms ease, background 180ms ease;
    }

    #esc-overlay .esc-btn:hover:not(:disabled) {
      transform: translateY(-2px) scale(1.02);
      background: rgba(0, 0, 0, 0.35);
      box-shadow: 0 0 20px var(--btn-glow, #ff2bd6), 0 0 44px var(--btn-glow, #ff2bd6);
    }

    #esc-overlay .esc-btn--quit {
      --btn-glow: #22e6ff;
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
 * Updates the center status line (GO!, countdown).
 * @param {object} roundState
 */
function updateStatus(roundState) {
  const roundPhase = roundState?.phase;
  const roundCountdownStartedAtMs = roundState?.countdownStartedAtMs;

  const prevPhase = _prevRoundPhase;
  if (prevPhase === "countdown" && roundPhase === "running") {
    _goUntilMs = Date.now() + 500;
  }
  _prevRoundPhase = roundPhase;

  if (Date.now() < _goUntilMs) {
    setHudDisplay(elements.status, "block", "status");
    elements.status.style.color = "#22e6ff";
    elements.status.textContent = "GO!";
  } else if (roundPhase === "countdown") {
    const countdownMs = roundState?.countdownMs
      ?? (_options.getCountdownMs ? _options.getCountdownMs() : 3000);
    const elapsedMs = Date.now() - (roundCountdownStartedAtMs || 0);
    const remainingMs = countdownMs - elapsedMs;
    const n = clampInt(Math.ceil(remainingMs / 1000), 1, Math.ceil(countdownMs / 1000));
    setHudDisplay(elements.status, "block", "status");
    elements.status.style.color = "#ff2bd6";
    elements.status.textContent = `GET READY  ${n}`;
    if (_lastCountdownN !== n) {
      _lastCountdownN = n;
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
  } else {
    setHudDisplay(elements.status, "none", "status");
    elements.status.textContent = "";
  }
}

/**
 * Updates the round timer display and progress bar.
 * @param {object} roundState
 * @param {number} matchHistoryLength
 */
function updateTimer(roundState, matchHistoryLength) {
  const roundPhase = roundState?.phase;
  const roundStartedAtMs = roundState?.startedAtMs;

  if (roundPhase === "running") {
    const elapsedMs = Date.now() - (roundStartedAtMs || 0);
    const totalRoundMs = roundState?.totalRoundMs
      ?? (_options.getDefaultRoundMs ? _options.getDefaultRoundMs() : 95000);
    const remainingMs = totalRoundMs - elapsedMs;
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
  } else {
    setHudDisplay(elements.timer, "none", "timer");
    if (elements.timerNum) elements.timerNum.textContent = "";
    if (elements.timerRd) elements.timerRd.textContent = "";
    if (elements.timerFill) elements.timerFill.style.width = "0%";
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
      const meta = `${slot?.name || `P${i + 1}`}:${slot?.color || ""}:${slot?.kind || "npc"}:${slot?.connId || ""}`;
      if (_lastScores[i] !== score || _lastSlotMeta[i] !== meta) {
        dataChanged = true;
      }
    }
    const localChanged = localIdx !== _lastLocalIdx;

    if (dataChanged) {
      for (let i = 0; i < 4; i += 1) {
        const slot = netSlots?.[i];
        _lastScores[i] = Number(roundScores?.[i] ?? 0);
        _lastSlotMeta[i] = `${slot?.name || `P${i + 1}`}:${slot?.color || ""}:${slot?.kind || "npc"}:${slot?.connId || ""}`;
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
          kind: slot?.kind || "npc",
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
        entry.value.textContent = String(row.score);

        if (row.slotColor) {
          entry.box.dataset.hudColor = row.slotColor;
        } else {
          delete entry.box.dataset.hudColor;
        }

        const isLocal = row.slotIndex === localIdx;
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
    elements.readyBtn.style.display = "block";
    elements.readyBtn.textContent = isLocalReady ? "READY!" : "READY UP!";
    elements.readyBtn.classList.toggle("is-ready", isLocalReady);
  } else {
    elements.readyBtn.style.display = "none";
    elements.readyBtn.classList.remove("is-ready");
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

  const existing = document.getElementById("hud");
  if (existing) existing.remove();
  const existingStyle = document.getElementById("hud-style");
  if (existingStyle) existingStyle.remove();

  const style = document.createElement("style");
  style.id = "hud-style";
  style.textContent = HUD_CSS;
  document.head.appendChild(style);

  elements.root = document.createElement("div");
  elements.root.id = "hud";

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
    box.appendChild(label);
    box.appendChild(you);
    box.appendChild(value);
    elements.scores.appendChild(box);
    elements.scoreBoxes.push({ root: elements.root, box, rank, label, you, value });
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

  elements.root.appendChild(elements.status);
  elements.root.appendChild(elements.timer);
  elements.root.appendChild(elements.scores);
  elements.root.appendChild(elements.feed);
  elements.root.appendChild(elements.readyBtn);

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
    syncAudioControls();
  });

  function createHudVolumeRow(labelText, onChange, ariaLabel) {
    const row = document.createElement("div");
    row.className = "hud-vol-row";
    const label = document.createElement("span");
    label.className = "hud-vol-label";
    label.textContent = labelText;
    const input = document.createElement("input");
    input.type = "range";
    input.min = "0";
    input.max = "100";
    input.className = "hud-vol-track";
    input.setAttribute("aria-label", ariaLabel);
    input.addEventListener("input", (e) => {
      const valueMax = _options.getAudioVolumeMax ? _options.getAudioVolumeMax() : 1.15;
      const pct = Number(e.target.value);
      e.target.style.setProperty("--vol-pct", `${pct}%`);
      onChange(clamp((pct / 100) * valueMax, 0, valueMax));
      syncAudioControls();
    });
    const val = document.createElement("span");
    val.className = "hud-vol-val";
    row.appendChild(label);
    row.appendChild(input);
    row.appendChild(val);
    return { row, input, val };
  }

  elements.musicVol = createHudVolumeRow("♫", (v) => {
    if (_options.setMasterGain) {
      _options.setMasterGain(v);
    }
  }, "Music volume");
  elements.sfxVol = createHudVolumeRow("⚡", (v) => {
    if (_options.setSfxVolume) {
      _options.setSfxVolume(v);
    }
  }, "SFX volume");
  const hudVolStack = document.createElement("div");
  hudVolStack.className = "hud-vol-stack";
  hudVolStack.appendChild(elements.musicVol.row);
  hudVolStack.appendChild(elements.sfxVol.row);

  elements.audio.appendChild(elements.muteBtn);
  elements.audio.appendChild(hudVolStack);
  elements.root.appendChild(elements.audio);
  document.body.appendChild(elements.root);

  elements.escOverlay = document.createElement("div");
  elements.escOverlay.id = "esc-overlay";
  elements.escOverlay.setAttribute("role", "dialog");
  elements.escOverlay.setAttribute("aria-label", "Settings");
  elements.escOverlay.style.display = "none";

  const escBackdrop = document.createElement("div");
  escBackdrop.className = "esc-backdrop";

  const escPanel = document.createElement("div");
  escPanel.className = "esc-panel";

  const escTitle = document.createElement("h2");
  escTitle.className = "esc-title";
  escTitle.textContent = "MENU";

  const controls = document.createElement("div");
  controls.className = "esc-controls";
  [
    ["WASD / Arrows", "drive"],
    ["Shift", "nitro"],
    ["Space", "hop"],
    ["M", "mute"],
    ["Esc", "close"],
  ].forEach(([key, labelText]) => {
    const row = document.createElement("div");
    row.className = "esc-control-row";
    const keycap = document.createElement("span");
    keycap.className = "esc-keycap";
    keycap.textContent = key;
    const label = document.createElement("span");
    label.className = "esc-control-label";
    label.textContent = labelText;
    row.appendChild(keycap);
    row.appendChild(label);
    controls.appendChild(row);
  });

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
  elements.postFxBtn.textContent = postFxEnabled() ? "POST-FX: ON" : "POST-FX: OFF";
  elements.postFxBtn.addEventListener("click", () => {
    const next = !postFxEnabled();
    if (_options.setBloomEnabled) _options.setBloomEnabled(next);
    if (_options.setFxPassEnabled) _options.setFxPassEnabled(next);
    const bloomPass = _options.getBloomPass ? _options.getBloomPass() : null;
    const fxPass = _options.getFxPass ? _options.getFxPass() : null;
    if (bloomPass) bloomPass.enabled = next;
    if (fxPass) fxPass.enabled = next;
    elements.postFxBtn.textContent = next ? "POST-FX: ON" : "POST-FX: OFF";
  });

  actions.appendChild(elements.resumeBtn);
  actions.appendChild(elements.quitBtn);
  actions.appendChild(elements.postFxBtn);
  const scoringDivider = document.createElement("hr");
  scoringDivider.className = "esc-scoring-divider";

  const scoringTitle = document.createElement("div");
  scoringTitle.className = "esc-scoring-title";
  scoringTitle.textContent = "SCORING";

  const scoring = document.createElement("div");
  scoring.className = "esc-scoring";
  [
    ["KNOCK OFF EDGE", "◆"],
    ["KNOCK INTO HOLE", "◆◆"],
    ["AT HIGH SPEED", "◆◆◆"],
    ["TARGET THE LEADER", "◆◆◆◆"],
  ].forEach(([key, val]) => {
    const k = document.createElement("span");
    k.className = "esc-scoring-key";
    k.textContent = key;
    const v = document.createElement("span");
    v.className = "esc-scoring-val";
    v.textContent = val;
    scoring.appendChild(k);
    scoring.appendChild(v);
  });
  const hint = document.createElement("div");
  hint.className = "esc-scoring-hint";
  hint.textContent = "LEADER GLOWS WHITE";
  scoring.appendChild(hint);

  escPanel.appendChild(escTitle);
  escPanel.appendChild(controls);
  escPanel.appendChild(scoringDivider);
  escPanel.appendChild(scoringTitle);
  escPanel.appendChild(scoring);
  escPanel.appendChild(actions);
  elements.escOverlay.appendChild(escBackdrop);
  elements.escOverlay.appendChild(escPanel);
  document.body.appendChild(elements.escOverlay);

  elements.resumeBtn.addEventListener("click", hideEscOverlay);
  elements.quitBtn.addEventListener("click", () => {
    const url = new URL(window.location.href);
    url.searchParams.delete("room");
    window.location.href = url.pathname;
  });

  syncAudioControls();

  // Return structure matching old HUD references
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
  if (menuVisible) return;
  if (!elements.root) return;

  const roundPhase = roundState?.phase;

  if (elements.feed) elements.feed.style.display = "";

  updateStatus(roundState);
  updateTimer(roundState, matchHistoryLength);
  updateScores(roundState, netSlots, youConnId);
  updateReadyButton(roundPhase, netSlots, youConnId, menuVisible);
}

export function syncColors(slots) {
  if (!elements.scoreBoxes || !Array.isArray(slots)) return;

  const CART_COLORS = _options.getCART_COLORS ? _options.getCART_COLORS() : {};
  slots.forEach((slot, i) => {
    const scoreBox = elements.scoreBoxes[i];
    if (!scoreBox || !scoreBox.box) return;
    if (!slot || !slot.color) return;

    const data = CART_COLORS[slot.color];
    if (!data) return;

    const box = scoreBox.box;
    if (!box.classList.contains("hud-scoreBox")) {
      box.classList.add("hud-scoreBox");
    }
    box.dataset.hudColor = slot.color;
  });
}

/**
 * Prepends a kill-feed row and auto-fades it after a few seconds.
 * @param {string|null} actorName
 * @param {string|null} actorColor
 * @param {string} verb
 * @param {string} targetName
 * @param {string|null} targetColor
 */
export function addKillFeedEntry(actorName, actorColor, verb, targetName, targetColor) {
  if (!elements.feed) return;
  const row = document.createElement("div");
  row.className = "hud-feed-row";
  row.style.setProperty("--c", actorColor || "rgba(255,255,255,0.9)");
  row.style.setProperty("--c2", targetColor || "rgba(255,255,255,0.9)");

  if (actorName) {
    const actor = document.createElement("span");
    actor.className = "hud-feed-actor";
    actor.textContent = actorName;
    const v = document.createElement("span");
    v.className = "hud-feed-verb";
    v.textContent = verb;
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
    v.textContent = verb;
    row.appendChild(target);
    row.appendChild(v);
  }

  elements.feed.prepend(row);
  while (elements.feed.children.length > 5) {
    const last = elements.feed.lastElementChild;
    if (last) last.remove();
    else break;
  }

  setTimeout(() => {
    if (!row.isConnected) return;
    row.style.animation = "hud-feed-out 500ms ease-out forwards";
    setTimeout(() => {
      if (row.isConnected) row.remove();
    }, 520);
  }, 4000);
}

export function hideGameplayElements() {
  setHudDisplay(elements.timer, "none", "timer");
  setHudDisplay(elements.scores, "none", "scores");
  if (elements.readyBtn) elements.readyBtn.style.display = "none";
  setHudDisplay(elements.status, "none", "status");
}

export function showGameplayElements() {
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
      elements.feed.removeChild(elements.feed.firstChild);
    }
  }
}

export function showAudioWidget() {
  if (elements.audio) elements.audio.style.display = "flex";
}

export function hideAudioWidget() {
  if (elements.audio) elements.audio.style.display = "none";
}

/**
 * Opens the in-game Esc settings overlay and syncs audio widgets.
 */
export function showEscOverlay() {
  const menuVisible = _options.getMenuVisible ? _options.getMenuVisible() : false;
  if (menuVisible) return;
  if (elements.escOverlay) {
    elements.escOverlay.style.display = "flex";
    const labelRenderer = _options.getLabelRenderer ? _options.getLabelRenderer() : null;
    if (labelRenderer) labelRenderer.domElement.style.display = "none";
    syncAudioControls();
    if (elements.resumeBtn) elements.resumeBtn.focus();
  }
}

/**
 * Closes the Esc overlay and restores name-label visibility.
 */
export function hideEscOverlay() {
  if (elements.escOverlay) {
    elements.escOverlay.style.display = "none";
    const labelRenderer = _options.getLabelRenderer ? _options.getLabelRenderer() : null;
    const menuVisible = _options.getMenuVisible ? _options.getMenuVisible() : false;
    if (labelRenderer) labelRenderer.domElement.style.display = menuVisible ? "none" : "block";
  }
}

export function isEscOverlayVisible() {
  if (!elements.escOverlay) return false;
  return getComputedStyle(elements.escOverlay).display !== "none";
}

/**
 * Syncs HUD mute button and volume sliders with persisted audio settings.
 */
export function syncAudioControls() {
  if (!elements.muteBtn || !elements.musicVol || !elements.sfxVol) return;
  const isMuted = _options.getIsMuted ? _options.getIsMuted() : false;
  const masterGain = _options.getMasterGain ? _options.getMasterGain() : 0.5;
  const sfxVolume = _options.getSfxVolume ? _options.getSfxVolume() : 0.5;
  const AUDIO_VOLUME_MAX = _options.getAudioVolumeMax ? _options.getAudioVolumeMax() : 1.15;

  const musicPercent = Math.round((masterGain / AUDIO_VOLUME_MAX) * 100);
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
}
