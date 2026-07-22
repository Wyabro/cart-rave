// Pure connection / pending-picker stale-id selection extracted from CartRaveServer.
// The DO still closes sockets, deletes maps, converts seats, and calls host re-arm;
// this module only answers "which ids are past the timeout?".
//
// Invariants:
// - Pending color-pickers are excluded from the silent-connection list (they have
//   their own picker timeout path).
// - Missing lastSeen / joinedAt is treated as epoch 0 (reap-eligible), matching
//   the DO's intentional default for connections present at reaper deploy time.

import { PICKER_TIMEOUT_MS, REAP_TIMEOUT_MS } from './constants';

export type ConnId = string;

/**
 * Connection ids that have been silent longer than the reap timeout and are not
 * pending pickers.
 *
 * @param connectionIds Currently tracked connection ids.
 * @param lastSeenAtMs connId → last activity ms (missing → 0).
 * @param pendingPickers Ids still in the color-picker lobby.
 * @param now Server monotonic ms.
 * @param timeoutMs Silence threshold (defaults to REAP_TIMEOUT_MS).
 */
export function listSilentConnectionsToReap(
  connectionIds: Iterable<ConnId>,
  lastSeenAtMs: ReadonlyMap<ConnId, number>,
  pendingPickers: ReadonlySet<ConnId>,
  now: number,
  timeoutMs: number = REAP_TIMEOUT_MS,
): ConnId[] {
  const out: ConnId[] = [];
  for (const id of connectionIds) {
    if (pendingPickers.has(id)) continue;
    const lastSeen = lastSeenAtMs.get(id) ?? 0;
    if (now - lastSeen > timeoutMs) out.push(id);
  }
  return out;
}

/**
 * Pending picker ids whose join age exceeds the picker timeout.
 *
 * @param pendingPickerIds Ids currently in the pending-picker set.
 * @param pendingPickerAtMs connId → join ms (missing → 0).
 * @param now Server monotonic ms.
 * @param timeoutMs Picker timeout (defaults to PICKER_TIMEOUT_MS).
 */
export function listStalePendingPickers(
  pendingPickerIds: Iterable<ConnId>,
  pendingPickerAtMs: ReadonlyMap<ConnId, number>,
  now: number,
  timeoutMs: number = PICKER_TIMEOUT_MS,
): ConnId[] {
  const out: ConnId[] = [];
  for (const id of pendingPickerIds) {
    const joinedAt = pendingPickerAtMs.get(id) ?? 0;
    if (now - joinedAt > timeoutMs) out.push(id);
  }
  return out;
}
