// Cart Rave — Main Menu (vanilla JS)
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

  // * Game color IDs in slot order — must match PALETTE = Object.keys(CART_COLORS) in main.js.
  const PALETTE_GAME = ['pink', 'blue', 'green', 'yellow', 'neonOrange'];
  const COLOR_ARIA_LABELS = ['Pink', 'Blue', 'Green', 'Yellow', 'Neon orange'];

  const LEVEL_STORAGE_KEY = 'cartRaveLevel';
  const CUSTOMIZE_STORAGE_KEY = 'cartRaveCustomization';
  const COLOR_STORAGE_KEY = 'cartRaveColor';
  const CUSTOM_HEX_STORAGE_KEY = 'cartRaveCustomHex';
  const CUSTOM_COLOR_ID = 'custom';
  const DEFAULT_CUSTOM_HUE = 280;
  const CUSTOM_NEON_SAT = 100;
  const CUSTOM_NEON_LIGHT = 50;
  const DEFAULT_LEVEL = 'classicRecord';
  const LEVEL_OPTIONS = {
    classicRecord: { enabled: true },
    backrooms: { enabled: true },
  };

  // ─── State ────────────────────────────────────────────────────────────────
  const state = {
    palette: PALETTES[CONFIG.palette] || PALETTES.classic,
    playerIdx: 0,
    level: DEFAULT_LEVEL,
    name: localStorage.getItem("cartRaveUsername") || rollPlayerName(),
    muted: false,
    vol: CONFIG.defaultVolume,
    beat: 0,
    tilt: 0,
    colorMode: 'preset',
    customHue: DEFAULT_CUSTOM_HUE,
  };

  if (!localStorage.getItem("cartRaveUsername")) {
    state.name = rollPlayerName();
    localStorage.setItem("cartRaveUsername", state.name);
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
  const customizeScreen = $("cr-customize-screen");
  const customizeCartHolder = $("cr-customize-cart-holder");
  const customizeCartShadow = $("cr-customize-cart-shadow");
  const customizeDoneBtn = $("cr-customize-done");
  const customizeBackBtn = $("cr-customize-back");
  const customHueWrap = $("cr-custom-hue-wrap");
  const customHueSlider = $("cr-custom-hue-slider");
  const customHueVal = $("cr-custom-hue-val");
  const levelRow = $("cr-level-row");
  const playerCard = $("cr-player-card");
  const nameDisplay = $("cr-name-display");
  const nameText = $("cr-name-text");
  const nameInput = $("cr-name-input");
  const rerollBtn = $("cr-reroll");
  const muteBtn = $("cr-mute-btn");
  const musicVolFill = $("cr-music-vol-fill");
  const musicVolVal = $("cr-music-vol-val");
  const audioEl = $("cr-audio");
  let currentCartSvg = null;
  let currentCustomizeCartSvg = null;
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
   * @returns {string} SVG markup string.
   */
  function makeCartSVG(color) {
    const gid = 'g' + Math.random().toString(36).slice(2, 8);
    return `
<svg viewBox="0 0 220 180" width="280" height="${280 * (180 / 220)}"
     style="filter: drop-shadow(0 0 14px ${color}) drop-shadow(0 0 28px ${color}88);">
  <defs>
    <linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${color}" stop-opacity="1" />
      <stop offset="100%" stop-color="${color}" stop-opacity="0.75" />
    </linearGradient>
  </defs>
  <path d="M8 28 L44 28 L64 98" fill="none" stroke="${color}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" />
  <path d="M44 50 L200 50 L182 120 L60 120 Z" fill="none" stroke="${color}" stroke-width="7" stroke-linejoin="round" />
  <path d="M50 72 L196 72 M54 92 L190 92" stroke="${color}" stroke-width="3" stroke-linecap="round" opacity="0.85" />
  <path d="M82 50 L78 120 M120 50 L120 120 M158 50 L162 120" stroke="${color}" stroke-width="3" stroke-linecap="round" opacity="0.85" />
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
    const saved = localStorage.getItem(LEVEL_STORAGE_KEY);
    const option = saved && LEVEL_OPTIONS[saved];
    if (option && option.enabled) return saved;
    return DEFAULT_LEVEL;
  }

  function persistLevel(levelId) {
    state.level = levelId;
    localStorage.setItem(LEVEL_STORAGE_KEY, levelId);
    window.cartRaveLevel = levelId;
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
    loadMenuAnimations().then((Anim) => {
      if (!Anim || !levelRow) return;
      const active = levelRow.querySelector(".cr-level-btn.active");
      if (active) {
        Anim.animateLevelCardSelect(getMenuPressTarget(active));
      }
    });
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

  // ─── Custom color (hue-only neon; mirrors src/customization.js) ───────────
  function normalizeHue(hue) {
    const h = Number(hue);
    if (!Number.isFinite(h)) return DEFAULT_CUSTOM_HUE;
    return ((Math.round(h) % 360) + 360) % 360;
  }

  function hslToHex(h, s, l) {
    const hue = normalizeHue(h);
    const sat = Math.max(0, Math.min(100, s)) / 100;
    const light = Math.max(0, Math.min(100, l)) / 100;
    const c = (1 - Math.abs(2 * light - 1)) * sat;
    const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
    const m = light - c / 2;
    let r = 0;
    let g = 0;
    let b = 0;
    if (hue < 60) { r = c; g = x; }
    else if (hue < 120) { r = x; g = c; }
    else if (hue < 180) { g = c; b = x; }
    else if (hue < 240) { g = x; b = c; }
    else if (hue < 300) { r = x; b = c; }
    else { r = c; b = x; }
    const ri = Math.round((r + m) * 255);
    const gi = Math.round((g + m) * 255);
    const bi = Math.round((b + m) * 255);
    return (ri << 16) | (gi << 8) | bi;
  }

  function hueToNeonHex(hue) {
    return hslToHex(hue, CUSTOM_NEON_SAT, CUSTOM_NEON_LIGHT);
  }

  function hueToNeonCss(hue) {
    const hex = hueToNeonHex(hue);
    return `#${hex.toString(16).padStart(6, '0')}`;
  }

  function hexToHue(hex) {
    const r = ((hex >> 16) & 255) / 255;
    const g = ((hex >> 8) & 255) / 255;
    const b = (hex & 255) / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const d = max - min;
    if (d < 1e-6) return DEFAULT_CUSTOM_HUE;
    let h = 0;
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
    return h;
  }

  function getActiveColorCss() {
    if (state.colorMode === 'custom') return hueToNeonCss(state.customHue);
    return state.palette.players[state.playerIdx];
  }

  // ─── Customization persistence ───────────────────────────────────────────
  /**
   * @returns {{ colorMode: 'preset'|'custom', color: string, customHue: number, hex: number, cssHex: string }}
   */
  function loadCustomization() {
    try {
      const raw = localStorage.getItem(CUSTOMIZE_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          const colorMode = parsed.colorMode === 'custom' || parsed.color === CUSTOM_COLOR_ID
            ? 'custom'
            : 'preset';
          const customHue = normalizeHue(parsed.customHue ?? DEFAULT_CUSTOM_HUE);
          const color = colorMode === 'custom'
            ? CUSTOM_COLOR_ID
            : (PALETTE_GAME.includes(parsed.color) ? parsed.color : PALETTE_GAME[0]);
          const presetIdx = colorIdxFromGameId(color);
          const cssHex = colorMode === 'custom'
            ? hueToNeonCss(customHue)
            : state.palette.players[presetIdx];
          return {
            colorMode,
            color,
            customHue,
            hex: colorMode === 'custom' ? hueToNeonHex(customHue) : 0,
            cssHex,
          };
        }
      }
    } catch {}
    const legacy = localStorage.getItem(COLOR_STORAGE_KEY);
    if (legacy === CUSTOM_COLOR_ID) {
      const legacyHex = Number(localStorage.getItem(CUSTOM_HEX_STORAGE_KEY));
      const customHue = Number.isFinite(legacyHex)
        ? normalizeHue(hexToHue(legacyHex))
        : DEFAULT_CUSTOM_HUE;
      return {
        colorMode: 'custom',
        color: CUSTOM_COLOR_ID,
        customHue: normalizeHue(customHue),
        hex: hueToNeonHex(customHue),
        cssHex: hueToNeonCss(customHue),
      };
    }
    const color = legacy && PALETTE_GAME.includes(legacy) ? legacy : PALETTE_GAME[0];
    return {
      colorMode: 'preset',
      color,
      customHue: DEFAULT_CUSTOM_HUE,
      hex: 0,
      cssHex: state.palette.players[PALETTE_GAME.indexOf(color)] || state.palette.players[0],
    };
  }

  function applyCustomizationToState(saved) {
    state.colorMode = saved.colorMode === 'custom' ? 'custom' : 'preset';
    state.customHue = normalizeHue(saved.customHue);
    if (state.colorMode === 'preset') {
      state.playerIdx = colorIdxFromGameId(saved.color);
    }
  }

  /**
   * @param {{ colorMode?: 'preset'|'custom', color?: string, customHue?: number }} customization
   */
  function saveCustomization(customization) {
    const colorMode = customization.colorMode === 'custom' ? 'custom' : 'preset';
    let color = customization.color;
    let customHue = normalizeHue(customization.customHue ?? state.customHue);

    if (colorMode === 'custom') {
      color = CUSTOM_COLOR_ID;
    } else {
      color = color && PALETTE_GAME.includes(color)
        ? color
        : (PALETTE_GAME[state.playerIdx] || PALETTE_GAME[0]);
      state.playerIdx = PALETTE_GAME.indexOf(color);
      if (state.playerIdx < 0) state.playerIdx = 0;
    }

    const hex = colorMode === 'custom'
      ? hueToNeonHex(customHue)
      : 0;
    const payload = {
      colorMode,
      color: colorMode === 'custom' ? CUSTOM_COLOR_ID : color,
      customHue,
      customHex: colorMode === 'custom' ? hex : undefined,
    };
    if (payload.customHex === undefined) delete payload.customHex;

    localStorage.setItem(CUSTOMIZE_STORAGE_KEY, JSON.stringify(payload));
    localStorage.setItem(COLOR_STORAGE_KEY, colorMode === 'custom' ? CUSTOM_COLOR_ID : color);
    if (colorMode === 'custom') {
      localStorage.setItem(CUSTOM_HEX_STORAGE_KEY, String(hex));
    }

    state.colorMode = colorMode;
    state.customHue = customHue;

    const detail = {
      colorMode,
      color: payload.color,
      customHue,
      hex: colorMode === 'custom' ? hex : hueToNeonHex(0),
      cssHex: getActiveColorCss(),
    };
    window.dispatchEvent(new CustomEvent('cartrave:customization-changed', { detail }));
    return detail;
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
    if (state.colorMode === 'custom') return;
    state.colorMode = 'custom';
    saveCustomization({ colorMode: 'custom', customHue: state.customHue });
    buildColorChips();
    updateCustomHueUi();
    renderCart();
    renderCustomizePreview();
    applyPalette();
  }

  function onCustomHueInput(hue) {
    state.customHue = normalizeHue(hue);
    saveCustomization({ colorMode: 'custom', customHue: state.customHue });
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
        if (chip.dataset.kind === 'custom') {
          if (state.colorMode === 'custom') {
            loadMenuAnimations().then((Anim) => {
              if (Anim) Anim.animateColorChipSelect(chip);
            });
            return;
          }
          selectCustomColor();
          loadMenuAnimations().then((Anim) => {
            if (Anim) Anim.animateColorChipSelect(chip);
          });
          return;
        }
        const idx = parseInt(chip.dataset.idx, 10);
        if (state.colorMode === 'preset' && idx === state.playerIdx) {
          loadMenuAnimations().then((Anim) => {
            if (Anim) Anim.animateColorChipSelect(chip);
          });
          return;
        }
        selectPresetColor(idx);
        loadMenuAnimations().then((Anim) => {
          if (!Anim) return;
          const active = customizeColorRow.querySelector('.cr-color-chip.active');
          if (active) Anim.animateColorChipSelect(active);
        });
      });
    });
  }

  function wireCustomHueSlider() {
    if (!customHueSlider || customHueSliderWired) return;
    customHueSliderWired = true;
    customHueSlider.addEventListener('input', () => {
      onCustomHueInput(Number(customHueSlider.value));
    });
  }

  function renderCustomizePreview() {
    if (!customizeCartHolder) return;
    const color = getActiveColorCss();
    customizeCartHolder.innerHTML = makeCartSVG(color);
    currentCustomizeCartSvg = customizeCartHolder.querySelector('svg');
    if (customizeCartShadow) {
      customizeCartShadow.style.background = `radial-gradient(ellipse, ${color}66, transparent 70%)`;
    }
  }

  function openCustomizeScreen() {
    if (!customizeScreen) return;
    wireCustomHueSlider();
    updateCustomHueUi();
    renderCustomizePreview();
    buildColorChips();
    customizeScreen.style.display = 'flex';
    customizeScreen.setAttribute('aria-hidden', 'false');
    customizeDoneBtn?.focus();
    loadMenuAnimations().then((Anim) => {
      if (Anim && customizeScreen.querySelector('.cr-customize-panel')) {
        Anim.animateMenuReveal(customizeScreen.querySelector('.cr-customize-panel'), {
          delay: 0,
          duration: 320,
          y: 14,
        });
      }
    });
  }

  function closeCustomizeScreen() {
    if (!customizeScreen) return;
    customizeScreen.style.display = 'none';
    customizeScreen.setAttribute('aria-hidden', 'true');
    renderCart();
    applyPalette();
  }

  function initCustomizeScreen() {
    wireCustomHueSlider();
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
    cartHolder.innerHTML = makeCartSVG(color);
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
    floorEl.style.opacity = CONFIG.floorOpacityBase + CONFIG.intensity * CONFIG.floorOpacityPerIntensity;

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
      btn.style.setProperty('--glow', resolveGlow(btn.dataset.colorkey));
    });

    // Level cards
    document.querySelectorAll('.cr-level-btn:not(.cr-level-btn--disabled)').forEach(btn => {
      btn.style.setProperty('--glow', resolveGlow(btn.dataset.colorkey));
    });

    // Audio widget
    audioEl.style.setProperty('--ag', p.secondary);
    if (!state.muted) {
      muteBtn.style.setProperty('--mc', p.secondary);
      musicVolFill.style.background = `linear-gradient(90deg, ${p.secondary}, ${p.primary})`;
      musicVolFill.style.boxShadow = `0 0 8px ${p.primary}`;
    }

    // Controls kbd colors
    document.getElementById('ctl-wasd').style.setProperty('--kc', p.secondary);
    document.getElementById('ctl-shift').style.setProperty('--kc', p.tertiary);
    document.getElementById('ctl-space').style.setProperty('--kc', p.primary);
    document.getElementById('ctl-m').style.setProperty('--kc', p.players[2]);
    document.getElementById('ctl-esc').style.setProperty('--kc', p.players[4]);
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
    localStorage.setItem("cartRaveUsername", state.name);
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
    localStorage.setItem("cartRaveUsername", state.name);
    nameText.textContent = state.name;
    loadMenuAnimations().then((Anim) => {
      if (Anim) Anim.animateRerollSpin(rerollBtn);
    });
  });

  // ─── Mute / volume ────────────────────────────────────────────────────────
  function updateVolume() {
    if (musicVolFill) musicVolFill.style.setProperty('--vol-scale', String(state.muted ? 0 : state.vol));
    if (musicVolVal) musicVolVal.textContent = state.muted ? 'OFF' : Math.round(state.vol * 100);
    if (state.muted) {
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

  // ─── Button clicks ────────────────────────────────────────────────────────
  document.querySelectorAll('.cr-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.action === 'customize') {
        openCustomizeScreen();
        return;
      }
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
  scanEl.style.opacity = CONFIG.scanOpacityBase + CONFIG.intensity * CONFIG.scanOpacityPerIntensity;

  // ─── Menu motion (Anime.js) ───────────────────────────────────────────────
  /** @type {Promise<typeof import('./src/animations.js') | null> | null} */
  let menuAnimLoadPromise = null;
  let menuEntranceToken = 0;
  /** @type {WeakSet<Element>} */
  const menuPressWired = new WeakSet();

  function loadMenuAnimations() {
    if (!menuAnimLoadPromise) {
      menuAnimLoadPromise = import("/src/animations.js")
        .then((mod) => mod)
        .catch(() => null);
    }
    return menuAnimLoadPromise;
  }

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

    loadMenuAnimations().then((Anim) => {
      if (!Anim || !btn.isConnected) return;

      const target = getMenuPressTarget(btn);
      let pressed = false;

      const onPress = (e) => {
        if (e.pointerType === "mouse" && e.button !== 0) return;
        pressed = true;
        Anim.animateButtonPress(target, { duration: 70, scale: 0.94 });
      };

      const onRelease = () => {
        if (!pressed) return;
        pressed = false;
        Anim.animateButtonRelease(target, { duration: 130 });
      };

      btn.addEventListener("pointerdown", onPress);
      btn.addEventListener("pointerup", onRelease);
      btn.addEventListener("pointercancel", onRelease);
      btn.addEventListener("pointerleave", (e) => {
        if (pressed && e.pointerType === "mouse") onRelease();
      });
    });
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
    if (!btn) return;
    wireMenuPressFeedback(btn);
    loadMenuAnimations().then((Anim) => {
      if (!Anim || !btn.isConnected) return;
      Anim.animateMenuCardEnter(btn, {
        delay: entranceOptions?.delay ?? 0,
        duration: entranceOptions?.duration ?? 360,
        y: entranceOptions?.y ?? 18,
        ...entranceOptions,
      });
    });
  }

  async function playMenuEntrance() {
    const token = ++menuEntranceToken;
    const Anim = await loadMenuAnimations();
    if (!Anim || token !== menuEntranceToken || !root) return;

    setMenuEntrancePending(true);

    if (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) {
      setMenuEntrancePending(false);
      return;
    }

    const STAGGER = 46;
    let t = 0;

    document.querySelectorAll(".cr-tagline").forEach((el) => {
      Anim.animateMenuReveal(el, { delay: t, duration: 300, y: 10, ease: "outExpo" });
    });

    t += 36;
    document.querySelectorAll(".cr-title-word").forEach((el, i) => {
      Anim.animateMenuCardEnter(el, { delay: t + i * 32, duration: 340, y: 14 });
    });

    t += 100;
    document.querySelectorAll(".cr-buttons .cr-btn").forEach((el, i) => {
      Anim.animateMenuCardEnter(el, { delay: t + i * STAGGER, duration: 380, y: 18 });
    });

    t += STAGGER * 4 + 36;
    const levelsHd = document.querySelector(".cr-levels-hd");
    if (levelsHd) Anim.animateMenuReveal(levelsHd, { delay: t, duration: 260, y: 8 });

    document.querySelectorAll(".cr-level-btn:not(.cr-level-btn--disabled)").forEach((el, i) => {
      Anim.animateMenuCardEnter(el, { delay: t + 28 + i * STAGGER, duration: 360, y: 16 });
    });

    t += STAGGER * 2 + 72;

    const cartWrap = document.querySelector(".cr-cart-wrap");
    if (cartWrap) Anim.animateMenuReveal(cartWrap, { delay: t, duration: 380, y: 12 });

    const stats = $("cr-stats-local");
    if (stats) Anim.animateMenuReveal(stats, { delay: t + 40, duration: 360, y: 12 });

    if (playerCard) Anim.animateMenuReveal(playerCard, { delay: t + 20, duration: 400, y: 14 });

    const audioPanel = $("cr-audio-panel");
    if (audioPanel) Anim.animateMenuReveal(audioPanel, { delay: t + 80, duration: 320, y: 10 });

    const controls = $("cr-controls");
    if (controls) Anim.animateMenuReveal(controls, { delay: t + 110, duration: 320, y: 10 });

    window.setTimeout(() => {
      if (token === menuEntranceToken) setMenuEntrancePending(false);
    }, t + 110 + 420);
  }

  // ─── Init ─────────────────────────────────────────────────────────────────
  root?.classList.add("cr-menu-enter-pending");
  document.addEventListener("pointerdown", function startMenuAudio() {
    if (typeof window.__cartRaveTryStartMenuMusic === "function") {
      window.__cartRaveTryStartMenuMusic();
      document.removeEventListener("pointerdown", startMenuAudio, true);
    }
  }, { capture: true });

  // Restore the player's last chosen color, or seed localStorage with the default.
  const savedCustomization = loadCustomization();
  applyCustomizationToState(savedCustomization);
  saveCustomization({
    colorMode: state.colorMode,
    color: state.colorMode === 'custom' ? CUSTOM_COLOR_ID : (PALETTE_GAME[state.playerIdx] || PALETTE_GAME[0]),
    customHue: state.customHue,
  });

  initSpotlights();
  initParticles();
  updateSpotlights();
  updateParticles();
  buildColorChips();
  updateCustomHueUi();
  initLevelSelect();
  initCartTooltipTap();
  initCustomizeScreen();
  renderCart();
  applyPalette();
  updateVolume();
  nameText.textContent = state.name;
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
      scanEl.style.opacity = CONFIG.scanOpacityBase + CONFIG.intensity * CONFIG.scanOpacityPerIntensity;
      floorEl.style.opacity = CONFIG.floorOpacityBase + CONFIG.intensity * CONFIG.floorOpacityPerIntensity;
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
      window.addEventListener('cartrave:menu', (e) => cb(e.detail.action));
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
      const saved = loadCustomization();
      return {
        colorMode: state.colorMode,
        color: state.colorMode === 'custom' ? CUSTOM_COLOR_ID : (PALETTE_GAME[state.playerIdx] || PALETTE_GAME[0]),
        customHue: state.customHue,
        hex: state.colorMode === 'custom' ? hueToNeonHex(state.customHue) : null,
        cssHex: getActiveColorCss(),
      };
    },
    getColor() {
      if (state.colorMode === 'custom') return CUSTOM_COLOR_ID;
      return PALETTE_GAME[state.playerIdx] || PALETTE_GAME[0];
    },
    getColorCss() {
      return getActiveColorCss();
    },
  };
})();
