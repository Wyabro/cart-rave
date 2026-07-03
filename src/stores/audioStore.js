// audioStore.js — Vanilla Zustand store for game audio volume and mute settings.
import { createStore } from "zustand/vanilla";

const STORAGE_KEY_MUSIC_VOL = "cartRaveVolume";
const STORAGE_KEY_SFX_VOL = "cartRaveSfxVol";
const STORAGE_KEY_MUTED = "cartRaveMuted";

export const AUDIO_VOLUME_MAX = 1.15;
export const AUDIO_VOLUME_DEFAULT = 0.5 * AUDIO_VOLUME_MAX;

function loadInitialAudioState() {
  let musicVolume = AUDIO_VOLUME_DEFAULT;
  let sfxVolume = AUDIO_VOLUME_DEFAULT;
  let isMuted = false;

  if (typeof localStorage !== "undefined") {
    try {
      const savedVol = localStorage.getItem(STORAGE_KEY_MUSIC_VOL);
      if (savedVol !== null) {
        const parsed = parseInt(savedVol, 10);
        if (!Number.isNaN(parsed)) {
          musicVolume = Math.min(Math.max((parsed / 100) * AUDIO_VOLUME_MAX, 0), AUDIO_VOLUME_MAX);
        }
      }
    } catch {}

    try {
      const savedSfxVol = localStorage.getItem(STORAGE_KEY_SFX_VOL);
      if (savedSfxVol !== null) {
        const parsed = parseInt(savedSfxVol, 10);
        if (!Number.isNaN(parsed)) {
          sfxVolume = Math.min(Math.max((parsed / 100) * AUDIO_VOLUME_MAX, 0), AUDIO_VOLUME_MAX);
        }
      }
    } catch {}

    try {
      if (localStorage.getItem(STORAGE_KEY_MUTED) === "true") {
        isMuted = true;
      }
    } catch {}
  }

  return { musicVolume, sfxVolume, isMuted };
}

const initialState = loadInitialAudioState();

export const audioStore = createStore((set, get) => ({
  ...initialState,

  setMusicVolume: (volume) => {
    const clamped = Math.min(Math.max(volume, 0), AUDIO_VOLUME_MAX);
    set({ musicVolume: clamped });
    if (typeof localStorage !== "undefined") {
      try {
        const pct = Math.round((clamped / AUDIO_VOLUME_MAX) * 100);
        localStorage.setItem(STORAGE_KEY_MUSIC_VOL, String(pct));
      } catch {}
    }
  },

  setSfxVolume: (volume) => {
    const clamped = Math.min(Math.max(volume, 0), AUDIO_VOLUME_MAX);
    set({ sfxVolume: clamped });
    if (typeof localStorage !== "undefined") {
      try {
        const pct = Math.round((clamped / AUDIO_VOLUME_MAX) * 100);
        localStorage.setItem(STORAGE_KEY_SFX_VOL, String(pct));
      } catch {}
    }
  },

  setMuted: (muted) => {
    const val = Boolean(muted);
    set({ isMuted: val });
    if (typeof localStorage !== "undefined") {
      try {
        localStorage.setItem(STORAGE_KEY_MUTED, val ? "true" : "false");
      } catch {}
    }
  },

  toggleMuted: () => {
    const next = !get().isMuted;
    get().setMuted(next);
    return next;
  },
}));
