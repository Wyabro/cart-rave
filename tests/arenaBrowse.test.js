// arenaBrowse.test.js — MENU-LOCK-HINT-1: browsing locked arenas without selecting them.
//
// * Source asserts. cart-rave-menu.js is a ~2.4k-line DOM module with no test harness, and
// * levelManager needs injected deps + a live world, so the behaviour here was verified in a
// * real browser (wiped profile + ?devUnlocks=off) and these tests pin the STRUCTURE that
// * makes that behaviour possible — the specific things a future edit would silently undo.
// *
// * Browser evidence this backs up, for the record:
// *   ▸ steps SUNDIAL 1/3 → "🔒 10 KOS ON SUNDIAL STATION (0/10) · 2/3" → "🔒 15 KOS ON THE
// *     STOREROOMS (0/15) · 3/3" → wraps, with .active and cartRaveLevel pinned to zanzibar
// *     the whole way.
// *   SOLO on a locked arena fired 0 cartrave:menu events, left the URL unchanged, and showed
// *     "Locked — 10 KOs on Sundial Station (0/10)".

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const menu = readFileSync(new URL("../src/cart-rave-menu.js", import.meta.url), "utf8");
const levelManager = readFileSync(new URL("../src/levelManager.js", import.meta.url), "utf8");

/** Body of a top-level `function name(...) { ... }` in the menu module. */
function fnBody(src, name) {
  const start = src.indexOf(`function ${name}(`);
  if (start < 0) return "";
  let depth = 0;
  for (let i = src.indexOf("{", start); i < src.length; i += 1) {
    if (src[i] === "{") depth += 1;
    else if (src[i] === "}") {
      depth -= 1;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  return "";
}

describe("MENU-LOCK-HINT-1 — browse cursor", () => {
  it("pageArena steps one arena without skipping locked ones", () => {
    const body = fnBody(menu, "pageArena");
    expect(body).not.toBe("");
    // * The old code looped `for (let step = 1; step <= n; step += 1)` hunting for the first
    // * UNLOCKED candidate — that loop is the dead-arrow bug.
    expect(body).not.toMatch(/for\s*\(\s*let step/);
    expect(body).toMatch(/browseLevelId\s*=/);
  });

  it("the pager reads the browse cursor, not just .active", () => {
    // * `.active` is the committed selection. If updateArenaPager goes back to reading it,
    // * browsing silently stops working while every other assert still passes.
    expect(fnBody(menu, "updateArenaPager")).toMatch(/pagerLevelId\(\)/);
    expect(fnBody(menu, "pagerLevelId")).toMatch(/browseLevelId\s*\?\?/);
  });

  it("browsing never persists — no storage or selection write on the cursor path", () => {
    const body = fnBody(menu, "pageArena");
    expect(body).not.toMatch(/storageSet/);
    expect(body).not.toMatch(/persistLevel/);
    expect(body).not.toMatch(/settingsStore/);
    // * `.active` must never follow the cursor onto a locked arena.
    expect(body).not.toMatch(/classList\.add\(\s*["']active["']/);
  });

  it("a refused selection keeps the cursor, a committed one clears it", () => {
    const body = fnBody(menu, "selectLevel");
    const refusal = body.slice(0, body.indexOf("browseLevelId = null"));
    // * The locked branch (toast + return) comes BEFORE the clear, so a refused pick leaves
    // * the pager on the arena the player is looking at.
    expect(refusal).toMatch(/showUnlockToast/);
    expect(body).toMatch(/browseLevelId = null/);
  });

  it("the sub-line renders unlock text from unlockConfig, never a literal", () => {
    const body = fnBody(menu, "updateArenaPager");
    expect(body).toMatch(/getLevelUnlockStatus/);
    expect(body).toMatch(/status\.hint/);
    // * UNLOCK-ORDER-1 proved hardcoded arena names go stale within a day.
    expect(body).not.toMatch(/KOs on/i);
  });

  it("SOLO is gated before the cartrave:menu dispatch", () => {
    // * The gate must sit ahead of the dispatch so the mouse path and the keyboard path
    // * (activateMenuSelection only .click()s this button) both hit it. And it must exist at
    // * all: clampLevelIdToUnlocks falls back to FREE_LEVEL rather than refusing, and play
    // * entry resolves from storage, so without this SOLO silently starts the wrong arena.
    const gate = menu.indexOf("dataset.action === 'solo' && !isLevelUnlocked(pagerLevelId())");
    const dispatch = menu.indexOf("new CustomEvent('cartrave:menu'");
    expect(gate).toBeGreaterThan(-1);
    expect(dispatch).toBeGreaterThan(-1);
    expect(gate).toBeLessThan(dispatch);
  });
});

describe("MENU-LOCK-HINT-1 — preview follows the cursor", () => {
  it("the preview path resolves through the browse-aware resolver", () => {
    const preview = fnBody(levelManager, "previewMenuLevelIfNeeded");
    const schedule = fnBody(levelManager, "scheduleMenuLevelPreview");
    expect(preview).toMatch(/resolvePreviewTargetLevelId\(\)/);
    expect(schedule).toMatch(/resolvePreviewTargetLevelId\(\)/);
  });

  it("re-reads the cursor inside the swap loop instead of capturing it", () => {
    // * previewMenuLevelIfNeeded consumes its target INSIDE the while loop, and a second
    // * schedule early-returns while one is in flight. Capturing a frozen id would strand a
    // * stale load: Storerooms finishing after the cursor returned to Sundial, with the
    // * corrective schedule short-circuited. The call must stay inside the loop.
    const preview = fnBody(levelManager, "previewMenuLevelIfNeeded");
    const loopAt = preview.indexOf("while (");
    const resolveAt = preview.indexOf("resolvePreviewTargetLevelId()");
    expect(loopAt).toBeGreaterThan(-1);
    expect(resolveAt).toBeGreaterThan(loopAt);
  });

  it("the browse cursor cannot leak into play entry", () => {
    // * resolveTargetLevelId also serves swapLoadedLevel and rebuildLevelIfNeeded. If the
    // * cursor were folded into it, browsing a locked arena would load it for real — the
    // * exact bug the SOLO gate exists to prevent, one layer down.
    expect(fnBody(levelManager, "resolveTargetLevelId")).not.toMatch(/menuBrowseLevelId/);
    expect(fnBody(levelManager, "swapLoadedLevel")).not.toMatch(/resolvePreviewTargetLevelId/);
    expect(fnBody(levelManager, "rebuildLevelIfNeeded")).not.toMatch(/resolvePreviewTargetLevelId/);
  });

  it("browsing drives the preview directly, not via cartrave:level-changed", () => {
    // * That event only fires from a SUCCESSFUL selectLevel, which a locked browse never
    // * reaches — so waiting on it would leave the world showing the previous arena.
    expect(fnBody(menu, "pageArena")).toMatch(/scheduleMenuLevelPreview\(\)/);
    expect(fnBody(menu, "pageArena")).toMatch(/setMenuBrowseLevel\(/);
  });
});
