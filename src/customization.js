/**
 * customization.js — Player cart look preferences (localStorage).
 * Preset palette IDs match CART_COLORS / PALETTE in config.js.
 *
 * Customization flow (color + pattern + sunglasses → in-game cart):
 * 1. Menu (`cart-rave-menu.js`) calls `savePlayerCustomization()` on chip/slider/pattern/sunglasses/DONE — single write path.
 * 2. `loadPlayerCustomization()` reads `cartRaveCustomization` and seeds defaults on first visit.
 * 3. `resolveCartNeonHex(slot, ctx)` picks the neon frame hex: local human → saved customization;
 *    remote humans → server-synced `slot.lookHex`; NPCs → server slot color via CART_COLORS.
 * 4. `resolveCartPatternForSlot(slot, ctx)` picks the wireframe pattern id (local human → saved; others → classic).
 * 4b. `resolveCartThemeForSlot(slot, ctx)` always returns "rave" — the sole permanent base theme.
 * 4c. `resolveCartSunglassesStyleForSlot(slot, ctx)` picks the sunglasses style id (local human → saved; others → silver mirror).
 * 5. `main.js` passes `displayColorHexForSlot` into cart spawn/recolor, calls `applyCartFrameGlow()`
 *    for neon color, then `applyCartPattern()` for the wireframe pattern overlay layer. Color and pattern are independent.
 * 6. `resolveServerColorPick()` maps custom hues to the nearest preset for PartyKit slot assignment only.
 * 7. Clients send `lookHex` with `color_pick` / `cart_look`; the server stores it on the human slot and
 *    rebroadcasts via `slots` so every client renders the same cosmetic color. Sunglasses style is
 *    local-only for now (not networked) — only the local human's saved style is applied at spawn.
 *
 * Theme selection was removed: "rave" is the only theme. Any legacy `theme` field in localStorage
 * is silently ignored on load (never re-written), so old payloads migrate cleanly.
 */

import { CART_COLORS, PALETTE } from "./config.js";
import { DEFAULT_CART_PATTERN, normalizePatternId } from "./cartPatternConfig.js";
import {
  DEFAULT_CART_THEME,
  DEFAULT_SUNGLASSES_STYLE,
  SUNGLASSES_STYLES,
} from "./cartThemeConfig.js";

export const CUSTOMIZE_STORAGE_KEY = "cartRaveCustomization";
export const CUSTOM_COLOR_ID = "custom";

/** Fixed neon HSL — full saturation, mid lightness for intense spectral neons. */
const CUSTOM_NEON_SAT = 100;
const CUSTOM_NEON_LIGHT = 50;
/** Pure spectral red — not in CART_COLORS but snapped for warm custom hues. */
const CUSTOM_NEON_RED_HEX = 0xff0000;
/** Degrees from 0°/360° that map to CUSTOM_NEON_RED_HEX (HSL 100/50 skews orange by ~15°). */
const CUSTOM_RED_SNAP_DEG = 14;
const DEFAULT_PRESET_COLOR = PALETTE[0];

/** @type {PlayerCustomization | null} In-memory cache — invalidated on save and cross-tab storage events. */
let cachedCustomization = null;

/**
 * Clears the in-memory customization cache so the next load reads localStorage.
 */
export function invalidateCustomizationCache() {
  cachedCustomization = null;
}

export const DEFAULT_CUSTOM_HUE = 280;

/**
 * Default cart look when nothing is stored yet (preset pink, silver mirror sunglasses).
 * @returns {PlayerCustomization}
 */
function getDefaultCustomization() {
  return normalizeCustomization({
    colorMode: "preset",
    color: DEFAULT_PRESET_COLOR,
    customHue: DEFAULT_CUSTOM_HUE,
    pattern: DEFAULT_CART_PATTERN,
    sunglassesStyle: DEFAULT_SUNGLASSES_STYLE,
  });
}

/**
 * @typedef {"preset" | "custom"} ColorMode
 * @typedef {import("./cartPatternConfig.js").CartPatternId} CartPatternId
 * @typedef {import("./cartThemeConfig.js").CartThemeId} CartThemeId
 * @typedef {import("./cartThemeConfig.js").SunglassesStyleId} SunglassesStyleId
 * @typedef {{ colorMode: ColorMode, color: string, customHue: number, pattern: CartPatternId, sunglassesStyle: SunglassesStyleId, hex: number, cssHex: string }} PlayerCustomization
 */

/**
 * * Normalizes an arbitrary value to a valid sunglasses style id from {@link SUNGLASSES_STYLES},
 * * falling back to {@link DEFAULT_SUNGLASSES_STYLE}. Mirror-finish sunglasses are rave-only and
 * * not networked, so unknown / missing values silently default to silver mirror.
 *
 * @param {unknown} value
 * @returns {SunglassesStyleId}
 */
function normalizeSunglassesStyleId(value) {
  if (typeof value === "string"
    && SUNGLASSES_STYLES.some((s) => s.id === value)) {
    return /** @type {SunglassesStyleId} */ (value);
  }
  return DEFAULT_SUNGLASSES_STYLE;
}

/**
 * @param {number} hue hue in degrees
 * @returns {number} normalized hue in degrees
 */
export function normalizeHue(hue) {
  const h = Number(hue);
  if (!Number.isFinite(h)) return DEFAULT_CUSTOM_HUE;
  return ((Math.round(h) % 360) + 360) % 360;
}

/**
 * @param {number} h 0–360
 * @param {number} s 0–100
 * @param {number} l 0–100
 * @returns {number} 24-bit RGB hex
 */
function hslToHex(h, s, l) {
  const hue = normalizeHue(h);
  const sat = Math.max(0, Math.min(100, s)) / 100;
  const light = Math.max(0, Math.min(100, l)) / 100;
  const c = (1 - Math.abs(2 * light - 1)) * sat;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = light - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (hue < 60) { r = c; g = x; b = 0; }
  else if (hue < 120) { r = x; g = c; b = 0; }
  else if (hue < 180) { r = 0; g = c; b = x; }
  else if (hue < 240) { r = 0; g = x; b = c; }
  else if (hue < 300) { r = x; g = 0; b = c; }
  else { r = c; g = 0; b = x; }
  const ri = Math.round((r + m) * 255);
  const gi = Math.round((g + m) * 255);
  const bi = Math.round((b + m) * 255);
  return (ri << 16) | (gi << 8) | bi;
}

/**
 * @param {number} hue 0–360
 * @param {number} center 0–360
 * @returns {number} shortest angular distance in degrees
 */
function hueAngularDistance(hue, center) {
  return Math.min(Math.abs(hue - center), 360 - Math.abs(hue - center));
}

/**
 * Converts a custom hue to vivid in-game neon hex (HSL 100%, 50%).
 * Snaps warm hues near 0° to pure red (palette has no red preset — only neonOrange).
 * Snaps to exact CART_COLORS when on a preset angle. Bloom is balanced separately
 * via emissiveRefHexForNeonHex() in utils.js (nearest-preset intensity reference).
 *
 * @param {number} hue
 * @returns {number}
 */
function hueToNeonHex(hue) {
  const h = normalizeHue(hue);

  if (hueAngularDistance(h, 0) <= CUSTOM_RED_SNAP_DEG) {
    return CUSTOM_NEON_RED_HEX;
  }

  for (const p of PRESET_HUES) {
    if (hueAngularDistance(h, p.hue) < 0.5) return CART_COLORS[p.id].hex;
  }

  return hslToHex(h, CUSTOM_NEON_SAT, CUSTOM_NEON_LIGHT);
}

/**
 * @param {number} hue
 * @returns {string}
 */
export function hueToNeonCss(hue) {
  const hex = hueToNeonHex(hue);
  return `#${hex.toString(16).padStart(6, "0")}`;
}

/**
 * @param {number} hex 24-bit RGB
 * @returns {number} hue 0–360
 */
function hexToHue(hex) {
  const r = ((hex >> 16) & 255) / 255;
  const g = ((hex >> 8) & 255) / 255;
  const b = (hex & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d < 1e-6) return 0;
  let h = 0;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h *= 60;
  if (h < 0) h += 360;
  return h;
}

/** Preset palette hues — computed once; CART_COLORS hex values are immutable at runtime. */
const PRESET_HUES = PALETTE.map((id) => ({
  id,
  hue: hexToHue(CART_COLORS[id].hex),
}));

/**
 * @param {number} hue
 * @returns {string}
 */
function nearestPresetForHue(hue) {
  const target = normalizeHue(hue);
  let best = PALETTE[0];
  let bestDist = Infinity;
  for (const p of PRESET_HUES) {
    const dist = Math.min(
      Math.abs(target - p.hue),
      360 - Math.abs(target - p.hue),
    );
    if (dist < bestDist) {
      bestDist = dist;
      best = p.id;
    }
  }
  return best;
}

/**
 * @param {unknown} raw
 * @returns {PlayerCustomization}
 */
function normalizeCustomization(raw) {
  const fallbackPreset = PALETTE[0];
  let colorMode = "preset";
  let color = fallbackPreset;
  let customHue = DEFAULT_CUSTOM_HUE;
  let pattern = DEFAULT_CART_PATTERN;
  let sunglassesStyle = DEFAULT_SUNGLASSES_STYLE;

  let hasStoredCustomHue = false;
  if (raw && typeof raw === "object") {
    const obj = /** @type {Record<string, unknown>} */ (raw);
    if (typeof obj.pattern === "string") {
      pattern = normalizePatternId(obj.pattern);
    }
    // * Legacy `theme` field is intentionally ignored — "rave" is the sole permanent theme.
    if (typeof obj.sunglassesStyle === "string") {
      sunglassesStyle = normalizeSunglassesStyleId(obj.sunglassesStyle);
    }
    if (obj.colorMode === "custom") colorMode = "custom";
    if (typeof obj.customHue === "number" && Number.isFinite(obj.customHue)) {
      customHue = normalizeHue(obj.customHue);
      hasStoredCustomHue = true;
    } else if (typeof obj.customHue === "string" && obj.customHue.trim() !== "") {
      customHue = normalizeHue(Number(obj.customHue));
      hasStoredCustomHue = true;
    }
    if (typeof obj.color === "string") {
      if (obj.color === CUSTOM_COLOR_ID) {
        colorMode = "custom";
      } else if (PALETTE.includes(obj.color)) {
        color = obj.color;
        if (colorMode !== "custom") colorMode = "preset";
      }
    }
  }

  if (colorMode === "custom") {
    color = CUSTOM_COLOR_ID;
  } else if (!PALETTE.includes(color)) {
    color = fallbackPreset;
  }

  const hex = colorMode === "custom"
    ? hueToNeonHex(customHue)
    : (CART_COLORS[color]?.hex ?? CART_COLORS[fallbackPreset].hex);

  return {
    colorMode: /** @type {any} */ (colorMode),
    color,
    customHue,
    pattern,
    sunglassesStyle,
    hex,
    cssHex: `#${hex.toString(16).padStart(6, "0")}`,
  };
}

/**
 * @param {PlayerCustomization} normalized
 * @returns {object}
 */
function buildStoragePayload(normalized) {
  return {
    colorMode: normalized.colorMode,
    color: normalized.colorMode === "custom" ? CUSTOM_COLOR_ID : normalized.color,
    customHue: normalized.customHue,
    customHex: normalized.hex,
    pattern: normalized.pattern,
    sunglassesStyle: normalized.sunglassesStyle,
  };
}

/**
 * @param {PlayerCustomization} normalized
 * @returns {void}
 */
function writeCustomizationToStorage(normalized) {
  try {
    localStorage.setItem(CUSTOMIZE_STORAGE_KEY, JSON.stringify(buildStoragePayload(normalized)));
  } catch {}
}

/**
 * @returns {PlayerCustomization}
 */
export function loadPlayerCustomization() {
  if (cachedCustomization) return cachedCustomization;

  let loaded = null;
  try {
    const raw = localStorage.getItem(CUSTOMIZE_STORAGE_KEY);
    if (raw) loaded = normalizeCustomization(JSON.parse(raw));
  } catch {}

  if (!loaded) {
    // * First visit: seed canonical key so menu and game share one write path.
    loaded = getDefaultCustomization();
    writeCustomizationToStorage(loaded);
  }

  cachedCustomization = loaded;
  return cachedCustomization;
}

/**
 * Syncs customization across browser tabs via the storage event.
 */
export function wireCustomizationStorageSync() {
  if (typeof window === "undefined" || window.__cartRaveCustomizationStorageSync) return;
  window.__cartRaveCustomizationStorageSync = true;
  window.addEventListener("storage", (e) => {
    if (e.key !== CUSTOMIZE_STORAGE_KEY) return;
    invalidateCustomizationCache();
    const detail = loadPlayerCustomization();
    window.dispatchEvent(new CustomEvent("cartrave:customization-changed", { detail }));
  });
}

/**
 * @param {{ colorMode?: ColorMode, color?: string, customHue?: number, pattern?: string, sunglassesStyle?: string }} input
 * @returns {PlayerCustomization}
 */
export function savePlayerCustomization(input) {
  const current = loadPlayerCustomization();
  const colorMode = input.colorMode === "custom" ? "custom" : "preset";
  let color = input.color ?? current.color;
  let customHue = input.customHue ?? current.customHue;
  const pattern = normalizePatternId(input.pattern ?? current.pattern);
  const sunglassesStyle = normalizeSunglassesStyleId(input.sunglassesStyle ?? current.sunglassesStyle);

  if (colorMode === "custom") {
    color = CUSTOM_COLOR_ID;
    customHue = normalizeHue(customHue);
  } else if (!PALETTE.includes(color)) {
    color = PALETTE[0];
  }

  const normalized = normalizeCustomization({
    colorMode,
    color,
    customHue,
    pattern,
    sunglassesStyle,
  });

  writeCustomizationToStorage(normalized);
  cachedCustomization = normalized;

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("cartrave:customization-changed", { detail: normalized }));
  }

  return normalized;
}

/**
 * Preset id sent to PartyKit when the player uses a custom hue (server has no custom slot).
 * @returns {string}
 */
export function resolveServerColorPick() {
  const custom = loadPlayerCustomization();
  if (custom.colorMode === "custom") return nearestPresetForHue(custom.customHue);
  if (PALETTE.includes(custom.color)) return custom.color;
  return DEFAULT_PRESET_COLOR;
}

/**
 * Pattern id for a cart mesh — local human uses saved pattern; others use classic until networked.
 *
 * @param {{ kind?: string, connId?: string } | null | undefined} slot
 * @param {{ youConnId?: string | null, isLocalHuman?: boolean }} [ctx]
 * @returns {CartPatternId}
 */
export function resolveCartPatternForSlot(slot, ctx = {}) {
  const isLocal = ctx.isLocalHuman ?? isLocalHumanSlot(slot, ctx.youConnId);
  if (isLocal) return loadPlayerCustomization().pattern;
  return DEFAULT_CART_PATTERN;
}

/**
 * Cart theme id for a cart mesh — always "rave". Theme selection was removed; "rave" is the
 * sole permanent base configuration. The signature is kept so the spawn path
 * (`main.js` / `entities.js`) and `cartThemes.js` continue to resolve a CartThemeDef by id
 * without touching those modules.
 *
 * @param {{ kind?: string, connId?: string } | null | undefined} _slot — unused; kept for API stability
 * @param {{ youConnId?: string | null, isLocalHuman?: boolean }} [_ctx] - unused; kept for API stability
 * @returns {CartThemeId}
 */
export function resolveCartThemeForSlot(_slot, _ctx = {}) {
  return DEFAULT_CART_THEME;
}

/**
 * Sunglasses style id for a cart mesh — local human uses saved style; others use silver mirror.
 * Style is local-only for now (not synced via PartyKit), so remote humans and NPCs fall back to
 * the default silver mirror lens.
 *
 * @param {{ kind?: string, connId?: string } | null | undefined} slot
 * @param {{ youConnId?: string | null, isLocalHuman?: boolean }} [ctx]
 * @returns {SunglassesStyleId}
 */
export function resolveCartSunglassesStyleForSlot(slot, ctx = {}) {
  const isLocal = ctx.isLocalHuman ?? isLocalHumanSlot(slot, ctx.youConnId);
  if (isLocal) return loadPlayerCustomization().sunglassesStyle;
  return DEFAULT_SUNGLASSES_STYLE;
}

/**
 * @param {{ connId?: string, kind?: string } | null | undefined} slot
 * @param {string | null | undefined} youConnId
 * @returns {boolean}
 */
function isLocalHumanSlot(slot, youConnId) {
  return Boolean(
    slot
    && slot.kind === "human"
    && youConnId
    && slot.connId === youConnId,
  );
}

/**
 * @param {unknown} value
 * @returns {number | null}
 */
function normalizeLookHex(value) {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.floor(n) & 0xffffff;
}

/**
 * @param {{ lookHex?: number | null, color?: string, kind?: string } | null | undefined} slot
 * @returns {number | null}
 */
function lookHexFromSlot(slot) {
  if (!slot || slot.kind !== "human") return null;
  return normalizeLookHex(slot.lookHex);
}

/**
 * Neon frame hex for a cart mesh.
 * Local human → localStorage; remote human → slot.lookHex; NPC → CART_COLORS[slot.color].
 *
 * @param {{ color?: string | number, kind?: string, connId?: string, lookHex?: number | null } | null | undefined} slot
 * @param {{ youConnId?: string | null, isLocalHuman?: boolean }} [ctx]
 * @returns {number}
 */
export function resolveCartNeonHex(slot, ctx = {}) {
  if (!slot) return 0x888888;

  const isLocal = ctx.isLocalHuman ?? isLocalHumanSlot(slot, ctx.youConnId);
  if (isLocal) {
    return loadPlayerCustomization().hex;
  }

  const syncedLook = lookHexFromSlot(/** @type {any} */ (slot));
  if (syncedLook !== null) return syncedLook;

  const c = slot.color;
  if (typeof c === "number") return c;
  return CART_COLORS[c]?.hex ?? 0x888888;
}

/**
 * CSS hex for a cart slot — customization for the local human, server color for everyone else.
 *
 * @param {{ color?: string | number, kind?: string, connId?: string } | null | undefined} slot
 * @param {{ youConnId?: string | null, isLocalHuman?: boolean }} [ctx]
 * @returns {string}
 */
export function resolveCartNeonCss(slot, ctx = {}) {
  const hex = resolveCartNeonHex(slot, ctx);
  return `#${hex.toString(16).padStart(6, "0")}`;
}
