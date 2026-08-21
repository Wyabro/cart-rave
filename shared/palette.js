/**
 * Cart palette — the single source of truth for cart neon (ART-PALETTE-1).
 *
 * Both facets live here so the roster can never drift from the hex map:
 *   - CART_COLORS — brand neon hexes (client rendering). Pure spectral hexes
 *     (0xff00ff etc.) are banned as off-brand — docs/reference/art-direction.md.
 *   - PALETTE — the ordered color-ID roster, derived from CART_COLORS keys.
 *
 * Shared by the client (re-exported from src/config.js — existing `import …
 * from "./config.js"` call sites keep working) and the server (party/index.ts
 * colorPick validation, free-color picks, NPC re-rolls). Add or rename a color
 * here ONLY; the worker and the client both read this one file. Order is the
 * brand roster (PALETTES.classic.players in cart-rave-menu.js).
 */
export const CART_COLORS = {
  pink:       { hex: 0xff2bd6 },
  blue:       { hex: 0x22e6ff },
  green:      { hex: 0x2bff7a },
  yellow:     { hex: 0xffe53d },
  neonOrange: { hex: 0xff7a1a },
};

/** Ordered color ids — same order as CART_COLORS keys (brand roster order). */
export const PALETTE = Object.keys(CART_COLORS);
