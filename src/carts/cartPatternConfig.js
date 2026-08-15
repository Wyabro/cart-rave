/**
 * cartPatternConfig.js — Pattern id registry (no Three.js / cart mesh deps).
 * Shared by customization persistence, menu UI, and cartPatterns.js wireframe masks.
 */

import { CART_COLORS } from "../config.js";

/** @typedef {typeof CART_PATTERN_IDS[number]} CartPatternId */

/** Ordered list of selectable pattern ids (classic = no mask). */
export const CART_PATTERN_IDS = [
  "classic", "stripes", "checker", "dots", "waves", "bolt", "honeycomb", "diamond", "cubes",
];

export const DEFAULT_CART_PATTERN = "classic";

/** @type {ReadonlyArray<CartPatternId>} */
const MULTICOLOR_PATTERN_IDS = Object.freeze(["honeycomb", "diamond", "cubes"]);
const MULTICOLOR_PATTERN_SET = new Set(MULTICOLOR_PATTERN_IDS);

/** @type {Record<CartPatternId, { label: string, description: string }>} */
export const CART_PATTERNS = {
  classic: { label: "Classic", description: "Solid neon grid" },
  stripes: { label: "Stripes", description: "Diagonal dark stripes" },
  checker: { label: "Checker", description: "Dark checker mask" },
  // * Keep this historical id: existing saved Dots selections now load as Maze.
  dots: { label: "Maze", description: "Intricate dark maze lines" },
  waves: { label: "Waves", description: "Ripple bands" },
  bolt: { label: "Bolt", description: "Electric chevron zigzag" },
  honeycomb: { label: "Honeycomb", description: "Multicolor interlocking hexes" },
  diamond: { label: "Diamond Weave", description: "Multicolor nested diamonds" },
  cubes: { label: "Isometric Cubes", description: "Multicolor cube tessellation" },
};

const CART_COLOR_HEXES = Object.values(CART_COLORS).map(({ hex }) => hex);
const MULTICOLOR_OFFSETS = {
  honeycomb: [1, 2],
  diamond: [2, 3],
  cubes: [3, 4],
};

/** @param {number} hex @returns {number} */
function cleanHex(hex) {
  return Number.isFinite(hex) ? Math.floor(hex) & 0xffffff : 0xff2bd6;
}

/** @param {number} hex @returns {[number, number, number]} */
function rgb(hex) {
  const n = cleanHex(hex);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

/** @param {number} a @param {number} b @param {number} amount @returns {number} */
function blendHex(a, b, amount) {
  const [ar, ag, ab] = rgb(a);
  const [br, bg, bb] = rgb(b);
  const t = Math.max(0, Math.min(1, amount));
  return (
    (Math.round(ar + (br - ar) * t) << 16)
    | (Math.round(ag + (bg - ag) * t) << 8)
    | Math.round(ab + (bb - ab) * t)
  ) >>> 0;
}

/** @param {number} hex @returns {number} */
function nearestCartColorIndex(hex) {
  const [r, g, b] = rgb(hex);
  let bestIndex = 0;
  let bestDistance = Infinity;
  for (let i = 0; i < CART_COLOR_HEXES.length; i += 1) {
    const [cr, cg, cb] = rgb(CART_COLOR_HEXES[i]);
    const distance = (r - cr) ** 2 + (g - cg) ** 2 + (b - cb) ** 2;
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = i;
    }
  }
  return bestIndex;
}

/**
 * @param {unknown} value
 * @returns {CartPatternId}
 */
export function normalizePatternId(value) {
  if (typeof value === "string" && CART_PATTERN_IDS.includes(value)) {
    return /** @type {CartPatternId} */ (value);
  }
  return DEFAULT_CART_PATTERN;
}

/**
 * Whether a pattern uses the selected-color-led multicolor shader path.
 * @param {string} patternId
 * @returns {boolean}
 */
export function isMulticolorPattern(patternId) {
  return MULTICOLOR_PATTERN_SET.has(normalizePatternId(patternId));
}

/**
 * Selected cart neon plus two brand-aligned accents for a multicolor pattern.
 * The base remains dominant; accents are blended toward different CART_COLORS entries.
 * @param {string} patternId
 * @param {number} neonHex
 * @returns {[number, number, number]}
 */
export function getPatternAccentHexes(patternId, neonHex) {
  const id = normalizePatternId(patternId);
  const base = cleanHex(neonHex);
  if (!isMulticolorPattern(id)) return [base, base, base];

  const [firstOffset, secondOffset] = MULTICOLOR_OFFSETS[id];
  const nearest = nearestCartColorIndex(base);
  const firstAnchor = CART_COLOR_HEXES[(nearest + firstOffset) % CART_COLOR_HEXES.length];
  const secondAnchor = CART_COLOR_HEXES[(nearest + secondOffset) % CART_COLOR_HEXES.length];
  return [base, blendHex(base, firstAnchor, 0.9), blendHex(base, secondAnchor, 0.9)];
}

/** @param {number} hex @returns {string} */
function cssHex(hex) {
  return `#${cleanHex(hex).toString(16).padStart(6, "0")}`;
}

/** @param {string} value @returns {number} */
function hexFromCss(value) {
  const match = /^#?([0-9a-f]{6})$/i.exec(value || "");
  return match ? Number.parseInt(match[1], 16) : 0xff2bd6;
}

/** @param {string} patternId @param {string} colorCss @returns {[string, string, string]} */
function getPatternAccentCss(patternId, colorCss) {
  const [base, accentA, accentB] = getPatternAccentHexes(patternId, hexFromCss(colorCss));
  return [cssHex(base), cssHex(accentA), cssHex(accentB)];
}

/**
 * SVG mask tile for wireframe stroke previews (menu cart + mini chips).
 * @param {CartPatternId} patternId
 * @param {string} patternUid unique id prefix for SVG defs
 * @returns {string}
 */
function patternMaskTileSvg(patternId, patternUid) {
  const id = normalizePatternId(patternId);
  const uid = patternUid || "pat";
  switch (id) {
    // * Bolder ~50%-coverage tiles that mirror the in-shader masks (cartPatterns.js).
    case "stripes":
      return `<pattern id="${uid}-tile" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="12" height="12" fill="white"/>
        <rect width="6" height="12" fill="black"/>
      </pattern>`;
    case "checker":
      return `<pattern id="${uid}-tile" width="14" height="14" patternUnits="userSpaceOnUse">
        <rect width="14" height="14" fill="white"/>
        <rect width="7" height="7" fill="black"/>
        <rect x="7" y="7" width="7" height="7" fill="black"/>
      </pattern>`;
    case "dots":
      return `<pattern id="${uid}-tile" width="64" height="64" patternUnits="userSpaceOnUse">
        <rect width="64" height="64" fill="white"/>
        <path d="M16 0 V16 H32 M32 16 H48 V32 M0 48 H16 V64 M48 32 V48 H64" fill="none" stroke="black" stroke-width="7" stroke-linecap="square" stroke-linejoin="miter"/>
      </pattern>`;
    case "waves":
      return `<pattern id="${uid}-tile" width="24" height="16" patternUnits="userSpaceOnUse">
        <rect width="24" height="16" fill="white"/>
        <path d="M0 4 Q6 0 12 4 T24 4 L24 12 Q18 8 12 12 T0 12 Z" fill="black"/>
      </pattern>`;
    case "bolt":
      // * Compact jagged forked bolt sized to the basket band so the chip/menu-cart preview
      // * matches the other patterns' scale (the live 3D cart uses the richer procedural mask).
      return `<pattern id="${uid}-tile" width="16" height="14" patternUnits="userSpaceOnUse">
        <rect width="16" height="14" fill="white"/>
        <path d="M9 0 L5 6 L10 7 L7 14" fill="none" stroke="black" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M10 7 L14 10" fill="none" stroke="black" stroke-width="1.6" stroke-linecap="round"/>
      </pattern>`;
    default:
      return "";
  }
}

/**
 * SVG tile for multicolor patterns. Its line families mirror the runtime mask.
 * @param {CartPatternId} patternId
 * @param {string} patternUid
 * @param {[string, string, string]} colors
 * @returns {string}
 */
function multicolorTileSvg(patternId, patternUid, colors) {
  const [base, accentA, accentB] = colors;
  const uid = patternUid || "pat";
  switch (patternId) {
    case "honeycomb":
      return `<pattern id="${uid}-tile" width="32" height="64" patternUnits="userSpaceOnUse">
        <path d="M0 -21.3 L16 -10.7 M0 21.3 L-16 10.7 M16 21.3 L32 10.7 M16 42.7 L0 53.3" fill="none" stroke="${base}" stroke-width="3" stroke-linecap="round"/>
        <path d="M16 -10.7 V10.7 M-16 -10.7 V10.7 M32 -10.7 V10.7 M0 21.3 V42.7" fill="none" stroke="${accentA}" stroke-width="3" stroke-linecap="round"/>
        <path d="M16 10.7 L0 21.3 M-16 10.7 L0 21.3 M32 10.7 L16 21.3 M0 42.7 L16 53.3" fill="none" stroke="${accentB}" stroke-width="3" stroke-linecap="round"/>
      </pattern>`;
    case "diamond":
      return `<pattern id="${uid}-tile" width="32" height="32" patternUnits="userSpaceOnUse">
        <path d="M16 2 L30 16 L16 30 L2 16 Z" fill="none" stroke="${base}" stroke-width="3.5"/>
        <path d="M16 7 L25 16 L16 25 L7 16 Z" fill="none" stroke="${accentA}" stroke-width="2.8"/>
        <path d="M16 12 L20 16 L16 20 L12 16 Z" fill="none" stroke="${accentB}" stroke-width="2.2"/>
      </pattern>`;
    case "cubes":
      return `<pattern id="${uid}-tile" width="32" height="32" patternUnits="userSpaceOnUse">
        <path d="M16 0 L32 8 M16 32 L0 24 M16 16 L32 24" fill="none" stroke="${base}" stroke-width="3" stroke-linecap="round"/>
        <path d="M32 8 V24 M0 8 V24 M16 16 V0" fill="none" stroke="${accentA}" stroke-width="3" stroke-linecap="round"/>
        <path d="M32 24 L16 32 M0 8 L16 0 M16 16 L0 24" fill="none" stroke="${accentB}" stroke-width="3" stroke-linecap="round"/>
      </pattern>`;
    default:
      return "";
  }
}

/** @param {string} uid @param {string} basketPath @param {string[]} gridLines @returns {string} */
function basketWireClipSvg(uid, basketPath, gridLines) {
  return `<clipPath id="${uid}-wire">
    <path d="${basketPath}" fill="none" stroke="white" stroke-width="7" stroke-linejoin="round"/>
    ${gridLines.map((d) => `<path d="${d}" fill="none" stroke="white" stroke-width="3" stroke-linecap="round"/>`).join("")}
  </clipPath>`;
}

/**
 * SVG pattern preview parts for the menu cart — masks wireframe strokes, not flat panels.
 * @param {CartPatternId} patternId
 * @param {string} colorCss
 * @param {string} patternUid unique id prefix for SVG defs
 * @returns {{ defs: string, overlay: string }}
 */
export function patternSvgParts(patternId, colorCss, patternUid) {
  const id = normalizePatternId(patternId);
  if (id === "classic") return { defs: "", overlay: "" };

  const uid = patternUid || "pat";
  const tile = patternMaskTileSvg(id, uid);
  if (!tile) return { defs: "", overlay: "" };

  const basketPath = "M44 50 L200 50 L182 120 L60 120 Z";
  const gridLines = [
    "M50 72 L196 72",
    "M54 92 L190 92",
    "M82 50 L78 120",
    "M120 50 L120 120",
    "M158 50 L162 120",
  ];

  if (isMulticolorPattern(id)) {
    const colors = getPatternAccentCss(id, colorCss);
    const tile = multicolorTileSvg(id, uid, colors);
    return {
      defs: `${tile}${basketWireClipSvg(uid, basketPath, gridLines)}`,
      overlay: `<g clip-path="url(#${uid}-wire)">
        <rect x="44" y="50" width="156" height="70" fill="${colors[0]}"/>
        <rect x="44" y="50" width="156" height="70" fill="url(#${uid}-tile)"/>
      </g>`,
    };
  }

  return {
    defs: `${tile}
    <mask id="${uid}-mask">
      <rect x="0" y="0" width="220" height="180" fill="white"/>
      <rect x="44" y="50" width="156" height="70" fill="url(#${uid}-tile)"/>
    </mask>`,
    overlay: `<g mask="url(#${uid}-mask)">
      <path d="${basketPath}" fill="none" stroke="${colorCss}" stroke-width="7" stroke-linejoin="round"/>
      ${gridLines.map((d) => `<path d="${d}" stroke="${colorCss}" stroke-width="3" stroke-linecap="round"/>`).join("")}
    </g>`,
  };
}

/**
 * Mini cart SVG for pattern chip buttons (matches color-chip mini cart scale).
 * @param {CartPatternId} patternId
 * @param {string} colorCss
 * @returns {string}
 */
export function makePatternMiniCartSvg(patternId, colorCss) {
  const id = normalizePatternId(patternId);
  const c = colorCss || "#ff2bd6";
  const uid = `m${Math.random().toString(36).slice(2, 7)}`;
  const basket = "M10 10 L40 10 L36 24 L14 24 Z";
  const grid = ["M12 16 L38 16", "M14 20 L36 20", "M18 10 L17 24", "M26 10 L26 24", "M32 10 L33 24"];

  if (id === "classic") {
    return `<svg viewBox="0 0 44 36" width="32" height="26" style="overflow:visible;">
      <path d="M2 6 L10 6 L14 20" fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round"/>
      <path d="${basket}" fill="none" stroke="${c}" stroke-width="2" stroke-linejoin="round"/>
      ${grid.map((d) => `<path d="${d}" stroke="${c}" stroke-width="1.2" stroke-linecap="round"/>`).join("")}
      <circle cx="16" cy="30" r="3.5" fill="none" stroke="${c}" stroke-width="2"/>
      <circle cx="34" cy="30" r="3.5" fill="none" stroke="${c}" stroke-width="2"/>
    </svg>`;
  }

  if (isMulticolorPattern(id)) {
    const colors = getPatternAccentCss(id, c);
    const tile = multicolorTileSvg(id, uid, colors);
    const clip = `<clipPath id="${uid}-wire"><path d="${basket}" fill="none" stroke="white" stroke-width="2" stroke-linejoin="round"/>${grid.map((d) => `<path d="${d}" fill="none" stroke="white" stroke-width="1.2" stroke-linecap="round"/>`).join("")}</clipPath>`;
    return `<svg viewBox="0 0 44 36" width="32" height="26" style="overflow:visible;">
      <defs>${tile}${clip}</defs>
      <path d="M2 6 L10 6 L14 20" fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round"/>
      <g clip-path="url(#${uid}-wire)"><rect x="10" y="10" width="30" height="14" fill="${colors[0]}"/><rect x="10" y="10" width="30" height="14" fill="url(#${uid}-tile)"/></g>
      <circle cx="16" cy="30" r="3.5" fill="none" stroke="${c}" stroke-width="2"/><circle cx="34" cy="30" r="3.5" fill="none" stroke="${c}" stroke-width="2"/>
    </svg>`;
  }

  const tile = patternMaskTileSvg(id, uid);
  return `<svg viewBox="0 0 44 36" width="32" height="26" style="overflow:visible;">
    <defs>${tile}
      <mask id="${uid}-mask">
        <rect width="44" height="36" fill="white"/>
        <rect x="10" y="10" width="30" height="14" fill="url(#${uid}-tile)"/>
      </mask>
    </defs>
    <path d="M2 6 L10 6 L14 20" fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round"/>
    <g mask="url(#${uid}-mask)">
      <path d="${basket}" fill="none" stroke="${c}" stroke-width="2" stroke-linejoin="round"/>
      ${grid.map((d) => `<path d="${d}" stroke="${c}" stroke-width="1.2" stroke-linecap="round"/>`).join("")}
    </g>
    <circle cx="16" cy="30" r="3.5" fill="none" stroke="${c}" stroke-width="2"/>
    <circle cx="34" cy="30" r="3.5" fill="none" stroke="${c}" stroke-width="2"/>
  </svg>`;
}
