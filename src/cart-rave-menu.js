// Cart Clash — Main Menu
import { CART_COLORS, PALETTE } from "./config.js";
import { STORAGE_KEYS, storageGet, storageSet } from "./utils/storage.js";
import {
  CUSTOM_COLOR_ID,
  DEFAULT_CUSTOM_HUE,
  hueToNeonCss,
  loadPlayerCustomization,
  normalizeHue,
  savePlayerCustomization,
} from "./customization.js";
import {
  CART_PATTERN_IDS,
  CART_PATTERNS,
  DEFAULT_CART_PATTERN,
  makePatternMiniCartSvg,
  normalizePatternId,
  patternSvgParts,
} from "./cartPatternConfig.js";
import {
  DEFAULT_CART_THEME,
  DEFAULT_SUNGLASSES_STYLE,
  SUNGLASSES_STYLES,
} from "./cartThemeConfig.js";
import { CartPreview } from "./ui/cartPreview.js";
import { prefetchPreviewCartGltf } from "./ui/cartPreviewGltf.js";
import { isTouchDevice } from "./utils.js";
import { getQualityTier } from "./utils/qualityMode.js";
import { settingsStore } from "./stores/settingsStore.js";
import { DEFAULT_SOLO, normalizeDifficulty } from "./aiDifficulty.js";
import { togglePostFx, applyQualityTier } from "./ui/graphicsToggles.js";
import { setAllAudioMuted, setMusicGainValue, setSfxSliderVolume, setVoiceSliderVolume } from "./ui/audioControls.js";
import { playUiClick } from "./sfxSynth.js";
import { AUDIO_VOLUME_MAX } from "./stores/audioStore.js";
import { getRoundState } from "./gameState.js";
// * MENU-LOCK-HINT-1: browsing a locked arena must retarget the 3D preview without
// * selecting it. Imported directly rather than routed through main.js — levelManager is
// * already a shared module (gameFlow/netcode/main) and imports nothing from the menu.
import { setMenuBrowseLevel, scheduleMenuLevelPreview } from "./levelManager.js";
import { setInputMode, updateControlsPanelUI, getInputMode, onInputModeChange } from "./input.js";
import { readBuildInfo } from "./utils/buildInfo.js";
import {
  animateButtonPress,
  animateButtonRelease,
  animateColorChipSelect,
  animateHowToAttract,
  animateLevelCardSelect,
  animateMenuCardEnter,
  animateMenuDismiss,
  animateMenuReveal,
  animateRerollSpin,
  animateTogglePop,
  stagger,
  stopHowToAttract,
  wireButtonPressFeedback,
  wireHoverFeedback,
} from "./animations.js";
import {
  isCustomColorUnlocked,
  isLevelUnlocked,
  isPatternUnlocked,
  isSunglassesUnlocked,
  getCustomColorUnlockStatus,
  getLevelUnlockStatus,
  getPatternUnlockStatus,
  getSunglassesUnlockStatus,
  clampLevelIdToUnlocks,
  onUnlockGranted,
  unlockStore,
} from "./stores/unlockStore.js";
import { FREE_LEVEL, LEVEL_UNLOCKS } from "./unlockConfig.js";
import { challengeStore, CHALLENGE_POOL, CHALLENGE_ROTATION_MS } from "./stores/challengeStore.js";
import { NPC_NAME_POOL } from "./npcNames.js";
import { ARENA_CATALOG } from "./levels/arenaCatalog.js";

(function () {
  'use strict';

  // * Subtle UI click on any game-menu button (class contains "cr-"); Tweakpane debug
  // * buttons (tp-*) are excluded. One delegated listener beats wiring ~20 handlers.
  // * playUiClick is mute/volume-guarded and silent until the AudioContext is unlocked.
  document.addEventListener('click', (e) => {
    const btn = /** @type {HTMLElement | null} */ (e.target)?.closest?.('button');
    if (!btn) return;
    const cls = typeof btn.className === 'string' ? btn.className : '';
    if (cls.includes('cr-')) playUiClick();
  }, { passive: true });

  // ─── Palettes ─────────────────────────────────────────────────────────────
  const PALETTES = {
    classic: {
      name: "Classic",
      bg: "#0a0014",
      players: ["#ff2bd6", "#22e6ff", "#2bff7a", "#ffe53d", "#ff7a1a"],
      primary: "#ff2bd6",
      secondary: "#22e6ff",
      tertiary: "#ffe53d",
    },
    toxic: {
      name: "Toxic",
      bg: "#0d0020",
      players: ["#a020ff", "#39ff14", "#ff2bd6", "#00ffd1", "#ff9d00"],
      primary: "#39ff14",
      secondary: "#a020ff",
      tertiary: "#ff2bd6",
    },
    sunset: {
      name: "Sunset",
      bg: "#1a0318",
      players: ["#ff3b8c", "#ff7a1a", "#ffe53d", "#ff2bd6", "#c22bff"],
      primary: "#ff3b8c",
      secondary: "#ffe53d",
      tertiary: "#ff7a1a",
    },
    ice: {
      name: "Ice",
      bg: "#000a1a",
      players: ["#22e6ff", "#ffffff", "#22b6ff", "#c4f6ff", "#6a00ff"],
      primary: "#22e6ff",
      secondary: "#6a00ff",
      tertiary: "#ffffff",
    },
    liminal: {
      // The Storerooms — fluorescent-tube yellow + exit-sign green.
      name: "Liminal",
      bg: "#0b0a04",
      players: ["#ff2bd6", "#22e6ff", "#2bff7a", "#ffe53d", "#ff7a1a"],
      primary: "#f5ef6d",
      secondary: "#59f7a8",
      tertiary: "#ffffff",
    },
  };

  // Change this key to switch palette, or call window.CartClash.setPalette(key) (alias: CartRave).
  const CONFIG = {
    palette: "classic",
    cartDance: true,

    // Beat / cart dance animation
    bpm: 128,
    beatDecay: 0.8,
    tiltSpeedHz: 1.2,
    tiltAmplitude: 0.6,
    cartPulseScale: 0.06,
    cartBobPx: 8,
    cartTiltDeg: 6,
    shadowBeatScale: 0.15,
    titleBeatScale: 0.015,

    nameMaxLength: 12,
    defaultVolume: 0.25,
  };

  const capitalizeWord = (word) =>
    word ? word.charAt(0).toUpperCase() + word.slice(1).toLowerCase() : "";

  const HANDLE_PARTS = [
    // * Flavor leans Cart Clash (arena brawl) with a few rave holdovers that still fit.
    ["CART", "BASS", "NEON", "TROLLEY", "WHEEL", "CLASH", "RAM", "SLAM", "KICK", "BOOM", "ZAP", "TURBO", "CRASH", "STROBE"],
    // * Style guide §2/§8: player copy never says "kill" — keep this list KO-friendly.
    ["LORD", "QUEEN", "BRUISER", "RIDER", "GOBLIN", "WIZARD", "DEMON", "DADDY", "NINJA", "WRECK", "BEAST", "PRINCE", "MENACE", "TANK", "CHAMP"],
  ];
  const rollHandle = () => {
    const a = HANDLE_PARTS[0][Math.floor(Math.random() * HANDLE_PARTS[0].length)];
    const b = HANDLE_PARTS[1][Math.floor(Math.random() * HANDLE_PARTS[1].length)];
    return `${capitalizeWord(a)}${capitalizeWord(b)}`;
  };

  const PLAYER_NAME_POOL = [
    "ShelfSmasher",
    "CartCrasher",
    "AisleRipper",
    "PriceChopper",
    "StockPiler",
    "ExpressLane",
    "BarcodeBlitz",
    "CartSurgeon",
    "WheelDeal",
    "BagBandit",
    "CartPunk",
    "RollCall",
    "SkidRow",
    "PushStart",
    "CartAttack",
    "DriftKart",
    "RampRunner",
    "FloorModel",
    "CartSmash",
    "BargainBin",
    "ShopDropper",
    "CartStarter",
    "RaveRoller",
    "NeonDrifter",
    "GlowCart",
    "BassCart",
    "DropBeat",
    "CartMosh",
    "ClubCart",
    // * Cart Clash flavor expansion — arena-brawl handles (KO-friendly per style guide).
    "CartClasher",
    "AisleBrawler",
    "CartQuake",
    "BumperKing",
    "SlamCart",
    "RamRodeo",
    "CheckMeOut",
    "HeavyCart",
    "LotWarrior",
    "CartHavoc",
  ];

  // * Keep player names distinct from the in-game NPC pool — sourced from the shared
  // * canonical list so new NPC names can never leak into the player reroll.
  const CLIENT_NPC_NAME_SET = new Set(NPC_NAME_POOL);

  const rollPlayerName = () => {
    const pool = PLAYER_NAME_POOL.filter((n) => !CLIENT_NPC_NAME_SET.has(n));
    return pool[Math.floor(Math.random() * pool.length)] || "CartClasher";
  };

  // * Game color IDs — same order as PALETTE / CART_COLORS in config.js.
  const PALETTE_GAME = PALETTE;
  const COLOR_ARIA_LABELS = ['Pink', 'Blue', 'Green', 'Yellow', 'Neon orange'];

  const LEVEL_STORAGE_KEY = STORAGE_KEYS.level;
  // * The arena a player with no saved selection lands on — must be one everybody owns.
  const DEFAULT_LEVEL = FREE_LEVEL;
  const LEVEL_OPTIONS = Object.fromEntries(
    ARENA_CATALOG
      .filter((arena) => arena.quickplay)
      .map((arena) => [arena.id, { enabled: true }]),
  );

  // Arena ambience — picking a level re-themes the menu backdrop/particles/
  // spotlights so the menu previews where you're headed (Pass 3 attract mode).
  const LEVEL_AMBIENCE = Object.fromEntries(
    ARENA_CATALOG.map((arena) => [arena.id, arena.menuTheme]),
  );

  // ─── State ────────────────────────────────────────────────────────────────
  const state = {
    palette: PALETTES[CONFIG.palette] || PALETTES.classic,
    playerIdx: 0,
    level: DEFAULT_LEVEL,
    name: storageGet(STORAGE_KEYS.username) || rollPlayerName(),
    beat: 0,
    tilt: 0,
    colorMode: 'preset',
    customHue: DEFAULT_CUSTOM_HUE,
    pattern: DEFAULT_CART_PATTERN,
    sunglassesStyle: DEFAULT_SUNGLASSES_STYLE,
  };

  /**
   * * Browse cursor — the arena the pager is DISPLAYING, which is not always the arena the
   * * player has SELECTED. Null means "follow the selection" (the normal case).
   * *
   * * MENU-LOCK-HINT-1: pageArena used to skip locked arenas, so a new player with only the
   * * free arena unlocked pressed ▸ and nothing happened — two live-looking arrows that did
   * * nothing, and a "1/3" advertising two arenas they could not see, name, or learn how to
   * * earn. Browsing now steps onto locked arenas, which means the pager needs a cursor that
   * * `selectLevel` deliberately refuses to commit.
   * *
   * * The cursor NEVER writes state.level, storage, or settingsStore — browsing is not
   * * choosing. `.active` stays on the committed selection, so anything still reading the
   * * hidden radiogroup (STATES-DEAD-1 calls it the arena data source) is never lied to.
   * *
   * * Declared beside `state` rather than next to pageArena on purpose: selectLevel reads it
   * * and runs during init, so a `let` further down the body would be in its TDZ.
   * @type {string | null}
   */
  let browseLevelId = null;

  /** The arena the pager should display: the browse cursor, else the committed selection. */
  function pagerLevelId() {
    return browseLevelId ?? state.level;
  }

  if (!storageGet(STORAGE_KEYS.username)) {
    state.name = rollPlayerName();
    storageSet(STORAGE_KEYS.username, state.name);
  }

  // ─── DOM refs ─────────────────────────────────────────────────────────────
  const $ = (id) => document.getElementById(id);
  const root = $("cr-root");
  const titleEl = $("cr-title");
  const customizeColorRow = $("cr-customize-color-row");
  const customizeSunglassesRow = $("cr-customize-sunglasses-row");
  const customizePatternRow = $("cr-customize-pattern-row");
  const customizeScreen = $("cr-customize-screen");
  const customizeCartHolder = $("cr-customize-cart-holder");
  const customizeCartShadow = $("cr-customize-cart-shadow");
  const customizeDoneBtn = $("cr-customize-done");
  const customizeBackBtn = $("cr-customize-back");
  const customHueWrap = $("cr-custom-hue-wrap");
  const customHueSlider = /** @type {HTMLInputElement | null} */ ($("cr-custom-hue-slider"));
  const customHueVal = $("cr-custom-hue-val");
  const levelRow = $("cr-level-row");
  const diffRow = $("cr-diff-row");
  const playerCard = $("cr-player-card");
  const nameDisplay = $("cr-name-display");
  const nameText = $("cr-name-text");
  const nameInput = /** @type {HTMLInputElement | null} */ ($("cr-name-input"));
  const rerollBtn = $("cr-reroll");
  const muteBtn = $("cr-mute-btn");
  const musicVolFill = $("cr-music-vol-fill");
  const musicVolVal = $("cr-music-vol-val");
  const audioEl = $("cr-audio");
  const gfxBtn = $("cr-gfx-btn");
  const lqBtn = $("cr-lq-btn");
  const challengesListEl = $("cr-challenges-list");
  const challengesKickerEl = $("cr-challenges-kicker");
  const challengesScreen = $("cr-challenges-screen");
  const challengesDoneBtn = $("cr-challenges-done");
  const challengesBackBtn = $("cr-challenges-back");
  const settingsScreen = $("cr-settings-screen");
  const settingsDoneBtn = $("cr-settings-done");
  const settingsBackBtn = $("cr-settings-back");
  const howtoScreen = $("cr-howto-screen");
  const howtoDoneBtn = $("cr-howto-done");
  const howtoBackBtn = $("cr-howto-back");
  const howtoPrevBtn = $("cr-howto-prev");
  const howtoNextBtn = $("cr-howto-next");
  const howtoPosEl = $("cr-howto-pos");
  const howtoControlsEl = $("cr-howto-controls");
  const howtoPadEl = $("cr-howto-pad");
  const howtoMenuBtn = root?.querySelector('[data-action="howto"]');
  const howtoMenuLabel = /** @type {HTMLElement | null} */ (
    howtoMenuBtn?.querySelector(".cr-btn-label") ?? null
  );
  const settingsMuteBtn = $("cr-settings-mute-btn");
  const settingsVolFill = $("cr-settings-vol-fill");
  const settingsVolVal = $("cr-settings-vol-val");
  const settingsSfxFill = $("cr-settings-sfx-fill");
  const settingsSfxVal = $("cr-settings-sfx-val");
  const settingsVoiceFill = $("cr-settings-voice-fill");
  const settingsVoiceVal = $("cr-settings-voice-val");
  const settingsVolTrackEl = $("cr-settings-vol-track");
  const settingsSfxTrackEl = $("cr-settings-sfx-track");
  const settingsVoiceTrackEl = $("cr-settings-voice-track");
  let currentCustomizeCartSvg = null;
  /** @type {CartPreview | null} Live 3D cart preview while customize screen is open. */
  let cartPreview = null;
  let customHueSliderWired = false;
  // NOTE: Quickplay and Friends support touch controls on mobile (see main.js updateTouchControlsVisibility).

  // ─── Neon cart SVG builder (customize fallback when 3D preview is offline) ─
  /**
   * Builds a large neon cart SVG used as the Customize screen fallback.
   * @param {string} color Hex color for strokes, fills, and glow filter.
   * @param {string} [patternId] Optional vinyl pattern id for basket fill preview.
   * @returns {string} SVG markup string.
   */
  function makeCartSVG(color, patternId = state.pattern) {
    const gid = 'g' + Math.random().toString(36).slice(2, 8);
    const patUid = 'p' + Math.random().toString(36).slice(2, 8);
    const hasPattern = normalizePatternId(patternId) !== 'classic';
    const { defs: patternDefs, overlay: patternOverlay } = patternSvgParts(patternId, color, patUid);
    const basketStroke = hasPattern
      ? ''
      : `<path d="M44 50 L200 50 L182 120 L60 120 Z" fill="none" stroke="${color}" stroke-width="7" stroke-linejoin="round" />
  <path d="M50 72 L196 72 M54 92 L190 92" stroke="${color}" stroke-width="3" stroke-linecap="round" opacity="0.85" />
  <path d="M82 50 L78 120 M120 50 L120 120 M158 50 L162 120" stroke="${color}" stroke-width="3" stroke-linecap="round" opacity="0.85" />`;
    return `
<svg viewBox="0 0 220 180" width="280" height="${280 * (180 / 220)}"
     style="filter: drop-shadow(0 0 14px ${color}) drop-shadow(0 0 28px ${color}88);">
  <defs>
    <linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${color}" stop-opacity="1" />
      <stop offset="100%" stop-color="${color}" stop-opacity="0.75" />
    </linearGradient>
    ${patternDefs}
  </defs>
  <path d="M8 28 L44 28 L64 98" fill="none" stroke="${color}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" />
  ${basketStroke}
  ${patternOverlay}
  <circle cx="78" cy="148" r="18" fill="none" stroke="${color}" stroke-width="6" />
  <circle cx="78" cy="148" r="6" fill="${color}" />
  <circle cx="172" cy="148" r="18" fill="none" stroke="${color}" stroke-width="6" />
  <circle cx="172" cy="148" r="6" fill="${color}" />
  <g opacity="0.7">
    <path d="M-8 150 L18 150 M-4 158 L14 158" stroke="${color}" stroke-width="3" stroke-linecap="round" />
  </g>
</svg>`;
  }

  function makeMiniCart(color) {
    return `
<svg viewBox="0 0 44 36" width="32" height="26" style="overflow:visible;">
  <path d="M2 6 L10 6 L14 20" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" />
  <path d="M10 10 L40 10 L36 24 L14 24 Z" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" />
  <circle cx="16" cy="30" r="3.5" fill="none" stroke="${color}" stroke-width="2" />
  <circle cx="34" cy="30" r="3.5" fill="none" stroke="${color}" stroke-width="2" />
</svg>`;
  }

  // ─── Level selection ──────────────────────────────────────────────────────
  function getSavedLevel() {
    const saved = storageGet(LEVEL_STORAGE_KEY);
    const option = saved && LEVEL_OPTIONS[saved];
    if (option && option.enabled && isLevelUnlocked(saved)) return saved;
    return clampLevelIdToUnlocks(DEFAULT_LEVEL);
  }

  function persistLevel(levelId) {
    const safe = clampLevelIdToUnlocks(levelId);
    state.level = safe;
    storageSet(LEVEL_STORAGE_KEY, safe);
    window.cartRaveLevel = safe;
    settingsStore.getState().setSelectedLevelId(safe);
  }

  function updateLevelButtons() {
    if (!levelRow) return;
    levelRow.querySelectorAll('.cr-level-btn').forEach((btn) => {
      const levelId = btn.dataset.level || "";
      const unlocked = isLevelUnlocked(levelId);
      const status = getLevelUnlockStatus(levelId);
      const isActive = levelId === state.level;
      btn.classList.toggle('active', isActive);
      btn.classList.toggle('cr-level-btn--locked', !unlocked);
      btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
      btn.setAttribute('aria-disabled', unlocked ? 'false' : 'true');
      if (!unlocked) {
        btn.title = `${status.hint} (${status.progress}/${status.goal})`;
        let lock = btn.querySelector('.cr-unlock-lock');
        if (!lock) {
          lock = document.createElement('span');
          lock.className = 'cr-unlock-lock';
          lock.setAttribute('aria-hidden', 'true');
          btn.appendChild(lock);
        }
        lock.textContent = `🔒 ${status.progress}/${status.goal}`;
      } else {
        btn.querySelector('.cr-unlock-lock')?.remove();
        const meta = LEVEL_UNLOCKS[levelId];
        btn.title = meta?.label || levelId;
      }
    });
  }

  function selectLevel(levelId) {
    const option = LEVEL_OPTIONS[levelId];
    if (!option || !option.enabled) return;
    if (!isLevelUnlocked(levelId)) {
      const status = getLevelUnlockStatus(levelId);
      showUnlockToast(`Locked — ${status.hint} (${status.progress}/${status.goal})`, 3200, "arena");
      // * Cursor deliberately NOT cleared: a refused selection leaves the pager showing the
      // * locked arena the player is looking at, which is the whole point of browsing.
      return;
    }
    // * A real selection ends browsing — including the same-level case below, which is how
    // * you get back from a locked arena to the one you already had selected. Clearing the
    // * preview cursor hands the preview back to storage.
    browseLevelId = null;
    setMenuBrowseLevel(null);
    if (levelId === state.level) {
      updateArenaPager();
      scheduleMenuLevelPreview();
      return;
    }
    persistLevel(levelId);
    updateLevelButtons();
    updateArenaPager();
    applyLevelAmbience(levelId);
    window.dispatchEvent(new CustomEvent("cartrave:level-changed"));
    if (levelRow) {
      const active = levelRow.querySelector(".cr-level-btn.active");
      if (active) {
        animateLevelCardSelect(getMenuPressTarget(active));
      }
    }
  }

  /**
   * Re-themes the menu's ambient layers to match the selected arena. Ambient
   * ONLY: the player-color roster (`palette.players`) is kept stable so cart
   * color chips and the color sent to the server never re-roll with the arena.
   * @param {string} levelId
   */
  function applyLevelAmbience(levelId) {
    const src = PALETTES[LEVEL_AMBIENCE[levelId]];
    if (!src) return;
    state.palette = { ...src, players: state.palette.players };
    CONFIG.palette = LEVEL_AMBIENCE[levelId];
    applyPalette();
  }

  function initLevelSelect() {
    persistLevel(getSavedLevel());
    updateLevelButtons();
    applyLevelAmbience(state.level);
    if (!levelRow) return;
    levelRow.querySelectorAll('.cr-level-btn').forEach((btn) => {
      btn.addEventListener('click', () => selectLevel(btn.dataset.level));
    });
  }

  /**
   * Menu context difficulty chips only (`#cr-diff-row`). Shown for Solo and for
   * Friends pre-enter (DIFF-FRIENDS-1: `MENU_ITEMS.friends.diff = true`).
   * Writes `settingsStore.aiDifficulty` only — no netcode import (BUNDLE-1).
   * The Friends CHECKOUT LINE host row is built and wired in hud.js; it paints
   * from the room latch and calls `hostSetRoomAiDifficulty`.
   * @returns {HTMLElement[]}
   */
  function allMenuDiffButtons() {
    if (!diffRow) return [];
    return /** @type {HTMLElement[]} */ ([...diffRow.querySelectorAll(".cr-diff-btn")]);
  }

  function updateDiffButtons() {
    const current = normalizeDifficulty(
      settingsStore.getState().aiDifficulty,
      DEFAULT_SOLO,
    );
    allMenuDiffButtons().forEach((btn) => {
      const id = btn.dataset.difficulty || "";
      const isActive = id === current;
      btn.classList.toggle("active", isActive);
      btn.setAttribute("aria-pressed", isActive ? "true" : "false");
    });
  }

  function selectDifficulty(difficulty) {
    const next = normalizeDifficulty(difficulty, DEFAULT_SOLO);
    const prev = normalizeDifficulty(
      settingsStore.getState().aiDifficulty,
      DEFAULT_SOLO,
    );
    if (next === prev) return;
    settingsStore.getState().setAiDifficulty(next);
    updateDiffButtons();
    if (diffRow) {
      const active = diffRow.querySelector(".cr-diff-btn.active");
      if (active) animateLevelCardSelect(getMenuPressTarget(active));
    }
  }

  function initDiffSelect() {
    // * Ensure store+localStorage have a normalized value (default DEFAULT_SOLO).
    settingsStore.getState().setAiDifficulty(
      normalizeDifficulty(settingsStore.getState().aiDifficulty, DEFAULT_SOLO),
    );
    updateDiffButtons();
    // * Bind only the menu row — lobby chips are created later in hud and must not
    // * share this store-only handler (room latch is netcode's job).
    allMenuDiffButtons().forEach((btn) => {
      btn.addEventListener("click", () => selectDifficulty(btn.dataset.difficulty));
    });
  }

  // * HUD-TOAST-Z-1 — the surfaces that can own the bottom-centre strip the toast lands in.
  // * SELECTOR COUPLING, NOT AN IMPORT. This module deliberately has no module edge to hud.js
  // * (see the routing note at the top of this file) and a DOM query does not create one — but
  // * these strings do have to be revisited if the HUD renames a region.
  // *   .hud-region-pod  boost slab + combo badge + ready button. Quickplay keeps the ready
  // *                    button live here; the friends lobby hides it (hud.js updateLobbyScreen).
  // *   .hud-lobby-hint  the friends lobby's full-bleed ESC/PAUSE row — with the pod stood down,
  // *                    this is the ONLY bottom-strip occupant while .hud-lobby is up, so
  // *                    leaving it out just moves the bug one surface over.
  // *   .gtc-*           touch joystick and button cluster.
  const TOAST_STRIP_OWNERS = [
    "#hud .hud-region-pod",
    ".hud-lobby-hint",
    "#game-touch-controls .gtc-nipple-zone",
    "#game-touch-controls .gtc-btns",
  ];
  const TOAST_STRIP_GAP = 12; // px of air between the strip owner and the toast

  /**
   * HUD-TOAST-Z-1 — pixels to lift the toast clear of the bottom-centre strip, or 0 if it is free.
   *
   * MEASURED, not hard-coded, because no constant could be right: `.hud-region-pod`'s `bottom` is
   * three different values across two media queries (hud.css :80, :1029, :1145) and the pod is a
   * bottom-anchored column whose height grows with the combo badge and ready button. Measuring
   * also removes the need for any "are we in a round" flag — a hidden element measures 0, so the
   * menu, the pause overlay (`.hud-suppressed`) and the podium all fall out for free, and the
   * question answered is the one that actually matters: what is painted there right now.
   *
   * ONE forced layout read per toast. Toasts are user- or network-triggered and rare; this must
   * not be moved into an update path.
   * @returns {number}
   */
  function measureBottomStripLift() {
    const viewportH = window.innerHeight || 0;
    if (!viewportH) return 0;
    let lift = 0;
    for (const selector of TOAST_STRIP_OWNERS) {
      const el = document.querySelector(selector);
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      // * Gate on height, NOT on getClientRects().length — .hud-region-pod is an empty
      // * absolutely-positioned shrink-to-fit box that still reports one 0x0 rect when every
      // * one of its children is hidden, which is exactly the menu case.
      if (rect.height === 0) continue;
      lift = Math.max(lift, viewportH - rect.top + TOAST_STRIP_GAP);
    }
    // * A pathological measurement must not launch the toast into the middle of the screen.
    return Math.min(lift, viewportH * 0.4);
  }

  /**
   * Lightweight toast for lock feedback + unlock grants.
   * @param {string} message
   * @param {number} [durationMs]
   * @param {"default" | "arena"} [variant] "arena" lifts above the main-menu bottom hint bar.
   *   Set/cleared on every call so Customize locked-color toasts never inherit a stuck class.
   */
  function showUnlockToast(message, durationMs = 3200, variant = "default") {
    let el = document.getElementById('cr-unlock-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'cr-unlock-toast';
      el.className = 'cr-unlock-toast';
      el.setAttribute('role', 'status');
      document.body.appendChild(el);
    }
    el.textContent = message;
    // * HUD-TOAST-Z-1 — placement is decided HERE, not by the caller. The proximate cause of the
    // * bug was that the public showToast() bridge never forwarded a variant, and the tempting fix
    // * is to add the parameter. That is the wrong lesson: it would put HUD geometry in the hands
    // * of six call sites (hud.js, netcode.js x2, main.js, gameSession.js, menuPlayEntry.js), five
    // * of which have no business knowing the boost slab exists, and any one of which can forget.
    // * Deciding here means none of those files change and every future caller is right by default.
    // *
    // * All four properties are written UNCONDITIONALLY on every call. The element is a singleton
    // * reused for the life of the page, so a skipped branch is precisely how it acquires a stuck
    // * class or a stale inline lift.
    const lift = measureBottomStripLift();
    el.classList.toggle('cr-unlock-toast--arena', variant === 'arena' && lift === 0);
    el.classList.toggle('cr-unlock-toast--lifted', lift > 0);
    if (lift > 0) el.style.setProperty('--cr-toast-lift', `${Math.round(lift)}px`);
    else el.style.removeProperty('--cr-toast-lift');
    el.classList.add('cr-unlock-toast--show');
    const prev = /** @type {HTMLElement & { _hideTimer?: number }} */ (el);
    window.clearTimeout(prev._hideTimer);
    prev._hideTimer = window.setTimeout(() => {
      el.classList.remove('cr-unlock-toast--show');
    }, durationMs);
  }

  // ─── Custom color (hue-only neon; persisted via customization.js) ───────
  function getActiveColorCss() {
    if (state.colorMode === 'custom') return hueToNeonCss(state.customHue);
    const presetId = PALETTE_GAME[state.playerIdx] || PALETTE_GAME[0];
    const hex = CART_COLORS[presetId]?.hex ?? CART_COLORS[PALETTE_GAME[0]].hex;
    return `#${hex.toString(16).padStart(6, '0')}`;
  }

  /** @returns {number} Active player color as a hex number for the 3D preview paint. */
  function getActiveColorHex() {
    if (state.colorMode === 'custom') {
      return parseInt(hueToNeonCss(state.customHue).slice(1), 16);
    }
    const presetId = PALETTE_GAME[state.playerIdx] || PALETTE_GAME[0];
    return CART_COLORS[presetId]?.hex ?? CART_COLORS[PALETTE_GAME[0]].hex;
  }

  // ─── Customization persistence (delegates to customization.js) ──────────
  function applyCustomizationToState(saved) {
    state.colorMode = saved.colorMode === 'custom' ? 'custom' : 'preset';
    state.customHue = normalizeHue(saved.customHue);
    state.pattern = saved.pattern || DEFAULT_CART_PATTERN;
    state.sunglassesStyle = saved.sunglassesStyle || DEFAULT_SUNGLASSES_STYLE;
    if (state.colorMode === 'preset') {
      const presetId = saved.color === CUSTOM_COLOR_ID ? PALETTE_GAME[0] : saved.color;
      state.playerIdx = colorIdxFromGameId(presetId);
    }
  }

  /**
   * Saves menu customization state through the shared store and syncs local UI state.
   * @param {{ colorMode?: 'preset'|'custom', color?: string, customHue?: number, pattern?: string, sunglassesStyle?: string }} customization
   */
  function saveCustomization(customization) {
    const saved = savePlayerCustomization(customization);
    applyCustomizationToState(saved);
    return saved;
  }

  function colorIdxFromGameId(colorId) {
    const idx = PALETTE_GAME.indexOf(colorId);
    return idx >= 0 ? idx : 0;
  }

  function updateCustomHueUi() {
    const css = hueToNeonCss(state.customHue);
    const customUnlocked = isCustomColorUnlocked();
    // * Slider only when custom is selected and unlocked.
    if (customHueWrap) {
      customHueWrap.hidden = state.colorMode !== 'custom' || !customUnlocked;
    }
    if (customHueSlider) {
      customHueSlider.value = String(state.customHue);
      customHueSlider.style.setProperty('--cr-hue-thumb', css);
      customHueSlider.disabled = !customUnlocked;
    }
    if (customHueVal) {
      customHueVal.textContent = `${state.customHue}°`;
      customHueVal.style.color = css;
      customHueVal.style.textShadow = `0 0 8px ${css}`;
    }
  }

  /** Refresh lock chrome after unlock progress / grants. */
  function refreshUnlockUi() {
    updateLevelButtons();
    buildColorChips();
    buildPatternChips();
    buildSunglassesChips();
    updateCustomHueUi();
  }

  function selectPresetColor(idx) {
    if (getRoundState().phase === "countdown" || getRoundState().phase === "running") return;
    if (idx < 0 || idx >= PALETTE_GAME.length) return;
    state.colorMode = 'preset';
    state.playerIdx = idx;
    saveCustomization({ colorMode: 'preset', color: PALETTE_GAME[idx] });
    buildColorChips();
    buildPatternChips();
    updateCustomHueUi();
    renderCustomizePreview();
    applyPalette();
  }

  function selectCustomColor() {
    if (getRoundState().phase === "countdown" || getRoundState().phase === "running") return;
    if (!isCustomColorUnlocked()) {
      const status = getCustomColorUnlockStatus();
      showUnlockToast(`Locked — ${status.hint} (${status.progress}/${status.goal})`);
      return;
    }
    if (state.colorMode === 'custom') return;
    state.colorMode = 'custom';
    saveCustomization({ colorMode: 'custom', customHue: state.customHue });
    buildColorChips();
    buildPatternChips();
    updateCustomHueUi();
    renderCustomizePreview();
    applyPalette();
  }

  function onCustomHueInput(hue, shouldSave = false) {
    if (getRoundState().phase === "countdown" || getRoundState().phase === "running") return;
    state.customHue = normalizeHue(hue);
    if (shouldSave) {
      saveCustomization({ colorMode: 'custom', customHue: state.customHue });
    }
    updateCustomHueUi();
    const customChip = customizeColorRow?.querySelector('.cr-color-chip--custom');
    if (customChip) {
      const css = hueToNeonCss(state.customHue);
      customChip.style.setProperty('--cc', css);
    }
    // * Recolor pattern mini-carts only on release (shouldSave) — avoid per-frame SVG rebuilds.
    if (shouldSave) buildPatternChips();
    renderCustomizePreview();
    applyPalette();
  }

  /** @param {number} hex */
  function previewHexToCss(hex) {
    return `#${(hex >>> 0).toString(16).padStart(6, '0')}`;
  }

  // ─── Build color chips ────────────────────────────────────────────────────
  /**
   * Rebuilds the player color picker chips and wires click handlers.
   * Syncs active chip, localStorage, cart preview, and palette CSS vars.
   */
  function buildColorChips() {
    if (!customizeColorRow) return;
    customizeColorRow.setAttribute('role', 'radiogroup');
    const p = state.palette;
    const customCss = hueToNeonCss(state.customHue);
    let html = "";
    p.players.forEach((col, i) => {
      const isActive = state.colorMode === 'preset' && state.playerIdx === i;
      const colorLabel = COLOR_ARIA_LABELS[i] || `Color ${i + 1}`;
      html += `<button type="button" class="cr-color-chip ${isActive ? 'active' : ''}" data-kind="preset" data-idx="${i}" style="--cc:${col};" role="radio" aria-checked="${isActive}" aria-label="${colorLabel}">
        ${makeMiniCart(col)}
      </button>`;
    });
    const customActive = state.colorMode === 'custom';
    const customUnlocked = isCustomColorUnlocked();
    const customStatus = getCustomColorUnlockStatus();
    const customLockCls = customUnlocked ? '' : ' cr-chip--locked';
    const customTitle = customUnlocked
      ? 'Custom color'
      : `Locked — ${customStatus.hint} (${customStatus.progress}/${customStatus.goal})`;
    html += `<button type="button" class="cr-color-chip cr-color-chip--custom ${customActive ? 'active' : ''}${customLockCls}" data-kind="custom" style="--cc:${customCss};" role="radio" aria-checked="${customActive}" aria-label="${customTitle}" title="${customTitle}">
      <span class="cr-color-chip-custom-label">${customUnlocked ? 'CUSTOM' : '🔒'}</span>
    </button>`;
    customizeColorRow.innerHTML = html;
    customizeColorRow.querySelectorAll('.cr-color-chip').forEach(chip => {
      wireMenuPressFeedback(chip);
      chip.addEventListener('click', () => {
        if (getRoundState().phase === "countdown") return;
        if (chip.dataset.kind === 'custom') {
          if (state.colorMode === 'custom') {
            animateColorChipSelect(chip);
            return;
          }
          selectCustomColor();
          animateColorChipSelect(chip);
          return;
        }
        const idx = parseInt(chip.dataset.idx, 10);
        if (state.colorMode === 'preset' && idx === state.playerIdx) {
          animateColorChipSelect(chip);
          return;
        }
        selectPresetColor(idx);
        const active = customizeColorRow.querySelector('.cr-color-chip.active');
        if (active) animateColorChipSelect(active);
      });
    });
  }

  // ─── Build sunglasses chips (SUNGLASSES tab) ─────────────────────────────
  function buildSunglassesChips() {
    if (!customizeSunglassesRow) return;
    customizeSunglassesRow.setAttribute('role', 'radiogroup');
    let html = '';
    for (const style of SUNGLASSES_STYLES) {
      const isActive = state.sunglassesStyle === style.id;
      const unlocked = isSunglassesUnlocked(style.id);
      const status = getSunglassesUnlockStatus(style.id);
      const mirrorCss = previewHexToCss(style.color);
      // * Gradient stops mirror the 3D finish (hot core → cool edge); --mc stays the
      // * chip glow color. Stops are authored CSS hex strings in SUNGLASSES_STYLES.
      const g = style.gradient ?? [];
      const gradVars = `--mc-core:${g[0] ?? mirrorCss};--mc-mid:${g[1] ?? mirrorCss};--mc-edge:${g[g.length - 1] ?? mirrorCss};`;
      const title = unlocked
        ? style.label
        : `Locked — ${status.hint} (${status.progress}/${status.goal})`;
      html += `<button type="button" class="cr-sunglasses-chip ${isActive ? 'active' : ''}${unlocked ? '' : ' cr-chip--locked'}" data-sunglasses="${style.id}" role="radio" aria-checked="${isActive}" aria-label="${title}" title="${title}" style="--mc:${mirrorCss};${gradVars}">
        <span class="cr-sunglasses-chip-swatch" aria-hidden="true"></span>
        <span class="cr-sunglasses-chip-label">${unlocked ? style.label : `🔒 ${style.label}`}</span>
      </button>`;
    }
    customizeSunglassesRow.innerHTML = html;
    customizeSunglassesRow.querySelectorAll('.cr-sunglasses-chip').forEach((chip) => {
      wireMenuPressFeedback(chip);
      chip.addEventListener('click', () => {
        const styleId = chip.dataset.sunglasses;
        if (!styleId || styleId === state.sunglassesStyle) return;
        selectSunglassesStyle(styleId);
        animateColorChipSelect(chip);
      });
    });
  }

  /**
   * Applies a sunglasses style selection: persists it and rebuilds the 3D preview
   * (the mirror finish is baked into the cloned GLTF instance materials, so a full
   * rebuild is required to swap lenses).
   * @param {string} styleId
   */
  function selectSunglassesStyle(styleId) {
    if (!SUNGLASSES_STYLES.some((s) => s.id === styleId)) return;
    if (!isSunglassesUnlocked(styleId)) {
      const status = getSunglassesUnlockStatus(styleId);
      showUnlockToast(`Locked — ${status.hint} (${status.progress}/${status.goal})`);
      return;
    }
    if (state.sunglassesStyle === styleId) return;
    saveCustomization({ sunglassesStyle: styleId });
    if (cartPreview) syncCartPreviewLook(true);
  }

  // ─── Build pattern chips (PATTERN tab) ───────────────────────────────────
  /**
   * Rebuilds the wireframe-pattern picker chips. Each chip shows a mini cart drawn in the
   * active neon color so the pattern preview matches the current body color.
   */
  function buildPatternChips() {
    if (!customizePatternRow) return;
    customizePatternRow.setAttribute('role', 'radiogroup');
    const colorCss = getActiveColorCss();
    let html = '';
    for (const id of CART_PATTERN_IDS) {
      const isActive = state.pattern === id;
      const unlocked = isPatternUnlocked(id);
      const status = getPatternUnlockStatus(id);
      const meta = CART_PATTERNS[id] || { label: id, description: id };
      const title = unlocked
        ? meta.description
        : `Locked — ${status.hint} (${status.progress}/${status.goal})`;
      // * --pc is the chip's colour hook (border / glow / selected pip) — the same
      // * value the mini-cart SVG below is drawn in, so the shelf matches the preview.
      html += `<button type="button" class="cr-pattern-chip ${isActive ? 'active' : ''}${unlocked ? '' : ' cr-chip--locked'}" data-pattern="${id}" role="radio" aria-checked="${isActive}" aria-label="${meta.label}" title="${title}" style="--pc:${colorCss}">
        ${makePatternMiniCartSvg(id, colorCss)}
        <span class="cr-pattern-chip-label">${unlocked ? meta.label : `🔒 ${meta.label}`}</span>
      </button>`;
    }
    customizePatternRow.innerHTML = html;
    customizePatternRow.querySelectorAll('.cr-pattern-chip').forEach((chip) => {
      wireMenuPressFeedback(chip);
      chip.addEventListener('click', () => {
        const id = chip.dataset.pattern;
        if (!id || id === state.pattern) return;
        selectPattern(id);
        animateColorChipSelect(chip);
      });
    });
  }

  /**
   * Applies a pattern selection: persists it and refreshes the menu cart + 3D preview.
   * Pattern swaps are a uniform change on the CartFrame material, so no rebuild is needed.
   * @param {string} patternId
   */
  function selectPattern(patternId) {
    if (getRoundState().phase === "countdown" || getRoundState().phase === "running") return;
    const id = normalizePatternId(patternId);
    if (!isPatternUnlocked(id)) {
      const status = getPatternUnlockStatus(id);
      showUnlockToast(`Locked — ${status.hint} (${status.progress}/${status.goal})`);
      return;
    }
    if (id === state.pattern) return;
    saveCustomization({ pattern: id });
    buildPatternChips();
    renderCustomizePreview();
  }

  function switchCustomizeTab(tabId) {
    const tabs = document.querySelectorAll('.cr-customize-tab[data-tab]');
    const sections = document.querySelectorAll('.cr-customize-section[data-section]');
    tabs.forEach((tab) => {
      const isActive = tab.dataset.tab === tabId;
      tab.classList.toggle('active', isActive);
      tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });
    sections.forEach((section) => {
      const isActive = section.dataset.section === tabId;
      const wasHidden = section.hidden;
      section.hidden = !isActive;
      // * Quick fade-in on the newly-revealed panel — the hard hidden-flip read
      // * as an abrupt cut between BODY / PATTERN / SUNGLASSES.
      if (isActive && wasHidden && section instanceof HTMLElement) {
        animateMenuReveal(section, { duration: 200, y: 8, ease: "outQuad" });
      }
    });
    // * Freeze auto-rotation on the Sunglasses tab so the mirror finish is readable.
    if (cartPreview) {
      cartPreview.setAutoRotate(tabId !== 'sunglasses');
      cartPreview.setZoom(tabId === 'sunglasses' ? 1.35 : 1.0);
    }
  }

  /** Syncs neon color, pattern, and sunglasses style to the live 3D cart preview. */
  function syncCartPreviewLook(fullRebuild = false) {
    if (!cartPreview) return;
    cartPreview.setColor(getActiveColorHex());
    if (fullRebuild) {
      // * Sunglasses style is baked into the cloned GLTF instance, so update the field
      // * before setTheme triggers the single async rebuild (avoids a second rebuild).
      // * Theme is always "rave" now — setTheme is kept solely to trigger the rebuild.
      cartPreview.setSunglassesStyle(state.sunglassesStyle, { rebuild: false });
      cartPreview.setTheme(DEFAULT_CART_THEME);
    }
    cartPreview.setPattern(state.pattern);
  }

  /** Tears down the 3D preview and releases WebGL resources. */
  function disposeCartPreview() {
    if (!cartPreview) return;
    cartPreview.dispose();
    cartPreview = null;
    currentCustomizeCartSvg = null;
    if (customizeCartHolder) customizeCartHolder.innerHTML = '';
  }

  /**
   * Mounts the rotating 3D cart inside `#cr-customize-cart-holder`.
   * Disposes any existing instance first so rapid open/close cannot stack previews.
   */
  function mountCartPreview() {
    if (!customizeCartHolder) return;
    disposeCartPreview();
    customizeCartHolder.innerHTML = '';
    cartPreview = new CartPreview();
    cartPreview.init(customizeCartHolder);
    syncCartPreviewLook(true);
  }

  function wireCustomHueSlider() {
    if (!customHueSlider || customHueSliderWired) return;
    customHueSliderWired = true;
    customHueSlider.addEventListener('input', () => {
      onCustomHueInput(Number(customHueSlider.value), false);
    });
    customHueSlider.addEventListener('change', () => {
      onCustomHueInput(Number(customHueSlider.value), true);
    });
  }

  function renderCustomizePreview() {
    if (!customizeCartHolder) return;
    const color = getActiveColorCss();
    if (customizeCartShadow) {
      customizeCartShadow.style.background = `radial-gradient(ellipse, ${color}66, transparent 70%)`;
    }
    // * 3D preview owns the holder while customize screen is open; SVG is fallback only.
    if (cartPreview) {
      syncCartPreviewLook();
      return;
    }
    customizeCartHolder.innerHTML = makeCartSVG(color, state.pattern);
    currentCustomizeCartSvg = customizeCartHolder.querySelector('svg');
  }

  // * Focus restoration — remember which control opened an overlay so closing it
  // * returns focus there (keyboard + gamepad users keep their place).
  let _lastOverlayOpener = null;
  function captureOverlayOpener() {
    _lastOverlayOpener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  }
  function restoreOverlayFocus() {
    const opener = _lastOverlayOpener;
    _lastOverlayOpener = null;
    // * Defer so focus lands after the dismiss animation flips the screen hidden.
    if (opener && opener.isConnected) requestAnimationFrame(() => opener.focus());
  }

  function openCustomizeScreen() {
    if (!customizeScreen) return;
    const phase = getRoundState().phase;
    if (phase === "running" || phase === "countdown") return;
    captureOverlayOpener();
    wireCustomHueSlider();
    updateCustomHueUi();
    mountCartPreview();
    renderCustomizePreview();
    buildColorChips();
    buildPatternChips();
    buildSunglassesChips();
    customizeScreen.style.display = 'flex';
    customizeScreen.setAttribute('aria-hidden', 'false');
    customizeDoneBtn?.focus();
    const panel = customizeScreen.querySelector('.cr-customize-panel');
    if (panel instanceof HTMLElement) {
      animateMenuReveal(panel, {
        delay: 0,
        duration: 240,
        y: 14,
      });
    }
  }

  function closeCustomizeScreen() {
    if (!customizeScreen) return;

    // * Blur the focused element before hiding the panel to prevent
    // * "Blocked aria-hidden" accessibility warnings.
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }

    disposeCartPreview();
    // * Persist final customization state when leaving Customize.
    saveCustomization({
      colorMode: state.colorMode === 'custom' ? 'custom' : 'preset',
      color: state.colorMode === 'custom'
        ? CUSTOM_COLOR_ID
        : (PALETTE_GAME[state.playerIdx] || PALETTE_GAME[0]),
      customHue: state.customHue,
      pattern: state.pattern,
      sunglassesStyle: state.sunglassesStyle,
    });
    customizeScreen.setAttribute('aria-hidden', 'true');
    const panel = customizeScreen.querySelector('.cr-customize-panel');
    animateMenuDismiss(panel instanceof HTMLElement ? panel : null, {
      container: customizeScreen,
      abortIf: () => customizeScreen.getAttribute('aria-hidden') === 'false',
    });
    applyPalette();
    restoreOverlayFocus();
  }

  function initCustomizeScreen() {
    wireCustomHueSlider();
    document.querySelectorAll('.cr-customize-tab[data-tab]').forEach((tab) => {
      wireMenuPressFeedback(tab);
      tab.addEventListener('click', () => {
        if (tab instanceof HTMLButtonElement && tab.disabled) return;
        switchCustomizeTab(tab.dataset.tab || 'body');
      });
    });
    customizeDoneBtn?.addEventListener('click', closeCustomizeScreen);
    customizeBackBtn?.addEventListener('click', closeCustomizeScreen);
    document.querySelectorAll('.cr-btn[data-action="customize"]').forEach((btn) => {
      wireMenuPressFeedback(btn);
    });
    wireMenuPressFeedback(customizeDoneBtn);
    wireMenuPressFeedback(customizeBackBtn);
  }

  /**
   * Closes whichever overlay screen is currently visible.
   * Priority: How To Play → Challenges → Settings → Customize.
   * @returns {boolean} True if an overlay was closed.
   */
  function closeActiveOverlay() {
    if (howtoScreen?.style.display === 'flex') {
      closeHowToScreen({ userDismissed: true });
      return true;
    }
    if (challengesScreen?.style.display === 'flex') {
      closeChallengesScreen();
      return true;
    }
    if (settingsScreen?.style.display === 'flex') {
      closeSettingsScreen();
      return true;
    }
    if (customizeScreen?.style.display === 'flex') {
      closeCustomizeScreen();
      return true;
    }
    return false;
  }

  // ─── How To Play overlay screen ────────────────────────────────────────────

  /**
   * ONBOARD-SLIDES-1: per-input-mode controls for AISLE 1. WASD/SHIFT/SPACE is simply
   * wrong copy on a phone, and this overlay is the first thing a first-run player sees —
   * so the chips rematch the live device off the same setInputMode signal the Settings
   * controls table already uses, not a poll.
   * @type {Record<'keyboard'|'gamepad'|'touch', Array<{ keys: string[], wide?: boolean, label: string }>>}
   */
  const HOWTO_CONTROLS = {
    keyboard: [
      { keys: ["W", "A", "S", "D"], label: "MOVE" },
      { keys: ["SHIFT"], wide: true, label: "BOOST" },
      { keys: ["SPACE"], wide: true, label: "HOP" },
      { keys: ["M"], label: "MUTE" },
      { keys: ["ESC"], label: "MENU" },
    ],
    gamepad: [
      { keys: ["L STICK"], wide: true, label: "MOVE" },
      { keys: ["RT"], label: "BOOST" },
      { keys: ["A"], label: "HOP" },
      { keys: ["B"], label: "BACK" },
      { keys: ["START"], wide: true, label: "MENU" },
    ],
    touch: [
      { keys: ["STICK"], wide: true, label: "DRAG TO STEER" },
      { keys: ["BOOST"], wide: true, label: "HOLD TO CHARGE" },
      { keys: ["HOP"], wide: true, label: "TAP" },
    ],
  };

  /** @param {'keyboard'|'gamepad'|'touch'} [mode] */
  function renderHowToControls(mode = getInputMode()) {
    if (!howtoControlsEl) return;
    const rows = HOWTO_CONTROLS[mode] ?? HOWTO_CONTROLS.keyboard;
    howtoControlsEl.replaceChildren(
      ...rows.map((row) => {
        const chip = document.createElement("span");
        chip.className = "cr-howto-ctl";
        chip.setAttribute("role", "listitem");
        const keys = document.createElement("span");
        keys.className = "cr-howto-keys";
        for (const k of row.keys) {
          const kbd = document.createElement("kbd");
          if (row.wide) kbd.className = "wide";
          kbd.textContent = k;
          keys.appendChild(kbd);
        }
        const label = document.createElement("span");
        label.className = "cr-howto-ctl-lbl";
        label.textContent = row.label;
        chip.append(keys, label);
        return chip;
      }),
    );
    // * "PLUG & PLAY" is noise to someone already holding a pad, and nonsense on touch.
    if (howtoPadEl) howtoPadEl.hidden = mode !== "keyboard";
  }

  /** @type {HTMLElement[]} AISLE slides, in order. Populated by initHowToScreen(). */
  let howtoSlides = [];
  /** @type {HTMLElement[]} */
  let howtoDots = [];
  let howtoSlideIndex = 0;

  // ONBOARD-ART-1 — drop-in art. Every `<token>.webp` in src/assets/howto/ turns its
  // slot on at build time (glob = real detection, not a hand-maintained list);
  // `<token>.still.webp` is the reduced-motion swap. The glob is token-constrained
  // so a stray file dropped beside the contract can never enter the bundle.
  // Full contract: src/assets/howto/README.md
  const HOWTO_ART_FILES = import.meta.glob(
    "./assets/howto/{drive,boost,ram,hud,cargo}.{webp,still.webp}",
    { eager: true, query: "?url", import: "default" },
  );

  /** @type {Map<string, { motion: string | null, still: string | null }>} */
  const howtoArt = new Map();
  for (const [file, url] of Object.entries(HOWTO_ART_FILES)) {
    const base = file.split("/").pop();
    const isStill = base.endsWith(".still.webp");
    const token = base.replace(/\.still\.webp$/, "").replace(/\.webp$/, "");
    const entry = howtoArt.get(token) ?? { motion: null, still: null };
    if (isStill) entry.still = url;
    else entry.motion = url;
    howtoArt.set(token, entry);
  }

  /**
   * Shows slide `idx` and re-dresses the pager chrome around it.
   *
   * The primary button MORPHS rather than sitting beside a separate NEXT: it is the
   * focused control on open, so if it closed the overlay the first-run happy path would
   * be "see 1 of 5 rules, then never be asked again" (`howtoSeen` is stamped on open —
   * see ONBOARD-FLAG-1 below). Pressing it repeatedly now walks the whole deck.
   * @param {number} idx
   * @param {{ animate?: boolean }} [opts]
   */
  function showHowToSlide(idx, opts) {
    if (!howtoSlides.length) return;
    const clamped = Math.max(0, Math.min(howtoSlides.length - 1, idx));
    howtoSlideIndex = clamped;
    const last = clamped === howtoSlides.length - 1;
    howtoSlides.forEach((slide, i) => { slide.hidden = i !== clamped; });
    howtoDots.forEach((dot, i) => { dot.classList.toggle("is-on", i === clamped); });
    if (howtoPosEl) howtoPosEl.textContent = `${clamped + 1}/${howtoSlides.length}`;
    // * No wrap-around: this is a tutorial, and a 5 -> 1 jump reads as "there is more".
    if (howtoPrevBtn instanceof HTMLButtonElement) howtoPrevBtn.disabled = clamped === 0;
    if (howtoNextBtn instanceof HTMLButtonElement) howtoNextBtn.disabled = last;
    const label = howtoDoneBtn?.querySelector(".cr-screen-btn-label");
    if (label) label.textContent = last ? "LET'S ROLL" : "NEXT ▸";
    if (opts?.animate !== false) {
      const shown = howtoSlides[clamped];
      if (shown) animateMenuReveal(shown, { duration: 200, y: 8, ease: "outQuad" });
    }
  }

  /** @param {number} dir */
  function pageHowTo(dir) {
    showHowToSlide(howtoSlideIndex + dir);
  }

  function openHowToScreen() {
    if (!howtoScreen) return;
    const phase = getRoundState().phase;
    if (phase === "running" || phase === "countdown") return;
    clearHowToAttract();
    captureOverlayOpener();
    // * ONBOARD-FLAG-1: mark first-run onboarding seen HERE — the overlay is now committed to
    // * showing. It used to be written when the auto-open was merely ARMED, which meant any
    // * disarm inside the 600ms window (an early SOLO click, an invite URL, or this very
    // * function bailing on the phase guard above) consumed a player's only tutorial without
    // * ever rendering it: flag set, overlay never seen, and no way back short of clearing
    // * site data. Placement after both early returns is the whole fix — a write above them
    // * reintroduces the bug for the mid-round case.
    // * Manual opens (the HOW TO PLAY button, the openHowTo() API) mark it too, which is what
    // * a flag named `howtoSeen` should mean, and stops nagging a player who already read it.
    storageSet(STORAGE_KEYS.howtoSeen, "1");
    howtoScreen.style.display = 'flex';
    howtoScreen.setAttribute('aria-hidden', 'false');
    // * Always reopen on AISLE 1 — a player who left on slide 4 last time is not
    // * resuming a session, they are asking to be taught again from the top.
    renderHowToControls();
    showHowToSlide(0, { animate: false });
    howtoDoneBtn?.focus();
    const panel = howtoScreen.querySelector('.cr-howto-panel');
    if (panel instanceof HTMLElement) {
      animateMenuReveal(panel, {
        delay: 0,
        duration: 240,
        y: 14,
      });
    }
  }

  /**
   * @param {{ userDismissed?: boolean }} [opts] Pass `userDismissed: true` for
   *   explicit closes (DONE/BACK/Escape/round start) so the first-run auto-open
   *   stands down; internal closes from show() keep it armed (boot calls show()
   *   twice: initMenu, then the boot-splash dismiss in loadingScreen.js).
   */
  function closeHowToScreen(opts) {
    if (!howtoScreen) return;
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    howtoScreen.setAttribute('aria-hidden', 'true');
    const panel = howtoScreen.querySelector('.cr-howto-panel');
    animateMenuDismiss(panel instanceof HTMLElement ? panel : null, {
      container: howtoScreen,
      abortIf: () => howtoScreen.getAttribute('aria-hidden') === 'false',
    });
    // * Only restore focus on explicit user closes — the boot-time internal
    // * closes from show() should not yank focus around.
    if (opts?.userDismissed) restoreOverlayFocus();
  }

  /**
   * Hydrates the HOW TO PLAY art slots from the drop-in directory. Runs once at
   * initHowToScreen(), NOT per slide — the two-column layout has to be stable
   * before the overlay is ever shown so nothing reflows under animateMenuReveal.
   * A slot with no file behind its token keeps no data-art and stays CSS-hidden:
   * that is the "no empty frame, no broken-image icon, ever" guarantee.
   */
  function hydrateHowToArt() {
    if (!howtoScreen) return;
    const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
    for (const slot of howtoScreen.querySelectorAll(".cr-howto-slide-media[data-media]")) {
      const art = howtoArt.get(slot.dataset.media);
      if (!art) continue;
      const src = reducedMotion && art.still ? art.still : (art.motion ?? art.still);
      if (!src) continue;
      const img = document.createElement("img");
      img.src = src;
      // Decorative by contract: the slot is aria-hidden, and AISLE 4's chip row is
      // the accessible equivalent of the HUD callouts.
      img.alt = "";
      img.decoding = "async";
      // lazy inside a display:none overlay means nothing fetches during menu boot.
      img.loading = "lazy";
      img.draggable = false;
      slot.append(img);
      slot.dataset.art = "1";
    }
  }

  function initHowToScreen() {
    howtoSlides = Array.from(howtoScreen?.querySelectorAll(".cr-howto-slide") ?? []);
    howtoDots = Array.from(howtoScreen?.querySelectorAll(".cr-howto-dot") ?? []);
    // * The primary is slide-aware, NOT an unconditional close — see showHowToSlide().
    // * Wiring a close here as well would make a NEXT click page AND dismiss.
    howtoDoneBtn?.addEventListener('click', () => {
      if (howtoSlideIndex < howtoSlides.length - 1) pageHowTo(1);
      else closeHowToScreen({ userDismissed: true });
    });
    howtoPrevBtn?.addEventListener('click', () => pageHowTo(-1));
    howtoNextBtn?.addEventListener('click', () => pageHowTo(1));
    howtoBackBtn?.addEventListener('click', () => closeHowToScreen({ userDismissed: true }));
    wireMenuPressFeedback(howtoDoneBtn);
    wireMenuPressFeedback(howtoBackBtn);
    wireMenuPressFeedback(howtoPrevBtn);
    wireMenuPressFeedback(howtoNextBtn);
    hydrateHowToArt();
    renderHowToControls();
    showHowToSlide(0, { animate: false });
    // * Live-rematch the Settings controls panel and the HOW TO PLAY controls chips when
    // * keyboard / gamepad / touch becomes active — same setInputMode signal, not a poll.
    onInputModeChange((mode) => {
      if (settingsScreen?.style.display === "flex") updateSettingsControlsUI();
      if (howtoScreen?.style.display === "flex") renderHowToControls(mode);
    });
  }

  /**
   * First-run onboarding: attract toward HOW TO PLAY without interrupting the menu.
   * Re-evaluate on every menu presentation: invite/rejoin URLs never attract, while
   * a quit-to-menu presentation can attract once its room param has been stripped.
   *
   * ONBOARD-FLAG-1: attracting deliberately writes NOTHING. `howtoSeen` is stamped
   * only by openHowToScreen() once the overlay is actually committed to showing.
   */
  function applyHowToAttract() {
    const roomParam = new URLSearchParams(window.location.search || "").get("room");
    const shouldAttract = !storageGet(STORAGE_KEYS.howtoSeen) && !roomParam;
    howtoMenuBtn?.classList.toggle("cr-cmd--howto-attract", shouldAttract);
    if (shouldAttract) animateHowToAttract(howtoMenuLabel);
    else stopHowToAttract(howtoMenuLabel);
  }

  function clearHowToAttract() {
    stopHowToAttract(howtoMenuLabel);
    howtoMenuBtn?.classList.remove("cr-cmd--howto-attract");
  }

  // ─── Challenges overlay screen ─────────────────────────────────────────────

  /** True once the player has opened the CHALLENGES screen this session. */
  let _challengesViewed = false;

  /**
   * Badges the CHALLENGES menu button: "✓N" once N ≥ 1 are complete (a progress
   * reward), or a "NEW" attention cue when there are active objectives the player
   * hasn't looked at yet — so first-timers discover the feature instead of only
   * being rewarded after they've already found it.
   */
  function updateChallengesBadge() {
    // * Renders into the command row's own pill (3a): it is a flow child of the
    // * skewed row and counter-skewed in CSS. The retired chip this replaced was
    // * absolutely positioned with no counter-skew, so it rode the row slanted.
    const pill = $("cr-cmd-new-pill");
    if (!(pill instanceof HTMLElement)) return;
    const cState = challengeStore.getState();
    const all = [...cState.dailyChallenges, ...cState.weeklyChallenges];
    const completed = all.filter((c) => c.isComplete).length;
    const showNew = completed < 1 && all.length > 0 && !_challengesViewed;
    if (completed < 1 && !showNew) {
      pill.hidden = true;
      return;
    }
    pill.hidden = false;
    pill.textContent = completed >= 1 ? `✓${completed}` : "NEW";
    pill.classList.toggle("cr-cmd-new--done", completed >= 1);
  }

  function openChallengesScreen() {
    if (!challengesScreen) return;
    const phase = getRoundState().phase;
    if (phase === "running" || phase === "countdown") return;
    renderChallengesPanel();
    // * Viewing the screen retires the first-timer "NEW" cue (progress ✓N still shows).
    _challengesViewed = true;
    updateChallengesBadge();
    captureOverlayOpener();
    challengesScreen.style.display = 'flex';
    challengesScreen.setAttribute('aria-hidden', 'false');
    challengesDoneBtn?.focus();
    const panel = challengesScreen.querySelector('.cr-challenges-panel');
    if (panel instanceof HTMLElement) {
      animateMenuReveal(panel, {
        delay: 0,
        duration: 240,
        y: 14,
      });
    }
  }

  function closeChallengesScreen() {
    if (!challengesScreen) return;
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    challengesScreen.setAttribute('aria-hidden', 'true');
    const panel = challengesScreen.querySelector('.cr-challenges-panel');
    animateMenuDismiss(panel instanceof HTMLElement ? panel : null, {
      container: challengesScreen,
      abortIf: () => challengesScreen.getAttribute('aria-hidden') === 'false',
    });
    updateChallengesBadge();
    restoreOverlayFocus();
  }

  function initChallengesScreen() {
    challengesDoneBtn?.addEventListener('click', closeChallengesScreen);
    challengesBackBtn?.addEventListener('click', closeChallengesScreen);
    wireMenuPressFeedback(challengesDoneBtn);
    wireMenuPressFeedback(challengesBackBtn);
  }

  // ─── Settings overlay screen ───────────────────────────────────────────────

  function openSettingsScreen() {
    if (!settingsScreen) return;
    const phase = getRoundState().phase;
    if (phase === "running" || phase === "countdown") return;
    syncSettingsAudioUi();
    updateSettingsControlsUI();
    captureOverlayOpener();
    settingsScreen.style.display = 'flex';
    settingsScreen.setAttribute('aria-hidden', 'false');
    settingsDoneBtn?.focus();
    const panel = settingsScreen.querySelector('.cr-settings-panel');
    if (panel instanceof HTMLElement) {
      animateMenuReveal(panel, {
        delay: 0,
        duration: 240,
        y: 14,
      });
    }
  }

  function closeSettingsScreen() {
    if (!settingsScreen) return;
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    settingsScreen.setAttribute('aria-hidden', 'true');
    const panel = settingsScreen.querySelector('.cr-settings-panel');
    animateMenuDismiss(panel instanceof HTMLElement ? panel : null, {
      container: settingsScreen,
      abortIf: () => settingsScreen.getAttribute('aria-hidden') === 'false',
    });
    restoreOverlayFocus();
  }

  let settingsAudioUiMuted = false;
  /**
   * Cached audio state from the last {@link syncAudioUi} call.
   * Used as fallback when syncSettingsAudioUi runs without params (e.g. on Settings open).
   * @type {{ muted: boolean, musicPct: number, musicNorm?: number, sfxPct?: number, sfxNorm?: number, voicePct?: number, voiceNorm?: number } | null}
   */
  let _lastSettingsAudioSync = null;

  /**
   * Syncs Settings overlay mute button and volume displays (music + SFX + voice)
   * from main-owned audio state.
   * @param {{ muted: boolean, musicPct: number, musicNorm?: number, sfxPct?: number, sfxNorm?: number, voicePct?: number, voiceNorm?: number }} [audio]
   */
  function syncSettingsAudioUi(audio) {
    // * Cache the last explicit sync so openSettingsScreen() can reuse it.
    if (audio) _lastSettingsAudioSync = audio;
    const src = audio || _lastSettingsAudioSync;
    const muted = src ? src.muted : audioUiMuted;
    const pct = src ? src.musicPct : 25;
    const norm = src ? (src.musicNorm ?? (src.muted ? 0 : src.musicPct / 100)) : 0.25;
    const sfxPct = src ? (src.sfxPct ?? 25) : 25;
    const sfxNorm = src ? (src.sfxNorm ?? (src.muted ? 0 : sfxPct / 100)) : 0.25;
    const voicePct = src ? (src.voicePct ?? 25) : 25;
    const voiceNorm = src ? (src.voiceNorm ?? (src.muted ? 0 : voicePct / 100)) : 0.25;
    settingsAudioUiMuted = muted;
    if (settingsVolFill) {
      settingsVolFill.style.setProperty('--vol-scale', String(muted ? 0 : norm));
      settingsVolFill.closest('.cr-vol-row')?.style.setProperty('--vol-accent', state.palette.primary);
      settingsVolTrackEl?.style.setProperty('--vol-scale', String(muted ? 0 : norm));
      // * Flat printed fill (slab material — no gradient/glow). MUSIC rides the
      // * palette primary (brand/magenta), SFX the secondary (support/cyan), so the
      // * two rows read apart while still morphing with the arena palette.
      settingsVolFill.style.background = state.palette.primary;
    }
    if (settingsVolVal) settingsVolVal.textContent = String(muted ? 'OFF' : pct);
    if (settingsSfxFill) {
      settingsSfxFill.style.setProperty('--vol-scale', String(muted ? 0 : sfxNorm));
      settingsSfxFill.closest('.cr-vol-row')?.style.setProperty('--vol-accent', state.palette.secondary);
      settingsSfxTrackEl?.style.setProperty('--vol-scale', String(muted ? 0 : sfxNorm));
      settingsSfxFill.style.background = state.palette.secondary;
    }
    if (settingsSfxVal) settingsSfxVal.textContent = String(muted ? 'OFF' : sfxPct);
    // * VOICE rides the palette tertiary so all three rows stay distinct while
    // * still morphing with the arena palette.
    if (settingsVoiceFill) {
      settingsVoiceFill.style.setProperty('--vol-scale', String(muted ? 0 : voiceNorm));
      settingsVoiceFill.closest('.cr-vol-row')?.style.setProperty('--vol-accent', state.palette.tertiary);
      settingsVoiceTrackEl?.style.setProperty('--vol-scale', String(muted ? 0 : voiceNorm));
      settingsVoiceFill.style.background = state.palette.tertiary;
    }
    if (settingsVoiceVal) settingsVoiceVal.textContent = String(muted ? 'OFF' : voicePct);
    // * aria-valuenow is 0 while muted (screen reader: "off"). data-vol-pct keeps the
    // * real stored level so ←/→ keyboard steps climb from that value, not from 0.
    settingsVolTrackEl?.setAttribute('aria-valuenow', String(muted ? 0 : pct));
    settingsVolTrackEl?.setAttribute('data-vol-pct', String(pct));
    settingsSfxTrackEl?.setAttribute('aria-valuenow', String(muted ? 0 : sfxPct));
    settingsSfxTrackEl?.setAttribute('data-vol-pct', String(sfxPct));
    settingsVoiceTrackEl?.setAttribute('aria-valuenow', String(muted ? 0 : voicePct));
    settingsVoiceTrackEl?.setAttribute('data-vol-pct', String(voicePct));
    if (!settingsMuteBtn) return;
    if (muted) {
      settingsMuteBtn.classList.add('muted');
      settingsMuteBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M11 5 6 9H3v6h3l5 4z"/>
        <line x1="22" y1="9" x2="16" y2="15"/>
        <line x1="16" y1="9" x2="22" y2="15"/>
      </svg><span class="cr-mute-state">ON</span>`;
    } else {
      settingsMuteBtn.classList.remove('muted');
      settingsMuteBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M11 5 6 9H3v6h3l5 4z"/>
        <path d="M15.5 8.5a5 5 0 0 1 0 7"/>
        <path d="M18.5 5.5a9 9 0 0 1 0 13"/>
      </svg><span class="cr-mute-state">OFF</span>`;
    }
  }

  /**
   * Renders the controls table inside the Settings overlay based on current input mode.
   * Mirrors the main-menu updateControlsPanelUI but targets #cr-settings-controls.
   */
  function updateSettingsControlsUI() {
    const panel = document.getElementById("cr-settings-controls");
    const header = document.getElementById("cr-settings-ctl-hd");
    if (!panel) return;

    const mode = getInputMode();
    const p = state.palette;
    const cMove = p.secondary || "#22e6ff";
    const cBoost = p.tertiary || "#ffe53d";
    const cHop = p.primary || "#ff2bd6";
    const cMute = p.players?.[2] || "#2bff7a";
    const cMenu = p.players?.[4] || "#ff7a1a";

    if (header) {
      const badge = mode === "gamepad" ? "GAMEPAD" : mode === "touch" ? "TOUCH" : "KEYBOARD";
      // * No ◇ prefix — card headers on the 7c screen are plain (AUDIO / GRAPHICS).
      header.innerHTML = `CONTROLS <span class="cr-settings-ctl-badge">${badge}</span>`;
    }

    if (mode === "gamepad") {
      panel.innerHTML = `
        <div class="cr-settings-ctl-row">
          <span class="cr-settings-ctl-key" style="--kc:${cMove}"><kbd class="wide">L-STICK</kbd><kbd>D-PAD</kbd></span>
          <span class="cr-settings-ctl-lbl">Steer</span>
        </div>
        <div class="cr-settings-ctl-row">
          <span class="cr-settings-ctl-key" style="--kc:${cBoost}"><kbd>A</kbd><kbd>LT</kbd></span>
          <span class="cr-settings-ctl-lbl">Boost</span>
        </div>
        <div class="cr-settings-ctl-row">
          <span class="cr-settings-ctl-key" style="--kc:${cHop}"><kbd>B</kbd><kbd>RT</kbd></span>
          <span class="cr-settings-ctl-lbl">Hop</span>
        </div>
        <div class="cr-settings-ctl-row">
          <span class="cr-settings-ctl-key" style="--kc:${cMute}"><kbd class="wide">SELECT</kbd></span>
          <span class="cr-settings-ctl-lbl">Mute</span>
        </div>
        <div class="cr-settings-ctl-row">
          <span class="cr-settings-ctl-key" style="--kc:${cMenu}"><kbd class="wide">START</kbd></span>
          <span class="cr-settings-ctl-lbl">Menu</span>
        </div>
      `;
    } else if (mode === "touch") {
      panel.innerHTML = `
        <div class="cr-settings-ctl-row">
          <span class="cr-settings-ctl-key" style="--kc:${cMove}"><kbd class="wide">JOYSTICK</kbd></span>
          <span class="cr-settings-ctl-lbl">Steer</span>
        </div>
        <div class="cr-settings-ctl-row">
          <span class="cr-settings-ctl-key" style="--kc:${cBoost}"><kbd class="wide">BOOST</kbd></span>
          <span class="cr-settings-ctl-lbl">Boost</span>
        </div>
        <div class="cr-settings-ctl-row">
          <span class="cr-settings-ctl-key" style="--kc:${cHop}"><kbd class="wide">HOP</kbd></span>
          <span class="cr-settings-ctl-lbl">Hop</span>
        </div>
        <div class="cr-settings-ctl-row">
          <span class="cr-settings-ctl-key" style="--kc:${cMenu}"><kbd class="wide">MENU</kbd></span>
          <span class="cr-settings-ctl-lbl">Menu</span>
        </div>
      `;
    } else {
      panel.innerHTML = `
        <div class="cr-settings-ctl-row">
          <span class="cr-settings-ctl-key" style="--kc:${cMove}"><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></span>
          <span class="cr-settings-ctl-lbl">Move</span>
        </div>
        <div class="cr-settings-ctl-row">
          <span class="cr-settings-ctl-key" style="--kc:${cBoost}"><kbd class="wide">SHIFT</kbd></span>
          <span class="cr-settings-ctl-lbl">Boost</span>
        </div>
        <div class="cr-settings-ctl-row">
          <span class="cr-settings-ctl-key" style="--kc:${cHop}"><kbd class="wide">SPACE</kbd></span>
          <span class="cr-settings-ctl-lbl">Hop</span>
        </div>
        <div class="cr-settings-ctl-row">
          <span class="cr-settings-ctl-key" style="--kc:${cMute}"><kbd>M</kbd></span>
          <span class="cr-settings-ctl-lbl">Mute</span>
        </div>
        <div class="cr-settings-ctl-row">
          <span class="cr-settings-ctl-key" style="--kc:${cMenu}"><kbd>ESC</kbd></span>
          <span class="cr-settings-ctl-lbl">Menu</span>
        </div>
      `;
    }
  }

  function initSettingsScreen() {
    settingsDoneBtn?.addEventListener('click', closeSettingsScreen);
    settingsBackBtn?.addEventListener('click', closeSettingsScreen);
    wireMenuPressFeedback(settingsDoneBtn);
    wireMenuPressFeedback(settingsBackBtn);
    if (settingsMuteBtn) {
      settingsMuteBtn.addEventListener('click', () => {
        // * Toggle mute via the shared audio controls module.
        const mainMuteBtn = document.getElementById('cr-mute-btn');
        if (mainMuteBtn) {
          mainMuteBtn.click();
        }
      });
    }
    // * Proxy the volume track clicks so the position calculation works on each rect.
    // * All three rows share one handler; only the setter differs (music / SFX / voice).
    wireSettingsVolTrack(settingsVolTrackEl, setMusicGainValue);
    wireSettingsVolTrack(settingsSfxTrackEl, setSfxSliderVolume);
    wireSettingsVolTrack(settingsVoiceTrackEl, setVoiceSliderVolume);
  }

  /**
   * Wires one Settings volume track: press-and-drag anywhere along the track →
   * normalized gain, plus ←/→ keyboard steps for the slider role.
   * @param {HTMLElement | null} track
   * @param {(v: number) => void} setValue
   */
  function wireSettingsVolTrack(track, setValue) {
    if (!track) return;
    const applyRatio = (ratio) => {
      const clamped = Math.max(0, Math.min(1, ratio));
      setValue(Math.round(clamped * AUDIO_VOLUME_MAX * 100) / 100);
    };
    const applyFromEvent = (clientX) => {
      const rect = track.getBoundingClientRect();
      if (!rect.width) return;
      applyRatio((clientX - rect.left) / rect.width);
    };
    // * Drag state is an explicit id rather than hasPointerCapture(): capture is a
    // * best-effort nicety (it keeps tracking once the cursor leaves the 8px
    // * track) and setPointerCapture throws for any pointer the browser isn't
    // * already tracking — which must not take the value update down with it.
    /** @type {number | null} */
    let dragPointerId = null;
    track.addEventListener('pointerdown', (e) => {
      if (e.button != null && e.button !== 0) return;
      e.preventDefault();
      dragPointerId = e.pointerId;
      applyFromEvent(e.clientX);
      try { track.setPointerCapture?.(e.pointerId); } catch { /* no captured pointer — drag still works */ }
    });
    track.addEventListener('pointermove', (e) => {
      if (dragPointerId !== e.pointerId) return;
      applyFromEvent(e.clientX);
    });
    const endDrag = (e) => {
      if (dragPointerId !== e.pointerId) return;
      dragPointerId = null;
      try { track.releasePointerCapture?.(e.pointerId); } catch { /* never captured */ }
    };
    track.addEventListener('pointerup', endDrag);
    track.addEventListener('pointercancel', endDrag);
    track.addEventListener('keydown', (e) => {
      const step = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 0.05
        : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -0.05
        : 0;
      if (!step) return;
      e.preventDefault();
      // * Prefer data-vol-pct (real stored level) over aria-valuenow, which is 0 while muted.
      const cur = Number(
        track.getAttribute('data-vol-pct') || track.getAttribute('aria-valuenow') || 0,
      ) / 100;
      applyRatio(cur + step);
    });
  }

  // sRGB hex -> OKLCH {L, C, H(deg)}. Drives the registered --wash-* props so
  // the backdrop cross-fades in OKLCH on arena switch (tokens.css @property +
  // .cr-root transition). Björn Ottosson's sRGB→OKLab.
  function hexToOklch(hex) {
    const h = hex.replace('#', '');
    const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
    const r = lin(parseInt(h.slice(0, 2), 16));
    const g = lin(parseInt(h.slice(2, 4), 16));
    const b = lin(parseInt(h.slice(4, 6), 16));
    const l_ = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m_ = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s_ = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    const L = 0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_;
    const A = 1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_;
    const B = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_;
    let H = Math.atan2(B, A) * 180 / Math.PI;
    if (H < 0) H += 360;
    return { L, C: Math.sqrt(A * A + B * B), H };
  }

  // Set a registered hue prop to the equivalent angle nearest its current
  // value, so the CSS transition sweeps the SHORT arc (no long rainbow smear).
  function setHueShortArc(el, prop, targetHue) {
    const cur = parseFloat(getComputedStyle(el).getPropertyValue(prop));
    let t = targetHue;
    if (Number.isFinite(cur)) {
      while (t - cur > 180) t -= 360;
      while (t - cur < -180) t += 360;
    }
    el.style.setProperty(prop, t.toFixed(1));
  }

  // ─── Apply palette to all CSS vars / floor / title / buttons ──────────────
  /**
   * Propagates the active palette and player color to CSS custom properties,
   * stat colors, mode buttons, audio widget, and control key hints.
   */
  function applyPalette() {
    const p = state.palette;
    const pc = getActiveColorCss();

    // * Backdrop lives on .cr-root::before (attract mode fades it) — drive the
    // * palette colors through custom props instead of an inline background.
    // * --menu-glow1/2 tint the gradient's neon washes per arena.
    root.style.setProperty('--menu-bg', p.bg);
    root.style.setProperty('--menu-glow1', p.primary);
    root.style.setProperty('--menu-glow2', p.secondary);

    // Arena-switch OKLCH backdrop morph — hand the palette's wash colors to the
    // registered @property vars; .cr-root transitions them so the neon washes
    // cross-fade (L+C+H) instead of hard-snapping on arena change.
    const wa = hexToOklch(p.primary);
    const wb = hexToOklch(p.secondary);
    root.style.setProperty('--wash-a-l', wa.L.toFixed(3));
    root.style.setProperty('--wash-a-c', wa.C.toFixed(3));
    setHueShortArc(root, '--wash-a-h', wa.H);
    root.style.setProperty('--wash-b-l', wb.L.toFixed(3));
    root.style.setProperty('--wash-b-c', wb.C.toFixed(3));
    setHueShortArc(root, '--wash-b-h', wb.H);
    setHueShortArc(root, '--hue', wa.H);

    titleEl.style.setProperty('--t1', p.primary);
    titleEl.style.setProperty('--t2', p.secondary);
    titleEl.style.setProperty('--t3', p.tertiary);

    playerCard.style.setProperty('--pc', pc);
    nameDisplay.style.color = pc;
    nameInput.style.color = pc;
    nameInput.style.borderColor = pc;

    // Stat colors
    document.getElementById('stat-wins').style.color = p.primary;
    document.getElementById('stat-played').style.color = p.secondary;
    document.getElementById('stat-pts').style.color = p.tertiary;

    const resolveGlow = (key) => (
      key === 'primary' ? p.primary
      : key === 'secondary' ? p.secondary
      : key === 'tertiary' ? p.tertiary
      : key === 'p2' ? p.players[2]
      : p.primary
    );

    // Buttons
    document.querySelectorAll('.cr-btn').forEach(btn => {
      btn.style.setProperty('--glow', String(resolveGlow(btn.dataset.colorkey)));
    });

    // Level cards
    document.querySelectorAll('.cr-level-btn:not(.cr-level-btn--disabled)').forEach(btn => {
      btn.style.setProperty('--glow', String(resolveGlow(btn.dataset.colorkey)));
    });

    // Bot difficulty cards
    document.querySelectorAll('.cr-diff-btn').forEach(btn => {
      btn.style.setProperty('--glow', String(resolveGlow(btn.dataset.colorkey)));
    });

    // Audio widget
    audioEl.style.setProperty('--ag', p.secondary);
    if (!audioUiMuted) {
      muteBtn.style.setProperty('--mc', p.secondary);
      musicVolFill.style.background = p.secondary;
    }
    // * Settings overlay: MUSIC = primary, SFX = secondary, VOICE = tertiary
    // * (must match syncSettingsAudioUi). Do not paint fills the same accent —
    // * that collapses the rows into one color.
    if (settingsVolFill) {
      settingsVolFill.style.background = p.primary;
      settingsVolFill.closest('.cr-vol-row')?.style.setProperty('--vol-accent', p.primary);
    }
    if (settingsSfxFill) {
      settingsSfxFill.style.background = p.secondary;
      settingsSfxFill.closest('.cr-vol-row')?.style.setProperty('--vol-accent', p.secondary);
    }
    if (settingsVoiceFill) {
      settingsVoiceFill.style.background = p.tertiary;
      settingsVoiceFill.closest('.cr-vol-row')?.style.setProperty('--vol-accent', p.tertiary);
    }

    // Controls kbd colors
    updateControlsPanelUI(undefined, p);
  }

  // ─── Name editing ─────────────────────────────────────────────────────────
  function startNameEdit() {
    nameInput.value = state.name;
    nameInput.style.display = '';
    nameDisplay.style.display = 'none';
    nameInput.focus();
    nameInput.select();
  }

  function finishNameEdit() {
    state.name = (nameInput.value || '').trim().slice(0, CONFIG.nameMaxLength) || state.name;
    storageSet(STORAGE_KEYS.username, state.name);
    nameText.textContent = state.name;
    nameInput.style.display = 'none';
    nameDisplay.style.display = '';
  }

  nameDisplay.addEventListener('click', startNameEdit);
  $("cr-name-edit")?.addEventListener('click', startNameEdit);
  nameInput.addEventListener('blur', finishNameEdit);
  nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') finishNameEdit();
  });
  rerollBtn.addEventListener('click', () => {
    state.name = rollHandle();
    storageSet(STORAGE_KEYS.username, state.name);
    nameText.textContent = state.name;
    animateRerollSpin(rerollBtn);
  });

  let audioUiMuted = false;

  // ─── Mute / volume (view only — main.js owns audio state) ─────────────────
  /**
   * Syncs menu mute button and music slider from main-owned audio state.
   * @param {{ muted: boolean, musicPct: number, musicNorm?: number, sfxPct?: number, sfxNorm?: number, voicePct?: number, voiceNorm?: number }} audio
   */
  function syncAudioUi({ muted, musicPct, musicNorm, sfxPct, sfxNorm, voicePct, voiceNorm }) {
    audioUiMuted = Boolean(muted);
    const scale = muted ? 0 : (musicNorm ?? musicPct / 100);
    if (musicVolFill) musicVolFill.style.setProperty('--vol-scale', String(scale));
    if (musicVolVal) musicVolVal.textContent = String(muted ? 'OFF' : musicPct);
    // * Always sync the Settings overlay, even if the main-menu muteBtn is missing.
    syncSettingsAudioUi({ muted, musicPct, musicNorm, sfxPct, sfxNorm, voicePct, voiceNorm });
    if (!muteBtn) return;
    if (muted) {
      muteBtn.classList.add('muted');
      muteBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M11 5 6 9H3v6h3l5 4z"/>
        <line x1="22" y1="9" x2="16" y2="15"/>
        <line x1="16" y1="9" x2="22" y2="15"/>
      </svg>`;
    } else {
      muteBtn.classList.remove('muted');
      muteBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M11 5 6 9H3v6h3l5 4z"/>
        <path d="M15.5 8.5a5 5 0 0 1 0 7"/>
        <path d="M18.5 5.5a9 9 0 0 1 0 13"/>
      </svg>`;
    }
  }

  // ─── Graphics toggles ──────────────────────────────────────────────────────

  function getPostFxEnabled() {
    const state = settingsStore.getState();
    return Boolean(state.bloomEnabled && state.fxPassEnabled);
  }

  function syncGfxButtonStates() {
    if (gfxBtn) {
      const postFxOn = getPostFxEnabled();
      gfxBtn.querySelector(".cr-btn-label").textContent = postFxOn ? "ON" : "OFF";
      gfxBtn.classList.toggle("cr-btn--gfx-off", !postFxOn);
    }
    const seg = document.getElementById("cr-quality-seg");
    if (seg) {
      const tier = getQualityTier();
      seg.querySelectorAll(".cr-seg-chip").forEach((chip) => {
        const on = chip.dataset.tier === tier;
        chip.classList.toggle("is-active", on);
        chip.setAttribute("aria-checked", on ? "true" : "false");
      });
    }
  }

  if (gfxBtn) {
    gfxBtn.addEventListener("click", () => {
      const next = !getPostFxEnabled();
      storageSet(STORAGE_KEYS.bloom, next ? "on" : "off");
      storageSet(STORAGE_KEYS.fxPass, next ? "on" : "off");
      togglePostFx(next);
      syncGfxButtonStates();
      animateTogglePop(gfxBtn);
    });
  }

  const qualitySeg = document.getElementById("cr-quality-seg");
  if (qualitySeg) {
    qualitySeg.querySelectorAll(".cr-seg-chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        applyQualityTier(/** @type {import("./utils/qualityMode.js").QualityTier} */ (chip.dataset.tier));
        syncGfxButtonStates();
        animateTogglePop(chip);
      });
    });
  }

  syncGfxButtonStates();

  // ─── Button clicks ────────────────────────────────────────────────────────
  document.querySelectorAll('.cr-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.action === 'customize') {
        openCustomizeScreen();
        return;
      }
      if (btn.dataset.action === 'howto') {
        openHowToScreen();
        return;
      }
      if (btn.dataset.action === 'challenges') {
        openChallengesScreen();
        return;
      }
      if (btn.dataset.action === 'settings') {
        openSettingsScreen();
        return;
      }
      if (btn.dataset.action === 'toggle-postfx' || btn.dataset.action === 'toggle-lowquality') return;
      // * MENU-LOCK-HINT-1: refuse SOLO while the pager is parked on a locked arena.
      // * This gate has to exist — clampLevelIdToUnlocks does NOT refuse, it silently falls
      // * back to FREE_LEVEL, and play entry never reads the pager at all: it resolves from
      // * storage (main.js enterPlayMode). So without this, browsing to a locked arena and
      // * pressing SOLO would start the LAST UNLOCKED arena while looking like it worked.
      // * Placed before the cartrave:menu dispatch so the mouse path and the keyboard path
      // * both hit it — activateMenuSelection only .click()s this same button.
      // * Solo only: quickplay and friends take the room's arena, not the local pick, so
      // * blocking those on a browse cursor would refuse a game the player can actually play.
      if (btn.dataset.action === 'solo' && !isLevelUnlocked(pagerLevelId())) {
        const status = getLevelUnlockStatus(pagerLevelId());
        showUnlockToast(`Locked — ${status.hint} (${status.progress}/${status.goal})`);
        return;
      }
      window.dispatchEvent(new CustomEvent('cartrave:menu', {
        detail: { action: btn.dataset.action }
      }));
    });
  });

  // ─── Fight Night command-list selection controller ────────────────────────
  const MENU_ITEMS = {
    solo:       { kicker: "SOLO · VS BOTS",         desc: "Brawl three bots. Most points when the store closes wins.", arena: true,  diff: true },
    // * QUICKPLAY has no arena picker: matchmaking decides the arena, so offering
    // * the pager here promised a choice the mode does not honour.
    quickplay:  { kicker: "QUICKPLAY · ONLINE",     desc: "Jump into a public four-cart brawl.",                        arena: false, diff: false },
    friends:    { kicker: "FRIENDS · PRIVATE ROOM", desc: "Spin up a private room and invite your crew.",               arena: false, diff: true },
    customize:  { kicker: "CART DETAILING",         desc: "Paint your cart — colors, sunglasses and patterns.",         arena: false, diff: false },
    challenges: { kicker: "WEEKLY RESTOCK",         desc: "Weekly goals for bonus points.",                             arena: false, diff: false },
    howto:      { kicker: "STORE POLICY",           desc: "Learn to drive, body carts, and win before closing.",        arena: false, diff: false },
    settings:   { kicker: "STORE PREFERENCES",      desc: "Audio, graphics and controls.",                              arena: false, diff: false },
  };

  // Device chip glyphs — inline SVG per project convention (the mock's ⌨/🎮 are
  // emoji placeholders; 7d's gamepad line set the precedent). Static markup.
  const HINT_ICON_KBD =
    '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M8 14h8"/></svg>';
  const HINT_ICON_PAD =
    '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M6 12h4M8 10v4"/><circle cx="15" cy="11" r="1"/><circle cx="17.5" cy="13.5" r="1"/>' +
    '<path d="M17.3 6H6.7A4.7 4.7 0 0 0 2 10.7v2.6A4.7 4.7 0 0 0 6.7 18c1.3 0 2-.6 2.6-1.3l.6-.7h4.2l.6.7c.6.7 1.3 1.3 2.6 1.3a4.7 4.7 0 0 0 4.7-4.7v-2.6A4.7 4.7 0 0 0 17.3 6z"/></svg>';

  let cmdButtons = [];
  let cmdIndex = 0;
  let lastNavTick = 0;

  function playNavTick() {
    const now = performance.now();
    if (now - lastNavTick < 55) return;
    lastNavTick = now;
    playUiClick();
  }

  function updateContextPanel(cmd) {
    const meta = MENU_ITEMS[cmd] || { kicker: "", desc: "", arena: false, diff: false };
    const kickerEl = $("cr-context-kicker");
    const descEl = $("cr-context-desc");
    const arenaWrap = $("cr-context-arena");
    if (kickerEl) kickerEl.textContent = meta.kicker;
    if (descEl) descEl.textContent = meta.desc;
    if (arenaWrap) arenaWrap.hidden = !meta.arena;
    if (diffRow) diffRow.hidden = !meta.diff;
  }

  function setMenuSelection(i, opts = {}) {
    if (!cmdButtons.length) return;
    const n = cmdButtons.length;
    const next = (((i % n) + n) % n);
    const changed = next !== cmdIndex;
    cmdIndex = next;
    cmdButtons.forEach((b, idx) => b.classList.toggle("is-selected", idx === next));
    updateContextPanel(cmdButtons[next].dataset.cmd);
    if (changed && !opts.silent) playNavTick();
  }

  function activateMenuSelection() {
    cmdButtons[cmdIndex]?.click();
  }

  function menuVisible() {
    return !!root && root.getClientRects().length > 0;
  }

  function isMenuOverlayOpen() {
    return ["cr-customize-screen", "cr-howto-screen", "cr-challenges-screen", "cr-settings-screen"]
      .some((id) => {
        const el = $(id);
        return el && el.style.display !== "none" && getComputedStyle(el).display !== "none";
      });
  }

  function arenaContextShown() {
    const arenaWrap = $("cr-context-arena");
    return !!arenaWrap && !arenaWrap.hidden;
  }

  function pageArena(dir) {
    if (!levelRow) return;
    const btns = Array.from(levelRow.querySelectorAll(".cr-level-btn"));
    if (!btns.length) return;
    const current = pagerLevelId();
    let idx = btns.findIndex((b) => b.dataset.level === current);
    if (idx < 0) idx = 0;
    const n = btns.length;
    // * Step exactly one arena — no skipping. A locked arena is a destination now, not a
    // * hole in the list.
    const next = btns[(((idx + dir) % n) + n) % n];
    const nextId = next.dataset.level || "";
    if (isLevelUnlocked(nextId)) {
      // * Unlocked: commit as before. selectLevel clears the cursor for us.
      selectLevel(nextId);
      return;
    }
    browseLevelId = nextId;
    updateArenaPager();
    // * Point the 3D preview at the browsed arena too, or the pager names Storerooms while
    // * the world behind it is still Sundial — a desync that reads as a bug and defeats the
    // * point of browsing (seeing what you are working toward).
    // * Called here, NOT via cartrave:level-changed: that event only fires from a successful
    // * selectLevel, which a locked browse never reaches.
    setMenuBrowseLevel(nextId);
    scheduleMenuLevelPreview();
  }

  function updateArenaPager() {
    if (!levelRow) return;
    const btns = Array.from(levelRow.querySelectorAll(".cr-level-btn"));
    if (!btns.length) return;
    const shownId = pagerLevelId();
    const shown = btns.find((b) => b.dataset.level === shownId)
      || btns.find((b) => b.classList.contains("active"))
      || btns[0];
    const nameEl = $("cr-arena-name");
    const subEl = $("cr-arena-sub");
    const label = shown.querySelector(".cr-level-btn-label")?.textContent?.trim() || "";
    const sub = (shown.querySelector(".cr-level-btn-sub")?.textContent?.trim() || "").toUpperCase();
    const idx = btns.indexOf(shown);
    const position = `${idx + 1}/${btns.length}`;
    if (nameEl) nameEl.textContent = label;
    if (!subEl) return;
    const levelId = shown.dataset.level || "";
    if (!isLevelUnlocked(levelId)) {
      // * Locked: swap the flavour text for the unlock requirement, but keep `· N/M` pinned
      // * at the end so the chrome does not jump between locked and unlocked arenas. Text
      // * comes from getLevelUnlockStatus/unlockConfig — never a literal, because
      // * UNLOCK-ORDER-1 already proved hardcoded arena names go stale.
      const status = getLevelUnlockStatus(levelId);
      const hint = String(status.hint || "").toUpperCase();
      subEl.textContent = `🔒 ${hint} (${status.progress}/${status.goal}) · ${position}`;
      return;
    }
    subEl.textContent = sub ? `${sub} · ${position}` : position;
  }

  function toggleMenuMute() {
    muteBtn?.click();
  }

  /**
   * Publishes the hint bar's measured height as `--cr-hintbar-h` so the scrolling menu
   * column can reserve exactly that much instead of guessing.
   *
   * The bar is `position: absolute; bottom: 0` and WRAPS: measured 52px at 768w, 75px at
   * 576w, 106px at 390w, 137px at 380w — while `.cr-content` reserved a flat 92px, leaving
   * the last 14–45px of menu content permanently trapped underneath it on a small phone.
   * Switching input mode re-flows the row too (gamepad prints 3 items, keyboard 4), which
   * is why this rides updateHintBar() as well as the observer.
   *
   * Same shape as hud.js measureUtilityWidth / --hud-utility-width, including the no-op
   * write guard: setProperty can re-enter ResizeObserver on some engines.
   */
  function measureHintBar() {
    const bar = $("cr-hintbar");
    const root = document.getElementById("cr-root");
    if (!bar || !root) return;
    const next = `${Math.ceil(bar.getBoundingClientRect().height)}px`;
    if (root.style.getPropertyValue("--cr-hintbar-h") !== next) {
      root.style.setProperty("--cr-hintbar-h", next);
    }
  }

  function updateHintBar() {
    const mode = getInputMode();
    const deviceEl = $("cr-hint-device");
    const keysEl = $("cr-hint-keys");
    const metaEl = $("cr-hint-meta");
    if (deviceEl) deviceEl.innerHTML = mode === "gamepad" ? `${HINT_ICON_PAD}GAMEPAD` : `${HINT_ICON_KBD}KEYBOARD`;
    const cap = (t) => `<span class="cr-key">${t}</span>`;
    if (keysEl) {
      keysEl.innerHTML = mode === "gamepad"
        ? `<span class="cr-hint-item">D-PAD&nbsp; NAVIGATE</span><span class="cr-hint-item">${cap("Ⓐ")}&nbsp; SELECT</span><span class="cr-hint-item">LB / RB&nbsp; ARENA</span>`
        : `<span class="cr-hint-item">${cap("W")}${cap("S")}&nbsp; NAVIGATE</span><span class="cr-hint-item">${cap("↵")}&nbsp; SELECT</span><span class="cr-hint-item">${cap("◂")}${cap("▸")}&nbsp; ARENA</span><span class="cr-hint-item">${cap("M")}&nbsp; MUTE</span>`;
      measureHintBar();
    }
    if (metaEl) {
      // * The mock's `v0.9.2 · US-EAST · 24 MS` — region and ping have no data
      // * behind them (netcode measures neither), so the slot carries build
      // * identity only. `version` is null unless the build defines one, which
      // * left the line rendering empty; fall back to the short sha.
      const build = readBuildInfo();
      metaEl.textContent = build?.version
        ? `v${build.version}`
        : (build?.sha ? `BUILD ${build.sha}` : "");
    }
  }

  function onMenuNavKeydown(e) {
    if (!menuVisible() || isMenuOverlayOpen()) return;
    // * Any focused text field owns its own keystrokes. W/S move the command selection
    // * and M toggles mute, so without this a room code like OATS3 or MILK2 would walk
    // * the menu and mute the game while being typed (FRIENDS-JOIN-1). Generalised from
    // * the single nameInput check so the next field added does not have to remember.
    const focused = document.activeElement;
    if (focused === nameInput) return;
    if (focused instanceof HTMLInputElement || focused instanceof HTMLTextAreaElement) return;
    if (focused instanceof HTMLElement && focused.isContentEditable) return;
    switch (e.key) {
      case "w": case "W": case "ArrowUp":
        e.preventDefault(); setMenuSelection(cmdIndex - 1); break;
      case "s": case "S": case "ArrowDown":
        e.preventDefault(); setMenuSelection(cmdIndex + 1); break;
      case "Enter":
        if (cmdButtons.includes(document.activeElement)) break; // native click handles it
        e.preventDefault(); activateMenuSelection(); break;
      case "ArrowLeft":
        if (arenaContextShown()) { e.preventDefault(); pageArena(-1); } break;
      case "ArrowRight":
        if (arenaContextShown()) { e.preventDefault(); pageArena(1); } break;
      case "m": case "M":
        toggleMenuMute(); break;
      default: break;
    }
  }

  function initCommandList() {
    cmdButtons = Array.from(document.querySelectorAll("#cr-commandlist .cr-cmd"));
    cmdButtons.forEach((btn, idx) => {
      btn.addEventListener("mouseenter", () => setMenuSelection(idx));
      btn.addEventListener("focus", () => setMenuSelection(idx, { silent: true }));
    });
    $("cr-arena-prev")?.addEventListener("click", () => pageArena(-1));
    $("cr-arena-next")?.addEventListener("click", () => pageArena(1));
    updateArenaPager();
    setMenuSelection(0, { silent: true });
    updateHintBar();
    onInputModeChange(() => updateHintBar());
    // * The bar re-wraps on width change (and on the URL-bar show/hide that moves dvh),
    // * so the reserve has to track it live — a one-shot measure goes stale on rotate.
    if (typeof ResizeObserver === "function") {
      const bar = $("cr-hintbar");
      if (bar) new ResizeObserver(() => measureHintBar()).observe(bar);
    }
    document.addEventListener("keydown", onMenuNavKeydown);
  }

  // ─── Beat + tilt animation ────────────────────────────────────────────────
  let lastBeat = performance.now();
  const animStart = performance.now();
  let animFrameId = null;
  let statsIntervalId = null;

  /**
   * Main menu animation loop: beat pulse, cart bob/tilt, title scale, floor parallax.
   * @param {number} now `performance.now()` timestamp from requestAnimationFrame.
   */
  function animLoop(now) {
    const beatIntervalMs = 60000 / CONFIG.bpm;

    // Beat
    if (CONFIG.cartDance) {
      if (now - lastBeat > beatIntervalMs) {
        state.beat = 1;
        lastBeat = now;
      } else {
        const since = now - lastBeat;
        state.beat = Math.max(0, 1 - since / (beatIntervalMs * CONFIG.beatDecay));
      }
    } else {
      state.beat = 0;
    }
    // Tilt (kept for ambient menu feel / future use)
    const elapsed = (now - animStart) / 1000;
    state.tilt = Math.sin(elapsed * CONFIG.tiltSpeedHz) * CONFIG.tiltAmplitude;

    // Title subtle scale pulse. The 3a lockup is skewed in CSS (skewX(-4deg)), and
    // an inline `transform` here would beat that rule and flatten the lean on the
    // very first frame — so the beat is handed to CSS as a scalar instead.
    if (titleEl) {
      titleEl.style.setProperty("--cr-title-beat", String(1 + state.beat * CONFIG.titleBeatScale));
    }
    animFrameId = requestAnimationFrame(animLoop);
  }
  animFrameId = requestAnimationFrame(animLoop);

  let menuHidden = false;
  let menuEntranceTimeoutId = null;

  const clearMenuEntranceTimeout = () => {
    if (menuEntranceTimeoutId != null) {
      clearTimeout(menuEntranceTimeoutId);
      menuEntranceTimeoutId = null;
    }
  };

  const stopMenuLoops = () => {
    if (menuHidden) return;
    menuHidden = true;
    if (animFrameId != null) {
      cancelAnimationFrame(animFrameId);
      animFrameId = null;
    }
  };

  // If any future fake/global stats ticks exist, ensure they stop when the menu hides.
  // (Interval is intentionally initialized to null; this is a stability guard.)
  const stopMenuTimers = () => {
    if (statsIntervalId != null) {
      clearInterval(statsIntervalId);
      statsIntervalId = null;
    }
    clearMenuEntranceTimeout();
  };
  const stopMenuLoopsAndTimers = () => {
    stopMenuTimers();
    stopMenuLoops();
  };

  function startMenuAnimations() {
    menuHidden = false;
    if (animFrameId == null) {
      lastBeat = performance.now();
      animFrameId = requestAnimationFrame(animLoop);
    }
  }

  // ─── Menu motion (Anime.js) ───────────────────────────────────────────────
  let menuEntranceToken = 0;
  /** @type {WeakSet<Element>} */
  const menuPressWired = new WeakSet();

  function setMenuEntrancePending(pending) {
    root?.classList.toggle("cr-menu-enter-pending", pending);
  }

  /**
   * @param {Element} btn
   * @returns {HTMLElement}
   */
  function getMenuPressTarget(btn) {
    // * Press feedback animates the INNER element, never the outer one: anime.js
    // * writes `transform` inline, which would wipe an outer skewX() and make a
    // * slanted slab snap flat for the duration of the press. Any skewed control
    // * must therefore expose an inner node here.
    const inner = btn.querySelector(
      ".cr-btn-inner, .cr-level-btn-inner, .cr-diff-btn-inner, .cr-customize-tab-inner, .cr-screen-btn-inner",
    );
    return /** @type {HTMLElement} */ (inner || btn);
  }

  /**
   * @param {Element | null | undefined} btn
   */
  function wireMenuPressFeedback(btn) {
    if (!btn || menuPressWired.has(btn)) return;
    menuPressWired.add(btn);

    const target = getMenuPressTarget(btn);
    let pressed = false;

    const onPress = (e) => {
      const pe = /** @type {PointerEvent} */ (e);
      if (pe.pointerType === "mouse" && pe.button !== 0) return;
      pressed = true;
      animateButtonPress(target, { duration: 70, scale: 0.94 });
    };

    const onRelease = () => {
      if (!pressed) return;
      pressed = false;
      animateButtonRelease(target, { duration: 130 });
    };

    btn.addEventListener("pointerdown", onPress);
    btn.addEventListener("pointerup", onRelease);
    btn.addEventListener("pointercancel", onRelease);
    btn.addEventListener("pointerleave", (e) => {
      const pe = /** @type {PointerEvent} */ (e);
      if (pressed && pe.pointerType === "mouse") onRelease();
    });

    // * MENU-CMD-FEEL-1: command rows select on mouseenter — anime hover-scale is only
    // * jiggle and fights the yellow selection chrome. Press scale still runs above.
    if (!(btn instanceof HTMLElement && btn.classList.contains("cr-cmd"))) {
      wireHoverFeedback(/** @type {HTMLElement} */ (btn), { getTarget: getMenuPressTarget });
    }
  }

  function wireAllMenuPressFeedback() {
    document.querySelectorAll(
      ".cr-btn, .cr-level-btn:not(.cr-level-btn--disabled), .cr-diff-btn, .cr-color-chip, .cr-reroll, .cr-plate-btn, .cr-mute-btn, .cr-join-input, .cr-join-go, .cr-customize-done, .cr-customize-back, .cr-overlay-done, .cr-overlay-back",
    ).forEach((btn) => {
      wireMenuPressFeedback(btn);
    });
  }

  /**
   * @param {Element | null | undefined} btn
   * @param {{ delay?: number, duration?: number, y?: number }} [entranceOptions]
   */
  function registerMenuButton(btn, entranceOptions) {
    if (!(btn instanceof HTMLElement)) return;
    wireMenuPressFeedback(btn);
    animateMenuCardEnter(btn, {
      delay: entranceOptions?.delay ?? 0,
      duration: entranceOptions?.duration ?? 360,
      y: entranceOptions?.y ?? 18,
      ...entranceOptions,
    });
  }

  function playMenuEntrance() {
    const token = ++menuEntranceToken;
    if (!root) {
      setMenuEntrancePending(false);
      return;
    }

    if (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) {
      setMenuEntrancePending(false);
      return;
    }

    setMenuEntrancePending(true);

    // * Pacing: scrim/title already placed → rows stagger → panels → hint bar.
    let t = 0;

    document.querySelectorAll(".cr-tagline").forEach((el) => {
      if (el instanceof HTMLElement) animateMenuReveal(el, { delay: t, duration: 240, y: 10, ease: "outExpo" });
    });

    t += 24;
    const titleWords = Array.from(document.querySelectorAll(".cr-title-word")).filter((el) => el instanceof HTMLElement);
    if (titleWords.length > 0) {
      animateMenuCardEnter(titleWords, { delay: stagger(24, { start: t }), duration: 280, y: 14 });
    }

    t += 90;
    const cmdRows = Array.from(document.querySelectorAll(".cr-commandlist .cr-cmd")).filter((el) => el instanceof HTMLElement);
    if (cmdRows.length > 0) {
      animateMenuCardEnter(cmdRows, { delay: stagger(40, { start: t }), duration: 300, y: 16 });
    }

    t += 40 * cmdRows.length + 20;
    const plate = $("cr-player-card");
    if (plate instanceof HTMLElement) animateMenuReveal(plate, { delay: t, duration: 300, y: 12 });

    const ctx = $("cr-context");
    if (ctx instanceof HTMLElement) animateMenuReveal(ctx, { delay: t + 40, duration: 300, y: 12 });

    const hintbar = $("cr-hintbar");
    if (hintbar instanceof HTMLElement) animateMenuReveal(hintbar, { delay: t + 90, duration: 260, y: 8 });

    clearMenuEntranceTimeout();
    menuEntranceTimeoutId = window.setTimeout(() => {
      menuEntranceTimeoutId = null;
      if (token === menuEntranceToken) setMenuEntrancePending(false);
    }, t + 90 + 320);
  }

  // ─── Init ─────────────────────────────────────────────────────────────────
  document.addEventListener("pointerdown", function startMenuAudio() {
    if (typeof window.__cartRaveTryStartMenuMusic === "function") {
      window.__cartRaveTryStartMenuMusic();
      document.removeEventListener("pointerdown", startMenuAudio, true);
    }
  }, { capture: true });

  // Restore saved cart color (or seed default once) — do not rewrite storage on every load.
  const savedCustomization = loadPlayerCustomization();
  applyCustomizationToState(savedCustomization);

  buildColorChips();
  buildPatternChips();
  buildSunglassesChips();
  updateCustomHueUi();
  initLevelSelect();
  initDiffSelect();
  initCommandList();
  initCustomizeScreen();
  initHowToScreen();
  initChallengesScreen();
  initSettingsScreen();
  onUnlockGranted((msg) => {
    // * Unlock grants linger longer than lock-feedback taps — players need time to read
    // * what they earned (matches the 5s in-game HUD unlock toast).
    showUnlockToast(msg, 5000);
    refreshUnlockUi();
  });
  unlockStore.subscribe(() => {
    // * Progress labels on locked chips (no toast spam).
    refreshUnlockUi();
  });
  if (isTouchDevice()) {
    setInputMode("touch");
  } else {
    updateControlsPanelUI();
  }
  window.addEventListener('cartrave:customization-changed', (e) => {
    const detail = e.detail || loadPlayerCustomization();
    applyCustomizationToState(detail);
    buildColorChips();
    buildPatternChips();
    buildSunglassesChips();
    updateCustomHueUi();
    renderCustomizePreview();
    applyPalette();
  });
  window.addEventListener('cartrave:round-started', () => {
    closeCustomizeScreen();
    closeHowToScreen({ userDismissed: true });
    closeChallengesScreen();
    closeSettingsScreen();
  });
  // * Global Escape key — closes whichever overlay is open.
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeActiveOverlay();
    }
  });
  applyPalette();
  nameText.textContent = state.name;

  /**
   * "2D 14H" / "7H" / "12M" — coarse store-voice countdown for the restock kicker.
   * @param {number} ms milliseconds remaining
   */
  function formatRestockIn(ms) {
    const left = Math.max(0, ms);
    const hours = Math.floor(left / 3600000);
    if (hours >= 24) {
      const days = Math.floor(hours / 24);
      const rem = hours % 24;
      return rem ? `${days}D ${rem}H` : `${days}D`;
    }
    if (hours >= 1) return `${hours}H`;
    return `${Math.max(1, Math.ceil(left / 60000))}M`;
  }

  /**
   * Kicker line for 7b: real rotation clocks read off the store's
   * `lastDailyReset` / `lastWeeklyReset` — never a hardcoded window.
   * @param {{ lastDailyReset?: number, lastWeeklyReset?: number }} cState
   */
  function challengesKicker(cState) {
    const now = Date.now();
    const daily = (cState.lastDailyReset || now) + CHALLENGE_ROTATION_MS.daily - now;
    const weekly = (cState.lastWeeklyReset || now) + CHALLENGE_ROTATION_MS.weekly - now;
    return `RESTOCK · DAILY IN ${formatRestockIn(daily)} · WEEKLY IN ${formatRestockIn(weekly)}`;
  }

  function renderChallengesPanel() {
    if (!challengesListEl) return;
    challengesListEl.innerHTML = "";

    const cState = challengeStore.getState();
    if (challengesKickerEl) challengesKickerEl.textContent = challengesKicker(cState);
    const active = [
      ...cState.dailyChallenges,
      ...cState.weeklyChallenges,
    ];

    active.forEach((item) => {
      const meta = CHALLENGE_POOL.find((c) => c.id === item.id);
      if (!meta) return;

      // * 7b: each challenge is a price tag (punch hole + tag nose via CSS).
      const card = document.createElement("div");
      card.className = `cr-chal-card${item.isComplete ? " is-complete" : ""}`;

      const header = document.createElement("div");
      header.className = "cr-chal-hd";

      const name = document.createElement("span");
      name.className = "cr-chal-name";
      name.textContent = meta.title;

      // * The mock's magenta reward pip has no data behind it (CHALLENGE_POOL
      //   carries no reward field), so the rotation badge owns that slot; a
      //   completed challenge swaps it for the REDEEMED stamp.
      const badge = document.createElement("span");
      badge.className = item.isComplete
        ? "cr-chal-stamp"
        : `cr-chal-badge type-${meta.type}`;
      badge.textContent = item.isComplete ? "REDEEMED" : meta.type;

      header.appendChild(name);
      header.appendChild(badge);

      const desc = document.createElement("div");
      desc.className = "cr-chal-desc";
      desc.textContent = meta.description;

      const footer = document.createElement("div");
      footer.className = "cr-chal-ft";

      const barWrap = document.createElement("div");
      barWrap.className = "cr-chal-bar";

      const barFill = document.createElement("div");
      barFill.className = "cr-chal-bar-fill";
      const pct = Math.min(100, Math.round((item.progress / meta.goal) * 100));
      barFill.style.width = `${pct}%`;
      barWrap.appendChild(barFill);

      const progressText = document.createElement("span");
      progressText.className = `cr-chal-count${item.progress > 0 || item.isComplete ? "" : " is-zero"}`;
      progressText.textContent = `${item.progress}/${meta.goal}`;

      footer.appendChild(barWrap);
      footer.appendChild(progressText);

      card.appendChild(header);
      card.appendChild(desc);
      card.appendChild(footer);

      challengesListEl.appendChild(card);
    });
  }

  renderChallengesPanel();
  updateChallengesBadge();
  challengeStore.subscribe(renderChallengesPanel);
  wireAllMenuPressFeedback();

  // ─── Public API ───────────────────────────────────────────────────────────
  window.CartRave = {
    // * CartClash is the product API; CartRave kept as legacy alias (see docs/brand.md).
    setPalette(key) {
      if (!PALETTES[key]) return;
      state.palette = PALETTES[key];
      CONFIG.palette = key;
      buildColorChips();
      applyPalette();
    },
    stopAnimations() {
      stopMenuLoopsAndTimers();
    },
    hide() {
      stopMenuLoopsAndTimers();
      clearHowToAttract();
      closeCustomizeScreen();
      closeHowToScreen();
      closeChallengesScreen();
      closeSettingsScreen();
      if (root) root.style.display = 'none';
    },
    show() {
      closeCustomizeScreen();
      closeHowToScreen();
      closeChallengesScreen();
      closeSettingsScreen();
      if (root) {
        root.style.display = '';
        root.style.opacity = '1';
        root.style.pointerEvents = '';
        root.removeAttribute('aria-hidden');
      }
      updateChallengesBadge();
      wireAllMenuPressFeedback();
      playMenuEntrance();
      startMenuAnimations();
      applyHowToAttract();
    },
    /** Shows menu shell without entrance animation (quit-to-menu, post-bootstrap). */
    revealShell() {
      if (root) {
        root.style.display = '';
        root.style.opacity = '1';
        root.style.pointerEvents = '';
        root.removeAttribute('aria-hidden');
        root.classList.remove('cr-menu-enter-pending');
      }
      setMenuEntrancePending(false);
      updateChallengesBadge();
      wireAllMenuPressFeedback();
      startMenuAnimations();
      applyHowToAttract();
    },
    wireMenuButton(btn, entranceOptions) {
      registerMenuButton(btn, entranceOptions);
    },
    /** Menu toast for session-flow messaging (failed joins, disconnect returns). */
    showToast(message, durationMs = 5000) {
      showUnlockToast(message, durationMs);
    },
    playEntrance() {
      playMenuEntrance();
    },
    refreshMenuMotion() {
      wireAllMenuPressFeedback();
    },
    onMenu(cb) {
      window.addEventListener('cartrave:menu', (e) => {
        const ce = /** @type {CustomEvent} */ (e);
        cb(ce.detail.action);
      });
    },
    getLevel() {
      return state.level;
    },
    setLevel(levelId) {
      selectLevel(levelId);
    },
    openCustomize() {
      openCustomizeScreen();
    },
    closeCustomize() {
      closeCustomizeScreen();
    },
    getCustomization() {
      return loadPlayerCustomization();
    },
    getColor() {
      if (state.colorMode === 'custom') return CUSTOM_COLOR_ID;
      return PALETTE_GAME[state.playerIdx] || PALETTE_GAME[0];
    },
    getColorCss() {
      return getActiveColorCss();
    },
    syncAudioUi,
    openHowTo() {
      openHowToScreen();
    },
    closeHowTo() {
      closeHowToScreen();
    },
    openChallenges() {
      openChallengesScreen();
    },
    closeChallenges() {
      closeChallengesScreen();
    },
    openSettings() {
      openSettingsScreen();
    },
    closeSettings() {
      closeSettingsScreen();
    },
    closeActiveOverlay() {
      return closeActiveOverlay();
    },
  };
  // * Preferred product API; CartRave remains for existing call sites (docs/brand.md).
  window.CartClash = window.CartRave;

  // * Warm the preview GLTF cache while the menu is idle.
  prefetchPreviewCartGltf().catch(() => {});
})();
