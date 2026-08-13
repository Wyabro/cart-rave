// cartPaletteBrand.test.js — ART-PALETTE-1: CART_COLORS must stay reconciled
// with the 2D brand roster.
//
// 3D cart neon (CART_COLORS.hex in src/config.js) and the 2D cart chips
// (PALETTES.classic.players in cart-rave-menu.js) render the same colors — pure
// spectral hexes (0xff00ff etc.) are off-brand and banned. This test pins the
// hex VALUES so a future "restore Original Rave" cannot silently re-freeze the
// palette to spectral. Order matters: players[i] ↔ PALETTE[i] by index.
//
// Source assertion for the menu roster (the menu module is DOM-heavy and not
// importable in this test); direct import for CART_COLORS.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CART_COLORS, PALETTE } from "../src/config.js";

const menuSrc = readFileSync(new URL("../src/ui/cart-rave-menu.js", import.meta.url), "utf8");

/** The classic player roster — the canonical 2D cart colors, in PALETTE order. */
function classicPlayers() {
  const start = menuSrc.indexOf('players: ["#ff2bd6"');
  expect(start).toBeGreaterThan(-1);
  const end = menuSrc.indexOf("]", start);
  return menuSrc
    .slice(start + "players: ".length, end)
    .match(/#[0-9a-f]{6}/g)
    ?.map((h) => parseInt(h.slice(1), 16)) ?? [];
}

describe("ART-PALETTE-1 — CART_COLORS matches the 2D brand roster", () => {
  it("palette order is stable (pink, blue, green, yellow, neonOrange)", () => {
    expect(PALETTE).toEqual(["pink", "blue", "green", "yellow", "neonOrange"]);
  });

  it("each CART_COLORS hex equals the matching classic players[i] entry", () => {
    const players = classicPlayers();
    expect(players).toHaveLength(PALETTE.length);
    PALETTE.forEach((id, i) => {
      expect(CART_COLORS[id].hex).toBe(players[i]);
    });
  });

  it("no pure spectral hex survives in the palette", () => {
    const spectral = new Set([0xff00ff, 0x00ffff, 0x00ff00, 0xffff00]);
    for (const id of PALETTE) {
      expect(spectral.has(CART_COLORS[id].hex)).toBe(false);
    }
  });

  it("the dead css: bg-* field is gone", () => {
    for (const id of PALETTE) {
      expect(CART_COLORS[id]).not.toHaveProperty("css");
    }
  });
});
