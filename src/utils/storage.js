/**
 * storage.js — Single registry of localStorage keys + safe accessors.
 *
 * Every persisted key lives here so the full storage surface is visible in one
 * place (and a future rename/migration can remap them together). Helpers never
 * throw: privacy modes and full quotas degrade to the fallback value.
 *
 * Key *strings* stay `cartRave*` until a deliberate migration (see docs/brand.md).
 *
 * No imports — safe to use from any module without cycle risk.
 */

export const STORAGE_KEYS = {
  /** Player display name (also read by netcode join flow). */
  username: "cartRaveUsername",
  /** Stable client identity for reconnect/host migration (owned by netcode.js). */
  clientId: "cartRaveClientId",
  /** Personal stats JSON: { wins, matches, totalPoints, soloGames }. */
  stats: "cartRaveStats",
  /** Best single-round score (number as string). */
  bestScore: "cartRaveBestScore",
  /** Selected level id. */
  level: "cartRaveLevel",
  /** NPC AI difficulty ("easy" | "medium" | "hard") — Solo default Easy; Quickplay forces medium. */
  aiDifficulty: "cartRaveAiDifficulty",
  /** Cart look preferences JSON (color/pattern/sunglasses). */
  customization: "cartRaveCustomization",
  /** Daily/weekly challenge progress JSON. */
  challenges: "cartRaveChallenges",
  /** Lifetime unlocks: cosmetics, levels, KO counters. */
  unlocks: "cartRaveUnlocks",
  /** "1" once the first-run HOW TO PLAY overlay has been shown. */
  howtoSeen: "cartRaveHowToSeen",
  /** "1" once a boot has completed — returning players get a shorter splash hold. */
  bootSeen: "cartRaveBootSeen",
  /** Graphics toggles ("on"/"off", "true"/"false"). */
  bloom: "cartRaveBloom",
  fxPass: "cartRaveFx",
  /** Legacy boolean quality flag — read once for migration to qualityTier. */
  lowQuality: "cartRaveLowQuality",
  /** Graphics quality tier ("low" | "medium" | "high-lite" | "high"). */
  qualityTier: "cartRaveQualityTier",
  /**
   * One-shot stamp (TIER-DEFAULT-1 lever 2): once set, `migrateStoredTierIfNeeded`
   * in gpuCaps.js never runs again for this browser. Value is a version string
   * ("2") so a future migration generation can bump it and re-run once more.
   */
  tierMigration: "cartRaveTierMigration",
  /** Audio persistence. */
  musicVolume: "cartRaveVolume",
  sfxVolume: "cartRaveSfxVol",
  voiceVolume: "cartRaveVoiceVol",
  muted: "cartRaveMuted",
  /** Announcer toggles ("on"/"off"). */
  announcerVoice: "cartRaveAnnouncerVoice",
  announcerCallouts: "cartRaveAnnouncerCallouts",
  /** Gameplay analytics opt-out ("off" disables all event collection). */
  analytics: "cartRaveAnalytics",
  /** Glitch install UUID (data.id from POST /installs). */
  glitchInstallId: "cartRaveGlitchInstallId",
  /** Glitch stable local user_install_id (never regenerate each launch). */
  glitchUserInstallId: "cartRaveGlitchUserInstallId",
  /** Glitch retention session_id for the current page session. */
  glitchSessionId: "cartRaveGlitchSessionId",
};

/**
 * sessionStorage keys (per-tab, survive reload but not new tabs). Kept separate
 * from STORAGE_KEYS so the persistent-vs-transient split stays visible.
 */
export const SESSION_KEYS = {
  /**
   * Room id (solo/testdrive) the tab actually entered gameplay in. Presence on
   * boot means the ?room= URL is a mid-round refresh leftover, not a deep link —
   * recover to the menu instead of auto-entering the room again.
   */
  engagedRoom: "cartRaveEngagedRoom",
};

/**
 * @param {string} key
 * @param {string | null} [fallback]
 * @returns {string | null}
 */
export function sessionGet(key, fallback = null) {
  try {
    if (typeof sessionStorage === "undefined") return fallback;
    const value = sessionStorage.getItem(key);
    return value === null ? fallback : value;
  } catch {
    return fallback;
  }
}

/**
 * @param {string} key
 * @param {string} value
 * @returns {boolean} False when storage is unavailable or the quota is full.
 */
export function sessionSet(key, value) {
  try {
    if (typeof sessionStorage === "undefined") return false;
    sessionStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {string} key
 * @returns {void}
 */
export function sessionRemove(key) {
  try {
    if (typeof sessionStorage !== "undefined") sessionStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

/**
 * @param {string} key
 * @param {string | null} [fallback]
 * @returns {string | null}
 */
export function storageGet(key, fallback = null) {
  try {
    if (typeof localStorage === "undefined") return fallback;
    const value = localStorage.getItem(key);
    return value === null ? fallback : value;
  } catch {
    return fallback;
  }
}

/**
 * @param {string} key
 * @param {string} value
 * @returns {boolean} False when storage is unavailable or the quota is full.
 */
export function storageSet(key, value) {
  try {
    if (typeof localStorage === "undefined") return false;
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

/**
 * JSON.parse with fallback on missing/corrupt payloads.
 * @template T
 * @param {string} key
 * @param {T} fallback
 * @returns {T}
 */
export function storageGetJson(key, fallback) {
  const raw = storageGet(key);
  if (raw === null) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

/**
 * @param {string} key
 * @param {unknown} value
 * @returns {boolean}
 */
export function storageSetJson(key, value) {
  try {
    return storageSet(key, JSON.stringify(value));
  } catch {
    return false;
  }
}
