// audioStore.js — Vanilla Zustand store for game audio volume and mute settings.
import { createStore } from "zustand/vanilla";
import { STORAGE_KEYS, storageGet, storageSet } from "../utils/storage.js";

export const AUDIO_VOLUME_MAX = 1.15;
export const AUDIO_VOLUME_DEFAULT = 0.5 * AUDIO_VOLUME_MAX;

/** Volumes persist as integer percentages (0–100) of AUDIO_VOLUME_MAX. */
function loadVolumePct(key) {
  const saved = storageGet(key);
  if (saved === null) return null;
  const parsed = parseInt(saved, 10);
  if (Number.isNaN(parsed)) return null;
  return Math.min(Math.max((parsed / 100) * AUDIO_VOLUME_MAX, 0), AUDIO_VOLUME_MAX);
}

function loadInitialAudioState() {
  return {
    musicVolume: loadVolumePct(STORAGE_KEYS.musicVolume) ?? AUDIO_VOLUME_DEFAULT,
    sfxVolume: loadVolumePct(STORAGE_KEYS.sfxVolume) ?? AUDIO_VOLUME_DEFAULT,
    isMuted: storageGet(STORAGE_KEYS.muted) === "true",
  };
}

function saveVolumePct(key, clamped) {
  const pct = Math.round((clamped / AUDIO_VOLUME_MAX) * 100);
  storageSet(key, String(pct));
}

const initialState = loadInitialAudioState();

export const audioStore = createStore((set, get) => ({
  ...initialState,

  setMusicVolume: (volume) => {
    const clamped = Math.min(Math.max(volume, 0), AUDIO_VOLUME_MAX);
    set({ musicVolume: clamped });
    saveVolumePct(STORAGE_KEYS.musicVolume, clamped);
  },

  setSfxVolume: (volume) => {
    const clamped = Math.min(Math.max(volume, 0), AUDIO_VOLUME_MAX);
    set({ sfxVolume: clamped });
    saveVolumePct(STORAGE_KEYS.sfxVolume, clamped);
  },

  setMuted: (muted) => {
    const val = Boolean(muted);
    set({ isMuted: val });
    storageSet(STORAGE_KEYS.muted, val ? "true" : "false");
  },

  toggleMuted: () => {
    const next = !get().isMuted;
    get().setMuted(next);
    return next;
  },
}));
