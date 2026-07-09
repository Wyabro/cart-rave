// koReactors.js — the KO Event fan-out. dispatchKOEvent runs each presentation reactor with a
// finalized KO Event; every reactor is a pure consumer that reads event fields and pokes one
// subsystem (see docs/scoring-event-system.md). No reactor mutates score/physics — Score stays
// at the call site until a later migration step.
//
// Leaf module by design: all app wiring arrives via the ctx object (no direct imports), so the
// fan-out stays unit-testable and reusable from both the host (gameFlow) and non-host (netcode)
// paths once the wire shape is unified.

/**
 * @typedef {object} KOReactorCtx
 * @property {Array<object>} netSlots Slot table (name/kind/color) indexed by slot.
 * @property {number} localSlotIndex Local player's slot this frame.
 * @property {object | null | undefined} hud HUD facade (addKillFeedEntry, colorHexToCss).
 * @property {(slot: object | null | undefined) => number | string} colorHexForSlot Resolves a slot
 *   color (host returns a hex number; the client facade may return a css string — colorHexToCss handles both).
 * @property {(fall: { victimSlotIndex: number, attackerSlotIndex: number | null, comboTier: number }) => void} [onAnnouncerFall]
 * @property {(victimSlotIndex: number, comboTier: number) => void} [onLocalKillConfirm]
 * @property {(koEvent: import('./koEvent.js').KOEvent) => void} [onArenaKoFlash] Arena light flash for any fall.
 * @property {(eventId: string, amount?: number) => void} [recordChallenge] Bumps a local challenge counter.
 * @property {() => string | null | undefined} [getLevelId] Current arena id for level-unlock KO tracking.
 * @property {(levelId: string, amount?: number) => void} [recordKillOnLevel] Lifetime KOs per level.
 */

/**
 * @param {KOReactorCtx} ctx
 * @param {object | null | undefined} slot
 * @returns {string | null}
 */
function colorForSlot(ctx, slot) {
  return ctx.hud?.colorHexToCss ? ctx.hud.colorHexToCss(ctx.colorHexForSlot(slot)) : null;
}

/**
 * Local kill-confirm feedback (VFX/combo pulse) — fires only when the LOCAL player scored the KO.
 * @param {import('./koEvent.js').KOEvent} koEvent
 * @param {KOReactorCtx} ctx
 */
export function localKillConfirmReactor(koEvent, ctx) {
  if (koEvent.isKill && koEvent.attackerSlotIndex === ctx.localSlotIndex) {
    ctx.onLocalKillConfirm?.(koEvent.victimSlotIndex, koEvent.comboTier ?? 0);
  }
}

/**
 * Renders one kill-feed row. Attributed kills show attacker + combo badge; self/environmental
 * falls (null attacker) show the event's verb with no actor. The verb is the KO Event's single
 * source of truth, so host and every client render the same word.
 * @param {import('./koEvent.js').KOEvent} koEvent
 * @param {KOReactorCtx} ctx
 */
export function killFeedReactor(koEvent, ctx) {
  if (!ctx.hud?.addKillFeedEntry) return;
  const victimSlot = ctx.netSlots[koEvent.victimSlotIndex];
  const targetName = victimSlot?.name || `P${koEvent.victimSlotIndex + 1}`;
  const targetColor = colorForSlot(ctx, victimSlot);

  if (koEvent.attackerSlotIndex != null) {
    const attackerSlot = ctx.netSlots[koEvent.attackerSlotIndex];
    const actorName = attackerSlot?.name || `P${koEvent.attackerSlotIndex + 1}`;
    const actorColor = colorForSlot(ctx, attackerSlot);
    ctx.hud.addKillFeedEntry(
      actorName, actorColor, koEvent.verb, targetName, targetColor,
      koEvent.comboTier, koEvent.comboMultiplier,
    );
  } else {
    ctx.hud.addKillFeedEntry(null, null, koEvent.verb || "FELL OFF", targetName, targetColor);
  }
}

/**
 * Feeds the announcer director (a pure observer that derives first_spill / refund / rampage…).
 * @param {import('./koEvent.js').KOEvent} koEvent
 * @param {KOReactorCtx} ctx
 */
export function announcerReactor(koEvent, ctx) {
  ctx.onAnnouncerFall?.({
    victimSlotIndex: koEvent.victimSlotIndex,
    attackerSlotIndex: koEvent.attackerSlotIndex,
    comboTier: koEvent.comboTier ?? 0,
  });
}

/**
 * Arena lighting spectacle — spindle/spots/lasers flash on every KO (all peers).
 * @param {import('./koEvent.js').KOEvent} koEvent
 * @param {KOReactorCtx} ctx
 */
export function arenaVfxReactor(koEvent, ctx) {
  ctx.onArenaKoFlash?.(koEvent);
}

/**
 * Progresses local challenge counters for the LOCAL player's kills. Reads the KO Event's victim
 * classification rather than re-scanning slots/carts. Only the machine whose player scored the KO
 * records — so a device counts its own kills once (host-only today; every client once the replay
 * path dispatches too).
 * @param {import('./koEvent.js').KOEvent} koEvent
 * @param {KOReactorCtx} ctx
 */
export function challengeReactor(koEvent, ctx) {
  if (!koEvent.isKill || koEvent.attackerSlotIndex !== ctx.localSlotIndex) return;
  ctx.recordChallenge?.("ko_void");
  if (koEvent.victimKind === "npc") ctx.recordChallenge?.("ko_npc");
  if (koEvent.victimAiName === "aggressor") ctx.recordChallenge?.("ko_aggressor");
  // * Level-gated unlocks: lifetime KOs credited on the arena where the kill happened.
  if (typeof ctx.recordKillOnLevel === "function") {
    const levelId = ctx.getLevelId?.() || null;
    if (levelId) ctx.recordKillOnLevel(levelId);
  }
}

/** Default host-side reactor order: challenges → local confirm → arena VFX → kill feed → announcer. */
export const DEFAULT_KO_REACTORS = [
  challengeReactor,
  localKillConfirmReactor,
  arenaVfxReactor,
  killFeedReactor,
  announcerReactor,
];

/**
 * Fans a finalized KO Event out to each reactor in order.
 * @param {import('./koEvent.js').KOEvent} koEvent
 * @param {KOReactorCtx} ctx
 * @param {Array<(koEvent: object, ctx: KOReactorCtx) => void>} [reactors]
 */
export function dispatchKOEvent(koEvent, ctx, reactors = DEFAULT_KO_REACTORS) {
  for (const reactor of reactors) reactor(koEvent, ctx);
}
