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
  };

  const HANDLE_PARTS = [
    ["CART", "BASS", "NEON", "TROLLEY", "WHEEL", "RAVE", "GLOW", "KICK", "BOOM", "ZAP", "DISCO", "STROBE"],
    ["LORD", "QUEEN", "KILLER", "RIDER", "GOBLIN", "WIZARD", "DEMON", "DADDY", "NINJA", "WRECK", "BEAST", "PRINCE"],
  ];
  const rollHandle = () => {
    const a = HANDLE_PARTS[0][Math.floor(Math.random() * HANDLE_PARTS[0].length)];
    const b = HANDLE_PARTS[1][Math.floor(Math.random() * HANDLE_PARTS[1].length)];
    const n = Math.floor(Math.random() * 90 + 10);
    return `${a}${b}${n}`;
  };

  // * Game color IDs in slot order — must match PALETTE = Object.keys(CART_COLORS) in main.js.
  const PALETTE_GAME = ['pink', 'blue', 'green', 'yellow', 'neonOrange'];

  // ─── State ────────────────────────────────────────────────────────────────
  const state = {
    palette: PALETTES[CONFIG.palette] || PALETTES.classic,
    playerIdx: 0,
    name: "BASSLORD42",
    muted: false,
    vol: 0.25,
    beat: 0,
    tilt: 0,
    globalOnline: 2431,
    globalPlayed: 1847293,
  };

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
  const onlineEl = $("stat-online");
  const playsEl = $("stat-plays");

  // ─── Neon cart SVG builder ────────────────────────────────────────────────
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

  // ─── Build spotlights ─────────────────────────────────────────────────────
  function buildSpotlights() {
    if (!CONFIG.showSpotlights) { lightsEl.innerHTML = ""; return; }
    const p = state.palette;
    const colors = [p.primary, p.secondary, p.tertiary, p.players[0]];
    let html = "";
    for (let i = 0; i < 4; i++) {
      html += `<div class="cr-light" style="
        --col:${colors[i % colors.length]};
        --dur:${5 + i * 1.3}s;
        --delay:${i * -0.7}s;
        left:${12 + i * 22}%;
        opacity:${0.35 + CONFIG.intensity * 0.06};
      "></div>`;
    }
    lightsEl.innerHTML = html;
  }

  // ─── Build particles ──────────────────────────────────────────────────────
  function buildParticles() {
    if (!CONFIG.showParticles) { particlesEl.innerHTML = ""; return; }
    const count = Math.round(20 + CONFIG.intensity * 4);
    const p = state.palette;
    const colors = [p.primary, p.secondary, p.tertiary];
    let html = "";
    for (let i = 0; i < count; i++) {
      const left = Math.random() * 100;
      const size = 2 + Math.random() * 5;
      const dur = 8 + Math.random() * 14;
      const delay = -Math.random() * 20;
      const color = colors[i % colors.length];
      html += `<div class="cr-particle" style="
        left:${left}%;
        width:${size}px; height:${size}px;
        background:${color};
        box-shadow: 0 0 ${size * 2}px ${color};
        animation-duration:${dur}s;
        animation-delay:${delay}s;
      "></div>`;
    }
    particlesEl.innerHTML = html;
  }

  // ─── Build color chips ────────────────────────────────────────────────────
  function buildColorChips() {
    const p = state.palette;
    let html = "";
    p.players.forEach((col, i) => {
      html += `<button class="cr-color-chip ${state.playerIdx === i ? 'active' : ''}" data-idx="${i}" style="--cc:${col};">
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
  function renderCart() {
    const color = state.palette.players[state.playerIdx];
    cartHolder.innerHTML = makeCartSVG(color);
    cartShadow.style.background = `radial-gradient(ellipse, ${color}66, transparent 70%)`;
  }

  // ─── Apply palette to all CSS vars / floor / title / buttons ──────────────
  function applyPalette() {
    const p = state.palette;
    const pc = p.players[state.playerIdx];

    root.style.background = `radial-gradient(ellipse at center 40%, ${p.bg} 0%, #000 90%)`;

    floorGrid.style.setProperty('--c1', p.primary);
    floorGrid.style.setProperty('--c2', p.secondary);
    floorEl.style.opacity = 0.3 + CONFIG.intensity * 0.05;

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
    onlineEl.style.color = p.secondary;
    playsEl.style.color = p.primary;

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
  nameDisplay.addEventListener('click', () => {
    nameInput.value = state.name;
    nameInput.style.display = '';
    nameDisplay.style.display = 'none';
    nameInput.focus();
    nameInput.select();
  });
  const finishNameEdit = () => {
    state.name = (nameInput.value || '').toUpperCase().slice(0, 12) || state.name;
    nameText.textContent = state.name;
    nameInput.style.display = 'none';
    nameDisplay.style.display = '';
  };
  nameInput.addEventListener('blur', finishNameEdit);
  nameInput.addEventListener('input', () => {
    nameInput.value = nameInput.value.toUpperCase().slice(0, 12);
  });
  nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') finishNameEdit();
  });
  rerollBtn.addEventListener('click', () => {
    state.name = rollHandle();
    nameText.textContent = state.name;
  });

  // ─── Mute / volume ────────────────────────────────────────────────────────
  function updateVolume() {
    const w = (state.muted ? 0 : state.vol) * 100;
    if (musicVolFill) musicVolFill.style.width = w + '%';
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
      console.log('menu action:', btn.dataset.action);
      // Dispatch a custom event for the host app to listen to
      window.dispatchEvent(new CustomEvent('cartrave:menu', {
        detail: { action: btn.dataset.action }
      }));
    });
  });

  // ─── Beat + tilt animation ────────────────────────────────────────────────
  const bpm = 128;
  const interval = 60000 / bpm;
  let lastBeat = performance.now();
  const animStart = performance.now();
  function animLoop(now) {
    // Beat
    if (CONFIG.cartDance) {
      if (now - lastBeat > interval) {
        state.beat = 1;
        lastBeat = now;
      } else {
        const since = now - lastBeat;
        state.beat = Math.max(0, 1 - since / (interval * 0.8));
      }
    } else {
      state.beat = 0;
    }
    // Tilt
    const elapsed = (now - animStart) / 1000;
    state.tilt = Math.sin(elapsed * 1.2) * 0.6;

    // Apply to cart
    const pulse = 1 + state.beat * 0.06;
    const bob = Math.sin(state.beat * Math.PI) * -8;
    const svg = cartHolder.querySelector('svg');
    if (svg) {
      svg.style.transform = `translateY(${bob}px) rotate(${state.tilt * 6}deg) scale(${pulse})`;
    }
    cartShadow.style.transform = `translateX(-50%) scale(${1 - state.beat * 0.15})`;

    // Title subtle scale pulse
    titleEl.style.transform = `scale(${1 + state.beat * 0.015})`;

    // Floor parallax
    if (floorGrid) {
      floorGrid.style.transform = `rotateX(62deg) translateY(${state.beat * -4}px)`;
    }

    requestAnimationFrame(animLoop);
  }
  requestAnimationFrame(animLoop);

  // ─── Global stats tick ────────────────────────────────────────────────────
  function fmt(n) { return n.toLocaleString(); }
  setInterval(() => {
    state.globalOnline = Math.max(1800, state.globalOnline + Math.round((Math.random() - 0.45) * 8));
    state.globalPlayed += Math.floor(Math.random() * 3);
    onlineEl.textContent = fmt(state.globalOnline);
    playsEl.textContent = fmt(state.globalPlayed);
  }, 1400);

  // ─── FX toggles via CONFIG ────────────────────────────────────────────────
  if (!CONFIG.showFloor) floorEl.style.display = 'none';
  scanEl.style.opacity = 0.05 + CONFIG.intensity * 0.01;

  // ─── Init ─────────────────────────────────────────────────────────────────
  // Restore the player's last chosen color, or seed localStorage with the default.
  const _savedGameColor = localStorage.getItem('cartRaveColor');
  const _savedColorIdx = PALETTE_GAME.indexOf(_savedGameColor);
  if (_savedColorIdx >= 0) {
    state.playerIdx = _savedColorIdx;
  } else {
    localStorage.setItem('cartRaveColor', PALETTE_GAME[state.playerIdx] || PALETTE_GAME[0]);
  }

  buildSpotlights();
  buildParticles();
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
      buildSpotlights();
      buildParticles();
      buildColorChips();
      renderCart();
      applyPalette();
    },
    setIntensity(n) {
      CONFIG.intensity = Math.max(0, Math.min(10, n));
      buildSpotlights();
      buildParticles();
      scanEl.style.opacity = 0.05 + CONFIG.intensity * 0.01;
      floorEl.style.opacity = 0.3 + CONFIG.intensity * 0.05;
    },
    onMenu(cb) {
      window.addEventListener('cartrave:menu', (e) => cb(e.detail.action));
    },
  };
})();
