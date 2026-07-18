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
 * @typedef {"off" | "core" | "full"} LaserBudget
 *   off  — no laser meshes / dynamic stand lights
 *   core — stage + arena + sky beams (no deck rings; big fill-rate cut)
 *   full — every beam including mid/upper deck rings
 */

/**
 * @typedef {object} QualityKnobs
 * @property {number} pixelRatioCap Max devicePixelRatio the renderer honors.
 * @property {number} renderScale Sub-native drawing-buffer scale (multiplies the capped DPR; 1 = native).
 * @property {boolean} postFx Bloom + arcade/VHS passes allowed (user Post-FX toggle still wins).
 * @property {boolean} fxaa FXAA pass enabled (ignored when pixelRatio is already ≥1.75 — AA from pixels).
 * @property {boolean} composerBypass Skip EffectComposer entirely and render direct (all passes off).
 * @property {boolean} reflector Classic mirror-floor Reflector (full second scene render).
 * @property {number} crowdCount Classic crowd instance budget (Infinity = full capacity).
 * @property {boolean} crowdAnimate Crowd bounce/searchlight/laser animation math.
 * @property {boolean} extrasLasers Classic laser fans + searchlight/crowd point *lights* (false ⇒ laserBudget "off").
 * @property {LaserBudget} laserBudget Which laser rings draw (deck rings are the expensive ambient fill).
 * @property {number} dustMul Ambient dust particle-count multiplier.
 * @property {number} streakCap Ram-boost streak particle cap.
 * @property {number} maxSubsteps Physics substep cap (gameplay-safe: host authoritative).
 * @property {number} ceilingSpots Storerooms lit ceiling-cell SpotLight budget.
 */

/** @type {Record<import("./qualityMode.js").QualityTier, QualityKnobs>} */
export const QUALITY_KNOBS = {
  low: {
    pixelRatioCap: 1,
    // * Run-5: an Intel UHD host at LOW/DPR-1 still spent 54% of frames >33ms rendering
    // * ~1910×915 native — LOW's floor was native resolution. Sub-native render scale is
    // * the biggest remaining GPU lever: 0.75² ≈ 44% fewer fragments; the canvas is
    // * upscaled by the browser (CSS size unchanged). Medium/high stay native.
    renderScale: 0.75,
    postFx: false,
    fxaa: false,
    composerBypass: true,
    reflector: false,
    // * Enough silhouettes for the bowl to read; full 5k is pure vertex burn on potato GPUs.
    crowdCount: 800,
    crowdAnimate: false,
    extrasLasers: false,
    laserBudget: "off",
    dustMul: 0.35,
    streakCap: 30,
    maxSubsteps: 2,
    ceilingSpots: 2,
  },
  medium: {
    // * iGPU default tier (gpuCaps → unknown). 1.25² vs 1.5² is ~30% fewer fragments
    // * across the whole composer stack while still looking sharp on 1080p laptops.
    pixelRatioCap: 1.25,
    renderScale: 1,
    postFx: true,
    fxaa: true,
    composerBypass: false,
    reflector: false,
    // * Full personality without seating every last row — still dense from the floor.
    crowdCount: 2200,
    crowdAnimate: true,
    extrasLasers: true,
    // * Drop deck rings (20 additive beams × sheath+core) — stage/arena/sky keep the rave.
    laserBudget: "core",
    dustMul: 0.5,
    streakCap: 48,
    maxSubsteps: 4,
    ceilingSpots: 3,
  },
  high: {
    pixelRatioCap: 2,
    renderScale: 1,
    postFx: true,
    // * Applied only when DPR < 1.75 — see applyComposerQualityTier (FXAA at DPR 2 is wasted).
    fxaa: true,
    composerBypass: false,
    reflector: true,
    crowdCount: Infinity,
    crowdAnimate: true,
    extrasLasers: true,
    laserBudget: "full",
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

// * Run-6: session render-scale override — the auto-quality watchdog's relief valve
// * BELOW the LOW tier floor. Run-6 captures: the Intel UHD host still dropped ~30%
// * of frames >33ms at LOW/0.75×, and a hitching HOST is every peer's rubber-banding.
// * Multiplies the tier's renderScale at the three pixel-ratio apply sites; steps
// * 1 → 0.85 → 0.7 (LOW effective 0.75 → 0.64 → 0.53). Session-only, no persistence.
const RENDER_SCALE_MUL_STEPS = [1, 0.85, 0.7];
let sessionRenderScaleMul = 1;

/** @returns {number} current session multiplier on the tier's renderScale */
export function getSessionRenderScaleMul() {
  return sessionRenderScaleMul;
}

/** @returns {boolean} whether another render-scale step-down remains */
export function canStepDownSessionRenderScale() {
  return RENDER_SCALE_MUL_STEPS.indexOf(sessionRenderScaleMul) < RENDER_SCALE_MUL_STEPS.length - 1;
}

/** @returns {boolean} true if a step was applied (caller must re-apply pixel ratio live) */
export function stepDownSessionRenderScale() {
  const idx = RENDER_SCALE_MUL_STEPS.indexOf(sessionRenderScaleMul);
  const next = RENDER_SCALE_MUL_STEPS[idx + 1];
  if (!(next > 0)) return false;
  sessionRenderScaleMul = next;
  return true;
}

/** Test/reset helper. */
export function resetSessionRenderScaleForTests() {
  sessionRenderScaleMul = 1;
}
