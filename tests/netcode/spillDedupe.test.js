// @vitest-environment happy-dom
// spillDedupe.test.js — SPILL-DOUBLE-VFX-1 optimistic spill deduplication and wire eid dedupe.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __netcodeTestHooks as hooks,
  noteOptimisticSpill,
  clearOptimisticSpillForSlot,
  getHostSeq,
  registerGameCallbacks,
  setRefs,
} from "../../src/netcode.js";
import { MSG } from "../../shared/protocol.js";

describe("SPILL-DOUBLE-VFX-1 — optimistic spill deduplication and wire eid dedupe", () => {
  let triggerGrocerySpillMock;
  let hideCargoBayMock;
  let stripLifeCargoMock;
  let armSpillBoostMock;
  let onLocalSpillCreditMock;
  let mockCarts;

  beforeEach(() => {
    hooks.resetNetState();
    triggerGrocerySpillMock = vi.fn();
    hideCargoBayMock = vi.fn();
    stripLifeCargoMock = vi.fn();
    armSpillBoostMock = vi.fn();
    onLocalSpillCreditMock = vi.fn();

    registerGameCallbacks({
      triggerGrocerySpill: triggerGrocerySpillMock,
      hideCargoBay: hideCargoBayMock,
      stripLifeCargo: stripLifeCargoMock,
      armSpillBoost: armSpillBoostMock,
      onLocalSpillCredit: onLocalSpillCreditMock,
    });

    mockCarts = [
      { slotIndex: 0, hasSpilled: false, cargoBay: {} },
      { slotIndex: 1, hasSpilled: false, cargoBay: {} },
    ];
    setRefs({
      allCartsRef: mockCarts,
    });
    hooks.setHostStateForTest({
      isHost: false,
      youConnId: "human-0",
      netSlots: [
        { slotId: 0, kind: "human", connId: "human-0" },
        { slotId: 1, kind: "human", connId: "human-1" },
      ],
    });
  });

  afterEach(() => {
    hooks.resetNetState();
    vi.restoreAllMocks();
  });

  it("getHostSeq returns the current host sequence", () => {
    expect(typeof getHostSeq()).toBe("number");
  });

  it("skips triggerGrocerySpill when local cart has already optimistically spilled", () => {
    const localSlot = 0;
    // Simulate non-host identity
    hooks.setAuthorityModeForTest(false);

    // 1. Local client predicts tip-over and notes optimistic spill
    noteOptimisticSpill(localSlot);

    // 2. Host MSG.spill confirmation arrives ~1 RTT later
    hooks.dispatchP2P({
      type: MSG.spill,
      eid: "s10.0",
      slotId: localSlot,
      pos: { x: 0, y: 0, z: 0 },
      quat: { x: 0, y: 0, z: 0, w: 1 },
      vel: { x: 0, y: 0, z: 0 },
      count: 6,
      attackerSlotIndex: 1,
    }, "hostConn");

    // State cleanup still runs
    expect(mockCarts[0].hasSpilled).toBe(true);
    expect(hideCargoBayMock).toHaveBeenCalled();
    expect(stripLifeCargoMock).toHaveBeenCalled();
    expect(armSpillBoostMock).toHaveBeenCalled();

    // But duplicate grocery physics / particles / sfx are suppressed
    expect(triggerGrocerySpillMock).not.toHaveBeenCalled();
  });

  it("fires triggerGrocerySpill for remote carts that were not optimistically predicted", () => {
    const remoteSlot = 1;
    hooks.setAuthorityModeForTest(false);

    // Host MSG.spill arrives for remote cart
    hooks.dispatchP2P({
      type: MSG.spill,
      eid: "s10.1",
      slotId: remoteSlot,
      pos: { x: 1, y: 0, z: 1 },
      quat: { x: 0, y: 0, z: 0, w: 1 },
      vel: { x: 0, y: 0, z: 0 },
      count: 6,
      attackerSlotIndex: 0,
    }, "hostConn");

    expect(mockCarts[1].hasSpilled).toBe(true);
    expect(triggerGrocerySpillMock).toHaveBeenCalledTimes(1);
    expect(triggerGrocerySpillMock).toHaveBeenCalledWith(
      "1",
      { x: 1, y: 0, z: 1 },
      { x: 0, y: 0, z: 0, w: 1 },
      { x: 0, y: 0, z: 0 },
      6,
      mockCarts[1].cargoBay,
    );
  });

  it("fires triggerGrocerySpill when local cart was not optimistically predicted (e.g. sudden fall)", () => {
    const localSlot = 0;
    hooks.setAuthorityModeForTest(false);

    // No noteOptimisticSpill called prior to wire arrival
    hooks.dispatchP2P({
      type: MSG.spill,
      eid: "s11.0",
      slotId: localSlot,
      pos: { x: 0, y: 0.5, z: 0 },
      quat: { x: 0, y: 0, z: 0, w: 1 },
      vel: { x: 0, y: 0, z: 0 },
      count: 6,
      attackerSlotIndex: 1,
    }, "hostConn");

    expect(mockCarts[0].hasSpilled).toBe(true);
    expect(triggerGrocerySpillMock).toHaveBeenCalledTimes(1);
  });

  it("drops duplicate MSG.spill packets with the same eid", () => {
    const remoteSlot = 1;
    hooks.setAuthorityModeForTest(false);

    const payload = {
      type: MSG.spill,
      eid: "s12.1",
      slotId: remoteSlot,
      pos: { x: 2, y: 0, z: 2 },
      quat: { x: 0, y: 0, z: 0, w: 1 },
      vel: { x: 0, y: 0, z: 0 },
      count: 6,
    };

    // First arrival
    hooks.dispatchP2P(payload, "hostConn");
    expect(triggerGrocerySpillMock).toHaveBeenCalledTimes(1);

    // Duplicate packet arrival on unreliable DataChannel
    hooks.dispatchP2P(payload, "hostConn");
    expect(triggerGrocerySpillMock).toHaveBeenCalledTimes(1);
  });

  it("clearing optimistic spill marker allows subsequent spills (e.g. after respawn)", () => {
    const localSlot = 0;
    hooks.setAuthorityModeForTest(false);

    // 1. Note optimistic spill on life 1
    noteOptimisticSpill(localSlot);

    // 2. Cart respawns before wire arrives
    clearOptimisticSpillForSlot(localSlot);

    // 3. Next spill arrives without optimistic marker
    hooks.dispatchP2P({
      type: MSG.spill,
      eid: "s20.0",
      slotId: localSlot,
      pos: { x: 0, y: 0, z: 0 },
      quat: { x: 0, y: 0, z: 0, w: 1 },
      vel: { x: 0, y: 0, z: 0 },
      count: 6,
    }, "hostConn");

    expect(triggerGrocerySpillMock).toHaveBeenCalledTimes(1);
  });
});
