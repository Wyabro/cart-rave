// audio.js — modular audio interface/delegates + HTML music playback

import { CONFIG } from "./config.js";

let _sfx = null;
let _crowd = null;
let _leaderHum = null;

/** @type {THREE.AudioListener | null} */
let _audioListener = null;

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

/** @type {HTMLAudioElement | null} */
let activeMusicEl = null;

/** @type {(HTMLAudioElement | null)[] | null} */
let gameMusicElements = null;

let menuMusicStarted = false;
let musicStarted = false;
let musicUnavailable = false;
let menuMusicPlayInFlight = false;
let gameMusicPlayInFlight = false;
let menuGestureUnlockInstalled = false;
let musicInitialized = false;

/** @type {number | null} */
let menuMusicFadeRaf = null;

/** @type {number | null} */
let gameMusicFadeInRaf = null;

/** @type {number | null} */
let gameMusicFadeOutRaf = null;

/** @type {string[]} */
let gameMusicUrls = [];

let gameMusicIndex = 0;

/** @param {number} vol @returns {number} */
function calcVol(vol) {
  return Math.max(0, Math.min(1, vol));
}

/** @param {number | null} handle @returns {null} */
function cancelFadeRaf(handle) {
  if (handle !== null) cancelAnimationFrame(handle);
  return null;
}

/** @returns {number} */
function getMusicTargetVolume() {
  return calcVol(CONFIG.audio.musicVolume * (_getIsMuted?.() ? 0 : (_getMasterGain?.() ?? 0)));
}

/** @param {HTMLAudioElement} el @param {() => void} onStarted */
function playWhenReady(el, onStarted) {
  const attemptPlay = () => {
    void el.play().then(
      () => { onStarted(); },
      () => {},
    );
  };
  if (el.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
    attemptPlay();
    return;
  }
  const onReady = () => {
    el.removeEventListener("canplay", onReady);
    el.removeEventListener("error", onReady);
    attemptPlay();
  };
  el.addEventListener("canplay", onReady, { once: true });
  el.addEventListener("error", onReady, { once: true });
  try { el.load(); } catch {}
}

/** @returns {HTMLAudioElement} */
function ensureMenuMusicElement() {
  if (menuMusicEl) return menuMusicEl;
  const menuMusicUrl = new URL("sounds/menu.mp3", window.location.href).toString();
  menuMusicEl = new Audio();
  menuMusicEl.loop = true;
  menuMusicEl.preload = "auto";
  menuMusicEl.src = menuMusicUrl;
  menuMusicEl.addEventListener("error", () => {});
  try { menuMusicEl.load(); } catch {}
  return menuMusicEl;
}

/** @param {string} url @returns {HTMLAudioElement} */
function createGameMusicElement(url) {
  const a = new Audio();
  a.loop = false;
  a.preload = "auto";
  a.src = url;
  a.addEventListener("ended", onGameMusicEnded);
  a.addEventListener("error", onGameMusicError);
  try { a.load(); } catch {}
  return a;
}

/** @param {number} index @returns {HTMLAudioElement | null} */
function getOrCreateGameTrack(index) {
  if (!gameMusicElements || index < 0 || index >= gameMusicUrls.length) return null;
  if (!gameMusicElements[index]) {
    gameMusicElements[index] = createGameMusicElement(gameMusicUrls[index]);
  }
  return gameMusicElements[index];
}

/** @param {number} index @returns {void} */
function preloadGameTrackInBackground(index) {
  if (_getMenuVisible?.()) return;
  getOrCreateGameTrack(index);
}

/** @returns {void} */
function installMenuGestureUnlock() {
  if (menuGestureUnlockInstalled) return;
  menuGestureUnlockInstalled = true;
  const attempt = () => {
    if (_getMenuVisible?.() && !menuMusicStarted && !menuMusicPlayInFlight) {
      tryStartMenuMusic();
    }
  };
  window.addEventListener("pointerdown", attempt, { passive: true });
  window.addEventListener("keydown", attempt, { passive: true });
}

/** @returns {void} */
function onGameMusicEnded() {
  if (_getMenuVisible?.()) return;
  advanceGameMusicTrack();
}

/** @returns {void} */
function onGameMusicError() {
  if (gameMusicUrls.length > 1) {
    advanceGameMusicTrack();
    return;
  }
  musicUnavailable = true;
}

/** @returns {void} */
export function clearAudioRefs() {
  _sfx = null;
  _crowd = null;
  _leaderHum = null;
}

/**
 * * Wires live audio subsystems into this delegation layer.
 * @param {{ sfx?: object, crowd?: object, leaderHum?: object }} refs
 * @returns {void}
 */
export function registerAudioRefs(refs) {
  if (refs.sfx !== undefined) _sfx = refs.sfx;
  if (refs.crowd !== undefined) _crowd = refs.crowd;
  if (refs.leaderHum !== undefined) _leaderHum = refs.leaderHum;

  if (CONFIG.debug.audio) {
    // eslint-disable-next-line no-console
    console.log("[audio] registerAudioRefs", {
      sfx: Boolean(_sfx),
      crowd: Boolean(_crowd),
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
  _getSfxVolume = deps.getSfxVolume;
}

/**
 * Initializes menu + game HTMLAudio tracks, shuffled playlist, and preloads.
 *
 * @param {{ getMasterGain: () => number, getIsMuted: () => boolean, getMenuVisible: () => boolean, startMenuOnInit?: boolean }} options
 */
export function initMusic(options) {
  if (musicInitialized) return;
  musicInitialized = true;

  _getMasterGain = options.getMasterGain;
  _getIsMuted = options.getIsMuted;
  _getMenuVisible = options.getMenuVisible;

  ensureMenuMusicElement();
  menuMusicEl.volume = getMusicTargetVolume();

  window.__cartRaveTryStartMenuMusic = tryStartMenuMusic;
  installMenuGestureUnlock();

  const gameMusicFiles = ["music.mp3", "song2.mp3", "song3.mp3", "song4.mp3"];
  gameMusicUrls = gameMusicFiles.map((f) =>
    new URL(`sounds/${f}`, window.location.href).toString(),
  );
  for (let i = gameMusicUrls.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = gameMusicUrls[i];
    gameMusicUrls[i] = gameMusicUrls[j];
    gameMusicUrls[j] = tmp;
  }
  gameMusicIndex = 0;
  gameMusicElements = new Array(gameMusicUrls.length).fill(null);
  activeMusicEl = null;

  if (options.startMenuOnInit !== false && _getMenuVisible?.()) {
    try {
      startMenuMusic();
    } catch (e) {
      // Menu autoplay may be blocked until gesture.
    }
  }
}

/** @returns {void} */
function advanceGameMusicTrack() {
  if (!gameMusicUrls.length) return;
  if (activeMusicEl) {
    try {
      activeMusicEl.pause();
      activeMusicEl.currentTime = 0;
    } catch {}
  }
  musicStarted = false;
  gameMusicPlayInFlight = false;
  gameMusicIndex = (gameMusicIndex + 1) % gameMusicUrls.length;
  activeMusicEl = getOrCreateGameTrack(gameMusicIndex);
  if (!_getMenuVisible?.() && activeMusicEl) {
    activeMusicEl.volume = getMusicTargetVolume();
    gameMusicPlayInFlight = true;
    playWhenReady(activeMusicEl, () => {
      gameMusicPlayInFlight = false;
      if (!_getMenuVisible?.()) {
        musicStarted = true;
        preloadGameTrackInBackground((gameMusicIndex + 1) % gameMusicUrls.length);
      } else {
        try { activeMusicEl.pause(); } catch {}
      }
    });
  }
}

/** @returns {void} */
export function tryStartMenuMusic() {
  if (!menuMusicEl || menuMusicStarted || menuMusicPlayInFlight) return;
  if (_getIsMuted?.()) return;
  if (_getMenuVisible && !_getMenuVisible()) return;

  stopGameMusic();
  menuMusicEl.volume = getMusicTargetVolume();
  menuMusicPlayInFlight = true;
  playWhenReady(menuMusicEl, () => {
    menuMusicPlayInFlight = false;
    if (_getMenuVisible?.()) {
      menuMusicStarted = true;
    } else {
      try { menuMusicEl.pause(); } catch {}
    }
  });
}

/** @returns {void} */
export function stopMenuMusic() {
  if (!menuMusicEl) return;
  menuMusicFadeRaf = cancelFadeRaf(menuMusicFadeRaf);
  menuMusicPlayInFlight = false;
  menuMusicEl.pause();
  menuMusicEl.currentTime = 0;
  menuMusicStarted = false;
}

/** @returns {void} */
export function startMenuMusic() {
  if (!menuMusicEl) return;
  menuMusicStarted = false;
  menuMusicPlayInFlight = false;
  menuMusicEl.volume = getMusicTargetVolume();
  tryStartMenuMusic();
}

/** @returns {void} */
export function startGameMusic() {
  if (!activeMusicEl || musicStarted || musicUnavailable || gameMusicPlayInFlight) return;
  if (_getMenuVisible?.()) return;

  gameMusicPlayInFlight = true;
  playWhenReady(activeMusicEl, () => {
    gameMusicPlayInFlight = false;
    if (!_getMenuVisible?.()) {
      musicStarted = true;
      preloadGameTrackInBackground((gameMusicIndex + 1) % gameMusicUrls.length);
    } else {
      try { activeMusicEl.pause(); } catch {}
    }
  });
}

/** @returns {void} */
export function stopGameMusic() {
  try {
    gameMusicFadeInRaf = cancelFadeRaf(gameMusicFadeInRaf);
    gameMusicFadeOutRaf = cancelFadeRaf(gameMusicFadeOutRaf);
    gameMusicPlayInFlight = false;
    if (activeMusicEl) {
      activeMusicEl.pause();
      activeMusicEl.currentTime = 0;
    }
    musicStarted = false;
  } catch (e) {
    // Ignore pause errors on torn-down elements.
  }
}

/**
 * Crossfade: fade out menu music (used when entering the game).
 * @returns {void}
 */
export function fadeOutMenuMusic() {
  if (!menuMusicEl) return;
  menuMusicFadeRaf = cancelFadeRaf(menuMusicFadeRaf);
  menuMusicPlayInFlight = false;
  let currentVol = menuMusicEl.volume;
  const fadeStep = () => {
    if (!menuMusicEl) {
      menuMusicFadeRaf = null;
      return;
    }
    currentVol += (0 - currentVol) * 0.1;
    if (currentVol <= 0.01) {
      menuMusicEl.volume = 0;
      menuMusicEl.pause();
      menuMusicEl.currentTime = 0;
      menuMusicStarted = false;
      menuMusicFadeRaf = null;
      return;
    }
    menuMusicEl.volume = calcVol(currentVol);
    menuMusicFadeRaf = requestAnimationFrame(fadeStep);
  };
  menuMusicFadeRaf = requestAnimationFrame(fadeStep);
}

/**
 * Crossfade: fade in game music (used when entering the game).
 * @returns {void}
 */
export function fadeInGameMusic() {
  if (!gameMusicUrls.length) return;
  activeMusicEl = getOrCreateGameTrack(gameMusicIndex);
  if (!activeMusicEl) return;

  gameMusicFadeOutRaf = cancelFadeRaf(gameMusicFadeOutRaf);
  gameMusicFadeInRaf = cancelFadeRaf(gameMusicFadeInRaf);
  musicStarted = false;
  gameMusicPlayInFlight = false;
  activeMusicEl.volume = 0;
  activeMusicEl.muted = _getIsMuted?.() ?? false;
  startGameMusic();
  let currentVol = 0;
  const fadeStep = () => {
    if (!activeMusicEl) {
      gameMusicFadeInRaf = null;
      return;
    }
    const dynamicTarget = getMusicTargetVolume();
    currentVol += (dynamicTarget - currentVol) * 0.1;
    if (Math.abs(dynamicTarget - currentVol) <= 0.01) {
      activeMusicEl.volume = dynamicTarget;
      gameMusicFadeInRaf = null;
      return;
    }
    activeMusicEl.volume = calcVol(currentVol);
    gameMusicFadeInRaf = requestAnimationFrame(fadeStep);
  };
  gameMusicFadeInRaf = requestAnimationFrame(fadeStep);
}

/**
 * Stops all music, cancels fade loops, and releases HTML audio elements.
 * @returns {void}
 */
export function destroyMusic() {
  menuMusicFadeRaf = cancelFadeRaf(menuMusicFadeRaf);
  gameMusicFadeInRaf = cancelFadeRaf(gameMusicFadeInRaf);
  gameMusicFadeOutRaf = cancelFadeRaf(gameMusicFadeOutRaf);

  if (menuMusicEl) {
    menuMusicEl.pause();
    menuMusicEl.src = "";
  }
  if (gameMusicElements) {
    gameMusicElements.forEach((a) => {
      if (!a) return;
      a.pause();
      a.src = "";
    });
  }

  menuMusicEl = null;
  activeMusicEl = null;
  gameMusicElements = null;
  gameMusicUrls = [];
  menuMusicStarted = false;
  musicStarted = false;
  musicUnavailable = false;
  menuMusicPlayInFlight = false;
  gameMusicPlayInFlight = false;
  musicInitialized = false;
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
  if (activeMusicEl) {
    activeMusicEl.volume = musicVol;
    activeMusicEl.muted = isMuted;
  }
  if (menuMusicEl) {
    menuMusicEl.volume = musicVol;
    menuMusicEl.muted = isMuted;
  }

  try { _crowd?.applyAmbient?.(); } catch {}
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
export function playCrowdBump() {
  _crowd?.bump?.();
}

/** @deprecated Use {@link playCrowdBump} instead. */
export const bumpCrowd = playCrowdBump;

/** @returns {void} */
export function ensureCrowdStarted() {
  _crowd?.ensureStarted?.();
}

/** @returns {void} */
export function applyAmbientCrowd() {
  _crowd?.applyAmbient?.();
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
