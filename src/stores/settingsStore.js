// settingsStore.js — Vanilla Zustand store for graphics, post-processing, and level preferences.
import { createStore } from "zustand/vanilla";
import { STORAGE_KEYS, storageGet, storageSet } from "../utils/storage.js";
import { isTouchLikeDevice } from "../utils/device.js";

function detectDefaultLowQuality() {
  if (typeof window === "undefined") return false;
  try {
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
    return isTouchLikeDevice() || reducedMotion;
  } catch {
    return false;
  }
}

function loadInitialSettings() {
  const bloomEnabled = storageGet(STORAGE_KEYS.bloom) !== "off";
  const fxPassEnabled = storageGet(STORAGE_KEYS.fxPass) !== "off";

  let lowQuality;
  const val = storageGet(STORAGE_KEYS.lowQuality);
  if (val === "true") {
    lowQuality = true;
  } else if (val === "false") {
    lowQuality = false;
  } else {
    lowQuality = detectDefaultLowQuality();
  }

  const selectedLevelId = storageGet(STORAGE_KEYS.level);

  return { bloomEnabled, fxPassEnabled, lowQuality, selectedLevelId };
}

const initialState = loadInitialSettings();

export const settingsStore = createStore((set) => ({
  ...initialState,

  setBloomEnabled: (enabled) => {
    const val = Boolean(enabled);
    set({ bloomEnabled: val });
    storageSet(STORAGE_KEYS.bloom, val ? "on" : "off");
  },

  setFxPassEnabled: (enabled) => {
    const val = Boolean(enabled);
    set({ fxPassEnabled: val });
    storageSet(STORAGE_KEYS.fxPass, val ? "on" : "off");
  },

  setLowQuality: (enabled) => {
    const val = Boolean(enabled);
    set({ lowQuality: val });
    storageSet(STORAGE_KEYS.lowQuality, val ? "true" : "false");
  },

  setSelectedLevelId: (levelId) => {
    set({ selectedLevelId: levelId });
    if (levelId) storageSet(STORAGE_KEYS.level, levelId);
  },
}));
