// @vitest-environment happy-dom
// simCallbackFreeze.test.js — SIM-CALLBACK-FREEZE-1.
// clientSimCallbacks used to spread hostSimCallbacks, which invokes its live getters once and
// copies the results. The spread ran before arena load, so the non-host bundle permanently held
// recordColliderHandles = [] / pitWallColliderHandle = undefined / boothColliderHandles = [] and
// classifyEnvironmentCollision (simulation.js) fell through to "floor" on every non-host contact.
import { describe, it, expect, vi } from "vitest";
import { createLoopDeps } from "../src/orchestration/loopDeps.js";
import { runFixedPhysicsStep } from "../src/simulation.js";

const NOW = 1_000;
const CART_HANDLE = 9_001;
const RECORD_HANDLE = 100;
const PIT_HANDLE = 200;
const BOOTH_HANDLE = 300;

/**
 * Mutable handle store mirroring levelOrchestration's arena-load state. The phase getters read
 * through to it, so a test can mutate the store after a bundle was built — the exact pre/post
 * arena-load difference the frozen-spread bug hid.
 */
function makeStore({ recordHandles, pitWallHandle, boothHandles, bollardHandles = [] }) {
  const store = { recordHandles, pitWallHandle, boothHandles, bollardHandles };
  return {
    store,
    getters: {
      getRecordColliderHandles: () => store.recordHandles,
      getPitWallColliderHandle: () => store.pitWallHandle,
      getBoothColliderHandles: () => store.boothHandles,
      getBollardColliderHandles: () => store.bollardHandles,
    },
  };
}

/** Minimal phase for attachPhaseDeps — only build-time-invoked deps need real values. */
function buildPhase(overrides = {}) {
  return {
    gameCtx: {
      attachDeps: () => {},
      getSlowMoDeps: () => ({}),
    },
    getSpawnTrashBurstRef: () => () => {},
    onHopLand: () => {},
    getRecordColliderHandles: () => [],
    getPitWallColliderHandle: () => undefined,
    getBoothColliderHandles: () => [],
    getBollardColliderHandles: () => [],
    ...overrides,
  };
}

function buildClientSimCallbacks(phase) {
  return createLoopDeps({ getGameLoopDriver: () => null }).attachPhaseDeps(phase).clientSimCallbacks;
}

describe("clientSimCallbacks handle getters stay live (SIM-CALLBACK-FREEZE-1)", () => {
  it("built before arena load: empty init values, still live once the store is populated", () => {
    const { store, getters } = makeStore({
      recordHandles: [],
      pitWallHandle: undefined,
      boothHandles: [],
    });
    const cb = buildClientSimCallbacks(buildPhase(getters));

    // * The non-host bundle must expose these as getters, not plain copies of spread results.
    for (const key of ["recordColliderHandles", "pitWallColliderHandle", "boothColliderHandles"]) {
      expect(typeof Object.getOwnPropertyDescriptor(cb, key).get).toBe("function");
    }
    expect(cb.recordColliderHandles).toEqual([]);
    expect(cb.pitWallColliderHandle).toBeUndefined();
    expect(cb.boothColliderHandles).toEqual([]);

    // * Arena load populates the source objects after this bundle was built.
    store.recordHandles = [RECORD_HANDLE];
    store.pitWallHandle = PIT_HANDLE;
    store.boothHandles = [BOOTH_HANDLE];

    expect(cb.recordColliderHandles).toEqual([RECORD_HANDLE]);
    expect(cb.pitWallColliderHandle).toBe(PIT_HANDLE);
    expect(cb.boothColliderHandles).toEqual([BOOTH_HANDLE]);
  });

  it("built after arena load: sees populated values and stays live to later changes", () => {
    const { store, getters } = makeStore({
      recordHandles: [RECORD_HANDLE],
      pitWallHandle: PIT_HANDLE,
      boothHandles: [BOOTH_HANDLE],
    });
    const cb = buildClientSimCallbacks(buildPhase(getters));

    expect(cb.recordColliderHandles).toEqual([RECORD_HANDLE]);
    expect(cb.pitWallColliderHandle).toBe(PIT_HANDLE);
    expect(cb.boothColliderHandles).toEqual([BOOTH_HANDLE]);

    store.recordHandles.push(RECORD_HANDLE + 1);
    store.pitWallHandle = PIT_HANDLE + 1;
    store.boothHandles.push(BOOTH_HANDLE + 1);

    expect(cb.recordColliderHandles).toEqual([RECORD_HANDLE, RECORD_HANDLE + 1]);
    expect(cb.pitWallColliderHandle).toBe(PIT_HANDLE + 1);
    expect(cb.boothColliderHandles).toEqual([BOOTH_HANDLE, BOOTH_HANDLE + 1]);
  });
});

/** Fake cart: covers only the physics reads runFixedPhysicsStep performs on the env-contact path. */
function makeCart() {
  const body = {
    translation: () => ({ x: 0, y: 0, z: 0 }),
    rotation: () => ({ x: 0, y: 0, z: 0, w: 1 }),
    linvel: () => ({ x: 0, y: 0, z: 0 }),
    angvel: () => ({ x: 0, y: 0, z: 0 }),
  };
  return {
    body,
    collider: { handle: CART_HANDLE },
    slotIndex: 0,
    // * Spectator flag skips the local-controls pass; env contacts + callbacks.localCart are
    // * still processed exactly as for a playing cart.
    isSuddenDeathSpectator: true,
    hopAwaitingLand: true,
    hopAirborne: true,
    lastHopAtMs: NOW,
    pendingRam: null,
  };
}

/** Drive one non-host physics step that reports a started contact vs `otherHandle`. */
function driveNonHostContact(callbacks, otherHandle) {
  const cart = makeCart();
  runFixedPhysicsStep({
    world: { step: () => {} },
    eventQueue: { drainCollisionEvents: (fn) => fn(otherHandle, CART_HANDLE, true) },
    allCarts: [cart],
    localCart: cart,
    isHost: false,
    callbacks,
    dt: 1 / 60,
    now: NOW,
  });
  return cart;
}

describe("non-host env collision classification (via runFixedPhysicsStep)", () => {
  it("pit-wall and booth grazes classify as non-floor; record contact still lands a hop", () => {
    const { getters } = makeStore({
      recordHandles: [RECORD_HANDLE],
      pitWallHandle: PIT_HANDLE,
      boothHandles: [BOOTH_HANDLE],
    });
    const onHopLand = vi.fn();
    const cb = buildClientSimCallbacks(buildPhase({ ...getters, onHopLand }));

    // * Pit-wall graze: the live getter resolves the handle → "edge", so the hop-landing block
    // * (floor-only) is skipped. The frozen-spread bug classified this as "floor" and fired it.
    driveNonHostContact(cb, PIT_HANDLE);
    expect(onHopLand).not.toHaveBeenCalled();

    // * Same for a booth collision.
    driveNonHostContact(cb, BOOTH_HANDLE);
    expect(onHopLand).not.toHaveBeenCalled();

    // * Positive control: a genuine record/floor contact still consumes the hop landing.
    driveNonHostContact(cb, RECORD_HANDLE);
    expect(onHopLand).toHaveBeenCalledTimes(1);
    expect(onHopLand).toHaveBeenCalledWith(
      expect.objectContaining({ slotIndex: 0 }),
      expect.any(Number),
    );
  });
});
