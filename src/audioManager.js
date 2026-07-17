// audioManager.js — Howler-based audio manager with volume categories, music, and spatial SFX.
// Replaces the HTMLAudio music system in audio.js. Procedural SFX (audioSetup.js) coexists.

import { Howl, Howler } from "howler";

import { CONFIG } from "./config.js";

// === Volume state (single source of truth for main.js + procedural SFX) ===

import { audioStore } from "./stores/audioStore.js";

// Sync initial values from audioStore
const _initialAudio = audioStore.getState();
let _masterVol = 0.575;
let _sfxVol = _initialAudio.sfxVolume;
let _musicVol = _initialAudio.musicVolume;
let _isMuted = _initialAudio.isMuted;

// Subscribe to store updates for reactive volume adjustments
audioStore.subscribe((state) => {
  _musicVol = state.musicVolume;
  _sfxVol = state.sfxVolume;
  _isMuted = state.isMuted;
  applyAllVolumes();
});

// === Howler instances ===

/** @type {Howl | null} */
let menuMusic = null;
/** Whether the menu music was requested to play (set true by playMenuMusic, false by stopMenuMusic). */
let _menuMusicShouldPlay = false;
/** @type {Howl[]} */
let gameMusicTracks = [];
/**
 * Game playlist URLs registered at boot. Howls are not created until the first
 * {@link playGameMusic} so menu music can fetch without competing for bandwidth.
 * @type {(string | string[])[] | null}
 */
let pendingGamePlaylistUrls = null;
let currentGameTrackIdx = -1;
let gameMusicPlaying = false;
/** True while document is hidden — music paused, Howler + THREE listener silenced. */
let _tabHidden = typeof document !== "undefined" ? document.hidden : false;
/** Resume menu music on focus if it was playing (or requested) when we hid. */
let _resumeMenuOnVisible = false;
/** Resume game music on focus if a track was playing when we hid. */
let _resumeGameOnVisible = false;
/** Optional THREE.AudioListener for procedural SFX mute while tabbed away. */
/** @type {(() => { setMasterVolume?: (v: number) => void } | null) | null} */
let _getAudioListener = null;
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
 * @param {{ getAudioListener?: () => { setMasterVolume?: (v: number) => void } | null }} [opts]
 */
export function initAudioManager(audioContext, opts = {}) {
  Howler.ctx = audioContext;
  // * Manually wire masterGain — Howler's setupAudioContext() only fires
  // * when !Howler.ctx, but we pre-seed ctx to share THREE's AudioContext.
  Howler.masterGain = audioContext.createGain();
  Howler.masterGain.gain.setValueAtTime(Howler._volume, audioContext.currentTime);
  Howler.masterGain.connect(audioContext.destination);
  // * Menu music + up to 4 game tracks + SFX share Howler's HTML5 pool.
  // * Default 10-slot pool only fills as objects are released, so pre-populate it.
  Howler.html5PoolSize = 40;
  for (let i = 0; i < 35; i += 1) {
    const a = new Audio();
    // @ts-expect-error - custom property for Howler audio pool priming
    a._unlocked = true;
    Howler._html5AudioPool.push(a);
  }
  Howler.autoUnlock = true;
  installDevMusicGate();
  if (opts.getAudioListener) _getAudioListener = opts.getAudioListener;
  installPageVisibilityAudioGuard();
  applyAllVolumes();

  // * Autoplay policy workaround: if menu music was requested before the AudioContext
  // * was running (e.g. first page load), re-trigger play when the context resumes.
  audioContext.addEventListener("statechange", () => {
    if (
      audioContext.state === "running"
      && !_tabHidden
      && _menuMusicShouldPlay
      && menuMusic
      && !menuMusic.playing()
    ) {
      menuMusic.play();
    }
  });
}

/**
 * Pause/silence audio while the tab is hidden; resume on focus without touching user mute.
 * Does not write localStorage — user mute preference is separate.
 */
function installPageVisibilityAudioGuard() {
  if (typeof document === "undefined") return;

  const applyTabAudioState = () => {
    _tabHidden = document.hidden;

    if (_tabHidden) {
      // * Remember intent even if decode hadn't started playing yet.
      _resumeMenuOnVisible = Boolean(_menuMusicShouldPlay && menuMusic);
      if (menuMusic?.playing()) {
        try { menuMusic.pause(); } catch { /* ignore */ }
      }

      const track = gameMusicTracks[currentGameTrackIdx];
      _resumeGameOnVisible = Boolean(gameMusicPlaying && track);
      if (track?.playing()) {
        try { track.pause(); } catch { /* ignore */ }
      }

      // * Mute all Howler output (SFX pools included) without changing per-sound user volumes.
      try { Howler.mute(true); } catch { /* ignore */ }
      try {
        _getAudioListener?.()?.setMasterVolume?.(0);
      } catch { /* ignore */ }
      return;
    }

    // * Visible again — restore user mute/volume intent.
    try { Howler.mute(false); } catch { /* ignore */ }
    applyAllVolumes();
    try {
      const listener = _getAudioListener?.();
      listener?.setMasterVolume?.(_isMuted ? 0 : _sfxVol);
    } catch { /* ignore */ }

    if (_resumeMenuOnVisible && _menuMusicShouldPlay && menuMusic && devMusicGate && !menuMusic.playing()) {
      try { menuMusic.play(); } catch { /* ignore */ }
    }
    _resumeMenuOnVisible = false;

    if (_resumeGameOnVisible && gameMusicPlaying && devMusicGate) {
      const track = gameMusicTracks[currentGameTrackIdx];
      if (track && !track.playing()) {
        try { track.play(); } catch { /* ignore */ }
      }
    }
    _resumeGameOnVisible = false;
  };

  document.addEventListener("visibilitychange", applyTabAudioState);
  // * Sync once in case we boot while backgrounded (rare).
  applyTabAudioState();
}

// === Volume control ===

function applyAllVolumes() {
  // * Always keep Howler global at 1.0 — music and SFX have independent per-category volumes.
  // * Tab hide uses Howler.mute(true) separately so we don't fight that here.
  Howler.volume(1);

  if (menuMusic) menuMusic.volume(_isMuted ? 0 : _musicVol);
  for (const t of gameMusicTracks) {
    if (t) t.volume(_isMuted ? 0 : _musicVol);
  }
  applySfxVolumes();
  applyAmbienceVolumes();
}

/**
 * Bulk-restore volumes from saved values (called on boot from localStorage).
 * @param {{ master: number, sfx: number, music: number, muted: boolean }} state
 */
export function restoreVolumeState(state) {
  _masterVol = Math.max(0, Math.min(1, state.master));
  audioStore.getState().setSfxVolume(state.sfx);
  audioStore.getState().setMusicVolume(state.music);
  audioStore.getState().setMuted(state.muted);
}

// === Music ducking ===

/** Pending duck-release timer (null when music is at full level). */
let _duckTimer = null;

/** Currently playing music Howls (menu + active game track). */
function activeMusicHowls() {
  const list = [];
  if (menuMusic) list.push(menuMusic);
  const track = gameMusicTracks[currentGameTrackIdx];
  if (track) list.push(track);
  return list;
}

/**
 * Ducks music under a big moment (KO confirm, sudden death, victory, countdown) and
 * releases it automatically. Music plays via html5-streamed Howls (outside the WebAudio
 * graph), so the duck is a Howl volume fade, not a GainNode. Overlapping ducks extend
 * the hold; the deepest concurrent depth wins until release.
 *
 * @param {number} [depth] 0..1 multiplier on the music volume while ducked (0.4 = -8dB-ish).
 * @param {number} [holdMs] How long to hold the duck before fading back up.
 * @returns {void}
 */
export function duckMusic(depth = 0.4, holdMs = 800) {
  if (_isMuted) return;
  const target = Math.max(0, Math.min(1, depth)) * _musicVol;
  for (const h of activeMusicHowls()) {
    try {
      const current = /** @type {number} */ (h.volume());
      if (current > target) h.fade(current, target, 120);
    } catch { /* track may be mid-load */ }
  }
  if (_duckTimer) clearTimeout(_duckTimer);
  _duckTimer = setTimeout(() => {
    _duckTimer = null;
    const full = _isMuted ? 0 : _musicVol;
    for (const h of activeMusicHowls()) {
      try { h.fade(/** @type {number} */ (h.volume()), full, 450); } catch { /* ignore */ }
    }
  }, holdMs);
}

// === Music ===

/**
 * Load the looping menu music track (eager — menu should hear this as soon as
 * the shell is up; do not defer this for boot bandwidth savings).
 * @param {string | string[]} src URL(s) to the audio file in Opus format.
 *   Opus has universal browser support; no format fallback needed.
 */
export function loadMenuMusic(src) {
  if (menuMusic) menuMusic.unload();
  menuMusic = new Howl({
    src: Array.isArray(src) ? src : [src],
    loop: true,
    volume: _isMuted ? 0 : _musicVol,
    preload: true,
    html5: true, // stream long tracks with HTML5 to save memory
    onload: () => {
      // * If play was requested before decode finished, start immediately.
      if (_menuMusicShouldPlay && devMusicGate && menuMusic && !menuMusic.playing()) {
        menuMusic.play();
      }
    },
  });
}

/**
 * Register the in-game playlist without fetching. Materializes on first
 * {@link playGameMusic} so menu music keeps the network to itself during boot.
 * @param {(string | string[])[]} urls One entry per track; each entry may be a
 *   format-fallback array (see {@link loadMenuMusic}).
 */
export function setGamePlaylist(urls) {
  pendingGamePlaylistUrls = Array.isArray(urls) ? urls.slice() : [];
  if (gameMusicTracks.length > 0) {
    materializeGamePlaylist(pendingGamePlaylistUrls);
  }
}

/**
 * @param {(string | string[])[]} urls
 */
function materializeGamePlaylist(urls) {
  for (const t of gameMusicTracks) {
    try { t.unload(); } catch {}
  }
  gameMusicTracks = urls.map((url, i) => new Howl({
    src: Array.isArray(url) ? url : [url],
    volume: _isMuted ? 0 : _musicVol,
    // * Only the first track preloads when the playlist materializes (enter play).
    // * Later tracks are loaded on demand via ensureTrackLoaded() — Howler never
    // * calls load() itself for preload:false Howls, so .play() on them queues forever.
    preload: i === 0,
    html5: true,
    onend: function onGameTrackEnd() {
      if (!gameMusicPlaying) return;
      advanceGameTrack();
    },
    onloaderror: function onGameTrackLoadError(_id, err) {
      if (CONFIG.debug.audio) {
        // eslint-disable-next-line no-console
        console.warn("[audioManager] game track load error", { track: i, err });
      }
    },
    onplayerror: function onGameTrackPlayError(_id, err) {
      if (CONFIG.debug.audio) {
        // eslint-disable-next-line no-console
        console.warn("[audioManager] game track play error", { track: i, err });
      }
    },
  }));
  currentGameTrackIdx = -1;
  gameMusicPlaying = false;
  pendingGamePlaylistUrls = null;
}

/** @returns {void} */
export function playMenuMusic() {
  // * Mirror of the playGameMusic() invariant — see comment there.
  if (gameMusicPlaying) stopGameMusic();
  _menuMusicShouldPlay = true;
  if (!menuMusic) return;
  if (!devMusicGate) return;
  if (_tabHidden) {
    _resumeMenuOnVisible = true;
    return;
  }
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
  // * Invariant: menu music and game music never play together. Every game-entry
  // * flow is supposed to stop the menu track first, but flows keep growing
  // * (refresh recovery, quickplay hello races) — enforce it here too.
  stopMenuMusic();
  if (pendingGamePlaylistUrls?.length && gameMusicTracks.length === 0) {
    materializeGamePlaylist(pendingGamePlaylistUrls);
  }
  if (!gameMusicTracks.length || gameMusicPlaying) return;
  if (!devMusicGate) return;
  if (currentGameTrackIdx < 0) currentGameTrackIdx = 0;
  gameMusicPlaying = true;
  if (_tabHidden) {
    _resumeGameOnVisible = true;
    return;
  }
  startGameTrack(gameMusicTracks[currentGameTrackIdx]);
}

/** @returns {void} */
export function stopGameMusic() {
  for (const t of gameMusicTracks) {
    try { t?.stop(); } catch {}
  }
  gameMusicPlaying = false;
  // * Restart the playlist from the top next match — never resume on an index
  // * whose track may still be mid-load (or failed to load) from this match.
  currentGameTrackIdx = 0;
}

/**
 * Loads (if needed) and plays a game track. preload:false Howls stay "unloaded"
 * until load() is called explicitly — Howler's play() would queue silently forever.
 * @param {Howl | undefined} track
 */
function startGameTrack(track) {
  if (!track) return;
  if (track.state() === "unloaded") track.load();
  track.play();
}

function advanceGameTrack() {
  if (!gameMusicTracks.length) return;
  currentGameTrackIdx = (currentGameTrackIdx + 1) % gameMusicTracks.length;
  if (gameMusicPlaying) {
    startGameTrack(gameMusicTracks[currentGameTrackIdx]);
  }
}

// === Ambience beds (looping arena atmosphere) ===
// Separate registry from sfxRegistry on purpose: beds hold LIVE per-instance fade
// levels (crowd excitement, SD tension) that applySfxVolumes' howl-global
// volume() writes would stomp. WebAudio-buffered (html5:false) so loops are gapless.

/**
 * @typedef {object} AmbienceEntry
 * @property {Howl} howl
 * @property {number} baseVol Authored mix level for this bed (0..1).
 * @property {number} level Live layer level (0..1) — excitement/tension driver.
 * @property {number | null} id Playing sound id, or null when stopped.
 * @property {number} gen Generation token; play/stop bump it to cancel stale async starts.
 */
/** @type {Record<string, AmbienceEntry>} */
const ambienceRegistry = {};

/** Final Howler volume for a bed: category × authored mix × pane tweak × live layer level. */
function ambienceTargetVol(key, entry) {
  if (_isMuted) return 0;
  const perVol = _sfxPerVolumes[key] ?? 1;
  return _sfxVol * entry.baseVol * perVol * entry.level;
}

function applyAmbienceVolumes() {
  for (const [key, entry] of Object.entries(ambienceRegistry)) {
    if (entry.id == null) continue;
    try { entry.howl.volume(ambienceTargetVol(key, entry), entry.id); } catch { /* mid-load */ }
  }
}

/**
 * Register a looping ambience bed. preload:false — beds fetch on first
 * {@link playAmbience} (play entry), never during boot/menu.
 * @param {string} key
 * @param {string} src Opus loop URL.
 * @param {number} [baseVol] Authored mix level (0..1) relative to the SFX category.
 */
export function registerAmbience(key, src, baseVol = 1) {
  if (ambienceRegistry[key]) {
    try { ambienceRegistry[key].howl.unload(); } catch { /* ignore */ }
  }
  ambienceRegistry[key] = {
    howl: new Howl({ src: [src], loop: true, volume: 0, preload: false }),
    baseVol: Math.max(0, Math.min(1, baseVol)),
    level: 1,
    id: null,
    gen: 0,
  };
}

/**
 * Start (or re-level) an ambience bed with a fade-in. Loads on demand.
 * @param {string} key
 * @param {{ fadeMs?: number, level?: number }} [opts] level = initial layer level
 *   (0 = start silent — used for the crowd-hype layer awaiting excitement).
 */
export function playAmbience(key, opts = {}) {
  const entry = ambienceRegistry[key];
  if (!entry) return;
  const fadeMs = Math.max(10, opts.fadeMs ?? 1200);
  entry.gen += 1;
  const gen = entry.gen;
  entry.level = Math.max(0, Math.min(1, opts.level ?? 1));
  const start = () => {
    if (gen !== entry.gen) return; // superseded by a stop/replay while loading
    const target = ambienceTargetVol(key, entry);
    try {
      if (entry.id != null && entry.howl.playing(entry.id)) {
        const vol = entry.howl.volume(entry.id);
        entry.howl.fade(typeof vol === "number" ? vol : 0, target, fadeMs, entry.id);
        return;
      }
      const id = entry.howl.play();
      entry.id = id;
      entry.howl.volume(0, id);
      entry.howl.fade(0, target, fadeMs, id);
    } catch { /* autoplay policy / mid-unload — bed stays silent */ }
  };
  const state = entry.howl.state();
  if (state === "loaded") {
    start();
    return;
  }
  entry.howl.once("load", start);
  if (state === "unloaded") entry.howl.load();
}

/**
 * Glide a playing bed's layer level (0..1). The crowd excitement + SD tension driver.
 * @param {string} key
 * @param {number} level
 * @param {number} [fadeMs]
 */
export function setAmbienceLevel(key, level, fadeMs = 450) {
  const entry = ambienceRegistry[key];
  if (!entry) return;
  entry.level = Math.max(0, Math.min(1, level));
  if (entry.id == null) return;
  try {
    const vol = entry.howl.volume(entry.id);
    entry.howl.fade(
      typeof vol === "number" ? vol : 0,
      ambienceTargetVol(key, entry),
      Math.max(10, fadeMs),
      entry.id,
    );
  } catch { /* mid-load */ }
}

/**
 * Fade a bed to silence and stop it. Safe to call when already stopped.
 * @param {string} key
 * @param {number} [fadeMs]
 */
export function stopAmbience(key, fadeMs = 600) {
  const entry = ambienceRegistry[key];
  if (!entry) return;
  entry.gen += 1; // cancels any pending load→start
  const id = entry.id;
  entry.id = null;
  if (id == null) return;
  const h = entry.howl;
  try {
    h.once("fade", () => { try { h.stop(id); } catch { /* already gone */ } }, id);
    const vol = h.volume(id);
    h.fade(typeof vol === "number" ? vol : 0, 0, Math.max(10, fadeMs), id);
  } catch {
    try { h.stop(id); } catch { /* already gone */ }
  }
}

/**
 * Stop every playing ambience bed (menu return, arena swap).
 * @param {number} [fadeMs]
 */
export function stopAllAmbience(fadeMs = 600) {
  for (const key of Object.keys(ambienceRegistry)) stopAmbience(key, fadeMs);
}

// === SFX (file-based, pooled via Howler) ===

/**
 * Register a pooled SFX sound (e.g. cart-crash, future sounds).
 * @param {string} key Unique identifier
 * @param {string | string[]} src URL(s) to the audio file — pass [ogg, mp3] so
 *   Safari (no Ogg Vorbis support) falls back to the mp3 encode.
 * @param {{ pool?: number, sprite?: Record<string, [number, number]>, loop?: boolean, rate?: number }} [options]
 */
export function registerSfx(key, src, options = {}) {
  if (sfxRegistry[key]) {
    try { sfxRegistry[key].unload(); } catch {}
  }
  const perVol = _sfxPerVolumes[key] ?? _DEFAULT_SFX_VOLUMES[key] ?? 1;
  sfxRegistry[key] = new Howl({
    src: Array.isArray(src) ? src : [src],
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
 * @param {{ rate?: number, volume?: number }} [options] Per-play overrides
 *   (rate = playback speed / pitch; volume = 0..1 attenuation relative to the
 *   sound's registered volume — used for remote-cart FX).
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
    if (id != null && options.volume != null) {
      sound.volume(sound.volume() * Math.max(0, Math.min(1, options.volume)), id);
    }
    return id;
  } catch {
    return null;
  }
}

/**
 * Play a randomized cart-crash SFX. Each crash receives a unique playback rate so rapid
 * collisions don't sound identical, and its volume scales with hit intensity so a love-tap
 * reads as a light tick while a full-speed / boost ram reads as a slam (boost rams also drop
 * the base rate for a beefier hit). Previously every collision played at flat full volume.
 * @param {number} [intensity] Normalized hit intensity (~0.05 tap → ~1.0+ slam).
 * @param {{ isBoosting?: boolean }} [opts]
 * @returns {number | null} Sound ID
 */
export function playCartCrash(intensity = 1, opts = {}) {
  const isBoosting = Boolean(opts.isBoosting);
  const rate = (isBoosting ? 0.72 : 0.82) + Math.random() * 0.43;
  const volume = Math.max(0.45, Math.min(1, 0.45 + (intensity ?? 1) * 0.7));
  return playSfx("cartCrash", undefined, { rate, volume });
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

/**
 * Fade a specific playing instance to silence, then stop it. Preferred over stopSfx
 * for interrupting announcer voice lines — a hard cut on a reverby take clicks.
 * @param {string} key Registry key
 * @param {number | null | undefined} id Sound ID returned by playSfx
 * @param {number} [ms] Fade length
 */
export function fadeOutSfx(key, id, ms = 90) {
  if (id == null) return;
  const sound = sfxRegistry[key];
  if (!sound) return;
  try {
    sound.once("fade", () => { try { sound.stop(id); } catch { /* already gone */ } }, id);
    const vol = sound.volume(id);
    sound.fade(typeof vol === "number" ? vol : sound.volume(), 0, Math.max(10, ms), id);
  } catch {
    try { sound.stop(id); } catch { /* already gone */ }
  }
}

/**
 * Real clip length of a loaded SFX in milliseconds, or null when unknown/not loaded.
 * The announcer uses this to reserve its channel for the actual recorded take instead
 * of the sting-era duration estimates in the event table.
 * @param {string} key Registry key
 * @returns {number | null}
 */
export function getSfxDurationMs(key) {
  const sound = sfxRegistry[key];
  if (!sound || sound.state() !== "loaded") return null;
  const seconds = sound.duration();
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : null;
}

// === Per-SFX volume (dev-only: Tweakpane tuning) ===

/**
 * Returns the list of registered SFX keys so the dev pane can build sliders.
 * @returns {string[]}
 */
export function getSfxKeys() {
  return [...Object.keys(sfxRegistry), ...Object.keys(ambienceRegistry)];
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
  applyAmbienceVolumes();
}

/**
 * Returns a shallow copy of the default per-SFX volume multipliers.
 * @returns {Record<string, number>}
 */
export function getDefaultSfxVolumes() {
  return { ..._DEFAULT_SFX_VOLUMES };
}
