// Cart Rave — Main Menu
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
  DEFAULT_CART_PATTERN,
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
import { isLowQualityMode, isTouchDevice } from "./utils.js";
import { settingsStore } from "./stores/settingsStore.js";
import { togglePostFx, toggleLowQuality } from "./ui/graphicsToggles.js";
import { getRoundState } from "./gameState.js";
import { setInputMode, updateControlsPanelUI } from "./input.js";
import {
  animateButtonPress,
  animateButtonRelease,
  animateColorChipSelect,
  animateLevelCardSelect,
  animateMenuCardEnter,
  animateMenuReveal,
  animateRerollSpin,
  stagger,
  wireButtonPressFeedback,
  wireHoverFeedback,
} from "./animations.js";
import { challengeStore, CHALLENGE_POOL } from "./stores/challengeStore.js";

(function () {
  'use strict';

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
  };

  // Change this key to switch palette, or call window.CartRave.setPalette(key).
  const CONFIG = {
    palette: "classic",
    intensity: 7,
    showFloor: true,
    showSpotlights: true,
    showParticles: true,
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
    floorBeatParallaxPx: 4,

    // Particles
    particleCountBase: 12,
    particleCountPerIntensity: 2,
    particleSizeMin: 2,
    particleSizeRange: 5,
    particleDurMin: 8,
    particleDurRange: 14,
    particleDelayMax: 20,

    // Spotlights
    spotlightCount: 4,
    spotlightDurBase: 5,
    spotlightDurStep: 1.3,
    spotlightDelayStep: -0.7,
    spotlightLeftBase: 12,
    spotlightLeftStep: 22,
    spotlightOpacityBase: 0.35,
    spotlightOpacityPerIntensity: 0.06,

    // Intensity-driven scene opacity
    floorOpacityBase: 0.3,
    floorOpacityPerIntensity: 0.05,
    scanOpacityBase: 0.05,
    scanOpacityPerIntensity: 0.01,

    nameMaxLength: 12,
    defaultVolume: 0.25,
  };

  const capitalizeWord = (word) =>
    word ? word.charAt(0).toUpperCase() + word.slice(1).toLowerCase() : "";

  const HANDLE_PARTS = [
    ["CART", "BASS", "NEON", "TROLLEY", "WHEEL", "RAVE", "GLOW", "KICK", "BOOM", "ZAP", "DISCO", "STROBE"],
    ["LORD", "QUEEN", "KILLER", "RIDER", "GOBLIN", "WIZARD", "DEMON", "DADDY", "NINJA", "WRECK", "BEAST", "PRINCE"],
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
  ];

  // Keep player names distinct from in-game NPC name pool (see CLIENT_NPC_NAME_POOL in main.js).
  const CLIENT_NPC_NAME_SET = new Set([
    "CartNapper",
    "WheelSnipe",
    "BuggyBrawler",
    "TrolleyTerror",
    "AisleDrifter",
    "CartJacker",
    "PushNPray",
    "WobbleBot",
    "RimRattler",
    "BasketCase",
    "SkidMark",
    "BumperDumper",
    "RollCage",
    "HotWheelz",
    "CurbStomp",
    "CartBlanche",
    "DriftWood",
    "NitroNancy",
    "TurboTuesday",
    "WipeOut",
    "SendIt",
    "FullSend",
    "YeetCart",
    "NoBrakes",
    "CartGod",
    "Spinout",
    "ParkingPal",
    "LaneCrasher",
    "CartWheel",
    "RampRat",
  ]);

  const rollPlayerName = () => {
    const pool = PLAYER_NAME_POOL.filter((n) => !CLIENT_NPC_NAME_SET.has(n));
    return pool[Math.floor(Math.random() * pool.length)] || "CartRaver";
  };

  // * Game color IDs — same order as PALETTE / CART_COLORS in config.js.
  const PALETTE_GAME = PALETTE;
  const COLOR_ARIA_LABELS = ['Pink', 'Blue', 'Green', 'Yellow', 'Neon orange'];

  const LEVEL_STORAGE_KEY = STORAGE_KEYS.level;
  const DEFAULT_LEVEL = 'classicRecord';
  const LEVEL_OPTIONS = {
    classicRecord: { enabled: true },
    backrooms: { enabled: true },
    zanzibar: { enabled: true },
  };

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
  const floorEl = $("cr-floor");
  const floorGrid = $("cr-floor-grid");
  const lightsEl = $("cr-lights");
  const particlesEl = $("cr-particles");
  const scanEl = $("cr-scan");
  const cartHolder = $("cr-cart-holder");
  const cartShadow = $("cr-cart-shadow");
  const titleEl = $("cr-title");
  const customizeColorRow = $("cr-customize-color-row");
  const customizeSunglassesRow = $("cr-customize-sunglasses-row");
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
  let currentCartSvg = null;
  let currentCustomizeCartSvg = null;
  /** @type {CartPreview | null} Live 3D cart preview while customize screen is open. */
  let cartPreview = null;
  let customHueSliderWired = false;
  const spotlightPool = [];
  const particlePool = [];
  const PARTICLE_POOL_MAX = Math.round(
    CONFIG.particleCountBase + 10 * CONFIG.particleCountPerIntensity
  );
  // NOTE: Quickplay and Friends support touch controls on mobile (see main.js updateTouchControlsVisibility).

  // ─── Neon cart SVG builder ────────────────────────────────────────────────
  /**
   * Builds the large neon cart SVG shown in the menu cart stage.
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

  // ─── Spotlights (pooled DOM) ──────────────────────────────────────────────
  function initSpotlights() {
    if (!lightsEl) return;
    lightsEl.innerHTML = '';
    for (let i = 0; i < CONFIG.spotlightCount; i++) {
      const el = document.createElement('div');
      el.className = 'cr-light';
      lightsEl.appendChild(el);
      spotlightPool.push(el);
    }
  }

  function updateSpotlights() {
    if (!CONFIG.showSpotlights) {
      spotlightPool.forEach((el) => { el.style.display = 'none'; });
      return;
    }
    const p = state.palette;
    const colors = [p.primary, p.secondary, p.tertiary, p.players[0]];
    const opacity = CONFIG.spotlightOpacityBase + CONFIG.intensity * CONFIG.spotlightOpacityPerIntensity;
    for (let i = 0; i < spotlightPool.length; i++) {
      const el = spotlightPool[i];
      el.style.display = '';
      el.style.setProperty('--col', colors[i % colors.length]);
      el.style.setProperty('--dur', `${CONFIG.spotlightDurBase + i * CONFIG.spotlightDurStep}s`);
      el.style.setProperty('--delay', `${i * CONFIG.spotlightDelayStep}s`);
      el.style.left = `${CONFIG.spotlightLeftBase + i * CONFIG.spotlightLeftStep}%`;
      el.style.opacity = String(opacity);
    }
  }

  // ─── Particles (pooled DOM) ───────────────────────────────────────────────
  function initParticles() {
    if (!particlesEl) return;
    particlesEl.innerHTML = '';
    for (let i = 0; i < PARTICLE_POOL_MAX; i++) {
      const el = document.createElement('div');
      el.className = 'cr-particle';
      particlesEl.appendChild(el);
      particlePool.push(el);
    }
  }

  function updateParticles() {
    if (!CONFIG.showParticles) {
      particlePool.forEach((el) => { el.style.display = 'none'; });
      return;
    }
    const count = Math.round(CONFIG.particleCountBase + CONFIG.intensity * CONFIG.particleCountPerIntensity);
    const p = state.palette;
    const colors = [p.primary, p.secondary, p.tertiary];
    for (let i = 0; i < particlePool.length; i++) {
      const el = particlePool[i];
      if (i >= count) {
        el.style.display = 'none';
        continue;
      }
      el.style.display = '';
      const left = Math.random() * 100;
      const size = CONFIG.particleSizeMin + Math.random() * CONFIG.particleSizeRange;
      const dur = CONFIG.particleDurMin + Math.random() * CONFIG.particleDurRange;
      const delay = -Math.random() * CONFIG.particleDelayMax;
      const color = colors[i % colors.length];
      el.style.left = `${left}%`;
      el.style.width = `${size}px`;
      el.style.height = `${size}px`;
      el.style.background = color;
      el.style.boxShadow = `0 0 ${size * 2}px ${color}`;
      el.style.animationDuration = `${dur}s`;
      el.style.animationDelay = `${delay}s`;
    }
  }

  // ─── Level selection ──────────────────────────────────────────────────────
  function getSavedLevel() {
    const saved = storageGet(LEVEL_STORAGE_KEY);
    const option = saved && LEVEL_OPTIONS[saved];
    if (option && option.enabled) return saved;
    return DEFAULT_LEVEL;
  }

  function persistLevel(levelId) {
    state.level = levelId;
    storageSet(LEVEL_STORAGE_KEY, levelId);
    window.cartRaveLevel = levelId;
    settingsStore.getState().setSelectedLevelId(levelId);
  }

  function updateLevelButtons() {
    if (!levelRow) return;
    levelRow.querySelectorAll('.cr-level-btn').forEach((btn) => {
      const isActive = btn.dataset.level === state.level;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
  }

  function selectLevel(levelId) {
    const option = LEVEL_OPTIONS[levelId];
    if (!option || !option.enabled) return;
    if (levelId === state.level) return;
    persistLevel(levelId);
    updateLevelButtons();
    window.dispatchEvent(new CustomEvent("cartrave:level-changed"));
    if (levelRow) {
      const active = levelRow.querySelector(".cr-level-btn.active");
      if (active) {
        animateLevelCardSelect(getMenuPressTarget(active));
      }
    }
  }

  function initLevelSelect() {
    persistLevel(getSavedLevel());
    updateLevelButtons();
    if (!levelRow) return;
    levelRow.querySelectorAll('.cr-level-btn:not(.cr-level-btn--disabled)').forEach((btn) => {
      btn.addEventListener('click', () => selectLevel(btn.dataset.level));
    });
  }

  /**
   * On touch devices, tap the menu cart to open scoring instructions (hover unavailable).
   */
  function initCartTooltipTap() {
    const cartWrap = document.querySelector('.cr-cart-wrap');
    const cartStage = document.querySelector('.cr-cart-stage');
    const tooltip = $('cr-cart-tooltip');
    if (!cartWrap || !cartStage || !tooltip) return;

    const coarseMq = window.matchMedia?.('(pointer: coarse)');
    if (!coarseMq?.matches) return;

    cartStage.classList.add('cr-cart-stage--tappable');
    cartStage.setAttribute('role', 'button');
    cartStage.setAttribute('tabindex', '0');
    cartStage.setAttribute('aria-label', 'Show scoring instructions');
    cartStage.setAttribute('aria-expanded', 'false');
    cartStage.setAttribute('aria-controls', 'cr-cart-tooltip');

    let backdrop = cartWrap.querySelector('.cr-cart-tooltip-backdrop');
    if (!backdrop) {
      backdrop = document.createElement('div');
      backdrop.className = 'cr-cart-tooltip-backdrop';
      backdrop.setAttribute('aria-hidden', 'true');
      cartWrap.appendChild(backdrop);
    }

    const closeTooltip = () => {
      cartWrap.classList.remove('cr-cart-wrap--tooltip-open');
      cartStage.setAttribute('aria-expanded', 'false');
    };

    const openTooltip = () => {
      cartWrap.classList.add('cr-cart-wrap--tooltip-open');
      cartStage.setAttribute('aria-expanded', 'true');
    };

    const toggleTooltip = () => {
      if (cartWrap.classList.contains('cr-cart-wrap--tooltip-open')) {
        closeTooltip();
      } else {
        openTooltip();
      }
    };

    cartStage.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleTooltip();
    });

    cartStage.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggleTooltip();
      }
    });

    backdrop.addEventListener('click', closeTooltip);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeTooltip();
    });
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
    if (customHueWrap) customHueWrap.hidden = state.colorMode !== 'custom';
    if (customHueSlider) {
      customHueSlider.value = String(state.customHue);
      customHueSlider.style.setProperty('--cr-hue-thumb', css);
    }
    if (customHueVal) {
      customHueVal.textContent = `${state.customHue}°`;
      customHueVal.style.color = css;
      customHueVal.style.textShadow = `0 0 8px ${css}`;
    }
  }

  function selectPresetColor(idx) {
    if (getRoundState().phase === "countdown" || getRoundState().phase === "running") return;
    if (idx < 0 || idx >= PALETTE_GAME.length) return;
    state.colorMode = 'preset';
    state.playerIdx = idx;
    saveCustomization({ colorMode: 'preset', color: PALETTE_GAME[idx] });
    buildColorChips();
    updateCustomHueUi();
    renderCart();
    renderCustomizePreview();
    applyPalette();
  }

  function selectCustomColor() {
    if (getRoundState().phase === "countdown" || getRoundState().phase === "running") return;
    if (state.colorMode === 'custom') return;
    state.colorMode = 'custom';
    saveCustomization({ colorMode: 'custom', customHue: state.customHue });
    buildColorChips();
    updateCustomHueUi();
    renderCart();
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
    renderCart();
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
    html += `<button type="button" class="cr-color-chip cr-color-chip--custom ${customActive ? 'active' : ''}" data-kind="custom" style="--cc:${customCss};" role="radio" aria-checked="${customActive}" aria-label="Custom color">
      <span class="cr-color-chip-custom-label">CUSTOM</span>
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
      const mirrorCss = previewHexToCss(style.color);
      html += `<button type="button" class="cr-sunglasses-chip ${isActive ? 'active' : ''}" data-sunglasses="${style.id}" role="radio" aria-checked="${isActive}" aria-label="${style.label}" title="${style.label}" style="--mc:${mirrorCss};">
        <span class="cr-sunglasses-chip-swatch" aria-hidden="true"></span>
        <span class="cr-sunglasses-chip-label">${style.label}</span>
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
    if (state.sunglassesStyle === styleId) return;
    saveCustomization({ sunglassesStyle: styleId });
    if (cartPreview) syncCartPreviewLook(true);
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
      section.hidden = !isActive;
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

  function openCustomizeScreen() {
    if (!customizeScreen) return;
    const phase = getRoundState().phase;
    if (phase === "running" || phase === "countdown") return;
    wireCustomHueSlider();
    updateCustomHueUi();
    mountCartPreview();
    renderCustomizePreview();
    buildColorChips();
    buildSunglassesChips();
    customizeScreen.style.display = 'flex';
    customizeScreen.setAttribute('aria-hidden', 'false');
    customizeDoneBtn?.focus();
    const panel = customizeScreen.querySelector('.cr-customize-panel');
    if (panel instanceof HTMLElement) {
      animateMenuReveal(panel, {
        delay: 0,
        duration: 320,
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
    customizeScreen.style.display = 'none';
    customizeScreen.setAttribute('aria-hidden', 'true');
    renderCart();
    applyPalette();
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
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && customizeScreen?.style.display === 'flex') {
        closeCustomizeScreen();
      }
    });
  }

  // ─── Render cart ──────────────────────────────────────────────────────────
  /**
   * Renders the menu cart SVG and shadow for the currently selected player color.
   */
  function renderCart() {
    const color = getActiveColorCss();
    cartHolder.innerHTML = makeCartSVG(color, state.pattern);
    currentCartSvg = cartHolder.querySelector('svg');
    cartShadow.style.background = `radial-gradient(ellipse, ${color}66, transparent 70%)`;
  }

  // ─── Apply palette to all CSS vars / floor / title / buttons ──────────────
  /**
   * Propagates the active palette and player color to CSS custom properties,
   * stat colors, mode buttons, audio widget, and control key hints.
   */
  function applyPalette() {
    const p = state.palette;
    const pc = getActiveColorCss();

    root.style.background = `radial-gradient(ellipse at center 40%, ${p.bg} 0%, #000 90%)`;

    floorGrid.style.setProperty('--c1', p.primary);
    floorGrid.style.setProperty('--c2', p.secondary);
    floorEl.style.opacity = String(CONFIG.floorOpacityBase + CONFIG.intensity * CONFIG.floorOpacityPerIntensity);

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
      musicVolFill.style.background = `linear-gradient(90deg, ${p.secondary}, ${p.primary})`;
      musicVolFill.style.boxShadow = `0 0 8px ${p.primary}`;
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
    const lowQ = isLowQualityMode();
    lqBtn.querySelector(".cr-btn-label").textContent = lowQ ? "LOW QUALITY: ON" : "HIGH QUALITY: ON";
    lqBtn.classList.toggle("cr-btn--lq-on", lowQ);
  }

  if (gfxBtn) {
    gfxBtn.addEventListener("click", () => {
      const next = !getPostFxEnabled();
      storageSet(STORAGE_KEYS.bloom, next ? "on" : "off");
      storageSet(STORAGE_KEYS.fxPass, next ? "on" : "off");
      togglePostFx(next);
      syncGfxButtonStates();
    });
  }

  if (lqBtn) {
    lqBtn.addEventListener("click", () => {
      const next = !isLowQualityMode();
      toggleLowQuality(next);
      syncGfxButtonStates();
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
    // Tilt
    const elapsed = (now - animStart) / 1000;
    state.tilt = Math.sin(elapsed * CONFIG.tiltSpeedHz) * CONFIG.tiltAmplitude;

    // Apply to cart
    const pulse = 1 + state.beat * CONFIG.cartPulseScale;
    const bob = Math.sin(state.beat * Math.PI) * -CONFIG.cartBobPx;
    if (currentCartSvg) {
      currentCartSvg.style.transform = `translateY(${bob}px) rotate(${state.tilt * CONFIG.cartTiltDeg}deg) scale(${pulse})`;
    }
    cartShadow.style.transform = `translateX(-50%) scale(${1 - state.beat * CONFIG.shadowBeatScale})`;

    // Title subtle scale pulse
    titleEl.style.transform = `scale(${1 + state.beat * CONFIG.titleBeatScale})`;

    // Floor parallax
    if (floorGrid) {
      floorGrid.style.transform = `rotateX(62deg) translateY(${state.beat * -CONFIG.floorBeatParallaxPx}px)`;
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

  // ─── FX toggles via CONFIG ────────────────────────────────────────────────
  if (!CONFIG.showFloor) floorEl.style.display = 'none';
  scanEl.style.opacity = String(CONFIG.scanOpacityBase + CONFIG.intensity * CONFIG.scanOpacityPerIntensity);

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
      ".cr-btn, .cr-level-btn:not(.cr-level-btn--disabled), .cr-color-chip, .cr-reroll, .cr-mute-btn, .cr-friends-copy, .cr-friends-enter, .cr-friends-back, .cr-customize-done, .cr-customize-back",
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

    const STAGGER = 46;
    let t = 0;

    document.querySelectorAll(".cr-tagline").forEach((el) => {
      if (el instanceof HTMLElement) animateMenuReveal(el, { delay: t, duration: 300, y: 10, ease: "outExpo" });
    });

    t += 36;
    const titleWords = Array.from(document.querySelectorAll(".cr-title-word")).filter((el) => el instanceof HTMLElement);
    if (titleWords.length > 0) {
      animateMenuCardEnter(titleWords, { delay: stagger(32, { start: t }), duration: 340, y: 14 });
    }

    t += 100;
    const menuButtons = Array.from(document.querySelectorAll(".cr-buttons .cr-btn")).filter((el) => el instanceof HTMLElement);
    if (menuButtons.length > 0) {
      animateMenuCardEnter(menuButtons, { delay: stagger(STAGGER, { start: t }), duration: 380, y: 18 });
    }

    t += STAGGER * 4 + 36;
    const levelsHd = document.querySelector(".cr-levels-hd");
    if (levelsHd instanceof HTMLElement) animateMenuReveal(levelsHd, { delay: t, duration: 260, y: 8 });

    const levelCards = Array.from(document.querySelectorAll(".cr-level-btn:not(.cr-level-btn--disabled)")).filter((el) => el instanceof HTMLElement);
    if (levelCards.length > 0) {
      animateMenuCardEnter(levelCards, { delay: stagger(STAGGER, { start: t + 28 }), duration: 360, y: 16 });
    }

    t += STAGGER * 2 + 72;

    const cartWrap = document.querySelector(".cr-cart-wrap");
    if (cartWrap instanceof HTMLElement) animateMenuReveal(cartWrap, { delay: t, duration: 380, y: 12 });

    const stats = $("cr-stats-local");
    if (stats instanceof HTMLElement) animateMenuReveal(stats, { delay: t + 40, duration: 360, y: 12 });

    if (playerCard instanceof HTMLElement) animateMenuReveal(playerCard, { delay: t + 20, duration: 400, y: 14 });

    const audioPanel = $("cr-audio-panel");
    if (audioPanel instanceof HTMLElement) animateMenuReveal(audioPanel, { delay: t + 80, duration: 320, y: 10 });

    const controls = $("cr-controls");
    if (controls instanceof HTMLElement) animateMenuReveal(controls, { delay: t + 110, duration: 320, y: 10 });

    clearMenuEntranceTimeout();
    menuEntranceTimeoutId = window.setTimeout(() => {
      menuEntranceTimeoutId = null;
      if (token === menuEntranceToken) setMenuEntrancePending(false);
    }, t + 110 + 420);
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

  initSpotlights();
  initParticles();
  updateSpotlights();
  updateParticles();
  buildColorChips();
  buildSunglassesChips();
  updateCustomHueUi();
  initLevelSelect();
  initCartTooltipTap();
  initCustomizeScreen();
  if (isTouchDevice()) {
    setInputMode("touch");
  } else {
    updateControlsPanelUI();
  }
  window.addEventListener('cartrave:customization-changed', (e) => {
    const detail = e.detail || loadPlayerCustomization();
    applyCustomizationToState(detail);
    buildColorChips();
    buildSunglassesChips();
    updateCustomHueUi();
    renderCart();
    renderCustomizePreview();
    applyPalette();
  });
  window.addEventListener('cartrave:round-started', () => {
    closeCustomizeScreen();
  });
  renderCart();
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
  challengeStore.subscribe(renderChallengesPanel);
  wireAllMenuPressFeedback();

  // ─── Public API ───────────────────────────────────────────────────────────
  window.CartRave = {
    setPalette(key) {
      if (!PALETTES[key]) return;
      state.palette = PALETTES[key];
      CONFIG.palette = key;
      updateSpotlights();
      updateParticles();
      buildColorChips();
      renderCart();
      applyPalette();
    },
    setIntensity(n) {
      CONFIG.intensity = Math.max(0, Math.min(10, n));
      updateSpotlights();
      updateParticles();
      scanEl.style.opacity = String(CONFIG.scanOpacityBase + CONFIG.intensity * CONFIG.scanOpacityPerIntensity);
      floorEl.style.opacity = String(CONFIG.floorOpacityBase + CONFIG.intensity * CONFIG.floorOpacityPerIntensity);
    },
    stopAnimations() {
      stopMenuLoopsAndTimers();
    },
    hide() {
      stopMenuLoopsAndTimers();
      closeCustomizeScreen();
      if (root) root.style.display = 'none';
    },
    show() {
      closeCustomizeScreen();
      if (root) {
        root.style.display = '';
        root.style.opacity = '1';
        root.style.pointerEvents = '';
        root.removeAttribute('aria-hidden');
      }
      wireAllMenuPressFeedback();
      playMenuEntrance();
      startMenuAnimations();
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
      wireAllMenuPressFeedback();
      startMenuAnimations();
    },
    wireMenuButton(btn, entranceOptions) {
      registerMenuButton(btn, entranceOptions);
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
  };

  // * Warm the preview GLTF cache while the menu is idle.
  prefetchPreviewCartGltf().catch(() => {});
})();
