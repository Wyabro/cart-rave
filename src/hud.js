import "./ui/styles/hud.css";
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
import { playTimerTick } from "./sfxSynth.js";
import { getServerClockOffsetMs } from "./netcode.js";
import { announce } from "./announcer/announcerManager.js";
import { gameStore } from "./stores/gameStore.js";
import { getNpcPersonality } from "./npcNames.js";
import { isWorldBootstrapped } from "./bootstrap.js";
import {
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
  hitmarker: null,
  boost: null,
  boostFill: null,
  toast: null,
  toastTitle: null,
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
/** Last final-10-seconds value a tick was played for; null outside urgency. */
let _lastUrgentTickSecond = null;
/** Previous Sudden Death display state — plays the entry sting on the rising edge. */
let _wasSuddenDeath = false;
/** Auto-hide timeout for the challenge-complete toast. */
let _toastTimeoutId = null;
/** Previous local ready state — drives ready-button toggle animation. */
let _lastReadyState = null;


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
  // * Critical is now a high-SPEED ram (not a nitro boost), so it gets its own distinctive
  // * speed-flavored verb rather than the boost-flavored "BOOSTED OFF".
  if (hit?.wasCritical) return "STEAMROLLED";
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
      announce("go");
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
      if (n >= 1 && n <= 3) announce(`countdown_${n}`);
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
    // * Sudden Death entry sting — rising edge only, on every client.
    if (isSuddenDeath && !_wasSuddenDeath) announce("sudden_death");
    _wasSuddenDeath = isSuddenDeath;

    // * Final-10-seconds urgency — red pulse + one tick per remaining second.
    // * Skipped during Sudden Death (remaining time is pinned to zero there).
    const urgent = !isSuddenDeath && remainingMs > 0 && seconds <= 10 && seconds >= 1;
    if (elements.timer) elements.timer.classList.toggle("hud-timer-urgent", urgent);
    if (urgent) {
      if (_lastUrgentTickSecond !== seconds) {
        _lastUrgentTickSecond = seconds;
        playTimerTick(seconds);
        if (seconds === 10) announce("last_call");
        elements.timerNum?.animate?.(
          [
            { transform: "scale(1.12)" },
            { transform: "scale(1)" },
          ],
          { duration: 220, easing: "ease-out" },
        );
      }
    } else {
      _lastUrgentTickSecond = null;
    }
  } else {
    setHudDisplay(elements.timer, "none", "timer");
    if (elements.timerNum) elements.timerNum.textContent = "";
    if (elements.timerRd) elements.timerRd.textContent = "";
    if (elements.timerFill) elements.timerFill.style.width = "0%";
    if (elements.root) {
      elements.root.classList.remove("hud-sudden-death");
    }
    if (elements.timer) elements.timer.classList.remove("hud-timer-urgent");
    _lastUrgentTickSecond = null;
    _wasSuddenDeath = false;
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
  _lastUrgentTickSecond = null;
  _wasSuddenDeath = false;
  _boostDisplay = null;
  if (_toastTimeoutId) {
    clearTimeout(_toastTimeoutId);
    _toastTimeoutId = null;
  }

  const existing = document.getElementById("hud");
  if (existing) existing.remove();

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

  // * Kill-confirm hitmarker — flashes at screen center when the local player scores a KO.
  elements.hitmarker = document.createElement("div");
  elements.hitmarker.className = "hud-hitmarker";
  elements.hitmarker.setAttribute("aria-hidden", "true");
  elements.root.appendChild(elements.hitmarker);

  // * Boost charge meter — keyboard/gamepad only; the touch BOOST button has its own flash.
  if (!touchDevice) {
    elements.boost = document.createElement("div");
    elements.boost.className = "hud-boost";
    elements.boost.style.display = "none";
    const boostLabel = document.createElement("span");
    boostLabel.className = "hud-boost-label";
    boostLabel.textContent = "BOOST";
    const boostTrack = document.createElement("div");
    boostTrack.className = "hud-boost-track";
    elements.boostFill = document.createElement("i");
    elements.boostFill.className = "hud-boost-fill";
    boostTrack.appendChild(elements.boostFill);
    elements.boost.appendChild(boostLabel);
    elements.boost.appendChild(boostTrack);
    elements.root.appendChild(elements.boost);
  }

  // * Challenge-complete toast (top center, auto-hides).
  elements.toast = document.createElement("div");
  elements.toast.className = "hud-toast";
  const toastKicker = document.createElement("span");
  toastKicker.className = "hud-toast-kicker";
  toastKicker.textContent = "◆ CHALLENGE COMPLETE";
  elements.toastTitle = document.createElement("span");
  elements.toastTitle.className = "hud-toast-title";
  elements.toast.appendChild(toastKicker);
  elements.toast.appendChild(elements.toastTitle);
  elements.root.appendChild(elements.toast);

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
    showKillConfirm,
    showChallengeToast,
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
  updateBoostWidget(roundState);
  scheduleHudLayoutSync();
}

/** Cached boost meter display value — avoids redundant style writes per frame. */
let _boostDisplay = null;

/**
 * Updates the local player's boost charge/cooldown meter (keyboard/gamepad HUD).
 * Reads the locally simulated cart's charge state each frame — valid on host and
 * non-host alike because client prediction simulates the local cart's boost fields.
 *
 * @param {object} roundState
 */
function updateBoostWidget(roundState) {
  if (!elements.boost || !elements.boostFill) return;
  const cfg = _options.getBoostChargeCfg ? _options.getBoostChargeCfg() : null;
  const cart = _options.getLocalCart ? _options.getLocalCart() : null;
  const show = roundState?.phase === "running" && !!cart && cfg?.enabled === true;
  const displayVal = show ? "flex" : "none";
  if (_boostDisplay !== displayVal) {
    elements.boost.style.display = displayVal;
    _boostDisplay = displayVal;
  }
  if (!show) return;

  const now = performance.now();
  let fillPct = 100;
  let state = "ready";
  if (cart.isChargingBoost) {
    const chargeMs = cfg.boostChargeTimeMs || 1500;
    const t = clamp((now - (cart.boostChargeStartedAtMs || now)) / chargeMs, 0, 1);
    fillPct = t * 100;
    state = t >= 1 ? "charged" : "charging";
  } else if (cart.boostCooldownUntilMs && now < cart.boostCooldownUntilMs) {
    const cooldownMs = cfg.boostCooldownMs || 1000;
    fillPct = clamp(1 - (cart.boostCooldownUntilMs - now) / cooldownMs, 0, 1) * 100;
    state = "cooldown";
  }
  elements.boostFill.style.width = `${fillPct}%`;
  if (elements.boost.dataset.state !== state) elements.boost.dataset.state = state;
}

/**
 * Flashes the center-screen hitmarker — call when the local player confirms a KO.
 */
export function showKillConfirm() {
  const el = elements.hitmarker;
  if (!el) return;
  el.classList.remove("hit");
  // * Force reflow so re-adding the class restarts the CSS animation.
  void el.offsetWidth;
  el.classList.add("hit");
}

/**
 * Shows the challenge-complete toast with the given challenge title.
 * @param {string} title
 */
export function showChallengeToast(title) {
  if (!elements.toast || !elements.toastTitle) return;
  elements.toastTitle.textContent = title;
  elements.toast.classList.add("active");
  if (_toastTimeoutId) clearTimeout(_toastTimeoutId);
  _toastTimeoutId = setTimeout(() => {
    elements.toast?.classList.remove("active");
    _toastTimeoutId = null;
  }, 3200);
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
