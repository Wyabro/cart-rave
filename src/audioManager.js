// audioManager.js — Howler-based audio manager with volume categories, music, and spatial SFX.
// Replaces the HTMLAudio music system in audio.js. Procedural SFX (audioSetup.js) coexists.

import { Howl, Howler } from "howler";

import { CONFIG } from "./config.js";

// === Volume state (single source of truth for main.js + procedural SFX) ===

import { audioStore } from "./stores/audioStore.js";

// Sync initial values from audioStore
const _initialAudio = audioStore.getState();

/**
 * * Store volumes live in 0..AUDIO_VOLUME_MAX (1.15); Howler only accepts 0..1. Clamp at
 * * this boundary — NOT by dividing by AUDIO_VOLUME_MAX, which decayed saved volume by
 * * ~1/1.15 on every page load the last time that was tried (see main.js § volume restore).
 * *
 * * Why a >1 value is dangerous rather than merely ignored: Howler's volume() setter gates
 * * on `vol >= 0 && vol <= 1` and otherwise falls through to its GETTER branch — it returns
 * * a number, writes nothing, and never throws, so every try/catch around a volume() call
 * * in this file is blind to it. Meanwhile the Howl CONSTRUCTOR does not validate at all,
 * * so a >1 value lands in `_volume` intact; each Sound inherits it and writes
 * * `node.volume = _volume * Howler.volume()` on play — including at every loop restart.
 * * That write throws IndexSizeError, leaving a freshly created <audio> element at its
 * * DEFAULT volume of 1.0 — full scale, far louder than the player asked for, and
 * * unfixable afterwards because the setter refuses the poisoned value forever.
 * * That is MENU-MUSIC-VOL-1.
 * @param {number} v Store-domain volume.
 * @returns {number} A volume Howler will actually apply.
 */
function howlerVol(v) {
  return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0;
}

let _sfxVol = howlerVol(_initialAudio.sfxVolume);
let _voiceVol = howlerVol(_initialAudio.voiceVolume);
let _musicVol = howlerVol(_initialAudio.musicVolume);
let _isMuted = _initialAudio.isMuted;

// Subscribe to store updates for reactive volume adjustments
audioStore.subscribe((state) => {
  _musicVol = howlerVol(state.musicVolume);
  _sfxVol = howlerVol(state.sfxVolume);
  _voiceVol = howlerVol(state.voiceVolume);
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
    // * Clamp the PRODUCT, not just the category volume — a dev Tweakpane perVol
    // * above 1 can push a legal slider value back over the line on its own.
    // * "The Store PA" voice takes ride the VOICE bus: announcer_* keys follow
    // * _voiceVol, everything else follows _sfxVol (countdown, kill confirm,
    // * crash/boost/hop stay on SFX).
    const base = key.startsWith("announcer_") ? _voiceVol : _sfxVol;
    sound.volume(_isMuted ? 0 : howlerVol(base * perVol));
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

// === Music low-pass (SD-MUSIC-LPF-1) ===
// * Music runs as html5-streamed <audio> elements OUTSIDE the WebAudio graph
// * (2 MB/track; buffered mode would cost ~40 MB decoded RAM and block playback on
// * download). Low-pass therefore routes each element into a shared BiquadFilter via
// * createMediaElementSource. That routing has gone SILENT across multiple iOS
// * releases (WebKit 203435 / 261668 / 836531), so it is gated off on Apple/WebKit —
// * SD music stays full-band there rather than risk muted music.

/** Sudden Death low-pass cutoff (Hz). Taste knob — playtest verifies. */
const MUSIC_LPF_CUTOFF_ON = 280;
/** Fully-open cutoff (Hz) — transparent for Opus content. */
const MUSIC_LPF_CUTOFF_OFF = 20000;
/** setTargetAtTime time constant (s) for the cutoff glide in/out. */
const MUSIC_LPF_RAMP_TC = 0.15;

/**
 * True when this platform can route streamed music through the WebAudio graph.
 * Computed lazily but assigned ONCE in initAudioManager — never re-evaluated.
 * A lazy per-Howl probe would be wrong: howler returns <audio> elements to a
 * shared pool on unload(), so one successful wrap on a supported platform would
 * route every future reuse of that element through the graph forever.
 * @returns {boolean}
 */
function detectMusicLpSupported() {
  try {
    if (typeof navigator === "undefined") return true;
    const isAppleWebKit = /Apple/i.test(navigator.vendor ?? "")
      && /(iPhone|iPad|iPod|Mac)/i.test(navigator.userAgent ?? "");
    return !isAppleWebKit;
  } catch {
    return true;
  }
}

/** Whether music elements can be routed through the graph (set in initAudioManager). */
let _musicLpSupported = false;
/** AudioContext the music filter chain lives on (null until initialized). */
/** @type {AudioContext | null} */
let _musicCtx = null;
/** Shared music-only low-pass filter; null when unsupported / not initialized. */
/** @type {BiquadFilterNode | null} */
let _musicFilter = null;
let _musicLpActive = false;
/** Music <audio> elements already routed into _musicFilter (reuse guard). */
/** @type {Set<HTMLMediaElement>} */
const _wrappedMusicElements = new Set();

/**
 * Route a music Howl's html5 <audio> elements through the shared low-pass filter.
 * Howler creates the pooled element synchronously in the Howl constructor, so
 * calling this right after construction covers even preload:false tracks.
 * @param {Howl | null | undefined} howl
 */
function wrapMusicElements(howl) {
  if (!_musicLpSupported || !_musicFilter || !_musicCtx) return;
  const sounds = howl?._sounds;
  if (!Array.isArray(sounds)) return;
  for (const s of sounds) {
    const el = s?._node;
    // * Only html5 music Howls reach here; a hypothetical webAudio Howl would
    // * expose a gain node, and createMediaElementSource would throw on it.
    if (!(el instanceof HTMLMediaElement)) continue;
    if (_wrappedMusicElements.has(el)) continue;
    try {
      const src = _musicCtx.createMediaElementSource(el);
      src.connect(_musicFilter);
      _wrappedMusicElements.add(el);
    } catch {
      // * Element may already be sourced or the graph is unusable — leave it
      // * on the direct path; the LPF just won't apply to this element.
    }
  }
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
  // * Music low-pass bus (SD-MUSIC-LPF-1): music <audio> elements join the graph
  // * here so Sudden Death can filter them. Decided once — see detectMusicLpSupported.
  _musicLpSupported = detectMusicLpSupported();
  if (_musicLpSupported && typeof audioContext.createBiquadFilter === "function") {
    _musicFilter = audioContext.createBiquadFilter();
    _musicFilter.type = "lowpass";
    _musicFilter.frequency.value = MUSIC_LPF_CUTOFF_OFF;
    // * Howler.masterGain is manually wired above and never recreated — keep
    // * masterGain first, then this connect, or the filter is orphaned.
    _musicFilter.connect(Howler.masterGain);
    _musicCtx = audioContext;
  }
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
  // * Never revive menu over an active game playlist (late ctx.resume races after Solo).
  audioContext.addEventListener("statechange", () => {
    if (
      audioContext.state === "running"
      && !_tabHidden
      && _menuMusicShouldPlay
      && !gameMusicPlaying
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
      // * Mute gate only — synth recipes carry the SFX slider themselves (run-6:
      // * scaling here too applied the slider twice, see audioControls.js).
      listener?.setMasterVolume?.(_isMuted ? 0 : 1);
    } catch { /* ignore */ }

    if (
      _resumeMenuOnVisible
      && _menuMusicShouldPlay
      && !gameMusicPlaying
      && menuMusic
      && devMusicGate
      && !menuMusic.playing()
    ) {
      try {
        menuMusic.volume(_isMuted ? 0 : _musicVol);
        menuMusic.play();
      } catch { /* ignore */ }
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

  // * Volume 0 while not the active music context — belt-and-suspenders against HTML5
  // * Howls that keep an element audibly "playing" after stop() in some browsers.
  if (menuMusic) {
    menuMusic.volume(_isMuted || !_menuMusicShouldPlay || gameMusicPlaying ? 0 : _musicVol);
  }
  for (const t of gameMusicTracks) {
    if (t) t.volume(_isMuted || !gameMusicPlaying ? 0 : _musicVol);
  }
  applySfxVolumes();
  applyAmbienceVolumes();
}

/**
 * Bulk-restore volumes from saved values (called on boot from localStorage).
 * @param {{ sfx: number, music: number, muted: boolean }} state
 */
export function restoreVolumeState(state) {
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
  // * Menu track only while it is ALLOWED to play — the duck-release fade must never
  // * ramp a stopped menu Howl back up mid-game (run-6 bleed amplifier).
  if (menuMusic && _menuMusicShouldPlay && !gameMusicPlaying) list.push(menuMusic);
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
      // * Refuse if the game playlist owns the bus (late decode after Solo click).
      if (
        _menuMusicShouldPlay
        && !gameMusicPlaying
        && devMusicGate
        && menuMusic
        && !menuMusic.playing()
      ) {
        menuMusic.volume(_isMuted ? 0 : _musicVol);
        menuMusic.play();
      }
    },
    onplay: () => {
      // * Terminal bleed guard (run-6): an HTML5 Howl's play() promise can resolve
      // * AFTER stopMenuMusic() ran (Howler _playLock), reviving the menu track under
      // * the level playlist. If playback actually starts while the intent flags say
      // * "menu must be silent", kill it on the spot.
      if ((!_menuMusicShouldPlay || gameMusicPlaying) && menuMusic) {
        try { menuMusic.stop(); } catch { /* ignore */ }
        try { menuMusic.volume(0); } catch { /* ignore */ }
      }
    },
  });
  wrapMusicElements(menuMusic);
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
  for (const t of gameMusicTracks) wrapMusicElements(t);
  currentGameTrackIdx = -1;
  gameMusicPlaying = false;
  pendingGamePlaylistUrls = null;
}

/**
 * Start (or re-assert) menu music. **Does not steal the game bus** — if game music
 * is active, this is a no-op. Callers that mean "back to the menu" must
 * {@link stopGameMusic} first (returnToMenu already does).
 *
 * Why no-op instead of stop-game: late boot-splash / first-gesture hooks
 * (`__cartRaveTryStartMenuMusic`) can fire after Solo has already started the
 * level playlist. Stealing would kill level music; ignoring keeps the level.
 * @returns {void}
 */
export function playMenuMusic() {
  if (gameMusicPlaying) return;
  _menuMusicShouldPlay = true;
  if (!menuMusic) return;
  if (!devMusicGate) return;
  if (_tabHidden) {
    _resumeMenuOnVisible = true;
    return;
  }
  menuMusic.volume(_isMuted ? 0 : _musicVol);
  if (menuMusic.playing()) return;
  menuMusic.play();
}

/**
 * Hard-stop menu music and clear every resume/play intent so nothing can revive
 * the menu track while a level is running (HTML5 Howl + late onload / ctx.resume).
 * @returns {void}
 */
export function stopMenuMusic() {
  _menuMusicShouldPlay = false;
  _resumeMenuOnVisible = false;
  if (!menuMusic) return;
  try { menuMusic.stop(); } catch { /* ignore */ }
  // * Howler html5:true occasionally leaves an Audio element audible after stop();
  // * volume 0 makes that silent until playMenuMusic restores level.
  try { menuMusic.volume(0); } catch { /* ignore */ }
}

/** @returns {void} */
export function playGameMusic() {
  // * Invariant: menu music and game music never play together. Every game-entry
  // * flow is supposed to stop the menu track first, but new flows
  // * (refresh recovery, quickplay hello races, late boot-splash hooks) keep
  // * missing it — enforce it here too.
  stopMenuMusic();
  materializeGamePlaylistIfPending();
  if (!gameMusicTracks.length || gameMusicPlaying) return;
  if (!devMusicGate) return;
  if (currentGameTrackIdx < 0) currentGameTrackIdx = 0;
  gameMusicPlaying = true;
  // * Re-assert menu is dead after flipping the flag (volume apply + stop race).
  stopMenuMusic();
  if (_tabHidden) {
    _resumeGameOnVisible = true;
    return;
  }
  const track = gameMusicTracks[currentGameTrackIdx];
  if (track) track.volume(_isMuted ? 0 : _musicVol);
  startGameTrack(track);
}

/** @returns {void} */
export function stopGameMusic() {
  for (const t of gameMusicTracks) {
    try { t?.stop(); } catch {}
    try { t?.volume?.(0); } catch {}
  }
  gameMusicPlaying = false;
  // * Restart the playlist from the top next match — never resume on an index
  // * whose track may still be mid-load (or failed to load) from this match.
  currentGameTrackIdx = 0;
}

/** @returns {boolean} True while the in-game playlist owns the music bus. */
export function isGameMusicPlaying() {
  return gameMusicPlaying;
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

/**
 * Glide the shared music filter's cutoff down (Sudden Death) or back up.
 * Independent of duckMusic — that is a per-announcement volume fade, this is the
 * whole-SD spectral change. No-op when the platform cannot route music into the
 * graph (Apple/WebKit) or the filter was never built.
 * @param {boolean} active
 * @returns {void}
 */
export function setMusicLowPass(active) {
  const on = Boolean(active);
  if (on === _musicLpActive || !_musicFilter || !_musicCtx) return;
  _musicLpActive = on;
  const t = _musicCtx.currentTime;
  _musicFilter.frequency.cancelScheduledValues(t);
  _musicFilter.frequency.setTargetAtTime(
    on ? MUSIC_LPF_CUTOFF_ON : MUSIC_LPF_CUTOFF_OFF,
    t,
    MUSIC_LPF_RAMP_TC,
  );
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
 * @param {{ pool?: number, sprite?: Record<string, [number, number]>, loop?: boolean, rate?: number, preload?: boolean }} [options]
 */
/**
 * Whether a file-based SFX is registered under `key` (e.g. optional drop-in
 * assets that replace a procedural synth fallback when present).
 * @param {string} key
 * @returns {boolean}
 */
export function hasSfx(key) {
  return Boolean(sfxRegistry[key]);
}

/**
 * Read-only audio state for the diag "audio" probe — enough to answer "why was
 * that sound silent" from an F8 bundle: a suspended AudioContext, mute, a slider
 * at zero, or a drop-in asset that never registered.
 * @returns {Record<string, unknown>}
 */
export function getAudioDebugState() {
  return {
    ctxState: Howler.ctx?.state ?? null,
    muted: _isMuted,
    musicVol: Math.round(_musicVol * 1000) / 1000,
    sfxVol: Math.round(_sfxVol * 1000) / 1000,
    voiceVol: Math.round(_voiceVol * 1000) / 1000,
    gameMusicPlaying: isGameMusicPlaying(),
    registeredSfxCount: Object.keys(sfxRegistry).length,
    waterSplashRegistered: Boolean(sfxRegistry.waterSplash),
  };
}

export function registerSfx(key, src, options = {}) {
  if (sfxRegistry[key]) {
    try { sfxRegistry[key].unload(); } catch {}
  }
  const perVol = _sfxPerVolumes[key] ?? _DEFAULT_SFX_VOLUMES[key] ?? 1;
  // * VOICE-BUS-1: announcer_* takes construct at the VOICE category volume, all
  // * other SFX (countdown, kill confirm, crash/boost/hop) at the SFX category.
  const base = key.startsWith("announcer_") ? _voiceVol : _sfxVol;
  sfxRegistry[key] = new Howl({
    src: Array.isArray(src) ? src : [src],
    // * Constructor, not the setter: Howler validates neither, but only the setter can be
    // * silently refused later — a poisoned >1 here survives into every Sound this Howl
    // * creates. Clamp on the way in.
    volume: _isMuted ? 0 : howlerVol(base * perVol),
    pool: options.pool ?? 4,
    sprite: options.sprite,
    loop: Boolean(options.loop),
    rate: options.rate,
    preload: options.preload !== false,
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
    // * preload:false Howls stay "unloaded" until load() — same trap as game music.
    // * Howler still returns a sound id when play() queues during load, so callers
    // * (announcer interrupt tracking) can stop/fade the instance.
    if (sound.state() === "unloaded") sound.load();
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
 * Wait until a Howl is loaded (or fails). Kicks load() when still unloaded.
 * @param {import("howler").Howl} sound
 * @returns {Promise<boolean>}
 */
function waitHowlLoaded(sound) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      resolve(ok);
    };
    try {
      if (sound.state() === "loaded") {
        finish(true);
        return;
      }
      // * Howler: once('load'|'loaderror') — works whether load is already in flight
      // * (idle warm) or we kick it here.
      if (typeof sound.once === "function") {
        sound.once("load", () => finish(true));
        sound.once("loaderror", () => finish(false));
      }
      if (sound.state() === "unloaded") sound.load();
      // * Sync loaders (tests / already-buffered) may flip state before once attaches
      // * after a prior load() — re-check.
      if (sound.state() === "loaded") {
        finish(true);
        return;
      }
      // * No once API and still not loaded — best-effort kick only.
      if (typeof sound.once !== "function") {
        finish(sound.state() === "loaded");
      }
    } catch {
      finish(false);
    }
  });
}

/**
 * Fetch + decode a list of Howls, resolving when all are loaded or `maxWaitMs` elapses.
 * @param {import("howler").Howl[]} howls
 * @param {{ maxWaitMs?: number }} [opts]
 * @returns {Promise<{ loaded: number, total: number, timedOut: boolean }>}
 */
function prefetchHowlsAsync(howls, opts = {}) {
  const maxWaitMs = typeof opts.maxWaitMs === "number" ? opts.maxWaitMs : 8000;
  const list = howls.filter(Boolean);
  const total = list.length;
  if (total === 0) {
    return Promise.resolve({ loaded: 0, total: 0, timedOut: false });
  }

  const allLoaded = Promise.all(list.map((sound) => waitHowlLoaded(sound))).then(
    (results) => results.filter(Boolean).length,
  );

  const timeout = new Promise((resolve) => {
    const ms = Math.max(0, maxWaitMs);
    if (ms === 0) {
      resolve("timeout");
      return;
    }
    setTimeout(() => resolve("timeout"), ms);
  });

  return Promise.race([
    allLoaded.then((loaded) => ({ loaded, total, timedOut: false })),
    timeout.then(() => {
      // * Recount loaded at timeout — partial warm is still a win.
      let loaded = 0;
      for (const sound of list) {
        try {
          if (sound.state() === "loaded") loaded += 1;
        } catch { /* ignore */ }
      }
      return { loaded, total, timedOut: loaded < total };
    }),
  ]);
}

/**
 * Starts background fetch/decode for registered SFX whose keys share a prefix.
 * Used to warm the announcer voice pack during menu idle without blocking boot.
 * Fire-and-forget — does not wait for decode. Prefer {@link prefetchSfxByPrefixAsync}
 * under the play-entry loading overlay so first-decode does not land mid-round.
 * @param {string} prefix Registry key prefix (e.g. `"announcer_"`).
 */
export function prefetchSfxByPrefix(prefix) {
  for (const [key, sound] of Object.entries(sfxRegistry)) {
    if (!key.startsWith(prefix)) continue;
    try {
      if (sound.state() === "unloaded") sound.load();
    } catch { /* mid-unload */ }
  }
}

/**
 * Fetch + decode every registered SFX under `prefix`, resolving when all are loaded
 * or `maxWaitMs` elapses. Run-7 2e: fire-and-forget prefetch left Howler decode to
 * complete mid-round as 600–2000ms host resume freezes (cap-23: send gaps 2047/814/640
 * after first callouts). Awaiting this during play-entry warmup keeps those stalls
 * behind the loading overlay.
 *
 * @param {string} prefix Registry key prefix (e.g. `"announcer_"`).
 * @param {{ maxWaitMs?: number }} [opts] Cap wait so a hung fetch cannot block play forever.
 * @returns {Promise<{ loaded: number, total: number, timedOut: boolean }>}
 */
export function prefetchSfxByPrefixAsync(prefix, opts = {}) {
  const entries = Object.entries(sfxRegistry).filter(([key]) => key.startsWith(prefix));
  return prefetchHowlsAsync(
    entries.map(([, sound]) => sound),
    opts,
  );
}

/**
 * Fetch + decode specific SFX keys (e.g. countdown_3…go). Missing keys are skipped.
 * @param {string[]} keys
 * @param {{ maxWaitMs?: number }} [opts]
 * @returns {Promise<{ loaded: number, total: number, timedOut: boolean }>}
 */
export function prefetchSfxKeysAsync(keys, opts = {}) {
  const list = (Array.isArray(keys) ? keys : [])
    .map((k) => sfxRegistry[k])
    .filter(Boolean);
  return prefetchHowlsAsync(list, opts);
}

/**
 * Build Howls for {@link setGamePlaylist} without starting playback. Safe to call
 * repeatedly; no-ops when already materialized.
 * @returns {void}
 */
export function materializeGamePlaylistIfPending() {
  if (pendingGamePlaylistUrls?.length && gameMusicTracks.length === 0) {
    materializeGamePlaylist(pendingGamePlaylistUrls);
  }
}

/** @returns {boolean} True when game-track Howls exist (warm or prior play). */
export function hasMaterializedGamePlaylist() {
  return gameMusicTracks.length > 0;
}

/**
 * Fetch + decode the opening game track so first play at countdown is not a
 * main-thread decode hitch. Call after {@link setGamePlaylist} (+ materialize).
 * @param {{ maxWaitMs?: number }} [opts]
 * @returns {Promise<{ loaded: number, total: number, timedOut: boolean }>}
 */
export function prefetchGameMusicAsync(opts = {}) {
  materializeGamePlaylistIfPending();
  // * Track 0 preloads when materializing; later tracks stay on-demand.
  const track = gameMusicTracks[0];
  return prefetchHowlsAsync(track ? [track] : [], opts);
}

/**
 * Fetch + decode ambience beds by registry key without starting playback.
 * Cap-54: MP hides the menu + starts beds at the same frame as countdown — first
 * WebAudio decode of classic_crowd_bed (~85–290KB opus) landed as a ~1.3s host LT.
 * @param {string[]} keys
 * @param {{ maxWaitMs?: number }} [opts]
 * @returns {Promise<{ loaded: number, total: number, timedOut: boolean }>}
 */
export function prefetchAmbienceAsync(keys, opts = {}) {
  const list = (Array.isArray(keys) ? keys : [])
    .map((k) => ambienceRegistry[k]?.howl)
    .filter(Boolean);
  return prefetchHowlsAsync(list, opts);
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
  // * Volume floor (HIT-FEEL-1) — not an intensity gate; soft hits still play, just quieter.
  const floor = CONFIG.ramming?.fx?.crashVolumeFloor ?? 0.22;
  const volume = Math.max(floor, Math.min(1, floor + (intensity ?? 1) * 0.7));
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
 * Stop every playing instance of a registered SFX key (Howler stop-all for that Howl).
 * Use when a loop id may have been orphaned (e.g. rematchResetWorld nulls chargeUpSfxId
 * without stopping the Howler instance).
 * @param {string} key Registry key
 */
export function stopAllSfx(key) {
  const sound = sfxRegistry[key];
  if (!sound) return;
  try {
    sound.stop();
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
