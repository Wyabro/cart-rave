// Pure host-promotion logic extracted from the Durable Object (party/index.ts) so the
// "promote the oldest surviving human connection" rule is unit-testable without spinning
// up a Workers/PartyServer runtime. index.ts's #pickNextHostId delegates here.

/** Minimal structural view of a slot — avoids importing the DO's Slot type. */
type MinimalSlot = { connId: string | null; kind: string };

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
