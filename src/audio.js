// audio.js — modular audio interface/delegates + HTML music playback (Web Audio routed)

import { CONFIG } from "./config.js";

let _sfx = null;
let _leaderHum = null;

/** @type {THREE.AudioListener | null} */
let _audioListener = null;
/** @type {AudioContext | null} */
let _ctx = null;

/** @type {(() => number) | null} */
let _getMasterGain = null;

/** @type {(() => boolean) | null} */
let _getIsMuted = null;

/** @type {(() => number) | null} */
let _getSfxVolume = null;

/** @type {(() => boolean) | null} */
let _getMenuVisible = null;

/** @type {HTMLAudioElement | null} */
let menuMusicEl = null;
/** @type {MediaElementAudioSourceNode | null} */
let menuMusicSource = null;
/** @type {GainNode | null} */
let menuMusicGain = null;

/** @type {HTMLAudioElement[]} */
let gameMusicElements = [];
/** @type {(MediaElementAudioSourceNode | null)[]} */
let gameMusicSources = [];
/** @type {(GainNode | null)[]} */
let gameMusicGains = [];

let activeTrackIndex = -1;
let musicInitialized = false;
let menuMusicStarted = false;
let gameMusicStarted = false;
let musicUnavailable = false;
let webAudioWired = false;
let gameMusicErrorSkips = 0;
/** @type {ReturnType<typeof setTimeout>[]} */
let gameMusicPauseTimers = [];

/** @type {string[]} */
let gameMusicUrls = [];

let gameMusicElementsCreated = false;

// * Dev-only: block music autostart on Vite full reload until first click/keypress this page load.
let devMusicUserEnabled = !import.meta.env.DEV;

/** @returns {boolean} */
function devAllowsAutoplayMusic() {
  return devMusicUserEnabled;
}

/** @returns {void} */
function installDevMusicGate() {
  if (!import.meta.env.DEV || devMusicUserEnabled) return;
  const unlock = () => {
    devMusicUserEnabled = true;
    window.removeEventListener("pointerdown", unlock, true);
    window.removeEventListener("keydown", unlock, true);
  };
  window.addEventListener("pointerdown", unlock, { capture: true });
  window.addEventListener("keydown", unlock, { capture: true });
}

/** @param {number} vol @returns {number} */
function calcVol(vol) {
  return Math.max(0, Math.min(1, vol));
}

/** @returns {number} */
function getMusicTargetVolume() {
  return calcVol(CONFIG.audio.musicVolume * (_getIsMuted?.() ? 0 : (_getMasterGain?.() ?? 0)));
}

function getMusicOutputNode() {
  // * Route music to the context destination — keeps menu/game music independent of SFX listener gain.
  return _ctx?.destination ?? null;
}

/**
 * * Routes preloaded HTMLAudio elements through Web Audio gain nodes.
 * Called from {@link registerMusicVolumeDeps} because initMusic runs before AudioListener exists.
 * @returns {void}
 */
function wireMusicToWebAudio() {
  if (!_ctx) return;
  const dest = getMusicOutputNode();
  if (!dest) return;

  try {
    if (menuMusicEl && !menuMusicSource) {
      menuMusicEl.volume = 1;
      menuMusicSource = _ctx.createMediaElementSource(menuMusicEl);
      menuMusicGain = _ctx.createGain();
      menuMusicGain.gain.value = menuMusicStarted ? getMusicTargetVolume() : 0.0001;
      menuMusicSource.connect(menuMusicGain);
      menuMusicGain.connect(dest);
    }

    for (let i = 0; i < gameMusicElements.length; i += 1) {
      const el = gameMusicElements[i];
      if (!el || gameMusicSources[i]) continue;
      el.volume = 1;
      const src = _ctx.createMediaElementSource(el);
      const gain = _ctx.createGain();
      gain.gain.value = (gameMusicStarted && i === activeTrackIndex) ? getMusicTargetVolume() : 0.0001;
      src.connect(gain);
      gain.connect(dest);
      gameMusicSources[i] = src;
      gameMusicGains[i] = gain;
    }

    webAudioWired = Boolean(menuMusicSource || gameMusicSources.some(Boolean));
  } catch {
    // ! Fall back to HTML5 element volume if Web Audio routing fails — must not block game boot.
    try { menuMusicSource?.disconnect(); } catch {}
    try { menuMusicGain?.disconnect(); } catch {}
    gameMusicSources.forEach((s) => { try { s?.disconnect(); } catch {} });
    gameMusicGains.forEach((g) => { try { g?.disconnect(); } catch {} });
    menuMusicSource = null;
    menuMusicGain = null;
    gameMusicSources = [];
    gameMusicGains = [];
    webAudioWired = false;
  }
}

/**
 * * Creates game-track Audio elements on demand; idle prefetch uses metadata-only preload.
 * @param {{ preloadActive?: boolean }} [options]
 * @returns {void}
 */
function ensureGameMusicElements(options = {}) {
  const { preloadActive = false } = options;
  if (!gameMusicUrls.length) return;

  if (!gameMusicElementsCreated) {
    gameMusicElementsCreated = true;
    gameMusicElements = [];
    gameMusicSources = [];
    gameMusicGains = [];

    for (let i = 0; i < gameMusicUrls.length; i += 1) {
      const a = new Audio();
      a.loop = false;
      a.preload = "metadata";
      a.src = gameMusicUrls[i];
      a.addEventListener("error", onGameMusicError);
      a.addEventListener("ended", () => {
        if (_getMenuVisible?.()) return;
        advanceGameMusicTrack();
      });
      gameMusicElements.push(a);
      gameMusicSources.push(null);
      gameMusicGains.push(null);
    }
    if (activeTrackIndex < 0) activeTrackIndex = 0;
    wireMusicToWebAudio();
  }

  if (preloadActive && activeTrackIndex >= 0) {
    preloadGameMusicTrack(activeTrackIndex);
  }
}

/** @param {number} index @returns {void} */
function preloadGameMusicTrack(index) {
  const el = gameMusicElements[index];
  if (!el) return;
  if (el.preload !== "auto") {
    el.preload = "auto";
    try { el.load(); } catch {}
  }
}

/** @returns {void} */
function scheduleGameMusicIdlePrefetch() {
  if (!gameMusicUrls.length) return;
  const run = () => {
    if (gameMusicElementsCreated) return;
    ensureGameMusicElements();
  };
  if (typeof requestIdleCallback === "function") {
    requestIdleCallback(run, { timeout: 5000 });
  } else {
    setTimeout(run, 3000);
  }
}

/** @returns {void} */
function onGameMusicError() {
  if (gameMusicUrls.length <= 1) {
    musicUnavailable = true;
    return;
  }
  gameMusicErrorSkips += 1;
  if (gameMusicErrorSkips >= gameMusicUrls.length) {
    musicUnavailable = true;
    return;
  }
  advanceGameMusicTrack();
}

/** @returns {void} */
function clearGameMusicPauseTimers() {
  for (const timerId of gameMusicPauseTimers) clearTimeout(timerId);
  gameMusicPauseTimers = [];
}

/** @returns {void} */
export function clearAudioRefs() {
  _sfx = null;
  _leaderHum = null;
}

/**
 * * Wires live audio subsystems into this delegation layer.
 * @param {{ sfx?: object, leaderHum?: object }} refs
 * @returns {void}
 */
export function registerAudioRefs(refs) {
  if (refs.sfx !== undefined) _sfx = refs.sfx;
  if (refs.leaderHum !== undefined) _leaderHum = refs.leaderHum;

  if (CONFIG.debug.audio) {
    // eslint-disable-next-line no-console
    console.log("[audio] registerAudioRefs", {
      sfx: Boolean(_sfx),
      leaderHum: Boolean(_leaderHum),
    });
  }
}

/**
 * * Wires Three.js listener and volume getters used by {@link applyAudioVolume}.
 *
 * @param {{ audioListener: THREE.AudioListener, getSfxVolume: () => number }} deps
 */
export function registerMusicVolumeDeps(deps) {
  _audioListener = deps.audioListener;
  _ctx = _audioListener?.context || null;
  _getSfxVolume = deps.getSfxVolume;
  if (musicInitialized) wireMusicToWebAudio();
}

/**
 * Initializes menu music preload and shuffled game playlist (game tracks load lazily).
 *
 * @param {{ getMasterGain: () => number, getIsMuted: () => boolean, getMenuVisible: () => boolean, startMenuOnInit?: boolean }} options
 */
export function initMusic(options) {
  if (musicInitialized) return;
  musicInitialized = true;

  installDevMusicGate();
  _getMasterGain = options.getMasterGain;
  _getIsMuted = options.getIsMuted;
  _getMenuVisible = options.getMenuVisible;

  const menuMusicUrl = new URL("sounds/menu.mp3", window.location.href).toString();
  menuMusicEl = new Audio();
  menuMusicEl.loop = true;
  menuMusicEl.preload = "auto";
  menuMusicEl.src = menuMusicUrl;
  try { menuMusicEl.load(); } catch {}

  const gameMusicFiles = ["music.mp3", "song2.mp3", "song3.mp3", "song4.mp3"];
  gameMusicUrls = gameMusicFiles.map((f) =>
    new URL(`sounds/${f}`, window.location.href).toString(),
  );
  for (let i = gameMusicUrls.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [gameMusicUrls[i], gameMusicUrls[j]] = [gameMusicUrls[j], gameMusicUrls[i]];
  }

  gameMusicElements = [];
  gameMusicSources = [];
  gameMusicGains = [];
  gameMusicElementsCreated = false;
  activeTrackIndex = 0;

  scheduleGameMusicIdlePrefetch();

  wireMusicToWebAudio();

  window.__cartRaveTryStartMenuMusic = tryStartMenuMusic;
  const attemptUnlock = () => {
    if (_ctx && _ctx.state === "suspended") void _ctx.resume();
    if (_getMenuVisible?.() && !menuMusicStarted && devAllowsAutoplayMusic()) {
      tryStartMenuMusic();
    }
  };
  window.addEventListener("pointerdown", attemptUnlock, { passive: true });
  window.addEventListener("keydown", attemptUnlock, { passive: true });

  if (options.startMenuOnInit !== false && _getMenuVisible?.() && devAllowsAutoplayMusic()) {
    tryStartMenuMusic();
  }
}

/** @returns {void} */
function advanceGameMusicTrack() {
  if (!gameMusicElements.length) return;

  const oldIndex = activeTrackIndex;
  activeTrackIndex = (activeTrackIndex + 1) % gameMusicElements.length;
  preloadGameMusicTrack(activeTrackIndex);

  if (oldIndex >= 0 && gameMusicGains[oldIndex] && _ctx) {
    const oldGain = gameMusicGains[oldIndex].gain;
    oldGain.cancelScheduledValues(_ctx.currentTime);
    oldGain.setValueAtTime(oldGain.value, _ctx.currentTime);
    oldGain.linearRampToValueAtTime(0.0001, _ctx.currentTime + 0.5);
  }
  if (oldIndex >= 0) {
    try { gameMusicElements[oldIndex].pause(); } catch {}
  }

  gameMusicStarted = false;
  startGameMusic();
}

/** @returns {void} */
export function tryStartMenuMusic() {
  if (!menuMusicEl || menuMusicStarted || !devAllowsAutoplayMusic()) return;
  if (_getIsMuted?.()) return;
  if (_getMenuVisible && !_getMenuVisible()) return;

  if (_ctx && _ctx.state === "suspended") void _ctx.resume();
  stopGameMusic();

  if (menuMusicGain && _ctx) {
    menuMusicGain.gain.cancelScheduledValues(_ctx.currentTime);
    menuMusicGain.gain.setValueAtTime(0.0001, _ctx.currentTime);
    menuMusicGain.gain.linearRampToValueAtTime(getMusicTargetVolume(), _ctx.currentTime + 0.5);
  } else {
    menuMusicEl.volume = getMusicTargetVolume();
  }

  void menuMusicEl.play().then(() => {
    if (_getMenuVisible?.()) {
      menuMusicStarted = true;
      if (menuMusicGain && _ctx) {
        menuMusicGain.gain.cancelScheduledValues(_ctx.currentTime);
        menuMusicGain.gain.setValueAtTime(getMusicTargetVolume(), _ctx.currentTime);
      }
    } else {
      try { menuMusicEl.pause(); } catch {}
    }
  }).catch(() => {});
}

/** @returns {void} */
export function stopMenuMusic() {
  if (!menuMusicEl) return;
  if (menuMusicGain && _ctx) {
    menuMusicGain.gain.cancelScheduledValues(_ctx.currentTime);
    menuMusicGain.gain.setValueAtTime(menuMusicGain.gain.value, _ctx.currentTime);
    menuMusicGain.gain.linearRampToValueAtTime(0.0001, _ctx.currentTime + 0.3);
  }
  setTimeout(() => {
    try { menuMusicEl.pause(); menuMusicEl.currentTime = 0; } catch {}
  }, 350);
  menuMusicStarted = false;
}

/** @returns {void} */
export function startMenuMusic() {
  if (!menuMusicEl) return;
  menuMusicStarted = false;
  tryStartMenuMusic();
}

/** @returns {void} */
export function startGameMusic() {
  if (!gameMusicUrls.length || gameMusicStarted || musicUnavailable) return;
  if (!devAllowsAutoplayMusic()) return;
  if (_getMenuVisible?.()) return;

  ensureGameMusicElements({ preloadActive: true });
  if (!gameMusicElements.length) return;
  if (activeTrackIndex < 0) activeTrackIndex = 0;

  clearGameMusicPauseTimers();
  if (_ctx && _ctx.state === "suspended") void _ctx.resume();

  const el = gameMusicElements[activeTrackIndex];
  const gain = gameMusicGains[activeTrackIndex];

  if (gain && _ctx) {
    gain.gain.cancelScheduledValues(_ctx.currentTime);
    gain.gain.setValueAtTime(0.0001, _ctx.currentTime);
    gain.gain.linearRampToValueAtTime(getMusicTargetVolume(), _ctx.currentTime + 0.5);
  } else {
    el.volume = getMusicTargetVolume();
  }

  void el.play().then(() => {
    if (!_getMenuVisible?.()) {
      gameMusicStarted = true;
    } else {
      try { el.pause(); } catch {}
    }
  }).catch(() => {});
}

/** @returns {void} */
export function stopGameMusic() {
  if (!gameMusicElements.length) return;

  clearGameMusicPauseTimers();
  for (let i = 0; i < gameMusicElements.length; i += 1) {
    if (gameMusicGains[i] && _ctx) {
      const g = gameMusicGains[i].gain;
      g.cancelScheduledValues(_ctx.currentTime);
      g.setValueAtTime(g.value, _ctx.currentTime);
      g.linearRampToValueAtTime(0.0001, _ctx.currentTime + 0.3);
    }
    gameMusicPauseTimers.push(setTimeout((idx) => {
      try { gameMusicElements[idx].pause(); } catch {}
    }, 350, i));
  }
  gameMusicStarted = false;
}

/**
 * Crossfade: fade out menu music (used when entering the game).
 * @returns {void}
 */
export function fadeOutMenuMusic() {
  stopMenuMusic();
}

/**
 * Crossfade: fade in game music (used when entering the game).
 * @returns {void}
 */
export function fadeInGameMusic() {
  if (!devAllowsAutoplayMusic()) return;
  if (!gameMusicUrls.length) return;
  if (activeTrackIndex < 0) activeTrackIndex = 0;
  startGameMusic();
}

/**
 * Stops all music, cancels fade loops, and releases HTML audio elements.
 * @returns {void}
 */
export function destroyMusic() {
  clearGameMusicPauseTimers();
  if (menuMusicEl) {
    menuMusicEl.pause();
    menuMusicEl.src = "";
  }
  gameMusicElements.forEach((a) => {
    if (a) {
      a.pause();
      a.src = "";
    }
  });
  try { menuMusicSource?.disconnect(); } catch {}
  try { menuMusicGain?.disconnect(); } catch {}
  gameMusicSources.forEach((s) => { try { s?.disconnect(); } catch {} });
  gameMusicGains.forEach((g) => { try { g?.disconnect(); } catch {} });

  menuMusicEl = null;
  menuMusicSource = null;
  menuMusicGain = null;
  gameMusicElements = [];
  gameMusicSources = [];
  gameMusicGains = [];
  gameMusicUrls = [];
  gameMusicElementsCreated = false;
  menuMusicStarted = false;
  gameMusicStarted = false;
  musicUnavailable = false;
  musicInitialized = false;
  webAudioWired = false;
  gameMusicErrorSkips = 0;
  activeTrackIndex = -1;
}

/**
 * Applies master/sfx volume to WebAudio listener and HTML music elements.
 * @returns {void}
 */
export function applyAudioVolume() {
  const isMuted = _getIsMuted?.() ?? false;
  const masterGain = _getMasterGain?.() ?? 0;
  const sfxVolume = _getSfxVolume?.() ?? 0;
  const musicVol = calcVol(CONFIG.audio.musicVolume * (isMuted ? 0 : masterGain));

  if (_audioListener && typeof _audioListener.setMasterVolume === "function") {
    _audioListener.setMasterVolume(isMuted ? 0 : sfxVolume);
  }

  if (_ctx) {
    const now = _ctx.currentTime;
    if (menuMusicGain && menuMusicStarted) {
      menuMusicGain.gain.cancelScheduledValues(now);
      menuMusicGain.gain.setValueAtTime(musicVol, now);
    }
    if (gameMusicGains[activeTrackIndex] && gameMusicStarted) {
      const g = gameMusicGains[activeTrackIndex].gain;
      g.cancelScheduledValues(now);
      g.setValueAtTime(musicVol, now);
    }
  } else {
    if (menuMusicEl) menuMusicEl.volume = musicVol;
    if (activeTrackIndex >= 0 && gameMusicElements[activeTrackIndex]) {
      gameMusicElements[activeTrackIndex].volume = musicVol;
    }
  }

  try { _leaderHum?.resyncVolume?.(); } catch {}
}

/**
 * Updates mute state via caller-owned setter, then refreshes volumes.
 *
 * @param {boolean} muted
 * @param {(muted: boolean) => void} setMutedState Caller persists mute (localStorage, sfx._muted).
 * @returns {void}
 */
export function setMuted(muted, setMutedState) {
  setMutedState(Boolean(muted));
  try { applyAudioVolume(); } catch (e) {}
}

/**
 * * Plays a cart collision impact scaled by intensity (0–1).
 * @param {number} intensity
 * @returns {void}
 */
export function playCollision(intensity) {
  _sfx?.playCollision?.(intensity);
}

/** @returns {void} */
export function playNitro() {
  _sfx?.playNitro?.();
}

/** @returns {void} */
export function playHop() {
  _sfx?.playHop?.();
}

/** @returns {void} */
export function playFallOff() {
  _sfx?.playFallOff?.();
}

/**
 * * Plays wheel screech feedback scaled by intensity (0–1).
 * @param {number} intensity
 * @returns {void}
 */
export function playWheelScreech(intensity) {
  _sfx?.playWheelScreech?.(intensity);
}

/** @returns {void} */
export function resyncLeaderHumVolume() {
  _leaderHum?.resyncVolume?.();
}

/**
 * * Highlights the current round leader for positional hum audio.
 * @param {number | null | undefined} slotIndex
 * @returns {void}
 */
export function setLeader(slotIndex) {
  _leaderHum?.setLeader?.(slotIndex);
}

/**
 * * Updates leader-hum 3D position from a cart body.
 * @param {object | null | undefined} cart
 * @returns {void}
 */
export function updateLeaderHumPosition(cart) {
  _leaderHum?.updatePositionFromCart?.(cart);
}
