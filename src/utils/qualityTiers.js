/**
 * qualityTiers.js — the knob table behind the low/medium/high quality tiers.
 *
 * Principle: MEDIUM keeps the full personality on a leaner budget; LOW must
 * still read as Cart Clash (skybox, stands, stage stay visible) while shedding
 * the expensive renderers (reflector, post-FX, dynamic lights, animation).
 *
 * Measured motivation (Production Pass 2, see docs/planning/production-pass-2-performance.md):
 * the Classic floor Reflector alone is ~60% of the High-tier GPU frame, and the
 * Storerooms ceiling SpotLights are its dominant fragment cost — both now tier-gated
 * here instead of riding one all-or-nothing boolean.
 */

import { getQualityTier } from "./qualityMode.js";

/**
 * @typedef {object} QualityKnobs
 * @property {number} pixelRatioCap Max devicePixelRatio the renderer honors.
 * @property {boolean} postFx Bloom + arcade/VHS passes allowed (user Post-FX toggle still wins).
 * @property {boolean} fxaa FXAA pass enabled.
 * @property {boolean} composerBypass Skip EffectComposer entirely and render direct (all passes off).
 * @property {boolean} reflector Classic mirror-floor Reflector (full second scene render).
 * @property {number} crowdCount Classic crowd instance budget (Infinity = full capacity).
 * @property {boolean} crowdAnimate Crowd bounce/searchlight/laser animation math.
 * @property {boolean} extrasLasers Classic laser fans + searchlight/crowd point *lights*.
 * @property {number} dustMul Ambient dust particle-count multiplier.
 * @property {number} streakCap Ram-boost streak particle cap.
 * @property {number} maxSubsteps Physics substep cap (gameplay-safe: host authoritative).
 * @property {number} ceilingSpots Storerooms lit ceiling-cell SpotLight budget.
 */

/** @type {Record<import("./qualityMode.js").QualityTier, QualityKnobs>} */
export const QUALITY_KNOBS = {
  low: {
    pixelRatioCap: 1,
    postFx: false,
    fxaa: false,
    composerBypass: true,
    reflector: false,
    crowdCount: 800,
    crowdAnimate: false,
    extrasLasers: false,
    dustMul: 0.35,
    streakCap: 30,
    maxSubsteps: 2,
    ceilingSpots: 2,
  },
  medium: {
    pixelRatioCap: 1.5,
    postFx: true,
    fxaa: true,
    composerBypass: false,
    reflector: false,
    crowdCount: Infinity,
    crowdAnimate: true,
    extrasLasers: true,
    dustMul: 0.7,
    streakCap: 60,
    maxSubsteps: 4,
    ceilingSpots: 4,
  },
  high: {
    pixelRatioCap: 2,
    postFx: true,
    fxaa: true,
    composerBypass: false,
    reflector: true,
    crowdCount: Infinity,
    crowdAnimate: true,
    extrasLasers: true,
    dustMul: 1,
    streakCap: 80,
    maxSubsteps: 4,
    ceilingSpots: 8,
  },
};

/**
 * Knobs for the currently active tier.
 * @returns {QualityKnobs}
 */
export function getQualityKnobs() {
  return QUALITY_KNOBS[getQualityTier()];
}
