/**
 * aiDifficulty.js — Easy / Medium / Hard decision-quality tiers for NPC AI.
 *
 * Medium is the identity row (current post–cautious-fix baseline). Easy dials
 * down; Hard dials up. Personalities stay intact — mods scale how sharply each
 * executes. No physics / speed / scoring cheats.
 */

/** @typedef {"easy" | "medium" | "hard"} AiDifficulty */

/** @type {ReadonlyArray<AiDifficulty>} */
const DIFFICULTIES = Object.freeze(["easy", "medium", "hard"]);

export const DEFAULT_SOLO = /** @type {AiDifficulty} */ ("medium");
export const QUICKPLAY_FIXED = /** @type {AiDifficulty} */ ("medium");

/** Hard-tier steerGainMax ceiling — stops Chaotic Hard from sitting at 2.2. */
export const HARD_STEER_GAIN_MAX_CAP = 1.85;

/**
 * @typedef {object} DifficultyMods
 * @property {number} decisionIntervalMul
 * @property {number} randomStopMul
 * @property {number} humanWeightOffset
 * @property {number} humanWeightClamp
 * @property {number} npcRamCommitMul
 * @property {number} stuckWindowMs
 * @property {number} edgeSaveHopMul
 * @property {number} reachOuterNudge
 * @property {number} podiumContestMsMul
 * @property {number} hopAlignmentDotMin
 * @property {number} boostAlignmentAngleDegDelta
 * @property {number} trailChaseMul
 * @property {boolean} hardSteerTopHalf
 * @property {boolean} hardTactics
 */

/** @type {Readonly<Record<AiDifficulty, Readonly<DifficultyMods>>>} */
const DIFFICULTY_MODS = Object.freeze({
  // * Easy — ~15% softer than the first B1 pass (dial further down from Medium).
  easy: Object.freeze({
    decisionIntervalMul: 1.44,
    randomStopMul: 1.73,
    humanWeightOffset: -0.115,
    humanWeightClamp: 0.95,
    npcRamCommitMul: 0.65,
    stuckWindowMs: 1610,
    edgeSaveHopMul: 0.55,
    reachOuterNudge: -0.023,
    podiumContestMsMul: 1.0,
    hopAlignmentDotMin: 0.35,
    boostAlignmentAngleDegDelta: 0,
    trailChaseMul: 1.0,
    hardSteerTopHalf: false,
    hardTactics: false,
  }),
  // * Medium — identity (today's shipped AI feel).
  medium: Object.freeze({
    decisionIntervalMul: 1.0,
    randomStopMul: 1.0,
    humanWeightOffset: 0,
    humanWeightClamp: 0.95,
    npcRamCommitMul: 1.0,
    stuckWindowMs: 1100,
    edgeSaveHopMul: 1.0,
    reachOuterNudge: 0,
    podiumContestMsMul: 1.0,
    hopAlignmentDotMin: 0.35,
    boostAlignmentAngleDegDelta: 0,
    trailChaseMul: 1.0,
    hardSteerTopHalf: false,
    hardTactics: false,
  }),
  // * Hard — ~15% sharper than the first B1 pass + Hard-only tactics flag.
  hard: Object.freeze({
    decisionIntervalMul: 0.48,
    randomStopMul: 0,
    humanWeightOffset: 0.23,
    humanWeightClamp: 0.98,
    npcRamCommitMul: 1.84,
    stuckWindowMs: 565,
    edgeSaveHopMul: 2.53,
    reachOuterNudge: 0.023,
    podiumContestMsMul: 1.5,
    hopAlignmentDotMin: 0.22,
    boostAlignmentAngleDegDelta: -12,
    trailChaseMul: 0.78,
    hardSteerTopHalf: true,
    hardTactics: true,
  }),
});

/**
 * @param {unknown} id
 * @param {AiDifficulty} [fallback]
 * @returns {AiDifficulty}
 */
export function normalizeDifficulty(id, fallback = DEFAULT_SOLO) {
  if (typeof id === "string") {
    const key = id.trim().toLowerCase();
    if ((/** @type {readonly string[]} */ (DIFFICULTIES)).includes(key)) {
      return /** @type {AiDifficulty} */ (key);
    }
  }
  return fallback;
}

/**
 * Room difficulty for a play mode. Quickplay is always Medium and never writes store.
 * @param {"solo" | "friends" | "quickplay" | string | null | undefined} mode
 * @param {AiDifficulty | string | null | undefined} stored
 * @returns {AiDifficulty}
 */
export function resolveRoomDifficulty(mode, stored) {
  if (mode === "quickplay") return QUICKPLAY_FIXED;
  return normalizeDifficulty(stored, DEFAULT_SOLO);
}

/**
 * @param {AiDifficulty | string | null | undefined} difficulty
 * @returns {Readonly<DifficultyMods>}
 */
export function getDifficultyMods(difficulty) {
  const id = normalizeDifficulty(difficulty, "medium");
  return DIFFICULTY_MODS[id];
}

/**
 * @typedef {object} PersonalityProfile
 * @property {string} name
 * @property {number} humanWeight
 * @property {number} patrolWeight
 * @property {number} wanderWeight
 * @property {number} decisionIntervalMin
 * @property {number} decisionIntervalMax
 * @property {number} steerGainMin
 * @property {number} steerGainMax
 * @property {number} npcRamCommitChance
 */

/**
 * Apply difficulty multipliers to a personality profile (returns a new object).
 * Medium leaves numeric fields unchanged (identity).
 * @param {PersonalityProfile} profile
 * @param {AiDifficulty | string | null | undefined} difficulty
 * @returns {PersonalityProfile}
 */
export function applyPersonalityMods(profile, difficulty) {
  const mods = getDifficultyMods(difficulty);
  let humanWeight = profile.humanWeight + mods.humanWeightOffset;
  humanWeight = Math.max(0.35, Math.min(mods.humanWeightClamp, humanWeight));

  let decisionIntervalMin = profile.decisionIntervalMin * mods.decisionIntervalMul;
  let decisionIntervalMax = profile.decisionIntervalMax * mods.decisionIntervalMul;
  if (decisionIntervalMax < decisionIntervalMin) {
    decisionIntervalMax = decisionIntervalMin;
  }

  let steerGainMin = profile.steerGainMin;
  let steerGainMax = profile.steerGainMax;
  if (mods.hardSteerTopHalf) {
    const mid = (steerGainMin + steerGainMax) * 0.5;
    steerGainMin = mid;
    steerGainMax = Math.min(HARD_STEER_GAIN_MAX_CAP, steerGainMax);
    if (steerGainMin > steerGainMax) steerGainMin = steerGainMax;
  }

  const npcRamCommitChance = Math.max(
    0,
    Math.min(1, profile.npcRamCommitChance * mods.npcRamCommitMul),
  );

  // * Easy: nudge wander/patrol up slightly by shrinking human share already done via offset.
  // * Weights are used as relative rolls — no forced renormalize required.
  return {
    name: profile.name,
    humanWeight,
    patrolWeight: profile.patrolWeight,
    wanderWeight: profile.wanderWeight,
    decisionIntervalMin,
    decisionIntervalMax,
    steerGainMin,
    steerGainMax,
    npcRamCommitChance,
  };
}

/**
 * Base random-stop chances (Classic / Backrooms) scaled by difficulty.
 * Medium keeps 0.04 / 0.02.
 * @param {boolean} isBackrooms
 * @param {AiDifficulty | string | null | undefined} difficulty
 * @returns {number}
 */
export function getRandomStopChance(isBackrooms, difficulty) {
  const base = isBackrooms ? 0.02 : 0.04;
  return base * getDifficultyMods(difficulty).randomStopMul;
}

/**
 * @param {AiDifficulty | string | null | undefined} difficulty
 * @returns {number}
 */
export function getStuckWindowMs(difficulty) {
  return getDifficultyMods(difficulty).stuckWindowMs;
}

/**
 * @param {number} baseReachOuter
 * @param {AiDifficulty | string | null | undefined} difficulty
 * @returns {number}
 */
export function getReachOuter(baseReachOuter, difficulty) {
  return baseReachOuter + getDifficultyMods(difficulty).reachOuterNudge;
}

/**
 * @param {number} baseContestMs
 * @param {AiDifficulty | string | null | undefined} difficulty
 * @returns {number}
 */
export function getPodiumContestMs(baseContestMs, difficulty) {
  return baseContestMs * getDifficultyMods(difficulty).podiumContestMsMul;
}

/**
 * @param {number} baseEdgeSaveChance
 * @param {AiDifficulty | string | null | undefined} difficulty
 * @returns {number}
 */
export function getEdgeSaveHopChance(baseEdgeSaveChance, difficulty) {
  return Math.min(1, baseEdgeSaveChance * getDifficultyMods(difficulty).edgeSaveHopMul);
}

/**
 * @param {number} baseDotMin
 * @param {AiDifficulty | string | null | undefined} difficulty
 * @returns {number}
 */
export function getHopAlignmentDotMin(baseDotMin, difficulty) {
  const mods = getDifficultyMods(difficulty);
  // * Hard uses its own loosened gate; Easy/Medium keep the CONFIG base.
  if (mods.hardTactics) return mods.hopAlignmentDotMin;
  return baseDotMin;
}

/**
 * @param {number} baseAngleDeg
 * @param {AiDifficulty | string | null | undefined} difficulty
 * @returns {number}
 */
export function getBoostAlignmentAngleDeg(baseAngleDeg, difficulty) {
  return Math.max(5, baseAngleDeg + getDifficultyMods(difficulty).boostAlignmentAngleDegDelta);
}

/**
 * Solo rubberband trailChaseMul scale (Hard slightly less forgiving).
 * @param {number} base
 * @param {AiDifficulty | string | null | undefined} difficulty
 * @returns {number}
 */
export function getTrailChaseMul(base, difficulty) {
  return base * getDifficultyMods(difficulty).trailChaseMul;
}

/**
 * @param {AiDifficulty | string | null | undefined} difficulty
 * @returns {boolean}
 */
export function isHardTactics(difficulty) {
  return getDifficultyMods(difficulty).hardTactics;
}

/** Session-active difficulty the host AI brain reads (latched by netcode/main). */
let _activeAiDifficulty = /** @type {AiDifficulty} */ (DEFAULT_SOLO);

/**
 * Host/session latch for the AI brain. Mirrors room adopt; not a persistence write.
 * @param {AiDifficulty | string | null | undefined} difficulty
 */
export function setActiveAiDifficulty(difficulty) {
  _activeAiDifficulty = normalizeDifficulty(difficulty, DEFAULT_SOLO);
}

/** @returns {AiDifficulty} */
export function getActiveAiDifficulty() {
  return _activeAiDifficulty;
}
