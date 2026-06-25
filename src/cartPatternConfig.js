/**
 * cartPatternConfig.js — Pattern id registry (no Three.js / cart mesh deps).
 * Shared by customization persistence, menu UI, and cartPatterns.js wireframe masks.
 */

/** @typedef {typeof CART_PATTERN_IDS[number]} CartPatternId */

/** Ordered list of selectable pattern ids (classic = no mask). */
export const CART_PATTERN_IDS = ["classic", "stripes", "checker", "dots", "waves"];

export const DEFAULT_CART_PATTERN = "classic";

/** @type {Record<CartPatternId, { label: string, description: string }>} */
export const CART_PATTERNS = {
  classic: { label: "Classic", description: "Solid neon grid" },
  stripes: { label: "Stripes", description: "Diagonal dark stripes" },
  checker: { label: "Checker", description: "Dark checker mask" },
  dots: { label: "Dots", description: "Polka voids" },
  waves: { label: "Waves", description: "Ripple bands" },
};

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
 * CSS `background` for menu pattern swatches — neon base with dark mask preview.
 * @param {CartPatternId} patternId
 * @param {string} cssHex e.g. `#ff2bd6`
 * @returns {string}
 */
function getPatternSwatchBackground(patternId, cssHex) {
  const id = normalizePatternId(patternId);
  const c = cssHex || "#ff2bd6";
  const dark = "rgba(0,0,0,0.92)";
  switch (id) {
    case "stripes":
      return `repeating-linear-gradient(135deg, ${c} 0 5px, ${dark} 5px 12px)`;
    case "checker":
      return `conic-gradient(${c} 90deg, ${dark} 90deg 180deg, ${c} 180deg 270deg, ${dark} 270deg)`;
    case "dots":
      return `radial-gradient(circle, ${dark} 24%, ${c} 26%)`;
    case "waves":
      return `repeating-linear-gradient(0deg, ${c} 0 3px, ${dark} 3px 9px, ${c}88 9px 12px)`;
    default:
      return `linear-gradient(145deg, ${c}, ${c}cc)`;
  }
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
    case "stripes":
      return `<pattern id="${uid}-tile" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="12" height="12" fill="white"/>
        <rect width="5" height="12" fill="black"/>
      </pattern>`;
    case "checker":
      return `<pattern id="${uid}-tile" width="14" height="14" patternUnits="userSpaceOnUse">
        <rect width="14" height="14" fill="white"/>
        <rect width="7" height="7" fill="black"/>
        <rect x="7" y="7" width="7" height="7" fill="black"/>
      </pattern>`;
    case "dots":
      return `<pattern id="${uid}-tile" width="16" height="16" patternUnits="userSpaceOnUse">
        <rect width="16" height="16" fill="white"/>
        <circle cx="8" cy="8" r="5" fill="black"/>
      </pattern>`;
    case "waves":
      return `<pattern id="${uid}-tile" width="20" height="12" patternUnits="userSpaceOnUse">
        <rect width="20" height="12" fill="white"/>
        <path d="M0 6 Q5 0 10 6 T20 6" fill="none" stroke="black" stroke-width="4"/>
        <path d="M0 12 Q5 6 10 12 T20 12" fill="none" stroke="black" stroke-width="3"/>
      </pattern>`;
    default:
      return "";
  }
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
function makePatternMiniCartSvg(patternId, colorCss) {
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
