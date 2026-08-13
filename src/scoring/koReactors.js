// koReactors.js — the KO Event fan-out. dispatchKOEvent runs each presentation reactor with a
// finalized KO Event; every reactor is a pure consumer that reads event fields and pokes one
// subsystem (see docs/scoring-event-system.md). No reactor mutates score/physics — Score stays
// at the call site until a later migration step.
//
// Leaf module by design: most app wiring arrives via the ctx object (no direct imports), so the
// fan-out stays unit-testable and reusable from both the host (gameFlow) and non-host (netcode)
// paths once the wire shape is unified. Match stats are the exception — a pure counter module.

import { recordKoForMatchStats } from "./matchStats.js";
import { recordDiagEvent } from "../utils/diagnostics.js";
import { PROGRESSION_EVENTS } from "../progression/eventIds.js";

/**
 * @typedef {object} KOReactorCtx
 * @property {Array<object>} netSlots Slot table (name/kind/color) indexed by slot.
 * @property {number} localSlotIndex Local player's slot this frame.
 * @property {object | null | undefined} hud HUD facade (addKillFeedEntry, colorHexToCss).
 * @property {(slot: object | null | undefined) => number | string} colorHexForSlot Resolves a slot
 *   color (host returns a hex number; the client facade may return a css string — colorHexToCss handles both).
 * @property {(fall: { victimSlotIndex: number, attackerSlotIndex: number | null, comboTier: number, wasCritical?: boolean, victimWasLeader?: boolean }) => void} [onAnnouncerFall]
 * @property {(victimSlotIndex: number, comboTier: number, koEvent?: import('./koEvent.js').KOEvent) => void} [onLocalKillConfirm]
 * @property {(koEvent: import('./koEvent.js').KOEvent) => void} [onLocalDoomed] Local-victim KO feedback.
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
    // * Full event rides along so the confirm can show the reward breakdown float.
    ctx.onLocalKillConfirm?.(koEvent.victimSlotIndex, koEvent.comboTier ?? 0, koEvent);
  }
}

/**
 * Local-victim KO feedback — fires for every finalized KO that eliminates the local player,
 * including self and environmental falls. Presentation only.
 * @param {import('./koEvent.js').KOEvent} koEvent
 * @param {KOReactorCtx} ctx
 */
export function localDoomedReactor(koEvent, ctx) {
  if (koEvent.victimSlotIndex === ctx.localSlotIndex) {
    ctx.onLocalDoomed?.(koEvent);
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
  // * Slot identity marks ride the feed for human slots only (NPCs carry their
  // * personality emblem in the nameplate, so no shape needed here).
  const victimSlotIndex = victimSlot?.kind === "human" ? koEvent.victimSlotIndex : null;

  // * Cartoon dizzy-stars dip on the victim's score chip (every client).
  ctx.hud.noteChipKO?.(koEvent.victimSlotIndex);

  if (koEvent.attackerSlotIndex != null) {
    const attackerSlot = ctx.netSlots[koEvent.attackerSlotIndex];
    const actorName = attackerSlot?.name || `P${koEvent.attackerSlotIndex + 1}`;
    const actorColor = colorForSlot(ctx, attackerSlot);
    const actorSlotIndex = attackerSlot?.kind === "human" ? koEvent.attackerSlotIndex : null;
    ctx.hud.addKillFeedEntry(
      actorName, actorColor, koEvent.verb, targetName, targetColor,
      koEvent.comboTier, koEvent.comboMultiplier,
      actorSlotIndex, victimSlotIndex,
    );
  } else {
    ctx.hud.addKillFeedEntry(null, null, koEvent.verb || "FELL OFF", targetName, targetColor,
      0, 1, null, victimSlotIndex);
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
    wasCritical: Boolean(koEvent.wasCritical),
    victimWasLeader: Boolean(koEvent.victimWasLeader),
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
  ctx.recordChallenge?.(PROGRESSION_EVENTS.KO_VOID);
  if (koEvent.victimKind === "npc") ctx.recordChallenge?.(PROGRESSION_EVENTS.KO_NPC);
  if (koEvent.victimAiName === "aggressor") {
    ctx.recordChallenge?.(PROGRESSION_EVENTS.KO_AGGRESSOR);
  }
  // * Level-gated unlocks: lifetime KOs credited on the arena where the kill happened.
  if (typeof ctx.recordKillOnLevel === "function") {
    const levelId = ctx.getLevelId?.() || null;
    if (levelId) ctx.recordKillOnLevel(levelId);
  }
}

/**
 * Per-match stat accumulator (kos/deaths/combo) for results superlatives + future goals.
 * Runs on host and non-host for every KO event (one count per dispatch).
 * @param {import('./koEvent.js').KOEvent} koEvent
 * @param {KOReactorCtx} ctx
 */
export function matchStatsReactor(koEvent, ctx) {
  recordKoForMatchStats(koEvent, ctx.localSlotIndex);
}

/**
 * Diagnostics observer — records the finalized KO into the __ccDiag event log (channel "ko")
 * with attribution, so an automated rig can assert "cart A KO'd cart B" without scraping the
 * kill feed. Pure no-op unless ?diag installed the hub (see utils/diagnostics.js).
 * @param {import('./koEvent.js').KOEvent} koEvent
 * @param {KOReactorCtx} _ctx
 */
export function diagnosticsReactor(koEvent, _ctx) {
  recordDiagEvent("ko", koEvent.isKill ? "kill" : "fall", {
    victim: koEvent.victimSlotIndex,
    attacker: koEvent.attackerSlotIndex ?? null,
    verb: koEvent.verb ?? null,
    comboTier: koEvent.comboTier ?? 0,
    critical: Boolean(koEvent.wasCritical),
    victimKind: koEvent.victimKind ?? null,
    // * Fall location (XZ, decimeter precision) — lets soak rigs classify center-hole
    // * vs outer-rim self-falls without positional polling (bot-suicide triage 2026-07-16).
    fx: koEvent.fallX ?? null,
    fz: koEvent.fallZ ?? null,
  });
}

/** Default KO reactor order: match stats → challenges → attacker confirm → victim feedback → arena VFX → feed → PA → diag. */
export const DEFAULT_KO_REACTORS = [
  matchStatsReactor,
  challengeReactor,
  localKillConfirmReactor,
  localDoomedReactor,
  arenaVfxReactor,
  killFeedReactor,
  announcerReactor,
  diagnosticsReactor,
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
