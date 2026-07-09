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
  /** Cart look preferences JSON (color/pattern/sunglasses). */
  customization: "cartRaveCustomization",
  /** Daily/weekly challenge progress JSON. */
  challenges: "cartRaveChallenges",
  /** Lifetime unlocks: cosmetics, levels, KO counters. */
  unlocks: "cartRaveUnlocks",
  /** "1" once the first-run HOW TO PLAY overlay has been shown. */
  howtoSeen: "cartRaveHowToSeen",
  /** Graphics toggles ("on"/"off", "true"/"false"). */
  bloom: "cartRaveBloom",
  fxPass: "cartRaveFx",
  lowQuality: "cartRaveLowQuality",
  /** Audio persistence. */
  musicVolume: "cartRaveVolume",
  sfxVolume: "cartRaveSfxVol",
  muted: "cartRaveMuted",
  /** Announcer toggles ("on"/"off"). */
  announcerVoice: "cartRaveAnnouncerVoice",
  announcerCallouts: "cartRaveAnnouncerCallouts",
};

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
