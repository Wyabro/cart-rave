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
 * Score multiplier implied by an attacker's combo streak tier.
 * @param {number} tier
 * @returns {number}
 */
function getComboMultiplier(tier) {
  switch (tier) {
    case 1: return 1.5;
    case 2: return 2.0;
    case 3: return 3.0;
    default: return 1.0;
  }
}

/**
 * The subset of GameFlowDeps that buildKOEvent reads. Kept minimal so the leaf module has no
 * dependency on the full gameFlow wiring.
 *
 * @typedef {object} KOEventDeps
 * @property {() => { startedAtMs: number, isSuddenDeath: boolean }} getRoundState
 * @property {() => Record<number, number>} getRoundScores
 * @property {() => Map<number, { attackerSlotIndex: number, wasCritical: boolean, timestamp: number }>} getLastHitBy
 * @property {() => Array<object>} getAllCarts
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
 * @property {boolean} wasCritical Crediting ram counted as critical. NOTE: still the ram-boost
 *   window flag recorded at hit time — migration step 5 (decision D1) switches this to a
 *   velocity threshold once `impactSpeed` is captured.
 * @property {boolean} victimWasLeader Victim held the sole score lead at fall time (drives the
 *   leader reward and lets announcer/VFX react without re-scanning scores).
 * @property {number} impactSpeed m/s of the crediting ram. Not captured yet (decision D2) — 0.
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

  // * Combo multiplier comes from the attacker's current streak tier.
  const allCarts = deps.getAllCarts();
  const attackerCart = allCarts?.[hit.attackerSlotIndex];
  const comboTier = attackerCart?.comboTier || 0;
  const comboMultiplier = getComboMultiplier(comboTier);

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
    impactSpeed: 0,
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
