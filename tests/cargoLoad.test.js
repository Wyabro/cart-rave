// @vitest-environment happy-dom
// cargoLoad.test.js — Living Cargo reconciler (src/cargoLoad.js): score→fullness mapping,
// fullness-scaled spill counts, the spill-comeback boost window, bay restock timing, and
// the once-per-round announcer edges (cart_overflow / spill_rush). Heavy deps (grocery
// pool, announcer, simulation/Rapier) are mocked; the real gameStore + CONFIG drive the
// logic so tuning changes keep the tests honest. Module trackers are per-import state, so
// every test loads a fresh module graph.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../src/effects/groceryPool.js", () => ({ setCargoFill: vi.fn() }));
vi.mock("../src/announcer/announcerManager.js", () => ({ announce: vi.fn() }));
vi.mock("../src/simulation.js", () => ({ applyCartMassPropertiesOverride: vi.fn() }));

let armSpillBoost;
let spillCountForCart;
let updateCargoLoad;
let gameStore;
let announce;
let setCargoFill;
let CONFIG;

beforeEach(async () => {
  // * The mock factories are memoized per file — call history survives resetModules.
  vi.clearAllMocks();
  vi.resetModules();
  ({ armSpillBoost, spillCountForCart, updateCargoLoad } = await import("../src/cargoLoad.js"));
  ({ gameStore } = await import("../src/stores/gameStore.js"));
  ({ announce } = await import("../src/announcer/announcerManager.js"));
  ({ setCargoFill } = await import("../src/effects/groceryPool.js"));
  ({ CONFIG } = await import("../src/config.js"));
  gameStore.setState({
    roundStartedAtMs: 10_000,
    roundScores: { 0: 0, 1: 0, 2: 0, 3: 0 },
  });
});

function makeCart(slotIndex, overrides = {}) {
  return {
    slotIndex,
    label: `P${slotIndex}`,
    cargoBay: { visible: true, userData: {} },
    hasSpilled: false,
    respawnAtMs: null,
    isShattering: false,
    ...overrides,
  };
}

function makeCtx(overrides = {}) {
  return {
    localSlotIndex: 0,
    netSlots: [{ name: "WYATT" }, { name: "BOT-A" }, { name: "BOT-B" }, { name: "BOT-C" }],
    roundPhase: "running",
    ...overrides,
  };
}

describe("spillCountForCart", () => {
  it("empty cargo drops the base mess; full cargo the max", () => {
    expect(spillCountForCart(makeCart(0, { cargoFullness01: 0 }))).toBe(
      CONFIG.cargo.spillCountBase,
    );
    expect(spillCountForCart(makeCart(0, { cargoFullness01: 1 }))).toBe(
      CONFIG.cargo.spillCountMax,
    );
  });

  it("scales with fullness (rounded lerp)", () => {
    const { spillCountBase: base, spillCountMax: max } = CONFIG.cargo;
    expect(spillCountForCart(makeCart(0, { cargoFullness01: 0.5 }))).toBe(
      Math.round(base + (max - base) * 0.5),
    );
  });

  it("a missing cart falls back to the base count", () => {
    expect(spillCountForCart(null)).toBe(CONFIG.cargo.spillCountBase);
  });
});

describe("armSpillBoost", () => {
  it("opens the comeback window from the spill moment", () => {
    const cart = makeCart(0);
    const before = performance.now();
    armSpillBoost(cart);
    const after = performance.now();
    expect(cart.spillBoostUntilMs).toBeGreaterThanOrEqual(
      before + CONFIG.cargo.spillBoost.durationMs,
    );
    expect(cart.spillBoostUntilMs).toBeLessThanOrEqual(
      after + CONFIG.cargo.spillBoost.durationMs,
    );
  });

  it("tolerates a null cart", () => {
    expect(() => armSpillBoost(null)).not.toThrow();
  });
});

describe("updateCargoLoad — fullness + bay fill", () => {
  it("maps round score onto cargoFullness01 and fills the bay", () => {
    const cart = makeCart(1);
    gameStore.setState({ roundScores: { 0: 0, 1: CONFIG.cargo.fullScore / 2, 2: 0, 3: 0 } });
    updateCargoLoad([null, cart, null, null], 1000, makeCtx());
    expect(cart.cargoFullness01).toBe(0.5);
    expect(setCargoFill).toHaveBeenCalledWith(cart.cargoBay, 0.5);
  });

  it("clamps fullness at 1 past fullScore", () => {
    const cart = makeCart(0);
    gameStore.setState({ roundScores: { 0: CONFIG.cargo.fullScore * 3, 1: 0, 2: 0, 3: 0 } });
    updateCargoLoad([cart], 1000, makeCtx());
    expect(cart.cargoFullness01).toBe(1);
  });
});

describe("updateCargoLoad — CART OVERFLOW announce", () => {
  it("fires once per slot per round, with the slot's display name", () => {
    const cart = makeCart(1);
    gameStore.setState({ roundScores: { 0: 0, 1: CONFIG.cargo.fullScore, 2: 0, 3: 0 } });
    updateCargoLoad([null, cart], 1000, makeCtx());
    updateCargoLoad([null, cart], 1016, makeCtx());
    const overflowCalls = announce.mock.calls.filter(([id]) => id === "cart_overflow");
    expect(overflowCalls).toEqual([["cart_overflow", { name: "BOT-A" }]]);
  });

  it("stays quiet outside the running phase", () => {
    const cart = makeCart(0);
    gameStore.setState({ roundScores: { 0: CONFIG.cargo.fullScore, 1: 0, 2: 0, 3: 0 } });
    updateCargoLoad([cart], 1000, makeCtx({ roundPhase: "podium" }));
    expect(announce).not.toHaveBeenCalled();
  });

  it("re-arms when a new round starts", () => {
    const cart = makeCart(0);
    gameStore.setState({ roundScores: { 0: CONFIG.cargo.fullScore, 1: 0, 2: 0, 3: 0 } });
    updateCargoLoad([cart], 1000, makeCtx());
    gameStore.setState({ roundStartedAtMs: 20_000 });
    updateCargoLoad([cart], 2000, makeCtx());
    const overflowCalls = announce.mock.calls.filter(([id]) => id === "cart_overflow");
    expect(overflowCalls).toHaveLength(2);
  });
});

describe("updateCargoLoad — FRESH START (spill_rush) announce", () => {
  it("fires on the rising edge of the local boost window, once per deadline", () => {
    const cart = makeCart(0);
    const nowMs = 5000;
    cart.spillBoostUntilMs = nowMs + CONFIG.cargo.spillBoost.durationMs;
    updateCargoLoad([cart], nowMs, makeCtx({ localSlotIndex: 0 }));
    updateCargoLoad([cart], nowMs + 16, makeCtx({ localSlotIndex: 0 }));
    const rushCalls = announce.mock.calls.filter(([id]) => id === "spill_rush");
    expect(rushCalls).toHaveLength(1);
  });

  it("ignores an already-expired boost deadline", () => {
    const cart = makeCart(0);
    cart.spillBoostUntilMs = 4000;
    updateCargoLoad([cart], 5000, makeCtx({ localSlotIndex: 0 }));
    expect(announce.mock.calls.filter(([id]) => id === "spill_rush")).toHaveLength(0);
  });

  it("only watches the local slot", () => {
    const remote = makeCart(2);
    remote.spillBoostUntilMs = 9000;
    updateCargoLoad([null, null, remote], 5000, makeCtx({ localSlotIndex: 0 }));
    expect(announce.mock.calls.filter(([id]) => id === "spill_rush")).toHaveLength(0);
  });
});

describe("updateCargoLoad — restock after a surviving ram-spill", () => {
  function spilledCart(boostUntilMs) {
    return makeCart(0, {
      cargoBay: { visible: false, userData: {} },
      hasSpilled: true,
      spillBoostUntilMs: boostUntilMs,
    });
  }

  it("restocks the bay once the buff + restock delay lapse", () => {
    const nowMs = 10_000;
    const cart = spilledCart(nowMs - CONFIG.cargo.spillBoost.restockDelayMs - 1);
    updateCargoLoad([cart], nowMs, makeCtx());
    expect(cart.cargoBay.visible).toBe(true);
  });

  it("holds the bay empty while the comeback window is still open", () => {
    const nowMs = 10_000;
    const cart = spilledCart(nowMs + 1000);
    updateCargoLoad([cart], nowMs, makeCtx());
    expect(cart.cargoBay.visible).toBe(false);
  });

  it("defers to the respawn path when the cart is waiting to respawn", () => {
    const nowMs = 10_000;
    const cart = spilledCart(nowMs - CONFIG.cargo.spillBoost.restockDelayMs - 1);
    cart.respawnAtMs = nowMs + 500;
    updateCargoLoad([cart], nowMs, makeCtx());
    expect(cart.cargoBay.visible).toBe(false);
  });
});
