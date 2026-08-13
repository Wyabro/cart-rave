// @vitest-environment happy-dom
// HOST-SNAP-PUMP-1: host snaps are frame-driven (not setInterval) and rate-limited at hostSendHz.
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getHostSendTimer,
  getNetFlowStats,
  tickHostSendFromFrame,
  __netcodeTestHooks as hooks,
} from "../src/netcode.js";
import * as P2P from "../src/netcode/p2p.js";
import * as GameState from "../src/stores/gameStore.js";
import { CONFIG } from "../src/config.js";
import { runGameLoop, createGameLoopState } from "../src/gameLoop.js";

/** Minimal cart body so serializeCartToWire succeeds. */
function mockCart() {
  return {
    body: {
      translation: () => ({ x: 0, y: 0, z: 0 }),
      rotation: () => ({ x: 0, y: 0, z: 0, w: 1 }),
      linvel: () => ({ x: 0, y: 0, z: 0 }),
      angvel: () => ({ x: 0, y: 0, z: 0 }),
    },
  };
}

describe("HOST-SNAP-PUMP-1 frame-driven host send", () => {
  /** @type {ReturnType<typeof vi.spyOn>} */
  let sendSpy;
  let nowMs;

  beforeEach(() => {
    hooks.resetNetState();
    hooks.resetNetFlowStatsForTest();
    nowMs = 1_000_000;
    vi.spyOn(performance, "now").mockImplementation(() => nowMs);
    sendSpy = vi.spyOn(P2P, "sendToAll").mockImplementation(() => {});
    hooks.setPartySocketForTest({ readyState: 1 });
    hooks.setHostStateForTest({ isHost: true, youConnId: "host1", netSlots: [] });
    hooks.setGetAllCartsForTest(() => [mockCart()]);
    GameState.setRoundPhase("running");
  });

  it("startHostSendLoop arms without setInterval; disarmed by default", () => {
    expect(getHostSendTimer()).toBe(false);
    hooks.startHostSendLoopForTest();
    expect(getHostSendTimer()).toBe(true);
    expect(hooks.isHostSendLoopArmedForTest()).toBe(true);
    hooks.stopHostSendLoopForTest();
    expect(getHostSendTimer()).toBe(false);
  });

  it("tickHostSendFromFrame is a no-op when disarmed", () => {
    tickHostSendFromFrame();
    expect(sendSpy).not.toHaveBeenCalled();
    expect(getNetFlowStats().sendCount).toBe(0);
  });

  it("sends on frame tick when armed and rate-limits to hostSendHz", () => {
    hooks.startHostSendLoopForTest();
    const minGap = 1000 / CONFIG.net.hostSendHz; // 25ms @ 40Hz

    tickHostSendFromFrame();
    expect(sendSpy).toHaveBeenCalledTimes(1);
    expect(getNetFlowStats().sendCount).toBe(1);

    // * Sub-period frames must not emit (would overshoot 40Hz on 60/144 displays).
    nowMs += minGap * 0.4;
    tickHostSendFromFrame();
    expect(sendSpy).toHaveBeenCalledTimes(1);

    nowMs += minGap;
    tickHostSendFromFrame();
    expect(sendSpy).toHaveBeenCalledTimes(2);
    expect(getNetFlowStats().sendCount).toBe(2);
  });

  it("does not arm without socket / host / carts", () => {
    hooks.setPartySocketForTest(null);
    hooks.startHostSendLoopForTest();
    expect(getHostSendTimer()).toBe(false);

    hooks.setPartySocketForTest({ readyState: 1 });
    hooks.setHostStateForTest({ isHost: false });
    hooks.startHostSendLoopForTest();
    expect(getHostSendTimer()).toBe(false);

    hooks.setHostStateForTest({ isHost: true });
    hooks.setGetAllCartsForTest(() => null);
    hooks.startHostSendLoopForTest();
    expect(getHostSendTimer()).toBe(false);
  });

  it("gameLoop onAfterSim runs after onFrame on each step (rAF path)", () => {
    /** @type {((now: number) => void)[]} */
    let scheduled = [];
    const originalRaf = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = (cb) => {
      scheduled.push(cb);
      return scheduled.length;
    };

    const onFrame = vi.fn();
    const onAfterSim = vi.fn();
    runGameLoop(createGameLoopState(), {
      shouldSkipTiming: () => false,
      onFrame,
      onAfterSim,
      onVisualUpdate: () => {},
    });

    const cb = scheduled.pop();
    scheduled = [];
    // * createGameLoopState latched performance.now() (mocked); step with a later stamp.
    cb(nowMs + 16);

    expect(onFrame).toHaveBeenCalledTimes(1);
    expect(onAfterSim).toHaveBeenCalledTimes(1);
    // * onAfterSim after onFrame
    expect(onFrame.mock.invocationCallOrder[0]).toBeLessThan(
      onAfterSim.mock.invocationCallOrder[0],
    );

    globalThis.requestAnimationFrame = originalRaf;
  });
});

describe("SNAP-SPARSE-1 sparse-slot hole guard", () => {
  /** @type {ReturnType<typeof vi.spyOn>} */
  let sendSpy;
  /** @type {ReturnType<typeof vi.spyOn>} */
  let warnSpy;
  let nowMs;

  beforeEach(() => {
    // * vi.spyOn returns the existing shared spy, so call histories accumulate across
    // * describes unless wiped here (the config does not auto-clear mocks).
    vi.clearAllMocks();
    hooks.resetNetState();
    hooks.resetSparseHoleStateForTest();
    hooks.resetNetFlowStatsForTest();
    nowMs = 1_000_000;
    vi.spyOn(performance, "now").mockImplementation(() => nowMs);
    sendSpy = vi.spyOn(P2P, "sendToAll").mockImplementation(() => {});
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    hooks.setPartySocketForTest({ readyState: 1 });
    hooks.setHostStateForTest({ isHost: true, youConnId: "host1", netSlots: [] });
    GameState.setRoundPhase("running");
  });

  it("warns once when a vacant slot emits a phantom cart", () => {
    hooks.setGetAllCartsForTest(() => [mockCart(), null, mockCart()]);
    hooks.startHostSendLoopForTest();

    tickHostSendFromFrame();
    expect(sendSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toContain("SNAP-SPARSE-1");
    expect(warnSpy.mock.calls[0][0]).toContain("slot 1");
  });

  it("does not re-warn on later ticks in the same phase", () => {
    hooks.setGetAllCartsForTest(() => [mockCart(), null, mockCart()]);
    hooks.startHostSendLoopForTest();

    tickHostSendFromFrame();
    nowMs += 1000 / CONFIG.net.hostSendHz;
    tickHostSendFromFrame();
    nowMs += 1000 / CONFIG.net.hostSendHz;
    tickHostSendFromFrame();

    expect(sendSpy).toHaveBeenCalledTimes(3);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it("re-warns for the same slot once the phase key changes (force flush path)", () => {
    hooks.setGetAllCartsForTest(() => [mockCart(), null, mockCart()]);
    hooks.startHostSendLoopForTest();
    tickHostSendFromFrame();
    expect(warnSpy).toHaveBeenCalledTimes(1);

    // * force:true bypasses the running-only gate, so a round-end flush can carry a
    // * different phase — the per-(phase, slot) key must re-warn there.
    GameState.setRoundPhase("podium");
    hooks.hostSendTickForTest({ force: true });
    expect(warnSpy).toHaveBeenCalledTimes(2);
    expect(warnSpy.mock.calls[1][0]).toContain("podium");
  });

  it("stays silent on a dense carts array", () => {
    hooks.setGetAllCartsForTest(() => [mockCart(), mockCart(), mockCart(), mockCart()]);
    hooks.startHostSendLoopForTest();

    tickHostSendFromFrame();
    expect(sendSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("resets with the hook between cases", () => {
    hooks.setGetAllCartsForTest(() => [mockCart(), null]);
    hooks.startHostSendLoopForTest();
    tickHostSendFromFrame();
    expect(warnSpy).toHaveBeenCalledTimes(1);

    hooks.resetSparseHoleStateForTest();
    nowMs += 1000 / CONFIG.net.hostSendHz;
    tickHostSendFromFrame();
    expect(warnSpy).toHaveBeenCalledTimes(2);
  });
});

