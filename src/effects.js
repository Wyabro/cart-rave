/**
 * effects.js — Trash burst particles, ram-boost streaks, ambient particles, and crowd visuals.
 */

import * as THREE from "three";
import { createPhysicalMaterial } from "./scene.js";
import { sampleArenaReactive } from "./levels/arenaReactiveLights.js";
import { mergeStaticMeshesByMaterial } from "./utils/mergeStaticMeshes.js";
import { registerMirrorExclude } from "./utils/cheapMirror.js";
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


/** @type {THREE.Group | null} */
let stageGroup = null;

/** Billboard PointLights — never tier-gated (only the group is), so a dedicated
 *  handle exists for the ?ablate=billboardlights measurement probe (PERF-PASS-1). */
/** @type {{ light: THREE.PointLight | null }[]} */
let billboardLightEntries = [];

/** @type {{ light: THREE.SpotLight, target: THREE.Object3D, baseX: number, index: number }[]} */
let stageLightEntries = [];

/** @type {CanvasRenderingContext2D | null} */
let ledCtx = null;

/** @type {THREE.CanvasTexture | null} */
let ledTex = null;

let lastLedUpdate = 0;

/** @type {{
 *   mesh: THREE.Mesh,
 *   sheathMat?: THREE.MeshBasicMaterial,
 *   coreMat?: THREE.MeshBasicMaterial,
 *   band?: "stage" | "arena" | "sky" | "deck",
 *   index: number,
 *   speed: number,
 *   phaseStep: number,
 *   amplitude: number,
 *   baseZ: number,
 * }[]} */
let laserEntries = [];

const laserPositionScratch = new THREE.Vector3();

/** @type {CanvasRenderingContext2D | null} */
let bbSmallCtx = null;

/** @type {THREE.CanvasTexture | null} */
let bbTex = null;

/** @type {THREE.CanvasTexture | null} */
let slTex = null;

/** @type {THREE.Group | null} */
let billboardGroup = null;

// * Web-safe font stacks the jumbotron cycles through so the screen reads as a
// * live animated broadcast board rather than a static sign.
const BB_FONTS = [
  "'Arial Black', sans-serif",
  "Impact, fantasy",
  "'Courier New', monospace",
  "Georgia, serif",
  "'Comic Sans MS', cursive",
];

let bbLastRedraw = 0;


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

/**
/**
 * @param {THREE.Scene} scene
 * @param {{
 *   position: THREE.Vector3,
 *   color: number,
 *   radius: number,
 *   length: number,
 *   opacity: number,
 *   tiltX: number,
 *   index: number,
 *   speed: number,
 *   phaseStep: number,
 *   amplitude: number,
 *   baseQuaternion?: THREE.Quaternion,
 *   faceCenter?: boolean,
 *   band?: "stage" | "arena" | "sky" | "deck",
 * }} opts
 */
function addLaserBeam(scene, {
  position,
  color,
  radius,
  length,
  opacity,
  tiltX,
  index,
  speed,
  phaseStep,
  amplitude,
  baseQuaternion,
  faceCenter = false,
  band = "stage",
}) {
  const laserGeo = new THREE.CylinderGeometry(radius, radius, length, 8);
  laserGeo.translate(0, length / 2, 0);
  // * toneMapped: false pushes the beams past the bloom threshold so they read as
  // * actual light sources, not tinted geometry.
  const laserMat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  laserMat.toneMapped = false;
  laserMat.userData.baseOpacity = opacity;
  laserMat.userData.baseColor = new THREE.Color(color);
  const laser = new THREE.Mesh(laserGeo, laserMat);

  // * Hot white core inside the colored sheath — the classic laser look.
  const coreGeo = new THREE.CylinderGeometry(radius * 0.35, radius * 0.35, length, 6);
  coreGeo.translate(0, length / 2, 0);
  const coreMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: Math.min(1, opacity * 0.9),
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  coreMat.toneMapped = false;
  coreMat.userData.baseOpacity = Math.min(1, opacity * 0.9);
  laser.add(new THREE.Mesh(coreGeo, coreMat));

  laser.position.copy(position);
  if (baseQuaternion) {
    laser.quaternion.copy(baseQuaternion);
  } else if (faceCenter) {
    laser.lookAt(0, 0, 0);
  }
  laser.rotateX(tiltX);
  scene.add(laser);
  registerMirrorExclude(laser);
  laserEntries.push({
    mesh: laser,
    sheathMat: laserMat,
    coreMat,
    band,
    index,
    speed,
    phaseStep,
    amplitude,
    baseZ: laser.rotation.z,
  });
}

/**
 * Builds the main stage truss, LED screen, speakers, neon trim, and sweep lights.
 * @param {THREE.Scene} scene
 * @param {number} pitInnerRadius
 * @param {CartColorMap} cartColors
 */
export function initStage(scene, pitInnerRadius, cartColors) {
  const stageAngle = 0;
  // * Keep in lockstep with stadium bay filler in initCrowd (STAGE_CENTER_R / depths).
  const stageRadius = pitInnerRadius + 15;
  const stageX = Math.cos(stageAngle) * stageRadius;
  const stageZ = Math.sin(stageAngle) * stageRadius;
  // * Group origin stays at bay floor height; deck top is local y=1.5 (world -1.5)
  // * so truss/LED/speaker local offsets keep working.
  const stageY = -3;
  stageGroup = new THREE.Group();

  // * Stage platform — Physical: metalness 0.85, roughness 0.28
  const stageBaseMat = createPhysicalMaterial({
    color: 0x0a0a1a,
    metalness: 0.85,
    roughness: 0.28,
  });
  // * Stage truss poles — Physical: metalness 0.9, roughness 0.32
  const stageMetalMat = createPhysicalMaterial({
    color: 0x1a1a2e,
    metalness: 0.9,
    roughness: 0.32,
  });
  // * Stage speaker stacks — Physical: metalness 0.75, roughness 0.28
  const stageSpeakerMat = createPhysicalMaterial({
    color: 0x0a0a12,
    metalness: 0.75,
    roughness: 0.28,
  });
  const stageSpeakerFaceMat = new THREE.MeshBasicMaterial({ color: 0x222222 });
  const stageFrameMat = new THREE.MeshBasicMaterial({ color: 0x0a0a1a });
  const neonMagentaMat = new THREE.MeshBasicMaterial({ color: 0xff2bd6 });
  const neonCyanMat = new THREE.MeshBasicMaterial({ color: 0x22e6ff });
  const stageLightPalette = Object.values(cartColors).map((entry) => entry.hex);
  stageLightEntries = [];

  stageGroup.clear();

  // * Performance deck on the bay apron + skirt down into the filled plinth.
  const stageBase = new THREE.Mesh(new THREE.BoxGeometry(24, 0.4, 10.4), stageBaseMat);
  stageBase.position.y = 1.35; // * top ≈ local 1.55 → world ≈ -1.45 (flush with bay deck)
  stageGroup.add(stageBase);
  const stageSkirt = new THREE.Mesh(new THREE.BoxGeometry(23.6, 1.25, 10.0), stageBaseMat);
  stageSkirt.position.y = 0.55;
  stageGroup.add(stageSkirt);

  const towerXs = [-11, 11];
  for (const towerX of towerXs) {
    for (const ox of [-0.5, 0.5]) {
      for (const oz of [-0.5, 0.5]) {
        const pole = new THREE.Mesh(
          new THREE.CylinderGeometry(0.15, 0.15, 18, 8),
          stageMetalMat,
        );
        pole.position.set(towerX + ox, 9, oz);
        stageGroup.add(pole);
      }
    }

    for (let b = 0; b < 6; b += 1) {
      const braceY = 1.5 + b * 3;
      const braceX = new THREE.Mesh(new THREE.BoxGeometry(1, 0.1, 0.1), stageMetalMat);
      braceX.position.set(towerX, braceY, 0);
      stageGroup.add(braceX);
      const braceZ = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 1), stageMetalMat);
      braceZ.position.set(towerX, braceY, 0);
      stageGroup.add(braceZ);
    }
  }

  for (const z of [-0.5, 0.5]) {
    const topPole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.15, 0.15, 22, 8),
      stageMetalMat,
    );
    topPole.rotation.z = Math.PI / 2;
    topPole.position.set(0, 18, z);
    stageGroup.add(topPole);
  }
  for (let x = -10; x <= 10; x += 2) {
    const spanBrace = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 1), stageMetalMat);
    spanBrace.position.set(x, 18, 0);
    stageGroup.add(spanBrace);
  }

  const ledCanvas = document.createElement("canvas");
  ledCanvas.width = 512;
  ledCanvas.height = 256;
  ledCtx = ledCanvas.getContext("2d");
  const ledGrad = ledCtx.createLinearGradient(0, 0, 512, 256);
  ledGrad.addColorStop(0, "#0a0020");
  ledGrad.addColorStop(0.5, "#1a0040");
  ledGrad.addColorStop(1, "#0a0020");
  ledCtx.fillStyle = ledGrad;
  ledCtx.fillRect(0, 0, 512, 256);
  ledCtx.font = 'bold 90px "Arial Black", "Impact", sans-serif';
  ledCtx.textAlign = "center";
  ledCtx.textBaseline = "middle";
  ledCtx.fillStyle = "#ff2bd6";
  ledCtx.shadowColor = "#ff2bd6";
  ledCtx.shadowBlur = 20;
  ledCtx.fillText("CART", 256, 100);
  ledCtx.fillStyle = "#ffe53d";
  ledCtx.shadowColor = "#ffe53d";
  ledCtx.shadowBlur = 20;
  ledCtx.fillText("RAVE", 256, 185);
  ledCtx.shadowBlur = 0;
  for (let y = 0; y < 256; y += 4) {
    ledCtx.fillStyle = "rgba(0,0,0,0.15)";
    ledCtx.fillRect(0, y, 512, 2);
  }
  ledTex = new THREE.CanvasTexture(ledCanvas);
  const ledScreenMat = new THREE.MeshBasicMaterial({ map: ledTex });
  const ledScreen = new THREE.Mesh(new THREE.BoxGeometry(16, 8, 0.3), ledScreenMat);
  ledScreen.position.set(0, 9, -4);
  // * Canvas texture is updated live — keep as its own draw.
  ledScreen.userData.noMerge = true;
  stageGroup.add(ledScreen);
  const ledFrame = new THREE.Mesh(new THREE.BoxGeometry(16.5, 8.5, 0.2), stageFrameMat);
  ledFrame.position.set(0, 9, -4.3);
  stageGroup.add(ledFrame);

  const speakerXs = [-9, -7, 7, 9];
  const speakerYs = [1.5, 3.5, 5.5];
  for (const sx of speakerXs) {
    for (const sy of speakerYs) {
      const speaker = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), stageSpeakerMat);
      speaker.position.set(sx, sy, 0);
      stageGroup.add(speaker);
      const speakerFace = new THREE.Mesh(
        new THREE.CylinderGeometry(0.6, 0.6, 0.1, 16),
        stageSpeakerFaceMat,
      );
      speakerFace.rotation.x = Math.PI / 2;
      speakerFace.position.set(sx, sy, 1.01);
      stageGroup.add(speakerFace);
    }
  }

  const neonTop = new THREE.Mesh(new THREE.BoxGeometry(22, 0.08, 0.08), neonMagentaMat);
  neonTop.position.set(0, 18, 0);
  stageGroup.add(neonTop);
  for (const towerX of towerXs) {
    const towerTopNeon = new THREE.Mesh(new THREE.BoxGeometry(1, 0.08, 0.08), neonCyanMat);
    towerTopNeon.position.set(towerX, 18, 0);
    stageGroup.add(towerTopNeon);
  }
  const neonBaseFront = new THREE.Mesh(new THREE.BoxGeometry(24, 0.08, 0.08), neonMagentaMat);
  neonBaseFront.position.set(0, 1.54, 5);
  stageGroup.add(neonBaseFront);

  for (let i = 0; i < 6; i += 1) {
    const t = i / 5;
    const lx = -10 + t * 20;
    const color = stageLightPalette[i % stageLightPalette.length];
    const light = new THREE.SpotLight(color, 3, 30, Math.PI / 6, 0.5);
    light.position.set(lx, 18, 0);
    stageGroup.add(light);
    const target = new THREE.Object3D();
    target.position.set(lx, 0, 0);
    stageGroup.add(target);
    light.target = target;
    stageLightEntries.push({ light, target, baseX: lx, index: i });
  }

  stageGroup.position.set(stageX, stageY, stageZ);
  stageGroup.lookAt(0, stageGroup.position.y, 0);
  scene.add(stageGroup);
  stageGroup.updateMatrixWorld(true);
  // * Poles/speakers/neon → few draws; LED screen stays separate (noMerge).
  // * Stage stays IN the mirror (readable hardware silhouette on the vinyl).
  mergeStaticMeshesByMaterial(stageGroup, { deep: true });
}

/**
 * Builds stage, arena, and sky laser beams. Call after `initStage`.
 * @param {THREE.Scene} scene
 * @param {number} pitInnerRadius
 * @param {CartColorMap} cartColors
 */
export function initLasers(scene, pitInnerRadius, cartColors) {
  if (!stageGroup) return;

  laserEntries = [];
  const stageLightPalette = Object.values(cartColors).map((entry) => entry.hex);

  for (let i = 0; i < 6; i += 1) {
    const t = i / 5;
    const lx = -10 + t * 20;
    addLaserBeam(scene, {
      position: stageGroup.localToWorld(laserPositionScratch.set(lx, 18, 0)),
      color: stageLightPalette[i % stageLightPalette.length],
      radius: 0.15,
      length: 80,
      opacity: 0.6,
      tiltX: -Math.PI * 0.3,
      index: i,
      speed: 0.5,
      phaseStep: 1.05,
      amplitude: 0.6,
      baseQuaternion: stageGroup.quaternion,
      band: "stage",
    });
  }

  // * Arena ring lives in the open moat between the pit rim and the lower bowl —
  // * field-edge pyro that stays fully visible instead of poking through seating.
  const arenaLaserRadius = pitInnerRadius + 1.5;
  for (let i = 0; i < 12; i += 1) {
    const angle = (i / 12) * Math.PI * 2;
    addLaserBeam(scene, {
      position: new THREE.Vector3(
        Math.cos(angle) * arenaLaserRadius,
        -3,
        Math.sin(angle) * arenaLaserRadius,
      ),
      color: stageLightPalette[i % stageLightPalette.length],
      radius: 0.12,
      length: 80,
      opacity: 0.5,
      tiltX: -Math.PI * 0.35,
      index: i,
      speed: 0.4,
      phaseStep: 0.52,
      amplitude: 0.5,
      faceCenter: true,
      band: "arena",
    });
  }

  // * Sky ring fires from the upper-deck rim (r matches the stadium bowl's top deck
  // * edge, base on its parapet) — coliseum skyline beams instead of buried bases.
  const skyLaserRadius = pitInnerRadius + 79.7;
  for (let i = 0; i < 8; i += 1) {
    const angle = (i / 8) * Math.PI * 2;
    addLaserBeam(scene, {
      position: new THREE.Vector3(
        Math.cos(angle) * skyLaserRadius,
        33.2,
        Math.sin(angle) * skyLaserRadius,
      ),
      color: i % 2 === 0 ? 0xff2bd6 : 0x22e6ff,
      radius: 0.18,
      length: 120,
      opacity: 0.45,
      tiltX: -Math.PI * 0.4,
      index: i,
      speed: 0.3,
      phaseStep: 0.79,
      amplitude: 0.7,
      faceCenter: true,
      band: "sky",
    });
  }

  // * Deck rings — beams firing from the mid and upper deck front edges (radii/
  // * heights match the stadium decks in initCrowd) so the whole bowl joins the
  // * light show instead of just the field edge and the rim.
  // * Gated to High via laserBudget "full" (Medium keeps stage/arena/sky only).
  const deckLaserRings = [
    { r: pitInnerRadius + 33.7, y: 12.3, count: 10, radius: 0.12, length: 90, opacity: 0.55, tiltX: -Math.PI * 0.38, speed: 0.45, phaseStep: 0.61 },
    { r: pitInnerRadius + 59.7, y: 25.3, count: 10, radius: 0.14, length: 100, opacity: 0.5, tiltX: -Math.PI * 0.42, speed: 0.35, phaseStep: 0.87 },
  ];
  let deckBeamIndex = 0;
  for (const ring of deckLaserRings) {
    for (let i = 0; i < ring.count; i += 1) {
      const angle = ((i + 0.5) / ring.count) * Math.PI * 2;
      addLaserBeam(scene, {
        position: new THREE.Vector3(
          Math.cos(angle) * ring.r,
          ring.y,
          Math.sin(angle) * ring.r,
        ),
        color: stageLightPalette[deckBeamIndex % stageLightPalette.length],
        radius: ring.radius,
        length: ring.length,
        opacity: ring.opacity,
        tiltX: ring.tiltX,
        index: deckBeamIndex,
        speed: ring.speed,
        phaseStep: ring.phaseStep,
        amplitude: 0.55,
        faceCenter: true,
        band: "deck",
      });
      deckBeamIndex += 1;
    }
  }
}

/**
 * Builds the arena billboard opposite the stage.
 * @param {THREE.Scene} scene
 * @param {number} pitInnerRadius
 */
export function initBillboard(scene, pitInnerRadius) {
  const bbAngle = Math.PI;
  const bbRadius = pitInnerRadius + 25;

  const bbSmallCanvas = document.createElement("canvas");
  bbSmallCanvas.width = 256;
  bbSmallCanvas.height = 64;
  bbSmallCtx = bbSmallCanvas.getContext("2d");
  bbSmallCtx.imageSmoothingEnabled = false;
  bbSmallCtx.fillStyle = "#000000";
  bbSmallCtx.fillRect(0, 0, 256, 64);
  bbSmallCtx.fillStyle = "#ffffff";
  bbSmallCtx.font = `bold 40px ${BB_FONTS[0]}`;
  bbSmallCtx.textAlign = "center";
  bbSmallCtx.textBaseline = "middle";
  bbSmallCtx.fillText("CART RAVE", 128, 34);
  bbTex = new THREE.CanvasTexture(bbSmallCanvas);
  bbTex.magFilter = THREE.NearestFilter;
  bbTex.minFilter = THREE.NearestFilter;
  bbTex.colorSpace = THREE.SRGBColorSpace;

  const slCanvas = document.createElement("canvas");
  slCanvas.width = 128;
  slCanvas.height = 256;
  const slCtx = slCanvas.getContext("2d");
  for (let y = 0; y < 256; y += 2) {
    slCtx.fillStyle = "rgba(0,0,0,0.3)";
    slCtx.fillRect(0, y + 1, 128, 1);
  }
  slTex = new THREE.CanvasTexture(slCanvas);
  slTex.wrapS = THREE.RepeatWrapping;
  slTex.wrapT = THREE.RepeatWrapping;

  // * Billboard poles — Physical: metalness 0.85, roughness 0.3
  const bbPoleMat = createPhysicalMaterial({
    color: 0x333344, metalness: 0.85, roughness: 0.3,
  });
  const bbNeonCyanMat = new THREE.MeshBasicMaterial({ color: 0x22e6ff });
  const bbNeonMagentaMat = new THREE.MeshBasicMaterial({
    color: 0xff2bd6,
    transparent: true,
    opacity: 0.4,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  billboardGroup = new THREE.Group();

  // * Center-hung jumbotron — four screen faces around a dark core cube hung low
  // * enough (y=15) that the chase cam actually frames it from the field, replacing
  // * the old ground-mounted board. One shared canvas/scanline pipeline drives all
  // * faces.
  const bbCore = new THREE.Mesh(new THREE.BoxGeometry(12.4, 3.6, 12.4), bbPoleMat);
  billboardGroup.add(bbCore);

  const bbScreenGeo = new THREE.PlaneGeometry(12, 3);
  const bbScreenMat = new THREE.MeshBasicMaterial({ map: bbTex });
  const bbScanMat = new THREE.MeshBasicMaterial({
    map: slTex,
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
  });

  const bbFrameParts = [
    { w: 12.3, h: 0.15, d: 0.15, x: 0, y: 1.575 },
    { w: 12.3, h: 0.15, d: 0.15, x: 0, y: -1.575 },
    { w: 0.15, h: 3.3, d: 0.15, x: -6.075, y: 0 },
    { w: 0.15, h: 3.3, d: 0.15, x: 6.075, y: 0 },
  ];
  // * Frame geometries built once and shared across the 4 faces.
  const bbFrameGeos = bbFrameParts.map(({ w, h, d }) => ({
    cyan: new THREE.BoxGeometry(w, h, d),
    halo: new THREE.BoxGeometry(w + 0.1, h + 0.1, d + 0.1),
  }));

  for (let face = 0; face < 4; face += 1) {
    const faceAngle = face * Math.PI * 0.5;
    const faceGroup = new THREE.Group();
    const bbScreen = new THREE.Mesh(bbScreenGeo, bbScreenMat);
    // * Live canvas texture — do not merge into static batches.
    bbScreen.userData.noMerge = true;
    faceGroup.add(bbScreen);
    const bbScanlines = new THREE.Mesh(bbScreenGeo, bbScanMat);
    bbScanlines.position.z = 0.01;
    bbScanlines.userData.noMerge = true;
    faceGroup.add(bbScanlines);
    for (let p = 0; p < bbFrameParts.length; p += 1) {
      const { x, y } = bbFrameParts[p];
      const cyanBar = new THREE.Mesh(bbFrameGeos[p].cyan, bbNeonCyanMat);
      cyanBar.position.set(x, y, 0.06);
      faceGroup.add(cyanBar);
      const haloBar = new THREE.Mesh(bbFrameGeos[p].halo, bbNeonMagentaMat);
      haloBar.position.set(x, y, 0.02);
      faceGroup.add(haloBar);
    }
    faceGroup.rotation.y = faceAngle;
    faceGroup.position.set(Math.sin(faceAngle) * 6.25, 0, Math.cos(faceAngle) * 6.25);
    billboardGroup.add(faceGroup);
  }

  // * Suspension spine — rises from the core up into the dark for the center-hung read.
  const bbSpine = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 14, 8), bbPoleMat);
  bbSpine.position.y = 8.8;
  billboardGroup.add(bbSpine);

  const bbLightL = new THREE.PointLight(0x22e6ff, 2, 8);
  bbLightL.position.set(-7, -1, 0);
  billboardGroup.add(bbLightL);
  const bbLightR = new THREE.PointLight(0xff2bd6, 2, 8);
  bbLightR.position.set(7, -1, 0);
  billboardGroup.add(bbLightR);
  billboardLightEntries = [
    { light: bbLightL },
    { light: bbLightR },
  ];

  billboardGroup.position.set(0, 15, 0);
  mergeStaticMeshesByMaterial(billboardGroup, { deep: true });
  scene.add(billboardGroup);
  registerMirrorExclude(billboardGroup);
}

/**
 * Sweeps stage spot targets over the deck.
 * @param {number} nowMs Current time (ms).
 */
export function updateStageLights(nowMs) {
  if (stageLightEntries.length === 0) return;
  const nowSec = nowMs * 0.001;
  for (const entry of stageLightEntries) {
    entry.target.position.x = entry.baseX + Math.sin(nowSec * 0.5 + entry.index) * 5;
    entry.target.position.y = 0;
    entry.target.position.z = 0;
    entry.target.updateMatrix();
  }
}

/**
 * Pulses the stage LED screen canvas texture.
 * @param {number} nowMs Current time (ms).
 */
export function updateStageLed(nowMs) {
  if (!ledCtx || !ledTex || nowMs - lastLedUpdate <= 150) return;

  const pulse = 0.6 + Math.sin(nowMs * 0.002) * 0.4;
  const pulse2 = 0.6 + Math.sin(nowMs * 0.002 + 1.5) * 0.4;
  const ledGradAnim = ledCtx.createLinearGradient(0, 0, 512, 256);
  ledGradAnim.addColorStop(0, "#0a0020");
  ledGradAnim.addColorStop(0.5, "#1a0040");
  ledGradAnim.addColorStop(1, "#0a0020");
  ledCtx.fillStyle = ledGradAnim;
  ledCtx.fillRect(0, 0, 512, 256);
  ledCtx.font = 'bold 90px "Arial Black", "Impact", sans-serif';
  ledCtx.textAlign = "center";
  ledCtx.textBaseline = "middle";
  ledCtx.fillStyle = `rgba(255, 43, 214, ${pulse})`;
  ledCtx.shadowColor = "#ff2bd6";
  ledCtx.shadowBlur = 20 + pulse * 15;
  ledCtx.fillText("CART", 256, 100);
  ledCtx.fillStyle = `rgba(255, 229, 61, ${pulse2})`;
  ledCtx.shadowColor = "#ffe53d";
  ledCtx.shadowBlur = 20 + pulse2 * 15;
  ledCtx.fillText("RAVE", 256, 185);
  ledCtx.shadowBlur = 0;
  for (let y = 0; y < 256; y += 4) {
    ledCtx.fillStyle = "rgba(0,0,0,0.15)";
    ledCtx.fillRect(0, y, 512, 2);
  }
  ledTex.needsUpdate = true;
  lastLedUpdate = nowMs;
}

/**
 * Rotates laser beam meshes with sinusoidal wobble.
 * @param {number} nowMs Current time (ms).
 */
const _laserReactiveColor = new THREE.Color();

export function updateLasers(nowMs) {
  if (laserEntries.length === 0) return;
  const nowSec = nowMs * 0.001;
  const reactive = sampleArenaReactive(nowMs);
  // * Subtle leader lean; KO still gets a stronger flash. Idle keeps pure palette colors.
  const leaderMix = reactive.hasLeader ? 0.12 : 0;
  const koT = reactive.koT;
  const wantsLaserTint = leaderMix > 0 || koT > 0;
  for (const entry of laserEntries) {
    entry.mesh.rotation.z =
      entry.baseZ +
      Math.sin(nowSec * entry.speed + entry.index * entry.phaseStep) *
        entry.amplitude * (1 + koT * 0.35);
    if (entry.sheathMat?.userData?.baseColor) {
      if (wantsLaserTint) {
        _laserReactiveColor
          .copy(entry.sheathMat.userData.baseColor)
          .lerp(reactive.accentColor, leaderMix + koT * 0.55);
        entry.sheathMat.color.copy(_laserReactiveColor);
        entry.sheathMat.opacity =
          (entry.sheathMat.userData.baseOpacity ?? 0.5) * (1 + koT * 0.75);
      } else {
        entry.sheathMat.color.copy(entry.sheathMat.userData.baseColor);
        entry.sheathMat.opacity = entry.sheathMat.userData.baseOpacity ?? 0.5;
      }
    }
    if (entry.coreMat) {
      entry.coreMat.opacity =
        (entry.coreMat.userData.baseOpacity ?? 0.5) * (1 + koT * 1.1);
    }
  }
}

/**
 * Animates billboard text glow and scanline UV scroll.
 * @param {number} nowMs Current time (ms).
 */
export function updateBillboard(nowMs) {
  if (!bbSmallCtx || !bbTex || !slTex) return;

  if (nowMs - bbLastRedraw > 100) {
    bbLastRedraw = nowMs;
    const t = (Math.sin(nowMs * 0.003) + 1) / 2;
    const r = Math.round(255 * (1 - t));
    bbSmallCtx.imageSmoothingEnabled = false;
    bbSmallCtx.fillStyle = "#000000";
    bbSmallCtx.fillRect(0, 0, 256, 64);
    // * Big text that fills the board, cycling through font stacks (~every 0.7s)
    // * with a size pulse — reads as an animated broadcast graphic.
    const font = BB_FONTS[Math.floor(nowMs / 700) % BB_FONTS.length];
    let size = Math.round(40 * (1 + Math.sin(nowMs * 0.004) * 0.08));
    bbSmallCtx.font = `bold ${size}px ${font}`;
    const textWidth = bbSmallCtx.measureText("CART RAVE").width;
    if (textWidth > 238) {
      size = Math.floor((size * 238) / textWidth);
      bbSmallCtx.font = `bold ${size}px ${font}`;
    }
    bbSmallCtx.textAlign = "center";
    bbSmallCtx.textBaseline = "middle";
    bbSmallCtx.shadowColor = "#ff2bd6";
    bbSmallCtx.shadowBlur = 8 + Math.sin(nowMs * 0.005) * 5;
    bbSmallCtx.fillStyle = `rgb(${r}, 255, 255)`;
    bbSmallCtx.fillText("CART RAVE", 128, 34);
    bbSmallCtx.shadowBlur = 0;
    bbTex.needsUpdate = true;
  }
  slTex.offset.y = (nowMs * 0.0005) % 1;
}
