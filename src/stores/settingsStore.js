// settingsStore.js — Vanilla Zustand store for graphics, post-processing, and level preferences.
import { createStore } from "zustand/vanilla";
import { STORAGE_KEYS, storageGet, storageSet } from "../utils/storage.js";
import { isTouchLikeDevice } from "../utils/device.js";
import { probeGpu } from "../utils/gpuCaps.js";

/** @type {ReadonlyArray<string>} */
const VALID_TIERS = ["low", "medium", "high"];

/**
 * First-run tier default. Device-aware: "high" (reflector, DPR×2, HDR bloom) is
 * only safe on clearly-discrete GPUs — iGPUs and unknowns start MEDIUM (full
 * personality, leaner budget), software rasterizers and weak/touch devices start
 * LOW. Runs only when no tier is stored; the probe result is not persisted, so a
 * user whose hardware situation changes gets re-detected next visit.
 */
function detectDefaultQualityTier() {
  if (typeof window === "undefined") return "high";
  try {
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
    if (isTouchLikeDevice() || reducedMotion) return "low";
    const gpu = probeGpu();
    if (gpu.gpuClass === "software") return "low";
    // * deviceMemory is Chrome-only and clamped to [0.25, 8]; ≤2 GB is a hard
    // * potato signal regardless of GPU string.
    const deviceMemoryGb = /** @type {{ deviceMemory?: number }} */ (navigator).deviceMemory;
    if (typeof deviceMemoryGb === "number" && deviceMemoryGb <= 2) return "low";
    if (gpu.gpuClass === "discrete") return "high";
    return "medium";
  } catch {
    return "medium";
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
