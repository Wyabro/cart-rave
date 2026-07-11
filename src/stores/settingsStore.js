// settingsStore.js — Vanilla Zustand store for graphics, post-processing, and level preferences.
import { createStore } from "zustand/vanilla";
import { STORAGE_KEYS, storageGet, storageSet } from "../utils/storage.js";
import { isTouchLikeDevice } from "../utils/device.js";

/** @type {ReadonlyArray<string>} */
const VALID_TIERS = ["low", "medium", "high"];

function detectDefaultQualityTier() {
  if (typeof window === "undefined") return "high";
  try {
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
    return isTouchLikeDevice() || reducedMotion ? "low" : "high";
  } catch {
    return "high";
  }
}

function loadInitialSettings() {
  const bloomEnabled = storageGet(STORAGE_KEYS.bloom) !== "off";
  const fxPassEnabled = storageGet(STORAGE_KEYS.fxPass) !== "off";
  const announcerVoiceEnabled = storageGet(STORAGE_KEYS.announcerVoice) !== "off";
  const announcerCalloutsEnabled = storageGet(STORAGE_KEYS.announcerCallouts) !== "off";

  let qualityTier = storageGet(STORAGE_KEYS.qualityTier);
  if (!VALID_TIERS.includes(qualityTier)) {
    // * One-time migration from the legacy boolean flag (true→low, false→high).
    const legacy = storageGet(STORAGE_KEYS.lowQuality);
    if (legacy === "true") qualityTier = "low";
    else if (legacy === "false") qualityTier = "high";
    else qualityTier = detectDefaultQualityTier();
  }

  const selectedLevelId = storageGet(STORAGE_KEYS.level);

  return { bloomEnabled, fxPassEnabled, qualityTier, selectedLevelId, announcerVoiceEnabled, announcerCalloutsEnabled };
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

  setQualityTier: (tier) => {
    if (!VALID_TIERS.includes(tier)) return;
    set({ qualityTier: tier });
    storageSet(STORAGE_KEYS.qualityTier, tier);
  },

  setSelectedLevelId: (levelId) => {
    set({ selectedLevelId: levelId });
    if (levelId) storageSet(STORAGE_KEYS.level, levelId);
  },

  setAnnouncerVoiceEnabled: (enabled) => {
    const val = Boolean(enabled);
    set({ announcerVoiceEnabled: val });
    storageSet(STORAGE_KEYS.announcerVoice, val ? "on" : "off");
  },

  setAnnouncerCalloutsEnabled: (enabled) => {
    const val = Boolean(enabled);
    set({ announcerCalloutsEnabled: val });
    storageSet(STORAGE_KEYS.announcerCallouts, val ? "on" : "off");
  },
}));
