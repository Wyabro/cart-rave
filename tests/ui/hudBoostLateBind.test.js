// @vitest-environment happy-dom
// Boost meter must read the local cart at update time, not capture it at init.
//
// MAIN-1 Lever H made localCartForConnId a late-bound `let` stub in main.js: the cart
// factory assigns the real lookup after HUD.init already ran. Passing the reference by
// value froze the stub, so the meter's show-gate never saw a cart and the slab stayed
// display:none for the whole session (playtest §8, "boost bar is missing").

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/bootstrap.js", async (importOriginal) => ({
  ...(await importOriginal()),
  isWorldBootstrapped: () => true,
}));

const HUD = await import("../../src/hud.js");

const RUNNING = { phase: "running" };
const BOOST_CFG = { enabled: true, boostChargeTimeMs: 1500, boostCooldownMs: 200 };

describe("boost meter late binding", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("shows the meter when the cart lookup is assigned after init", () => {
    // * Mirrors main.js: the stub is what exists while HUD.init runs.
    let localCartForConnId = () => null;

    HUD.init({
      detectGameMode: () => "solo",
      getIsTouchDevice: () => false,
      getBoostChargeCfg: () => BOOST_CFG,
      getLocalCart: () => localCartForConnId(),
    });

    HUD.update({ roundState: RUNNING, netSlots: [], menuVisible: false });
    expect(document.querySelector(".hud-boost").style.display).toBe("none");

    // * createCartOrchestration hands the real lookup back after HUD.init.
    const cart = { isChargingBoost: false, boostCooldownUntilMs: 0 };
    localCartForConnId = () => cart;

    HUD.update({ roundState: RUNNING, netSlots: [], menuVisible: false });
    expect(document.querySelector(".hud-boost").style.display).toBe("flex");
  });

  it("stays hidden when a caller freezes the stub by value", () => {
    let localCartForConnId = () => null;

    // * The regression: passing the reference itself captures the stub forever.
    HUD.init({
      detectGameMode: () => "solo",
      getIsTouchDevice: () => false,
      getBoostChargeCfg: () => BOOST_CFG,
      getLocalCart: localCartForConnId,
    });

    localCartForConnId = () => ({ isChargingBoost: false, boostCooldownUntilMs: 0 });

    HUD.update({ roundState: RUNNING, netSlots: [], menuVisible: false });
    expect(document.querySelector(".hud-boost").style.display).toBe("none");
  });
});
