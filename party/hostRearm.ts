// Pure host-repair plan extracted from CartRaveServer.#ensureLiveHost.
// When #hostId points at a connection that no longer exists (crash / reap /
// ghost), decide the successor and whether a mid-countdown room must reset to
// lobby. The DO still broadcasts, clears timers, mutates #round, and re-arms.
//
// Invariants:
// - null hostId → no-op plan (first-host assignment lives elsewhere).
// - Live host → no-op plan (do not clear timers or reset phase).
// - Dead host during countdown → successor + resetCountdownToLobby true so
//   clients are not stranded waiting on a game_start the dead host owned.

import { pickNextHostId } from './hostSelection';

/** Minimal structural view of a slot — avoids importing the DO's Slot type. */
type MinimalSlot = { connId: string | null; kind: string };

export type ConnId = string;

export type HostRearmPlan = {
  /** True when hostId was non-null but missing from the live set. */
  hostWasDead: boolean;
  /** Successor after pickNextHostId, or null if none / no-op. */
  nextHostId: ConnId | null;
  /** True when phase is countdown and the host was dead — DO must lobby-reset. */
  resetCountdownToLobby: boolean;
};

/**
 * Plans host repair after any path that may have removed the current host.
 *
 * @param hostId Current #hostId (may be stale).
 * @param liveConnIds Connections that still exist.
 * @param joinOrder Connection ids oldest-first.
 * @param slots Slot table, or null before init.
 * @param phase Current round phase string.
 */
export function planHostRearm(
  hostId: ConnId | null,
  liveConnIds: ReadonlySet<ConnId>,
  joinOrder: readonly ConnId[],
  slots: readonly MinimalSlot[] | null,
  phase: string,
): HostRearmPlan {
  if (hostId === null) {
    return { hostWasDead: false, nextHostId: null, resetCountdownToLobby: false };
  }
  if (liveConnIds.has(hostId)) {
    return { hostWasDead: false, nextHostId: hostId, resetCountdownToLobby: false };
  }
  const nextHostId = pickNextHostId(joinOrder, liveConnIds, slots);
  return {
    hostWasDead: true,
    nextHostId,
    resetCountdownToLobby: phase === 'countdown',
  };
}
