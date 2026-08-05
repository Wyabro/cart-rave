// onboardFirstRun.test.js — ONBOARD-FLAG-1: the first-run HOW TO PLAY "seen" flag.
//
// * Source asserts, same rig as arenaBrowse.test.js / toastLayering.test.js: cart-rave-menu.js
// * is a ~2.4k-line DOM module with no test harness, so these pin the STRUCTURE that makes the
// * behaviour possible rather than the behaviour itself.
// *
// * WHAT THIS CANNOT SEE — read before trusting a green run:
// *   ▸ It never opens the overlay, never runs a timer, and never touches localStorage. A
// *     refactor that keeps the write inside openHowToScreen but breaks the arming dance
// *     (or moves the phase guard below the write) passes here and fails in a browser.
// *   ▸ It cannot prove the flag is READ correctly on the next launch.
// *   ▸ The real verdict is ONBOARD-FLAG-PT-1 on prod, which is why that card exists.
// *
// * The bug being pinned: the write used to live in maybeAutoOpenHowTo at ARM time, before the
// * 600ms timer. Any disarm inside that window — an early SOLO click, an invite URL, or
// * openHowToScreen's own phase guard — consumed a player's only tutorial without rendering it,
// * permanently. Placement is the entire fix, so placement is what these assert.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const menu = readFileSync(new URL("../src/cart-rave-menu.js", import.meta.url), "utf8");

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

const WRITE = /storageSet\(\s*STORAGE_KEYS\.howtoSeen/;

describe("ONBOARD-FLAG-1 — howtoSeen is stamped on open, not on arm", () => {
  it("does not write the flag while merely arming the auto-open", () => {
    const body = fnBody(menu, "maybeAutoOpenHowTo");
    expect(body).not.toBe("");
    // * The regression this exists for. A write here is a tutorial the player can lose unseen.
    expect(body).not.toMatch(WRITE);
    // * Arming itself must survive — the flag is still READ here to decide whether to arm at all.
    expect(body).toMatch(/storageGet\(\s*STORAGE_KEYS\.howtoSeen/);
    expect(body).toMatch(/howtoAutoOpenArmed = true/);
  });

  it("writes the flag inside openHowToScreen", () => {
    const body = fnBody(menu, "openHowToScreen");
    expect(body).not.toBe("");
    expect(body).toMatch(WRITE);
  });

  it("writes it AFTER both early returns, so a bail cannot mark it seen", () => {
    const body = fnBody(menu, "openHowToScreen");
    const write = body.search(WRITE);
    const missingElementGuard = body.indexOf("if (!howtoScreen) return;");
    // * The phase guard is the subtle one: the timer can fire while a round is starting, and
    // * openHowToScreen bails without rendering. A write above it re-creates the original bug
    // * for that path — flag set, overlay never shown.
    const phaseGuard = body.indexOf('phase === "running"');

    expect(missingElementGuard).toBeGreaterThan(-1);
    expect(phaseGuard).toBeGreaterThan(-1);
    expect(write).toBeGreaterThan(missingElementGuard);
    expect(write).toBeGreaterThan(phaseGuard);
  });

  it("is the only write site in the module", () => {
    // * Two writers would let one of them drift back to arm time unnoticed.
    expect(menu.match(new RegExp(WRITE.source, "g"))).toHaveLength(1);
  });

  it("leaves the arm/disarm dance alone — openHowToScreen must not disarm", () => {
    // * Trap guard, not style policing. show() calls closeHowToScreen() FIRST and boot calls
    // * show() twice (initMenu, then the boot-splash dismiss); the auto-open only survives that
    // * because internal closes keep it armed and each show() re-schedules. Disarming on open
    // * would let show() #2 close the overlay and never reopen it — first-run silently dead.
    expect(fnBody(menu, "openHowToScreen")).not.toMatch(/howtoAutoOpenArmed\s*=\s*false/);
  });
});
