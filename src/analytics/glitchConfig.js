/**
 * glitchConfig.js — public Glitch title constants (safe to ship).
 * Runtime title token comes from Vite env only (never commit the token).
 */

/** Glitch title UUID for Cart Clash. */
export const GLITCH_TITLE_ID = "bf9f27c8-27be-4996-a3f0-cc4dc68ad2bb";

/** Absolute Glitch API base (never use same-origin /api for these calls). */
export const GLITCH_API_BASE = "https://api.glitch.fun/api";

/** Human version stamped on installs + Glitch deploy confirms. */
export const GLITCH_GAME_VERSION = "0.8.5";

/** Build channel for installs / deploy confirm. */
export const GLITCH_BUILD_TYPE = "playtest";

/**
 * Runtime title token (install/events). Empty when unset — Glitch platform stays off.
 * Set via `.env.local` / `.env.production.local`: `VITE_GLITCH_TITLE_TOKEN=...`
 * @returns {string}
 */
export function getGlitchTitleToken() {
  try {
    const raw = import.meta.env?.VITE_GLITCH_TITLE_TOKEN;
    return typeof raw === "string" ? raw.trim() : "";
  } catch {
    return "";
  }
}
