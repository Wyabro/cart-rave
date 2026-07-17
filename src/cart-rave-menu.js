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
import { togglePostFx, applyQualityTier } from "./ui/graphicsToggles.js";
import { setAllAudioMuted, setMusicGainValue } from "./ui/audioControls.js";
import { playUiClick } from "./sfxSynth.js";
import { AUDIO_VOLUME_MAX } from "./stores/audioStore.js";
import { getRoundState } from "./gameState.js";
import { setInputMode, updateControlsPanelUI, getInputMode, onInputModeChange } from "./input.js";
import {
  animateButtonPress,
  animateButtonRelease,
  animateColorChipSelect,
  animateLevelCardSelect,
  animateMenuCardEnter,
  animateMenuDismiss,
  animateMenuReveal,
  animateRerollSpin,
  animateTogglePop,
  stagger,
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
import { LEVEL_UNLOCKS } from "./unlockConfig.js";
import { challengeStore, CHALLENGE_POOL } from "./stores/challengeStore.js";
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
  const DEFAULT_LEVEL = 'classicRecord';
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
  const challengesScreen = $("cr-challenges-screen");
  const challengesDoneBtn = $("cr-challenges-done");
  const challengesBackBtn = $("cr-challenges-back");
  const settingsScreen = $("cr-settings-screen");
  const settingsDoneBtn = $("cr-settings-done");
  const settingsBackBtn = $("cr-settings-back");
  const howtoScreen = $("cr-howto-screen");
  const howtoDoneBtn = $("cr-howto-done");
  const howtoBackBtn = $("cr-howto-back");
  const settingsMuteBtn = $("cr-settings-mute-btn");
  const settingsVolFill = $("cr-settings-vol-fill");
  const settingsVolVal = $("cr-settings-vol-val");
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
      showUnlockToast(`Locked — ${status.hint} (${status.progress}/${status.goal})`);
      return;
    }
    if (levelId === state.level) return;
    persistLevel(levelId);
    updateLevelButtons();
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

  /** Lightweight toast for lock feedback + unlock grants. */
  function showUnlockToast(message, durationMs = 3200) {
    let el = document.getElementById('cr-unlock-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'cr-unlock-toast';
      el.className = 'cr-unlock-toast';
      el.setAttribute('role', 'status');
      document.body.appendChild(el);
    }
    el.textContent = message;
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
    customizeColorRow.setAttribute('aria-label', 'Player Color Selection');
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
    customizeSunglassesRow.setAttribute('aria-label', 'Sunglasses Mirror Finish Selection');
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
    customizePatternRow.setAttribute('aria-label', 'Cart Pattern Selection');
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
      html += `<button type="button" class="cr-pattern-chip ${isActive ? 'active' : ''}${unlocked ? '' : ' cr-chip--locked'}" data-pattern="${id}" role="radio" aria-checked="${isActive}" aria-label="${meta.label}" title="${title}">
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

  function openHowToScreen() {
    if (!howtoScreen) return;
    const phase = getRoundState().phase;
    if (phase === "running" || phase === "countdown") return;
    captureOverlayOpener();
    howtoScreen.style.display = 'flex';
    howtoScreen.setAttribute('aria-hidden', 'false');
    howtoDoneBtn?.focus();
    const panel = howtoScreen.querySelector('.cr-overlay-panel');
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
    if (opts?.userDismissed) howtoAutoOpenArmed = false;
    if (!howtoScreen) return;
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    howtoScreen.setAttribute('aria-hidden', 'true');
    const panel = howtoScreen.querySelector('.cr-overlay-panel');
    animateMenuDismiss(panel instanceof HTMLElement ? panel : null, {
      container: howtoScreen,
      abortIf: () => howtoScreen.getAttribute('aria-hidden') === 'false',
    });
    // * Only restore focus on explicit user closes — the boot-time internal
    // * closes from show() should not yank focus around.
    if (opts?.userDismissed) restoreOverlayFocus();
  }

  function initHowToScreen() {
    howtoDoneBtn?.addEventListener('click', () => closeHowToScreen({ userDismissed: true }));
    howtoBackBtn?.addEventListener('click', () => closeHowToScreen({ userDismissed: true }));
    wireMenuPressFeedback(howtoDoneBtn);
    wireMenuPressFeedback(howtoBackBtn);
    // * Live-rematch the Settings controls panel when keyboard / gamepad / touch
    // * becomes active — same setInputMode signal it uses, not a poll.
    onInputModeChange(() => {
      if (settingsScreen?.style.display === "flex") updateSettingsControlsUI();
    });
  }

  /** @type {number|null} Pending first-run HOW TO PLAY auto-open timeout. */
  let howtoAutoOpenTimeoutId = null;
  /** True while the first-run auto-open should (re)fire on menu shows. */
  let howtoAutoOpenArmed = false;
  let firstMenuShowHandled = false;

  /**
   * First-run onboarding: auto-opens the HOW TO PLAY overlay once, ever.
   * Arms on the first menu show after boot — never on ?room= URLs
   * (invite/rejoin flows), so lobby joins are not blocked by the overlay.
   * Boot calls show() more than once (initMenu, then the boot-splash dismiss),
   * so while armed each show() re-schedules the open; entering a match
   * (hide()) or an explicit user dismissal disarms it for good.
   */
  function maybeAutoOpenHowTo() {
    if (!firstMenuShowHandled) {
      firstMenuShowHandled = true;
      if (storageGet(STORAGE_KEYS.howtoSeen)) return;
      const roomParam = new URLSearchParams(window.location.search || "").get("room");
      if (roomParam) return;
      storageSet(STORAGE_KEYS.howtoSeen, "1");
      howtoAutoOpenArmed = true;
    }
    if (!howtoAutoOpenArmed) return;
    // * Let the menu entrance settle before layering the overlay on top.
    clearHowToAutoOpenTimeout();
    howtoAutoOpenTimeoutId = window.setTimeout(() => {
      howtoAutoOpenTimeoutId = null;
      if (!howtoAutoOpenArmed) return;
      if (menuHidden || root?.style.display === 'none') return;
      openHowToScreen();
    }, 600);
  }

  function disarmHowToAutoOpen() {
    howtoAutoOpenArmed = false;
    clearHowToAutoOpenTimeout();
  }

  function clearHowToAutoOpenTimeout() {
    if (howtoAutoOpenTimeoutId != null) {
      clearTimeout(howtoAutoOpenTimeoutId);
      howtoAutoOpenTimeoutId = null;
    }
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
    const btn = document.querySelector('.cr-btn[data-action="challenges"]');
    if (!(btn instanceof HTMLElement)) return;
    const cState = challengeStore.getState();
    const all = [...cState.dailyChallenges, ...cState.weeklyChallenges];
    const completed = all.filter((c) => c.isComplete).length;
    const showNew = completed < 1 && all.length > 0 && !_challengesViewed;
    let chip = btn.querySelector('.cr-challenges-chip');
    if (completed < 1 && !showNew) {
      chip?.remove();
      return;
    }
    if (!chip) {
      chip = document.createElement('span');
      chip.className = 'cr-challenges-chip';
      chip.setAttribute('aria-hidden', 'true');
      btn.appendChild(chip);
    }
    if (completed >= 1) {
      chip.textContent = `✓${completed}`;
      chip.classList.remove('cr-challenges-chip--new');
    } else {
      chip.textContent = 'NEW';
      chip.classList.add('cr-challenges-chip--new');
    }
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
    const panel = challengesScreen.querySelector('.cr-overlay-panel');
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
    const panel = challengesScreen.querySelector('.cr-overlay-panel');
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
    const panel = settingsScreen.querySelector('.cr-overlay-panel');
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
    const panel = settingsScreen.querySelector('.cr-overlay-panel');
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
   * @type {{ muted: boolean, musicPct: number, musicNorm?: number } | null}
   */
  let _lastSettingsAudioSync = null;

  /**
   * Syncs Settings overlay mute button and volume display from main-owned audio state.
   * @param {{ muted: boolean, musicPct: number, musicNorm?: number }} [audio]
   */
  function syncSettingsAudioUi(audio) {
    // * Cache the last explicit sync so openSettingsScreen() can reuse it.
    if (audio) _lastSettingsAudioSync = audio;
    const src = audio || _lastSettingsAudioSync;
    const muted = src ? src.muted : audioUiMuted;
    const pct = src ? src.musicPct : 25;
    const norm = src ? (src.musicNorm ?? (src.muted ? 0 : src.musicPct / 100)) : 0.25;
    settingsAudioUiMuted = muted;
    if (settingsVolFill) {
      settingsVolFill.style.setProperty('--vol-scale', String(muted ? 0 : norm));
      // * Flat printed fill in the palette secondary (sticker material — no gradient/glow).
      settingsVolFill.style.background = state.palette.secondary;
    }
    if (settingsVolVal) settingsVolVal.textContent = String(muted ? 'OFF' : pct);
    if (!settingsMuteBtn) return;
    if (muted) {
      settingsMuteBtn.classList.add('muted');
      settingsMuteBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M11 5 6 9H3v6h3l5 4z"/>
        <line x1="22" y1="9" x2="16" y2="15"/>
        <line x1="16" y1="9" x2="22" y2="15"/>
      </svg>`;
    } else {
      settingsMuteBtn.classList.remove('muted');
      settingsMuteBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M11 5 6 9H3v6h3l5 4z"/>
        <path d="M15.5 8.5a5 5 0 0 1 0 7"/>
        <path d="M18.5 5.5a9 9 0 0 1 0 13"/>
      </svg>`;
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
      header.innerHTML = `&#9671; CONTROLS <span class="cr-settings-ctl-badge">${badge}</span>`;
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
    // * Proxy the volume track click so the position calculation works on its rect.
    const settingsVolTrack = document.getElementById('cr-settings-vol-track');
    if (settingsVolTrack) {
      settingsVolTrack.addEventListener('click', (e) => {
        const rect = settingsVolTrack.getBoundingClientRect();
        const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        setMusicGainValue(Math.round(ratio * AUDIO_VOLUME_MAX * 100) / 100);
      });
    }
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

    // Audio widget
    audioEl.style.setProperty('--ag', p.secondary);
    if (!audioUiMuted) {
      muteBtn.style.setProperty('--mc', p.secondary);
      musicVolFill.style.background = p.secondary;
    }
    // * Also refresh the Settings overlay fill so it stays in palette sync.
    if (settingsVolFill) {
      settingsVolFill.style.background = p.secondary;
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
   * @param {{ muted: boolean, musicPct: number, musicNorm?: number }} audio
   */
  function syncAudioUi({ muted, musicPct, musicNorm }) {
    audioUiMuted = Boolean(muted);
    const scale = muted ? 0 : (musicNorm ?? musicPct / 100);
    if (musicVolFill) musicVolFill.style.setProperty('--vol-scale', String(scale));
    if (musicVolVal) musicVolVal.textContent = String(muted ? 'OFF' : musicPct);
    // * Always sync the Settings overlay, even if the main-menu muteBtn is missing.
    syncSettingsAudioUi({ muted, musicPct, musicNorm });
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
    if (!gfxBtn || !lqBtn) return;
    const postFxOn = getPostFxEnabled();
    gfxBtn.querySelector(".cr-btn-label").textContent = postFxOn ? "POST-FX: ON" : "POST-FX: OFF";
    gfxBtn.classList.toggle("cr-btn--gfx-off", !postFxOn);
    const tier = getQualityTier();
    lqBtn.querySelector(".cr-btn-label").textContent = `QUALITY: ${tier.toUpperCase()}`;
    lqBtn.classList.toggle("cr-btn--lq-on", tier === "low");
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

  if (lqBtn) {
    lqBtn.addEventListener("click", () => {
      const order = /** @type {import("./utils/qualityMode.js").QualityTier[]} */ (["low", "medium", "high"]);
      const next = order[(order.indexOf(getQualityTier()) + 1) % order.length];
      applyQualityTier(next);
      syncGfxButtonStates();
      animateTogglePop(lqBtn);
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
      window.dispatchEvent(new CustomEvent('cartrave:menu', {
        detail: { action: btn.dataset.action }
      }));
    });
  });

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

    // Title subtle scale pulse
    if (titleEl) {
      titleEl.style.transform = `scale(${1 + state.beat * CONFIG.titleBeatScale})`;
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
    const inner = btn.querySelector(".cr-btn-inner, .cr-level-btn-inner");
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

    wireHoverFeedback(/** @type {HTMLElement} */ (btn), { getTarget: getMenuPressTarget });
  }

  function wireAllMenuPressFeedback() {
    document.querySelectorAll(
      ".cr-btn, .cr-level-btn:not(.cr-level-btn--disabled), .cr-color-chip, .cr-reroll, .cr-mute-btn, .cr-friends-copy, .cr-friends-enter, .cr-friends-back, .cr-customize-done, .cr-customize-back, .cr-overlay-done, .cr-overlay-back",
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

    // * Pacing: whole cascade lands in ~700ms (was ~1060ms — read as sluggish).
    const STAGGER = 30;
    let t = 0;

    document.querySelectorAll(".cr-tagline").forEach((el) => {
      if (el instanceof HTMLElement) animateMenuReveal(el, { delay: t, duration: 240, y: 10, ease: "outExpo" });
    });

    t += 24;
    const titleWords = Array.from(document.querySelectorAll(".cr-title-word")).filter((el) => el instanceof HTMLElement);
    if (titleWords.length > 0) {
      animateMenuCardEnter(titleWords, { delay: stagger(24, { start: t }), duration: 280, y: 14 });
    }

    t += 70;
    const menuButtons = Array.from(document.querySelectorAll(".cr-buttons .cr-btn")).filter((el) => el instanceof HTMLElement);
    if (menuButtons.length > 0) {
      animateMenuCardEnter(menuButtons, { delay: stagger(STAGGER, { start: t }), duration: 300, y: 18 });
    }

    t += STAGGER * 4 + 24;
    const levelsHd = document.querySelector(".cr-levels-hd");
    if (levelsHd instanceof HTMLElement) animateMenuReveal(levelsHd, { delay: t, duration: 220, y: 8 });

    const levelCards = Array.from(document.querySelectorAll(".cr-level-btn:not(.cr-level-btn--disabled)")).filter((el) => el instanceof HTMLElement);
    if (levelCards.length > 0) {
      animateMenuCardEnter(levelCards, { delay: stagger(STAGGER, { start: t + 20 }), duration: 280, y: 16 });
    }

    t += STAGGER * 2 + 48;

    const stats = $("cr-stats-local");
    if (stats instanceof HTMLElement) animateMenuReveal(stats, { delay: t, duration: 280, y: 12 });

    if (playerCard instanceof HTMLElement) animateMenuReveal(playerCard, { delay: t + 16, duration: 320, y: 14 });

    const audioPanel = $("cr-audio-panel");
    if (audioPanel instanceof HTMLElement) animateMenuReveal(audioPanel, { delay: t + 56, duration: 260, y: 10 });

    const controls = $("cr-controls");
    if (controls instanceof HTMLElement) animateMenuReveal(controls, { delay: t + 80, duration: 260, y: 10 });

    const menuExtras = document.querySelector(".cr-menu-extras");
    if (menuExtras instanceof HTMLElement) animateMenuReveal(menuExtras, { delay: t + 100, duration: 240, y: 8 });

    clearMenuEntranceTimeout();
    menuEntranceTimeoutId = window.setTimeout(() => {
      menuEntranceTimeoutId = null;
      if (token === menuEntranceToken) setMenuEntrancePending(false);
    }, t + 100 + 320);
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

  function renderChallengesPanel() {
    if (!challengesListEl) return;
    challengesListEl.innerHTML = "";

    const cState = challengeStore.getState();
    const active = [
      ...cState.dailyChallenges,
      ...cState.weeklyChallenges,
    ];

    active.forEach((item) => {
      const meta = CHALLENGE_POOL.find((c) => c.id === item.id);
      if (!meta) return;

      const row = document.createElement("div");
      row.className = `challenge-row${item.isComplete ? " is-complete" : ""}`;

      const header = document.createElement("div");
      header.className = "challenge-header";

      const name = document.createElement("span");
      name.className = "challenge-name";
      name.textContent = meta.title;

      const badge = document.createElement("span");
      badge.className = `challenge-badge type-${meta.type}`;
      badge.textContent = item.isComplete ? "✓ DONE" : meta.type;

      header.appendChild(name);
      header.appendChild(badge);

      const desc = document.createElement("div");
      desc.className = "challenge-desc";
      desc.textContent = meta.description;

      const footer = document.createElement("div");
      footer.className = "challenge-footer";

      const barWrap = document.createElement("div");
      barWrap.className = "challenge-bar-wrap";

      const barFill = document.createElement("div");
      barFill.className = "challenge-bar-fill";
      const pct = Math.min(100, Math.round((item.progress / meta.goal) * 100));
      barFill.style.width = `${pct}%`;
      barWrap.appendChild(barFill);

      const progressText = document.createElement("span");
      progressText.className = "challenge-progress-text";
      progressText.textContent = `${item.progress}/${meta.goal}`;

      footer.appendChild(barWrap);
      footer.appendChild(progressText);

      row.appendChild(header);
      row.appendChild(desc);
      row.appendChild(footer);

      challengesListEl.appendChild(row);
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
      disarmHowToAutoOpen();
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
      maybeAutoOpenHowTo();
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
