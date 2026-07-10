import "./ui/styles/tokens.css";
import "./ui/styles/hud.css";
import {
  animateKillFeedEnter,
  animateKillFeedExit,
  animateReadyStateToggle,
  animateScorePop,
  animateMuteToggle,
  cancelElementAnimations,
  cancelKillFeedExitTimer,
  scheduleKillFeedExit,
  wireButtonPressFeedback,
} from "./animations.js";
import { claimStage, resetStage } from "./ui/centerStage.js";
import { svgIcon } from "./ui/icons.js";
import { updateBoostRing } from "./touchControls.js";
import { resolveCartNeonCss } from "./customization.js";
import { playTimerTick } from "./sfxSynth.js";
import { getConnectionState, getHostId, getNetSlots, getServerClockOffsetMs } from "./netcode.js";
import { announce } from "./announcer/announcerManager.js";
import { gameStore } from "./stores/gameStore.js";
import { getNpcPersonality, PERSONALITY_META } from "./npcNames.js";
import { isWorldBootstrapped } from "./bootstrap.js";
import {
  show as showPauseOverlay,
  hide as hidePauseOverlay,
  isVisible as isPauseOverlayVisible,
  updateAudioState as updatePauseOverlayAudioState,
  init as initPauseOverlay,
} from "./ui/pauseOverlay.js";

/**
 * True when the given display name belongs to the current host's slot — used to
 * pin the host antenna glyph onto kill-feed rows without new wire fields.
 * @param {string | null | undefined} name
 */
function isHostPlayerName(name) {
  if (!name || !hostGlyphEligible()) return false;
  const hostId = getHostId();
  if (!hostId) return false;
  const slots = getNetSlots();
  const hostSlot = Array.isArray(slots) ? slots.find((s) => s && s.connId === hostId) : null;
  return Boolean(hostSlot && hostSlot.name === name);
}

/** Host glyphs only mean something online — solo/testdrive is always "host". */
function hostGlyphEligible() {
  const mode = _options.detectGameMode?.();
  return mode !== "solo" && mode !== "testdrive";
}

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

  // * Luminance-floored for the opaque ink plates: custom hues around 200–290°
  // * (e.g. #0000ff) land at ~2.2:1 on ink and become illegible unclamped.
  const cssHex = clampAccentLuminance(resolveCartNeonCss(slot, { youConnId }));
  const currentGlow = box.style.getPropertyValue("--hud-glow");

  if (currentGlow !== cssHex) {
    box.style.setProperty("--hud-glow", cssHex);
    box.dataset.hudColor = "custom";
  }
}

/** Last accent written to --hud-player-accent — skip style writes on unchanged frames. */
let _playerAccentCss = "";

/**
 * Lifts dark cart colors to a minimum luminance so the "you" accent stays
 * readable against the HUD's dark panels (custom hue slider allows dark picks).
 *
 * @param {string} cssHex
 * @returns {string}
 */
function clampAccentLuminance(cssHex) {
  const m = /^#([0-9a-f]{6})$/i.exec(cssHex || "");
  if (!m) return cssHex;
  const n = parseInt(m[1], 16);
  let r = (n >> 16) & 255;
  let g = (n >> 8) & 255;
  let b = n & 255;
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const MIN_LUM = 140;
  if (lum >= MIN_LUM) return cssHex;
  const t = (MIN_LUM - lum) / (255 - lum);
  r = Math.round(r + (255 - r) * t);
  g = Math.round(g + (255 - g) * t);
  b = Math.round(b + (255 - b) * t);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

/**
 * Syncs --hud-player-accent on the HUD root from the local cart's neon color.
 * Everything that means "you" (ready button, score float, hitmarker tint) reads it.
 *
 * @param {{ color?: string | number, kind?: string, connId?: string, lookHex?: number | null }} slot
 * @param {string | null | undefined} youConnId
 */
function syncPlayerAccent(slot, youConnId) {
  if (!elements.root) return;
  const accent = clampAccentLuminance(resolveCartNeonCss(slot, { youConnId }));
  if (accent !== _playerAccentCss) {
    _playerAccentCss = accent;
    elements.root.style.setProperty("--hud-player-accent", accent);
  }
}

let _options = {};

/** @type {Record<string, any>} */
const elements = {
  root: null,
  status: null,
  arenaSplash: null,
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
/** Last whole second a mid-round time beat was evaluated for; null outside running. */
let _lastTimeBeatSecond = null;
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
 * Syncs root-level layout classes. The utility region (flex) now owns the
 * mute/menu corner, so the old rect-overlap "tight space" probing is gone —
 * the mute-only audio widget always fits beside the menu button.
 */
export function syncHudLayout() {
  if (!elements.root) return;

  const menuVisible = _options.getMenuVisible ? _options.getMenuVisible() : false;
  const touch = _options.getIsTouchDevice ? _options.getIsTouchDevice() : false;
  const escOpen = isEscOverlayVisible();
  elements.root.classList.toggle("hud-has-menu-btn", touch && !menuVisible && !escOpen);
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
  // * speed-flavored verb pool rather than the boost-flavored "BOOSTED OFF".
  if (hit?.wasCritical) {
    const critVerbs = ["STEAMROLLED", "OBLITERATED", "FLATTENED"];
    return critVerbs[Math.floor(Math.random() * critVerbs.length)];
  }
  const verbs = ["YEETED", "RAMMED", "BOOSTED OFF", "LAUNCHED", "BODIED", "PUNTED"];
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
    "FORGOT THE BRAKES",
    "TOOK A SHORTCUT",
    "LEFT THE CHAT",
  ];
  return verbs[Math.floor(Math.random() * verbs.length)];
}



// * Player-facing arena names (must match the menu level cards in index.html).
const ARENA_SPLASH_NAMES = {
  classicRecord: "CART RAVE",
  backrooms: "THE STOREROOMS",
  zanzibar: "SUNDIAL STATION",
  testArena: "TEST ARENA",
};

/** Shows/hides the countdown arena name card (CSS opacity handles the fade). */
function setArenaSplashVisible(visible) {
  if (!elements.arenaSplash) return;
  if (visible) {
    const levelId = _options.getLevelId?.();
    elements.arenaSplash.textContent = ARENA_SPLASH_NAMES[levelId] ?? "";
  }
  elements.arenaSplash.classList.toggle("hud-arena-splash-visible", visible);
}

/**
 * Match point: rounds are timer-decided (no target score), so the tension case is the
 * final 15 seconds with the top two scores within one KO of each other — any fall can
 * flip the result. Sudden Death has its own banner and wins over this.
 * @param {object} roundState
 * @returns {boolean}
 */
function isMatchPointState(roundState) {
  if (!roundState || roundState.isSuddenDeath) return false;
  const startedAtMs = roundState.startedAtMs || 0;
  if (!startedAtMs) return false;
  const totalRoundMs = roundState.totalRoundMs
    ?? (_options.getDefaultRoundMs ? _options.getDefaultRoundMs() : 60000);
  const remainingMs = totalRoundMs - (adjustedNow() - startedAtMs);
  if (remainingMs > 15000 || remainingMs <= 0) return false;
  const scores = roundState.scores || {};
  let top = 0;
  let second = 0;
  for (let i = 0; i < 4; i += 1) {
    const s = Number(scores[i] || 0);
    if (s > top) {
      second = top;
      top = s;
    } else if (s > second) {
      second = s;
    }
  }
  return top > 0 && top - second <= 1;
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
      // * Round-start kick — camera punch-in + whoosh live in main (they own the FOV rig).
      _options.onGoMoment?.();
    }
  }
  _prevRoundPhase = roundPhase;

  // * GO! is the round's celebration beat — the only status that earns glow.
  elements.status?.classList.toggle("is-celebration", Date.now() < _goUntilMs);
  if (Date.now() < _goUntilMs) {
    setHudDisplay(elements.status, "block", "status");
    elements.status.style.color = "var(--color-yellow)";
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
    // * Digits alternate the brand magenta/cyan accents as they stamp in.
    elements.status.style.color = n % 2 === 0 ? "var(--color-cyan)" : "var(--color-magenta)";
    elements.status.textContent = `GET READY  ${n}`;
    setArenaSplashVisible(true);
    if (_lastCountdownN !== n) {
      _lastCountdownN = n;
      if (n >= 1 && n <= 3) announce(`countdown_${n}`);
      const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
      if (!reduced) {
        // * Rubber stamp: airborne (shadow far below) → squash contact (shadow
        // * slammed flat) → settle. The shadow catching up sells the weight.
        elements.status.animate(
          [
            {
              transform: "rotate(-1.5deg) scale(1.9)",
              opacity: 0,
              textShadow: "0.16em 0.16em 0 var(--color-ink-deep), 0.28em 0.28em 0 var(--color-ink-deep)",
            },
            {
              transform: "rotate(-1.5deg) scale(0.92)",
              opacity: 1,
              offset: 0.45,
              textShadow: "0.02em 0.02em 0 var(--color-ink-deep), 0.05em 0.05em 0 var(--color-ink-deep)",
            },
            {
              transform: "rotate(-1.5deg) scale(1)",
              textShadow: "0.05em 0.05em 0 var(--color-ink-deep), 0.1em 0.1em 0 var(--color-ink-deep)",
            },
          ],
          { duration: 200, easing: "cubic-bezier(0.1, 0.9, 0.2, 1)" },
        );
      }
    }
  } else if (roundPhase === "podium") {
    setHudDisplay(elements.status, "none", "status");
    elements.status.textContent = "";
  } else if (roundPhase === "running" && roundState?.isSuddenDeath) {
    setHudDisplay(elements.status, "block", "status");
    elements.status.style.color = "var(--color-alert)";
    elements.status.textContent = "SUDDEN DEATH";
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
    if (!reduced) {
      elements.status.style.animation = "suddenDeathPulse 0.8s ease-in-out infinite";
    }
  } else if (roundPhase === "running" && isMatchPointState(roundState)) {
    // * Final seconds + top two within one KO: the next fall can decide the round.
    setHudDisplay(elements.status, "block", "status");
    elements.status.style.color = "var(--color-yellow)";
    elements.status.textContent = "MATCH POINT";
  } else {
    setHudDisplay(elements.status, "none", "status");
    elements.status.textContent = "";
    elements.status.style.animation = "";
  }
  if (roundPhase !== "countdown") setArenaSplashVisible(false);
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

    // * Mid-round tension beats — 60s and 30s time checks so the round gains a curve
    // * before the final-10s cliff. Edge-gated per second; oncePerRound in the
    // * announcer table absorbs any duplicates (e.g. host migration mid-round).
    if (!isSuddenDeath && remainingMs > 0 && _lastTimeBeatSecond !== seconds) {
      _lastTimeBeatSecond = seconds;
      if (seconds === 60) announce("one_minute");
      else if (seconds === 30) announce("thirty_seconds");
      if (
        (seconds === 60 || seconds === 30) &&
        !(window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false)
      ) {
        elements.timerNum?.animate?.(
          [
            { transform: "scale(1.18)" },
            { transform: "scale(1)" },
          ],
          { duration: 300, easing: "ease-out" },
        );
      }
    }
    // * Amber warning tier for the last 30 seconds (red urgency owns the last 10).
    if (elements.timer) {
      elements.timer.classList.toggle(
        "hud-timer-warn",
        !isSuddenDeath && remainingMs > 0 && seconds <= 30 && seconds > 10,
      );
    }

    // * Final-10-seconds urgency — red pulse + one tick per remaining second.
    // * Skipped during Sudden Death (remaining time is pinned to zero there).
    const urgent = !isSuddenDeath && remainingMs > 0 && seconds <= 10 && seconds >= 1;
    if (elements.timer) elements.timer.classList.toggle("hud-timer-urgent", urgent);
    if (urgent) {
      if (_lastUrgentTickSecond !== seconds) {
        _lastUrgentTickSecond = seconds;
        playTimerTick(seconds);
        if (seconds === 10) announce("last_call");
        if (!(window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false)) {
          elements.timerNum?.animate?.(
            [
              { transform: "scale(1.12)" },
              { transform: "scale(1)" },
            ],
            { duration: 220, easing: "ease-out" },
          );
        }
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
    if (elements.timer) {
      elements.timer.classList.remove("hud-timer-urgent");
      elements.timer.classList.remove("hud-timer-warn");
    }
    if (elements.directive) {
      elements.directive.classList.remove("hud-directive--active");
    }
    _lastUrgentTickSecond = null;
    _lastTimeBeatSecond = null;
    _wasSuddenDeath = false;
  }
}

/**
 * Living Store directive chip under the round timer. Called every frame from
 * frameVisuals with the engine's active directive (or null). Shows the directive
 * name, whole seconds remaining, and a drain bar in the directive's accent color.
 *
 * @param {{ id: string, title: string, startedAtMs: number, untilMs: number, accent: string } | null} directive
 * @param {number} nowMs performance.now() for this frame.
 * @returns {void}
 */
export function setHudDirective(directive, nowMs) {
  const el = elements.directive;
  if (!el) return;

  if (!directive) {
    el.classList.remove("hud-directive--active");
    return;
  }

  const totalMs = Math.max(1, directive.untilMs - directive.startedAtMs);
  const remainingMs = Math.max(0, directive.untilMs - nowMs);

  el.classList.add("hud-directive--active");
  el.style.setProperty("--directive-accent", directive.accent);
  if (elements.directiveName.textContent !== directive.title) {
    elements.directiveName.textContent = directive.title;
  }
  const secsText = `${Math.ceil(remainingMs / 1000)}s`;
  if (elements.directiveSecs.textContent !== secsText) {
    elements.directiveSecs.textContent = secsText;
  }
  elements.directiveFill.style.width = `${((remainingMs / totalMs) * 100).toFixed(1)}%`;
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
 * Per-slot rampage pip state (last-known combo streak from KO events, 5s decay).
 * @type {Array<{ tier: number, multiplier: number, expiryMs: number }>}
 */
let _comboPipBySlot = [
  { tier: 0, multiplier: 1, expiryMs: 0 },
  { tier: 0, multiplier: 1, expiryMs: 0 },
  { tier: 0, multiplier: 1, expiryMs: 0 },
  { tier: 0, multiplier: 1, expiryMs: 0 },
];

/**
 * Records a player's combo streak for the scoreboard rampage pip. Fed from KO events
 * (which reach every client), so opponents' streaks are visible cross-client without
 * new wire fields. Pass tier 0 to clear (e.g. the streak owner just fell).
 *
 * @param {number} slotIndex
 * @param {number} tier
 * @param {number} [multiplier]
 */
export function noteComboPip(slotIndex, tier, multiplier = 1) {
  const pip = _comboPipBySlot[slotIndex];
  if (!pip) return;
  pip.tier = tier;
  pip.multiplier = multiplier;
  pip.expiryMs = tier > 0 ? performance.now() + 5000 : 0;
}

/** Applies crown + rampage pip state to one rendered score row (runs per frame). */
function syncRowIndicators(entry, isLeader) {
  if (entry.crown) {
    const display = isLeader ? "inline-block" : "none";
    if (entry.crown.style.display !== display) entry.crown.style.display = display;
  }
  if (!entry.pip) return;
  const slotIndex = entry.slotIndex ?? -1;
  let tier = 0;
  let multiplier = 1;
  if (slotIndex >= 0) {
    if (slotIndex === _lastLocalIdx) {
      const state = gameStore.getState();
      if ((state.localComboTier || 0) > 0 && performance.now() < (state.localComboExpiryMs || 0)) {
        tier = state.localComboTier;
        multiplier = state.localComboMultiplier || 1;
      }
    } else {
      const pip = _comboPipBySlot[slotIndex];
      if (pip && pip.tier > 0 && performance.now() < pip.expiryMs) {
        tier = pip.tier;
        multiplier = pip.multiplier;
      }
    }
  }
  const display = tier > 0 ? "inline-block" : "none";
  if (entry.pip.style.display !== display) entry.pip.style.display = display;
  if (tier > 0) {
    const text = `${multiplier.toFixed(1)}×`;
    if (entry.pip.textContent !== text) entry.pip.textContent = text;
    const tierAttr = String(tier);
    if (entry.pip.dataset.tier !== tierAttr) entry.pip.dataset.tier = tierAttr;
  }
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
          const info = p ? PERSONALITY_META[p.name] : null;
          if (info) {
            if (entry.badge.dataset.icon !== info.icon) {
              entry.badge.dataset.icon = info.icon;
              entry.badge.innerHTML = svgIcon(info.icon, { label: info.label });
              entry.badge.title = info.label;
            }
            entry.badge.style.color = info.color;
            entry.badge.style.display = "inline-flex";
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
        if (isLocal && slot) syncPlayerAccent(slot, youConnId);
      }
    }

    // * Crown + rampage pips refresh every frame — pips decay on a timer (not on score
    // * changes), and the crown derives from the same rows the boxes already show.
    const rowsNow = _sortedScoreRows || [];
    let topScore = 0;
    let topCount = 0;
    for (const r of rowsNow) {
      if (r.score > topScore) {
        topScore = r.score;
        topCount = 1;
      } else if (r.score === topScore && r.score > 0) {
        topCount += 1;
      }
    }
    for (let pos = 0; pos < 4; pos += 1) {
      const entry = elements.scoreBoxes[pos];
      const row = rowsNow[pos];
      if (!entry) continue;
      const prevSlotIndex = entry.slotIndex;
      entry.slotIndex = row ? row.slotIndex : -1;
      // * Rank-swap: the new occupant is slapped onto the slot from above — a
      // * drop with a 2px ground-contact squash, not a fade-up.
      if (prevSlotIndex !== -1 && entry.slotIndex !== -1 && prevSlotIndex !== entry.slotIndex) {
        const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
        if (!reduced && typeof entry.box.animate === "function") {
          entry.box.animate(
            [
              { transform: "translateY(-10px) scale(1.08)", opacity: 0.7 },
              { transform: "translateY(2px) scale(0.97)", opacity: 1, offset: 0.55 },
              { transform: "translateY(0) scale(1)", opacity: 1 },
            ],
            { duration: 180, easing: "cubic-bezier(0.1, 0.9, 0.2, 1)" },
          );
        }
      }
      const isLeader = Boolean(row && topScore > 0 && topCount === 1 && row.score === topScore);
      entry.box.classList.toggle("isLeader", isLeader);
      // * Host glyph follows the host slot every frame so migration moves it immediately.
      if (entry.host) {
        const hostId = hostGlyphEligible() ? getHostId() : null;
        const slot = row ? netSlots?.[row.slotIndex] : null;
        const showHost = Boolean(hostId && slot?.connId === hostId);
        const display = showHost ? "inline-flex" : "none";
        if (entry.host.style.display !== display) entry.host.style.display = display;
      }
      syncRowIndicators(entry, isLeader);
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
        if (entry.crown) entry.crown.style.display = "none";
        if (entry.pip) entry.pip.style.display = "none";
        entry.slotIndex = -1;
      }
      const pip = _comboPipBySlot[i];
      if (pip) {
        pip.tier = 0;
        pip.expiryMs = 0;
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
  _lastTimeBeatSecond = null;
  _wasSuddenDeath = false;
  _boostDisplay = null;
  if (_toastTimeoutId) {
    clearTimeout(_toastTimeoutId);
    _toastTimeoutId = null;
  }
  resetStage();

  const existing = document.getElementById("hud");
  if (existing) existing.remove();

  elements.root = document.createElement("div");
  elements.root.id = "hud";
  const touchDevice = _options.getIsTouchDevice ? _options.getIsTouchDevice() : false;
  if (touchDevice) elements.root.classList.add("hud-touch");

  // * Screen regions — every HUD element mounts into a named zone with one job:
  // * MATCH (top-left), STANDINGS (top-center), EVENTS (top-right feed),
  // * STAGE (upper-center moments), POD (bottom-center player state),
  // * UTILITY (corner non-gameplay). Regions own position; children stay static.
  const regions = {};
  for (const name of ["match", "standings", "events", "stage", "pod", "utility"]) {
    const region = document.createElement("div");
    region.className = `hud-region hud-region-${name}`;
    elements.root.appendChild(region);
    regions[name] = region;
  }
  elements.regions = regions;

  elements.status = document.createElement("div");
  elements.status.className = "hud-status";

  // * Arena name card — fills the countdown's dead visual space, fades out on GO.
  elements.arenaSplash = document.createElement("div");
  elements.arenaSplash.className = "hud-arena-splash";

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
  // * No "TIME LEFT" caption — a giant ticking number captions itself (art
  // * direction: the tracked micro-caps meta layer is the esports tell).
  elements.timerRd = document.createElement("span");
  elements.timerRd.className = "hud-timer-rd";
  elements.timerRd.textContent = "";
  timerMeta.appendChild(timerPip);
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

  // * Living Store directive chip — compact status pill under the round timer while
  // * a directive window is active: directive name, seconds left, and a drain bar.
  // * Driven per frame by setHudDirective() (frameVisuals → directiveEngine state).
  elements.directive = document.createElement("div");
  elements.directive.className = "hud-directive";
  const directiveRow = document.createElement("div");
  directiveRow.className = "hud-directive-row";
  elements.directiveName = document.createElement("span");
  elements.directiveName.className = "hud-directive-name";
  elements.directiveSecs = document.createElement("span");
  elements.directiveSecs.className = "hud-directive-secs";
  directiveRow.appendChild(elements.directiveName);
  directiveRow.appendChild(elements.directiveSecs);
  const directiveBar = document.createElement("div");
  directiveBar.className = "hud-directive-bar";
  elements.directiveFill = document.createElement("i");
  directiveBar.appendChild(elements.directiveFill);
  elements.directive.appendChild(directiveRow);
  elements.directive.appendChild(directiveBar);

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

    const label = document.createElement("div");
    label.className = "hud-scoreLabel";
    label.textContent = `P${i + 1}`;

    // * Host antenna — quiet neutral mark, "this player's machine runs the match".
    const host = document.createElement("span");
    host.className = "hud-scoreHost";
    host.innerHTML = svgIcon("host", { label: "Host" });
    host.title = "HOST — runs this match";
    host.style.display = "none";

    const you = document.createElement("span");
    you.className = "hud-scoreYou";
    you.textContent = "YOU";

    const value = document.createElement("div");
    value.className = "hud-scoreValue";
    value.textContent = "0";

    // * In-match leader crown — mirrors the results-screen crown so "who's winning"
    // * is glanceable mid-round, not just at the podium.
    const crown = document.createElement("span");
    crown.className = "hud-scoreCrown";
    crown.innerHTML = svgIcon("crown");
    crown.style.display = "none";

    // * Rampage pip — shows any player's active combo streak (×1.5/×2/×3), so
    // * opponents can finally see who is hot.
    const pip = document.createElement("span");
    pip.className = "hud-scorePip";
    pip.style.display = "none";

    // * Dizzy stars — cartoon "knocked silly" overlay while the chip dips on a KO.
    const dizzy = document.createElement("span");
    dizzy.className = "hud-scoreDizzy";
    dizzy.innerHTML = svgIcon("dizzy");
    dizzy.style.display = "none";
    box.appendChild(dizzy);

    box.appendChild(rank);
    box.appendChild(crown);
    box.appendChild(badge);
    box.appendChild(label);
    box.appendChild(host);
    box.appendChild(you);
    box.appendChild(pip);
    box.appendChild(value);
    elements.scores.appendChild(box);
    elements.scoreBoxes.push({ root: elements.root, box, rank, badge, label, host, you, value, crown, pip, dizzy, dizzyTimeoutId: null, slotIndex: -1 });
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

  regions.stage.appendChild(elements.status);
  regions.stage.appendChild(elements.arenaSplash);
  regions.match.appendChild(elements.timer);
  regions.match.appendChild(elements.directive);
  regions.standings.appendChild(elements.scores);
  regions.events.appendChild(elements.feed);
  regions.pod.appendChild(elements.readyBtn);

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
  regions.pod.insertBefore(elements.comboBadge, elements.readyBtn);

  // * Kill-confirm — the cartoon KO burst stamps at screen center on a local KO.
  elements.hitmarker = document.createElement("div");
  elements.hitmarker.className = "hud-hitmarker";
  elements.hitmarker.setAttribute("aria-hidden", "true");
  elements.hitmarker.innerHTML = svgIcon("burst", { size: "100%" });
  elements.root.appendChild(elements.hitmarker);

  // * Boost charge meter — keyboard/gamepad only; the touch BOOST button has its own flash.
  if (!touchDevice) {
    elements.boost = document.createElement("div");
    elements.boost.className = "hud-boost";
    elements.boost.style.display = "none";
    const boostLabel = document.createElement("span");
    boostLabel.className = "hud-boost-label";
    boostLabel.innerHTML = svgIcon("bolt", { label: "Boost" });
    const boostTrack = document.createElement("div");
    boostTrack.className = "hud-boost-track";
    elements.boostFill = document.createElement("i");
    elements.boostFill.className = "hud-boost-fill";
    boostTrack.appendChild(elements.boostFill);
    elements.boost.appendChild(boostLabel);
    elements.boost.appendChild(boostTrack);
    regions.pod.insertBefore(elements.boost, elements.readyBtn);
  }

  // * Challenge-complete / unlock toast (top center, auto-hides).
  elements.toast = document.createElement("div");
  elements.toast.className = "hud-toast";
  const toastKicker = document.createElement("span");
  toastKicker.className = "hud-toast-kicker";
  toastKicker.textContent = "◆ CHALLENGE COMPLETE";
  elements.toastKicker = toastKicker;
  elements.toastTitle = document.createElement("span");
  elements.toastTitle.className = "hud-toast-title";
  elements.toast.appendChild(toastKicker);
  elements.toast.appendChild(elements.toastTitle);
  regions.stage.appendChild(elements.toast);

  // In-game audio widget
  elements.audio = document.createElement("div");
  elements.audio.className = "hud-audio";

  const isMuted = _options.getIsMuted ? _options.getIsMuted() : false;
  elements.muteBtn = document.createElement("button");
  elements.muteBtn.className = "hud-mute-btn";
  elements.muteBtn.setAttribute("aria-label", "Toggle mute");
  elements.muteBtn.innerHTML = svgIcon(isMuted ? "speakerMuted" : "speaker");
  if (isMuted) elements.muteBtn.classList.add("muted");
  elements.muteBtn.addEventListener("click", () => {
    if (_options.setIsMuted) {
      _options.setIsMuted(!_options.getIsMuted());
    }
    animateMuteToggle(elements.muteBtn);
    syncAudioControls();
  });
  wireButtonPressFeedback(elements.muteBtn, { scale: 0.92 });

  // * Mute toggle only — volume sliders are settings UI and live in the esc
  // * overlay, not over live gameplay (HUD redesign: audio widget demoted).
  elements.audio.appendChild(elements.muteBtn);
  regions.utility.appendChild(elements.audio);

  // * Connection pill — hidden while healthy; only mid-session socket loss shows it.
  elements.conn = document.createElement("div");
  elements.conn.className = "hud-conn";
  elements.conn.textContent = "RECONNECTING…";
  elements.conn.style.display = "none";
  regions.utility.insertBefore(elements.conn, elements.audio);

  elements.menuBtn = document.createElement("button");
  elements.menuBtn.type = "button";
  elements.menuBtn.className = "hud-menu-btn";
  elements.menuBtn.setAttribute("aria-label", "Open menu");
  elements.menuBtn.innerHTML = svgIcon("menu");
  elements.menuBtn.style.display = "none";
  elements.menuBtn.addEventListener("click", () => {
    if (isEscOverlayVisible()) hideEscOverlay();
    else showEscOverlay();
  });
  wireButtonPressFeedback(elements.menuBtn, { scale: 0.94 });
  regions.utility.appendChild(elements.menuBtn);

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
    showScoreFloat,
    noteComboPip,
    noteChipKO,
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
  updateConnectionPill();
  scheduleHudLayoutSync();
}

/** Shows the RECONNECTING pill only for mid-session socket loss in online modes. */
function updateConnectionPill() {
  if (!elements.conn) return;
  const mode = _options.detectGameMode?.();
  const online = mode !== "solo" && mode !== "testdrive";
  const show = online && getConnectionState() === "reconnecting";
  const display = show ? "flex" : "none";
  if (elements.conn.style.display !== display) elements.conn.style.display = display;
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
  const cfg = _options.getBoostChargeCfg ? _options.getBoostChargeCfg() : null;
  const cart = _options.getLocalCart ? _options.getLocalCart() : null;
  const show = roundState?.phase === "running" && !!cart && cfg?.enabled === true;

  let fillPct = 100;
  /** @type {"ready" | "charging" | "charged" | "cooldown"} */
  let state = "ready";
  if (show) {
    const now = performance.now();
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
  }

  // * Mobile: the charge state paints the BOOST touch button itself (no meter).
  if (_options.getIsTouchDevice?.()) {
    updateBoostRing(show ? fillPct : null, state);
    return;
  }

  if (!elements.boost || !elements.boostFill) return;
  const displayVal = show ? "flex" : "none";
  if (_boostDisplay !== displayVal) {
    elements.boost.style.display = displayVal;
    _boostDisplay = displayVal;
  }
  if (!show) return;
  elements.boostFill.style.width = `${fillPct}%`;
  if (elements.boost.dataset.state !== state) elements.boost.dataset.state = state;
}

/**
 * Cartoon KO reaction on the victim's score chip: a brief desaturate-dip with
 * dizzy stars over the rank numeral (~1s). Fired from the kill-feed reactor so
 * every client sees it for every KO.
 *
 * @param {number} slotIndex
 */
export function noteChipKO(slotIndex) {
  const entry = elements.scoreBoxes?.find((e) => e.slotIndex === slotIndex);
  if (!entry?.box) return;

  if (entry.dizzy) {
    entry.dizzy.style.display = "inline-flex";
    if (entry.dizzyTimeoutId) clearTimeout(entry.dizzyTimeoutId);
    entry.dizzyTimeoutId = setTimeout(() => {
      entry.dizzyTimeoutId = null;
      if (entry.dizzy) entry.dizzy.style.display = "none";
    }, 1000);
  }

  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
  if (!reduced && typeof entry.box.animate === "function") {
    // * Getting KO'd is instant: hit the gray by ~110ms, then a long "coming
    // * to" recovery (the dazed state pairs with the 1s dizzy stars).
    entry.box.animate(
      [
        { filter: "saturate(1) brightness(1)" },
        { filter: "saturate(0.1) brightness(0.65)", offset: 0.12 },
        { filter: "saturate(1) brightness(1)" },
      ],
      { duration: 900, easing: "ease-out" },
    );
  }
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
 * Floats the reward breakdown for a local KO — "+8" with the bonus labels that built
 * it ("2.0× SAVAGE · CRIT · LEADER DOWN"). The invisible half of the scoring system
 * (koEvent.reward) finally reaches the player at the moment it happens.
 *
 * @param {{ base: number, critical: number, leader: number, highGround?: number, multiplier: number, total: number }} reward
 * @param {string} [cause] KO cause ("center_hole"/"corner_void" add zone labels).
 */
export function showScoreFloat(reward, cause) {
  if (!elements.root || !reward || !(reward.total > 0)) return;

  const el = document.createElement("div");
  el.className = "hud-score-float";

  const amount = document.createElement("div");
  amount.className = "hud-score-float-amt";
  amount.textContent = `+${reward.total}`;
  el.appendChild(amount);

  const labels = [];
  if (cause === "center_hole") labels.push("HOLE SHOT");
  if (cause === "corner_void") labels.push("VOID DROP");
  if (reward.critical > 0) labels.push("CRIT");
  if (reward.leader > 0) labels.push("LEADER DOWN");
  if ((reward.highGround ?? 0) > 0) labels.push("HIGH GROUND");
  if (reward.multiplier > 1) labels.push(`${reward.multiplier.toFixed(1)}×`);
  if (labels.length > 0) {
    const sub = document.createElement("div");
    sub.className = "hud-score-float-sub";
    sub.textContent = labels.join(" · ");
    el.appendChild(sub);
  }

  elements.root.appendChild(el);
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
  if (reduced || typeof el.animate !== "function") {
    setTimeout(() => el.remove(), 1200);
    return;
  }
  // * SLAM in by ~130ms (big, from camera, shadow catching up), hold nearly
  // * still for the read, then leave. Keyframes carry the base rotate(-4deg)
  // * so the tilt survives the WAAPI transform override.
  const anim = el.animate(
    [
      { transform: "translate(-50%, 4px) rotate(-4deg) scale(1.3)", opacity: 0 },
      { transform: "translate(-50%, -18px) rotate(-4deg) scale(0.98)", opacity: 1, offset: 0.12 },
      { transform: "translate(-50%, -22px) rotate(-4deg) scale(1)", opacity: 1, offset: 0.75 },
      { transform: "translate(-50%, -48px) rotate(-4deg) scale(0.94)", opacity: 0 },
    ],
    { duration: 1100, easing: "ease-out" },
  );
  anim.onfinish = () => el.remove();
}

/**
 * Shows the top-center toast with the given title (challenge completions and, with a
 * custom kicker, mid-match unlocks).
 * @param {string} title
 * @param {string} [kicker] Kicker label above the title.
 */
export function showChallengeToast(title, kicker = "◆ CHALLENGE COMPLETE") {
  if (!elements.toast || !elements.toastTitle) return;
  const TOAST_MS = 3200;
  // * Center Stage routing — toasts queue behind announcer callouts (priority 3 > 2)
  // * so the stage band shows one moment at a time; overflow beyond 2 queued drops.
  claimStage({
    kind: "toast",
    priority: 2,
    durationMs: TOAST_MS,
    show: () => {
      if (!elements.toast || !elements.toastTitle) return;
      if (elements.toastKicker) elements.toastKicker.textContent = kicker;
      elements.toastTitle.textContent = title;
      elements.toast.classList.add("active");
      if (_toastTimeoutId) clearTimeout(_toastTimeoutId);
      _toastTimeoutId = setTimeout(() => {
        elements.toast?.classList.remove("active");
        _toastTimeoutId = null;
      }, TOAST_MS);
    },
    hide: () => {
      if (_toastTimeoutId) {
        clearTimeout(_toastTimeoutId);
        _toastTimeoutId = null;
      }
      elements.toast?.classList.remove("active");
    },
  });
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
    // * Punch: peak at 30% of the timeline, then a long recoil settle — a hit,
    // * not a balloon inflating. (Badge rests at rotate(-2deg); keep it.)
    elements.comboBadge.animate(
      [
        { transform: "scale(1) rotate(-2deg)" },
        { transform: "scale(1.42) rotate(-2deg)", offset: 0.3 },
        { transform: "scale(1) rotate(-2deg)" },
      ],
      { duration: 220, easing: "cubic-bezier(0.16, 1, 0.3, 1)" }
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
  // * Same luminance floor as the chips — dark custom cart colors must stay
  // * readable on the opaque ink plate (clamp is a no-op for non-hex strings).
  row.style.setProperty("--c", clampAccentLuminance(actorColor || "rgba(255,255,255,0.9)"));
  row.style.setProperty("--c2", clampAccentLuminance(targetColor || "rgba(255,255,255,0.9)"));

  let displayVerb = verb;
  if (comboTier > 0 && comboMultiplier > 1.0) {
    const tierName = comboTier === 1 ? "RAMPAGE" : comboTier === 2 ? "SAVAGE" : "CARNAGE";
    displayVerb = `${verb} [${comboMultiplier.toFixed(1)}x ${tierName}]`;
  }

  // * Cartoon KO marker — impact burst for attributed kills (attacker color),
  // * dizzy stars for self-inflicted spills (victim color).
  const icon = document.createElement("span");
  icon.className = "hud-feed-icon";
  icon.innerHTML = svgIcon(actorName ? "burst" : "dizzy");
  icon.style.color = actorName ? "var(--c)" : "var(--c2)";

  // * Inline host antenna before the host's name — no "HOST" label, zero extra width.
  const makeHostGlyph = () => {
    const glyph = document.createElement("span");
    glyph.className = "hud-feed-host";
    glyph.innerHTML = svgIcon("host", { label: "Host" });
    return glyph;
  };

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
    row.appendChild(icon);
    if (isHostPlayerName(actorName)) row.appendChild(makeHostGlyph());
    row.appendChild(actor);
    row.appendChild(v);
    if (isHostPlayerName(targetName)) row.appendChild(makeHostGlyph());
    row.appendChild(target);
  } else {
    const target = document.createElement("span");
    target.className = "hud-feed-target";
    target.textContent = targetName;
    const v = document.createElement("span");
    v.className = "hud-feed-verb";
    v.textContent = displayVerb;
    row.appendChild(icon);
    if (isHostPlayerName(targetName)) row.appendChild(makeHostGlyph());
    row.appendChild(target);
    row.appendChild(v);
  }

  elements.feed.prepend(row);
  animateKillFeedEnter(row);

  // * Trim overflow synchronously — animated exit is only for timed auto-dismiss.
  while (elements.feed.children.length > 4) {
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
  if (!elements.muteBtn) return;
  const isMuted = _options.getIsMuted ? _options.getIsMuted() : false;
  const musicGain = _options.getMusicGain ? _options.getMusicGain() : 0.5;
  const sfxVolume = _options.getSfxVolume ? _options.getSfxVolume() : 0.5;
  const AUDIO_VOLUME_MAX = _options.getAudioVolumeMax ? _options.getAudioVolumeMax() : 1.15;

  elements.muteBtn.innerHTML = svgIcon(isMuted ? "speakerMuted" : "speaker");
  elements.muteBtn.classList.toggle("muted", isMuted);

  updatePauseOverlayAudioState(isMuted, musicGain, sfxVolume, AUDIO_VOLUME_MAX);
}
