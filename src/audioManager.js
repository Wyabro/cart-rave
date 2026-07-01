// audioManager.js — Howler-based audio manager with volume categories, music, and spatial SFX.
// Replaces the HTMLAudio music system in audio.js. Procedural SFX (audioSetup.js) coexists.

import { Howl, Howler } from "howler";

// === Volume state (single source of truth for main.js + procedural SFX) ===

let _masterVol = 0.575; // AUDIO_VOLUME_MAX default from main.js (~0.5 * 1.15)
let _sfxVol = 0.575;
let _musicVol = 0.575;
let _isMuted = false;

// === Howler instances ===

/** @type {Howl | null} */
let menuMusic = null;
/** Whether the menu music was requested to play (set true by playMenuMusic, false by stopMenuMusic). */
let _menuMusicShouldPlay = false;
/** @type {Howl[]} */
let gameMusicTracks = [];
let currentGameTrackIdx = -1;
let gameMusicPlaying = false;
/** @type {Record<string, Howl>} */
const sfxRegistry = {};

// * Default per-SFX volume multipliers — all 1.0 since raw files are loudnorm-normalized.
const _DEFAULT_SFX_VOLUMES = {
  cartCrash: 1.0,
  death: 1.0,
  boost: 1.0,
  hop: 1.0,
  floor: 1.0,
  chargeUp: 1.0,
  countdown_3: 1.0,
  countdown_2: 1.0,
  countdown_1: 1.0,
  countdown_go: 1.0,
};

// * Per-SFX volume multipliers. Initialized from _DEFAULT_SFX_VOLUMES; dev Tweakpane overrides.
/** @type {Record<string, number>} */
const _sfxPerVolumes = { ..._DEFAULT_SFX_VOLUMES };

/**
 * * Applies volume to all per-track Howl instances, factoring in per-SFX multipliers.
 */
function applySfxVolumes() {
  for (const [key, sound] of Object.entries(sfxRegistry)) {
    const perVol = _sfxPerVolumes[key] ?? _DEFAULT_SFX_VOLUMES[key] ?? 1;
    sound.volume(_isMuted ? 0 : _sfxVol * perVol);
  }
}

// * Dev-only: block music autostart on Vite full reload until first interaction.
let devMusicGate = !import.meta.env.DEV;
function installDevMusicGate() {
  if (!import.meta.env.DEV || devMusicGate) return;
  const unlock = () => { devMusicGate = true; };
  window.addEventListener("pointerdown", unlock, { capture: true, once: true });
  window.addEventListener("keydown", unlock, { capture: true, once: true });
}

// === Initialization ===

/**
 * Sets the shared AudioContext for Howler and applies initial volume.
 * Must be called after THREE.AudioListener is created (before any Howl instantiation).
 * @param {AudioContext} audioContext
 */
export function initAudioManager(audioContext) {
  Howler.ctx = audioContext;
  // * Manually wire masterGain — Howler's setupAudioContext() only fires
  // * when !Howler.ctx, but we pre-seed ctx to share THREE's AudioContext.
  Howler.masterGain = audioContext.createGain();
  Howler.masterGain.gain.setValueAtTime(Howler._volume, audioContext.currentTime);
  Howler.masterGain.connect(audioContext.destination);
  // * 6 music tracks × pool=5 + 7 SFX with various pools = ~30 HTML5 audio elements.
  // * Howler's default 10-slot pool only fills as objects are released, so pre-populate it.
  Howler.html5PoolSize = 40;
  for (let i = 0; i < 35; i += 1) {
    const a = new Audio();
    a._unlocked = true;
    Howler._html5AudioPool.push(a);
  }
  Howler.autoUnlock = true;
  installDevMusicGate();
  applyAllVolumes();

  // * Autoplay policy workaround: if menu music was requested before the AudioContext
  // * was running (e.g. first page load), re-trigger play when the context resumes.
  audioContext.addEventListener("statechange", () => {
    if (audioContext.state === "running" && _menuMusicShouldPlay && menuMusic && !menuMusic.playing()) {
      menuMusic.play();
    }
  });
}

// === Volume control ===

function applyAllVolumes() {
  // * Always keep Howler global at 1.0 — music and SFX have independent per-category volumes.
  Howler.volume(1);

  if (menuMusic) menuMusic.volume(_isMuted ? 0 : _musicVol);
  for (const t of gameMusicTracks) {
    if (t) t.volume(_isMuted ? 0 : _musicVol);
  }
  applySfxVolumes();
}

/** @param {number} v 0–1 range */
export function setSfxVolume(v) {
  _sfxVol = Math.max(0, Math.min(1, v));
  applyAllVolumes();
}

/** @param {number} v 0–1 range */
export function setMusicVolume(v) {
  _musicVol = Math.max(0, Math.min(1, v));
  applyAllVolumes();
}

/** @param {boolean} m */
export function setMuted(m) {
  _isMuted = Boolean(m);
  applyAllVolumes();
}

/**
 * Bulk-restore volumes from saved values (called on boot from localStorage).
 * @param {{ master: number, sfx: number, music: number, muted: boolean }} state
 */
export function restoreVolumeState(state) {
  _masterVol = Math.max(0, Math.min(1, state.master));
  _sfxVol = Math.max(0, Math.min(1, state.sfx));
  _musicVol = Math.max(0, Math.min(1, state.music));
  _isMuted = Boolean(state.muted);
  applyAllVolumes();
}

// === Music ===

/**
 * Load the looping menu music track.
 * @param {string} src URL to the audio file
 */
export function loadMenuMusic(src) {
  if (menuMusic) menuMusic.unload();
  menuMusic = new Howl({
    src: [src],
    loop: true,
    volume: _isMuted ? 0 : _musicVol,
    preload: true,
    html5: true, // stream long tracks with HTML5 to save memory
  });
}

/**
 * Load the shuffled game music playlist.
 * @param {string[]} urls
 */
export function loadGamePlaylist(urls) {
  // Unload previous
  for (const t of gameMusicTracks) {
    try { t.unload(); } catch {}
  }
  gameMusicTracks = urls.map((url) => new Howl({
    src: [url],
    volume: _isMuted ? 0 : _musicVol,
    preload: true,
    html5: true,
    onend: function onGameTrackEnd() {
      if (!gameMusicPlaying) return;
      advanceGameTrack();
    },
  }));
  currentGameTrackIdx = -1;
  gameMusicPlaying = false;
}

/** @returns {void} */
export function playMenuMusic() {
  _menuMusicShouldPlay = true;
  if (!menuMusic) return;
  if (!devMusicGate) return;
  if (menuMusic.playing()) return;
  menuMusic.play();
}

/** @returns {void} */
export function stopMenuMusic() {
  _menuMusicShouldPlay = false;
  if (!menuMusic) return;
  menuMusic.stop();
}

/** @returns {void} */
export function playGameMusic() {
  if (!gameMusicTracks.length || gameMusicPlaying) return;
  if (!devMusicGate) return;
  if (currentGameTrackIdx < 0) currentGameTrackIdx = 0;
  gameMusicPlaying = true;
  gameMusicTracks[currentGameTrackIdx]?.play();
}

/** @returns {void} */
export function stopGameMusic() {
  for (const t of gameMusicTracks) {
    try { t?.stop(); } catch {}
  }
  gameMusicPlaying = false;
}

function advanceGameTrack() {
  if (!gameMusicTracks.length) return;
  currentGameTrackIdx = (currentGameTrackIdx + 1) % gameMusicTracks.length;
  if (gameMusicPlaying) {
    gameMusicTracks[currentGameTrackIdx]?.play();
  }
}

// === SFX (file-based, pooled via Howler) ===

/**
 * Register a pooled SFX sound (e.g. cart-crash, future sounds).
 * @param {string} key Unique identifier
 * @param {string} src URL to the audio file
 * @param {{ pool?: number, sprite?: Record<string, [number, number]>, loop?: boolean, rate?: number }} [options]
 */
export function registerSfx(key, src, options = {}) {
  if (sfxRegistry[key]) {
    try { sfxRegistry[key].unload(); } catch {}
  }
  const perVol = _sfxPerVolumes[key] ?? _DEFAULT_SFX_VOLUMES[key] ?? 1;
  sfxRegistry[key] = new Howl({
    src: [src],
    volume: _isMuted ? 0 : _sfxVol * perVol,
    pool: options.pool ?? 4,
    sprite: options.sprite,
    loop: Boolean(options.loop),
    rate: options.rate,
    preload: true,
  });
}

/**
 * Play a registered SFX.
 * @param {string} key Registry key
 * @param {string} [sprite] Sprite name (if using spritesheet)
 * @param {{ rate?: number }} [options] Per-play overrides (rate = playback speed / pitch)
 * @returns {number | null} Sound ID for further control, or null
 */
export function playSfx(key, sprite, options = {}) {
  const sound = sfxRegistry[key];
  if (!sound || _isMuted) return null;
  try {
    const id = sprite ? sound.play(sprite) : sound.play();
    if (id != null && options.rate != null) {
      sound.rate(options.rate, id);
    }
    return id;
  } catch {
    return null;
  }
}

/**
 * Play a randomized cart-crash SFX. Each crash receives a unique playback rate
 * (0.82–1.25) so rapid collisions don't sound like the exact same sample repeated.
 * @returns {number | null} Sound ID
 */
export function playCartCrash() {
  const rate = 0.82 + Math.random() * 0.43;
  return playSfx("cartCrash", undefined, { rate });
}

/**
 * Stop a specific playing instance of a registered SFX by its sound ID.
 * Used to cut the charge-up loop when an Auto-Charge Boost releases early or is interrupted.
 * @param {string} key Registry key
 * @param {number | null | undefined} id Sound ID returned by playSfx
 */
export function stopSfx(key, id) {
  if (id == null) return;
  const sound = sfxRegistry[key];
  if (!sound) return;
  try {
    sound.stop(id);
  } catch {
    // Sound may have already ended or been unloaded.
  }
}

// === Wheel loop (dynamic engine sound) ===

/** @type {Howl | null} */
let wheelLoopHowl = null;
/** @type {number | null} */
let wheelLoopId = null;
let wheelLoopCurrentVolume = 0;
let wheelLoopCurrentRate = 0.7;
let _wheelLoopVolumeScale = 1.0;

/**
 * Get the wheel loop max volume multiplier (dev Tweakpane tuning).
 * @returns {number}
 */
export function getWheelLoopVolumeScale() {
  return _wheelLoopVolumeScale;
}

/**
 * Set the wheel loop max volume multiplier and apply immediately.
 * @param {number} v 0–3+ range
 */
export function setWheelLoopVolumeScale(v) {
  _wheelLoopVolumeScale = Math.max(0, Math.min(5, v));
}

/**
 * Initialize the wheel loop sound as a dedicated single-instance Howl for dynamic
 * volume/pitch control. Called once from main.js after the shared AudioContext is ready.
 * @param {string} src URL to the wheel loop audio file
 */
export function initWheelLoop(src) {
  if (wheelLoopHowl) {
    try { wheelLoopHowl.unload(); } catch {}
  }
  wheelLoopHowl = new Howl({
    src: [src],
    loop: true,
    volume: 0,
    preload: true,
  });
}

/**
 * Start playing the wheel loop at volume 0. Subsequent updateWheelLoop() calls
 * fade it in by raising the volume dynamically. Safe to call when already playing.
 */
function startWheelLoop() {
  if (!wheelLoopHowl) return;
  if (wheelLoopId != null) return;
  wheelLoopCurrentVolume = 0;
  wheelLoopCurrentRate = 0.7;
  try {
    wheelLoopId = wheelLoopHowl.play();
  } catch {
    wheelLoopId = null;
    return;
  }
  if (wheelLoopId != null) {
    wheelLoopHowl.volume(0, wheelLoopId);
    wheelLoopHowl.rate(0.7, wheelLoopId);
  }
}

/**
 * Update the wheel loop volume and pitch based on the cart's current planar speed.
 * Auto-starts the loop on first call if not yet playing.
 * Caller must gate: only call when speed > 1.0 m/s; stopWheelLoop() otherwise.
 *
 * Volume maps 0 → 0, maxSpeed → 0.4 (linear, clamped, scaled by _sfxVol and _wheelLoopVolumeScale).
 * Pitch maps 0 → 0.8 playback rate, maxSpeed → 1.3 (linear, clamped).
 * Both transitions use frame-rate-independent lerp for smooth analog feel.
 *
 * @param {number} speed Planar speed in m/s (Math.hypot(vx, vz))
 * @param {number} maxSpeed Max forward speed cap (CONFIG.driving.maxSpeed)
 * @param {number} dt Frame delta in seconds
 */
export function updateWheelLoop(speed, maxSpeed, dt) {
  if (!wheelLoopHowl) return;

  if (wheelLoopId == null) {
    startWheelLoop();
    if (wheelLoopId == null) return;
  }

  const t = Math.max(0, Math.min(1, speed / maxSpeed));
  const targetVolume = _isMuted ? 0 : t * 0.4 * _sfxVol * _wheelLoopVolumeScale;
  const targetRate = 0.8 + t * 0.5;

  // * Frame-rate independent lerp: matches 0.15 factor at 60 fps.
  const lerpFactor = 1 - Math.pow(1 - 0.15, dt * 60);
  wheelLoopCurrentVolume += (targetVolume - wheelLoopCurrentVolume) * lerpFactor;
  wheelLoopCurrentRate += (targetRate - wheelLoopCurrentRate) * lerpFactor;

  try {
    wheelLoopHowl.volume(wheelLoopCurrentVolume, wheelLoopId);
    wheelLoopHowl.rate(wheelLoopCurrentRate, wheelLoopId);
  } catch {
    // Sound may have been unloaded between frames.
  }
}

/**
 * Instantly cuts the wheel loop when speed drops below 1.0 m/s.
 * Safe to call repeatedly (no-op after first stop).
 */
export function stopWheelLoop() {
  if (!wheelLoopHowl || wheelLoopId == null) return;
  const id = wheelLoopId;
  wheelLoopId = null;
  try {
    wheelLoopHowl.stop(id);
  } catch {
    // Sound may have been unloaded between frames.
  }
}

// === Per-SFX volume (dev-only: Tweakpane tuning) ===

/**
 * Returns the list of registered SFX keys so the dev pane can build sliders.
 * @returns {string[]}
 */
export function getSfxKeys() {
  return Object.keys(sfxRegistry);
}

/**
 * Gets the per-SFX volume multiplier (default 1.0 if never set).
 * @param {string} key
 * @returns {number}
 */
export function getSfxPerVolume(key) {
  return _sfxPerVolumes[key] ?? _DEFAULT_SFX_VOLUMES[key] ?? 1;
}

/**
 * Sets the per-SFX volume multiplier and re-applies volumes immediately.
 * @param {string} key
 * @param {number} vol 0–2+ range (1 = no change, 0.5 = half, 2 = double)
 */
export function setSfxPerVolume(key, vol) {
  _sfxPerVolumes[key] = Math.max(0, Math.min(5, vol));
  applySfxVolumes();
}

/**
 * Returns a shallow copy of the default per-SFX volume multipliers.
 * @returns {Record<string, number>}
 */
export function getDefaultSfxVolumes() {
  return { ..._DEFAULT_SFX_VOLUMES };
}
