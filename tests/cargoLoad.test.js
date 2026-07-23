// @vitest-environment happy-dom
// cargoLoad.test.js — Living Cargo (CARGO-WT-1): life-scoped weight, bay fill, strip/grant,
// spill announce edges. Heavy deps mocked; real gameStore + CONFIG.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../src/effects/groceryPool.js", () => ({
  setCargoFill: vi.fn(),
  setCargoFillCount: vi.fn(),
}));
vi.mock("../src/announcer/announcerManager.js", () => ({ announce: vi.fn() }));
vi.mock("../src/simulation.js", () => ({ applyCartMassPropertiesOverride: vi.fn() }));

let armSpillBoost;
let spillCountForCart;
let updateCargoLoad;
let grantLifeCargo;
let stripLifeCargo;
let clearCargoOverflowForSlot;
let baselineLifeCargoPoints;
let cargoCurveMul;
let lifeCargoVisibleCount;
let gameStore;
let announce;
let setCargoFillCount;
let CONFIG;

beforeEach(async () => {
  vi.clearAllMocks();
  vi.resetModules();
  ({
    armSpillBoost,
    spillCountForCart,
    updateCargoLoad,
    grantLifeCargo,
    stripLifeCargo,
    clearCargoOverflowForSlot,
    baselineLifeCargoPoints,
    cargoCurveMul,
    lifeCargoVisibleCount,
  } = await import("../src/cargoLoad.js"));
  ({ gameStore } = await import("../src/stores/gameStore.js"));
  ({ announce } = await import("../src/announcer/announcerManager.js"));
  ({ setCargoFillCount } = await import("../src/effects/groceryPool.js"));
  ({ CONFIG } = await import("../src/config.js"));
  gameStore.setState({
    roundStartedAtMs: 10_000,
    roundScores: { 0: 0, 1: 0, 2: 0, 3: 0 },
  });
});

function makeCart(slotIndex, overrides = {}) {
  const baseline = CONFIG.cargo.baselinePoints ?? 3;
  return {
    slotIndex,
    label: `P${slotIndex}`,
    cargoBay: { visible: true, userData: {} },
    hasSpilled: false,
    respawnAtMs: null,
    isShattering: false,
    lifeCargoPoints: baseline,
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
  it("opens the announce window from the spill moment", () => {
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

describe("life cargo grant / strip", () => {
  it("grantLifeCargo adds points and caps at fullScore", () => {
    const cart = makeCart(0, { lifeCargoPoints: 0 });
    grantLifeCargo(cart, 3);
    expect(cart.lifeCargoPoints).toBe(3);
    grantLifeCargo(cart, 100);
    expect(cart.lifeCargoPoints).toBe(CONFIG.cargo.fullScore);
  });

  it("stripLifeCargo zeros points", () => {
    const cart = makeCart(0, { lifeCargoPoints: 5 });
    stripLifeCargo(cart);
    expect(cart.lifeCargoPoints).toBe(0);
  });

  it("baselineLifeCargoPoints matches config", () => {
    expect(baselineLifeCargoPoints()).toBe(CONFIG.cargo.baselinePoints);
  });
});

describe("cargoCurveMul", () => {
  it("maps baseline weight to 1.0", () => {
    const full = CONFIG.cargo.fullScore;
    const baselineW = CONFIG.cargo.baselinePoints / full;
    expect(cargoCurveMul(baselineW, 1.12, 0.88)).toBeCloseTo(1, 5);
  });

  it("maps stripped and boss to the curve ends", () => {
    expect(cargoCurveMul(0, 1.12, 0.88)).toBeCloseTo(1.12, 5);
    expect(cargoCurveMul(1, 1.12, 0.88)).toBeCloseTo(0.88, 5);
  });
});

describe("lifeCargoVisibleCount", () => {
  it("ramps stripped → baseline → boss as 0 → baseItems → maxItems", () => {
    expect(lifeCargoVisibleCount(0)).toBe(0);
    expect(lifeCargoVisibleCount(CONFIG.cargo.baselinePoints)).toBe(CONFIG.cargo.baseItems);
    expect(lifeCargoVisibleCount(CONFIG.cargo.fullScore)).toBe(CONFIG.cargo.maxItems);
    expect(lifeCargoVisibleCount(1)).toBeGreaterThan(0);
    expect(lifeCargoVisibleCount(1)).toBeLessThan(CONFIG.cargo.baseItems);
  });
});

describe("updateCargoLoad — life cargo drives fullness (not roundScores)", () => {
  it("maps lifeCargoPoints onto cargoFullness01 and fills the bay by count", () => {
    const life = CONFIG.cargo.fullScore / 2;
    const cart = makeCart(1, { lifeCargoPoints: life });
    gameStore.setState({ roundScores: { 0: 99, 1: 99, 2: 99, 3: 99 } });
    updateCargoLoad([null, cart, null, null], 1000, makeCtx());
    expect(cart.cargoFullness01).toBe(0.5);
    expect(setCargoFillCount).toHaveBeenCalledWith(
      cart.cargoBay,
      lifeCargoVisibleCount(life),
    );
  });

  it("roundScores alone do not refill weight", () => {
    const cart = makeCart(0, { lifeCargoPoints: 0 });
    gameStore.setState({ roundScores: { 0: CONFIG.cargo.fullScore, 1: 0, 2: 0, 3: 0 } });
    updateCargoLoad([cart], 1000, makeCtx());
    expect(cart.cargoFullness01).toBe(0);
    expect(cart.lifeCargoPoints).toBe(0);
  });

  it("hides the bay while stripped", () => {
    const cart = makeCart(0, {
      lifeCargoPoints: 0,
      cargoBay: { visible: true, userData: {} },
    });
    updateCargoLoad([cart], 1000, makeCtx());
    expect(cart.cargoBay.visible).toBe(false);
    expect(setCargoFillCount).toHaveBeenCalledWith(cart.cargoBay, 0);
  });

  it("shows the bay again after life cargo is earned post-spill", () => {
    const cart = makeCart(0, {
      lifeCargoPoints: 2,
      hasSpilled: true,
      cargoBay: { visible: false, userData: {} },
    });
    updateCargoLoad([cart], 1000, makeCtx());
    expect(cart.cargoBay.visible).toBe(true);
  });
});

describe("updateCargoLoad — CART OVERFLOW announce", () => {
  it("fires once per slot per life, with the slot's display name", () => {
    const cart = makeCart(1, { lifeCargoPoints: CONFIG.cargo.fullScore });
    updateCargoLoad([null, cart], 1000, makeCtx());
    updateCargoLoad([null, cart], 1016, makeCtx());
    const overflowCalls = announce.mock.calls.filter(([id]) => id === "cart_overflow");
    expect(overflowCalls).toEqual([["cart_overflow", { name: "BOT-A" }]]);
  });

  it("stays quiet outside the running phase", () => {
    const cart = makeCart(0, { lifeCargoPoints: CONFIG.cargo.fullScore });
    updateCargoLoad([cart], 1000, makeCtx({ roundPhase: "podium" }));
    expect(announce).not.toHaveBeenCalled();
  });

  it("re-arms when a new round starts", () => {
    const cart = makeCart(0, { lifeCargoPoints: CONFIG.cargo.fullScore });
    updateCargoLoad([cart], 1000, makeCtx());
    gameStore.setState({ roundStartedAtMs: 20_000 });
    updateCargoLoad([cart], 2000, makeCtx());
    const overflowCalls = announce.mock.calls.filter(([id]) => id === "cart_overflow");
    expect(overflowCalls).toHaveLength(2);
  });

  it("re-arms after clearCargoOverflowForSlot (respawn)", () => {
    const cart = makeCart(0, { lifeCargoPoints: CONFIG.cargo.fullScore });
    updateCargoLoad([cart], 1000, makeCtx());
    clearCargoOverflowForSlot(0);
    updateCargoLoad([cart], 1100, makeCtx());
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
