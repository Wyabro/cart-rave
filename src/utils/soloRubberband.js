/**
 * soloRubberband.js — pure solo-mode AI difficulty curve.
 *
 * Multiplayer is untouched (caller gates on solo). When the local human is
 * stomping, NPCs hunt harder; when the human is getting crushed, they ease off
 * slightly so matches stay fun without becoming free wins.
 */

/**
 * @typedef {object} SoloRubberbandConfig
 * @property {number} [trailBy] Score deficit that starts "ease up" (human behind by N).
 * @property {number} [leadBy] Score lead that starts "hunt harder".
 * @property {number} [trailChaseMul] Multiplier on human-chase weight when trailing.
 * @property {number} [leadChaseMul] Multiplier on human-chase weight when leading.
 * @property {number} [trailDistanceMul] Scale on human effective distance² when trailing (>1 = less chase).
 * @property {number} [leadDistanceMul] Scale on human effective distance² when leading (<1 = more chase).
 * @property {number} [trailNitroMul] Multiplier on NPC nitro commit when targeting human (trailing).
 * @property {number} [leadNitroMul] Multiplier on NPC nitro commit when targeting human (leading).
 * @property {number} [trailAimSlackDeg] Extra alignment degrees when trailing (positive = looser = fewer clean boosts).
 * @property {number} [leadAimSlackDeg] Extra alignment degrees when leading (negative = tighter).
 */

/**
 * @typedef {object} SoloRubberbandFactors
 * @property {number} humanLead humanScore − bestNpcScore (positive = human winning)
 * @property {"trail" | "lead" | "even"} band
 * @property {number} chaseMul
 * @property {number} distanceMul
 * @property {number} nitroMul
 * @property {number} aimSlackDeg
 */

/** @type {SoloRubberbandFactors} */
export const SOLO_RUBBERBAND_NEUTRAL = Object.freeze({
  humanLead: 0,
  band: "even",
  chaseMul: 1,
  distanceMul: 1,
  nitroMul: 1,
  aimSlackDeg: 0,
});

/**
 * Best NPC score among slots marked kind === "npc".
 * @param {Record<number|string, number> | null | undefined} scores
 * @param {Array<{ kind?: string } | null | undefined> | null | undefined} netSlots
 * @returns {number}
 */
export function bestNpcScore(scores, netSlots) {
  let best = 0;
  const n = netSlots?.length ?? 0;
  for (let i = 0; i < n; i += 1) {
    if (netSlots[i]?.kind !== "npc") continue;
    best = Math.max(best, Number(scores?.[i] || 0));
  }
  return best;
}

/**
 * First human slot score (solo has exactly one human).
 * @param {Record<number|string, number> | null | undefined} scores
 * @param {Array<{ kind?: string, connId?: string | null } | null | undefined> | null | undefined} netSlots
 * @returns {{ slotIndex: number, score: number } | null}
 */
export function firstHumanScore(scores, netSlots) {
  const n = netSlots?.length ?? 0;
  for (let i = 0; i < n; i += 1) {
    const s = netSlots[i];
    if (s?.kind === "human" && s.connId) {
      return { slotIndex: i, score: Number(scores?.[i] || 0) };
    }
  }
  return null;
}

/**
 * Computes solo rubberband factors from live scores.
 * @param {Record<number|string, number> | null | undefined} scores
 * @param {Array<object> | null | undefined} netSlots
 * @param {SoloRubberbandConfig | null | undefined} [cfg]
 * @returns {SoloRubberbandFactors}
 */
export function computeSoloRubberband(scores, netSlots, cfg) {
  const human = firstHumanScore(scores, netSlots);
  if (!human) return SOLO_RUBBERBAND_NEUTRAL;

  const npcBest = bestNpcScore(scores, netSlots);
  const humanLead = human.score - npcBest;

  const trailBy = cfg?.trailBy ?? 2;
  const leadBy = cfg?.leadBy ?? 3;

  if (humanLead <= -trailBy) {
    return {
      humanLead,
      band: "trail",
      chaseMul: cfg?.trailChaseMul ?? 0.72,
      distanceMul: cfg?.trailDistanceMul ?? 1.28,
      nitroMul: cfg?.trailNitroMul ?? 0.55,
      aimSlackDeg: cfg?.trailAimSlackDeg ?? 10,
    };
  }

  if (humanLead >= leadBy) {
    return {
      humanLead,
      band: "lead",
      chaseMul: cfg?.leadChaseMul ?? 1.22,
      distanceMul: cfg?.leadDistanceMul ?? 0.72,
      nitroMul: cfg?.leadNitroMul ?? 1.28,
      aimSlackDeg: cfg?.leadAimSlackDeg ?? -6,
    };
  }

  return {
    humanLead,
    band: "even",
    chaseMul: 1,
    distanceMul: 1,
    nitroMul: 1,
    aimSlackDeg: 0,
  };
}

/**
 * @typedef {object} NpcBoostFinisherCfg
 * @property {number} [finisherEdgeBiasMin]
 * @property {number} [finisherCommitBonus]
 * @property {number} [safeCenterCommitMul]
 * @property {number} [safeCenterMinDist]
 */

/**
 * @typedef {object} NpcHumanBoostCommitResult
 * @property {number} commit 0..1 probability of firing boost this frame (0 = hard deny)
 * @property {boolean} finisher target near death edge and bot is a safe pusher
 * @property {boolean} safeCenter mid-arena thrift applied
 * @property {boolean} botLipDeny bot already on a death edge — no full-send
 */

/**
 * AI-DAY-1 lever 3 + SELFKO-1: pure solo NPC→human boost commit gate.
 * Multiplayer always commits on humans (legacy) — only call from the solo branch.
 * Frequency only; does not change instant boost / duration / max speed (NPC-BOOST-1 carve-out).
 *
 * SELFKO-1: hard-deny when the bot is already on a lip; finisher bonus only when the
 * human is on a lip and the bot is not (pusher geometry — fewer boost suicides).
 *
 * @param {object} args
 * @param {number} args.nitroMul solo rubberband nitroMul
 * @param {number} args.edgeBias 0..1 target (human) edge bias
 * @param {number} [args.botEdgeBias] 0..1 bot edge bias (0 if omitted = assume safe)
 * @param {number} args.dist meters to human
 * @param {string | null | undefined} args.difficulty
 * @param {NpcBoostFinisherCfg | null | undefined} [args.cfg]
 * @returns {NpcHumanBoostCommitResult}
 */
export function resolveNpcHumanBoostCommit({
  nitroMul,
  edgeBias,
  botEdgeBias = 0,
  dist,
  difficulty,
  cfg,
}) {
  const finisherMin = cfg?.finisherEdgeBiasMin ?? 0.35;
  const finisherBonus = cfg?.finisherCommitBonus ?? 0.25;
  const safeMul = cfg?.safeCenterCommitMul ?? 0.72;
  const safeDist = cfg?.safeCenterMinDist ?? 8.0;

  const targetBias = Math.max(0, Math.min(1, Number(edgeBias) || 0));
  const botBias = Math.max(0, Math.min(1, Number(botEdgeBias) || 0));
  const d = Number(dist) || 0;
  const nm = Number(nitroMul);
  const nitro = Number.isFinite(nm) ? nm : 1;

  // * SELFKO-1: never full-send while the bot is already on a death edge.
  if (botBias >= finisherMin) {
    return {
      commit: 0,
      finisher: false,
      safeCenter: false,
      botLipDeny: true,
    };
  }

  // * Match prior solo gate: lead/even full commit base; trail throttles.
  let baseCommit = nitro >= 1 ? 1 : Math.max(0.05, Math.min(1, nitro));

  // * Finisher only when human is on a lip AND bot is safer (not on lip) — pusher, not peer-suicide.
  const finisher = targetBias >= finisherMin && botBias < finisherMin;
  // * Pre-clamp bonus so trail+finisher can still rise (lead stays 1 after min).
  if (finisher) {
    baseCommit = Math.min(1, baseCommit + finisherBonus);
  }

  const diff = typeof difficulty === "string" ? difficulty.trim().toLowerCase() : "medium";
  // * Easy: no mid-arena thrift.
  const safeCenter =
    !finisher
    && d > safeDist
    && diff !== "easy";

  if (safeCenter) {
    baseCommit *= safeMul;
  }

  const commit = Math.max(0.05, Math.min(1, baseCommit));
  return { commit, finisher, safeCenter, botLipDeny: false };
}
