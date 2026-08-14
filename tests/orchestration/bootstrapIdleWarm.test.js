// @vitest-environment happy-dom
// bootstrapIdleWarm.test.js — BOOT-PERF-1 gen-cancel for mid-flight arena retarget.
// bootstrap.js transitively touches DOM via cartRaveGltf → touchControls; happy-dom required.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ensureWorldBootstrapped,
  getWorldBootstrapGen,
  getWorldBootstrapTarget,
  initBootstrap,
  isWorldBootstrapped,
  isWorldBootstrapInFlight,
  resetWorldBootstrapForTest,
} from "../../src/bootstrap.js";

describe("ensureWorldBootstrapped gen-cancel (BOOT-PERF-1)", () => {
  /** @type {string[]} */
  let loaded;
  /** @type {(() => void) | null} */
  let releasePhysics;
  /** @type {Promise<void>} */
  let physicsGate;

  beforeEach(() => {
    resetWorldBootstrapForTest();
    loaded = [];
    releasePhysics = null;
    physicsGate = new Promise((resolve) => {
      releasePhysics = resolve;
    });

    initBootstrap({
      detectGameMode: () => "solo",
      getMenuVisible: () => true,
      commitMenuHiddenForGame: () => {},
      getLoadedLevelId: () => loaded[loaded.length - 1] ?? "classicRecord",
      ensureRapierPhysics: async () => {
        await physicsGate;
      },
      bootstrapWorldCore: async (levelId) => {
        // * Tiny async yield so retarget can land between physics and core.
        await Promise.resolve();
        loaded.push(levelId ?? "classicRecord");
      },
      getHelloGate: () => ({
        getGeneration: () => 0,
        isReceived: () => true,
        getFirstPromise: () => Promise.resolve(),
      }),
      getAllCartsRef: () => null,
      bootstrapSessionCarts: () => null,
      rebuildLevelIfNeeded: async () => {},
      finalizeArenaForPlay: () => {},
    });
  });

  afterEach(() => {
    resetWorldBootstrapForTest();
  });

  it("loads the explicit selected arena", async () => {
    const p = ensureWorldBootstrapped("zanzibar");
    expect(isWorldBootstrapInFlight()).toBe(true);
    expect(getWorldBootstrapTarget()).toBe("zanzibar");
    releasePhysics?.();
    await p;
    expect(isWorldBootstrapped()).toBe(true);
    expect(loaded).toEqual(["zanzibar"]);
    expect(isWorldBootstrapInFlight()).toBe(false);
  });

  it("joins a same-target in-flight warm without bumping gen twice", async () => {
    const a = ensureWorldBootstrapped("classicRecord");
    const gen1 = getWorldBootstrapGen();
    const b = ensureWorldBootstrapped("classicRecord");
    expect(getWorldBootstrapGen()).toBe(gen1);
    expect(a).toBe(b);
    releasePhysics?.();
    await a;
    expect(loaded).toEqual(["classicRecord"]);
  });

  it("retarget mid-flight: stale flight does not latch done; final target wins", async () => {
    const a = ensureWorldBootstrapped("classicRecord");
    expect(getWorldBootstrapTarget()).toBe("classicRecord");
    const genA = getWorldBootstrapGen();

    // * Before physics resolves, picker moves to backrooms.
    const b = ensureWorldBootstrapped("backrooms");
    expect(getWorldBootstrapGen()).toBeGreaterThan(genA);
    expect(getWorldBootstrapTarget()).toBe("backrooms");
    expect(isWorldBootstrapped()).toBe(false);

    releasePhysics?.();
    await Promise.all([a, b]);

    expect(isWorldBootstrapped()).toBe(true);
    expect(getWorldBootstrapTarget()).toBe("backrooms");
    // * Stale classic may still have run core after await-chain; owner is backrooms.
    expect(loaded[loaded.length - 1]).toBe("backrooms");
    // * Done only latched once for the winning gen (not sticky classic-only).
    expect(loaded.includes("backrooms")).toBe(true);
  });

  it("play-entry claim for selected level after stale warm still ends selected", async () => {
    const warm = ensureWorldBootstrapped("classicRecord");
    const play = ensureWorldBootstrapped("zanzibar");
    releasePhysics?.();
    await warm;
    await play;
    expect(isWorldBootstrapped()).toBe(true);
    expect(getWorldBootstrapTarget()).toBe("zanzibar");
    expect(loaded[loaded.length - 1]).toBe("zanzibar");
  });

  it("no-ops when already done (rebuild path owns later swaps)", async () => {
    const p = ensureWorldBootstrapped("classicRecord");
    releasePhysics?.();
    await p;
    const gen = getWorldBootstrapGen();
    await ensureWorldBootstrapped("backrooms");
    expect(getWorldBootstrapGen()).toBe(gen);
    expect(loaded).toEqual(["classicRecord"]);
  });
});
