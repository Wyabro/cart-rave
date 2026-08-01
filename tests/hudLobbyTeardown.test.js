// @vitest-environment happy-dom
// CHECKOUT LINE teardown on menu return (FV-FRIENDS-1, 08-01).
//
// The lobby screen mounts on document.body rather than inside #hud, so neither the
// #hud removal in init() nor the game loop (which menu return skips) takes it down.
// LEAVE ROOM left it painted over the title screen — cap-220/221 caught the state on
// both machines: phase "lobby", menuVisible true, crRootDisplay "block".

import { beforeEach, describe, expect, it } from "vitest";
import * as HUD from "../src/hud.js";

/** Minimal option bundle — init() reads every game-layer hook optionally. */
function initHud(overrides = {}) {
  return HUD.init({ detectGameMode: () => "friends", ...overrides });
}

describe("CHECKOUT LINE teardown", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("hideGameplayElements hides the lobby screen on menu return", () => {
    initHud();
    const screen = document.querySelector(".hud-lobby");
    expect(screen).not.toBeNull();

    // * The state LEAVE ROOM leaves behind: the surface is up when the player quits.
    screen.hidden = false;

    HUD.hideGameplayElements();

    expect(screen.hidden).toBe(true);
  });

  it("re-initialising the HUD leaves exactly one lobby screen in the document", () => {
    initHud();
    const first = document.querySelector(".hud-lobby");
    // * A visible orphan is the player-visible failure — an invisible one is still a leak.
    first.hidden = false;

    initHud();

    const screens = document.querySelectorAll(".hud-lobby");
    expect(screens.length).toBe(1);
    expect(screens[0]).not.toBe(first);
    expect(first.isConnected).toBe(false);
  });
});
