let _options = {};

// Module-level state for DOM elements
let hudRoot = null;
let hudStatus = null;
let hudTimer = null;
let hudTimerNum = null;
let hudTimerRd = null;
let hudTimerFill = null;
let hudScores = null;
let hudFeed = null;
let hudScoreBoxes = [];
let hudReadyBtn = null;
let hudAudio = null;
let escOverlay = null;
let resumeBtn = null;
let quitBtn = null;
let postFxBtn = null;
let hudMuteBtn = null;
let hudMusicVol = null;
let hudSfxVol = null;

// Module-level cached variables for updateHud
let _goUntilMs = 0;
let _prevRoundPhase = null;
let _lastCountdownN = null;
let _lastLocalIdx = null;
let _sortedScoreRowsKey = null;
let _sortedScoreRows = null;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function clampInt(value, min, max) {
  const v = Math.round(value);
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, v));
}

export function colorHexToCss(hex) {
  return `#${Number(hex || 0).toString(16).padStart(6, "0")}`;
}

export function pickKillFeedVerb(hit) {
  if (hit?.wasCritical) return "BOOSTED OFF";
  const verbs = ["YEETED", "RAMMED", "BOOSTED OFF"];
  return verbs[Math.floor(Math.random() * verbs.length)];
}

export function init(options) {
  _options = options || {};

  const existing = document.getElementById("hud");
  if (existing) existing.remove();
  const existingStyle = document.getElementById("hud-style");
  if (existingStyle) existingStyle.remove();

  const style = document.createElement("style");
  style.id = "hud-style";
  style.textContent = `
    #hud {
      --hud-display: "Bungee", "Archivo Black", cursive, sans-serif;
      --hud-mono: "Space Mono", ui-monospace, monospace;
      --hud-glow: #22e6ff;
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
      top: 18px;
      left: 50%;
      transform: translateX(-50%);
      font-family: var(--hud-display);
      font-size: 2.4rem;
      font-weight: 900;
      letter-spacing: 0.06em;
      padding: 10px 14px;
      color: #ff2bd6;
      text-shadow:
        4px 4px 0 #22e6ff,
        0 0 24px #ff2bd6,
        0 0 42px #ff2bd6;
      display: none;
      white-space: nowrap;
    }

    #hud .hud-timer {
      position: absolute;
      top: 18px;
      left: 18px;
      display: none;
      align-items: stretch;
      justify-content: flex-start;
      flex-direction: row;
      background: rgba(0,0,0,0.75);
      border: 2px solid rgba(255,255,255,0.15);
      border-radius: 6px;
      backdrop-filter: blur(6px);
      -webkit-backdrop-filter: blur(6px);
      overflow: hidden;
      pointer-events: none;
    }

    #hud .hud-timer-stripe {
      width: 8px;
      background: #39ff14;
      box-shadow: 0 0 12px #39ff14aa;
      flex: 0 0 auto;
    }

    #hud .hud-timer-body {
      padding: 10px 20px 12px 16px;
      min-width: 200px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    #hud .hud-timer-meta {
      display: flex;
      align-items: center;
      gap: 8px;
      font-family: "Share Tech Mono", ui-monospace, monospace;
      font-size: 13px;
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
      font-size: 12px;
      letter-spacing: 1px;
    }

    #hud .hud-timer-num {
      font-family: "Bungee", cursive, system-ui, sans-serif;
      font-size: 54px;
      line-height: 1;
      letter-spacing: 4px;
      color: #ffffff;
      text-shadow: 0 0 20px rgba(57,255,20,0.4);
    }

    #hud .hud-timer-bar {
      height: 5px;
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
      top: 18px;
      left: 50%;
      transform: translateX(-50%);
      display: none;
      flex-direction: row;
      flex-wrap: nowrap;
      gap: 0;
      align-items: center;
      justify-content: center;
      background: rgba(0,0,0,0.75);
      border: 2px solid rgba(255,255,255,0.15);
      border-radius: 6px;
      backdrop-filter: blur(6px);
      -webkit-backdrop-filter: blur(6px);
      overflow: hidden;
    }

    #hud .hud-scoreBox {
      --hud-glow: #22e6ff;
      padding: 14px 18px;
      display: flex;
      flex-direction: row;
      align-items: center;
      gap: 8px;
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
      font-size: 16px;
      color: var(--hud-glow);
      text-shadow: 0 0 8px var(--hud-glow);
      min-width: 16px;
    }

    #hud .hud-scoreLabel {
      font-family: "Bungee", cursive, system-ui, sans-serif;
      font-size: 14px;
      letter-spacing: 1px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      max-width: 160px;
      color: #ffffff;
      text-shadow: 0 0 6px rgba(255,255,255,0.2);
    }

    #hud .hud-scoreValue {
      font-family: "Bungee", cursive, system-ui, sans-serif;
      font-size: 18px;
      color: var(--hud-glow);
      text-shadow: 0 0 10px var(--hud-glow);
      min-width: 24px;
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
      display: none;
    }

    #hud .hud-feed {
      position: absolute;
      top: 120px;
      right: 18px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      z-index: 20001;
      text-align: right;
      pointer-events: none;
    }

    #hud .hud-feed-row {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 8px;
      font-size: 14px;
      letter-spacing: 1.5px;
      text-transform: uppercase;
      opacity: 0.9;
      animation: hud-feed-in 300ms ease-out both;
    }

    #hud .hud-feed-actor {
      font-family: "Bungee", cursive, system-ui, sans-serif;
      font-size: 14px;
      color: var(--c);
      text-shadow: 0 0 8px var(--c);
    }

    #hud .hud-feed-verb {
      font-family: "Share Tech Mono", ui-monospace, monospace;
      font-size: 12px;
      color: rgba(255,255,255,0.45);
      letter-spacing: 2px;
    }

    #hud .hud-feed-target {
      font-family: "Bungee", cursive, system-ui, sans-serif;
      font-size: 14px;
      color: var(--c2);
      text-shadow: 0 0 8px var(--c2);
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

    #hud .hud-status.pulse {
      animation: hudStatusPulse 200ms ease-out both;
    }

    @keyframes hudStatusPulse {
      0% { transform: translateX(-50%) scale(1); }
      40% { transform: translateX(-50%) scale(1.3); }
      100% { transform: translateX(-50%) scale(1); }
    }

    #hud .hud-ready-btn {
      --btn-glow: #22e6ff;
      position: absolute;
      bottom: 80px;
      left: 50%;
      transform: translateX(-50%);
      font-family: 'Bungee', cursive, system-ui, sans-serif;
      font-size: 1.6rem;
      letter-spacing: 0.1em;
      padding: 14px 40px;
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
      top: 18px;
      right: 18px;
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 14px;
      background: rgba(0,0,0,0.75);
      border: 2px solid rgba(255,255,255,0.15);
      border-radius: 6px;
      backdrop-filter: blur(6px);
      -webkit-backdrop-filter: blur(6px);
      pointer-events: auto;
      z-index: 20001;
    }

    @media (max-width: 1200px) {
      #hud .hud-scoreBox { font-size: 11px; padding: 4px 8px; gap: 4px; }
      #hud .hud-scoreLabel { font-size: 11px; }
      #hud .hud-scoreValue { font-size: 13px; }
    }

    @media (max-width: 800px) {
      #hud .hud-scores { gap: 4px; overflow: hidden; }
      #hud .hud-scoreBox { font-size: 10px; padding: 3px 6px; gap: 2px; }
      #hud .hud-scoreLabel { font-size: 10px; max-width: 80px; overflow: hidden; text-overflow: ellipsis; }
      #hud .hud-scoreValue { font-size: 12px; }
      #hud .hud-timer { transform: scale(0.8); transform-origin: top left; }
      #hud .hud-audio { transform: scale(0.8); transform-origin: top right; }
    }

    @media (max-width: 900px) {
      #hud .hud-scores {
        top: auto;
        bottom: 12px;
        left: 50%;
        transform: translateX(-50%);
      }
    }
    #hud .hud-mute-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      border-radius: 6px;
      border: 1px solid rgba(255,255,255,0.15);
      background: rgba(0, 0, 0, 0.4);
      color: #ffffff;
      cursor: pointer;
      font-size: 14px;
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
      gap: 6px;
    }
    #hud .hud-vol-row {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    #hud .hud-vol-label {
      width: 14px;
      text-align: center;
      color: rgba(255,255,255,0.6);
      font-size: 12px;
    }
    #hud .hud-vol-track {
      width: 80px;
      height: 5px;
      background: rgba(255, 255, 255, 0.1);
      border-radius: 3px;
      cursor: pointer;
      overflow: hidden;
    }
    #hud .hud-vol-fill {
      height: 100%;
      border-radius: 3px;
      background: #ffffff;
      transition: width 100ms ease;
    }
    #hud .hud-vol-val {
      font-family: 'Space Mono', monospace;
      font-size: 10px;
      font-weight: 700;
      color: rgba(255,255,255,0.5);
      min-width: 22px;
      text-align: right;
      letter-spacing: 0.05em;
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
      padding: 22px 22px 18px;
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
      padding: 8px 12px;
      border-radius: 10px;
      background: rgba(0, 0, 0, 0.45);
      border: 1px solid rgba(255, 255, 255, 0.1);
      font-family: var(--esc-mono);
      font-size: 11px;
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
      margin: 16px 0;
    }

    #esc-overlay .esc-scoring-title {
      font-family: var(--esc-display);
      font-size: 14px;
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
      gap: 12px 8px;
      margin-bottom: 0;
      padding: 16px 0;
    }

    #esc-overlay .esc-scoring-key,
    #esc-overlay .esc-scoring-val {
      padding: 6px 10px;
      border-radius: 10px;
      background: rgba(0, 0, 0, 0.45);
      border: 1px solid rgba(255, 255, 255, 0.1);
      font-family: var(--esc-mono);
      font-size: 11px;
      letter-spacing: 0.04em;
      color: rgba(255, 255, 255, 0.88);
      min-width: 0;
    }

    #esc-overlay .esc-scoring-val {
      color: #22e6ff;
      text-shadow: 0 0 8px #22e6ff;
      text-align: left;
      white-space: nowrap;
      font-size: 13px;
      font-weight: 700;
    }

    #esc-overlay .esc-scoring-hint {
      grid-column: 1 / -1;
      padding: 6px 10px;
      font-family: var(--esc-display);
      font-size: 14px;
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
      padding: 14px 22px;
      border-radius: 6px;
      font-family: var(--esc-display);
      font-size: 16px;
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
  document.head.appendChild(style);

  hudRoot = document.createElement("div");
  hudRoot.id = "hud";

  hudStatus = document.createElement("div");
  hudStatus.className = "hud-status";

  hudTimer = document.createElement("div");
  hudTimer.className = "hud-timer";
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
  hudTimerRd = document.createElement("span");
  hudTimerRd.className = "hud-timer-rd";
  hudTimerRd.textContent = "";
  timerMeta.appendChild(timerPip);
  timerMeta.appendChild(timerMetaText);
  timerMeta.appendChild(hudTimerRd);

  hudTimerNum = document.createElement("div");
  hudTimerNum.className = "hud-timer-num";
  hudTimerNum.textContent = "";

  const timerBar = document.createElement("div");
  timerBar.className = "hud-timer-bar";
  hudTimerFill = document.createElement("i");
  timerBar.appendChild(hudTimerFill);

  timerBody.appendChild(timerMeta);
  timerBody.appendChild(hudTimerNum);
  timerBody.appendChild(timerBar);
  hudTimer.appendChild(timerStripe);
  hudTimer.appendChild(timerBody);

  hudScores = document.createElement("div");
  hudScores.className = "hud-scores";

  hudFeed = document.createElement("div");
  hudFeed.className = "hud-feed";

  hudScoreBoxes = [];
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
    hudScores.appendChild(box);
    hudScoreBoxes.push({ root: hudRoot, box, rank, label, you, value });
  }

  hudReadyBtn = document.createElement("button");
  hudReadyBtn.id = "ready-button";
  hudReadyBtn.className = "hud-ready-btn";
  hudReadyBtn.textContent = "";
  hudReadyBtn.addEventListener("click", () => {
    const pSock = _options.getPartySocket ? _options.getPartySocket() : null;
    const msgType = _options.getReadyToggleMsgType ? _options.getReadyToggleMsgType() : "ready_toggle";
    if (pSock) {
      pSock.send(JSON.stringify({ type: msgType }));
    }
  });

  hudRoot.appendChild(hudStatus);
  hudRoot.appendChild(hudTimer);
  hudRoot.appendChild(hudScores);
  hudRoot.appendChild(hudFeed);
  hudRoot.appendChild(hudReadyBtn);

  // In-game audio widget
  hudAudio = document.createElement("div");
  hudAudio.className = "hud-audio";

  const isMuted = _options.getIsMuted ? _options.getIsMuted() : false;
  hudMuteBtn = document.createElement("button");
  hudMuteBtn.className = "hud-mute-btn";
  hudMuteBtn.innerHTML = isMuted ? "✕" : "♪";
  if (isMuted) hudMuteBtn.classList.add("muted");
  hudMuteBtn.addEventListener("click", () => {
    if (_options.setIsMuted) {
      _options.setIsMuted(!_options.getIsMuted());
    }
    syncAudioControls();
  });

  function createHudVolumeRow(labelText, onChange) {
    const row = document.createElement("div");
    row.className = "hud-vol-row";
    const label = document.createElement("span");
    label.className = "hud-vol-label";
    label.textContent = labelText;
    const track = document.createElement("div");
    track.className = "hud-vol-track";
    const fill = document.createElement("div");
    fill.className = "hud-vol-fill";
    track.appendChild(fill);
    const val = document.createElement("span");
    val.className = "hud-vol-val";
    track.addEventListener("click", (e) => {
      const r = track.getBoundingClientRect();
      const valueMax = _options.getAudioVolumeMax ? _options.getAudioVolumeMax() : 1.15;
      onChange(clamp(((e.clientX - r.left) / r.width) * valueMax, 0, valueMax));
      syncAudioControls();
    });
    row.appendChild(label);
    row.appendChild(track);
    row.appendChild(val);
    return { row, fill, val };
  }

  hudMusicVol = createHudVolumeRow("♫", (v) => {
    if (_options.setMasterGain) {
      _options.setMasterGain(v);
    }
  });
  hudSfxVol = createHudVolumeRow("⚡", (v) => {
    if (_options.setSfxVolume) {
      _options.setSfxVolume(v);
    }
  });
  const hudVolStack = document.createElement("div");
  hudVolStack.className = "hud-vol-stack";
  hudVolStack.appendChild(hudMusicVol.row);
  hudVolStack.appendChild(hudSfxVol.row);

  hudAudio.appendChild(hudMuteBtn);
  hudAudio.appendChild(hudVolStack);
  hudRoot.appendChild(hudAudio);
  document.body.appendChild(hudRoot);

  escOverlay = document.createElement("div");
  escOverlay.id = "esc-overlay";
  escOverlay.setAttribute("role", "dialog");
  escOverlay.setAttribute("aria-label", "Settings");
  escOverlay.style.display = "none";

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

  resumeBtn = document.createElement("button");
  resumeBtn.type = "button";
  resumeBtn.className = "esc-btn";
  resumeBtn.textContent = "RESUME";

  quitBtn = document.createElement("button");
  quitBtn.type = "button";
  quitBtn.className = "esc-btn esc-btn--quit";
  quitBtn.textContent = "QUIT TO MENU";

  const postFxEnabled = () => (_options.getBloomEnabled ? _options.getBloomEnabled() : true) && (_options.getFxPassEnabled ? _options.getFxPassEnabled() : true);
  postFxBtn = document.createElement("button");
  postFxBtn.type = "button";
  postFxBtn.className = "esc-btn";
  postFxBtn.textContent = postFxEnabled() ? "POST-FX: ON" : "POST-FX: OFF";
  postFxBtn.addEventListener("click", () => {
    const next = !postFxEnabled();
    if (_options.setBloomEnabled) _options.setBloomEnabled(next);
    if (_options.setFxPassEnabled) _options.setFxPassEnabled(next);
    const bloomPass = _options.getBloomPass ? _options.getBloomPass() : null;
    const fxPass = _options.getFxPass ? _options.getFxPass() : null;
    if (bloomPass) bloomPass.enabled = next;
    if (fxPass) fxPass.enabled = next;
    postFxBtn.textContent = next ? "POST-FX: ON" : "POST-FX: OFF";
  });

  actions.appendChild(resumeBtn);
  actions.appendChild(quitBtn);
  actions.appendChild(postFxBtn);
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
  escOverlay.appendChild(escBackdrop);
  escOverlay.appendChild(escPanel);
  document.body.appendChild(escOverlay);

  resumeBtn.addEventListener("click", hideEscOverlay);
  quitBtn.addEventListener("click", () => {
    const url = new URL(window.location.href);
    url.searchParams.delete("room");
    url.searchParams.delete("portal");
    window.location.href = url.pathname;
  });

  syncAudioControls();

  // Return structure matching old HUD references
  return {
    root: hudRoot,
    status: hudStatus,
    timer: hudTimer,
    timerNum: hudTimerNum,
    timerRd: hudTimerRd,
    timerFill: hudTimerFill,
    scores: hudScores,
    feed: hudFeed,
    scoreBoxes: hudScoreBoxes,
    readyBtn: hudReadyBtn,
    addKillFeedEntry,
    pickKillFeedVerb: pickKillFeedVerb,
    colorHexToCss: colorHexToCss,
    escOverlay: escOverlay,
    syncAudioControls,
    showEscOverlay,
    hideEscOverlay,
    isEscOverlayVisible,
  };
}

export function update({
  youConnId,
  netSlots,
  roundState,
  matchHistoryLength,
  isLastCartStandingActive,
  menuVisible
}) {
  if (menuVisible) return;
  if (!hudRoot) return;

  const roundPhase = roundState?.phase;
  const roundCountdownStartedAtMs = roundState?.countdownStartedAtMs;
  const roundStartedAtMs = roundState?.startedAtMs;
  const roundScores = roundState?.scores;

  if (hudFeed) hudFeed.style.display = "";

  // --- Status line ---
  const prevPhase = _prevRoundPhase;
  if (prevPhase === "countdown" && roundPhase === "running") {
    _goUntilMs = Date.now() + 500;
  }
  _prevRoundPhase = roundPhase;

  if (Date.now() < _goUntilMs) {
    hudStatus.style.display = "block";
    hudStatus.style.color = "#22e6ff";
    hudStatus.textContent = "GO!";
    hudStatus.classList.remove("pulse");
  } else if (roundPhase === "running" && isLastCartStandingActive) {
    hudStatus.style.display = "block";
    hudStatus.style.color = "#ffffff";
    hudStatus.textContent = "LAST CART STANDING!";
  } else if (roundPhase === "countdown") {
    const elapsedMs = Date.now() - (roundCountdownStartedAtMs || 0);
    const remainingMs = 3000 - elapsedMs;
    const n = clampInt(Math.ceil(remainingMs / 1000), 1, 3);
    hudStatus.style.display = "block";
    hudStatus.style.color = "#ff2bd6";
    hudStatus.textContent = `GET READY  ${n}`;
    if (_lastCountdownN !== n) {
      _lastCountdownN = n;
      hudStatus.classList.remove("pulse");
      void hudStatus.offsetWidth; // restart animation
      hudStatus.classList.add("pulse");
    }
  } else if (roundPhase === "podium") {
    hudStatus.style.display = "none";
    hudStatus.textContent = "";
  } else {
    hudStatus.style.display = "none";
    hudStatus.textContent = "";
  }

  // --- Timer ---
  if (roundPhase === "running") {
    const elapsedMs = Date.now() - (roundStartedAtMs || 0);
    const totalRoundMs = 95000;
    const remainingMs = totalRoundMs - elapsedMs;
    const seconds = clampInt(Math.ceil(remainingMs / 1000), 0, Math.ceil(totalRoundMs / 1000));
    const minutes = Math.floor(seconds / 60);
    const secondsPart = seconds % 60;
    const text = minutes > 0
      ? `${minutes}:${String(secondsPart).padStart(2, "0")}`
      : `:${String(secondsPart).padStart(2, "0")}`;
    hudTimer.style.display = "block";
    if (hudTimerNum) hudTimerNum.textContent = text;
    if (hudTimerRd) {
      const currentRound = Math.max(1, matchHistoryLength + 1);
      hudTimerRd.textContent = `RD ${currentRound}`;
    }
    if (hudTimerFill) {
      const pct = clamp(remainingMs / totalRoundMs, 0, 1) * 100;
      hudTimerFill.style.width = `${pct}%`;
    }
  } else {
    hudTimer.style.display = "none";
    if (hudTimerNum) hudTimerNum.textContent = "";
    if (hudTimerRd) hudTimerRd.textContent = "";
    if (hudTimerFill) hudTimerFill.style.width = "0%";
  }

  // --- Score row ---
  if (roundPhase === "running") {
    hudScores.style.display = "flex";
    const localIdx = netSlots ? netSlots.findIndex((s) => s && s.kind === "human" && s.connId === youConnId) : -1;
    _lastLocalIdx = localIdx;
    
    const rowsKey =
      `${Number(roundScores?.[0] ?? 0)}|${Number(roundScores?.[1] ?? 0)}|${Number(roundScores?.[2] ?? 0)}|${Number(roundScores?.[3] ?? 0)}` +
      `__${(netSlots || []).slice(0, 4).map((s, i) => `${s?.name || `P${i + 1}`}:${s?.color || ""}`).join("|")}`;
    
    if (_sortedScoreRowsKey !== rowsKey) {
      _sortedScoreRowsKey = rowsKey;
      const nextRows = [];
      for (let i = 0; i < 4; i += 1) {
        const score = roundScores && roundScores[i] != null ? Number(roundScores[i]) : 0;
        const slotName = netSlots[i]?.name || `P${i + 1}`;
        const slotColor = netSlots[i]?.color || null;
        nextRows.push({ slotIndex: i, score, slotName, slotColor });
      }
      nextRows.sort((a, b) => (b.score - a.score) || (a.slotIndex - b.slotIndex));
      _sortedScoreRows = nextRows;
    }
    const rows = _sortedScoreRows || [];

    for (let pos = 0; pos < 4; pos += 1) {
      const entry = hudScoreBoxes[pos];
      const row = rows[pos];
      if (!entry || !row) continue;

      entry.rank.textContent = String(pos + 1);
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
  } else {
    hudScores.style.display = "none";
    for (let i = 0; i < 4; i += 1) {
      const entry = hudScoreBoxes[i];
      if (entry) {
        entry.box.classList.remove("isLocal");
        entry.value.textContent = "";
        entry.rank.textContent = String(i + 1);
        entry.you.style.display = "none";
      }
    }
  }

  // --- Ready button ---
  if (hudReadyBtn) {
    const localSlot = netSlots?.find((s) => s && s.connId === youConnId);
    const isLocalReady = localSlot ? Boolean(localSlot.isReady) : false;
    if (roundPhase === "lobby" && !menuVisible) {
      hudReadyBtn.style.display = "block";
      hudReadyBtn.textContent = isLocalReady ? "READY!" : "READY UP!";
      hudReadyBtn.classList.toggle("is-ready", isLocalReady);
    } else {
      hudReadyBtn.style.display = "none";
      hudReadyBtn.classList.remove("is-ready");
    }
  }
}

export function syncColors(slots) {
  if (!hudScoreBoxes || !Array.isArray(slots)) return;

  const CART_COLORS = _options.getCART_COLORS ? _options.getCART_COLORS() : {};
  slots.forEach((slot, i) => {
    const scoreBox = hudScoreBoxes[i];
    if (!scoreBox || !scoreBox.box) return;
    if (!slot || !slot.color) return;

    const data = CART_COLORS[slot.color];
    if (!data) return;

    const box = scoreBox.box;
    box.className = "hud-scoreBox";
    box.dataset.hudColor = slot.color;
  });
}

export function addKillFeedEntry(actorName, actorColor, verb, targetName, targetColor) {
  if (!hudFeed) return;
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

  hudFeed.prepend(row);
  while (hudFeed.children.length > 5) {
    const last = hudFeed.lastElementChild;
    if (last) last.remove();
    else break;
  }

  const fadeTimer = setTimeout(() => {
    row.style.animation = "hud-feed-out 500ms ease-out forwards";
    const removeTimer = setTimeout(() => row.remove(), 520);
    row.addEventListener(
      "animationend",
      () => {
        clearTimeout(removeTimer);
        row.remove();
      },
      { once: true },
    );
  }, 4000);

  row.addEventListener(
    "DOMNodeRemoved",
    () => {
      clearTimeout(fadeTimer);
    },
    { once: true },
  );
}

export function hideGameplayElements() {
  if (hudTimer) hudTimer.style.display = "none";
  if (hudScores) hudScores.style.display = "none";
  if (hudReadyBtn) hudReadyBtn.style.display = "none";
  if (hudStatus) hudStatus.style.display = "none";
}

export function showGameplayElements() {
  if (hudTimer) hudTimer.style.display = "block";
  if (hudScores) hudScores.style.display = "flex";
  if (hudReadyBtn) hudReadyBtn.style.display = "block";
  if (hudStatus) hudStatus.style.display = "block";
}

export function clearFeed() {
  if (hudFeed) {
    hudFeed.style.display = "none";
    while (hudFeed.firstChild) {
      hudFeed.removeChild(hudFeed.firstChild);
    }
  }
}

export function showAudioWidget() {
  if (hudAudio) hudAudio.style.display = "flex";
}

export function hideAudioWidget() {
  if (hudAudio) hudAudio.style.display = "none";
}

export function showEscOverlay() {
  const menuVisible = _options.getMenuVisible ? _options.getMenuVisible() : false;
  if (menuVisible) return;
  if (escOverlay) {
    escOverlay.style.display = "flex";
    const labelRenderer = _options.getLabelRenderer ? _options.getLabelRenderer() : null;
    if (labelRenderer) labelRenderer.domElement.style.display = "none";
    syncAudioControls();
    if (resumeBtn) resumeBtn.focus();
  }
}

export function hideEscOverlay() {
  if (escOverlay) {
    escOverlay.style.display = "none";
    const labelRenderer = _options.getLabelRenderer ? _options.getLabelRenderer() : null;
    const menuVisible = _options.getMenuVisible ? _options.getMenuVisible() : false;
    if (labelRenderer) labelRenderer.domElement.style.display = menuVisible ? "none" : "block";
  }
}

export function isEscOverlayVisible() {
  if (!escOverlay) return false;
  return getComputedStyle(escOverlay).display !== "none";
}

export function syncAudioControls() {
  if (!hudMuteBtn || !hudMusicVol || !hudSfxVol) return;
  const isMuted = _options.getIsMuted ? _options.getIsMuted() : false;
  const masterGain = _options.getMasterGain ? _options.getMasterGain() : 0.5;
  const sfxVolume = _options.getSfxVolume ? _options.getSfxVolume() : 0.5;
  const AUDIO_VOLUME_MAX = _options.getAudioVolumeMax ? _options.getAudioVolumeMax() : 1.15;

  const musicPercent = Math.round((masterGain / AUDIO_VOLUME_MAX) * 100);
  const sfxPercent = Math.round((sfxVolume / AUDIO_VOLUME_MAX) * 100);
  hudMuteBtn.innerHTML = isMuted ? "✕" : "♪";
  hudMuteBtn.classList.toggle("muted", isMuted);
  hudMusicVol.fill.style.width = (isMuted ? 0 : (masterGain / AUDIO_VOLUME_MAX) * 100) + "%";
  hudMusicVol.val.textContent = isMuted ? "OFF" : musicPercent;
  hudSfxVol.fill.style.width = (isMuted ? 0 : (sfxVolume / AUDIO_VOLUME_MAX) * 100) + "%";
  hudSfxVol.val.textContent = isMuted ? "OFF" : sfxPercent;
}
