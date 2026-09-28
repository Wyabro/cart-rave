// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCartOrchestration } from "../../src/orchestration/cartOrchestration.js";
import { applyCartState, setRefs, __netcodeTestHooks as hooks } from "../../src/netcode.js";
import * as AudioManager from "../../src/audioManager.js";
import * as GameState from "../../src/stores/gameStore.js";
import { CONFIG } from "../../src/config.js";

describe("NET-LAG-1 remote hop presentation", () => {
  let cart;
  let triggerHop;
  beforeEach(() => {
    hooks.resetNetState();
    GameState.setRoundPhase("running");
    vi.spyOn(performance, "now").mockReturnValue(1000);
    vi.spyOn(AudioManager, "playSfx").mockImplementation(() => null);
    cart = {
      slotIndex: 1, lastHopAtMs: 0,
      body: { applyImpulse: vi.fn(), setTranslation: vi.fn(), setRotation: vi.fn(), setLinvel: vi.fn(), setAngvel: vi.fn() },
    };
    ({ triggerHop } = createCartOrchestration({ getAllCartsRef: () => [null, cart] }));
    setRefs({ triggerHopRef: triggerHop });
  });
  afterEach(() => {
    setRefs({ triggerHopRef: null });
    GameState.resetRoundToLobby();
    vi.restoreAllMocks();
  });

  it.each([true, false])("presents a host hop once without another impulse (interpolate=%s)", (interpolate) => {
    const snap = { p: [0, 1, 0], lv: [0, 2, 0], h: true };
    applyCartState(cart, snap, { interpolate });
    applyCartState(cart, snap, { interpolate });
    expect(cart.body.applyImpulse).not.toHaveBeenCalled();
    expect(cart.lastHopAtMs).toBe(1000);
    expect(cart.hopAwaitingLand).toBe(true);
    expect(AudioManager.playSfx).toHaveBeenCalledTimes(1);
  });

  it("keeps one physical impulse and the cooldown for a simulated hop", () => {
    triggerHop(cart, 1000);
    triggerHop(cart, 1001);
    expect(cart.body.applyImpulse).toHaveBeenCalledTimes(1);
    expect(cart.body.applyImpulse).toHaveBeenCalledWith({ x: 0, y: CONFIG.cart.hop.impulse, z: 0 }, true);
    expect(AudioManager.playSfx).toHaveBeenCalledTimes(1);
  });
});
