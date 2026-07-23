// icons.js — Cart Clash HUD glyph set ("peel-and-stick" art direction).
// One drawing rule survives HUD sizes: chunky FILL, never thin strokes.
// 24×24 viewBox. Plain glyphs use `currentColor`; the four personality marks
// are full collectible emblems — shaped sticker backing in the personality
// color with a sticker-white die-cut ring, icon ink on top (explicit colors,
// not currentColor, so they read identically everywhere).

/** Sticker-material inks (mirror tokens.css — SVG can't read CSS vars cross-shadow reliably). */
const STICKER_WHITE = "#f2ede4";
const INK_DEEP = "#08050f";

/** @type {Record<string, string>} */
const GLYPHS = {
  // Leader crown — chunky filled, reads at 12px.
  crown: '<path d="M3 18 L4.2 7.5 L8.5 11.5 L12 4.5 L15.5 11.5 L19.8 7.5 L21 18 Z" fill="currentColor"/><rect x="4" y="19" width="16" height="2.4" rx="1.2" fill="currentColor"/>',
  // KO impact burst — six fat cartoon points (survives 12px, stamps well at 48px).
  burst: '<path d="M12 1 L15 8.5 L22 6 L18.5 12 L22 18 L15 15.5 L12 23 L9 15.5 L2 18 L5.5 12 L2 6 L9 8.5 Z" fill="currentColor"/>',
  // Dizzy stars — two solid stars, no strokes, no opacity tricks.
  dizzy: '<path d="M9 2.5 L10.8 7.2 L15.5 7.8 L12 11 L13 15.8 L9 13.2 L5 15.8 L6 11 L2.5 7.8 L7.2 7.2 Z" fill="currentColor"/><path d="M17.5 12.5 L18.6 15.4 L21.5 15.8 L19.4 17.8 L20 20.8 L17.5 19.2 L15 20.8 L15.6 17.8 L13.5 15.8 L16.4 15.4 Z" fill="currentColor"/>',
  // Boost bolt.
  bolt: '<path d="M13.5 2 L5 13.5 L10.5 13.5 L9 22 L19 9.5 L12.5 9.5 Z" fill="currentColor"/>',
  // Speaker (audio on).
  speaker: '<path d="M4 9.5 L8 9.5 L13 5 L13 19 L8 14.5 L4 14.5 Z" fill="currentColor"/><path d="M16 8.5 a5 5 0 0 1 0 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><path d="M18.5 6 a9 9 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>',
  // Speaker muted — X fat enough to read as a state, not a smudge.
  speakerMuted: '<path d="M4 9.5 L8 9.5 L13 5 L13 19 L8 14.5 L4 14.5 Z" fill="currentColor"/><path d="M16.5 9.5 L21.5 14.5 M21.5 9.5 L16.5 14.5" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"/>',
  // Menu (hamburger, rounded).
  menu: '<rect x="4" y="6" width="16" height="2.6" rx="1.3" fill="currentColor"/><rect x="4" y="10.7" width="16" height="2.6" rx="1.3" fill="currentColor"/><rect x="4" y="15.4" width="16" height="2.6" rx="1.3" fill="currentColor"/>',
  // Host — steering wheel: "the driver of the cart", never "the server".
  // Fat strokes so it survives ~10px kill-feed scale without mushing.
  host: '<circle cx="12" cy="12" r="8.3" fill="none" stroke="currentColor" stroke-width="2.8"/><circle cx="12" cy="12" r="3" fill="currentColor"/><path d="M12 14.6 V20 M9.8 10.6 L4.8 7.6 M14.2 10.6 L19.2 7.6" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>',
  // Shopper — the HUMAN player emblem (NPCs get personality marks). A collectible
  // sticker in the emblem family: cart-color round backing (currentColor, so it
  // tints per cart) + sticker-white die-cut ring + ink cart mark on top.
  shopper:
    `<circle cx="12" cy="12" r="9.5" fill="currentColor" stroke="${STICKER_WHITE}" stroke-width="1.5"/>` +
    `<path d="M6.8 8.9 H8.4 L9.15 11 H16.9 L15.6 14.9 H10.35 Z" fill="none" stroke="${INK_DEEP}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>` +
    `<circle cx="10.9" cy="16.5" r="1.15" fill="${INK_DEEP}"/>` +
    `<circle cx="15" cy="16.5" r="1.15" fill="${INK_DEEP}"/>`,

  // ── Personality emblems — collectible sticker set ──────────────────────
  // Aggressor: red impact burst ("SMASH"), white star punch.
  aggressor:
    `<path d="M12 1 L15 8.5 L22 6 L18.5 12 L22 18 L15 15.5 L12 23 L9 15.5 L2 18 L5.5 12 L2 6 L9 8.5 Z" fill="#ff4d4d" stroke="${STICKER_WHITE}" stroke-width="1.5" stroke-linejoin="round"/>` +
    `<path d="M12 6.5 L13.5 10.5 L17.5 12 L13.5 13.5 L12 17.5 L10.5 13.5 L6.5 12 L10.5 10.5 Z" fill="${STICKER_WHITE}"/>`,
  // Lurker: purple surveillance shield, watching eye.
  lurker:
    `<path d="M4 3 H20 V14.5 L12 21.5 L4 14.5 Z" fill="#b366ff" stroke="${STICKER_WHITE}" stroke-width="1.5" stroke-linejoin="round"/>` +
    `<path d="M6.5 10.8 C9 7.6 15 7.6 17.5 10.8 C15 14.2 9 14.2 6.5 10.8 Z" fill="${STICKER_WHITE}"/>` +
    `<circle cx="12" cy="10.9" r="1.9" fill="#b366ff"/>`,
  // Scavenger: green bargain tag with punched hole and % mark (visual motif only).
  scavenger:
    `<path d="M9.5 3.5 H20.5 V20.5 H9.5 L3 12 Z" fill="#4dff88" stroke="${STICKER_WHITE}" stroke-width="1.5" stroke-linejoin="round"/>` +
    `<circle cx="8" cy="12" r="1.6" fill="${INK_DEEP}"/>` +
    `<circle cx="13.2" cy="9.2" r="1.7" fill="none" stroke="${INK_DEEP}" stroke-width="1.8"/>` +
    `<circle cx="17.8" cy="14.8" r="1.7" fill="none" stroke="${INK_DEEP}" stroke-width="1.8"/>` +
    `<path d="M18.3 7.5 L12.7 16.5" stroke="${INK_DEEP}" stroke-width="1.8" stroke-linecap="round"/>`,
  // Chaotic: orange clearance explosion (deliberately uneven spikes), ink swirl.
  chaotic:
    `<path d="M12 1 L14.5 7 L20 3.5 L18 9.5 L23.5 11 L17.5 13.5 L21 19.5 L14.5 16.5 L13 23 L10.5 17 L4.5 20.5 L7 14 L0.5 12.5 L7 10 L3.5 4.5 L9.5 7.5 Z" fill="#ffaa33" stroke="${STICKER_WHITE}" stroke-width="1.5" stroke-linejoin="round"/>` +
    `<path d="M12.5 12 a1.8 1.8 0 0 0 -1.8 -1.8 a3.4 3.4 0 0 0 -3.4 3.4 a5.2 5.2 0 0 0 5.2 5.2 a7.2 7.2 0 0 0 7 -5.6" fill="none" stroke="${INK_DEEP}" stroke-width="2.4" stroke-linecap="round"/>`,
};

/**
 * Returns an inline-SVG string for a named HUD glyph, sized in em so it scales
 * with the surrounding text. Unknown names return an empty string.
 *
 * @param {keyof typeof GLYPHS | string} name
 * @param {{ size?: string, className?: string, label?: string }} [opts]
 *   size: CSS width/height (default "1em"); label: accessible name, otherwise
 *   the glyph is aria-hidden decoration.
 * @returns {string}
 */
export function svgIcon(name, opts = {}) {
  const body = GLYPHS[name];
  if (!body) return "";
  const size = opts.size || "1em";
  const cls = opts.className ? ` class="${opts.className}"` : "";
  const aria = opts.label
    ? ` role="img" aria-label="${opts.label}"`
    : ' aria-hidden="true"';
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}"${cls}${aria} focusable="false" style="display:inline-block;vertical-align:-0.12em;">${body}</svg>`;
}
