// Pure host-promotion logic extracted from the Durable Object (party/index.ts) so the
// "promote the oldest surviving human connection" rule is unit-testable without spinning
// up a Workers/PartyServer runtime. index.ts's #pickNextHostId delegates here.
//
// NH-HIT lever 3 / HOST-ROLE-1: lobby rebalance can prefer a clearly stronger peer
// (capability scores from clients). Disconnect promotion stays join-order oldest.

/** Minimal structural view of a slot — avoids importing the DO's Slot type. */
type MinimalSlot = { connId: string | null; kind: string };

/** Neutral score when a peer never reported hostScore (legacy joins). */
const DEFAULT_HOST_SCORE = 50;

/**
 * Minimum preferred-minus-current gap before lobby steals the host role.
 * Keeps near-ties (two discretes, two iGPUs) on the first joiner.
 */
const HOST_SCORE_MIGRATE_MARGIN = 20;

/**
 * Picks the next host after the current host drops: the earliest-joined connection that
 * is (a) still connected and (b) occupies a human slot. Returns null if none qualifies
 * (e.g. only NPC slots remain, or every human has disconnected).
 *
 * @param joinOrder Connection ids in join order, oldest first.
 * @param liveConnIds Currently-connected connection ids.
 * @param slots Current slot table, or null before room init.
 */
export function pickNextHostId(
  joinOrder: readonly string[],
  liveConnIds: ReadonlySet<string>,
  slots: readonly MinimalSlot[] | null,
): string | null {
  for (const id of joinOrder) {
    if (liveConnIds.has(id) && slots?.some((s) => s.connId === id && s.kind === "human")) {
      return id;
    }
  }
  return null;
}

/**
 * Highest host-capability score among live humans. Ties keep the earliest joinOrder
 * entry (stable; first joiner wins when scores match).
 *
 * @param joinOrder Connection ids in join order, oldest first.
 * @param liveConnIds Currently-connected connection ids.
 * @param slots Current slot table, or null before room init.
 * @param scores connId → 0–100 host capability (missing → DEFAULT_HOST_SCORE).
 */
export function pickPreferredHostId(
  joinOrder: readonly string[],
  liveConnIds: ReadonlySet<string>,
  slots: readonly MinimalSlot[] | null,
  scores: ReadonlyMap<string, number>,
): string | null {
  let bestId: string | null = null;
  let bestScore = -1;
  for (const id of joinOrder) {
    if (!liveConnIds.has(id)) continue;
    if (!slots?.some((s) => s.connId === id && s.kind === "human")) continue;
    const score = scores.has(id) ? (scores.get(id) as number) : DEFAULT_HOST_SCORE;
    if (score > bestScore) {
      bestScore = score;
      bestId = id;
    }
  }
  return bestId;
}

/**
 * Whether lobby should migrate host from currentHostId to preferredId.
 * Requires a seated preferred human and a clear score margin (not "strong hosts only").
 *
 * @param currentHostId Current host conn id (may be null).
 * @param preferredId Best-scoring live human (from pickPreferredHostId).
 * @param scores connId → score map.
 * @param margin Minimum preferred − current gap (default HOST_SCORE_MIGRATE_MARGIN).
 */
export function shouldMigrateToPreferredHost(
  currentHostId: string | null,
  preferredId: string | null,
  scores: ReadonlyMap<string, number>,
  margin: number = HOST_SCORE_MIGRATE_MARGIN,
): boolean {
  if (!preferredId) return false;
  if (preferredId === currentHostId) return false;
  // * No current host → any preferred human should take it (seat-time repair).
  if (currentHostId === null) return true;
  const cur = scores.has(currentHostId)
    ? (scores.get(currentHostId) as number)
    : DEFAULT_HOST_SCORE;
  const pref = scores.has(preferredId)
    ? (scores.get(preferredId) as number)
    : DEFAULT_HOST_SCORE;
  const m = Number.isFinite(margin) ? margin : HOST_SCORE_MIGRATE_MARGIN;
  return pref >= cur + m;
}
