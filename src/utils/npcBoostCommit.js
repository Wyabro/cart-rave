/**
 * npcBoostCommit.js — pure solo NPC→human boost commit gate (AI-DAY-1 lever 3).
 *
 * Multiplayer always commits on human targets (legacy) — this module is only
 * called inside the solo branch of maybeTriggerNpcOpportunisticRamBoost.
 * Does not change instant boost, duration, or max speed (NPC-BOOST-1 carve-out:
 * frequency only).
 */

/** @typedef {"easy" | "medium" | "hard"} AiDifficulty */

/**
 * @typedef {object} NpcBoostFinisherCfg
 * @property {number} [finisherEdgeBiasMin]
 * @property {number} [finisherCommitBonus]
 * @property {number} [safeCenterCommitMul]
 * @property {number} [safeCenterMinDist]
 */

/**
 * @typedef {object} NpcHumanBoostCommitResult
 * @property {number} commit 0..1 probability of firing boost this frame
 * @property {boolean} finisher target near death edge
 * @property {boolean} safeCenter mid-arena thrift applied
 */

/**
 * Resolve solo human boost commit chance from rubberband nitro + edge geometry.
 *
 * @param {object} args
 * @param {number} args.nitroMul solo rubberband nitroMul (trail &lt; 1, lead ≥ 1)
 * @param {number} args.edgeBias 0..1 from Simulation.getEdgeVictimBias
 * @param {number} args.dist meters to human
 * @param {AiDifficulty | string | null | undefined} args.difficulty
 * @param {NpcBoostFinisherCfg | null | undefined} [args.cfg]
 * @returns {NpcHumanBoostCommitResult}
 */
export function resolveNpcHumanBoostCommit({
  nitroMul,
  edgeBias,
  dist,
  difficulty,
  cfg,
}) {
  const finisherMin = cfg?.finisherEdgeBiasMin ?? 0.35;
  const finisherBonus = cfg?.finisherCommitBonus ?? 0.25;
  const safeMul = cfg?.safeCenterCommitMul ?? 0.72;
  const safeDist = cfg?.safeCenterMinDist ?? 8.0;

  const bias = Math.max(0, Math.min(1, Number(edgeBias) || 0));
  const d = Number(dist) || 0;
  const nm = Number(nitroMul);
  const nitro = Number.isFinite(nm) ? nm : 1;

  // * Match prior solo gate: lead/even full commit base; trail throttles.
  let baseCommit = nitro >= 1 ? 1 : Math.max(0.05, Math.min(1, nitro));

  const finisher = bias >= finisherMin;
  // * Pre-clamp bonus so trail+finisher can still rise (lead stays 1 after min).
  if (finisher) {
    baseCommit = Math.min(1, baseCommit + finisherBonus);
  }

  const diff = typeof difficulty === "string" ? difficulty.trim().toLowerCase() : "medium";
  // * Easy: no mid-arena thrift (stay flaky via other systems, not this gate).
  const safeCenter =
    !finisher
    && d > safeDist
    && diff !== "easy";

  if (safeCenter) {
    baseCommit *= safeMul;
  }

  const commit = Math.max(0.05, Math.min(1, baseCommit));
  return { commit, finisher, safeCenter };
}
