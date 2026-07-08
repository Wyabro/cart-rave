// koEvent.js — the canonical KO Event: one structured record of a cart falling out of the
// arena, consumed by every downstream reactor (score, kill feed, announcer, challenges, VFX,
// stats). See docs/scoring-event-system.md. Points are one output (`reward.total`), not the
// whole story.
//
// Leaf module by design: no app-graph imports, so the scoring/event logic stays unit-testable
// in isolation (importing the full gameFlow graph pulls in THREE + a config↔utils init cycle).

/** Self-death verb used only when no hud verb-picker is wired (defensive; unused in-game). */
const SELF_DEATH_VERB_FALLBACK = "FELL OFF";

/**
 * The subset of GameFlowDeps that buildKOEvent reads. Kept minimal so the leaf module has no
 * dependency on the full gameFlow wiring.
 *
 * @typedef {object} KOEventDeps
 * @property {() => { startedAtMs: number, isSuddenDeath: boolean }} getRoundState
 * @property {() => Record<number, number>} getRoundScores
 * @property {() => Map<number, { attackerSlotIndex: number, wasCritical: boolean, impactSpeed: number, timestamp: number }>} getLastHitBy
 * @property {() => Array<object>} getAllCarts
 * @property {() => Array<object>} [getNetSlots]
 * @property {() => number} getLocalSlotIndex
 * @property {object} CONFIG
 * @property {object | null | undefined} [hud]
 * @property {(tier: number, expiryMs: number) => void} [setLocalCombo]
 */

/**
 * The canonical record of a cart falling out of the arena — the single structured event every
 * downstream reactor (score, kill feed, announcer, challenges, VFX, stats) consumes. Points are
 * one output (`reward.total`), not the whole story.
 *
 * @typedef {object} KOEvent
 * @property {number} victimSlotIndex Slot of the cart that fell.
 * @property {number | null} attackerSlotIndex Crediting attacker slot, or null for a
 *   self/environmental fall (no qualifying recent ram).
 * @property {boolean} isKill Convenience flag — true iff `attackerSlotIndex != null`.
 * @property {"center_hole" | "outer_edge" | "self" | "sudden_death"} cause How the KO happened.
 * @property {boolean} wasCritical Crediting ram counted as critical — a fast ram, i.e.
 *   `impactSpeed >= CONFIG.scoring.criticalVelocityThreshold` (decision D1, set at hit time).
 * @property {boolean} victimWasLeader Victim held the sole score lead at fall time (drives the
 *   leader reward and lets announcer/VFX react without re-scanning scores).
 * @property {string | null} victimKind Victim's slot kind ("human" | "npc"), or null if unknown.
 *   Derived per-machine (recomputed on clients); challenges/stats read it instead of re-scanning slots.
 * @property {string | null} victimAiName Victim's AI personality name (e.g. "aggressor"), or null
 *   for humans / unknown. Derived per-machine.
 * @property {number} impactSpeed Planar speed (m/s) of the crediting ram at contact; 0 for a
 *   self/environmental fall. Feeds the critical check and intensity-scaled VFX/stats.
 * @property {number} comboTier Attacker's combo streak tier at the kill (0–3).
 * @property {number} comboMultiplier Score multiplier implied by `comboTier`.
 * @property {boolean} isSuddenDeath Round was in Sudden Death when the KO landed.
 * @property {boolean} isFinalBlow This KO ended the round. Populated by the caller in a later
 *   step when a reactor consumes it; the factory always returns false.
 * @property {number} roundTimeMs Milliseconds elapsed since round start.
 * @property {{ base: number, critical: number, leader: number, multiplier: number, total: number }} reward
 *   Reward breakdown. `total` (= round((base+critical+leader)*multiplier)) is what Score adds.
 * @property {string} verb Kill-feed verb (host-picked so every client renders the same word).
 */

/**
 * Builds the KO Event for a cart that fell below the kill plane. Host-authoritative — call on
 * the machine that detects the fall. Pure aside from refreshing the attacker's combo-decay
 * timer (a side effect carried over from the old calculateFallScore; a later migration step
 * relocates it to the score reactor).
 *
 * @param {KOEventDeps} deps
 * @param {number} slotIndex Victim slot.
 * @param {{ x: number, y: number, z: number }} p Victim body translation at the fall.
 * @param {number} nowMs Date.now() — for the hit window and round-time math.
 * @returns {KOEvent}
 */
export function buildKOEvent(deps, slotIndex, p, nowMs) {
  const roundState = deps.getRoundState();
  const roundTimeMs = roundState.startedAtMs > 0 ? nowMs - roundState.startedAtMs : 0;
  const isSuddenDeath = Boolean(roundState.isSuddenDeath);

  // * Leader scan is read-only and independent of attribution, so a self-fall by the current
  // * leader still reports victimWasLeader. Sole leader only — a tie means no leader, matching
  // * the old target-bonus rule (leaderScore starts at 0, so a leader needs a positive score).
  const scores = deps.getRoundScores();
  let leaderSlotIndex = -1;
  let leaderScore = 0;
  let leaderTied = false;
  for (let i = 0; i < 4; i += 1) {
    const s = Number(scores[i] || 0);
    if (s > leaderScore) {
      leaderScore = s;
      leaderSlotIndex = i;
      leaderTied = false;
    } else if (s === leaderScore && s > 0) {
      leaderTied = true;
    }
  }
  const victimWasLeader = !leaderTied && leaderSlotIndex >= 0 && slotIndex === leaderSlotIndex;

  // * Victim classification — read-only, computed for every fall (self or kill) so challenge/stats
  // * reactors read plain event fields instead of re-scanning slots/carts. Kind comes from the
  // * slot table; the AI personality (if any) from the cart.
  const allCarts = deps.getAllCarts();
  const netSlots = deps.getNetSlots?.() ?? [];
  const victimKind = netSlots[slotIndex]?.kind ?? null;
  const victimAiName = allCarts?.[slotIndex]?.aiPersonality?.name ?? null;

  const hit = deps.getLastHitBy().get(slotIndex);
  const hitWindowMs = deps.CONFIG.scoring?.hitWindowMs ?? 2500;

  // * No qualifying recent ram — self/environmental fall: no attribution, no points.
  if (!hit || (nowMs - hit.timestamp > hitWindowMs)) {
    const verb = deps.hud?.pickSelfDeathVerb ? deps.hud.pickSelfDeathVerb() : SELF_DEATH_VERB_FALLBACK;
    return {
      victimSlotIndex: slotIndex,
      attackerSlotIndex: null,
      isKill: false,
      cause: "self",
      wasCritical: false,
      victimWasLeader,
      victimKind,
      victimAiName,
      impactSpeed: 0,
      comboTier: 0,
      comboMultiplier: 1.0,
      isSuddenDeath,
      isFinalBlow: false,
      roundTimeMs,
      reward: { base: 0, critical: 0, leader: 0, multiplier: 1.0, total: 0 },
      verb,
    };
  }

  const distOriginXZ = Math.hypot(p.x, p.z);
  const isCenterHole = distOriginXZ < deps.CONFIG.record.innerRadius + 2;

  const rewardBase = isCenterHole ? 2 : 1;
  const rewardCritical = hit.wasCritical ? 1 : 0;
  const rewardLeader = victimWasLeader ? 1 : 0;

  // * Combo multiplier comes from the attacker's current streak tier. CONFIG.combo.tiers is the
  // * single source of truth for tier → multiplier (tier 0 falls back to 1.0).
  const attackerCart = allCarts?.[hit.attackerSlotIndex];
  const comboTier = attackerCart?.comboTier || 0;
  const comboMultiplier = deps.CONFIG.combo?.tiers?.[comboTier]?.multiplier ?? 1.0;

  // * Refresh the attacker's combo-decay timer on a confirmed kill (side effect preserved from
  // * calculateFallScore; a later migration step moves this into the score reactor).
  if (attackerCart) {
    const decayMs = deps.CONFIG.combo?.decayMs ?? 5000;
    attackerCart.comboExpiryMs = performance.now() + decayMs;
    if (hit.attackerSlotIndex === deps.getLocalSlotIndex()) {
      deps.setLocalCombo?.(attackerCart.comboTier, attackerCart.comboExpiryMs);
    }
  }

  const rewardTotal = Math.round((rewardBase + rewardCritical + rewardLeader) * comboMultiplier);
  const verb = deps.hud?.pickKillFeedVerb ? deps.hud.pickKillFeedVerb(hit) : "RAMMED";

  return {
    victimSlotIndex: slotIndex,
    attackerSlotIndex: hit.attackerSlotIndex,
    isKill: true,
    cause: isCenterHole ? "center_hole" : "outer_edge",
    wasCritical: Boolean(hit.wasCritical),
    victimWasLeader,
    victimKind,
    victimAiName,
    impactSpeed: hit.impactSpeed ?? 0,
    comboTier,
    comboMultiplier,
    isSuddenDeath,
    isFinalBlow: false,
    roundTimeMs,
    reward: {
      base: rewardBase,
      critical: rewardCritical,
      leader: rewardLeader,
      multiplier: comboMultiplier,
      total: rewardTotal,
    },
    verb,
  };
}

/**
 * Reconstructs a KO Event on a non-host client from a wire fall record (the host snapshot's
 * falls[] tail). Non-hosts don't run buildKOEvent — they replay this so the *same* reactors
 * (kill feed, announcer, local kill-confirm, local challenges) fire identically to the host.
 *
 * Authoritative fields the host doesn't serialize (cause, wasCritical, victimWasLeader, reward,
 * round context) default to neutral values — no client reactor reads them today, and scores
 * arrive via the round sync, not `reward.total`. Derived fields (victim classification) are
 * recomputed from this client's own slot/cart state.
 *
 * @param {{ slotId?: number, victimSlotIndex?: number, attackerSlot?: number | null, attackerSlotIndex?: number | null, verb?: string, comboTier?: number, comboMultiplier?: number }} msg
 * @param {{ getNetSlots?: () => Array<object>, getAllCarts?: () => Array<object> }} deps
 * @returns {KOEvent}
 */
export function rebuildKOEvent(msg, deps) {
  const victimSlotIndex = typeof msg.slotId === "number"
    ? msg.slotId
    : (typeof msg.victimSlotIndex === "number" ? msg.victimSlotIndex : 0);
  const attackerSlotIndex = msg.attackerSlot ?? msg.attackerSlotIndex ?? null;
  const isKill = attackerSlotIndex != null;
  const comboMultiplier = msg.comboMultiplier ?? 1.0;

  const netSlots = deps.getNetSlots?.() ?? [];
  const allCarts = deps.getAllCarts?.() ?? [];

  return {
    victimSlotIndex,
    attackerSlotIndex,
    isKill,
    cause: isKill ? "outer_edge" : "self",
    wasCritical: false,
    victimWasLeader: false,
    victimKind: netSlots[victimSlotIndex]?.kind ?? null,
    victimAiName: allCarts?.[victimSlotIndex]?.aiPersonality?.name ?? null,
    impactSpeed: 0,
    comboTier: msg.comboTier ?? 0,
    comboMultiplier,
    isSuddenDeath: false,
    isFinalBlow: false,
    roundTimeMs: 0,
    reward: { base: 0, critical: 0, leader: 0, multiplier: comboMultiplier, total: 0 },
    verb: msg.verb || (isKill ? "RAMMED" : "FELL OFF"),
  };
}
