/**
 * ambientParticles.js — Ambient dust motes and trash burst debris particles.
 *
 * Extracted from src/effects.js (EFFECTS-SPLIT-1). Dust + debris share
 * `currentEffectStyle` (spawnTrashBurst's backrooms-floor branch reads the
 * active ambient style), so they live together. `sceneRef` here is the
 * module's own — set by `initAmbientParticlesSystem`, independent of the
 * ram-boost streaks module's copy.
 */

import * as THREE from "three";
import { CONFIG } from "../config.js";
import { clamp } from "../utils.js";
import { getQualityKnobs } from "../utils/qualityTiers.js";
import * as GameState from "../stores/gameStore.js";

// * Ambient dust weight straight downsun, relative to 1 straight at the sun. Not 0 — dust on
// * the far side still exists, it is just unlit, and zeroing it leaves a visible bald arc.
const SUN_LOBE_FLOOR = 0.35;

const TRASH_POOL_SIZE = 52;
const TRASH_NEON_COLORS = [0xff2bd6, 0x22e6ff, 0xffe53d, 0xff3300];

/** Supermarket debris tones for grocery spills: paper/receipt whites, produce
 * green/red/orange, and cardboard brown — reinforces the "cart dumps its
 * groceries" identity instead of generic neon confetti. */
const GROCERY_DEBRIS_COLORS = [0xfff4dc, 0xffffff, 0x6ee36e, 0xff5a5a, 0xffb03a, 0xc9924e];

const AMBIENT_PARTICLE_COUNT = 260;
/** Actual allocated dust count for the active tier (set in initAmbientParticles). */
let ambientParticleCount = AMBIENT_PARTICLE_COUNT;
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

/** @typedef {Record<string, { hex: number }>} CartColorMap */

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
/** Count of currently-visible trashPool entries — lets updateTrashParticles early-out when zero. */
let trashActiveCount = 0;

/** @type {THREE.BoxGeometry | null} */
let trashGeo = null;

/** @type {THREE.PlaneGeometry | null} Flat "receipt / paper" debris silhouette — flutters as it falls. */
let trashGeoReceipt = null;

/** @type {THREE.CylinderGeometry | null} Small "can / bottle" debris silhouette. */
let trashGeoCan = null;

/** @type {THREE.BoxGeometry | null} Cart-basket fragment — drawn wireframe so it reads as wire mesh. */
let trashGeoWire = null;

/** @type {THREE.CircleGeometry | null} Flat neon tri-shard — additive-blended stylized spark. */
let trashGeoShard = null;

/** @type {THREE.MeshBasicMaterial | null} */
let trashMat = null;

/** @type {Float32Array | null} */
let ambientParticleDrift = null;

/** @type {THREE.BufferGeometry | null} */
let ambientParticleGeometry = null;

/** @type {THREE.Points | null} */
let ambientParticles = null;

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
 * @param {number} [sunAzimuth] Radians. When given, dust gathers and brightens toward this
 *   bearing instead of spreading evenly — see SUN_LOBE_FLOOR. Omit for arenas with no
 *   directional sun; they keep the uniform ring exactly as before.
 * @returns {THREE.Points}
 */
function initAmbientParticles(scene, style, cartColors, sunAzimuth) {
  const cfg = getAmbientDustConfig(style);
  ambientParticleRadius = cfg.radius;
  ambientParticleHeight = cfg.height;

  // * Tier-scaled density — dust keeps its read at ~1/3 count on Low.
  ambientParticleCount = Math.max(48, Math.round(AMBIENT_PARTICLE_COUNT * getQualityKnobs().dustMul));
  const ambientParticlePositions = new Float32Array(ambientParticleCount * 3);
  const ambientParticleColors = new Float32Array(ambientParticleCount * 3);
  ambientParticleDrift = new Float32Array(ambientParticleCount * 4);
  const ambientParticlePalette = getAmbientDustPalette(style, cartColors);
  const ambientParticleColor = new THREE.Color();
  const driftSpan = cfg.driftSpeedMax - cfg.driftSpeedMin;
  const vertSpan = cfg.verticalDriftMax - cfg.verticalDriftMin;

  // * Sun lobe. Weight is 1 straight toward the sun and SUN_LOBE_FLOOR straight away from
  // * it, squared so the falloff is a lobe rather than a soft bias. Applied twice: once by
  // * REJECTION SAMPLING the spawn bearing, so motes gather on the sun side without changing
  // * ambientParticleCount or adding a draw call, and once as a per-mote brightness scale so
  // * the ones that do sit downsun read as unlit rather than absent.
  const lobeWeight = (angle) => {
    if (sunAzimuth == null) return 1;
    const facing = Math.max(0, Math.cos(angle - sunAzimuth));
    return SUN_LOBE_FLOOR + (1 - SUN_LOBE_FLOOR) * facing * facing;
  };
  // * Bounded: at the floor weight the expected draws per accepted sample is 1/floor, so the
  // * worst case is a handful of extra Math.random() calls at build time, never a hang.
  const sampleLobeAngle = () => {
    for (let tries = 0; tries < 16; tries += 1) {
      const angle = Math.random() * Math.PI * 2;
      if (Math.random() <= lobeWeight(angle)) return angle;
    }
    return Math.random() * Math.PI * 2;
  };

  for (let i = 0; i < ambientParticleCount; i++) {
    const angle = sampleLobeAngle();
    const radius = Math.sqrt(Math.random()) * cfg.radius;
    const p = i * 3;
    const d = i * 4;

    ambientParticlePositions[p] = Math.cos(angle) * radius;
    ambientParticlePositions[p + 1] = Math.random() * cfg.height;
    ambientParticlePositions[p + 2] = Math.sin(angle) * radius;

    ambientParticleColor.setHex(
      ambientParticlePalette[Math.floor(Math.random() * ambientParticlePalette.length)],
    );
    const lit = lobeWeight(angle);
    ambientParticleColors[p] = ambientParticleColor.r * lit;
    ambientParticleColors[p + 1] = ambientParticleColor.g * lit;
    ambientParticleColors[p + 2] = ambientParticleColor.b * lit;

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
 * @param {number} [sunAzimuth] Radians — dust gathers and brightens toward this bearing.
 *   Omit for arenas with no directional sun; they keep the uniform ring unchanged.
 * @returns {THREE.Points | null}
 */
export function setAmbientDustStyle(style, cartColors, sunAzimuth) {
  currentEffectStyle = style;
  disposeAmbientParticles();
  if (!sceneRef || !cartColors) return null;
  return initAmbientParticles(sceneRef, style, cartColors, sunAzimuth);
}

/**
 * Builds the shared trash pool + captures the owning scene. Called once by
 * `initEffects` (composition root in effects.js) before any spawn/update runs.
 * @param {THREE.Scene} scene Scene that owns effect meshes.
 */
export function initAmbientParticlesSystem(scene) {
  sceneRef = scene;

  trashPool = [];
  trashActiveCount = 0;
  trashGeo = new THREE.BoxGeometry(0.15, 0.15, 0.15);
  // * Extra debris silhouettes — shared geometries swapped per-particle at spawn so the
  // * 52-slot pool gains cart-fragment / receipt / can personality without more particles.
  trashGeoReceipt = new THREE.PlaneGeometry(0.2, 0.13);
  trashGeoCan = new THREE.CylinderGeometry(0.06, 0.06, 0.16, 7);
  // * Cart-clash silhouettes: a wireframe box reads as a knocked-loose wire-basket
  // * fragment; a 3-sided circle is a flat neon shard (additive) — stylized spark
  // * debris. Same pool, same counts: zero extra GPU budget.
  trashGeoWire = new THREE.BoxGeometry(0.2, 0.14, 0.14);
  trashGeoShard = new THREE.CircleGeometry(0.11, 3);
  // * DoubleSide so the flat receipt reads from both faces while it tumbles.
  trashMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, side: THREE.DoubleSide });

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
}

/**
 * Returns the active ambient dust Points object (null until first style applied).
 * Read by `initEffects` to hand back to the game boot.
 * @returns {THREE.Points | null}
 */
export function getAmbientParticles() {
  return ambientParticles;
}

/**
 * Spawns a burst of trash particles at `position`.
 * @param {{ x: number, y: number, z: number }} position World-space origin.
 * @param {number} intensity 0–1+ style intensity scaler.
 * @param {"cart" | "floor" | "edge" | "grocery"} [type] Burst profile.
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
  } else if (type === "grocery") {
    // * Signature spill poof — scales with how much cargo flew (capped to spare the pool).
    count = Math.min(Math.floor(9 + clampedI * 14), 30);
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
    (type === "grocery" ? 1.25 : 1.0) *
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
        : [0x551a8b, 0xff2bd6, 0x333333];
      const mat = /** @type {THREE.MeshBasicMaterial} */ (p.material);
      mat.color.setHex(colors[Math.floor(Math.random() * colors.length)]);
    } else if (type === "edge") {
      const colors = [0xff2bd6, 0x22e6ff, 0xffffff];
      const mat = /** @type {THREE.MeshBasicMaterial} */ (p.material);
      mat.color.setHex(colors[Math.floor(Math.random() * colors.length)]);
    } else if (type === "grocery") {
      const mat = /** @type {THREE.MeshBasicMaterial} */ (p.material);
      mat.color.setHex(GROCERY_DEBRIS_COLORS[Math.floor(Math.random() * GROCERY_DEBRIS_COLORS.length)]);
    } else {
      const mat = /** @type {THREE.MeshBasicMaterial} */ (p.material);
      // * Hard cart-on-cart hits knock cargo loose — a slice of the burst reads as
      // * escaping groceries (produce/carton tones) instead of pure neon trash.
      const escapingGrocery = clampedI > 0.5 && Math.random() < 0.3;
      mat.color.setHex(
        escapingGrocery
          ? GROCERY_DEBRIS_COLORS[Math.floor(Math.random() * GROCERY_DEBRIS_COLORS.length)]
          : TRASH_NEON_COLORS[Math.floor(Math.random() * TRASH_NEON_COLORS.length)],
      );
    }
    const mat = /** @type {THREE.MeshBasicMaterial} */ (p.material);
    mat.opacity = isBackroomsFloor ? 0.78 : 1;
    p.visible = true;
    trashActiveCount += 1;
    p.userData.isDust = isBackroomsFloor;
    // * Debris silhouette: cart/edge bursts mix receipts (paper), cans, wire-basket
    // * fragments (wireframe box), and additive neon tri-shards; grocery spills favor
    // * paper + cans; floor dust stays cubes. Paper flutters (see updateTrashParticles).
    let debrisGeo = /** @type {THREE.BufferGeometry | null} */ (trashGeo);
    let isPaper = false;
    let isShard = false;
    let isWire = false;
    if (type !== "floor") {
      const paperChance = type === "grocery" ? 0.4 : 0.2;
      const canChance = type === "grocery" ? 0.28 : 0.14;
      const wireChance = type === "grocery" ? 0 : 0.22;
      const shardChance = type === "grocery" ? 0.12 : 0.2;
      const r = Math.random();
      if (r < paperChance) {
        debrisGeo = trashGeoReceipt;
        isPaper = true;
      } else if (r < paperChance + canChance) {
        debrisGeo = trashGeoCan;
      } else if (r < paperChance + canChance + wireChance) {
        debrisGeo = trashGeoWire;
        isWire = true;
      } else if (r < paperChance + canChance + wireChance + shardChance) {
        debrisGeo = trashGeoShard;
        isShard = true;
      }
    }
    if (p.geometry !== debrisGeo) p.geometry = /** @type {THREE.BufferGeometry} */ (debrisGeo);
    p.userData.isPaper = isPaper;
    // * Per-silhouette material state — always reset (pool slots are reused across types).
    mat.wireframe = isWire;
    mat.blending = isShard ? THREE.AdditiveBlending : THREE.NormalBlending;
    mat.depthWrite = !isShard;
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
    } else if (type === "grocery") {
      // * Groceries pop up and out of the basket — a constant loft so even light spills read.
      p.userData.vel.set(
        (Math.random() - 0.5) * 9 * clampedI * velScale,
        (5 + Math.random() * 6) * clampedI * velScale + 1.5,
        (Math.random() - 0.5) * 9 * clampedI * velScale,
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
    // * Shards are sparks — quicker fade keeps the additive pop readable, not smeary.
    p.userData.maxLife = (type === "floor"
      ? (isBackroomsFloor
        ? 0.62 + Math.random() * 0.28
        : 0.35 + Math.random() * 0.15)
      : 0.38 + Math.random() * 0.22 + clampedI * 0.08) * (isShard ? 0.72 : 1);
    spawned++;
  }
}

/**
 * Advances active trash particles (gravity, fade, pool recycle).
 * @param {number} dt Frame delta (seconds).
 */
export function updateTrashParticles(dt) {
  // * Pool slots vastly outnumber active particles most frames — skip the scan entirely
  // * when nothing is visible instead of walking all TRASH_POOL_SIZE slots for nothing.
  if (trashActiveCount <= 0) return;

  const isRunning = GameState.getRoundState().phase === "running";

  // * During podium / lobby, accelerate cleanup so particles don't freeze mid-air.
  const fadeSpeed = isRunning ? 1 : 3;

  for (let i = 0; i < trashPool.length; i++) {
    const p = trashPool[i];
    if (!p.visible) continue;

    p.userData.life += dt * fadeSpeed;
    if (p.userData.life >= p.userData.maxLife) {
      p.visible = false;
      trashActiveCount -= 1;
      continue;
    }
    const t = p.userData.life / p.userData.maxLife;
    p.position.x += p.userData.vel.x * dt;
    p.position.y += p.userData.vel.y * dt;
    p.position.z += p.userData.vel.z * dt;
    if (p.userData.isPaper) {
      // * Air-braked flutter: bleed horizontal speed + lighter gravity so receipts drift down.
      p.userData.vel.x -= p.userData.vel.x * 2.6 * dt;
      p.userData.vel.z -= p.userData.vel.z * 2.6 * dt;
      p.userData.vel.y -= 4.4 * dt;
    } else {
      p.userData.vel.y -= (p.userData.isDust ? 2.2 : 9.8) * dt;
    }
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

  for (let i = 0; i < ambientParticleCount; i++) {
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
