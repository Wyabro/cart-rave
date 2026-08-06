// settingsStore.js — Vanilla Zustand store for graphics, post-processing, and level preferences.
import { createStore } from "zustand/vanilla";
import { STORAGE_KEYS, storageGet, storageSet } from "../utils/storage.js";
import { isTouchLikeDevice } from "../utils/device.js";
import { defaultTierForCaps, migrateStoredTierIfNeeded, probeGpu } from "../utils/gpuCaps.js";
import { DEFAULT_SOLO, normalizeDifficulty } from "../aiDifficulty.js";

/** @type {ReadonlyArray<string>} */
const VALID_TIERS = ["low", "medium", "high"];

/**
 * First-run tier default. Device-aware via the six-class GPU taxonomy in
 * gpuCaps.js (TIER-DEFAULT-1) — "high" is only safe on clearly-discrete GPUs
 * under a resolution ceiling; modern iGPUs and old/weak discrete cards start
 * MEDIUM; basic iGPUs, software rasterizers, and weak/touch devices start LOW.
 * Runs only when no tier is stored; the probe result is not persisted, so a user
 * whose hardware situation changes gets re-detected next visit.
 *
 * `reducedMotion` (TIER-DEFAULT-1 lever 4) demotes the result one rung inside
 * {@link defaultTierForCaps} rather than hard-pinning low — see that function's
 * docstring for why (cap-287/288: the a11y toggle was silently picking tier).
 *
 * `backingPixels` (TIER-DEFAULT-1 lever 5) is `screen.width * screen.height *
 * dpr²` — the ceiling the canvas can reach, not `innerWidth`/`innerHeight`
 * (which can be smaller than the screen at boot, before any window resize).
 */
function detectDefaultQualityTier() {
  if (typeof window === "undefined") return "high";
  try {
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
    const touchLike = isTouchLikeDevice();
    const gpu = probeGpu();
    // * deviceMemory is Chrome-only and clamped to [0.25, 8]; ≤2 GB is a hard
    // * potato signal regardless of GPU string.
    const deviceMemoryGb = /** @type {{ deviceMemory?: number }} */ (navigator).deviceMemory;
    const dpr = window.devicePixelRatio || 1;
    const backingPixels =
      typeof screen !== "undefined" && screen.width && screen.height
        ? screen.width * screen.height * dpr * dpr
        : null;
    return defaultTierForCaps({ gpuClass: gpu.gpuClass, deviceMemoryGb, touchLike, reducedMotion, backingPixels });
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

  // * TIER-DEFAULT-1 lever 2 (H1): one-shot — a returning visitor's stored
  // * "medium" is rewritten to "low" if their GPU now classifies as igpu-basic
  // * or software. See migrateStoredTierIfNeeded's docstring for why. Gated on
  // * the migration key so probeGpu()'s throwaway WebGL context only runs once
  // * ever per browser, not on every boot after the migration has already run.
  const migrationDone = storageGet(STORAGE_KEYS.tierMigration);
  if (!migrationDone) {
    const migratedTier = migrateStoredTierIfNeeded({
      storedTier: qualityTier,
      migrationDone,
      gpuClass: probeGpu().gpuClass,
    });
    if (migratedTier) {
      qualityTier = migratedTier;
      storageSet(STORAGE_KEYS.qualityTier, migratedTier);
    }
    storageSet(STORAGE_KEYS.tierMigration, "2");
  }

  const selectedLevelId = storageGet(STORAGE_KEYS.level);
  const aiDifficulty = normalizeDifficulty(storageGet(STORAGE_KEYS.aiDifficulty), DEFAULT_SOLO);

  return {
    bloomEnabled,
    fxPassEnabled,
    qualityTier,
    selectedLevelId,
    aiDifficulty,
    announcerVoiceEnabled,
    announcerCalloutsEnabled,
  };
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

  setAiDifficulty: (difficulty) => {
    const val = normalizeDifficulty(difficulty, DEFAULT_SOLO);
    set({ aiDifficulty: val });
    storageSet(STORAGE_KEYS.aiDifficulty, val);
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
