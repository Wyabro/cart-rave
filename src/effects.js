/**
 * effects.js — Composition root + public barrel for the FX subsystem.
 *
 * EFFECTS-SPLIT-1: implementation moved to src/effects/*.js modules. This file
 * keeps the cross-cutting rave-dressing controls (setRaveExtrasVisible /
 * applyRaveExtrasQuality), the boot composition (initEffects), and re-exports
 * the public API surface so all existing consumers are unchanged.
 */

import * as THREE from "three";
import { applySceneAblation } from "./utils/debugParams.js";
import {
  clearAmbientDust,
  setAmbientDustStyle,
  spawnTrashBurst,
  updateTrashParticles,
  updateAmbientParticles,
  initAmbientParticlesSystem,
  getAmbientParticles,
} from "./effects/ambientParticles.js";
import {
  installRamStreakProgramWarmup,
  tickRamBoostStreakSpawners,
  updateRamBoostStreaks,
  initRamBoostStreaks,
  getRamBoostStreaks,
} from "./effects/ramBoostStreaks.js";
import {
  initCrowd,
  updateCrowd,
  applyCrowdBudget,
  crowdLayers,
  crowdCarts,
  crowdGlow,
  stadiumGroup,
  crowdSearchlightEntries,
  crowdPointLightEntries,
} from "./effects/crowd.js";
import { stageGroup, stageLightEntries } from "./effects/stage.js";
import { laserEntries } from "./effects/lasers.js";
import { billboardGroup, billboardLightEntries } from "./effects/billboard.js";

export {
  clearAmbientDust,
  setAmbientDustStyle,
  spawnTrashBurst,
  updateTrashParticles,
  updateAmbientParticles,
} from "./effects/ambientParticles.js";

export {
  installRamStreakProgramWarmup,
  tickRamBoostStreakSpawners,
  updateRamBoostStreaks,
} from "./effects/ramBoostStreaks.js";

export { initCrowd, updateCrowd } from "./effects/crowd.js";

export {
  initStage,
  updateStageLights,
  updateStageLed,
} from "./effects/stage.js";

export { initLasers, updateLasers } from "./effects/lasers.js";

export { initBillboard, updateBillboard } from "./effects/billboard.js";


/** @typedef {{
 *   enabled: boolean,
 *   streakDurationSec: number,
 *   streakLengthMeters: number,
 *   streakSpawnRatePerSec: number,
 *   streakRadiusMeters?: number,
 *   streakTipRadiusScale?: number,
 *   streakGlowRadiusMul?: number,
 *   streakGlowOpacity?: number,
 *   streakCoreOpacity?: number,
 *   streakSaturationMul?: number,
 *   streakBrightnessMul?: number,
 *   streakSecondaryChance?: number,
 *   streakMaxActive?: number,
 *   streakPulseHz?: number,
 *   streakRearClearanceM?: number,
 *   streakHeightM?: number,
 *   streakChargedIntensityMul?: number,
 *   streakChargedGoldHex?: number,
 *   streakChargedGoldChance?: number,
 * }} RamBoostVisualConfig */

/** @typedef {import("./effects/ambientParticles.js").CartColorMap} CartColorMap */




/**
 * Shows or hides the Classic-Record rave dressing (instanced crowd, glow ring, crowd
 * searchlights + bulbs, main stage, lasers, and billboard). Used so the self-contained
 * Backrooms level can suppress all Classic visuals without tearing down/reallocating them.
 *
 * @param {boolean} visible
 */
export function setRaveExtrasVisible(visible) {
  for (const layer of crowdLayers) {
    if (layer.mesh) layer.mesh.visible = visible;
  }
  if (crowdCarts) crowdCarts.visible = visible;
  if (crowdGlow) crowdGlow.visible = visible;
  if (stadiumGroup) stadiumGroup.visible = visible;
  for (const e of crowdSearchlightEntries) {
    if (e.light) e.light.visible = visible;
    if (e.cone) e.cone.visible = visible;
  }
  for (const e of crowdPointLightEntries) {
    if (e.light) e.light.visible = visible;
    if (e.bulb) e.bulb.visible = visible;
  }
  if (stageGroup) stageGroup.visible = visible;
  for (const e of laserEntries) {
    if (e.mesh) e.mesh.visible = visible;
  }
  if (billboardGroup) billboardGroup.visible = visible;
}


/**
 * Applies a quality tier's Classic-Record dressing knobs. Unlike the old
 * all-or-nothing Low mode, every tier keeps the crowd/stage/billboard silhouette;
 * this only budgets the crowd and gates the *dynamic* costs — real-time lights,
 * laser fans — so Low still looks like a rave, just a frozen-cheap one.
 * Call after setRaveExtrasVisible(true); no-op while extras are hidden/unbuilt.
 *
 * @param {import("./utils/qualityTiers.js").QualityKnobs} knobs
 */
export function applyRaveExtrasQuality(knobs) {
  applyCrowdBudget(knobs.crowdCount);
  const lightsOn = knobs.extrasLasers;
  const laserBudget = knobs.laserBudget
    ?? (lightsOn ? "full" : "off");
  for (const e of crowdSearchlightEntries) {
    if (e.light) e.light.visible = lightsOn && !e.forceOff;
  }
  for (const e of crowdPointLightEntries) {
    // * Bulb meshes stay — only the PointLight contribution is tier-gated.
    if (e.light) e.light.visible = lightsOn;
  }
  for (const e of stageLightEntries) {
    if (e.light) e.light.visible = lightsOn;
  }
  // * laserBudget: "off" none · "core" stage+arena+sky · "full" + deck rings.
  // * Deck rings are 20 additive sheath+core beams — large fill cost for ambient rave.
  for (const e of laserEntries) {
    if (!e.mesh) continue;
    if (laserBudget === "off") {
      e.mesh.visible = false;
      continue;
    }
    if (laserBudget === "core" && e.band === "deck") {
      e.mesh.visible = false;
      continue;
    }
    e.mesh.visible = true;
  }

  // * PERF-PASS-1 measurement probe — LAST, so it wins over everything the tier just
  // * re-showed. Inert without ?ablate=. `crowd` covers all three crowd layers;
  // * `crowdcarts` is layer 0 only (the ~200k-tri cart silhouettes).
  applySceneAblation({
    crowdcarts: crowdLayers[0]?.mesh ?? null,
    crowd: crowdLayers.map((layer) => layer.mesh),
    // * crowdGlow is a child of stadiumGroup — hiding the bowl takes the glow ring too.
    stadium: stadiumGroup,
    stagerig: stageGroup,
    billboard: billboardGroup,
    // * PERF-PASS-1 Wave 5: the two billboard lights are the only lights the tier
    // * knobs never gate (extrasLasers:false leaves them on at Low). Isolate them
    // * from the billboard geometry so the cell measures just the light-loop cost.
    billboardlights: billboardLightEntries.map((e) => e.light),
    bulbs: crowdPointLightEntries.map((e) => e.bulb),
  });
}


/**
 * Initializes the trash particle pool and ram-boost streak storage.
 * @param {THREE.Scene} scene Scene that owns effect meshes.
 * @param {{ ramBoost?: RamBoostVisualConfig, cartColors?: import("./effects/ambientParticles.js").CartColorMap, ambientDustStyle?: import("./effects/ambientParticles.js").AmbientDustStyle }} [options] Typically `{ ramBoost: CONFIG.cart.ramBoost, cartColors: CART_COLORS }`.
 * @returns {{ ramBoostStreaks: import("./effects/ramBoostStreaks.js").RamBoostStreakEntry[], ambientParticles: THREE.Points | null }}
 */
export function initEffects(scene, options = {}) {
  // * Ram-boost streak pool + trash pool + ambient dust system live in their own
  // * modules; this keeps the composition order load-bearing: pools must exist
  // * before levelOrchestration reads them.
  initRamBoostStreaks(scene, options.ramBoost);
  initAmbientParticlesSystem(scene);

  const opt = /** @type {Record<string, any>} */ (options);
  if (opt.cartColors && opt.ambientDustStyle) {
    setAmbientDustStyle(opt.ambientDustStyle, opt.cartColors);
  }

  return { ramBoostStreaks: getRamBoostStreaks(), ambientParticles: getAmbientParticles() };
}
