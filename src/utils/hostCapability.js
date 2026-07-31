/**
 * hostCapability.js — NH-HIT lever 3 / HOST-ROLE-1 host-quality score.
 *
 * Host-authoritative sim means a hitching host poisons every peer (snap gaps,
 * late rams). We do **not** ban weak machines from hosting alone; we score
 * each peer and (server-side, lobby only) migrate toward a clearly stronger
 * peer when one joins. Score is 0–100; missing reports default to 50
 * (neutral) so older clients don't thrash against each other.
 */

/** @typedef {"software" | "discrete" | "unknown"} GpuClass */
/** @typedef {"low" | "medium" | "high"} QualityTier */

/** Neutral default when a peer has not reported a score (legacy join). */
export const DEFAULT_HOST_SCORE = 50;

/**
 * Minimum score gap before lobby rebalance steals the host role.
 * ~20 ≈ discrete-high vs iGPU-medium without flapping near-ties.
 */
export const HOST_SCORE_MIGRATE_MARGIN = 20;

/**
 * Local weak-host warning threshold: toast when `score < WEAK_HOST_WARN_SCORE`.
 * Same numeric value as {@link DEFAULT_HOST_SCORE} so neutral/legacy (50) never
 * warns — only clearly below-average machines. Use strict `<`, never `<=`.
 * (Not `= DEFAULT_HOST_SCORE` export alias — knip flags that as a duplicate export.)
 */
export const WEAK_HOST_WARN_SCORE = 50;

/**
 * Whether a host-capability score is weak enough to warn the local host.
 * Neutral/default/legacy scores (`DEFAULT_HOST_SCORE`) return false.
 *
 * @param {number | null | undefined} score
 * @returns {boolean}
 */
export function isWeakHostScore(score) {
  if (typeof score !== "number" || !Number.isFinite(score)) return false;
  return score < WEAK_HOST_WARN_SCORE;
}

/**
 * Pure latch for the local weak-host toast (HOST-CAP-1).
 * Fire when local is host, score is weak, and this lobby/hostship episode has not
 * already shown the toast. No "stronger peer present" check — rebalance has its own toast.
 *
 * @param {{ isHost: boolean, hostScore: number | null | undefined, alreadyWarned: boolean }} args
 * @returns {boolean}
 */
export function shouldShowWeakHostWarning({ isHost, hostScore, alreadyWarned }) {
  if (!isHost || alreadyWarned) return false;
  return isWeakHostScore(hostScore);
}

/**
 * Pure host-capability score for a device snapshot.
 *
 * @param {{
 *   gpuClass?: GpuClass | null,
 *   qualityTier?: QualityTier | null,
 *   hardwareConcurrency?: number | null,
 *   deviceMemoryGb?: number | null,
 * }} caps
 * @returns {number} Integer 0–100
 */
export function scoreHostCapability(caps = {}) {
  const gpuClass = caps.gpuClass ?? "unknown";
  let score = 40;
  if (gpuClass === "software") score = 8;
  else if (gpuClass === "discrete") score = 75;
  else score = 40; // unknown / iGPU

  const tier = caps.qualityTier ?? "medium";
  if (tier === "high") score += 20;
  else if (tier === "medium") score += 10;
  // low: +0

  const cores = Number(caps.hardwareConcurrency);
  if (Number.isFinite(cores) && cores > 0) {
    score += Math.min(12, Math.floor(cores));
  }

  const mem = Number(caps.deviceMemoryGb);
  if (Number.isFinite(mem) && mem > 0) {
    if (mem <= 2) score += 0;
    else if (mem <= 4) score += 3;
    else if (mem <= 8) score += 6;
    else score += 8;
  }

  return clampHostScore(score);
}

/**
 * @param {unknown} raw
 * @returns {number} Integer 0–100 (DEFAULT_HOST_SCORE if unusable)
 */
export function clampHostScore(raw) {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return DEFAULT_HOST_SCORE;
  return Math.max(0, Math.min(100, Math.round(raw)));
}

/**
 * Whether preferred beats current by the migrate margin.
 * Missing scores use {@link DEFAULT_HOST_SCORE}.
 *
 * @param {number | null | undefined} currentScore
 * @param {number | null | undefined} preferredScore
 * @param {number} [margin=HOST_SCORE_MIGRATE_MARGIN]
 * @returns {boolean}
 */
export function shouldPreferHostScore(
  currentScore,
  preferredScore,
  margin = HOST_SCORE_MIGRATE_MARGIN,
) {
  const cur = clampHostScore(currentScore ?? DEFAULT_HOST_SCORE);
  const pref = clampHostScore(preferredScore ?? DEFAULT_HOST_SCORE);
  const m = typeof margin === "number" && Number.isFinite(margin) ? margin : HOST_SCORE_MIGRATE_MARGIN;
  return pref >= cur + m;
}

/**
 * Local browser snapshot → host capability score for MSG.join.
 * Safe under happy-dom / SSR (degrades to unknown / defaults).
 *
 * @param {{
 *   probeGpu?: () => { gpuClass?: GpuClass },
 *   getQualityTier?: () => QualityTier,
 *   navigatorLike?: { hardwareConcurrency?: number, deviceMemory?: number },
 * }} [deps]
 * @returns {number}
 */
export function computeLocalHostCapabilityScore(deps = {}) {
  let gpuClass = /** @type {GpuClass} */ ("unknown");
  try {
    if (typeof deps.probeGpu === "function") {
      gpuClass = deps.probeGpu()?.gpuClass ?? "unknown";
    }
  } catch {
    gpuClass = "unknown";
  }

  let qualityTier = /** @type {QualityTier} */ ("medium");
  try {
    if (typeof deps.getQualityTier === "function") {
      qualityTier = deps.getQualityTier() ?? "medium";
    }
  } catch {
    qualityTier = "medium";
  }

  const nav =
    deps.navigatorLike
    ?? (typeof navigator !== "undefined" ? navigator : null);
  const hardwareConcurrency =
    nav && typeof nav.hardwareConcurrency === "number" ? nav.hardwareConcurrency : null;
  const deviceMemoryGb =
    nav && typeof /** @type {{ deviceMemory?: number }} */ (nav).deviceMemory === "number"
      ? /** @type {{ deviceMemory?: number }} */ (nav).deviceMemory
      : null;

  return scoreHostCapability({
    gpuClass,
    qualityTier,
    hardwareConcurrency,
    deviceMemoryGb,
  });
}
