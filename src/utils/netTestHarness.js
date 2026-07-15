/**
 * netTestHarness.js — window.__ccTest hooks for the 2-client netcode E2E rig.
 *
 * Read-only snapshot of live game/netcode state so an external driver (Playwright,
 * tools/netharness.mjs) can assert cross-client invariants: round phase, per-cart
 * pose/velocity, own slot/connId, and the ackSeq the host last advertised for us.
 *
 * Input is NOT injected here — the rig drives real keydown/keyup events (WASD / Shift /
 * Space) so the harness exercises the exact production input path (getAxis → prediction →
 * P2P send → host apply). This module only reads.
 *
 * Installed only when the URL carries ?nettest=1 (dev + prod builds; read-only). Cost is
 * zero otherwise — nothing runs unless installed.
 */

/**
 * @typedef {object} NetTestDeps
 * @property {() => boolean} isReady          Main bootstrap finished.
 * @property {() => string} getPhase          Round phase ("lobby"|"countdown"|"running"|"podium"|…).
 * @property {() => string | null} getYouConnId
 * @property {() => string | null} getHostId
 * @property {() => boolean} getIsHost
 * @property {() => number} getLocalSlotIndex  strictSlotIndexForConn(you); -1 if unseated.
 * @property {() => Array<any> | null} getCarts allCartsRef (per-slot; holes are null).
 * @property {() => Array<any> | null} getNetSlots Per-slot lobby records ({connId,kind,color}|null).
 * @property {() => { seq?: number, carts?: Array<any> } | null} getLatestSnap Newest host snapshot.
 * @property {() => { forward: number, turn: number } | null} [getAxis] Live sampled input axis (debug).
 * @property {() => number} [getPendingInputCount] Unacked predicted input frames (debug).
 * @property {() => object} [getInputCounters] Netcode input-path counters (drain/sample/send/ingest).
 * @property {() => boolean} [getShouldPredict] Netcode.shouldUseClientPrediction() gate.
 * @property {() => string} [getMode] detectGameMode() ("quickplay"|"solo"|…).
 * @property {() => number} [getMigFreezeRemMs] Host-migration freeze remaining (ms; <=0 inactive).
 * @property {() => string | null} [getPendingMidJoinConnId] Pending mid-round-join respawn connId.
 * @property {(connId: string) => { queueLen: number, lastAckSeq: number }} [getHostInputDebug] Host-side per-peer input state.
 */

/** @param {number} x @param {number} y @param {number} z */
function speed3(x, y, z) {
  return Math.hypot(Number(x) || 0, Number(y) || 0, Number(z) || 0);
}

/**
 * @param {NetTestDeps} deps
 * @returns {void}
 */
export function installNetTestHarness(deps) {
  /**
   * Read a single cart's live pose/velocity from its Rapier body.
   * @param {any} cart
   * @param {number} slot
   * @param {any} netSlot
   */
  function readCart(cart, slot, netSlot) {
    if (!cart || !cart.body) return null;
    let t = { x: 0, y: 0, z: 0 };
    let v = { x: 0, y: 0, z: 0 };
    try {
      t = cart.body.translation();
      v = cart.body.linvel();
    } catch {
      /* body torn down mid-read — report zeros */
    }
    return {
      slot,
      connId: netSlot?.connId ?? null,
      kind: netSlot?.kind ?? (cart.isNpc ? "npc" : "human"),
      x: t.x,
      y: t.y,
      z: t.z,
      speed: speed3(v.x, v.y, v.z),
      spectator: Boolean(cart.isSuddenDeathSpectator),
      shatter: Boolean(cart._shatterState),
      isNpc: Boolean(cart.isNpc),
      respawnAtMs: cart.respawnAtMs ?? null,
    };
  }

  /** @type {any} */
  const api = {
    version: 1,

    /** @returns {boolean} */
    get ready() {
      return Boolean(deps.isReady());
    },

    /**
     * One-shot structured readout of everything the rig asserts on.
     * @returns {object}
     */
    getState() {
      const carts = deps.getCarts() || [];
      const netSlots = deps.getNetSlots() || [];
      const localSlot = deps.getLocalSlotIndex();
      const snap = deps.getLatestSnap();
      const selfSnap =
        snap && Array.isArray(snap.carts) && localSlot >= 0 ? snap.carts[localSlot] : null;

      const out = [];
      for (let i = 0; i < carts.length; i += 1) {
        const c = readCart(carts[i], i, netSlots[i]);
        if (c) out.push(c);
      }

      return {
        ready: api.ready,
        phase: deps.getPhase(),
        isHost: deps.getIsHost(),
        youConnId: deps.getYouConnId(),
        hostId: deps.getHostId(),
        localSlotIndex: localSlot,
        // * The ackSeq the host stamped for our cart in its newest snapshot. When this
        // * advances but our own cart never moves, that IS the spawn-lock signature:
        // * the host acked input it never applied, so the client pruned + hard-snapped.
        ackForSelf: selfSnap ? (selfSnap.ackSeq ?? 0) : null,
        selfSnapSpectator: selfSnap ? Boolean(selfSnap.s) : null,
        pendingMidJoinConnId: deps.getPendingMidJoinConnId ? deps.getPendingMidJoinConnId() : undefined,
        latestSnapSeq: snap ? (snap.seq ?? null) : null,
        axis: deps.getAxis ? deps.getAxis() : null,
        pending: deps.getPendingInputCount ? deps.getPendingInputCount() : null,
        counters: deps.getInputCounters ? deps.getInputCounters() : null,
        predict: deps.getShouldPredict ? deps.getShouldPredict() : null,
        mode: deps.getMode ? deps.getMode() : null,
        migFreezeRemMs: deps.getMigFreezeRemMs ? deps.getMigFreezeRemMs() : null,
        carts: out,
        tClient: performance.now(),
      };
    },

    /**
     * Host-side: what the host has buffered/acked for a given peer connId. Lets the rig
     * distinguish "host never received the peer's input" (queue stays 0) from "host received
     * but never applied it" (queue drains yet ack stalls / cart never moves).
     * @param {string} connId
     * @returns {{ queueLen: number, lastAckSeq: number } | null}
     */
    hostInputDebug(connId) {
      return deps.getHostInputDebug ? deps.getHostInputDebug(connId) : null;
    },

    /**
     * Convenience: our own cart's live readout (or null if unseated / no body yet).
     * @returns {object | null}
     */
    getSelfCart() {
      const localSlot = deps.getLocalSlotIndex();
      if (localSlot < 0) return null;
      const carts = deps.getCarts() || [];
      const netSlots = deps.getNetSlots() || [];
      return readCart(carts[localSlot], localSlot, netSlots[localSlot]);
    },
  };

  /** @type {any} */ (window).__ccTest = api;

  // eslint-disable-next-line no-console
  console.info("[netTestHarness] installed — window.__ccTest ready");
}
