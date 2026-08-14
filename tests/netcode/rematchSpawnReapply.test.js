// @vitest-environment happy-dom
// NET-1 S1: non-host restores host_spawn poses after a mid-swap body wipe.

import { describe, it, expect, beforeEach } from "vitest";
import {
  reapplyCachedCartsSnapshot,
  setRefs,
  __netcodeTestHooks as hooks,
} from "../../src/netcode.js";

function makeCart(slotIndex) {
  const pos = { x: 99, y: 0, z: 99 };
  return {
    slotIndex,
    body: {
      translation: () => ({ ...pos }),
      setTranslation: (p) => {
        pos.x = p.x;
        pos.y = p.y;
        pos.z = p.z;
      },
      rotation: () => ({ x: 0, y: 0, z: 0, w: 1 }),
      setRotation: () => {},
      linvel: () => ({ x: 0, y: 0, z: 0 }),
      setLinvel: () => {},
      angvel: () => ({ x: 0, y: 0, z: 0 }),
      setAngvel: () => {},
    },
    mesh: null,
  };
}

describe("reapplyCachedCartsSnapshot (NET-1 rematch S1)", () => {
  /** @type {ReturnType<typeof makeCart>[]} */
  let carts;

  beforeEach(() => {
    hooks.resetNetState();
    carts = [0, 1, 2, 3].map(makeCart);
    setRefs({ getAllCartsRef: () => carts });
    hooks.setHostStateForTest({ isHost: false, youConnId: "joiner", netSlots: [] });
  });

  it("re-applies cached host poses after a simulated swap wipe", () => {
    const spawnCarts = [
      { p: [10, 1, 0], q: [0, 0, 0, 1], lv: [0, 0, 0], av: [0, 0, 0] },
      { p: [0, 1, 10], q: [0, 0, 0, 1], lv: [0, 0, 0], av: [0, 0, 0] },
      { p: [-10, 1, 0], q: [0, 0, 0, 1], lv: [0, 0, 0], av: [0, 0, 0] },
      { p: [0, 1, -10], q: [0, 0, 0, 1], lv: [0, 0, 0], av: [0, 0, 0] },
    ];

    // * host_spawn lands before/during swap (host finished rotation first).
    hooks.applyHostSpawnSnapshot({ seq: 7, tHost: 5000, carts: spawnCarts });
    expect(hooks.getLastCartsCache()).toBeTruthy();
    expect(hooks.getLastCartsCacheIsSpawn()).toBe(true);
    expect(carts[0].body.translation().x).toBeCloseTo(10, 5);

    // * Collider rebuild wipe — bodies at garbage positions.
    for (const c of carts) {
      c.body.setTranslation({ x: 0, y: 50, z: 0 });
    }
    expect(carts[0].body.translation().y).toBe(50);

    // * Post-rotation: main.rotateLoadedArenaInPlace re-applies the cache.
    reapplyCachedCartsSnapshot();
    expect(carts[0].body.translation().x).toBeCloseTo(10, 5);
    expect(carts[0].body.translation().y).toBeCloseTo(1, 5);
    expect(carts[1].body.translation().z).toBeCloseTo(10, 5);
    expect(carts[2].body.translation().x).toBeCloseTo(-10, 5);
  });

  it("no-ops cleanly when cache is empty", () => {
    expect(hooks.getLastCartsCache()).toBeNull();
    reapplyCachedCartsSnapshot();
    expect(carts[0].body.translation().x).toBe(99);
  });

  it("does not reapply a stale live snap over ring seats (S1 residual)", () => {
    // * Previous-round live pose (off-edge) landed in lastCartsCache via 40Hz path.
    const staleLive = [
      { p: [40, -8, 40], q: [0, 0, 0, 1], lv: [0, 0, 0], av: [0, 0, 0] },
    ];
    hooks.setLastCartsCache(staleLive, false);
    expect(hooks.getLastCartsCacheIsSpawn()).toBe(false);

    // * rematchResetWorld already seated the local ring before reapply.
    carts[0].body.setTranslation({ x: 10, y: 1, z: 0 });
    reapplyCachedCartsSnapshot();
    // * Must keep ring seat — reapplying stale live would throw cart into the void.
    expect(carts[0].body.translation().x).toBeCloseTo(10, 5);
    expect(carts[0].body.translation().y).toBeCloseTo(1, 5);
  });
});
