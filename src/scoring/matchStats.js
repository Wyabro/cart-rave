/**
 * matchStats.js — per-match counters for KO/death/combo spine.
 *
 * Single accumulator so superlatives, challenge expansion, and future cart-variant
 * goals don't grow ad-hoc counters in gameFlow/hud. Reset at countdown start.
 * Host + non-host both record via dispatchKOEvent (same falls path).
 */

/**
 * @typedef {object} MatchStats
 * @property {number} kos
 * @property {number} deaths
 * @property {number} localKos
 * @property {number} localDeaths
 * @property {number} maxComboTier
 * @property {number} criticalKos
 * @property {number} leaderDowns
 * @property {number[]} kosBySlot length 4
 * @property {number[]} deathsBySlot length 4
 */

/** @returns {MatchStats} */
function emptyStats() {
  return {
    kos: 0,
    deaths: 0,
    localKos: 0,
    localDeaths: 0,
    maxComboTier: 0,
    criticalKos: 0,
    leaderDowns: 0,
    kosBySlot: [0, 0, 0, 0],
    deathsBySlot: [0, 0, 0, 0],
  };
}

/** @type {MatchStats} */
let stats = emptyStats();

/** Slot watched for local stats (-1 = none). */
let localSlotIndex = -1;

/**
 * Clears all counters for a new round.
 * @returns {void}
 */
export function resetMatchStats() {
  stats = emptyStats();
}

/**
 * Sets which slot is the local human for localKos/localDeaths.
 * @param {number} slotIndex
 * @returns {void}
 */
export function setMatchStatsLocalSlot(slotIndex) {
  localSlotIndex = Number.isFinite(slotIndex) ? slotIndex : -1;
}

/**
 * @returns {Readonly<MatchStats>}
 */
export function getMatchStats() {
  return stats;
}

/**
 * Snapshot clone for results/UI (safe to retain after reset).
 * @returns {MatchStats}
 */
export function snapshotMatchStats() {
  return {
    kos: stats.kos,
    deaths: stats.deaths,
    localKos: stats.localKos,
    localDeaths: stats.localDeaths,
    maxComboTier: stats.maxComboTier,
    criticalKos: stats.criticalKos,
    leaderDowns: stats.leaderDowns,
    kosBySlot: stats.kosBySlot.slice(),
    deathsBySlot: stats.deathsBySlot.slice(),
  };
}

/**
 * Records a KO event into the match accumulator.
 * @param {import("./koEvent.js").KOEvent} koEvent
 * @param {number} [localSlot] Optional override for local slot (defaults to setMatchStatsLocalSlot).
 * @returns {void}
 */
export function recordKoForMatchStats(koEvent, localSlot = localSlotIndex) {
  if (!koEvent) return;
  const victim = koEvent.victimSlotIndex;
  if (Number.isFinite(victim) && victim >= 0 && victim < 4) {
    stats.deaths += 1;
    stats.deathsBySlot[victim] += 1;
    if (victim === localSlot) stats.localDeaths += 1;
  }

  if (!koEvent.isKill) return;

  const attacker = koEvent.attackerSlotIndex;
  if (attacker != null && Number.isFinite(attacker) && attacker >= 0 && attacker < 4) {
    stats.kos += 1;
    stats.kosBySlot[attacker] += 1;
    if (attacker === localSlot) {
      stats.localKos += 1;
      // * Combo / critical / leader-down chips on results are framed as *your* story
      // * (next to YOUR STATS). Counting every peer/NPC kill made non-host podium
      // * chips show RAMPAGE/CRITICALS the local player never earned (NH-STATS).
      const tier = Number(koEvent.comboTier) || 0;
      if (tier > stats.maxComboTier) stats.maxComboTier = tier;
      if (koEvent.wasCritical) stats.criticalKos += 1;
      if (koEvent.victimWasLeader) stats.leaderDowns += 1;
    }
  }
}

/**
 * Local-player-facing superlative lines for the results screen (1–3 items).
 * @param {MatchStats} [s]
 * @returns {string[]}
 */
export function matchSuperlatives(s = stats) {
  /** @type {string[]} */
  const lines = [];
  if (s.localKos > 0) {
    // * "ROUND", not "MATCH" — rounds are the only scored unit (style guide §2/§8).
    lines.push(s.localKos === 1 ? "1 KO THIS ROUND" : `${s.localKos} KOS THIS ROUND`);
  }
  if (s.maxComboTier >= 2) {
    const label = s.maxComboTier >= 3 ? "CARNAGE" : "RAMPAGE";
    lines.push(`BEST COMBO · ${label}`);
  }
  if (s.criticalKos > 0) {
    lines.push(s.criticalKos === 1 ? "1 CRITICAL HIT" : `${s.criticalKos} CRITICAL HITS`);
  }
  if (s.leaderDowns > 0 && lines.length < 3) {
    lines.push(s.leaderDowns === 1 ? "1 LEADER DOWN" : `${s.leaderDowns} LEADER DOWNS`);
  }
  if (s.localDeaths > 0 && lines.length < 3 && s.localKos === 0) {
    lines.push(s.localDeaths === 1 ? "1 SPILL" : `${s.localDeaths} SPILLS`);
  }
  return lines.slice(0, 3);
}
