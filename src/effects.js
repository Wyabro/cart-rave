/**
 * effects.js — Trash burst particles, ram-boost streaks, ambient particles, and crowd visuals.
 */

import * as THREE from "https://unpkg.com/three@0.164.1/build/three.module.js";
import { mergeGeometries } from "https://unpkg.com/three@0.164.1/examples/jsm/utils/BufferGeometryUtils.js";
import { buildCart } from "../cart.js";
import * as Simulation from "./simulation.js";
import * as GameState from "./gameState.js";
import { CONFIG } from "./config.js";
import { clamp } from "./utils.js";

const CROWD_INSTANCE_COUNT = 5000;
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

/** @type {THREE.Scene | null} */
let sceneRef = null;

/** @type {THREE.Mesh[]} */
let trashPool = [];

/** @type {THREE.BoxGeometry | null} */
let trashGeo = null;

/** @type {THREE.MeshBasicMaterial | null} */
let trashMat = null;

/** @type {Array<{ mesh: THREE.Mesh, material: THREE.Material, birthMs: number, durationMs: number, cart: object }>} */
let ramBoostStreaks = [];

/** @type {RamBoostVisualConfig | null} */
let ramBoostConfig = null;

const ramBoostStreakAlignQuat = new THREE.Quaternion();
const ramBoostCylinderAxisY = new THREE.Vector3(0, 1, 0);
const ramBoostStreakScratchOrigin = new THREE.Vector3();
const ramBoostStreakScratchPos = new THREE.Vector3();
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

/** @type {THREE.MeshBasicMaterial | null} */
let crowdGlowMat = null;

/** @type {{ target: THREE.Object3D, cone: THREE.Mesh, light: THREE.SpotLight, index: number }[]} */
let crowdSearchlightEntries = [];

/** @type {number} */
let crowdSearchlightTargetRadius = 0;

/** @type {{ light: THREE.PointLight, index: number }[]} */
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

/** @type {{ mesh: THREE.Mesh, index: number, speed: number, phaseStep: number, amplitude: number, baseZ: number }[]} */
let laserEntries = [];

const laserPositionScratch = new THREE.Vector3();

/** @type {CanvasRenderingContext2D | null} */
let bbSmallCtx = null;

/** @type {THREE.CanvasTexture | null} */
let bbTex = null;

/** @type {THREE.CanvasTexture | null} */
let slTex = null;

let bbLastRedraw = 0;

/**
 * Creates drifting additive neon Points around the arena.
 * @param {THREE.Scene} scene
 * @param {CartColorMap} cartColors Palette source for vertex colors.
 * @returns {THREE.Points}
 */
function initAmbientParticles(scene, cartColors) {
  const ambientParticlePositions = new Float32Array(AMBIENT_PARTICLE_COUNT * 3);
  const ambientParticleColors = new Float32Array(AMBIENT_PARTICLE_COUNT * 3);
  ambientParticleDrift = new Float32Array(AMBIENT_PARTICLE_COUNT * 4);
  const ambientParticlePalette = [
    cartColors.pink.hex,
    cartColors.blue.hex,
    cartColors.green.hex,
    cartColors.yellow.hex,
    cartColors.neonOrange.hex,
  ];
  const ambientParticleColor = new THREE.Color();

  for (let i = 0; i < AMBIENT_PARTICLE_COUNT; i++) {
    const angle = Math.random() * Math.PI * 2;
    const radius = Math.sqrt(Math.random()) * AMBIENT_PARTICLE_RADIUS;
    const p = i * 3;
    const d = i * 4;

    ambientParticlePositions[p] = Math.cos(angle) * radius;
    ambientParticlePositions[p + 1] = Math.random() * AMBIENT_PARTICLE_HEIGHT;
    ambientParticlePositions[p + 2] = Math.sin(angle) * radius;

    ambientParticleColor.setHex(
      ambientParticlePalette[Math.floor(Math.random() * ambientParticlePalette.length)],
    );
    ambientParticleColors[p] = ambientParticleColor.r;
    ambientParticleColors[p + 1] = ambientParticleColor.g;
    ambientParticleColors[p + 2] = ambientParticleColor.b;

    const driftAngle = Math.random() * Math.PI * 2;
    const driftSpeed = 0.08 + Math.random() * 0.1;
    ambientParticleDrift[d] = Math.cos(driftAngle) * driftSpeed;
    ambientParticleDrift[d + 1] = 0.015 + Math.random() * 0.035;
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
  const ambientParticleTexture = new THREE.CanvasTexture(ambientParticleTextureCanvas);
  ambientParticleTexture.needsUpdate = true;
  ambientParticles = new THREE.Points(
    ambientParticleGeometry,
    new THREE.PointsMaterial({
      map: ambientParticleTexture,
      size: 0.25,
      transparent: true,
      opacity: 0.75,
      vertexColors: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  scene.add(ambientParticles);
  return ambientParticles;
}

/**
 * Builds instanced crowd carts, glow ring, searchlights, and point lights around the pit.
 * @param {THREE.Scene} scene
 * @param {CartColorMap} cartColors Palette source for crowd tinting.
 * @param {number} pitInnerRadius Inner pit radius used for crowd placement rings.
 */
export function initCrowd(scene, cartColors, pitInnerRadius) {
  const crowdSourceCart = buildCart("white");
  crowdSourceCart.updateMatrixWorld(true);
  const crowdCartParts = [];
  crowdSourceCart.traverse((child) => {
    if (!(child instanceof THREE.Mesh) || !child.geometry) return;
    crowdCartParts.push(child.geometry.clone().applyMatrix4(child.matrixWorld));
  });
  const mergedGeo = mergeGeometries(crowdCartParts);
  for (const g of crowdCartParts) g.dispose();
  disposeObject3D(crowdSourceCart);

  const crowdMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
  });
  crowdCarts = new THREE.InstancedMesh(mergedGeo, crowdMat, CROWD_INSTANCE_COUNT);
  const crowdPalette = Object.values(cartColors).map((entry) => entry.hex);
  const dummy = new THREE.Object3D();

  for (let i = 0; i < CROWD_INSTANCE_COUNT; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const r = pitInnerRadius + 0.5 + Math.random() * 80;
    const x = Math.cos(angle) * r;
    const z = Math.sin(angle) * r;
    const scale = 0.25 + Math.random() * 0.2;

    dummy.position.set(x, -2.9, z);
    dummy.scale.set(scale, scale, scale);
    dummy.rotation.y = angle + Math.PI + (Math.random() - 0.5) * 0.8;
    dummy.updateMatrix();
    crowdCarts.setMatrixAt(i, dummy.matrix);
    const baseColor = new THREE.Color(crowdPalette[Math.floor(Math.random() * crowdPalette.length)]);
    baseColor.multiplyScalar(0.5);
    crowdCarts.setColorAt(i, baseColor);
  }
  crowdCarts.instanceMatrix.needsUpdate = true;
  if (crowdCarts.instanceColor) crowdCarts.instanceColor.needsUpdate = true;
  scene.add(crowdCarts);

  const crowdGlowGeo = new THREE.RingGeometry(pitInnerRadius, pitInnerRadius + 80, 64);
  crowdGlowMat = new THREE.MeshBasicMaterial({
    color: 0xff00ff,
    transparent: true,
    opacity: 0.08,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const crowdGlow = new THREE.Mesh(crowdGlowGeo, crowdGlowMat);
  crowdGlow.rotation.x = -Math.PI / 2;
  crowdGlow.position.y = -2.95;
  scene.add(crowdGlow);

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

    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(12, 30, 16, 1, true),
      new THREE.MeshBasicMaterial({
        color: CROWD_SEARCHLIGHT_COLORS[i],
        transparent: true,
        opacity: 0.06,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    cone.position.copy(searchlight.position);
    cone.lookAt(target.position);
    cone.rotateX(-Math.PI / 2);
    scene.add(cone);
    crowdSearchlightEntries.push({ target, cone, light: searchlight, index: i });
  }

  crowdPointLightEntries = [];
  const crowdPointLightRadiusMin = pitInnerRadius + 10;
  const crowdPointLightRadiusRange = 35;
  for (let i = 0; i < 32; i += 1) {
    const angle = (i / 32) * Math.PI * 2;
    const radius = crowdPointLightRadiusMin + Math.random() * crowdPointLightRadiusRange;
    const light = new THREE.PointLight(crowdPalette[i % crowdPalette.length], 4, 50, 2);
    light.position.set(
      Math.cos(angle) * radius,
      1 + Math.random() * 6,
      Math.sin(angle) * radius,
    );
    scene.add(light);
    const lightBulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.3, 8, 8),
      new THREE.MeshBasicMaterial({
        color: crowdPalette[i % crowdPalette.length],
        transparent: true,
        opacity: 0.7,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    lightBulb.position.copy(light.position);
    scene.add(lightBulb);
    crowdPointLightEntries.push({ light, index: i });
  }
}

/**
 * Animates crowd searchlights, point lights, glow ring, and instanced cart wiggle/bounce.
 * @param {number} nowMs Current time (ms).
 */
export function updateCrowd(nowMs) {
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
      entry.light.intensity = 20 + Math.sin(nowSec * 1.1 + entry.index) * 15;
    }
  }

  if (crowdPointLightEntries.length > 0) {
    const nowSec = nowMs * 0.001;
    for (const entry of crowdPointLightEntries) {
      entry.light.intensity = 5 + Math.sin(nowSec * 1.5 + entry.index * 0.8) * 5;
    }
  }

  if (crowdGlowMat) {
    const nowSec = nowMs * 0.001;
    crowdGlowMat.opacity = 0.09 + Math.sin(nowSec * 0.35) * 0.03;
  }

  if (crowdCarts) {
    const nowSec = nowMs * 0.001;
    const batchSize = 200;
    const offset = Math.floor(nowSec * 4) % Math.ceil(CROWD_INSTANCE_COUNT / batchSize);
    const start = offset * batchSize;
    const end = Math.min(start + batchSize, CROWD_INSTANCE_COUNT);
    for (let i = start; i < end; i++) {
      crowdCarts.getMatrixAt(i, crowdAnimDummy.matrix);
      crowdAnimDummy.matrix.decompose(crowdAnimDummy.position, crowdAnimDummy.quaternion, crowdAnimDummy.scale);

      const energy = ((i * 7919) % 100) / 100;
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

      crowdAnimDummy.position.y = -2.9 + bounce;
      if (wiggleYaw !== 0) {
        crowdWiggleQuat.setFromAxisAngle(crowdWiggleAxisY, wiggleYaw);
        crowdAnimDummy.quaternion.multiply(crowdWiggleQuat);
      }
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
  if (ramBoostConfig) ensureStreakGeometries(ramBoostConfig);

  trashPool = [];
  trashGeo = new THREE.BoxGeometry(0.15, 0.15, 0.15);
  trashMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true });

  for (let i = 0; i < TRASH_POOL_SIZE; i++) {
    const m = new THREE.Mesh(trashGeo, trashMat.clone());
    m.visible = false;
    m.userData.vel = new THREE.Vector3();
    m.userData.life = 0;
    m.userData.maxLife = 0;
    scene.add(m);
    trashPool.push(m);
  }

  if (options.cartColors) {
    initAmbientParticles(scene, options.cartColors);
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
  const fx = CONFIG.ramming?.fx ?? {};

  let count;
  if (type === "floor") {
    count = Math.floor(4 + clampedI * 5);
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
    (type === "floor" ? 0.65 : 1.0) *
    (isBoosting && type === "cart" ? 1.22 : 1.0);
  const velScale = (1 + clampedI * 0.45) * (isBoosting && type === "cart" ? 1.18 : 1.0);

  let spawned = 0;
  for (let i = 0; i < trashPool.length && spawned < count; i++) {
    const p = trashPool[i];
    if (p.visible) continue;
    p.position.set(position.x, position.y + (type === "floor" ? 0.05 : 0.5), position.z);
    p.scale.setScalar(sizeMul * (0.92 + Math.random() * 0.16));
    if (type === "floor") {
      const colors = [0x551a8b, 0xff00ff, 0x333333];
      p.material.color.setHex(colors[Math.floor(Math.random() * colors.length)]);
    } else if (type === "edge") {
      const colors = [0xff00ff, 0x00ffff, 0xffffff];
      p.material.color.setHex(colors[Math.floor(Math.random() * colors.length)]);
    } else {
      p.material.color.setHex(TRASH_NEON_COLORS[Math.floor(Math.random() * TRASH_NEON_COLORS.length)]);
    }
    p.material.opacity = 1;
    p.visible = true;
    if (type === "floor") {
      const angle = Math.random() * Math.PI * 2;
      const sp = (3 + Math.random() * 5) * clampedI * velScale;
      p.userData.vel.set(
        Math.cos(angle) * sp,
        1.5 + Math.random() * 2.5,
        Math.sin(angle) * sp,
      );
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
    p.userData.life = 0;
    p.userData.maxLife = type === "floor"
      ? 0.35 + Math.random() * 0.15
      : 0.38 + Math.random() * 0.22 + clampedI * 0.08;
    spawned++;
  }
}

/**
 * Advances active trash particles (gravity, fade, pool recycle).
 * @param {number} dt Frame delta (seconds).
 */
export function updateTrashParticles(dt) {
  if (GameState.getRoundState().phase !== "running") return;

  for (let i = 0; i < trashPool.length; i++) {
    const p = trashPool[i];
    if (!p.visible) continue;
    p.userData.life += dt;
    if (p.userData.life >= p.userData.maxLife) {
      p.visible = false;
      continue;
    }
    const t = p.userData.life / p.userData.maxLife;
    p.position.x += p.userData.vel.x * dt;
    p.position.y += p.userData.vel.y * dt;
    p.position.z += p.userData.vel.z * dt;
    p.userData.vel.y -= 9.8 * dt;
    p.scale.setScalar((1 - t) * (0.5 + 0.5));
    p.material.opacity = 1 - t;
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
    if (r > AMBIENT_PARTICLE_RADIUS) {
      const wrapScale = -AMBIENT_PARTICLE_RADIUS / r;
      positions[p] = x * wrapScale;
      positions[p + 2] = z * wrapScale;
    }
    if (positions[p + 1] > AMBIENT_PARTICLE_HEIGHT) positions[p + 1] = 0;
    if (positions[p + 1] < 0) positions[p + 1] = AMBIENT_PARTICLE_HEIGHT;
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
 * Drops oldest streaks when the global pool is full.
 * @param {number} maxActive
 */
function trimRamBoostStreakPool(maxActive) {
  while (ramBoostStreaks.length >= maxActive) {
    const oldest = ramBoostStreaks.shift();
    if (!oldest) break;
    sceneRef?.remove(oldest.group);
    oldest.coreMat.dispose();
    oldest.glowMat.dispose();
  }
}

/**
 * @param {object} cart
 * @param {number} birthMs
 * @param {{ lateral?: number, lengthMul?: number }} [variant]
 */
function spawnRamBoostStreakForCart(cart, birthMs, variant = {}) {
  if (!sceneRef || !ramBoostConfig || !streakCoreUnitGeo || !streakGlowUnitGeo) return;

  const rb = ramBoostConfig;
  const maxActive = rb.streakMaxActive ?? 150;
  trimRamBoostStreakPool(maxActive);

  const rot = cart.body.rotation();
  const yaw = Simulation.yawFromQuaternion(rot);
  const { forward, right } = Simulation.getForwardRightFromYaw(yaw);
  const fwd = forward.clone().normalize();
  const rgt = right.clone().normalize();
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

  const coreMat = new THREE.MeshBasicMaterial({
    color: streakColor,
    transparent: true,
    opacity: coreOpacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const glowMat = new THREE.MeshBasicMaterial({
    color: streakColor,
    transparent: true,
    opacity: rb.streakGlowOpacity ?? 0.62,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const group = new THREE.Group();
  const coreMesh = new THREE.Mesh(streakCoreUnitGeo, coreMat);
  const glowMesh = new THREE.Mesh(streakGlowUnitGeo, glowMat);
  group.add(glowMesh);
  group.add(coreMesh);
  group.position.copy(ramBoostStreakScratchPos);
  group.quaternion.copy(ramBoostStreakAlignQuat);
  group.scale.set(baseRadius, streakLength, baseRadius);
  sceneRef.add(group);

  ramBoostStreaks.push({
    group,
    coreMat,
    glowMat,
    birthMs,
    durationMs: rb.streakDurationSec * 1000,
    cart,
    baseRadius,
    length: streakLength,
  });
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
      s.coreMat.dispose();
      s.glowMat.dispose();
      ramBoostStreaks.splice(i, 1);
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
  const laserMat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
  });
  const laser = new THREE.Mesh(laserGeo, laserMat);
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

  const stageBaseMat = new THREE.MeshStandardMaterial({
    color: 0x0a0a1a,
    metalness: 0.8,
    roughness: 0.3,
  });
  const stageMetalMat = new THREE.MeshStandardMaterial({
    color: 0x1a1a2e,
    metalness: 0.8,
    roughness: 0.4,
  });
  const stageSpeakerMat = new THREE.MeshStandardMaterial({
    color: 0x0a0a12,
    metalness: 0.7,
    roughness: 0.3,
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

  const arenaLaserRadius = pitInnerRadius + 5;
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

  const skyLaserRadius = pitInnerRadius + 50;
  for (let i = 0; i < 8; i += 1) {
    const angle = (i / 8) * Math.PI * 2;
    addLaserBeam(scene, {
      position: new THREE.Vector3(
        Math.cos(angle) * skyLaserRadius,
        -3,
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
  bbSmallCtx.font = "14px monospace";
  bbSmallCtx.textAlign = "center";
  bbSmallCtx.textBaseline = "middle";
  bbSmallCtx.fillText("CART RAVE", 128, 32);
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

  const bbPoleMat = new THREE.MeshStandardMaterial({
    color: 0x333344, metalness: 0.8, roughness: 0.3,
  });
  const bbNeonCyanMat = new THREE.MeshBasicMaterial({ color: 0x00ffff });
  const bbNeonMagentaMat = new THREE.MeshBasicMaterial({
    color: 0xff00ff,
    transparent: true,
    opacity: 0.4,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  const billboardGroup = new THREE.Group();

  const bbScreen = new THREE.Mesh(
    new THREE.PlaneGeometry(12, 3),
    new THREE.MeshBasicMaterial({ map: bbTex }),
  );
  billboardGroup.add(bbScreen);

  const bbScanlines = new THREE.Mesh(
    new THREE.PlaneGeometry(12, 3),
    new THREE.MeshBasicMaterial({
      map: slTex,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
    }),
  );
  bbScanlines.position.z = 0.01;
  billboardGroup.add(bbScanlines);

  const bbFrameParts = [
    { w: 12.3, h: 0.15, d: 0.15, x: 0, y: 1.575, z: 0 },
    { w: 12.3, h: 0.15, d: 0.15, x: 0, y: -1.575, z: 0 },
    { w: 0.15, h: 3.3, d: 0.15, x: -6.075, y: 0, z: 0 },
    { w: 0.15, h: 3.3, d: 0.15, x: 6.075, y: 0, z: 0 },
  ];
  for (const { w, h, d, x, y } of bbFrameParts) {
    const cyanBar = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), bbNeonCyanMat);
    cyanBar.position.set(x, y, 0);
    billboardGroup.add(cyanBar);
    const haloBar = new THREE.Mesh(new THREE.BoxGeometry(w + 0.1, h + 0.1, d + 0.1), bbNeonMagentaMat);
    haloBar.position.set(x, y, -0.05);
    billboardGroup.add(haloBar);
  }

  for (const sx of [-5.5, 5.5]) {
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1, 0.1, 5, 8),
      bbPoleMat,
    );
    pole.position.set(sx, -1.5 - 2.5, 0);
    billboardGroup.add(pole);
  }

  const bbLightL = new THREE.PointLight(0x00ffff, 2, 8);
  bbLightL.position.set(-6.5, 0, 0.5);
  billboardGroup.add(bbLightL);
  const bbLightR = new THREE.PointLight(0xff00ff, 2, 8);
  bbLightR.position.set(6.5, 0, 0.5);
  billboardGroup.add(bbLightR);

  billboardGroup.position.set(
    Math.cos(bbAngle) * bbRadius,
    0,
    Math.sin(bbAngle) * bbRadius,
  );
  billboardGroup.lookAt(0, -3, 0);
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
export function updateLasers(nowMs) {
  if (laserEntries.length === 0) return;
  const nowSec = nowMs * 0.001;
  for (const entry of laserEntries) {
    entry.mesh.rotation.z =
      entry.baseZ +
      Math.sin(nowSec * entry.speed + entry.index * entry.phaseStep) *
        entry.amplitude;
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
    bbSmallCtx.font = "14px monospace";
    bbSmallCtx.textAlign = "center";
    bbSmallCtx.textBaseline = "middle";
    bbSmallCtx.shadowColor = "#ff00ff";
    bbSmallCtx.shadowBlur = 4 + Math.sin(nowMs * 0.005) * 3;
    bbSmallCtx.fillStyle = `rgb(${r}, 255, 255)`;
    bbSmallCtx.fillText("CART RAVE", 128, 32);
    bbSmallCtx.shadowBlur = 0;
    bbTex.needsUpdate = true;
  }
  slTex.offset.y = (nowMs * 0.0005) % 1;
}
