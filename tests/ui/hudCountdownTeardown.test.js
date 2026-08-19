// @vitest-environment happy-dom
// COUNTDOWN-LEAK-1 — countdown banner / splash / timer hide on menu-return teardown.
//
// Pins HUD.hideGameplayElements (the leaf initMenu calls). Does not prove the
// gameTeardownHooks table is live; that seam no-ops if unregistered.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/bootstrap.js", () => ({
  isWorldBootstrapped: () => true,
}));

const HUD = await import("../../src/hud.js");
const { gameStore, resetRoundToLobby } = await import("../../src/stores/gameStore.js");
const { getRoundClockNowMs } = await import("../../src/roundClock.js");

/** @type {ReturnType<typeof vi.fn>} */
let onGoMoment;

function tickHud(roundState, menuVisible = false) {
  HUD.update({
    youConnId: null,
    netSlots: null,
    roundState: { scores: {}, countdownMs: 3600, ...roundState },
    menuVisible,
  });
}

describe("COUNTDOWN-LEAK-1 countdown UI teardown", () => {
  beforeEach(() => {
    // * happy-dom ships no Web Animations API; stamp-in is decoration.
    if (typeof Element.prototype.animate !== "function") {
      Element.prototype.animate = () => ({ cancel() {}, finish() {} });
    }
    document.body.innerHTML = "";
    onGoMoment = vi.fn();
    HUD.init({ detectGameMode: () => "friends", onGoMoment });
  });

  afterEach(() => {
    vi.useRealTimers();
    resetRoundToLobby();
  });

  it("hideGameplayElements clears countdown banner, splash, and timer", () => {
    tickHud({
      phase: "countdown",
      countdownStartedAtMs: getRoundClockNowMs(),
      countdownMs: 3600,
    });

    const status = document.querySelector(".hud-status");
    const splash = document.querySelector(".hud-arena-splash");
    const timer = document.querySelector(".hud-timer");
    expect(status?.style.display).not.toBe("none");
    expect(status?.querySelector(".hud-status-num")).not.toBeNull();
    expect(splash?.classList.contains("hud-arena-splash-visible")).toBe(true);

    HUD.hideGameplayElements();

    expect(status?.style.display).toBe("none");
    expect(status?.textContent).toBe("");
    expect(splash?.classList.contains("hud-arena-splash-visible")).toBe(false);
    expect(timer?.style.display).toBe("none");
  });

  it("hideGameplayElements drops a pending GO catch-up", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });

    gameStore.setState({ roundPhase: "countdown" });
    tickHud({
      phase: "countdown",
      countdownStartedAtMs: getRoundClockNowMs(),
      countdownMs: 3600,
    });
    expect(document.querySelector(".hud-status-num")?.textContent).toBe("3");

    gameStore.setState({ roundPhase: "running" });
    tickHud({
      phase: "running",
      startedAtMs: getRoundClockNowMs(),
    });
    expect(onGoMoment).not.toHaveBeenCalled();

    HUD.hideGameplayElements();
    vi.advanceTimersByTime(250);
    expect(onGoMoment).not.toHaveBeenCalled();

    tickHud({ phase: "lobby" }, true);
    const status = document.querySelector(".hud-status");
    expect(status?.style.display).toBe("none");
    expect(status?.textContent).toBe("");
    expect(status?.textContent).not.toContain("GO!");
    expect(status?.textContent).not.toContain("GET READY");
  });
});
