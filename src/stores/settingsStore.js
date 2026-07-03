// settingsStore.js — Vanilla Zustand store for graphics, post-processing, and level preferences.
import { createStore } from "zustand/vanilla";

const STORAGE_KEY_BLOOM = "cartRaveBloom";
const STORAGE_KEY_FX = "cartRaveFx";
const STORAGE_KEY_LOW_QUALITY = "cartRaveLowQuality";
const STORAGE_KEY_LEVEL = "cartRaveLevel";

function loadInitialSettings() {
  let bloomEnabled = true;
  let fxPassEnabled = true;
  let lowQuality = false;
  let selectedLevelId = null;

  if (typeof localStorage !== "undefined") {
    try {
      if (localStorage.getItem(STORAGE_KEY_BLOOM) === "off") bloomEnabled = false;
    } catch {}

    try {
      if (localStorage.getItem(STORAGE_KEY_FX) === "off") fxPassEnabled = false;
    } catch {}

    try {
      const val = localStorage.getItem(STORAGE_KEY_LOW_QUALITY);
      if (val === "true") {
        lowQuality = true;
      } else if (val === "false") {
        lowQuality = false;
      } else if (typeof window !== "undefined" && window.matchMedia) {
        // Fall back to prefers-reduced-motion heuristic if unset
        lowQuality = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      }
    } catch {}

    try {
      selectedLevelId = localStorage.getItem(STORAGE_KEY_LEVEL);
    } catch {}
  }

  return { bloomEnabled, fxPassEnabled, lowQuality, selectedLevelId };
}

const initialState = loadInitialSettings();

export const settingsStore = createStore((set) => ({
  ...initialState,

  setBloomEnabled: (enabled) => {
    const val = Boolean(enabled);
    set({ bloomEnabled: val });
    if (typeof localStorage !== "undefined") {
      try {
        localStorage.setItem(STORAGE_KEY_BLOOM, val ? "on" : "off");
      } catch {}
    }
  },

  setFxPassEnabled: (enabled) => {
    const val = Boolean(enabled);
    set({ fxPassEnabled: val });
    if (typeof localStorage !== "undefined") {
      try {
        localStorage.setItem(STORAGE_KEY_FX, val ? "on" : "off");
      } catch {}
    }
  },

  setLowQuality: (enabled) => {
    const val = Boolean(enabled);
    set({ lowQuality: val });
    if (typeof localStorage !== "undefined") {
      try {
        localStorage.setItem(STORAGE_KEY_LOW_QUALITY, val ? "true" : "false");
      } catch {}
    }
  },

  setSelectedLevelId: (levelId) => {
    set({ selectedLevelId: levelId });
    if (typeof localStorage !== "undefined" && levelId) {
      try {
        localStorage.setItem(STORAGE_KEY_LEVEL, levelId);
      } catch {}
    }
  },
}));
