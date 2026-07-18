// audioControls.js — user-facing audio state (music/SFX volume, mute) + menu/HUD audio UI wiring.
//
// * Owns the volume/mute state formerly held as module state in main.js. Values are
// * persisted through audioStore; every change fans out to the DOM menu
// * (window.CartRave), the HUD audio widget, the Three.js AudioListener gain, and
// * the leader-hum loop. The HUD/listener/leaderHum objects are created inside
// * main() and injected here as null-tolerant getters via initAudioControls().

import { audioStore, AUDIO_VOLUME_MAX } from "../stores/audioStore.js";
import { clamp } from "../utils.js";
import { animateMuteToggle, animateVolumeTick } from "../animations.js";

let musicVolume = audioStore.getState().musicVolume;
let sfxVolume = audioStore.getState().sfxVolume;
let isMuted = audioStore.getState().isMuted;
let menuAudioControlsWired = false;

/**
 * Live refs into main()-owned objects, wired once via {@link initAudioControls}.
 * All getters are null-tolerant — syncAllAudioUi runs before the HUD, listener,
 * and leader hum exist, matching the original in-main() guards.
 * @type {{
 *   getHud: () => ({ syncAudioControls?: () => void } | null),
 *   getAudioListener: () => ({ setMasterVolume?: (volume: number) => void } | null),
 *   getLeaderHum: () => ({ resyncVolume?: () => void } | null),
 * }}
 */
let deps = {
  getHud: () => null,
  getAudioListener: () => null,
  getLeaderHum: () => null,
};

/**
 * Injects getters for the main()-owned objects the audio UI pushes state into.
 * @param {Partial<typeof deps>} overrides
 */
export function initAudioControls(overrides) {
  deps = { ...deps, ...overrides };
}

/** @returns {boolean} */
export function getIsMuted() { return isMuted; }
/** @returns {number} */
export function getMusicVolume() { return musicVolume; }
/** @returns {number} */
export function getSfxVolume() { return sfxVolume; }

export function syncAllAudioUi() {
  const musicPct = Math.round((musicVolume / AUDIO_VOLUME_MAX) * 100);
  const sfxPct = Math.round((sfxVolume / AUDIO_VOLUME_MAX) * 100);
  window.CartRave?.syncAudioUi?.({
    muted: isMuted,
    musicPct,
    musicNorm: musicVolume / AUDIO_VOLUME_MAX,
    sfxPct,
    sfxNorm: sfxVolume / AUDIO_VOLUME_MAX,
  });
  const hud = deps.getHud();
  if (hud?.syncAudioControls) hud.syncAudioControls();
  // * Listener gain is a MUTE GATE only (run-6): synth recipes already multiply by
  // * getSfxVolume(), so also scaling the listener applied the slider twice
  // * (quadratic — at slider 0.08 stings played at 0.6% amplitude, "inaudible").
  const audioListener = deps.getAudioListener();
  if (audioListener && typeof audioListener.setMasterVolume === "function") {
    audioListener.setMasterVolume(isMuted ? 0 : 1);
  }
  try { deps.getLeaderHum()?.resyncVolume?.(); } catch (e) {}
}

/** @param {number} val */
export function setMusicGainValue(val) {
  musicVolume = clamp(val, 0, AUDIO_VOLUME_MAX);
  audioStore.getState().setMusicVolume(musicVolume);
  syncAllAudioUi();
}

/** @param {boolean} muted */
export function setAllAudioMuted(muted) {
  isMuted = Boolean(muted);
  audioStore.getState().setMuted(isMuted);
  syncAllAudioUi();
}

/** @param {number} v */
export function setSfxSliderVolume(v) {
  sfxVolume = clamp(v, 0, AUDIO_VOLUME_MAX);
  audioStore.getState().setSfxVolume(sfxVolume);
  syncAllAudioUi();
}

export function wireMenuAudioControlsOnce() {
  if (menuAudioControlsWired) return;
  menuAudioControlsWired = true;

  const crMuteBtn = document.getElementById("cr-mute-btn");
  const crMusicVolTrack = document.getElementById("cr-music-vol-track");
  const crMusicVolVal = document.getElementById("cr-music-vol-val");

  if (crMuteBtn) {
    crMuteBtn.addEventListener("click", () => {
      setAllAudioMuted(!isMuted);
      animateMuteToggle(crMuteBtn);
    });
  }
  if (crMusicVolTrack) {
    crMusicVolTrack.addEventListener("click", (e) => {
      const r = crMusicVolTrack.getBoundingClientRect();
      const v = clamp(((e.clientX - r.left) / r.width) * AUDIO_VOLUME_MAX, 0, AUDIO_VOLUME_MAX);
      setMusicGainValue(v);
      if (crMusicVolVal) animateVolumeTick(crMusicVolVal);
    });
  }
}
