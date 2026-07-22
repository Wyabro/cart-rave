// Pure slot-table decisions extracted from CartRaveServer: orphan humans,
// which NPC seat a joiner takes, and the next free palette color after a
// human→NPC conversion. The DO still mutates slots, draws NPC names, and
// zeros mid-round scores.
//
// Invariants:
// - Orphan = kind human with a connId not in the live connection set.
// - Seat preference: NPC holding preferredColor, else any NPC.
// - Converted NPC color = first palette entry not used by other slots.

export type ConnId = string;

/** Minimal structural view — local unless another helper needs the same shape (see party/constants.ts). */
type MinimalSlot = {
  connId: string | null;
  kind: string;
  color: string;
};

/**
 * Human slot connIds whose connection is no longer live.
 *
 * @param slots Current slot table, or null before init.
 * @param liveConnIds Platform-live connection ids.
 */
export function listOrphanHumanConnIds(
  slots: readonly MinimalSlot[] | null,
  liveConnIds: ReadonlySet<ConnId>,
): ConnId[] {
  if (!slots) return [];
  const out: ConnId[] = [];
  for (const slot of slots) {
    if (slot.kind === 'human' && slot.connId && !liveConnIds.has(slot.connId)) {
      out.push(slot.connId);
    }
  }
  return out;
}

/**
 * Picks the NPC slot a joining human should claim.
 * Prefers the NPC holding `preferredColor`, else the first NPC.
 *
 * @returns The matching slot reference from `slots`, or undefined if none.
 */
export function findNpcSlotForHuman<T extends { kind: string; color: string }>(
  slots: readonly T[],
  preferredColor?: string,
): T | undefined {
  let npcSlot =
    preferredColor !== undefined
      ? slots.find((s) => s.kind === 'npc' && s.color === preferredColor)
      : undefined;
  if (!npcSlot) npcSlot = slots.find((s) => s.kind === 'npc');
  return npcSlot;
}

/**
 * Next palette color for a slot being converted human→NPC, avoiding collisions
 * with every other slot's color.
 *
 * @param slots Full slot table.
 * @param excludeSlot The slot being recolored (ignored in "used" set).
 * @param palette Ordered color names (e.g. pink/blue/…).
 */
export function nextFreePaletteColor(
  slots: readonly { color: string }[],
  excludeSlot: { color: string },
  palette: readonly string[],
): string {
  const usedColors = new Set(
    slots.filter((s) => s !== excludeSlot).map((s) => s.color),
  );
  return palette.find((c) => !usedColors.has(c)) ?? excludeSlot.color;
}
