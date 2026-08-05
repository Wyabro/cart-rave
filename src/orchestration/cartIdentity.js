// cartIdentity.js — slot colour + NPC name helpers (BUNDLE-1 Lever E, Edge B)
//
// These three helpers used to live in cartOrchestration.js. `main.js` imported two of
// them and nothing else from that module, which dragged the whole heavy graph
// (`simulation.js`, `entities.js`, `hud.js`, `effects/*`, `cartThemes.js`, …) onto the
// eager side of the gameBoot split — Edge A (netcode's static game imports) alone freed
// nothing while this edge stood. See docs/planning/bundle-1.md §9 / §11.
//
// ⚠ This module must stay a LEAF: its only imports are `customization.js`, `npcNames.js`
// and `netcode.js`, all of which are eager already. Never import a gameplay/render module
// here — a static edge would silently re-eager the graph and undo the split.

import * as Netcode from "../netcode.js";
import { resolveCartNeonCss, resolveCartNeonHex } from "../customization.js";
import { NPC_NAME_POOL } from "../npcNames.js";

/** Numeric hex for cart materials, particles and shatter debris. */
export function displayColorHexForSlot(slot) {
  return resolveCartNeonHex(slot, { youConnId: Netcode.getYouConnId() });
}

/** CSS hex for HUD, name labels, and results — same rules as displayColorHexForSlot. */
export function displayCssColorForSlot(slot) {
  return resolveCartNeonCss(slot, { youConnId: Netcode.getYouConnId() });
}

/** Fisher-Yates shuffle of the NPC name pool, truncated to `count`. */
export function shuffledClientNpcNames(count) {
  const names = [...NPC_NAME_POOL];
  for (let i = names.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [names[i], names[j]] = [names[j], names[i]];
  }
  return names.slice(0, count);
}
