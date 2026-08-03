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
import { claimStage, resetStage, STAGE_PRIORITY } from "./ui/centerStage.js";
import { svgIcon } from "./ui/icons.js";
import { updateBoostRing } from "./touchControls.js";
import { clamp, clampInt } from "./utils.js";
import { resolveCartNeonCss } from "./customization.js";
import { playTimerTick } from "./sfxSynth.js";
import { getConnectionState, getHostId, getHostClockOffsetMs, getNetSlots, resolvedPartyRoomFromUrl } from "./netcode.js";
import { getRoundClockNowMs, getRoundRemainingMs } from "./roundClock.js";
import { ROUND_DURATION_MS } from "../shared/roundConstants.js";
import { announce } from "./announcer/announcerManager.js";
import { gameStore } from "./stores/gameStore.js";
import { emblemForSlot } from "./npcNames.js";
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
  feedRows: null,
  scoreBoxes: [],
  readyBtn: null,
  lobbyScreen: null,
  lobbySlots: [],
  lobbyCount: null,
  lobbyCode: null,
  lobbyCopy: null,
  lobbyStatus: null,
  lobbyLink: null,
  lobbyLinkField: null,
  lobbyReadyBtn: null,
  lobbyReadyLabel: null,
  menuBtn: null,
  audio: null,
  comboBadge: null,
  comboMultiplier: null,
  comboTier: null,
  comboSecs: null,
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
  edgeDanger: null,
  boost: null,
  boostFill: null,
  boostValue: null,
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
/** Generation bumped every fresh countdown entry — guards a deferred catch-up beat
 *  (see updateStatus) from firing against a LATER, unrelated countdown. */
let _countdownGeneration = 0;
/** Minimum perceptible gap between a retroactively-fired missed digit and the GO beat
 *  that follows it — see updateStatus's countdown→running catch-up branch. */
const MISSED_COUNTDOWN_CATCHUP_MS = 220;
/** Last stamped big-moment banner key (countdown digit / go / sd / mp); the
 *  "axis punch" fires once per key change so every big moment stamps in once. */
let _lastBannerKey = null;
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
/**
 * Slot index of the sole leader (top score, non-zero, no tie), or -1.
 * The world-space nameplates read this so the crown rule lives in exactly one
 * place — the scoreboard's `isLeader` and the cart's crown can never disagree.
 */
let _leaderSlotIndex = -1;

/** Watches the transaction-log rows so the receipt hides itself when empty. */
let _feedRowObserver = null;
/** Revert timeout for the lobby COPY button's "COPIED!" confirmation. */
let _lobbyCopyTimeoutId = null;
/**
 * performance.now() when the local player became the ONLY human in a friends lobby,
 * or null while that is not the case. Drives the mistyped-code banner (FRIENDS-JOIN-1).
 * Null rather than 0 as the sentinel: performance.now() legitimately reads 0 at page
 * origin, so a numeric zero would mean both "started now" and "not counting".
 */
let _lobbyAloneSinceMs = null;
/** How long alone-after-seated counts as "that code was probably wrong". */
const LOBBY_STRANDED_MS = 4500;
/** Quantized (0.5%) round-timer fill last written — skip redundant per-frame style writes. */
let _hudTimerFillHalfPct = -1;
/** Non-zero while the host-stall toast for the current stall has been shown (run-6). */
let _hudHostStallToastAtMs = 0;



/**
 * Round-clock now adjusted by the host (P2P) clock offset.
 * Same domain as host-stamped `startedAtMs` (getRoundClockNowMs on the host).
 * Party offset is only for converting Worker gameStart startsAtMs (NET-CLK-1).
 */
function adjustedNow() {
  return getRoundClockNowMs() - getHostClockOffsetMs();
}

function setHudSuppressed(suppressed) {
  if (elements.root) {
    elements.root.classList.toggle("hud-suppressed", suppressed);
  }
}

/** @type {number | null} */
let hudLayoutRaf = null;
let hudLayoutBound = false;
/** @type {ResizeObserver | null} */
let utilityResizeObserver = null;

/**
 * Measures the top-right utility strip (mute + optional menu) and publishes
 * --hud-utility-width so touch standings can sit flush beside it without a
 * magic clamp(84px…) fudge that collides when the menu button appears.
 */
function measureUtilityWidth() {
  if (!elements.root) return;
  const utility = elements.regions?.utility || elements.root.querySelector(".hud-region-utility");
  if (!utility) {
    if (elements.root.style.getPropertyValue("--hud-utility-width") !== "0px") {
      elements.root.style.setProperty("--hud-utility-width", "0px");
    }
    return;
  }
  const rect = utility.getBoundingClientRect();
  // * Include right-edge padding already in the region's position so standings
  // * clear the whole chrome cluster, not just its content box.
  const width = Math.max(0, Math.ceil(rect.width));
  const next = `${width}px`;
  // * Skip no-op writes — setProperty can re-enter ResizeObserver on some engines.
  if (elements.root.style.getPropertyValue("--hud-utility-width") !== next) {
    elements.root.style.setProperty("--hud-utility-width", next);
  }
}

/**
 * Syncs root-level layout classes and measured CSS vars.
 * Re-evaluates .hud-touch on every sync so rotate / pointer changes don't
 * leave the HUD on the wrong layout branch for the rest of the match.
 */
export function syncHudLayout() {
  if (!elements.root) return;

  const menuVisible = _options.getMenuVisible ? _options.getMenuVisible() : false;
  const touch = _options.getIsTouchDevice ? _options.getIsTouchDevice() : false;
  const escOpen = isEscOverlayVisible();

  elements.root.classList.toggle("hud-touch", touch);
  elements.root.classList.toggle("hud-has-menu-btn", touch && !menuVisible && !escOpen);

  // * Keep the menu button display in lockstep with the class (covers resize
  // * paths that never call updateMenuButtonVisibility).
  if (elements.menuBtn) {
    const showMenu = touch && !menuVisible && !escOpen;
    const nextDisplay = showMenu ? "flex" : "none";
    if (elements.menuBtn.style.display !== nextDisplay) {
      elements.menuBtn.style.display = nextDisplay;
    }
  }

  measureUtilityWidth();
}

function scheduleHudLayoutSync() {
  if (hudLayoutRaf != null) return;
  hudLayoutRaf = requestAnimationFrame(() => {
    hudLayoutRaf = null;
    syncHudLayout();
  });
}

function bindHudLayoutSync() {
  if (!hudLayoutBound) {
    hudLayoutBound = true;
    window.addEventListener("resize", scheduleHudLayoutSync, { passive: true });
    window.addEventListener("orientationchange", scheduleHudLayoutSync, { passive: true });
    // * URL-bar show/hide: resize only — visualViewport.scroll fires continuously
    // * during rubber-band / chrome animation and does not change utility width.
    try {
      window.visualViewport?.addEventListener("resize", scheduleHudLayoutSync, { passive: true });
    } catch {
      /* older engines */
    }
  }

  // * Always re-bind: init() rebuilds the utility region; a one-shot observe would
  // * point at a detached node after the second match.
  if (typeof ResizeObserver !== "undefined" && elements.regions?.utility) {
    utilityResizeObserver?.disconnect();
    utilityResizeObserver = new ResizeObserver(scheduleHudLayoutSync);
    utilityResizeObserver.observe(elements.regions.utility);
  }
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
  // * Prefer style-guide self-fall term; keep a short pool for variety.
  const verbs = [
    "SELF CHECKOUT",
    "SELF CHECKOUT",
    "FELL OFF",
    "ATE PAVEMENT",
    "TAPPED OUT",
    "FORGOT THE BRAKES",
    "TOOK A SHORTCUT",
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
    ?? (_options.getDefaultRoundMs ? _options.getDefaultRoundMs() : ROUND_DURATION_MS);
  const remainingMs = getRoundRemainingMs(startedAtMs, totalRoundMs, adjustedNow());
  if (remainingMs == null || remainingMs > 15000 || remainingMs <= 0) return false;
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
 * Big-moment "axis punch" entrance for the status banner. Fakes a variable-font
 * weight / optical-size pop using only well-supported animatable props — scale
 * (opsz), letter-spacing (tracking), and extrude depth (weight) — so no variable
 * font is needed. Shared by the countdown digits and the GO! / SUDDEN DEATH /
 * MATCH POINT banners so every big moment stamps in with the same impact.
 * No-op under reduced motion.
 * @param {HTMLElement | null | undefined} el
 */
function stampInBanner(el) {
  if (!el) return;
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
  if (reduced) return;
  // * Rubber stamp: airborne + wide/heavy (shadow far below) → squash contact
  // * (tracking + shadow slam flat) → settle. The tracking easing in reads as an
  // * optical-size axis; the shadow catching up sells the weight.
  el.animate(
    [
      {
        transform: "rotate(-1.5deg) scale(1.9)",
        letterSpacing: "0.2em",
        opacity: 0,
        textShadow: "0.16em 0.16em 0 var(--color-ink-deep), 0.28em 0.28em 0 var(--color-ink-deep)",
      },
      {
        transform: "rotate(-1.5deg) scale(0.92)",
        letterSpacing: "0.02em",
        opacity: 1,
        offset: 0.45,
        textShadow: "0.02em 0.02em 0 var(--color-ink-deep), 0.05em 0.05em 0 var(--color-ink-deep)",
      },
      {
        transform: "rotate(-1.5deg) scale(1)",
        letterSpacing: "0.06em",
        textShadow: "0.05em 0.05em 0 var(--color-ink-deep), 0.1em 0.1em 0 var(--color-ink-deep)",
      },
    ],
    { duration: 220, easing: "cubic-bezier(0.1, 0.9, 0.2, 1)" },
  );
}

/**
 * Fires the axis punch once per distinct banner state. Keyed so each countdown
 * digit re-stamps but GO! / SUDDEN DEATH / MATCH POINT stamp only on entry.
 * @param {string} key
 */
function stampBannerOnce(key) {
  if (key === _lastBannerKey) return;
  _lastBannerKey = key;
  stampInBanner(elements.status);
}

/**
 * CAM-READY-1: stamp GET READY (kicker only) during the solo 2s flyover hold so
 * the pre-roll is not dead air. Hands off to countdown digits via a different
 * banner key (`count-n`) — no double-stamp mess.
 * @returns {void}
 */
export function showReadyHold() {
  if (!elements.status) return;
  setHudDisplay(elements.status, "block", "status");
  elements.status.style.color = "var(--color-magenta)";
  elements.status.textContent = "";
  const kicker = document.createElement("span");
  kicker.className = "hud-status-kicker hud-status-kicker--pulse";
  kicker.textContent = "GET READY";
  elements.status.append(kicker);
  stampBannerOnce("ready-hold");
}

/**
 * Clear the ready-hold banner if still showing (quit mid-hold / cancel / restart).
 * No-op when countdown digits or another banner already replaced it.
 * @returns {void}
 */
export function clearReadyHold() {
  if (_lastBannerKey !== "ready-hold") return;
  if (elements.status) {
    elements.status.textContent = "";
    setHudDisplay(elements.status, "none", "status");
  }
  _lastBannerKey = null;
}

/**
 * Fires the round-start GO! beat: 500ms banner flash + "go" VO + main's FOV
 * punch/whoosh. Normally driven by the countdown→running phase flip below, but a
 * non-host that applies game_start after the server start time has already passed
 * drops lobby→running directly — main calls this so that player still gets a start
 * cue instead of silently gaining control. The direct path passes resetGate — its
 * round skipped the countdown entry that normally re-arms the sound gate, and it
 * can't double-fire because the phase flip it bypassed never happens.
 * @param {{ resetGate?: boolean }} [opts]
 */
export function triggerGoBeat({ resetGate = false } = {}) {
  if (resetGate) _goSoundPlayed = false;
  _goUntilMs = Date.now() + 500;
  if (!_goSoundPlayed) {
    _goSoundPlayed = true;
    announce("go");
    // * Round-start kick — camera punch-in + whoosh live in main (they own the FOV rig).
    _options.onGoMoment?.();
  }
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
    if (_lastCountdownN !== 1) {
      // * A stall spanning the countdown's last digit-window can flip the round phase to
      // * "running" before the frame-polled digit branch below ever gets to observe
      // * n===1 — the countdown then feels like it jumps straight from "2" (or worse) to
      // * GO. Retroactively beat the missed "1", staggered just enough to read as a real
      // * beat, before firing GO. Purely presentational: the round already started on the
      // * host-synced clock (gameplay unlock is gated on phase === "running", not on this
      // * banner), so delaying only this cosmetic catch-up beat is safe.
      _lastCountdownN = 1;
      announce("countdown_1");
      const generation = _countdownGeneration;
      setTimeout(() => {
        // * A newer countdown (or an abort back to lobby) since this was scheduled owns
        // * its own GO beat now — this stale catch-up must not fire on top of it.
        if (_countdownGeneration !== generation) return;
        if (gameStore.getState().roundPhase !== "running") return;
        triggerGoBeat();
      }, MISSED_COUNTDOWN_CATCHUP_MS);
    } else {
      triggerGoBeat();
    }
  }
  _prevRoundPhase = roundPhase;

  // * GO! is the round's celebration beat — the only status that earns glow.
  elements.status?.classList.toggle("is-celebration", Date.now() < _goUntilMs);
  // * Clear any leftover inline animation up front so the Sudden Death / Match Point
  // * pulses (set in their branches below) can't bleed onto the next round's podium /
  // * countdown / GO! banner. Those branches re-stamp the same animation-name each
  // * frame, so this no-op-restarts (only the final value reaches style recalc).
  if (elements.status) {
    elements.status.style.animation = "";
    // * The MP size class follows the same rule — cleared here, re-added in-branch.
    elements.status.classList.remove("hud-status--mp");
  }
  if (Date.now() < _goUntilMs) {
    setHudDisplay(elements.status, "block", "status");
    elements.status.style.color = "var(--color-yellow)";
    elements.status.textContent = "GO!";
    stampBannerOnce("go");
  } else if (roundPhase === "countdown") {
    // * Reset GO sound gate + digit latch when entering countdown from a non-countdown
    // * phase. Cap-56: abort (countdown→lobby) then re-arm left `_lastCountdownN === 3`,
    // * so the second countdown skipped announce(`countdown_3`) and only fired 2→1→GO.
    if (prevPhase !== "countdown") {
      _goSoundPlayed = false;
      _lastCountdownN = null;
      _countdownGeneration += 1;
      // * Allow "count-3" banner stamp to fire again on a re-armed countdown.
      if (typeof _lastBannerKey === "string" && _lastBannerKey.startsWith("count-")) {
        _lastBannerKey = null;
      }
    }
    const countdownMs = roundState?.countdownMs
      ?? (_options.getCountdownMs ? _options.getCountdownMs() : 3000);
    const elapsedMs = adjustedNow() - (roundCountdownStartedAtMs || 0);
    const remainingMs = countdownMs - elapsedMs;
    // * Three digits share the whole window (countdownMs/3 each), so stretching the
    // * window slows the cadence instead of adding a fourth digit.
    const digitMs = countdownMs / 3;
    const n = clampInt(Math.ceil(remainingMs / digitMs), 1, 3);
    setHudDisplay(elements.status, "block", "status");
    // * Digits alternate the brand magenta/cyan accents as they stamp in.
    elements.status.style.color = n % 2 === 0 ? "var(--color-cyan)" : "var(--color-magenta)";
    // * The digit is the hero: a small GET READY kicker rides above a big number
    // * (both stamp in together — the animation below targets the whole banner).
    // * Rebuilt only when the digit changes; other phases wipe this via textContent.
    const numEl = elements.status.querySelector(".hud-status-num");
    if (!numEl || numEl.textContent !== String(n)) {
      elements.status.textContent = "";
      const kicker = document.createElement("span");
      kicker.className = "hud-status-kicker";
      kicker.textContent = "GET READY";
      const num = document.createElement("span");
      num.className = "hud-status-num";
      num.textContent = String(n);
      elements.status.append(kicker, num);
    }
    setArenaSplashVisible(true);
    if (_lastCountdownN !== n) {
      _lastCountdownN = n;
      if (n >= 1 && n <= 3) announce(`countdown_${n}`);
    }
    // * Each digit stamps in with the shared axis punch (keyed per digit).
    stampBannerOnce(`count-${n}`);
  } else if (roundPhase === "podium") {
    setHudDisplay(elements.status, "none", "status");
    elements.status.textContent = "";
    _lastBannerKey = null;
  } else if (roundPhase === "running" && roundState?.isSuddenDeath) {
    setHudDisplay(elements.status, "block", "status");
    elements.status.style.color = "var(--color-alert)";
    elements.status.textContent = "SUDDEN DEATH";
    stampBannerOnce("sd");
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
    if (!reduced) {
      // * Entrance punch first, then the pulse — the 0.22s delay lets the 220ms
      // * stamp finish so the two don't fight over transform. Re-set every frame
      // * with the same value, so it never restarts (see the clear at the top).
      elements.status.style.animation = "suddenDeathPulse 0.8s ease-in-out 0.22s infinite";
    }
  } else if (roundPhase === "running" && isMatchPointState(roundState)) {
    // * Final seconds + top two within one KO: the next fall can decide the round.
    // * Run-5: "'match point' is too big and needs some life" — an 11-char word at
    // * the GO!-sized clamp swallowed the screen and then sat static. The --mp class
    // * drops it ~40% (hud.css) and it gets the SD-style sustained pulse.
    setHudDisplay(elements.status, "block", "status");
    elements.status.classList.add("hud-status--mp");
    elements.status.style.color = "var(--color-yellow)";
    elements.status.textContent = "MATCH POINT";
    stampBannerOnce("mp");
    const mpReduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
    if (!mpReduced) {
      // * Same pattern as SD: entrance stamp first, pulse joins after 0.22s; re-set
      // * with an identical value each frame so it never restarts (clear at top).
      elements.status.style.animation = "matchPointPulse 0.9s ease-in-out 0.22s infinite";
    }
  } else {
    setHudDisplay(elements.status, "none", "status");
    elements.status.textContent = "";
    elements.status.style.animation = "";
    _lastBannerKey = null;
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
    _hudTimerFillHalfPct = -1;
    return;
  }

  const roundPhase = roundState?.phase;
  const roundStartedAtMs = roundState?.startedAtMs;

  if (roundPhase === "running") {
    const isSuddenDeath = roundState?.isSuddenDeath === true;
    const totalRoundMs = roundState?.totalRoundMs
      ?? (_options.getDefaultRoundMs ? _options.getDefaultRoundMs() : ROUND_DURATION_MS);
    // * Run-6: while the host is silent (minimized tab), the world is frozen but this
    // * wall-clock countdown kept running — hold it by backing the clock up by the
    // * stall. The host shifts its round anchor by the hidden gap on return, so the
    // * held value and the resynced anchor agree.
    const hostStallMs = _options.getHostStallMs?.() ?? 0;
    if (hostStallMs > 0 && _hudHostStallToastAtMs === 0) {
      _hudHostStallToastAtMs = performance.now();
      window.CartRave?.showToast?.("Host connection stalled — hang tight…", 4000);
    } else if (hostStallMs === 0 && _hudHostStallToastAtMs !== 0) {
      _hudHostStallToastAtMs = 0;
    }
    const remainingMs = isSuddenDeath
      ? 0
      : (getRoundRemainingMs(roundStartedAtMs || 0, totalRoundMs, adjustedNow() - hostStallMs) ?? totalRoundMs);
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
      // * Quantize to 0.5% — skip the write when it wouldn't visibly change the bar.
      const fillHalfPct = Math.round(pct * 2);
      if (fillHalfPct !== _hudTimerFillHalfPct) {
        _hudTimerFillHalfPct = fillHalfPct;
        elements.timerFill.style.width = `${fillHalfPct / 2}%`;
      }
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
    _hudTimerFillHalfPct = -1;
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

/** Change-detection caches for the per-frame directive chip writes. */
let _hudDirectiveId = null;
let _hudDirectiveFillTenths = -1;

/**
 * Living Store directive tag under the round timer. Called every frame from
 * frameVisuals with the engine's active directive (or null). The tag is a price
 * slab in the directive's own accent: title, whole seconds remaining, the
 * store-voice rule line, and a drain bar.
 *
 * @param {{ id: string, title: string, blurb?: string, startedAtMs: number, untilMs: number, accent: string } | null} directive
 * @param {number} nowMs performance.now() for this frame.
 * @returns {void}
 */
export function setHudDirective(directive, nowMs) {
  const el = elements.directive;
  if (!el) return;

  if (!directive) {
    el.classList.remove("hud-directive--active");
    _hudDirectiveId = null;
    _hudDirectiveFillTenths = -1;
    return;
  }

  const totalMs = Math.max(1, directive.untilMs - directive.startedAtMs);
  const remainingMs = Math.max(0, directive.untilMs - nowMs);

  el.classList.add("hud-directive--active");
  // * Accent + name are fixed for the window's life — write them only when the
  // * directive changes (60fps caller; redundant style writes invalidate style).
  if (_hudDirectiveId !== directive.id) {
    _hudDirectiveId = directive.id;
    el.style.setProperty("--directive-accent", directive.accent);
    elements.directiveName.textContent = directive.title;
    // * Store-voice rule line (mock 6a) — fixed for the window, written with the name.
    if (elements.directiveBlurb) {
      const blurb = directive.blurb || "";
      elements.directiveBlurb.textContent = blurb;
      elements.directiveBlurb.style.display = blurb ? "" : "none";
    }
  }
  const secsText = `${Math.ceil(remainingMs / 1000)}s`;
  if (elements.directiveSecs.textContent !== secsText) {
    elements.directiveSecs.textContent = secsText;
  }
  // * Quantize to 0.1% — a 3px bar can't show finer, and equal values skip the write.
  const fillTenths = Math.round((remainingMs / totalMs) * 1000);
  if (fillTenths !== _hudDirectiveFillTenths) {
    _hudDirectiveFillTenths = fillTenths;
    elements.directiveFill.style.width = `${fillTenths / 10}%`;
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
/**
 * One slot→row model for every roster surface. The compact in-corner scoreboard
 * and the full-screen Friends CHECKOUT LINE both read this, so ready/kind/color
 * state is derived in exactly one place (null-safe on every slot field).
 * @param {Array<object>|null} netSlots
 * @param {Record<number, number>|null|undefined} roundScores
 * @param {boolean} isLobbyRoster When true, `score` carries ready state (1/0/-1) instead of points.
 * @returns {Array<{ slotIndex: number, score: number, slotName: string, slotColor: string|null, kind: string, connId: string|null, isReady: boolean }>}
 */
function buildRosterRows(netSlots, roundScores, isLobbyRoster) {
  const rows = [];
  for (let i = 0; i < 4; i += 1) {
    const slot = netSlots?.[i];
    rows.push({
      slotIndex: i,
      score: isLobbyRoster
        ? (slot?.kind === "human" ? (slot.isReady ? 1 : 0) : -1)
        : Number(roundScores?.[i] ?? 0),
      slotName: slot?.name || `P${i + 1}`,
      slotColor: slot?.color || null,
      kind: slot?.kind ?? "",
      connId: slot?.connId || null,
      isReady: Boolean(slot?.isReady),
    });
  }
  return rows;
}

function updateScores(roundState, netSlots, youConnId) {
  const roundPhase = roundState?.phase;
  const roundScores = roundState?.scores;
  const isSolo = _options.detectGameMode?.() === "solo";
  // * Lobby/countdown roster: show names + ready state so Friends/Quickplay aren't dark.
  const isLobbyRoster = (roundPhase === "lobby" || roundPhase === "countdown") && !isSolo;

  if (roundPhase === "running" || isLobbyRoster) {
    setHudDisplay(elements.scores, "flex", "scores");
    const localIdx = netSlots ? netSlots.findIndex((s) => s && s.kind === "human" && s.connId === youConnId) : -1;

    let dataChanged = false;
    for (let i = 0; i < 4; i += 1) {
      const score = isLobbyRoster
        ? (netSlots?.[i]?.kind === "human" ? (netSlots[i].isReady ? 1 : 0) : -1)
        : Number(roundScores?.[i] ?? 0);
      const slot = netSlots?.[i];
      const meta = `${slot?.name || `P${i + 1}`}:${slot?.color || ""}:${slot?.kind ?? ""}:${slot?.connId || ""}:${slot?.isReady ? 1 : 0}`;
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
        _lastScores[i] = isLobbyRoster
          ? (slot?.kind === "human" ? (slot.isReady ? 1 : 0) : -1)
          : Number(roundScores?.[i] ?? 0);
        _lastSlotMeta[i] = `${slot?.name || `P${i + 1}`}:${slot?.color || ""}:${slot?.kind ?? ""}:${slot?.connId || ""}:${slot?.isReady ? 1 : 0}`;
      }
    }

    if (dataChanged || localChanged) {
      const nextRows = buildRosterRows(netSlots, roundScores, isLobbyRoster);
      // * Lobby: seat order (stable roster). Running: score rank order.
      if (isLobbyRoster) {
        nextRows.sort((a, b) => a.slotIndex - b.slotIndex);
      } else {
        nextRows.sort((a, b) => compareScoreboardDisplayOrder(a, b, youConnId));
      }
      _sortedScoreRows = nextRows;
    }
    _lastLocalIdx = localIdx;

    if (dataChanged || localChanged) {
      const rows = _sortedScoreRows || [];
      for (let pos = 0; pos < 4; pos += 1) {
        const entry = elements.scoreBoxes[pos];
        const row = rows[pos];
        if (!entry || !row) continue;

        entry.label.textContent = row.slotName;

        const slot = netSlots?.[row.slotIndex];
        // * One resolver for everyone: NPCs get their personality emblem, humans
        // * get the cart-color shopper glyph, empty slots get nothing.
        const info = emblemForSlot(slot);
        if (info) {
          if (entry.badge.dataset.icon !== info.icon) {
            entry.badge.dataset.icon = info.icon;
            entry.badge.innerHTML = svgIcon(info.icon, { label: info.label });
            // * Native tooltip is sentence case (style guide §4); the on-chip
            // * label keeps its all-caps HUD styling.
            entry.badge.title = info.label.charAt(0) + info.label.slice(1).toLowerCase();
          }
          entry.badge.style.color = info.color;
          entry.badge.style.display = "inline-flex";
        } else {
          entry.badge.style.display = "none";
        }

        const isLocal = row.slotIndex === localIdx;
        if (dataChanged && prevScoresBySlot && !isLobbyRoster) {
          const oldScore = Number(prevScoresBySlot[row.slotIndex] ?? 0);
          if (row.score > oldScore) {
            animateScorePop(entry.value, { isLocal });
            if (isLocal) {
              animateScorePop(entry.box, { isLocal: true, scalePeak: 1.04, duration: 180 });
            }
          }
        }
        if (isLobbyRoster) {
          if (row.kind === "human") {
            entry.value.textContent = row.isReady ? "RDY" : "…";
          } else if (row.kind === "npc") {
            entry.value.textContent = "BOT";
          } else {
            entry.value.textContent = "—";
          }
        } else {
          entry.value.textContent = String(row.score);
        }

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
    _leaderSlotIndex = -1;
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
      if (isLeader && row) _leaderSlotIndex = row.slotIndex;
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
    // * Roster ready count so multiplayer lobby isn't a dark button with no context.
    let humanTotal = 0;
    let humanReady = 0;
    if (Array.isArray(netSlots)) {
      for (const s of netSlots) {
        if (!s || s.kind !== "human") continue;
        humanTotal += 1;
        if (s.isReady) humanReady += 1;
      }
    }
    const countSuffix = humanTotal > 1 ? ` (${humanReady}/${humanTotal})` : "";
    const nextText = (isLocalReady ? "READY!" : "READY UP!") + countSuffix;
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
 * Press feedback animates the INNER node of a lobby slab, never the button:
 * anime.js writes `transform` inline, which would wipe the outer skewX() and
 * snap the parallelogram flat for the duration of the press (the 7a bug).
 * @param {HTMLElement} btn
 * @returns {HTMLElement}
 */
function lobbyPressTarget(btn) {
  return /** @type {HTMLElement} */ (btn.querySelector(".hud-lobby-btn-inner") || btn);
}

/**
 * Friends-only full-screen CHECKOUT LINE lobby (7e, model B).
 *
 * Gate is `phase === "lobby"` — deliberately NOT the compact roster's
 * `lobby || countdown`, so the screen clears before the 3-2-1 owns the frame.
 * Quickplay/continuous keep the in-corner roster (auto-ready would make a full
 * lobby screen feel wrong). Slots and ready state come from the same
 * buildRosterRows model the compact scoreboard uses, and READY proxies the
 * existing hud-ready-btn so the socket send lives in one place.
 *
 * Start rule B1: no host START button — the server auto-arms once every live
 * human is ready, so both host and guests only ever press READY.
 *
 * @param {string|null|undefined} roundPhase
 * @param {Array<object>|null} netSlots
 * @param {string|null} youConnId
 * @param {boolean} menuVisible
 */
function updateLobbyScreen(roundPhase, netSlots, youConnId, menuVisible) {
  const screen = elements.lobbyScreen;
  if (!screen) return;

  const isFriends = _options.detectGameMode?.() === "friends";
  const active = roundPhase === "lobby" && !menuVisible && isFriends;
  if (!active) {
    if (!screen.hidden) screen.hidden = true;
    return;
  }
  screen.hidden = false;

  // * One lobby surface: the compact roster and corner ready button stand down
  // * while the full screen is up (both are restored by their own updaters).
  setHudDisplay(elements.scores, "none", "scores");
  if (elements.readyBtn) elements.readyBtn.style.display = "none";

  const rows = buildRosterRows(netSlots, null, true);
  const hostId = getHostId();
  let humans = 0;
  let readyHumans = 0;

  for (let i = 0; i < 4; i += 1) {
    const cell = elements.lobbySlots[i];
    const row = rows[i];
    if (!cell || !row) continue;
    const slot = netSlots?.[i] ?? null;
    const isEmpty = row.kind !== "human" && row.kind !== "npc";
    const isLocal = Boolean(row.connId && youConnId && row.connId === youConnId);
    if (row.kind === "human") {
      humans += 1;
      if (row.isReady) readyHumans += 1;
    }

    cell.root.classList.toggle("is-empty", isEmpty);
    cell.root.classList.toggle("is-you", isLocal);
    cell.root.classList.toggle("is-ready", row.kind === "human" && row.isReady);
    // * An empty lane is a dashed outline with one centred line (mock 7e) — no
    // * name, no emblem, nothing that reads as a player who is already here.
    cell.name.textContent = isEmpty ? "" : row.slotName;

    const info = isEmpty ? null : emblemForSlot(slot);
    if (info) {
      if (cell.emblem.dataset.icon !== info.icon) {
        cell.emblem.dataset.icon = info.icon;
        cell.emblem.innerHTML = svgIcon(info.icon, { label: info.label });
      }
      cell.emblem.style.color = info.color;
      cell.emblem.style.display = "inline-flex";
    } else {
      cell.emblem.style.display = "none";
    }

    const isHostSlot = Boolean(hostId && row.connId && row.connId === hostId);
    cell.host.style.display = isHostSlot ? "inline-flex" : "none";
    cell.you.style.display = isLocal ? "inline-flex" : "none";
    cell.status.textContent = isEmpty
      ? "WAITING FOR SHOPPER…"
      : row.kind === "npc"
        ? "BOT"
        : row.isReady
          ? "READY"
          : "IN LINE";
  }

  if (elements.lobbyCount) elements.lobbyCount.textContent = `${humans}/4`;
  if (elements.lobbyCode) {
    const code = String(resolvedPartyRoomFromUrl() || "").toUpperCase();
    if (elements.lobbyCode.textContent !== code) elements.lobbyCode.textContent = code;
  }
  if (elements.lobbyCopy) {
    // * Nothing to share without a room id (shouldn't happen in a private room).
    const canCopy = Boolean(resolvedPartyRoomFromUrl());
    elements.lobbyCopy.style.display = canCopy ? "" : "none";
  }
  if (elements.lobbyLink) {
    // * Region · ping (the mock's meta) is not instrumented; this is the link
    // * state the netcode actually tracks.
    const reconnecting = getConnectionState() === "reconnecting";
    const next = reconnecting ? "RECONNECTING…" : "LINK OK";
    if (elements.lobbyLink.textContent !== next) elements.lobbyLink.textContent = next;
    elements.lobbyLink.classList.toggle("is-warn", reconnecting);
  }
  // * FRIENDS-JOIN-1: no room registry exists, so a mistyped code is indistinguishable
  // * from being first to arrive — the only honest signal is "you typed a code AND
  // * nobody ever turned up". Timed from SEATED rather than from the submit press: a
  // * wall-clock timer started at submit races connect + hello and fires during load.
  const localSeated = Boolean(youConnId) && rows.some((r) => r && r.connId === youConnId);
  if (humans > 1 || !localSeated) {
    _lobbyAloneSinceMs = null;
  } else if (_lobbyAloneSinceMs === null) {
    _lobbyAloneSinceMs = performance.now();
  }
  const stranded =
    _lobbyAloneSinceMs !== null
    && Boolean(_options.joinedViaTypedCode?.())
    && performance.now() - _lobbyAloneSinceMs >= LOBBY_STRANDED_MS;

  if (elements.lobbyStatus) {
    const allReady = humans > 0 && readyHumans === humans;
    // * Written here, inside the branch that reassigns textContent every update — a
    // * one-shot set anywhere else would show for one frame and be clobbered.
    elements.lobbyStatus.textContent = stranded
      ? "NOBODY HERE — CHECK THE CODE"
      : allReady
        ? "ALL CHECKED OUT — STARTING…"
        : "WAITING FOR CHECKOUT…";
    elements.lobbyStatus.classList.toggle("is-go", allReady && !stranded);
    elements.lobbyStatus.classList.toggle("is-warn", stranded);
  }
  // * Mirror the corner button's already-computed label/state — no second
  // * derivation of who is ready.
  if (elements.lobbyReadyBtn && elements.readyBtn) {
    const label = elements.readyBtn.textContent || "READY UP!";
    if (elements.lobbyReadyLabel && elements.lobbyReadyLabel.textContent !== label) {
      elements.lobbyReadyLabel.textContent = label;
    }
    elements.lobbyReadyBtn.classList.toggle("is-ready", elements.readyBtn.classList.contains("is-ready"));
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
  _lastBannerKey = null;
  _prevRoundPhase = null;
  _goUntilMs = 0;
  _goSoundPlayed = false;
  _lastReadyState = null;
  _leaderSlotIndex = -1;
  _lastUrgentTickSecond = null;
  _lastTimeBeatSecond = null;
  _wasSuddenDeath = false;
  _boostDisplay = null;
  if (_toastTimeoutId) {
    clearTimeout(_toastTimeoutId);
    _toastTimeoutId = null;
  }
  if (_lobbyCopyTimeoutId) {
    clearTimeout(_lobbyCopyTimeoutId);
    _lobbyCopyTimeoutId = null;
  }
  _lobbyAloneSinceMs = null;
  resetStage();

  const existing = document.getElementById("hud");
  if (existing) existing.remove();
  // * The lobby surface mounts on document.body, not inside #hud (see the append
  // * below), so removing the root never takes it down. Without this sweep every
  // * re-init leaks a copy, and one that was visible at re-init time stays painted
  // * with no updater left owning it.
  for (const stray of document.querySelectorAll(".hud-lobby")) stray.remove();

  elements.root = document.createElement("div");
  elements.root.id = "hud";
  // * .hud-touch is applied in syncHudLayout() (re-evaluated on resize/orientation).

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

  // * Mock 6a reads left-to-right on ONE line: the clock, then the round meta
  // * hard right of it. Stacked, the meta was reading as a title above the time.
  const timerHead = document.createElement("div");
  timerHead.className = "hud-timer-head";
  timerHead.appendChild(elements.timerNum);
  timerHead.appendChild(timerMeta);
  timerBody.appendChild(timerHead);
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
  elements.directiveBlurb = document.createElement("span");
  elements.directiveBlurb.className = "hud-directive-blurb";
  const directiveBar = document.createElement("div");
  directiveBar.className = "hud-directive-bar";
  elements.directiveFill = document.createElement("i");
  directiveBar.appendChild(elements.directiveFill);
  elements.directive.appendChild(directiveRow);
  elements.directive.appendChild(elements.directiveBlurb);
  elements.directive.appendChild(directiveBar);

  elements.scores = document.createElement("div");
  elements.scores.className = "hud-scores";

  // ── Kill feed = the store's TRANSACTION LOG receipt (mock 6a) ──────────────
  // * The panel is the skewed slab; the counter-skew lives on an inner wrapper
  // * that NOTHING animates. Rows are transform-animated on entry/exit, so a
  // * counter-skew on the row itself would be overwritten inline (the 7a/7f bug).
  elements.feed = document.createElement("div");
  elements.feed.className = "hud-feed is-empty";
  const feedInner = document.createElement("div");
  feedInner.className = "hud-feed-inner";
  const feedHd = document.createElement("div");
  feedHd.className = "hud-feed-hd";
  feedHd.textContent = "— TRANSACTION LOG —";
  elements.feedRows = document.createElement("div");
  elements.feedRows.className = "hud-feed-rows";
  feedInner.appendChild(feedHd);
  feedInner.appendChild(elements.feedRows);
  elements.feed.appendChild(feedInner);
  // * Rows are also removed by animations.js's own exit timer, which hud.js has
  // * no completion hook into — so emptiness is observed rather than tracked at
  // * each call site. (CSS :has() would do it, but Vite's default target still
  // * includes browsers without it, and the failure mode is a bare header.)
  _feedRowObserver?.disconnect();
  _feedRowObserver = new MutationObserver(() => {
    elements.feed?.classList.toggle("is-empty", !elements.feedRows?.firstElementChild);
  });
  _feedRowObserver.observe(elements.feedRows, { childList: true });

  elements.scoreBoxes = [];
  for (let i = 0; i < 4; i += 1) {
    const box = document.createElement("div");
    box.className = "hud-scoreBox";

    const badge = document.createElement("span");
    badge.className = "hud-scoreBadge";
    badge.style.display = "none";

    const label = document.createElement("div");
    label.className = "hud-scoreLabel";
    label.textContent = `P${i + 1}`;

    // * Host antenna — quiet neutral mark, "this player's device runs the game".
    const host = document.createElement("span");
    host.className = "hud-scoreHost";
    host.innerHTML = svgIcon("host", { label: "Host" });
    host.title = "HOST — this player's device runs the game";
    host.style.display = "none";

    const you = document.createElement("span");
    you.className = "hud-scoreYou";
    you.textContent = "YOU";

    // * Score prints like a till total: the number over a barcode strip (mock 6a).
    // * No rank digit — the tags are already in score order, and the mock reads
    // * position from the row, not from a number nobody looks at.
    const valueWrap = document.createElement("div");
    valueWrap.className = "hud-scoreValueWrap";
    const value = document.createElement("div");
    value.className = "hud-scoreValue";
    value.textContent = "0";
    const barcode = document.createElement("i");
    barcode.className = "hud-scoreBarcode";
    barcode.setAttribute("aria-hidden", "true");
    valueWrap.appendChild(value);
    valueWrap.appendChild(barcode);

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

    box.appendChild(crown);
    box.appendChild(badge);
    box.appendChild(label);
    box.appendChild(host);
    box.appendChild(you);
    box.appendChild(pip);
    box.appendChild(valueWrap);
    elements.scores.appendChild(box);
    elements.scoreBoxes.push({ root: elements.root, box, badge, label, host, you, value, barcode, crown, pip, dizzy, dizzyTimeoutId: null, slotIndex: -1 });
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

  // ── Friends CHECKOUT LINE lobby (7e) — full-screen, gated in updateLobbyScreen ──
  elements.lobbyScreen = document.createElement("div");
  elements.lobbyScreen.className = "hud-lobby";
  elements.lobbyScreen.hidden = true;
  elements.lobbyScreen.setAttribute("role", "dialog");
  elements.lobbyScreen.setAttribute("aria-label", "Checkout line lobby");

  // Screen title top-left over a store-voice kicker — the same composition the
  // menu sub-screens (.cr-screen) use, re-expressed locally: adopting that class
  // would put a hud.css override of a cart-rave-menu.css class at the mercy of
  // bundle order, which is exactly how 7a/7c lost to retired rules.
  const lobbyHd = document.createElement("header");
  lobbyHd.className = "hud-lobby-hd";

  const lobbyKicker = document.createElement("span");
  lobbyKicker.className = "hud-lobby-kicker";
  lobbyKicker.textContent = "PRIVATE ROOM · EVERYONE READIES UP TO START";

  const lobbyTitle = document.createElement("h2");
  lobbyTitle.className = "hud-lobby-title";
  lobbyTitle.textContent = "CHECKOUT LINE";

  lobbyHd.appendChild(lobbyKicker);
  lobbyHd.appendChild(lobbyTitle);

  // Left column: the invite slab, then the actions (mock 7e).
  const lobbyLeft = document.createElement("div");
  lobbyLeft.className = "hud-lobby-left";

  const lobbyCodeCard = document.createElement("div");
  lobbyCodeCard.className = "hud-lobby-code-card";

  const lobbyCodeLbl = document.createElement("span");
  lobbyCodeLbl.className = "hud-lobby-code-lbl";
  lobbyCodeLbl.textContent = "ROOM CODE";

  const lobbyCodeRow = document.createElement("div");
  lobbyCodeRow.className = "hud-lobby-code-row";
  elements.lobbyCode = document.createElement("span");
  elements.lobbyCode.className = "hud-lobby-code";

  elements.lobbyCopy = document.createElement("button");
  elements.lobbyCopy.type = "button";
  elements.lobbyCopy.className = "hud-lobby-copy";
  elements.lobbyCopy.textContent = "COPY";
  // * Revealed only when a copy actually fails, so the player still has a link they
  // * can select by hand. The old handler swallowed the rejection and reported
  // * "COPIED!" regardless — on a denied permission or a non-secure context that is a
  // * lie, and the player pastes nothing into Discord wondering why (FRIENDS-JOIN-1).
  elements.lobbyLinkField = document.createElement("input");
  elements.lobbyLinkField.className = "hud-lobby-linkfield";
  elements.lobbyLinkField.readOnly = true;
  elements.lobbyLinkField.hidden = true;
  elements.lobbyLinkField.setAttribute("aria-label", "Invite link");

  elements.lobbyCopy.addEventListener("click", () => {
    // * Same invite link the menu screen hands out: clean origin + ?room=.
    const code = String(resolvedPartyRoomFromUrl() || "");
    if (!code) return;
    const link = new URL(window.location.origin + window.location.pathname);
    link.searchParams.set("room", code);
    const href = link.toString();

    const settle = (label, failed) => {
      if (elements.lobbyCopy) {
        elements.lobbyCopy.textContent = label;
        elements.lobbyCopy.classList.toggle("is-failed", failed);
      }
      if (elements.lobbyLinkField) {
        elements.lobbyLinkField.value = href;
        elements.lobbyLinkField.hidden = !failed;
        // * Pre-selected so the fallback is one Ctrl+C, not a drag.
        if (failed) elements.lobbyLinkField.select();
      }
      if (_lobbyCopyTimeoutId) clearTimeout(_lobbyCopyTimeoutId);
      _lobbyCopyTimeoutId = setTimeout(() => {
        _lobbyCopyTimeoutId = null;
        if (elements.lobbyCopy) {
          elements.lobbyCopy.textContent = "COPY";
          elements.lobbyCopy.classList.remove("is-failed");
        }
      }, failed ? 4000 : 1500);
    };

    // * No clipboard API at all is a failure too, not a silent success.
    const write = navigator.clipboard?.writeText(href);
    if (!write) {
      settle("COPY FAILED", true);
      return;
    }
    write.then(() => settle("COPIED!", false)).catch(() => settle("COPY FAILED", true));
  });

  lobbyCodeRow.appendChild(elements.lobbyCode);
  lobbyCodeRow.appendChild(elements.lobbyCopy);

  const lobbyShare = document.createElement("p");
  lobbyShare.className = "hud-lobby-share";
  lobbyShare.textContent = "SHARE THE CODE OR SEND THE LINK — EMPTY LANES FILL WITH BOTS";

  lobbyCodeCard.appendChild(lobbyCodeLbl);
  lobbyCodeCard.appendChild(lobbyCodeRow);
  lobbyCodeCard.appendChild(elements.lobbyLinkField);
  lobbyCodeCard.appendChild(lobbyShare);

  // Right column: the roster itself.
  const lobbyRoster = document.createElement("div");
  lobbyRoster.className = "hud-lobby-roster";

  const lobbyMeta = document.createElement("div");
  lobbyMeta.className = "hud-lobby-meta";
  const lobbyMetaLbl = document.createElement("span");
  lobbyMetaLbl.textContent = "IN LINE ·";
  elements.lobbyCount = document.createElement("span");
  elements.lobbyCount.className = "hud-lobby-count";
  elements.lobbyCount.textContent = "1/4";
  lobbyMeta.appendChild(lobbyMetaLbl);
  lobbyMeta.appendChild(elements.lobbyCount);

  const lobbySlotWrap = document.createElement("div");
  lobbySlotWrap.className = "hud-lobby-slots";
  elements.lobbySlots = [];
  for (let i = 0; i < 4; i += 1) {
    const root = document.createElement("div");
    root.className = "hud-lobby-slot";
    const emblem = document.createElement("span");
    emblem.className = "hud-lobby-emblem";
    const name = document.createElement("span");
    name.className = "hud-lobby-name";
    const pips = document.createElement("span");
    pips.className = "hud-lobby-pips";
    const host = document.createElement("span");
    host.className = "hud-lobby-pip hud-lobby-pip--host";
    host.textContent = "HOST";
    host.style.display = "none";
    const you = document.createElement("span");
    you.className = "hud-lobby-pip hud-lobby-pip--you";
    you.textContent = "YOU";
    you.style.display = "none";
    pips.appendChild(host);
    pips.appendChild(you);
    const status = document.createElement("span");
    status.className = "hud-lobby-status-cell";
    root.appendChild(emblem);
    root.appendChild(name);
    root.appendChild(pips);
    root.appendChild(status);
    lobbySlotWrap.appendChild(root);
    elements.lobbySlots.push({ root, emblem, name, host, you, status });
  }

  elements.lobbyStatus = document.createElement("p");
  elements.lobbyStatus.className = "hud-lobby-status";
  elements.lobbyStatus.textContent = "WAITING FOR CHECKOUT…";

  lobbyRoster.appendChild(lobbyMeta);
  lobbyRoster.appendChild(lobbySlotWrap);
  lobbyRoster.appendChild(elements.lobbyStatus);

  const lobbyActions = document.createElement("div");
  lobbyActions.className = "hud-lobby-actions";

  // * Proxy, not a second implementation: the real ready send lives on
  // * elements.readyBtn (start rule B1 — there is deliberately no START button).
  // * The label rides a child span so the skewed slab can counter-skew its text
  // * (same three-layer split the menu action slabs use).
  elements.lobbyReadyBtn = document.createElement("button");
  elements.lobbyReadyBtn.type = "button";
  elements.lobbyReadyBtn.className = "hud-lobby-btn hud-lobby-btn--ready cc-btn cc-btn--primary";
  const lobbyReadyInner = document.createElement("span");
  lobbyReadyInner.className = "hud-lobby-btn-inner";
  elements.lobbyReadyLabel = document.createElement("span");
  elements.lobbyReadyLabel.className = "hud-lobby-btn-label";
  elements.lobbyReadyLabel.textContent = "READY UP!";
  lobbyReadyInner.appendChild(elements.lobbyReadyLabel);
  elements.lobbyReadyBtn.appendChild(lobbyReadyInner);
  elements.lobbyReadyBtn.addEventListener("click", () => {
    elements.readyBtn?.click();
  });
  wireButtonPressFeedback(elements.lobbyReadyBtn, { scale: 0.96, getTarget: lobbyPressTarget });

  const lobbyLeaveBtn = document.createElement("button");
  lobbyLeaveBtn.type = "button";
  lobbyLeaveBtn.className = "hud-lobby-btn cc-btn cc-btn--ghost";
  const lobbyLeaveInner = document.createElement("span");
  lobbyLeaveInner.className = "hud-lobby-btn-inner";
  const lobbyLeaveLabel = document.createElement("span");
  lobbyLeaveLabel.className = "hud-lobby-btn-label";
  lobbyLeaveLabel.textContent = "LEAVE ROOM";
  lobbyLeaveInner.appendChild(lobbyLeaveLabel);
  lobbyLeaveBtn.appendChild(lobbyLeaveInner);
  lobbyLeaveBtn.addEventListener("click", () => {
    // * Rides the EXISTING leave/teardown path — no second teardown story.
    _options.onLeaveRoom?.();
  });
  wireButtonPressFeedback(lobbyLeaveBtn, { scale: 0.96, getTarget: lobbyPressTarget });

  lobbyActions.appendChild(elements.lobbyReadyBtn);
  lobbyActions.appendChild(lobbyLeaveBtn);

  lobbyLeft.appendChild(lobbyCodeCard);
  lobbyLeft.appendChild(lobbyActions);

  // Hint bar along the bottom. The mock's right-hand meta is "US-EAST · 24 MS";
  // neither region nor RTT is instrumented (region/ping meta is parked with the
  // Part-1 polish), so the slot carries the link state we DO track.
  const lobbyHint = document.createElement("div");
  lobbyHint.className = "hud-lobby-hint";
  const lobbyHintEsc = document.createElement("span");
  lobbyHintEsc.className = "hud-lobby-hint-item";
  const lobbyHintKbd = document.createElement("kbd");
  lobbyHintKbd.textContent = "ESC";
  lobbyHintEsc.appendChild(lobbyHintKbd);
  lobbyHintEsc.appendChild(document.createTextNode(" PAUSE"));
  elements.lobbyLink = document.createElement("span");
  elements.lobbyLink.className = "hud-lobby-link";
  elements.lobbyLink.textContent = "LINK OK";
  lobbyHint.appendChild(lobbyHintEsc);
  lobbyHint.appendChild(elements.lobbyLink);

  elements.lobbyScreen.appendChild(lobbyHd);
  elements.lobbyScreen.appendChild(lobbyLeft);
  elements.lobbyScreen.appendChild(lobbyRoster);
  elements.lobbyScreen.appendChild(lobbyHint);

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
  // * Mock 6a's carnage coupon: the multiplier is the hero, and the tier name,
  // * countdown and drain bar sit beside it as the coupon's small print.
  elements.comboMultiplier = document.createElement("span");
  elements.comboMultiplier.className = "hud-combo-multiplier";
  const comboMeta = document.createElement("span");
  comboMeta.className = "hud-combo-meta";
  elements.comboTier = document.createElement("span");
  elements.comboTier.className = "hud-combo-tier";
  elements.comboSecs = document.createElement("span");
  elements.comboSecs.className = "hud-combo-secs";
  comboMeta.appendChild(elements.comboTier);
  comboMeta.appendChild(elements.comboSecs);
  comboContent.appendChild(elements.comboMultiplier);
  comboContent.appendChild(comboMeta);
  const comboTrack = document.createElement("div");
  comboTrack.className = "hud-combo-bar-track";
  elements.comboBarFill = document.createElement("div");
  elements.comboBarFill.className = "hud-combo-bar-fill";
  comboTrack.appendChild(elements.comboBarFill);
  comboMeta.appendChild(comboTrack);
  elements.comboBadge.appendChild(comboContent);
  regions.pod.insertBefore(elements.comboBadge, elements.readyBtn);

  // * Kill-confirm — the cartoon KO burst stamps at screen center on a local KO.
  elements.hitmarker = document.createElement("div");
  elements.hitmarker.className = "hud-hitmarker";
  elements.hitmarker.setAttribute("aria-hidden", "true");
  elements.hitmarker.innerHTML = svgIcon("burst", { size: "100%" });
  elements.root.appendChild(elements.hitmarker);

  // * Edge-danger telegraph — DOM vignette when skidding near a kill edge (no post-FX).
  elements.edgeDanger = document.createElement("div");
  elements.edgeDanger.className = "hud-edge-danger";
  elements.edgeDanger.setAttribute("aria-hidden", "true");
  elements.root.appendChild(elements.edgeDanger);
  elements.root.style.setProperty("--hud-edge-danger", "0");
  elements.root.style.setProperty("--hud-edge-t", "0");
  elements.root.style.setProperty("--hud-edge-r", "0");
  elements.root.style.setProperty("--hud-edge-b", "0");
  elements.root.style.setProperty("--hud-edge-l", "0");
  elements.root.style.setProperty("--hud-edge-danger-rgb", "255, 43, 214");

  // * Boost charge meter — keyboard/gamepad only; the touch BOOST button has its own flash.
  // * Always mount the element so a mid-session input-mode flip can show it; hide when
  // * the current surface is touch-first (syncHudLayout also re-toggles .hud-touch).
  elements.boost = document.createElement("div");
  elements.boost.className = "hud-boost";
  elements.boost.style.display = "none";
  // * Mock 6a: a cart-handle slab — "BOOST" in words, the track with its hazard
  // * overcharge zone, and the charge printed as a number. The slab owns the
  // * skew; an inner wrapper owns the counter-skew.
  const boostInner = document.createElement("div");
  boostInner.className = "hud-boost-inner";
  const boostLabel = document.createElement("span");
  boostLabel.className = "hud-boost-label";
  boostLabel.textContent = "BOOST";
  const boostTrack = document.createElement("div");
  boostTrack.className = "hud-boost-track";
  elements.boostFill = document.createElement("i");
  elements.boostFill.className = "hud-boost-fill";
  boostTrack.appendChild(elements.boostFill);
  elements.boostValue = document.createElement("span");
  elements.boostValue.className = "hud-boost-value";
  elements.boostValue.textContent = "0";
  boostInner.appendChild(boostLabel);
  boostInner.appendChild(boostTrack);
  boostInner.appendChild(elements.boostValue);
  elements.boost.appendChild(boostInner);
  regions.pod.insertBefore(elements.boost, elements.readyBtn);

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
  // * Body-level (not inside a HUD region) — it's a full-screen surface that must
  // * cover the frozen arena, and HUD region layout/scale must not touch it.
  document.body.appendChild(elements.lobbyScreen);

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
  syncHudLayout();

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
    setEdgeDanger,
    pulseHitDirection,
    tickHitDirection,
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
    if (elements.lobbyScreen) elements.lobbyScreen.hidden = true;
    scheduleHudLayoutSync();
    return;
  }

  if (suppressHud) {
    if (elements.feed) elements.feed.style.display = "none";
    // * Pause overlay owns the screen — the lobby stands down with the rest of the HUD.
    if (elements.lobbyScreen) elements.lobbyScreen.hidden = true;
    return;
  }

  if (elements.feed) elements.feed.style.display = "";

  updateStatus(roundState);
  updateTimer(roundState, matchHistoryLength);
  updateScores(roundState, netSlots, youConnId);
  updateReadyButton(roundPhase, netSlots, youConnId, menuVisible);
  // * After updateScores/updateReadyButton — it mirrors their computed state and,
  // * when active, stands the compact roster + corner ready button down.
  updateLobbyScreen(roundPhase, netSlots, youConnId, menuVisible);
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
/** Quantized (0.5%) boost-meter fill last written — skip redundant per-frame style writes. */
let _boostFillHalfPct = -1;

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
    if (elements.boost && _boostDisplay !== "none") {
      elements.boost.style.display = "none";
      _boostDisplay = "none";
    }
    updateBoostRing(show ? fillPct : null, state);
    return;
  }

  if (!elements.boost || !elements.boostFill) return;
  const displayVal = show ? "flex" : "none";
  if (_boostDisplay !== displayVal) {
    elements.boost.style.display = displayVal;
    _boostDisplay = displayVal;
  }
  if (!show) {
    _boostFillHalfPct = -1;
    return;
  }
  // * Quantize to 0.5% — skip the write when it wouldn't visibly change the bar.
  const fillHalfPct = Math.round(fillPct * 2);
  if (fillHalfPct !== _boostFillHalfPct) {
    _boostFillHalfPct = fillHalfPct;
    elements.boostFill.style.width = `${fillHalfPct / 2}%`;
    // * Whole percent only — the readout shares the bar's quantised source.
    if (elements.boostValue) {
      const pctText = String(Math.round(fillHalfPct / 2));
      if (elements.boostValue.textContent !== pctText) elements.boostValue.textContent = pctText;
    }
  }
  if (elements.boost.dataset.state !== state) elements.boost.dataset.state = state;
}

/**
 * Hides the boost meter AND clears the mobile BOOST-button ring, keeping the
 * per-frame write caches in sync. The single reset path for every menu return —
 * HUD.update() early-returns while the menu is up, so whatever state the widget
 * froze in would otherwise persist (desktop meter over the menu, stale ring pct
 * flashing on the next match's countdown).
 */
function resetBoostWidget() {
  if (elements.boost) {
    elements.boost.style.display = "none";
    delete elements.boost.dataset.state;
  }
  _boostDisplay = "none";
  _boostFillHalfPct = -1;
  updateBoostRing(null);
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
  if (cause === "spill_bonus") labels.push("SPILL BONUS");
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

/** Quantized hit-vignette values last written (0.05 steps) — skip style churn. */
let _edgeDangerQ = -1;
let _edgeDangerTQ = -1;
let _edgeDangerRQ = -1;
let _edgeDangerBQ = -1;
let _edgeDangerLQ = -1;
/** @type {string} */
let _edgeDangerRgb = "";
/** @type {boolean | null} */
let _edgeDangerActive = null;

/** Active directional hit flash (decays in {@link tickHitDirection}). */
const _hitFlash = {
  untilMs: 0,
  durationMs: 0,
  intensity: 0,
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
  /** @type {string | null} */
  colorCss: null,
};

/**
 * @param {number} v
 * @returns {number}
 */
function quantizeEdge01(v) {
  const c = Number(v) || 0;
  if (c <= 0) return 0;
  if (c >= 1) return 1;
  return Math.round(c * 20) / 20;
}

/**
 * Parses `#rrggbb` / `#rgb` into `"r, g, b"` for CSS `rgba(var(--x), a)`.
 * @param {string} cssHex
 * @returns {string | null}
 */
function cssHexToRgbChannels(cssHex) {
  const s = String(cssHex || "").trim();
  let m = /^#([0-9a-f]{6})$/i.exec(s);
  if (m) {
    const n = parseInt(m[1], 16);
    return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
  }
  m = /^#([0-9a-f]{3})$/i.exec(s);
  if (m) {
    const h = m[1];
    const r = parseInt(h[0] + h[0], 16);
    const g = parseInt(h[1] + h[1], 16);
    const b = parseInt(h[2] + h[2], 16);
    return `${r}, ${g}, ${b}`;
  }
  return null;
}

/**
 * Writes directional hit-vignette CSS vars (DOM only — no post-FX).
 * @param {{
 *   intensity?: number,
 *   top?: number,
 *   right?: number,
 *   bottom?: number,
 *   left?: number,
 *   colorCss?: string | null,
 * } | number} sample
 */
export function setEdgeDanger(sample) {
  const el = elements.edgeDanger;
  if (!el || !elements.root) return;

  let intensity = 0;
  let top = 0;
  let right = 0;
  let bottom = 0;
  let left = 0;
  /** @type {string | null | undefined} */
  let colorCss;

  if (typeof sample === "number") {
    intensity = sample;
    top = right = bottom = left = sample;
  } else if (sample && typeof sample === "object") {
    intensity = Number(sample.intensity) || 0;
    top = Number(sample.top) || 0;
    right = Number(sample.right) || 0;
    bottom = Number(sample.bottom) || 0;
    left = Number(sample.left) || 0;
    colorCss = sample.colorCss;
    if (intensity > 0 && top + right + bottom + left <= 0) {
      top = right = bottom = left = intensity;
    }
  }

  const q = quantizeEdge01(intensity);
  const tq = quantizeEdge01(top);
  const rq = quantizeEdge01(right);
  const bq = quantizeEdge01(bottom);
  const lq = quantizeEdge01(left);
  const active = q > 0.015 || tq + rq + bq + lq > 0.015;

  const accent = (
    (colorCss && String(colorCss)) ||
    elements.root.style.getPropertyValue("--hud-player-accent") ||
    _playerAccentCss ||
    "#22e6ff"
  ).trim();
  const rgb = cssHexToRgbChannels(accent) || "34, 230, 255";
  if (rgb !== _edgeDangerRgb) {
    _edgeDangerRgb = rgb;
    // * Set on the vignette node itself so gradients always resolve.
    el.style.setProperty("--hud-edge-danger-rgb", rgb);
    elements.root.style.setProperty("--hud-edge-danger-rgb", rgb);
  }

  if (q !== _edgeDangerQ) {
    _edgeDangerQ = q;
    elements.root.style.setProperty("--hud-edge-danger", String(q));
  }
  if (tq !== _edgeDangerTQ) {
    _edgeDangerTQ = tq;
    el.style.setProperty("--hud-edge-t", String(tq));
  }
  if (rq !== _edgeDangerRQ) {
    _edgeDangerRQ = rq;
    el.style.setProperty("--hud-edge-r", String(rq));
  }
  if (bq !== _edgeDangerBQ) {
    _edgeDangerBQ = bq;
    el.style.setProperty("--hud-edge-b", String(bq));
  }
  if (lq !== _edgeDangerLQ) {
    _edgeDangerLQ = lq;
    el.style.setProperty("--hud-edge-l", String(lq));
  }
  if (active !== _edgeDangerActive) {
    _edgeDangerActive = active;
    el.classList.toggle("is-active", active);
  }
}

/**
 * Arms a one-shot directional hit vignette (where a cart rammed you from).
 * Decays via {@link tickHitDirection}; max-of on stacked hits so doubles still read.
 *
 * @param {{
 *   intensity?: number,
 *   top?: number,
 *   right?: number,
 *   bottom?: number,
 *   left?: number,
 *   colorCss?: string | null,
 *   durationMs?: number,
 * }} sample
 */
export function pulseHitDirection(sample) {
  if (!sample) return;
  const now = performance.now();
  const durationMs = Math.max(120, Number(sample.durationMs) || 320);
  const intensity = Math.max(0, Number(sample.intensity) || 0);
  const top = Math.max(0, Number(sample.top) || 0);
  const right = Math.max(0, Number(sample.right) || 0);
  const bottom = Math.max(0, Number(sample.bottom) || 0);
  const left = Math.max(0, Number(sample.left) || 0);

  // * Stacked hits: keep the stronger side weights and refresh the fade window.
  const remaining = Math.max(0, _hitFlash.untilMs - now);
  const keep = remaining > 40 && _hitFlash.intensity > intensity * 0.85;
  if (keep) {
    _hitFlash.top = Math.max(_hitFlash.top, top);
    _hitFlash.right = Math.max(_hitFlash.right, right);
    _hitFlash.bottom = Math.max(_hitFlash.bottom, bottom);
    _hitFlash.left = Math.max(_hitFlash.left, left);
    _hitFlash.intensity = Math.max(_hitFlash.intensity, intensity);
  } else {
    _hitFlash.top = top;
    _hitFlash.right = right;
    _hitFlash.bottom = bottom;
    _hitFlash.left = left;
    _hitFlash.intensity = intensity;
  }
  _hitFlash.durationMs = durationMs;
  _hitFlash.untilMs = now + durationMs;
  if (sample.colorCss) _hitFlash.colorCss = sample.colorCss;

  setEdgeDanger({
    intensity: _hitFlash.intensity,
    top: _hitFlash.top,
    right: _hitFlash.right,
    bottom: _hitFlash.bottom,
    left: _hitFlash.left,
    colorCss: _hitFlash.colorCss,
  });
}

/**
 * Ease-out decay for the directional hit vignette. Call once per frame from visuals.
 * @param {number} [nowMs]
 */
export function tickHitDirection(nowMs = performance.now()) {
  if (_hitFlash.untilMs <= 0) return;
  if (nowMs >= _hitFlash.untilMs) {
    _hitFlash.untilMs = 0;
    _hitFlash.intensity = 0;
    setEdgeDanger(0);
    return;
  }
  const dur = Math.max(1, _hitFlash.durationMs);
  const t = Math.max(0, Math.min(1, (_hitFlash.untilMs - nowMs) / dur));
  // * Smoothstep ease-out so the glow settles softly instead of a linear snap-off.
  const fade = t * t * (3 - 2 * t);
  setEdgeDanger({
    intensity: _hitFlash.intensity * fade,
    top: _hitFlash.top * fade,
    right: _hitFlash.right * fade,
    bottom: _hitFlash.bottom * fade,
    left: _hitFlash.left * fade,
    colorCss: _hitFlash.colorCss,
  });
}

/**
 * Shows the top-center toast with the given title (challenge completions and, with a
 * custom kicker, mid-match unlocks).
 * @param {string} title
 * @param {string} [kicker] Kicker label above the title.
 * @param {{ durationMs?: number, priority?: number }} [opts] Stage-claim overrides —
 *   unlocks pass a longer duration + priority above announcer callouts (see main.js).
 */
export function showChallengeToast(title, kicker = "◆ CHALLENGE COMPLETE", opts = {}) {
  if (!elements.toast || !elements.toastTitle) return;
  const TOAST_MS = opts.durationMs ?? 3200;
  // * Center Stage routing — default toasts queue behind announcer callouts so the
  // * stage band shows one moment at a time; overflow beyond 2 queued drops. Unlock
  // * toasts pass STAGE_PRIORITY.CRITICAL to ride above callouts instead (the scale
  // * lives in centerStage.js).
  claimStage({
    kind: "toast",
    priority: opts.priority ?? STAGE_PRIORITY.TOAST,
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

  if (elements.comboMultiplier) elements.comboMultiplier.textContent = `${multiplier.toFixed(1)}X`;
  // * "CARNAGE COUPON" in the mock — the tier names the coupon, retail-voiced.
  if (elements.comboTier) elements.comboTier.textContent = `${tierName} COUPON`;
  if (elements.comboSecs) {
    const secsText = `${(remainingMs / 1000).toFixed(1)}S`;
    if (elements.comboSecs.textContent !== secsText) elements.comboSecs.textContent = secsText;
  }
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
        { transform: "skewX(-8deg) rotate(-2deg) scale(1)" },
        { transform: "skewX(-8deg) rotate(-2deg) scale(1.42)", offset: 0.3 },
        { transform: "skewX(-8deg) rotate(-2deg) scale(1)" },
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

/**
 * Slot index of the sole leader, or -1 when the round is tied or scoreless.
 * @returns {number}
 */
export function getLeaderSlotIndex() {
  return _leaderSlotIndex;
}

export function syncColors(slots) {
  refreshScoreBoxGlows(slots, _options.getYouConnId ? _options.getYouConnId() : null);
}

/** Empties the transaction-log rows and returns the receipt to its empty state. */
function clearKillFeedRows() {
  const rows = elements.feedRows;
  if (!rows) return;
  while (rows.firstChild) {
    const child = rows.firstChild;
    if (child instanceof HTMLElement) {
      cancelKillFeedExitTimer(child);
      cancelElementAnimations(child);
    }
    rows.removeChild(child);
  }
  elements.feed?.classList.add("is-empty");
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

  const displayVerb = verb;
  // * Mock 6a prints the streak as its own orange pip between actor and victim,
  // * not as "[3.0x CARNAGE]" glued onto the verb.
  let comboPip = null;
  if (comboTier > 0 && comboMultiplier > 1.0) {
    comboPip = document.createElement("span");
    comboPip.className = "hud-feed-pip";
    comboPip.dataset.tier = String(comboTier);
    comboPip.textContent = `${comboMultiplier.toFixed(1)}X`;
    const tierName = comboTier === 1 ? "RAMPAGE" : comboTier === 2 ? "SAVAGE" : "CARNAGE";
    comboPip.title = tierName;
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
    if (comboPip) row.appendChild(comboPip);
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
    if (comboPip) row.appendChild(comboPip);
  }

  const rowHost = elements.feedRows || elements.feed;
  rowHost.prepend(row);
  // * The receipt only exists while it has transactions — otherwise a bare
  // * "TRANSACTION LOG" header floats over the arena all round.
  elements.feed.classList.remove("is-empty");
  animateKillFeedEnter(row);

  // * Trim overflow synchronously — animated exit is only for timed auto-dismiss.
  while (rowHost.children.length > 4) {
    const last = rowHost.lastElementChild;
    if (!last) break;
    if (last instanceof HTMLElement) {
      cancelKillFeedExitTimer(last);
      cancelElementAnimations(last);
    }
    last.remove();
  }

  scheduleKillFeedExit(row);
}

/**
 * Full gameplay-HUD teardown for menu / podium / testdrive.
 *
 * Two independent paint paths exist:
 *   1. HUD.update() — early-returns while menuVisible
 *   2. frameVisuals (setHudDirective, tickHitDirection, edge danger) — skipped
 *      when the game loop shouldSkipTiming on menu
 *
 * Anything that can be mid-animation or mid-window when the player returns to
 * the title screen MUST be cleared here. Audit 2026-07-20 after arena splash +
 * directive chip stuck on multi-quickplay → menu.
 */
export function hideGameplayElements() {
  setHudDisplay(elements.timer, "none", "timer");
  setHudDisplay(elements.scores, "none", "scores");
  if (elements.readyBtn) {
    elements.readyBtn.style.display = "none";
    elements.readyBtn.classList.remove("is-ready");
  }
  // * CHECKOUT LINE is a full-screen surface and menu return skips the game loop,
  // * so updateLobbyScreen never runs again to hide it — LEAVE ROOM left it painted
  // * over the title screen until this line existed (cap-220/221, 08-01).
  if (elements.lobbyScreen) elements.lobbyScreen.hidden = true;
  setHudDisplay(elements.status, "none", "status");
  if (elements.status) {
    elements.status.textContent = "";
    elements.status.classList.remove("hud-status--mp", "is-celebration");
    elements.status.style.animation = "";
  }
  if (elements.root) {
    elements.root.classList.remove("hud-sudden-death");
  }
  if (elements.timer) {
    elements.timer.classList.remove("hud-timer-urgent", "hud-timer-warn");
  }
  // * Countdown aisle plate — only toggled in updateStatus (path 1).
  setArenaSplashVisible(false);
  // * Living Store directive chip — only driven from frameVisuals (path 2).
  setHudDirective(null, 0);
  // * Center Stage: toast + any staged event; hide() runs so opacity class drops.
  resetStage();
  if (_toastTimeoutId) {
    clearTimeout(_toastTimeoutId);
    _toastTimeoutId = null;
  }
  elements.toast?.classList.remove("active");
  // * Momentary KO FX that self-time via CSS/WAAPI — kill immediately on menu.
  elements.hitmarker?.classList.remove("hit");
  if (elements.root) {
    for (const el of elements.root.querySelectorAll(".hud-score-float")) {
      if (el instanceof HTMLElement) cancelElementAnimations(el);
      el.remove();
    }
  }
  if (elements.comboBadge) {
    elements.comboBadge.classList.remove("active", "tier-1", "tier-2", "tier-3");
    _prevComboTier = 0;
  }
  resetBoostWidget();
  if (elements.conn) elements.conn.style.display = "none";
  if (elements.feed) {
    elements.feed.style.display = "none";
    // * Clear the ROWS, not the panel: the header + counter-skew wrapper are
    // * permanent structure, not content.
    clearKillFeedRows();
  }
  // * Score-chip KO doodads (hidden with scores, but stop dangling timers).
  if (elements.scoreBoxes) {
    for (const entry of elements.scoreBoxes) {
      if (entry.dizzyTimeoutId) {
        clearTimeout(entry.dizzyTimeoutId);
        entry.dizzyTimeoutId = null;
      }
      if (entry.dizzy) entry.dizzy.style.display = "none";
      if (entry.pip) entry.pip.style.display = "none";
      if (entry.crown) entry.crown.style.display = "none";
    }
  }
  _hitFlash.untilMs = 0;
  _hitFlash.intensity = 0;
  _hitFlash.top = 0;
  _hitFlash.right = 0;
  _hitFlash.bottom = 0;
  _hitFlash.left = 0;
  setEdgeDanger(0);
  _lastBannerKey = null;
  _lastCountdownN = null;
  _goUntilMs = 0;
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
    // * Clear the ROWS, not the panel: the header + counter-skew wrapper are
    // * permanent structure, not content.
    clearKillFeedRows();
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
