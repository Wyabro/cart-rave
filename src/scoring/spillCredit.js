/**
 * spillCredit.js — local "caused a spill" progression. SPILL-RAM-CREDIT-1.
 *
 * Challenges (`spill_15` / `spill_50` / `blueMirror`) and receipt SPILLS CAUSED tick
 * only when an opponent's groceries actually fly and this client is the recent rammer.
 * Attribution is host-computed (`lastHitBy` + `hitWindowMs`); clients honor the
 * host's `MSG.spill.attackerSlotIndex`. Rams on an upright victim do not count.
 *
 * Leaf: no orchestration imports.
 */

import { ChallengeTracker } from "../stores/challengeStore.js";
import { PROGRESSION_EVENTS } from "../progression/eventIds.js";
import { recordLocalSpillForMatchStats } from "./matchStats.js";

/**
 * Recent rammer for a victim spill, or null. Copy of the Spill Bonus hit window:
 * missing/stale hit → null; self-stamp → null.
 *
 * Hit stamps use `getRoundClockNowMs` (`gameStore.recordHit`). Pass that clock as
 * `nowMs` or credits silently go to 0.
 *
 * @param {Map<number, { attackerSlotIndex: number, timestamp: number }> | null | undefined} lastHitBy
 * @param {number} victimSlotIndex
 * @param {number} nowMs
 * @param {number} [hitWindowMs=3000]
 * @returns {number | null}
 */
export function resolveRecentRammer(lastHitBy, victimSlotIndex, nowMs, hitWindowMs = 3000) {
  const hit = lastHitBy?.get?.(victimSlotIndex);
  if (!hit || nowMs - hit.timestamp > hitWindowMs) return null;
  if (hit.attackerSlotIndex === victimSlotIndex) return null;
  return hit.attackerSlotIndex ?? null;
}

/**
 * True when the host-stamped attacker is this client's local slot.
 * Slot 0 must credit. `null` / omitted / another slot must not.
 *
 * @param {unknown} attackerSlotIndex
 * @param {unknown} localSlot
 * @returns {boolean}
 */
export function shouldCreditLocalSpill(attackerSlotIndex, localSlot) {
  return Number.isInteger(attackerSlotIndex)
    && Number.isInteger(localSlot)
    && attackerSlotIndex === localSlot;
}

/**
 * Records one local-caused spill on challenges and match-stat SPILLS CAUSED.
 * Single source for the host path and the `MSG.spill` client hook.
 * @returns {void}
 */
export function creditLocalSpillCause() {
  ChallengeTracker.record(PROGRESSION_EVENTS.SPILL);
  recordLocalSpillForMatchStats();
}
