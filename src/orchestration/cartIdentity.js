// cartIdentity.js — slot colour + NPC name helpers (BUNDLE-1 Lever E, Edge B)
//
// These three helpers used to live in cartOrchestration.js. `main.js` imported two of
// them and nothing else from that module, which dragged the whole heavy graph
// (`simulation.js`, `entities.js`, `hud.js`, `effects/*`, `cartThemes.js`, …) onto the
// eager side of the gameBoot split — Edge A (netcode's static game imports) alone freed
// nothing while this edge stood. See docs/planning/bundle-1.md §9 / §11.
//
// ⚠ This module must stay a LEAF: its only imports are `customization.js`, `npcNames.js`
// and `netcodeLoad.js` (not netcode itself — CHUNK-DEFER-1 L2). Never import a
// gameplay/render module here — a static edge would silently re-eager the graph.

import { getNetcode } from "../netcode/load.js";
import { resolveCartNeonCss, resolveCartNeonHex } from "../carts/customization.js";
import { drawNpcNamesByPersonality, rotateNpcPersonalityOrder } from "../npcNames.js";

/** Numeric hex for cart materials, particles and shatter debris. */
export function displayColorHexForSlot(slot) {
  return resolveCartNeonHex(slot, { youConnId: getNetcode()?.getYouConnId() ?? null });
}

/** CSS hex for HUD, name labels, and results — same rules as displayColorHexForSlot. */
export function displayCssColorForSlot(slot) {
  return resolveCartNeonCss(slot, { youConnId: getNetcode()?.getYouConnId() ?? null });
}

/**
 * Four names, one per personality, ordered [omitted, fielded1, fielded2, fielded3].
 * netcode.js seats indices 1–3, so the omitted type never enters the solo field.
 * @param {number} [omitIndex=0]
 * @returns {string[]}
 */
export function shuffledClientNpcNames(omitIndex = 0) {
  return drawNpcNamesByPersonality(rotateNpcPersonalityOrder(omitIndex));
}
