/**
 * customization.js — Player cart look preferences (localStorage).
 * Preset palette IDs match CART_COLORS / PALETTE in config.js.
 */

import { CART_COLORS, PALETTE } from "./config.js";

export const CUSTOMIZE_STORAGE_KEY = "cartRaveCustomization";
export const COLOR_STORAGE_KEY = "cartRaveColor";
export const CUSTOM_HEX_STORAGE_KEY = "cartRaveCustomHex";
export const CUSTOM_COLOR_ID = "custom";

/** Fixed neon HSL — hue slider only; saturation/lightness stay vibrant. */
export const CUSTOM_NEON_SAT = 100;
export const CUSTOM_NEON_LIGHT = 50;
export const DEFAULT_CUSTOM_HUE = 280;

/**
 * @typedef {"preset" | "custom"} ColorMode
 * @typedef {{ colorMode: ColorMode, color: string, customHue: number, hex: number, cssHex: string }} PlayerCustomization
 */

/**
 * @param {number} hue 0–360
 * @returns {number} 0–360
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
export function hslToHex(h, s, l) {
  const hue = normalizeHue(h);
  const sat = Math.max(0, Math.min(100, s)) / 100;
  const light = Math.max(0, Math.min(100, l)) / 100;
  const c = (1 - Math.abs(2 * light - 1)) * sat;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = light - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (hue < 60) {
    r = c; g = x;
  } else if (hue < 120) {
    r = x; g = c;
  } else if (hue < 180) {
    g = c; b = x;
  } else if (hue < 240) {
    g = x; b = c;
  } else if (hue < 300) {
    r = x; b = c;
  } else {
    r = c; b = x;
  }
  const ri = Math.round((r + m) * 255);
  const gi = Math.round((g + m) * 255);
  const bi = Math.round((b + m) * 255);
  return (ri << 16) | (gi << 8) | bi;
}

/**
 * @param {number} hue
 * @returns {number}
 */
export function hueToNeonHex(hue) {
  return hslToHex(hue, CUSTOM_NEON_SAT, CUSTOM_NEON_LIGHT);
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
export function hexToHue(hex) {
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

/**
 * @param {number} hue
 * @returns {string}
 */
export function nearestPresetForHue(hue) {
  const target = normalizeHue(hue);
  let best = PALETTE[0];
  let bestDist = Infinity;
  for (const id of PALETTE) {
    const presetHue = hexToHue(CART_COLORS[id].hex);
    const dist = Math.min(
      Math.abs(target - presetHue),
      360 - Math.abs(target - presetHue),
    );
    if (dist < bestDist) {
      bestDist = dist;
      best = id;
    }
  }
  return best;
}

/**
 * @param {unknown} raw
 * @returns {PlayerCustomization}
 */
export function normalizeCustomization(raw) {
  const fallbackPreset = PALETTE[0];
  let colorMode = "preset";
  let color = fallbackPreset;
  let customHue = DEFAULT_CUSTOM_HUE;

  if (raw && typeof raw === "object") {
    const obj = /** @type {Record<string, unknown>} */ (raw);
    if (obj.colorMode === "custom") colorMode = "custom";
    if (typeof obj.customHue === "number" && Number.isFinite(obj.customHue)) {
      customHue = normalizeHue(obj.customHue);
    }
    if (typeof obj.color === "string") {
      if (obj.color === CUSTOM_COLOR_ID) {
        colorMode = "custom";
      } else if (PALETTE.includes(obj.color)) {
        color = obj.color;
        if (colorMode !== "custom") colorMode = "preset";
      }
    }
    if (typeof obj.customHex === "number" && Number.isFinite(obj.customHex) && colorMode === "custom") {
      customHue = normalizeHue(hexToHue(obj.customHex));
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
    colorMode,
    color,
    customHue,
    hex,
    cssHex: `#${hex.toString(16).padStart(6, "0")}`,
  };
}

/**
 * @returns {PlayerCustomization}
 */
export function loadPlayerCustomization() {
  try {
    const raw = localStorage.getItem(CUSTOMIZE_STORAGE_KEY);
    if (raw) return normalizeCustomization(JSON.parse(raw));
  } catch {}
  try {
    const legacy = localStorage.getItem(COLOR_STORAGE_KEY);
    if (legacy === CUSTOM_COLOR_ID) {
      const legacyHex = Number(localStorage.getItem(CUSTOM_HEX_STORAGE_KEY));
      if (Number.isFinite(legacyHex)) {
        return normalizeCustomization({
          colorMode: "custom",
          color: CUSTOM_COLOR_ID,
          customHue: hexToHue(legacyHex),
        });
      }
      return normalizeCustomization({ colorMode: "custom", color: CUSTOM_COLOR_ID });
    }
    if (legacy && PALETTE.includes(legacy)) {
      return normalizeCustomization({ colorMode: "preset", color: legacy });
    }
  } catch {}
  return normalizeCustomization({ colorMode: "preset", color: PALETTE[0] });
}

/**
 * @param {{ colorMode?: ColorMode, color?: string, customHue?: number }} input
 * @returns {PlayerCustomization}
 */
export function savePlayerCustomization(input) {
  const current = loadPlayerCustomization();
  const colorMode = input.colorMode === "custom" ? "custom" : "preset";
  let color = input.color ?? current.color;
  let customHue = input.customHue ?? current.customHue;

  if (colorMode === "custom") {
    color = CUSTOM_COLOR_ID;
    customHue = normalizeHue(customHue);
  } else if (!PALETTE.includes(color)) {
    color = PALETTE[0];
  }

  const normalized = normalizeCustomization({ colorMode, color, customHue });
  const payload = {
    colorMode: normalized.colorMode,
    color: normalized.colorMode === "custom" ? CUSTOM_COLOR_ID : normalized.color,
    customHue: normalized.customHue,
    customHex: normalized.hex,
  };

  try {
    localStorage.setItem(CUSTOMIZE_STORAGE_KEY, JSON.stringify(payload));
    localStorage.setItem(
      COLOR_STORAGE_KEY,
      normalized.colorMode === "custom" ? CUSTOM_COLOR_ID : normalized.color,
    );
    localStorage.setItem(CUSTOM_HEX_STORAGE_KEY, String(normalized.hex));
  } catch {}

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
  return PALETTE[0];
}

/**
 * @returns {number}
 */
export function getLocalPlayerCartHex() {
  return loadPlayerCustomization().hex;
}
