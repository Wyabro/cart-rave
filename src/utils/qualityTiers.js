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
 * @property {boolean} skyExtras Classic sceneExtras rig — skybox shell, starfields, planets,
 *   UFOs, world spotlights (SKYBOX-1). +54 draw calls and 5 spotlights when on, so LOW opts
 *   out; the crowd/stage silhouette still carries the Cart Clash read there.
 * @property {boolean} arenaFillLights Classic pit fill lights — the void uplight + pit rim fill
 *   (PERF-PASS-1). The record's spindle accent is deliberately NOT included: Wyatt kept it as a
 *   look-identity element. Measured on the Intel UHD box at Low: all three lights together were
 *   −2.88 ms (23.788 → 20.909, cap-243, bracketed A-B-A drift 0.041 ms). **This two-light variant
 *   is unbracketed** — its own cell landed between −1.66 and −2.54 ms depending on which baseline
 *   it is read against, because the box drifted +5.1 ms over that session. Shipped on Wyatt's
 *   explicit call with the range known. See docs/planning/perf-pass-1-handover.md.
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
    // * PERF-PASS-1: the two pit fill lights leave the standard-material light loop at LOW.
    // * The spindle accent stays lit — it is the record's identity, and Wyatt kept it.
    arenaFillLights: false,
    // * SKYBOX-1: the sky rig costs +54 draws / +5 spotlights, at the tier least able to pay.
    skyExtras: false,
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
    arenaFillLights: true,
    skyExtras: true,
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
    arenaFillLights: true,
    skyExtras: true,
    laserBudget: "full",
    dustMul: 1,
    streakCap: 80,
    maxSubsteps: 4,
    ceilingSpots: 8,
  },
  // * PERF-TIER-1: mid-range discrete tier (1660 Ti class). Same personality as high
  // * but drops the DPR-invariant reflector (512px internal RT — costs the same at
  // * DPR 1 and DPR 2, so it dominates budget on mid-range GPUs at 1080p) and caps
  // * DPR at 1.5 instead of 2. Crowd, lasers, postFx, skyExtras all kept.
  "high-lite": {
    pixelRatioCap: 1.5,
    renderScale: 1,
    postFx: true,
    fxaa: true,
    composerBypass: false,
    reflector: false,
    crowdCount: Infinity,
    crowdAnimate: true,
    extrasLasers: true,
    arenaFillLights: true,
    skyExtras: true,
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

// * Software-rasterizer resolution floor (potato path). The tier renderScale is a
// * MULTIPLIER on window size, so on a 2560-wide display LOW still hands the CPU a
// * ~1900px buffer — the exact "runs at 5fps on a machine with no GPU driver" case
// * (Hawaii playtest, WARP renderer). This is an ABSOLUTE long-edge cap on the
// * drawing buffer, applied only when a software rasterizer is driving: the browser
// * upscales the tiny buffer to the canvas (CSS size unchanged), the same trick as
// * renderScale but pinned to a fixed pixel count regardless of display size.
// * Tunable; a real GPU never sees this. Live-tune via ?softedge=NNN for playtests.
const SOFTWARE_MAX_DRAW_LONG_EDGE_DEFAULT = 720;
/** @type {number | null} */
let cachedSoftwareLongEdge = null;

/** @returns {number} the active software long-edge cap (URL override or default). */
function softwareMaxDrawLongEdge() {
  if (cachedSoftwareLongEdge !== null) return cachedSoftwareLongEdge;
  let value = SOFTWARE_MAX_DRAW_LONG_EDGE_DEFAULT;
  try {
    if (typeof location !== "undefined") {
      const raw = new URLSearchParams(location.search || "").get("softedge");
      const n = raw != null ? Number(raw) : NaN;
      // * Clamp to a sane band: below 240 is unreadable, above 1600 defeats the point.
      if (Number.isFinite(n) && n >= 240 && n <= 1600) value = n;
    }
  } catch {
    // * Bad/absent URL — keep the default.
  }
  cachedSoftwareLongEdge = value;
  return value;
}

/**
 * Effective drawing-buffer pixel ratio for the in-game renderer. Caps DPR to the
 * tier, folds in sub-native renderScale (tier × the watchdog session mul), then —
 * only when a software rasterizer is driving — clamps to {@link softwareMaxDrawLongEdge}
 * so a large display cannot hand the CPU a multi-megapixel buffer. Shared by all
 * three apply sites (createRenderer, tier re-apply, resize) so they never diverge.
 *
 * @param {number} cssW CSS width (window.innerWidth).
 * @param {number} cssH CSS height (window.innerHeight).
 * @param {boolean} [softwareActive=false] True when the live context is a software rasterizer.
 * @param {QualityKnobs} [knobs] Explicit tier knobs; defaults to the active tier.
 * @returns {number}
 */
export function effectivePixelRatio(cssW, cssH, softwareActive = false, knobs = getQualityKnobs()) {
  const dpr = (typeof window !== "undefined" && window.devicePixelRatio) || 1;
  let pixelRatio =
    Math.min(dpr, knobs.pixelRatioCap) * (knobs.renderScale ?? 1) * getSessionRenderScaleMul();
  if (softwareActive) {
    const longEdge = Math.max(cssW || 1, cssH || 1);
    const cap = softwareMaxDrawLongEdge() / longEdge;
    if (cap < pixelRatio) pixelRatio = cap;
  }
  return pixelRatio;
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

/** @returns {boolean} whether a render-scale step-up remains (mul is below 1) */
export function canStepUpSessionRenderScale() {
  return RENDER_SCALE_MUL_STEPS.indexOf(sessionRenderScaleMul) > 0;
}

/**
 * Next mul if we stepped up, or null at 1.
 * @returns {number | null}
 */
export function peekStepUpSessionRenderScale() {
  const idx = RENDER_SCALE_MUL_STEPS.indexOf(sessionRenderScaleMul);
  const next = RENDER_SCALE_MUL_STEPS[idx - 1];
  return next > 0 ? next : null;
}

/** @returns {boolean} true if a step was applied (caller must re-apply pixel ratio live) */
export function stepUpSessionRenderScale() {
  const next = peekStepUpSessionRenderScale();
  if (!(next > 0)) return false;
  sessionRenderScaleMul = next;
  return true;
}

/** Test/reset helper. */
export function resetSessionRenderScaleForTests() {
  sessionRenderScaleMul = 1;
}
