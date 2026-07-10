// icons.js — Cart Clash HUD glyph set. One drawing style everywhere:
// 24×24 viewBox, 2px rounded strokes or chunky fills, `currentColor` so each
// glyph inherits its element's color. Replaces the emoji/unicode mix (👑 ◆ ♪)
// per the HUD redesign's visual language.

/** @type {Record<string, string>} */
const GLYPHS = {
  // Leader crown — chunky filled, reads at 12px.
  crown: '<path d="M3 18 L4.2 7.5 L8.5 11.5 L12 4.5 L15.5 11.5 L19.8 7.5 L21 18 Z" fill="currentColor"/><rect x="4" y="19" width="16" height="2.4" rx="1.2" fill="currentColor"/>',
  // KO impact burst — 8-point cartoon star.
  burst: '<path d="M12 1.5 L14 8 L20.5 4.5 L16.5 10 L23 12 L16.5 14 L20.5 19.5 L14 16 L12 22.5 L10 16 L3.5 19.5 L7.5 14 L1 12 L7.5 10 L3.5 4.5 L10 8 Z" fill="currentColor"/>',
  // Dizzy stars — self-KO / knocked-silly marker.
  dizzy: '<path d="M8 3 L9.2 6.2 L12.5 6.6 L10 8.8 L10.8 12 L8 10.2 L5.2 12 L6 8.8 L3.5 6.6 L6.8 6.2 Z" fill="currentColor"/><path d="M17 11 L17.9 13.3 L20.5 13.6 L18.6 15.2 L19.2 17.7 L17 16.3 L14.8 17.7 L15.4 15.2 L13.5 13.6 L16.1 13.3 Z" fill="currentColor" opacity="0.8"/><path d="M6 17 a6 6 0 0 0 9 3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  // Boost bolt.
  bolt: '<path d="M13.5 2 L5 13.5 L10.5 13.5 L9 22 L19 9.5 L12.5 9.5 Z" fill="currentColor"/>',
  // Speaker (audio on).
  speaker: '<path d="M4 9.5 L8 9.5 L13 5 L13 19 L8 14.5 L4 14.5 Z" fill="currentColor"/><path d="M16 8.5 a5 5 0 0 1 0 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M18.5 6 a9 9 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  // Speaker muted.
  speakerMuted: '<path d="M4 9.5 L8 9.5 L13 5 L13 19 L8 14.5 L4 14.5 Z" fill="currentColor"/><path d="M16.5 9.5 L21.5 14.5 M21.5 9.5 L16.5 14.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
  // Menu (hamburger, rounded).
  menu: '<rect x="4" y="6" width="16" height="2.6" rx="1.3" fill="currentColor"/><rect x="4" y="10.7" width="16" height="2.6" rx="1.3" fill="currentColor"/><rect x="4" y="15.4" width="16" height="2.6" rx="1.3" fill="currentColor"/>',
  // Host — broadcast antenna ("this machine runs the match"). Neutral mark.
  antenna: '<circle cx="12" cy="11" r="2.4" fill="currentColor"/><path d="M12 13 L12 21" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M7.5 6.5 a6.4 6.4 0 0 0 0 9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M16.5 6.5 a6.4 6.4 0 0 1 0 9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M4.5 3.5 a10.8 10.8 0 0 0 0 15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity="0.55"/><path d="M19.5 3.5 a10.8 10.8 0 0 1 0 15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity="0.55"/>',
  // Personality: aggressor — sharp 4-point impact star ("hits things").
  aggressor: '<path d="M12 1.5 L14.6 9.4 L22.5 12 L14.6 14.6 L12 22.5 L9.4 14.6 L1.5 12 L9.4 9.4 Z" fill="currentColor"/>',
  // Personality: lurker — half-lidded eye ("watches, waits").
  lurker: '<path d="M2.5 13 C6 7.5 18 7.5 21.5 13 C18 18 6 18 2.5 13 Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M4.5 10.5 C8 8 16 8 19.5 10.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="13.2" r="2.6" fill="currentColor"/>',
  // Personality: scavenger — grabbing claw ("picks off scraps").
  scavenger: '<path d="M5 3 C4 8 5.5 12 9 15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path d="M12 2 C11.5 7.5 12 12 13 16.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path d="M19 3 C20 8 18.5 12 15.5 15.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path d="M9 15 C11 18.5 14 19.5 17 18.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
  // Personality: chaotic — dizzy spiral ("no plan").
  chaotic: '<path d="M12 12 m0 -1.5 a1.5 1.5 0 0 1 1.5 1.5 a3 3 0 0 1 -3 3 a4.8 4.8 0 0 1 -4.8 -4.8 a6.8 6.8 0 0 1 6.8 -6.8 a8.8 8.8 0 0 1 8.8 8.8 a10.5 10.5 0 0 1 -8 10.2" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
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
