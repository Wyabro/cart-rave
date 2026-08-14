// @vitest-environment happy-dom
// CAM-PT-MP-1 / CAM-READY-1 — the GET READY banner has to survive the HUD tick.
//
// showReadyHold() paints during the opening fly-over, which runs BEFORE the countdown
// phase exists: the round is still "lobby". updateStatus's fallback branch runs every
// frame in that state and used to blank the status element, so the banner died on the
// next HUD update and the hold read as "orbit only, no GET READY" — in MP and in solo.

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/bootstrap.js", () => ({
  isWorldBootstrapped: () => true,
}));

const HUD = await import("../../src/hud.js");

/** The lobby-phase tick that used to wipe the hold banner. */
function tickHud(phase = "lobby") {
  HUD.update({
    youConnId: null,
    netSlots: null,
    roundState: { phase, scores: {}, countdownMs: 3600 },
    matchHistoryLength: 0,
    menuVisible: false,
  });
}

describe("CAM-PT-MP-1 ready-hold banner", () => {
  beforeEach(() => {
    // * happy-dom ships no Web Animations API; the banner's stamp-in punch is
    // * decoration, so a no-op keeps the DOM assertions honest.
    if (typeof Element.prototype.animate !== "function") {
      Element.prototype.animate = () => ({ cancel() {}, finish() {} });
    }
    document.body.innerHTML = "";
    HUD.init({ detectGameMode: () => "friends" });
  });

  it("keeps GET READY up across HUD ticks while the round is still pre-countdown", () => {
    HUD.showReadyHold();
    const status = document.querySelector(".hud-status");
    expect(status?.textContent).toContain("GET READY");

    tickHud();
    tickHud();

    expect(status?.textContent).toContain("GET READY");
    expect(status?.style.display).not.toBe("none");
  });

  it("clearReadyHold takes the banner down and the tick keeps it down", () => {
    HUD.showReadyHold();
    HUD.clearReadyHold();
    const status = document.querySelector(".hud-status");
    expect(status?.textContent).not.toContain("GET READY");

    tickHud();

    expect(status?.textContent).not.toContain("GET READY");
    expect(status?.style.display).toBe("none");
  });

  it("does not strand an unrelated banner — a plain lobby tick still clears the status", () => {
    const status = document.querySelector(".hud-status");
    status.textContent = "STALE";
    status.style.display = "block";

    tickHud();

    expect(status.textContent).toBe("");
    expect(status.style.display).toBe("none");
  });
});
