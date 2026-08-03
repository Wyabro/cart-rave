// arenaMenuOrder.test.js — the menu's arena order is PROGRESSION order, not catalog order.
//
// * Why this exists: updateArenaPager (cart-rave-menu.js) prints `idx + 1 / btns.length`
// * straight off the hidden radiogroup in index.html, and cycleArena steps through the same
// * list. So DOM order IS the "1/3" a player reads. After UNLOCK-ORDER-1 made Sundial the
// * free arena, that list still ran in ARENA_CATALOG order and the first arena a new player
// * can play announced itself as "3/3".
// *
// * The trap this guards: ARENA_CATALOG order is the QUICKPLAY ROTATION and is asserted
// * against shared/arenaPool.js by QP-ORDER-1. "Fixing" the mismatch by re-sorting either
// * list to match the other breaks the other feature. The two orders differ on purpose.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

import { LEVEL_UNLOCKS, FREE_LEVEL } from "../src/unlockConfig.js";
import { ARENA_CATALOG } from "../src/levels/arenaCatalog.js";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

/** data-level values of the hidden arena radiogroup, in DOM order. */
function menuOrder() {
  const row = html.slice(
    html.indexOf('id="cr-level-row"'),
    html.indexOf("</div>", html.indexOf('id="cr-level-row"')),
  );
  return [...row.matchAll(/class="cr-level-btn[^"]*"\s+data-level="([a-zA-Z]+)"/g)].map((m) => m[1]);
}

/**
 * Progression order derived from the unlock data itself: the free arena, then repeatedly
 * whichever arena is gated on the one we just placed. Derived rather than hardcoded so the
 * test tracks unlockConfig instead of restating it.
 */
function progressionOrder() {
  const gated = Object.entries(LEVEL_UNLOCKS).filter(([, u]) => !u.free && u.killsOnLevel);
  const order = [FREE_LEVEL];
  for (let i = 0; i < gated.length; i += 1) {
    const next = gated.find(([id, u]) => !order.includes(id) && u.killsOnLevel === order[order.length - 1]);
    if (!next) break;
    order.push(next[0]);
  }
  return order;
}

describe("arena menu order (UNLOCK-ORDER-1 follow-up)", () => {
  it("lists the arenas in unlock-progression order", () => {
    expect(menuOrder()).toEqual(progressionOrder());
  });

  it("starts on the free arena, so a new player reads 1/3 not 3/3", () => {
    // * This is the actual reported bug: Sundial is the first arena anyone can play and the
    // * menu announced it as the last of three.
    expect(menuOrder()[0]).toBe(FREE_LEVEL);
    expect(progressionOrder()[0]).toBe(FREE_LEVEL);
  });

  it("marks that same first arena active for the pre-JS paint", () => {
    // * Otherwise the first painted frame shows a LOCKED arena as selected until JS runs.
    const row = html.slice(html.indexOf('id="cr-level-row"'), html.indexOf('id="cr-level-row"') + 2000);
    const active = /class="cr-level-btn active"\s+data-level="([a-zA-Z]+)"[^>]*aria-pressed="true"/.exec(row);
    expect(active?.[1]).toBe(FREE_LEVEL);
  });

  it("does NOT follow ARENA_CATALOG order — that one is the quickplay rotation", () => {
    // * Guards the tempting "fix": making these agree would break QP-ORDER-1's assertion
    // * that ARENA_CATALOG matches shared/arenaPool.js. If a future change ever makes the
    // * two orders legitimately identical, this is the test that should be deleted
    // * deliberately, with that reasoning written down — not quietly relaxed.
    const catalog = ARENA_CATALOG.map((a) => a.id).filter((id) => menuOrder().includes(id));
    expect(catalog).not.toEqual(menuOrder());
  });

  it("covers every playable arena exactly once", () => {
    const ids = menuOrder();
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(progressionOrder().length);
  });
});
