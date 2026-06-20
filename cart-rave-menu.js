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

  const HANDLE_PARTS = [
    ["CART", "BASS", "NEON", "TROLLEY", "WHEEL", "RAVE", "GLOW", "KICK", "BOOM", "ZAP", "DISCO", "STROBE"],
    ["LORD", "QUEEN", "KILLER", "RIDER", "GOBLIN", "WIZARD", "DEMON", "DADDY", "NINJA", "WRECK", "BEAST", "PRINCE"],
  ];
  const rollHandle = () => {
    const a = HANDLE_PARTS[0][Math.floor(Math.random() * HANDLE_PARTS[0].length)];
    const b = HANDLE_PARTS[1][Math.floor(Math.random() * HANDLE_PARTS[1].length)];
    return `${a}${b}`;
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
    const base = pool[Math.floor(Math.random() * pool.length)] || "CartRaver";
    const suffix = String(Math.floor(Math.random() * 100)).padStart(2, "0");
    return `${base}${suffix}`;
  };

  // * Game color IDs in slot order — must match PALETTE = Object.keys(CART_COLORS) in main.js.
  const PALETTE_GAME = ['pink', 'blue', 'green', 'yellow', 'neonOrange'];
  const COLOR_ARIA_LABELS = ['Pink', 'Blue', 'Green', 'Yellow', 'Neon orange'];

  // ─── State ────────────────────────────────────────────────────────────────
  const state = {
    palette: PALETTES[CONFIG.palette] || PALETTES.classic,
    playerIdx: 0,
    name: localStorage.getItem("cartRaveUsername") || rollPlayerName(),
    muted: false,
    vol: CONFIG.defaultVolume,
    beat: 0,
    tilt: 0,
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
  const colorRow = $("cr-color-row");
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
  const spotlightPool = [];
  const particlePool = [];
  const PARTICLE_POOL_MAX = Math.round(
    CONFIG.particleCountBase + 10 * CONFIG.particleCountPerIntensity
  );
  // NOTE: Keyboard/mouse gating toast is driven by main.js (mobile gameplay block).

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

  // ─── Build color chips ────────────────────────────────────────────────────
  /**
   * Rebuilds the player color picker chips and wires click handlers.
   * Syncs active chip, localStorage, cart preview, and palette CSS vars.
   */
  function buildColorChips() {
    colorRow.setAttribute('role', 'radiogroup');
    colorRow.setAttribute('aria-label', 'Player Color Selection');
    const p = state.palette;
    let html = "";
    p.players.forEach((col, i) => {
      const isActive = state.playerIdx === i;
      const colorLabel = COLOR_ARIA_LABELS[i] || `Color ${i + 1}`;
      html += `<button class="cr-color-chip ${isActive ? 'active' : ''}" data-idx="${i}" style="--cc:${col};" role="radio" aria-checked="${isActive}" aria-label="${colorLabel}">
        ${makeMiniCart(col)}
      </button>`;
    });
    colorRow.innerHTML = html;
    colorRow.querySelectorAll('.cr-color-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        state.playerIdx = parseInt(chip.dataset.idx, 10);
        localStorage.setItem('cartRaveColor', PALETTE_GAME[state.playerIdx] || PALETTE_GAME[0]);
        buildColorChips();
        renderCart();
        applyPalette();
      });
    });
  }

  // ─── Render cart ──────────────────────────────────────────────────────────
  /**
   * Renders the menu cart SVG and shadow for the currently selected player color.
   */
  function renderCart() {
    const color = state.palette.players[state.playerIdx];
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
    const pc = p.players[state.playerIdx];

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

    // Buttons
    document.querySelectorAll('.cr-btn').forEach(btn => {
      const key = btn.dataset.colorkey;
      const c = key === 'primary' ? p.primary
              : key === 'secondary' ? p.secondary
              : key === 'tertiary' ? p.tertiary
              : key === 'p2' ? p.players[2]
              : p.primary;
      btn.style.setProperty('--glow', c);
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
    state.name = (nameInput.value || '').toUpperCase().slice(0, CONFIG.nameMaxLength) || state.name;
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
      // Dispatch a custom event for the host app to listen to
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

  // ─── Init ─────────────────────────────────────────────────────────────────
  document.addEventListener("pointerdown", function startMenuAudio() {
    if (typeof window.__cartRaveTryStartMenuMusic === "function") {
      window.__cartRaveTryStartMenuMusic();
      document.removeEventListener("pointerdown", startMenuAudio, true);
    }
  }, { capture: true });

  // Restore the player's last chosen color, or seed localStorage with the default.
  const _savedGameColor = localStorage.getItem('cartRaveColor');
  const _savedColorIdx = PALETTE_GAME.indexOf(_savedGameColor);
  if (_savedColorIdx >= 0 && _savedColorIdx < state.palette.players.length) {
    state.playerIdx = _savedColorIdx;
  } else {
    state.playerIdx = 0;
    localStorage.setItem('cartRaveColor', PALETTE_GAME[state.playerIdx] || PALETTE_GAME[0]);
  }

  initSpotlights();
  initParticles();
  updateSpotlights();
  updateParticles();
  buildColorChips();
  renderCart();
  applyPalette();
  updateVolume();
  nameText.textContent = state.name;

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
      if (root) root.style.display = 'none';
    },
    show() {
      if (root) {
        root.style.display = '';
        root.style.opacity = '1';
        root.style.pointerEvents = '';
        root.removeAttribute('aria-hidden');
      }
      startMenuAnimations();
    },
    onMenu(cb) {
      window.addEventListener('cartrave:menu', (e) => cb(e.detail.action));
    },
  };
})();
