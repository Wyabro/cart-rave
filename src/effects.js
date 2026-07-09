/**
 * effects.js — Trash burst particles, ram-boost streaks, ambient particles, and crowd visuals.
 */

import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { buildCart } from "./cart.js";
import * as Simulation from "./simulation.js";
import * as GameState from "./gameState.js";
import { CONFIG } from "./config.js";
import { clamp, isLowQualityMode } from "./utils.js";
import { createPhysicalMaterial } from "./scene.js";
import { sampleArenaReactive } from "./arenaReactiveLights.js";

let crowdInstanceCount = 5000;
const CROWD_SEARCHLIGHT_SPEEDS = [0.2, 0.35, 0.5, 0.25];
const CROWD_SEARCHLIGHT_COLORS = [0xff00ff, 0x00ffff, 0xffff00, 0x00ff00];

/**
 * Safely disposes a Three.js subtree (geometries + materials).
 * @param {THREE.Object3D | null | undefined} root
 */
function disposeObject3D(root) {
  if (!root) return;
  if (root.parent) root.parent.remove(root);

  /**
   * @param {THREE.Material | THREE.Material[]} material
   */
  function disposeMaterial(material) {
    if (Array.isArray(material)) {
      material.forEach((m) => m && typeof m.dispose === "function" && m.dispose());
      return;
    }
    if (material && typeof material.dispose === "function") material.dispose();
  }

  root.traverse((child) => {
    if (child.material) disposeMaterial(child.material);
    const isShared = Boolean(child.userData && child.userData.isSharedGeometry);
    if (!isShared && child.geometry && typeof child.geometry.dispose === "function") {
      child.geometry.dispose();
    }
  });
}

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
 * }} RamBoostVisualConfig */

/** @typedef {Record<string, { hex: number }>} CartColorMap */

const TRASH_POOL_SIZE = 52;
const TRASH_NEON_COLORS = [0xff00ff, 0x00ffff, 0xffff00, 0xff3300];

const AMBIENT_PARTICLE_COUNT = 260;
const AMBIENT_PARTICLE_RADIUS = 35;
const AMBIENT_PARTICLE_HEIGHT = 30;

/** @typedef {"rainbow" | "backrooms" | "sunset"} AmbientDustStyle */

/** White + warm-yellow motes for the Backrooms level. */
const BACKROOMS_DUST_COLORS = [
  0xffffff, 0xfffef8, 0xfff8e8, 0xfff0cc, 0xffe999, 0xffdd55, 0xf5c830,
];

/** Sunset ember & dusk motes for the Zanzibar Platform level. */
const SUNSET_DUST_COLORS = [
  0xff8c4a, 0xffb257, 0xe8683f, 0xffd9a0, 0xff5e3a, 0xffa04e,
];

/** Muted carpet-dust tones for Backrooms floor impacts (includes lighter puffs for visibility). */
const BACKROOMS_FLOOR_DUST_COLORS = [
  0xe0d4b8, 0xd4c8a8, 0xc4b896, 0xb8a882, 0x9c8f73, 0x8a7d62, 0xa69878,
];

/** @type {AmbientDustStyle} */
let currentEffectStyle = "rainbow";

/** @type {number} */
let ambientParticleRadius = AMBIENT_PARTICLE_RADIUS;

/** @type {number} */
let ambientParticleHeight = AMBIENT_PARTICLE_HEIGHT;

/** @type {THREE.Scene | null} */
let sceneRef = null;

/** @type {THREE.Mesh[]} */
let trashPool = [];

/** @type {THREE.BoxGeometry | null} */
let trashGeo = null;

/** @type {THREE.MeshBasicMaterial | null} */
let trashMat = null;

/** @typedef {{
 *   group: THREE.Group,
 *   coreMesh: THREE.Mesh,
 *   glowMesh: THREE.Mesh,
 *   coreMat: THREE.MeshBasicMaterial,
 *   glowMat: THREE.MeshBasicMaterial,
 *   birthMs: number,
 *   durationMs: number,
 *   cart: any,
 *   baseRadius: number,
 *   length: number,
 * }} RamBoostStreakEntry */

/** @type {RamBoostStreakEntry[]} */
let ramBoostStreaks = [];

/** * Free-list of built-but-inactive streak entries — reused instead of allocating. */
/** @type {RamBoostStreakEntry[]} */
let ramBoostStreakFreeList = [];

/** @type {RamBoostVisualConfig | null} */
let ramBoostConfig = null;

const ramBoostStreakAlignQuat = new THREE.Quaternion();
const ramBoostCylinderAxisY = new THREE.Vector3(0, 1, 0);
const ramBoostStreakScratchOrigin = new THREE.Vector3();
const ramBoostStreakScratchPos = new THREE.Vector3();
const ramBoostStreakScratchForward = new THREE.Vector3();
const ramBoostStreakScratchRight = new THREE.Vector3();
const ramBoostStreakColorScratch = new THREE.Color();
const ramBoostStreakHslScratch = { h: 0, s: 0, l: 0 };

/** @type {THREE.CylinderGeometry | null} */
let streakCoreUnitGeo = null;

/** @type {THREE.CylinderGeometry | null} */
let streakGlowUnitGeo = null;

/** @type {Float32Array | null} */
let ambientParticleDrift = null;

/** @type {THREE.BufferGeometry | null} */
let ambientParticleGeometry = null;

/** @type {THREE.Points | null} */
let ambientParticles = null;

/** @type {THREE.InstancedMesh | null} */
let crowdCarts = null;

/**
 * Multi-mesh crowd layers (cart / person / glowstick silhouettes).
 * `crowdCarts` aliases layer[0] for any legacy single-mesh callers.
 * @type {{ mesh: THREE.InstancedMesh, baseY: Float32Array, capacity: number, fullCount: number }[]}
 */
let crowdLayers = [];

/** @type {THREE.MeshBasicMaterial | null} */
let crowdGlowMat = null;

/** @type {THREE.Mesh | null} */
let crowdGlow = null;

// * Per-instance deck height for the stadium tiers — the dance animation rewrites
// * position.y each batch, so it must restore this instead of a flat baseline.
// * Kept as the first layer's baseY for any code that still reads the flat array.
/** @type {Float32Array | null} */
let crowdBaseY = null;

// * Coliseum bowl architecture (seating shell + fascia neon) built with the crowd.
/** @type {THREE.Group | null} */
let stadiumGroup = null;

// * Additive stadium bands (fascia/parapet) whose opacity pulses with the music vibe.
/** @type {THREE.MeshBasicMaterial[]} */
let stadiumPulseMats = [];

/** @type {{
 *   target: THREE.Object3D,
 *   cone: THREE.Mesh,
 *   coneMat?: THREE.MeshBasicMaterial,
 *   light: THREE.SpotLight,
 *   index: number,
 *   baseColor?: THREE.Color,
 *   baseIntensity?: number,
 * }[]} */
let crowdSearchlightEntries = [];

/** @type {number} */
let crowdSearchlightTargetRadius = 0;

/** @type {{ light: THREE.PointLight | null, bulb: THREE.Mesh, index: number, baseOpacity: number }[]} */
let crowdPointLightEntries = [];

const crowdAnimDummy = new THREE.Object3D();
const crowdWiggleAxisY = new THREE.Vector3(0, 1, 0);
const crowdWiggleQuat = new THREE.Quaternion();

/** @type {THREE.Group | null} */
let stageGroup = null;

/** @type {{ target: THREE.Object3D, baseX: number, index: number }[]} */
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

/** @type {THREE.CanvasTexture | null} */
let ambientParticleTexture = null;

/**
 * Removes the active ambient dust system from the scene and frees GPU resources.
 */
function disposeAmbientParticles() {
  if (ambientParticles && sceneRef) sceneRef.remove(ambientParticles);
  ambientParticleGeometry?.dispose();
  ambientParticleTexture?.dispose();
  // @ts-expect-error THREE duck-typing suppress
  ambientParticles?.material?.dispose();
  ambientParticles = null;
  ambientParticleGeometry = null;
  ambientParticleDrift = null;
  ambientParticleTexture = null;
}

/**
 * Removes ambient dust (e.g. test drive — keep the floor readable).
 */
export function clearAmbientDust() {
  disposeAmbientParticles();
}

/**
 * @param {AmbientDustStyle} style
 * @param {CartColorMap} cartColors
 * @returns {number[]}
 */
function getAmbientDustPalette(style, cartColors) {
  if (style === "backrooms") return BACKROOMS_DUST_COLORS;
  if (style === "sunset") return SUNSET_DUST_COLORS;
  return [
    cartColors.pink.hex,
    cartColors.blue.hex,
    cartColors.green.hex,
    cartColors.yellow.hex,
    cartColors.neonOrange.hex,
  ];
}

/**
 * @param {AmbientDustStyle} style
 * @returns {{
 *   radius: number,
 *   height: number,
 *   size: number,
 *   opacity: number,
 *   blending: THREE.Blending,
 *   driftSpeedMin: number,
 *   driftSpeedMax: number,
 *   verticalDriftMin: number,
 *   verticalDriftMax: number,
 * }}
 */
function getAmbientDustConfig(style) {
  if (style === "backrooms") {
    return {
      radius: 50,
      height: 24,
      size: 0.17,
      opacity: 0.58,
      blending: THREE.NormalBlending,
      driftSpeedMin: 0.03,
      driftSpeedMax: 0.06,
      verticalDriftMin: 0.006,
      verticalDriftMax: 0.016,
    };
  }
  if (style === "sunset") {
    return {
      radius: 45,
      height: 26,
      size: 0.22,
      opacity: 0.68,
      blending: THREE.AdditiveBlending,
      driftSpeedMin: 0.05,
      driftSpeedMax: 0.09,
      verticalDriftMin: 0.008,
      verticalDriftMax: 0.02,
    };
  }
  return {
    radius: AMBIENT_PARTICLE_RADIUS,
    height: AMBIENT_PARTICLE_HEIGHT,
    size: 0.25,
    opacity: 0.75,
    blending: THREE.AdditiveBlending,
    driftSpeedMin: 0.08,
    driftSpeedMax: 0.18,
    verticalDriftMin: 0.015,
    verticalDriftMax: 0.05,
  };
}

/**
 * Creates drifting dust motes around the arena for the active level style.
 * @param {THREE.Scene} scene
 * @param {AmbientDustStyle} style
 * @param {CartColorMap} cartColors Palette source for rainbow dust.
 * @returns {THREE.Points}
 */
function initAmbientParticles(scene, style, cartColors) {
  const cfg = getAmbientDustConfig(style);
  ambientParticleRadius = cfg.radius;
  ambientParticleHeight = cfg.height;

  const ambientParticlePositions = new Float32Array(AMBIENT_PARTICLE_COUNT * 3);
  const ambientParticleColors = new Float32Array(AMBIENT_PARTICLE_COUNT * 3);
  ambientParticleDrift = new Float32Array(AMBIENT_PARTICLE_COUNT * 4);
  const ambientParticlePalette = getAmbientDustPalette(style, cartColors);
  const ambientParticleColor = new THREE.Color();
  const driftSpan = cfg.driftSpeedMax - cfg.driftSpeedMin;
  const vertSpan = cfg.verticalDriftMax - cfg.verticalDriftMin;

  for (let i = 0; i < AMBIENT_PARTICLE_COUNT; i++) {
    const angle = Math.random() * Math.PI * 2;
    const radius = Math.sqrt(Math.random()) * cfg.radius;
    const p = i * 3;
    const d = i * 4;

    ambientParticlePositions[p] = Math.cos(angle) * radius;
    ambientParticlePositions[p + 1] = Math.random() * cfg.height;
    ambientParticlePositions[p + 2] = Math.sin(angle) * radius;

    ambientParticleColor.setHex(
      ambientParticlePalette[Math.floor(Math.random() * ambientParticlePalette.length)],
    );
    ambientParticleColors[p] = ambientParticleColor.r;
    ambientParticleColors[p + 1] = ambientParticleColor.g;
    ambientParticleColors[p + 2] = ambientParticleColor.b;

    const driftAngle = Math.random() * Math.PI * 2;
    const driftSpeed = cfg.driftSpeedMin + Math.random() * driftSpan;
    ambientParticleDrift[d] = Math.cos(driftAngle) * driftSpeed;
    ambientParticleDrift[d + 1] = cfg.verticalDriftMin + Math.random() * vertSpan;
    ambientParticleDrift[d + 2] = Math.sin(driftAngle) * driftSpeed;
    ambientParticleDrift[d + 3] = Math.random() * Math.PI * 2;
  }

  ambientParticleGeometry = new THREE.BufferGeometry();
  ambientParticleGeometry.setAttribute(
    "position",
    new THREE.BufferAttribute(ambientParticlePositions, 3),
  );
  ambientParticleGeometry.setAttribute(
    "color",
    new THREE.BufferAttribute(ambientParticleColors, 3),
  );
  const ambientParticleTextureCanvas = document.createElement("canvas");
  ambientParticleTextureCanvas.width = 64;
  ambientParticleTextureCanvas.height = 64;
  const ambientParticleTextureCtx = ambientParticleTextureCanvas.getContext("2d");
  const ambientParticleGradient = ambientParticleTextureCtx.createRadialGradient(
    32,
    32,
    0,
    32,
    32,
    32,
  );
  ambientParticleGradient.addColorStop(0, "rgba(255, 255, 255, 1)");
  ambientParticleGradient.addColorStop(0.35, "rgba(255, 255, 255, 0.55)");
  ambientParticleGradient.addColorStop(1, "rgba(255, 255, 255, 0)");
  ambientParticleTextureCtx.fillStyle = ambientParticleGradient;
  ambientParticleTextureCtx.fillRect(0, 0, 64, 64);
  ambientParticleTexture = new THREE.CanvasTexture(ambientParticleTextureCanvas);
  ambientParticleTexture.needsUpdate = true;
  ambientParticles = new THREE.Points(
    ambientParticleGeometry,
    new THREE.PointsMaterial({
      map: ambientParticleTexture,
      size: cfg.size,
      transparent: true,
      opacity: cfg.opacity,
      vertexColors: true,
      blending: cfg.blending,
      depthWrite: false,
    }),
  );
  scene.add(ambientParticles);
  return ambientParticles;
}

/**
 * Swaps ambient dust to a level-specific preset (rainbow rave vs Backrooms white/yellow).
 * @param {AmbientDustStyle} style
 * @param {CartColorMap} cartColors
 * @returns {THREE.Points | null}
 */
export function setAmbientDustStyle(style, cartColors) {
  currentEffectStyle = style;
  disposeAmbientParticles();
  if (!sceneRef || !cartColors) return null;
  return initAmbientParticles(sceneRef, style, cartColors);
}

/**
 * Simple spectator body (torso + head) for crowd silhouette variety.
 * @returns {THREE.BufferGeometry}
 */
function buildCrowdPersonGeometry() {
  const torso = new THREE.BoxGeometry(0.48, 0.85, 0.32);
  torso.translate(0, 0.52, 0);
  const head = new THREE.SphereGeometry(0.2, 8, 6);
  head.translate(0, 1.12, 0);
  const merged = mergeGeometries([torso, head], false);
  torso.dispose();
  head.dispose();
  return merged ?? new THREE.BoxGeometry(0.45, 1.0, 0.3);
}

/**
 * Glowstick figure — thin body + raised stick (reads as rave prop from distance).
 * @returns {THREE.BufferGeometry}
 */
function buildCrowdGlowstickGeometry() {
  const body = new THREE.BoxGeometry(0.32, 0.8, 0.28);
  body.translate(0, 0.48, 0);
  const stick = new THREE.BoxGeometry(0.07, 0.65, 0.07);
  stick.translate(0.3, 1.0, 0);
  const merged = mergeGeometries([body, stick], false);
  body.dispose();
  stick.dispose();
  return merged ?? new THREE.BoxGeometry(0.3, 1.1, 0.25);
}

/**
 * Builds instanced crowd (cart / person / glowstick variants), glow ring, searchlights,
 * and point lights around the pit.
 * @param {THREE.Scene} scene
 * @param {CartColorMap} cartColors Palette source for crowd tinting.
 * @param {number} pitInnerRadius Inner pit radius used for crowd placement rings.
 */
export function initCrowd(scene, cartColors, pitInnerRadius) {
  const crowdSourceCart = buildCart(0xffffff);
  crowdSourceCart.updateMatrixWorld(true);
  const crowdCartParts = [];
  crowdSourceCart.traverse((child) => {
    if (!(child instanceof THREE.Mesh) || !child.geometry) return;
    crowdCartParts.push(child.geometry.clone().applyMatrix4(child.matrixWorld));
  });
  const cartGeo = mergeGeometries(crowdCartParts) ?? new THREE.BoxGeometry(1.2, 0.9, 2.0);
  for (const g of crowdCartParts) g.dispose();
  disposeObject3D(crowdSourceCart);
  const personGeo = buildCrowdPersonGeometry();
  const glowstickGeo = buildCrowdGlowstickGeometry();

  // * Always allocate full capacity (5000) so the quality toggle can draw all instances.
  // * Split across silhouette variants so the stands read as an audience, not a cart farm.
  crowdInstanceCount = 5000;
  const VARIANT_WEIGHTS = [0.52, 0.33, 0.15]; // cart / person / glowstick
  const capacities = VARIANT_WEIGHTS.map((w) => Math.max(1, Math.round(crowdInstanceCount * w)));
  // * Fix rounding so capacities sum exactly to crowdInstanceCount.
  capacities[0] += crowdInstanceCount - capacities.reduce((a, b) => a + b, 0);

  const variantGeos = [cartGeo, personGeo, glowstickGeo];
  // * Scale bias — people are taller unit-mesh than the cart merge, glowsticks taller still.
  const variantScaleMul = [1.0, 1.15, 1.25];
  const crowdPalette = Object.values(cartColors).map((entry) => entry.hex);
  const dummy = new THREE.Object3D();

  crowdLayers = [];
  for (let v = 0; v < variantGeos.length; v += 1) {
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const mesh = new THREE.InstancedMesh(variantGeos[v], mat, capacities[v]);
    mesh.count = 0;
    mesh.frustumCulled = true;
    crowdLayers.push({
      mesh,
      baseY: new Float32Array(capacities[v]),
      capacity: capacities[v],
      fullCount: capacities[v],
    });
  }
  // * Legacy alias — first layer is still the cart InstancedMesh.
  crowdCarts = crowdLayers[0]?.mesh ?? null;
  crowdBaseY = crowdLayers[0]?.baseY ?? null;

  // * Stadium bowl — three banked spectator decks (coliseum) instead of a flat
  // * annulus. Radii derive from pitInnerRadius (≈44.3): a 3m "moat" at the pit rim,
  // * then lower bowl / mid deck / upper deck at rake 0.4 with 5m fascia gaps.
  const CROWD_RAKE = 0.4;
  const decks = [
    { r0: pitInnerRadius + 2.7, r1: pitInnerRadius + 28.7, y0: -2.9 },
    { r0: pitInnerRadius + 33.7, r1: pitInnerRadius + 55.7, y0: 12 },
    { r0: pitInnerRadius + 59.7, r1: pitInnerRadius + 79.7, y0: 25 },
  ];
  const deckWeights = decks.map((d) => d.r1 * d.r1 - d.r0 * d.r0);
  const deckWeightSum = deckWeights.reduce((sum, w) => sum + w, 0);
  const stageWedgeHalf = Math.PI * 0.1; // ±18° of the lower bowl belongs to the stage
  const crowdTilt = Math.atan(CROWD_RAKE);
  const tiltQuat = new THREE.Quaternion();
  const tiltAxis = new THREE.Vector3();
  const layerWriteIdx = capacities.map(() => 0);
  const weightPrefix = [];
  let wAcc = 0;
  for (const w of VARIANT_WEIGHTS) {
    wAcc += w;
    weightPrefix.push(wAcc);
  }

  for (let i = 0; i < crowdInstanceCount; i += 1) {
    // * Deck picked by annulus area so density stays uniform across the bowl.
    let pick = Math.random() * deckWeightSum;
    let deckIndex = 0;
    while (deckIndex < decks.length - 1 && pick > deckWeights[deckIndex]) {
      pick -= deckWeights[deckIndex];
      deckIndex += 1;
    }
    const deck = decks[deckIndex];
    // * Lower bowl skips the stage wedge at angle 0 — the stage owns that
    // * grandstand end; mid/upper decks rise behind it like end-stand seating.
    const angle = deckIndex === 0
      ? stageWedgeHalf + Math.random() * (Math.PI * 2 - stageWedgeHalf * 2)
      : Math.random() * Math.PI * 2;
    // * sqrt-lerp of r² keeps per-area density uniform within the deck.
    const r = Math.sqrt(deck.r0 * deck.r0 + Math.random() * (deck.r1 * deck.r1 - deck.r0 * deck.r0));
    const y = deck.y0 + (r - deck.r0) * CROWD_RAKE;
    const x = Math.cos(angle) * r;
    const z = Math.sin(angle) * r;

    // * Weighted variant pick; spill into first layer if a bucket is full.
    const roll = Math.random();
    let variant = 0;
    while (variant < weightPrefix.length - 1 && roll >= weightPrefix[variant]) variant += 1;
    if (layerWriteIdx[variant] >= capacities[variant]) {
      variant = layerWriteIdx.findIndex((n, vi) => n < capacities[vi]);
      if (variant < 0) continue;
    }
    const layer = crowdLayers[variant];
    const li = layerWriteIdx[variant];
    layerWriteIdx[variant] += 1;

    const scale = (0.25 + Math.random() * 0.2) * variantScaleMul[variant];
    dummy.position.set(x, y, z);
    dummy.scale.set(scale, scale, scale);
    // * Same inward-facing yaw as before; the tilt quaternion then leans the figure
    // * about the ring tangent so it sits on the banked deck looking down at the field.
    dummy.rotation.set(0, angle + Math.PI + (Math.random() - 0.5) * 0.8, 0);
    tiltAxis.set(-Math.sin(angle), 0, Math.cos(angle));
    tiltQuat.setFromAxisAngle(tiltAxis, crowdTilt);
    dummy.quaternion.premultiply(tiltQuat);
    dummy.updateMatrix();
    layer.mesh.setMatrixAt(li, dummy.matrix);
    layer.baseY[li] = y;
    const baseColor = new THREE.Color(crowdPalette[Math.floor(Math.random() * crowdPalette.length)]);
    // * Glowstick layer biases brighter (they are the "sparkle" props); others mostly dim.
    const glowChance = variant === 2 ? 0.55 : 0.1;
    baseColor.multiplyScalar(Math.random() < glowChance ? 1.75 : 0.62);
    layer.mesh.setColorAt(li, baseColor);
  }

  const lowQ = isLowQualityMode();
  const lowQRatio = 800 / crowdInstanceCount;
  for (let v = 0; v < crowdLayers.length; v += 1) {
    const layer = crowdLayers[v];
    layer.fullCount = layerWriteIdx[v];
    layer.mesh.count = lowQ
      ? Math.max(layer.fullCount > 0 ? 1 : 0, Math.round(layer.fullCount * lowQRatio))
      : layer.fullCount;
    layer.mesh.instanceMatrix.needsUpdate = true;
    if (layer.mesh.instanceColor) layer.mesh.instanceColor.needsUpdate = true;
    scene.add(layer.mesh);
  }

  // * Glow ring shrunk from the old 80m crowd carpet to the 3m moat between pit rim
  // * and the lower bowl — reads as the glowing field boundary of the stadium.
  const crowdGlowGeo = new THREE.RingGeometry(pitInnerRadius, decks[0].r0, 64);
  crowdGlowMat = new THREE.MeshBasicMaterial({
    color: 0xff00ff,
    transparent: true,
    opacity: 0.08,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  crowdGlow = new THREE.Mesh(crowdGlowGeo, crowdGlowMat);
  crowdGlow.rotation.x = -Math.PI / 2;
  crowdGlow.position.y = -2.95;
  scene.add(crowdGlow);

  // * Seating shell — one lathed bowl surface under the crowd instances so the tiers
  // * read as risers instead of floating carts: moat floor, three raked decks with
  // * diagonal riser faces between them, and a short parapet at the top rim.
  stadiumGroup = new THREE.Group();
  {
    const shellSurfaceY = -0.1; // shell sits just under the carts' wheel baseline
    const topDeck = decks[decks.length - 1];
    const parapetY = topDeck.y0 + (topDeck.r1 - topDeck.r0) * CROWD_RAKE + 2.5;
    const shellMat = new THREE.MeshStandardMaterial({
      color: 0x14121f,
      metalness: 0.4,
      roughness: 0.8,
      side: THREE.DoubleSide,
    });

    // * The shell is two lathes so only the lower bowl opens a ±18° stage bay while
    // * the mid/upper decks run as full rings behind and above the stage (matching
    // * the crowd, which is only wedge-carved on the lower deck). Lathe phi=0 points
    // * at +Z and the stage sits at +X (angle 0 in cos/sin convention) — hence the
    // * π/2 offset on the carved lathe.
    const lowerPoints = [
      new THREE.Vector2(pitInnerRadius, -3),
      new THREE.Vector2(decks[0].r0, decks[0].y0 + shellSurfaceY),
      new THREE.Vector2(
        decks[0].r1,
        decks[0].y0 + shellSurfaceY + (decks[0].r1 - decks[0].r0) * CROWD_RAKE,
      ),
    ];
    const lowerShellGeo = new THREE.LatheGeometry(
      lowerPoints, 96,
      Math.PI / 2 + stageWedgeHalf,
      Math.PI * 2 - stageWedgeHalf * 2,
    );
    stadiumGroup.add(new THREE.Mesh(lowerShellGeo, shellMat));

    // * Full ring: rises from the ground as the stage bay's back wall (visible in
    // * the wedge behind the stage), then carries the mid/upper decks and parapet.
    const upperPoints = [new THREE.Vector2(decks[1].r0, -3)];
    for (const deck of decks.slice(1)) {
      upperPoints.push(new THREE.Vector2(deck.r0, deck.y0 + shellSurfaceY));
      upperPoints.push(new THREE.Vector2(
        deck.r1,
        deck.y0 + shellSurfaceY + (deck.r1 - deck.r0) * CROWD_RAKE,
      ));
    }
    upperPoints.push(new THREE.Vector2(topDeck.r1, parapetY));
    const upperShellGeo = new THREE.LatheGeometry(upperPoints, 96);
    stadiumGroup.add(new THREE.Mesh(upperShellGeo, shellMat));

    // * Fascia neon — one additive band riding each deck-break riser (magenta then
    // * cyan), the "deck edge" read of a televised arena bowl. No lights, bloom does
    // * the lifting. The lower band carves the stage wedge like the shell (it would
    // * cut across the stage otherwise); the upper band passes above the truss and
    // * stays a full ring. All bands pulse via stadiumPulseMats in updateCrowd.
    stadiumPulseMats = [];
    const bandThetaStart = Math.PI / 2 + stageWedgeHalf;
    const bandThetaLength = Math.PI * 2 - stageWedgeHalf * 2;
    const fasciaDefs = [
      { deck: decks[0], color: 0xff2bd6, carve: true },
      { deck: decks[1], color: 0x2bd6ff, carve: false },
    ];
    for (const def of fasciaDefs) {
      const topY = def.deck.y0 + shellSurfaceY + (def.deck.r1 - def.deck.r0) * CROWD_RAKE;
      const bandGeo = def.carve
        ? new THREE.CylinderGeometry(def.deck.r1 + 0.3, def.deck.r1 + 0.3, 0.5, 96, 1, true, bandThetaStart, bandThetaLength)
        : new THREE.CylinderGeometry(def.deck.r1 + 0.3, def.deck.r1 + 0.3, 0.5, 96, 1, true);
      const bandMat = new THREE.MeshBasicMaterial({
        color: def.color,
        transparent: true,
        opacity: 0.7,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      bandMat.userData.baseOpacity = 0.7;
      stadiumPulseMats.push(bandMat);
      const band = new THREE.Mesh(bandGeo, bandMat);
      band.position.y = topY + 0.8;
      stadiumGroup.add(band);
    }

    // * Parapet skyline ring at the top rim + a light strip along each deck's front
    // * edge — cheap additive bands that blend the crowd bowl into the arena glow.
    const parapetMat = new THREE.MeshBasicMaterial({
      color: 0xff2bd6,
      transparent: true,
      opacity: 0.45,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    parapetMat.userData.baseOpacity = 0.45;
    stadiumPulseMats.push(parapetMat);
    const parapetBand = new THREE.Mesh(
      new THREE.CylinderGeometry(topDeck.r1 + 0.4, topDeck.r1 + 0.4, 0.6, 96, 1, true),
      parapetMat,
    );
    parapetBand.position.y = parapetY - 0.3;
    stadiumGroup.add(parapetBand);

    for (let d = 0; d < decks.length; d += 1) {
      const deck = decks[d];
      const stripMat = new THREE.MeshBasicMaterial({
        color: 0xa229e6,
        transparent: true,
        opacity: 0.35,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      // * Only the lower strip carves the stage bay; mid/upper decks are full rings.
      const stripGeo = d === 0
        ? new THREE.CylinderGeometry(deck.r0 + 0.15, deck.r0 + 0.15, 0.35, 96, 1, true, bandThetaStart, bandThetaLength)
        : new THREE.CylinderGeometry(deck.r0 + 0.15, deck.r0 + 0.15, 0.35, 96, 1, true);
      const strip = new THREE.Mesh(stripGeo, stripMat);
      strip.position.y = deck.y0 + 0.15;
      stadiumGroup.add(strip);
    }

    // * Light masts — one InstancedMesh of slim truss masts (plus one of additive
    // * beacon tips): 4 in the deck-break gap topping out exactly where the existing
    // * crowd searchlights already float (grounding them without moving any light),
    // * and 8 around the upper rim for the coliseum skyline.
    const mastHeight = 17;
    const mastDefs = [];
    for (let i = 0; i < 4; i += 1) {
      // * Matches the searchlight ring: angle i·90°, r = pitInnerRadius + 30, y = 25.
      mastDefs.push({ angle: i * Math.PI * 0.5, r: pitInnerRadius + 30, topY: 25 });
    }
    const rimDeck = decks[decks.length - 1];
    const rimTopY = rimDeck.y0 + shellSurfaceY + (rimDeck.r1 - rimDeck.r0) * CROWD_RAKE;
    for (let i = 0; i < 8; i += 1) {
      mastDefs.push({
        angle: (i + 0.5) * Math.PI * 0.25,
        r: rimDeck.r1,
        topY: rimTopY + mastHeight,
      });
    }
    const mastGeo = new THREE.BoxGeometry(0.5, mastHeight, 0.5);
    const mastMat = new THREE.MeshStandardMaterial({ color: 0x1a1826, metalness: 0.7, roughness: 0.5 });
    const masts = new THREE.InstancedMesh(mastGeo, mastMat, mastDefs.length);
    const tipGeo = new THREE.BoxGeometry(0.9, 0.9, 0.9);
    const tipMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.7,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const mastTips = new THREE.InstancedMesh(tipGeo, tipMat, mastDefs.length);
    const tipColor = new THREE.Color();
    for (let i = 0; i < mastDefs.length; i += 1) {
      const def = mastDefs[i];
      const mx = Math.cos(def.angle) * def.r;
      const mz = Math.sin(def.angle) * def.r;
      dummy.position.set(mx, def.topY - mastHeight / 2, mz);
      dummy.scale.set(1, 1, 1);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      masts.setMatrixAt(i, dummy.matrix);
      dummy.position.y = def.topY + 0.45;
      dummy.updateMatrix();
      mastTips.setMatrixAt(i, dummy.matrix);
      mastTips.setColorAt(i, tipColor.setHex(i % 2 === 0 ? 0xff2bd6 : 0x2bd6ff));
    }
    stadiumGroup.add(masts);
    stadiumGroup.add(mastTips);
    scene.add(stadiumGroup);
  }

  crowdSearchlightEntries = [];
  const crowdSearchlightSourceRadius = pitInnerRadius + 30;
  crowdSearchlightTargetRadius = pitInnerRadius + 35;
  for (let i = 0; i < 4; i += 1) {
    const angle = i * Math.PI * 0.5;
    const target = new THREE.Object3D();
    target.position.set(
      Math.cos(angle) * crowdSearchlightTargetRadius,
      -3,
      Math.sin(angle) * crowdSearchlightTargetRadius,
    );
    scene.add(target);

    const baseColor = new THREE.Color(CROWD_SEARCHLIGHT_COLORS[i]);
    const searchlight = new THREE.SpotLight(
      CROWD_SEARCHLIGHT_COLORS[i],
      30,
      200,
      Math.PI * 0.35,
      0.8,
      1.5,
    );
    searchlight.position.set(
      Math.cos(angle) * crowdSearchlightSourceRadius,
      25,
      Math.sin(angle) * crowdSearchlightSourceRadius,
    );
    searchlight.target = target;
    scene.add(searchlight);

    const coneMat = new THREE.MeshBasicMaterial({
      color: baseColor.clone(),
      transparent: true,
      opacity: 0.06,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    coneMat.userData.baseOpacity = 0.06;
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(12, 30, 16, 1, true),
      coneMat,
    );
    cone.position.copy(searchlight.position);
    cone.lookAt(target.position);
    cone.rotateX(-Math.PI / 2);
    scene.add(cone);
    crowdSearchlightEntries.push({
      target,
      cone,
      coneMat,
      light: searchlight,
      index: i,
      baseColor,
      baseIntensity: 30,
    });
  }

  // * Crowd "party lights": mostly emissive bulbs (cheap). Only a handful of real
  // * PointLights remain for subtle bowl fill — 32 live lights was pure mud + cost.
  crowdPointLightEntries = [];
  const crowdPointLightRadiusMin = pitInnerRadius + 10;
  const crowdPointLightRadiusRange = 35;
  const CROWD_BULB_COUNT = 24;
  const CROWD_REAL_LIGHT_COUNT = 4;
  const crowdBulbGeo = new THREE.SphereGeometry(0.3, 8, 8);
  for (let i = 0; i < CROWD_BULB_COUNT; i += 1) {
    const angle = (i / CROWD_BULB_COUNT) * Math.PI * 2;
    const radius = crowdPointLightRadiusMin + Math.random() * crowdPointLightRadiusRange;
    const y = 1 + Math.random() * 6;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    const color = crowdPalette[i % crowdPalette.length];
    const baseOpacity = 0.55 + Math.random() * 0.25;

    /** @type {THREE.PointLight | null} */
    let light = null;
    if (i < CROWD_REAL_LIGHT_COUNT) {
      // * Slightly warmer intensity than the old per-bulb 4 so 4 lights still read.
      light = new THREE.PointLight(color, 7, 55, 2);
      light.position.set(x, y, z);
      scene.add(light);
    }

    const lightBulb = new THREE.Mesh(
      crowdBulbGeo,
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: baseOpacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    lightBulb.position.set(x, y, z);
    // * Real-light bulbs slightly larger so the "powered" fixtures read.
    if (light) lightBulb.scale.setScalar(1.35);
    scene.add(lightBulb);
    crowdPointLightEntries.push({ light, bulb: lightBulb, index: i, baseOpacity });
  }
}

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
 * Sets the crowd InstancedMesh draw-count without reallocating GPU memory.
 * Call during quality toggle so the full capacity can be drawn in High Quality,
 * or capped proportionally (~800 total) in Low Quality.
 *
 * @param {boolean} lowQuality
 */
export function setQualityCrowdCount(lowQuality) {
  if (crowdLayers.length === 0) {
    if (!crowdCarts) return;
    crowdCarts.count = lowQuality ? 800 : crowdInstanceCount;
    return;
  }
  const ratio = lowQuality ? 800 / crowdInstanceCount : 1;
  for (const layer of crowdLayers) {
    layer.mesh.count = lowQuality
      ? Math.max(layer.fullCount > 0 ? 1 : 0, Math.round(layer.fullCount * ratio))
      : layer.fullCount;
  }
}

const _crowdReactiveColor = new THREE.Color();

/**
 * Animates crowd searchlights, point lights, glow ring, and instanced cart wiggle/bounce.
 * @param {number} nowMs Current time (ms).
 */
export function updateCrowd(nowMs) {
  const reactive = sampleArenaReactive(nowMs);
  const leaderMix = reactive.hasLeader ? 0.38 : 0;
  const koT = reactive.koT;

  if (crowdSearchlightEntries.length > 0) {
    const nowSec = nowMs * 0.001;
    for (const entry of crowdSearchlightEntries) {
      const speed = CROWD_SEARCHLIGHT_SPEEDS[entry.index % CROWD_SEARCHLIGHT_SPEEDS.length] || 0.3;
      const angle = nowSec * speed + entry.index * Math.PI * 0.5;
      entry.target.position.x = Math.cos(angle) * crowdSearchlightTargetRadius;
      entry.target.position.y = -3;
      entry.target.position.z = Math.sin(angle) * crowdSearchlightTargetRadius;
      entry.target.updateMatrix();
      entry.cone.lookAt(entry.target.position);
      entry.cone.rotateX(-Math.PI / 2);
      const baseI = entry.baseIntensity ?? 30;
      const wobble = 0.65 + 0.35 * Math.sin(nowSec * 1.1 + entry.index);
      entry.light.intensity = baseI * wobble * reactive.intensityMul;
      if (entry.baseColor) {
        _crowdReactiveColor.copy(entry.baseColor).lerp(reactive.accentColor, leaderMix + koT * 0.55);
        entry.light.color.copy(_crowdReactiveColor);
        if (entry.coneMat) {
          entry.coneMat.color.copy(_crowdReactiveColor);
          entry.coneMat.opacity = (entry.coneMat.userData.baseOpacity ?? 0.06) * (1 + koT * 1.2);
        }
      }
    }
  }

  if (crowdPointLightEntries.length > 0) {
    const nowSec = nowMs * 0.001;
    for (const entry of crowdPointLightEntries) {
      const wave = Math.sin(nowSec * 1.5 + entry.index * 0.8);
      if (entry.light) {
        entry.light.intensity = 5 + wave * 3.5;
      }
      // * All bulbs pulse opacity so the visual ring stays lively without 24 real lights.
      const bulbMat = entry.bulb?.material;
      if (bulbMat && !Array.isArray(bulbMat) && typeof bulbMat.opacity === "number") {
        const base = entry.baseOpacity ?? 0.65;
        bulbMat.opacity = base * (0.72 + 0.28 * (0.5 + 0.5 * wave));
      }
    }
  }

  if (crowdGlowMat) {
    const nowSec = nowMs * 0.001;
    crowdGlowMat.opacity = (0.13 + Math.sin(nowSec * 0.35) * 0.05) * (1 + koT * 0.9);
    if (reactive.hasLeader || koT > 0) {
      crowdGlowMat.color.copy(reactive.accentColor);
    } else {
      crowdGlowMat.color.setHex(0xff00ff);
    }
  }

  if (stadiumPulseMats.length > 0) {
    const nowSec = nowMs * 0.001;
    for (let i = 0; i < stadiumPulseMats.length; i += 1) {
      const mat = stadiumPulseMats[i];
      mat.opacity = mat.userData.baseOpacity * (0.8 + Math.sin(nowSec * 1.3 + i * 1.7) * 0.25) * (1 + koT * 0.5);
    }
  }

  if (crowdLayers.length > 0) {
    const nowSec = nowMs * 0.001;
    // * Round-robin a batch across each layer so multi-mesh crowds stay lively
    // * without rewriting every instance every frame.
    for (let li = 0; li < crowdLayers.length; li += 1) {
      const layer = crowdLayers[li];
      const n = layer.mesh.count;
      if (n <= 0) continue;
      const batchSize = Math.max(40, Math.floor(200 / crowdLayers.length));
      const batches = Math.max(1, Math.ceil(n / batchSize));
      const offset = Math.floor(nowSec * 4 + li) % batches;
      const start = offset * batchSize;
      const end = Math.min(start + batchSize, n);
      for (let i = start; i < end; i += 1) {
        layer.mesh.getMatrixAt(i, crowdAnimDummy.matrix);
        crowdAnimDummy.matrix.decompose(
          crowdAnimDummy.position,
          crowdAnimDummy.quaternion,
          crowdAnimDummy.scale,
        );

        const energy = ((i * 7919 + li * 104729) % 100) / 100;
        const baseFreq = 3;
        const baseAmp = 0.3;

        let bounce = 0;
        let wiggleYaw = 0;
        if (energy > 0.7) {
          bounce = Math.abs(Math.sin(nowSec * baseFreq * 1.5 + i * 0.7)) * (baseAmp * 1.8);
          wiggleYaw = Math.sin(nowSec * 6.0 + i * 0.9) * (0.18 * ((energy - 0.7) / 0.3));
        } else if (energy < 0.3) {
          bounce = Math.sin(nowSec * baseFreq * 0.5 + i * 0.45) * (baseAmp * 0.12);
          wiggleYaw = Math.sin(nowSec * 0.8 + i * 0.6) * 0.04;
        } else {
          bounce = Math.abs(Math.sin(nowSec * baseFreq + i * 0.7)) * baseAmp;
        }

        // * Restore the instance's own deck height — a flat baseline here would
        // * silently flatten the stadium tiers as the batch cycles through.
        crowdAnimDummy.position.y = layer.baseY[i] + bounce;
        if (wiggleYaw !== 0) {
          crowdWiggleQuat.setFromAxisAngle(crowdWiggleAxisY, wiggleYaw);
          crowdAnimDummy.quaternion.multiply(crowdWiggleQuat);
        }
        crowdAnimDummy.updateMatrix();
        layer.mesh.setMatrixAt(i, crowdAnimDummy.matrix);
      }
      layer.mesh.instanceMatrix.needsUpdate = true;
    }
  } else if (crowdCarts) {
    // * Fallback for any path that only set the legacy single mesh.
    const nowSec = nowMs * 0.001;
    const batchSize = 200;
    const offset = Math.floor(nowSec * 4) % Math.ceil(crowdInstanceCount / batchSize);
    const start = offset * batchSize;
    const end = Math.min(start + batchSize, crowdInstanceCount);
    for (let i = start; i < end; i++) {
      crowdCarts.getMatrixAt(i, crowdAnimDummy.matrix);
      crowdAnimDummy.matrix.decompose(crowdAnimDummy.position, crowdAnimDummy.quaternion, crowdAnimDummy.scale);
      const energy = ((i * 7919) % 100) / 100;
      let bounce = Math.abs(Math.sin(nowSec * 3 + i * 0.7)) * 0.3;
      if (energy > 0.7) bounce *= 1.8;
      else if (energy < 0.3) bounce *= 0.12;
      crowdAnimDummy.position.y = (crowdBaseY ? crowdBaseY[i] : -2.9) + bounce;
      crowdAnimDummy.updateMatrix();
      crowdCarts.setMatrixAt(i, crowdAnimDummy.matrix);
    }
    crowdCarts.instanceMatrix.needsUpdate = true;
  }
}

/**
 * Initializes the trash particle pool and ram-boost streak storage.
 * @param {THREE.Scene} scene Scene that owns effect meshes.
 * @param {{ ramBoost?: RamBoostVisualConfig, cartColors?: CartColorMap }} [options] Typically `{ ramBoost: CONFIG.cart.ramBoost, cartColors: CART_COLORS }`.
 * @returns {{ ramBoostStreaks: typeof ramBoostStreaks, ambientParticles: THREE.Points | null }}
 */
export function initEffects(scene, options = {}) {
  sceneRef = scene;
  ramBoostConfig = options.ramBoost ?? null;
  ramBoostStreaks = [];
  ramBoostStreakFreeList = [];
  if (ramBoostConfig) ensureStreakGeometries(ramBoostConfig);

  trashPool = [];
  trashGeo = new THREE.BoxGeometry(0.15, 0.15, 0.15);
  trashMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true });

  for (let i = 0; i < TRASH_POOL_SIZE; i++) {
    const m = new THREE.Mesh(trashGeo, trashMat.clone());
    m.visible = false;
    m.userData.vel = new THREE.Vector3();
    m.userData.angVel = new THREE.Vector3();
    m.userData.life = 0;
    m.userData.maxLife = 0;
    scene.add(m);
    trashPool.push(m);
  }

  const opt = /** @type {Record<string, any>} */ (options);
  if (opt.cartColors && opt.ambientDustStyle) {
    setAmbientDustStyle(opt.ambientDustStyle, opt.cartColors);
  }

  if (isLowQualityMode()) {
    setRaveExtrasVisible(false);
  }

  return { ramBoostStreaks, ambientParticles };
}

/**
 * Spawns a burst of trash particles at `position`.
 * @param {{ x: number, y: number, z: number }} position World-space origin.
 * @param {number} intensity 0–1+ style intensity scaler.
 * @param {"cart" | "floor" | "edge"} [type] Burst profile.
 * @param {{ isBoosting?: boolean }} [opts] Optional ram FX modifiers.
 */
export function spawnTrashBurst(position, intensity, type = "cart", opts = {}) {
  const isBoosting = Boolean(opts.isBoosting);
  const clampedI = clamp(intensity, 0, 1.35);
  const fx = /** @type {Record<string, any>} */ (CONFIG.ramming?.fx ?? {});
  const isBackroomsFloor = type === "floor" && currentEffectStyle === "backrooms";

  let count;
  if (type === "floor") {
    count = isBackroomsFloor
      ? Math.floor(4 + clampedI * 6)
      : Math.floor(4 + clampedI * 5);
  } else if (type === "edge") {
    count = Math.floor(6 + clampedI * 10);
  } else {
    const base = fx.particleCountBase ?? 8;
    const perI = fx.particleCountPerIntensity ?? 16;
    const boostBonus = isBoosting ? (fx.particleBoostCountBonus ?? 5) : 0;
    const maxCount = fx.particleMaxCount ?? 28;
    count = Math.min(Math.floor(base + clampedI * perI + boostBonus), maxCount);
  }

  const sizeMul =
    (0.85 + clampedI * 1.05) *
    (type === "floor" ? (isBackroomsFloor ? 0.52 : 0.65) : 1.0) *
    (isBoosting && type === "cart" ? 1.22 : 1.0);
  const velScale = (1 + clampedI * 0.45) * (isBoosting && type === "cart" ? 1.18 : 1.0)
    * (isBackroomsFloor ? 0.58 : 1.0);

  let spawned = 0;
  for (let i = 0; i < trashPool.length && spawned < count; i++) {
    const p = trashPool[i];
    if (p.visible) continue;
    p.position.set(position.x, position.y + (type === "floor" ? 0.05 : 0.5), position.z);
    p.userData.baseScale = sizeMul * (0.92 + Math.random() * 0.16);
    p.scale.setScalar(p.userData.baseScale * (isBackroomsFloor ? 0.5 : 1.0));
    if (type === "floor") {
      const colors = isBackroomsFloor
        ? BACKROOMS_FLOOR_DUST_COLORS
        : [0x551a8b, 0xff00ff, 0x333333];
      const mat = /** @type {THREE.MeshBasicMaterial} */ (p.material);
      mat.color.setHex(colors[Math.floor(Math.random() * colors.length)]);
    } else if (type === "edge") {
      const colors = [0xff00ff, 0x00ffff, 0xffffff];
      const mat = /** @type {THREE.MeshBasicMaterial} */ (p.material);
      mat.color.setHex(colors[Math.floor(Math.random() * colors.length)]);
    } else {
      const mat = /** @type {THREE.MeshBasicMaterial} */ (p.material);
      mat.color.setHex(TRASH_NEON_COLORS[Math.floor(Math.random() * TRASH_NEON_COLORS.length)]);
    }
    const mat = /** @type {THREE.MeshBasicMaterial} */ (p.material);
    mat.opacity = isBackroomsFloor ? 0.78 : 1;
    p.visible = true;
    p.userData.isDust = isBackroomsFloor;
    if (type === "floor") {
      const angle = Math.random() * Math.PI * 2;
      if (isBackroomsFloor) {
        const sp = (1.6 + Math.random() * 3.2) * clampedI * velScale;
        p.userData.vel.set(
          Math.cos(angle) * sp,
          0.55 + Math.random() * 1.1,
          Math.sin(angle) * sp,
        );
      } else {
        const sp = (3 + Math.random() * 5) * clampedI * velScale;
        p.userData.vel.set(
          Math.cos(angle) * sp,
          1.5 + Math.random() * 2.5,
          Math.sin(angle) * sp,
        );
      }
    } else if (type === "edge") {
      const toCenter = new THREE.Vector3(-position.x, 0, -position.z).normalize();
      const spreadX = (Math.random() - 0.5) * 3;
      const spreadZ = (Math.random() - 0.5) * 3;
      p.userData.vel.set(
        toCenter.x * (6 + Math.random() * 6) * clampedI * velScale + spreadX,
        2 + Math.random() * 4 * clampedI * velScale,
        toCenter.z * (6 + Math.random() * 6) * clampedI * velScale + spreadZ,
      );
    } else {
      p.userData.vel.set(
        (Math.random() - 0.5) * 10 * clampedI * velScale,
        (4 + Math.random() * 5) * clampedI * velScale,
        (Math.random() - 0.5) * 10 * clampedI * velScale,
      );
    }
    p.rotation.set(0, 0, 0);
    // * Subtle random tumble — full rotation cycle roughly 0.5-1.5s per axis.
    p.userData.angVel.set(
      (Math.random() - 0.5) * (Math.PI * 2 / (0.5 + Math.random())),
      (Math.random() - 0.5) * (Math.PI * 2 / (0.5 + Math.random())),
      (Math.random() - 0.5) * (Math.PI * 2 / (0.5 + Math.random())),
    );
    p.userData.life = 0;
    p.userData.maxLife = type === "floor"
      ? (isBackroomsFloor
        ? 0.62 + Math.random() * 0.28
        : 0.35 + Math.random() * 0.15)
      : 0.38 + Math.random() * 0.22 + clampedI * 0.08;
    spawned++;
  }
}

/**
 * Advances active trash particles (gravity, fade, pool recycle).
 * @param {number} dt Frame delta (seconds).
 */
export function updateTrashParticles(dt) {
  const isRunning = GameState.getRoundState().phase === "running";

  // * During podium / lobby, accelerate cleanup so particles don't freeze mid-air.
  const fadeSpeed = isRunning ? 1 : 3;

  let anyVisible = false;
  for (let i = 0; i < trashPool.length; i++) {
    const p = trashPool[i];
    if (!p.visible) continue;
    anyVisible = true;

    p.userData.life += dt * fadeSpeed;
    if (p.userData.life >= p.userData.maxLife) {
      p.visible = false;
      continue;
    }
    const t = p.userData.life / p.userData.maxLife;
    p.position.x += p.userData.vel.x * dt;
    p.position.y += p.userData.vel.y * dt;
    p.position.z += p.userData.vel.z * dt;
    p.userData.vel.y -= (p.userData.isDust ? 2.2 : 9.8) * dt;
    p.rotation.x += p.userData.angVel.x * dt;
    p.rotation.y += p.userData.angVel.y * dt;
    p.rotation.z += p.userData.angVel.z * dt;
    const dustScale = p.userData.isDust ? 0.5 : 1.0;
    p.scale.setScalar(p.userData.baseScale * (1 - t) * dustScale);
    // @ts-expect-error THREE duck-typing suppress
    p.material.opacity = p.userData.isDust
      ? (0.78 * (1 - t))
      : (1 - t);
  }

  // * Early return only if no particles are visible at all.
  if (!anyVisible && !isRunning) return;
}

/**
 * Advances ambient neon drift particles (wave motion, cylindrical wrap, vertical recycle).
 * @param {number} dt Frame delta (seconds).
 * @param {number} nowMs Current time (ms).
 */
export function updateAmbientParticles(dt, nowMs) {
  if (!ambientParticleGeometry || !ambientParticleDrift) return;

  const nowSec = nowMs * 0.001;
  const positions = ambientParticleGeometry.attributes.position.array;

  for (let i = 0; i < AMBIENT_PARTICLE_COUNT; i++) {
    const p = i * 3;
    const d = i * 4;
    const wave = Math.sin(nowSec * 0.55 + ambientParticleDrift[d + 3]) * 0.04;

    positions[p] += (ambientParticleDrift[d] + wave) * dt;
    positions[p + 1] += ambientParticleDrift[d + 1] * dt;
    positions[p + 2] += (ambientParticleDrift[d + 2] - wave) * dt;

    const x = positions[p];
    const z = positions[p + 2];
    const r = Math.hypot(x, z);
    if (r > ambientParticleRadius) {
      const wrapScale = -ambientParticleRadius / r;
      positions[p] = x * wrapScale;
      positions[p + 2] = z * wrapScale;
    }
    if (positions[p + 1] > ambientParticleHeight) positions[p + 1] = 0;
    if (positions[p + 1] < 0) positions[p + 1] = ambientParticleHeight;
  }

  ambientParticleGeometry.attributes.position.needsUpdate = true;
}

/**
 * Builds shared unit streak geometries (scaled per instance for perf).
 * @param {RamBoostVisualConfig} rb
 */
function ensureStreakGeometries(rb) {
  const tipScale = rb.streakTipRadiusScale ?? 0.12;
  const glowMul = rb.streakGlowRadiusMul ?? 3.6;
  if (!streakCoreUnitGeo) {
    streakCoreUnitGeo = new THREE.CylinderGeometry(tipScale, 1, 1, 6, 1);
  }
  if (!streakGlowUnitGeo) {
    streakGlowUnitGeo = new THREE.CylinderGeometry(tipScale * 1.15, glowMul, 1, 6, 1);
  }
}

/**
 * Pushes cart color toward anime-neon saturation/brightness.
 * @param {number} hex
 * @param {RamBoostVisualConfig} rb
 * @returns {THREE.Color}
 */
function getAnimeStreakColor(hex, rb) {
  const satMul = rb.streakSaturationMul ?? 1.5;
  const brightMul = rb.streakBrightnessMul ?? 1.3;
  ramBoostStreakColorScratch.setHex(hex);
  ramBoostStreakColorScratch.getHSL(ramBoostStreakHslScratch);
  ramBoostStreakColorScratch.setHSL(
    ramBoostStreakHslScratch.h,
    Math.min(1, ramBoostStreakHslScratch.s * satMul),
    Math.min(0.85, ramBoostStreakHslScratch.l * brightMul),
  );
  return ramBoostStreakColorScratch;
}

/**
 * Builds a fresh (inactive) streak pool entry — shared unit geometries, own materials.
 * @returns {RamBoostStreakEntry}
 */
function buildStreakEntry() {
  const coreMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const glowMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const coreMesh = new THREE.Mesh(streakCoreUnitGeo, coreMat);
  const glowMesh = new THREE.Mesh(streakGlowUnitGeo, glowMat);
  const group = new THREE.Group();
  group.add(glowMesh);
  group.add(coreMesh);
  return {
    group,
    coreMesh,
    glowMesh,
    coreMat,
    glowMat,
    birthMs: 0,
    durationMs: 0,
    cart: null,
    baseRadius: 0,
    length: 0,
  };
}

/**
 * Gets a streak entry to (re)activate: reuse a freed entry, lazily build up to
 * `maxActive`, or — once the pool is fully built and active — recycle the
 * oldest active streak (matching the legacy trim-oldest behavior).
 * @param {number} maxActive
 * @returns {RamBoostStreakEntry}
 */
function acquireStreakEntry(maxActive) {
  const freed = ramBoostStreakFreeList.pop();
  if (freed) {
    sceneRef.add(freed.group);
    return freed;
  }
  if (ramBoostStreaks.length < maxActive) {
    const built = buildStreakEntry();
    sceneRef.add(built.group);
    return built;
  }
  // * Pool is fully built and fully active — recycle the oldest active streak in place.
  const oldest = ramBoostStreaks.shift();
  if (oldest) return oldest;
  // * Should be unreachable (maxActive > 0 guarantees the pool is non-empty), but stay safe.
  const fallback = buildStreakEntry();
  sceneRef.add(fallback.group);
  return fallback;
}

/**
 * @param {object} cart
 * @param {number} birthMs
 * @param {{ lateral?: number, lengthMul?: number }} [variant]
 */
function spawnRamBoostStreakForCart(cart, birthMs, variant = {}) {
  if (!sceneRef || !ramBoostConfig || !streakCoreUnitGeo || !streakGlowUnitGeo) return;
  if (!cart || !cart.mesh || !cart.body) return;

  const rb = ramBoostConfig;
  const maxActive = rb.streakMaxActive ?? 150;

  const rot = cart.body.rotation();
  const yaw = Simulation.yawFromQuaternion(rot);
  Simulation.setForwardRightFromYaw(yaw, ramBoostStreakScratchForward, ramBoostStreakScratchRight);
  const fwd = ramBoostStreakScratchForward;
  const rgt = ramBoostStreakScratchRight;
  ramBoostStreakAlignQuat.setFromUnitVectors(ramBoostCylinderAxisY, fwd);
  const t = cart.body.translation();
  ramBoostStreakScratchOrigin.set(t.x, t.y, t.z);
  const back = 0.12 + Math.random() * 0.55;
  const lat = variant.lateral ?? (Math.random() * 2 - 1) * 0.28;
  ramBoostStreakScratchPos
    .copy(ramBoostStreakScratchOrigin)
    .addScaledVector(fwd, -back)
    .addScaledVector(rgt, lat);

  const baseRadius = rb.streakRadiusMeters ?? 0.014;
  const lengthMul = variant.lengthMul ?? 0.88 + Math.random() * 0.2;
  const streakLength = rb.streakLengthMeters * lengthMul;
  const streakColor = getAnimeStreakColor(cart.cartColor, rb);
  const coreOpacity = rb.streakCoreOpacity ?? 0.52;
  const glowOpacity = rb.streakGlowOpacity ?? 0.62;

  const entry = acquireStreakEntry(maxActive);
  entry.coreMat.color.set(streakColor);
  entry.coreMat.opacity = coreOpacity;
  entry.glowMat.color.set(streakColor);
  entry.glowMat.opacity = glowOpacity;

  entry.group.position.copy(ramBoostStreakScratchPos);
  entry.group.quaternion.copy(ramBoostStreakAlignQuat);
  entry.group.scale.set(baseRadius, streakLength, baseRadius);

  entry.birthMs = birthMs;
  entry.durationMs = rb.streakDurationSec * 1000;
  entry.cart = cart;
  entry.baseRadius = baseRadius;
  entry.length = streakLength;

  ramBoostStreaks.push(entry);
}

/**
 * Spawns ram-boost streak meshes for carts currently in nitro.
 * @param {object[]} allCarts All slot carts.
 * @param {number} nowMs Current time (ms).
 * @param {number} dtSec Frame delta (seconds).
 */
export function tickRamBoostStreakSpawners(allCarts, nowMs, dtSec) {
  const rb = ramBoostConfig;
  if (!rb || !rb.enabled || dtSec <= 0) return;
  const secondaryChance = rb.streakSecondaryChance ?? 0.55;
  for (const cart of allCarts) {
    if (!cart) continue;
    if (nowMs > cart.ramBoostActiveUntilMs) continue;
    cart.ramBoostStreakCarry += rb.streakSpawnRatePerSec * dtSec;
    while (cart.ramBoostStreakCarry >= 1) {
      cart.ramBoostStreakCarry -= 1;
      spawnRamBoostStreakForCart(cart, nowMs);
      if (Math.random() < secondaryChance) {
        spawnRamBoostStreakForCart(cart, nowMs, {
          lateral: (Math.random() * 2 - 1) * 0.85,
          lengthMul: 0.65 + Math.random() * 0.45,
        });
      }
    }
  }
}

/**
 * Ages out ram-boost streak meshes and updates opacity/pulse.
 * @param {number} nowMs Current time (ms).
 */
export function updateRamBoostStreaks(nowMs) {
  if (!sceneRef) return;

  const pulseHz = ramBoostConfig?.streakPulseHz ?? 16;
  const glowBase = ramBoostConfig?.streakGlowOpacity ?? 0.62;

  for (let i = ramBoostStreaks.length - 1; i >= 0; i -= 1) {
    const s = ramBoostStreaks[i];
    const t = (nowMs - s.birthMs) / s.durationMs;
    if (t >= 1) {
      sceneRef.remove(s.group);
      ramBoostStreaks.splice(i, 1);
      ramBoostStreakFreeList.push(s);
      continue;
    }

    const fade = 1 - t * t;
    const stretch = 1 + t * 0.25;
    s.group.scale.set(s.baseRadius, s.length * stretch, s.baseRadius);

    const isBoosting = GameState.getRoundState().phase === "running"
      && s.cart
      && s.cart.ramBoostActiveUntilMs > nowMs;
    const pulse = isBoosting && pulseHz > 0
      ? 1 + 0.12 * Math.sin(nowMs * 0.001 * Math.PI * 2 * pulseHz)
      : 1;

    const coreBase = ramBoostConfig?.streakCoreOpacity ?? 0.52;
    s.coreMat.opacity = clamp(fade * coreBase * pulse, 0, 1);
    s.glowMat.opacity = clamp(fade * glowBase * pulse, 0, 1);
  }
}

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
  laserEntries.push({
    mesh: laser,
    sheathMat: laserMat,
    coreMat,
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
  const stageRadius = pitInnerRadius + 15;
  const stageX = Math.cos(stageAngle) * stageRadius;
  const stageZ = Math.sin(stageAngle) * stageRadius;
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
  const neonMagentaMat = new THREE.MeshBasicMaterial({ color: 0xff00ff });
  const neonCyanMat = new THREE.MeshBasicMaterial({ color: 0x00ffff });
  const stageLightPalette = Object.values(cartColors).map((entry) => entry.hex);
  stageLightEntries = [];

  stageGroup.clear();

  const stageBase = new THREE.Mesh(new THREE.BoxGeometry(24, 1.5, 10), stageBaseMat);
  stageBase.position.y = 0.75;
  stageGroup.add(stageBase);

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
    stageLightEntries.push({ target, baseX: lx, index: i });
  }

  stageGroup.position.set(stageX, stageY, stageZ);
  stageGroup.lookAt(0, stageGroup.position.y, 0);
  scene.add(stageGroup);
  stageGroup.updateMatrixWorld(true);
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
      color: i % 2 === 0 ? 0xff00ff : 0x00ffff,
      radius: 0.18,
      length: 120,
      opacity: 0.45,
      tiltX: -Math.PI * 0.4,
      index: i,
      speed: 0.3,
      phaseStep: 0.79,
      amplitude: 0.7,
      faceCenter: true,
    });
  }

  // * Deck rings — beams firing from the mid and upper deck front edges (radii/
  // * heights match the stadium decks in initCrowd) so the whole bowl joins the
  // * light show instead of just the field edge and the rim.
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
  const bbNeonCyanMat = new THREE.MeshBasicMaterial({ color: 0x00ffff });
  const bbNeonMagentaMat = new THREE.MeshBasicMaterial({
    color: 0xff00ff,
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
    faceGroup.add(bbScreen);
    const bbScanlines = new THREE.Mesh(bbScreenGeo, bbScanMat);
    bbScanlines.position.z = 0.01;
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

  const bbLightL = new THREE.PointLight(0x00ffff, 2, 8);
  bbLightL.position.set(-7, -1, 0);
  billboardGroup.add(bbLightL);
  const bbLightR = new THREE.PointLight(0xff00ff, 2, 8);
  bbLightR.position.set(7, -1, 0);
  billboardGroup.add(bbLightR);

  billboardGroup.position.set(0, 15, 0);
  scene.add(billboardGroup);
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
  const leaderMix = reactive.hasLeader ? 0.28 : 0;
  const koT = reactive.koT;
  for (const entry of laserEntries) {
    entry.mesh.rotation.z =
      entry.baseZ +
      Math.sin(nowSec * entry.speed + entry.index * entry.phaseStep) *
        entry.amplitude * (1 + koT * 0.35);
    if (entry.sheathMat?.userData?.baseColor) {
      _laserReactiveColor
        .copy(entry.sheathMat.userData.baseColor)
        .lerp(reactive.accentColor, leaderMix + koT * 0.6);
      entry.sheathMat.color.copy(_laserReactiveColor);
      entry.sheathMat.opacity =
        (entry.sheathMat.userData.baseOpacity ?? 0.5) * (1 + koT * 0.75);
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
    bbSmallCtx.shadowColor = "#ff00ff";
    bbSmallCtx.shadowBlur = 8 + Math.sin(nowMs * 0.005) * 5;
    bbSmallCtx.fillStyle = `rgb(${r}, 255, 255)`;
    bbSmallCtx.fillText("CART RAVE", 128, 34);
    bbSmallCtx.shadowBlur = 0;
    bbTex.needsUpdate = true;
  }
  slTex.offset.y = (nowMs * 0.0005) % 1;
}
