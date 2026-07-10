// cartShatter.js — "Shatter & Explosion" death VFX for falling carts.
//
// * Detaches a cart's visual meshes, gives each a random outward + angular velocity
// * (simple Euler integration, no Rapier bodies), and spawns a multi-layer additive
// * explosion at the cart center: hot flash, neon fireball, outer glow shell, dual
// * shock rings, soft smoke sprites, and ballistic sparks.
// * Shared soft textures/geometries live at module level; per-effect materials are
// * disposed by cleanupShatter. Per-instance shatter-part geometries are disposed
// * on cleanup while shared source geometries (rave GLTF / procedural shared wheel+hub)
// * are left alone.
// * Physics sync is disabled while shattering so syncCartMeshFromPhysics leaves the
// * root pose frozen; doRespawn calls cleanupShatter to tear everything down.

import * as THREE from "three";

import { resetCartPulseScale } from "./animations.js";
import { getWaterDeathSurfaceY, spawnWaterDeathBurst } from "./effects/waterDeathFx.js";
import { isLowQualityMode } from "./utils.js";

// * Tuning — kept lightweight for 60fps with 4 carts potentially shattering at once.
const SHATTER_GRAVITY = 14.0; // m/s^2 — slightly stronger than world gravity for a "juicy" fall
const SHATTER_LINEAR_SPEED_MIN = 2.5; // m/s — min outward burst speed per part
const SHATTER_LINEAR_SPEED_MAX = 6.5; // m/s — max outward burst speed per part
const SHATTER_UPWARD_BIAS = 2.0; // m/s — initial upward kick so parts lift before falling
const SHATTER_ANGULAR_SPEED_MAX = 6.0; // rad/s — max tumble rate per axis
const SHATTER_DURATION_MS = 1150; // ms — full VFX lifecycle (flash is front-loaded)

const EXPLOSION_CORE_START_SCALE = 0.35;
const EXPLOSION_CORE_END_SCALE = 2.8;
const EXPLOSION_GLOW_START_SCALE = 0.55;
const EXPLOSION_GLOW_END_SCALE = 4.6;
const EXPLOSION_FLASH_PEAK_SCALE = 2.4;

// * Reused scratch vectors — avoid per-frame allocations across potentially many parts.
const _worldPos = new THREE.Vector3();
const _worldQuat = new THREE.Quaternion();
const _worldScale = new THREE.Vector3();
const _worldMat = new THREE.Matrix4();
const _outwardDir = new THREE.Vector3();
const _angVelAxis = new THREE.Vector3();
const _deltaQuat = new THREE.Quaternion();
const _tmpColor = new THREE.Color();
const _hotWhite = new THREE.Color(0xffffff);
const _ember = new THREE.Color(0xffaa55);

// ---------------------------------------------------------------------------
// Shared procedural textures + geometries (never disposed)
// ---------------------------------------------------------------------------

/**
 * Soft radial disc — used for flash, glow shells, and smoke sprites.
 * @param {number} size
 * @param {{ inner?: string, mid?: string, outer?: string }} stops
 * @returns {THREE.Texture} CanvasTexture, or 1×1 DataTexture if 2d context is unavailable
 */
function makeSoftDiscTexture(size, stops) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    const data = new Uint8Array([255, 255, 255, 255]);
    const fallback = new THREE.DataTexture(data, 1, 1);
    fallback.needsUpdate = true;
    return fallback;
  }
  const c = size * 0.5;
  const g = ctx.createRadialGradient(c, c, 0, c, c, c);
  g.addColorStop(0, stops.inner ?? "rgba(255,255,255,1)");
  g.addColorStop(0.35, stops.mid ?? "rgba(255,255,255,0.55)");
  g.addColorStop(0.72, stops.outer ?? "rgba(255,255,255,0.08)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Soft annular ring texture (shockwave) — hard center hole, soft outer falloff.
 * @param {number} size
 * @returns {THREE.Texture} CanvasTexture, or 1×1 DataTexture if 2d context is unavailable
 */
function makeSoftRingTexture(size) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    const data = new Uint8Array([255, 255, 255, 255]);
    const fallback = new THREE.DataTexture(data, 1, 1);
    fallback.needsUpdate = true;
    return fallback;
  }
  const c = size * 0.5;
  // * Clear, then paint a ring via thick stroke with radial alpha mask.
  ctx.clearRect(0, 0, size, size);
  const g = ctx.createRadialGradient(c, c, c * 0.42, c, c, c * 0.92);
  g.addColorStop(0, "rgba(255,255,255,0)");
  g.addColorStop(0.35, "rgba(255,255,255,0.15)");
  g.addColorStop(0.55, "rgba(255,255,255,1)");
  g.addColorStop(0.78, "rgba(255,255,255,0.45)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  // * Knock out the center more aggressively so it reads as a true ring, not a disc.
  const hole = ctx.createRadialGradient(c, c, 0, c, c, c * 0.48);
  hole.addColorStop(0, "rgba(0,0,0,1)");
  hole.addColorStop(0.85, "rgba(0,0,0,1)");
  hole.addColorStop(1, "rgba(0,0,0,0)");
  ctx.globalCompositeOperation = "destination-out";
  ctx.fillStyle = hole;
  ctx.fillRect(0, 0, size, size);
  ctx.globalCompositeOperation = "source-over";
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Elongated spark texture (horizontal streak with soft tips).
 * @returns {THREE.Texture} CanvasTexture, or 1×1 DataTexture if 2d context is unavailable
 */
function makeSparkTexture() {
  const w = 64;
  const h = 16;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    const data = new Uint8Array([255, 255, 255, 255]);
    const fallback = new THREE.DataTexture(data, 1, 1);
    fallback.needsUpdate = true;
    return fallback;
  }
  ctx.clearRect(0, 0, w, h);
  const g = ctx.createLinearGradient(0, 0, w, 0);
  g.addColorStop(0, "rgba(255,255,255,0)");
  g.addColorStop(0.25, "rgba(255,255,255,0.55)");
  g.addColorStop(0.5, "rgba(255,255,255,1)");
  g.addColorStop(0.75, "rgba(255,255,255,0.55)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  // * Vertical soft falloff via a second pass on alpha.
  const cy = h * 0.5;
  for (let y = 0; y < h; y += 1) {
    const v = 1 - Math.abs(y - cy) / cy;
    const a = Math.pow(Math.max(0, v), 1.6);
    ctx.globalAlpha = a;
    ctx.fillRect(0, y, w, 1);
  }
  ctx.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

// * Lazy texture bag — module-level canvas work breaks Node/happy-dom imports
// * (no document, or getContext("2d") === null). Built on first explosion spawn.
/** @type {{ flash: THREE.Texture, glow: THREE.Texture, smoke: THREE.Texture, ring: THREE.Texture, spark: THREE.Texture } | null} */
let _tex = null;

/**
 * @returns {{ flash: THREE.Texture, glow: THREE.Texture, smoke: THREE.Texture, ring: THREE.Texture, spark: THREE.Texture }}
 */
function getExplosionTextures() {
  if (_tex) return _tex;
  // * Fallback: plain white DataTexture so headless imports never crash.
  if (typeof document === "undefined") {
    const data = new Uint8Array([255, 255, 255, 255]);
    const fallback = new THREE.DataTexture(data, 1, 1);
    fallback.needsUpdate = true;
    _tex = { flash: fallback, glow: fallback, smoke: fallback, ring: fallback, spark: fallback };
    return _tex;
  }
  _tex = {
    flash: makeSoftDiscTexture(64, {
      inner: "rgba(255,255,255,1)",
      mid: "rgba(255,255,255,0.7)",
      outer: "rgba(255,255,255,0.05)",
    }),
    glow: makeSoftDiscTexture(64, {
      inner: "rgba(255,255,255,0.95)",
      mid: "rgba(255,255,255,0.35)",
      outer: "rgba(255,255,255,0.04)",
    }),
    smoke: makeSoftDiscTexture(64, {
      inner: "rgba(255,255,255,0.55)",
      mid: "rgba(255,255,255,0.22)",
      outer: "rgba(255,255,255,0.02)",
    }),
    ring: makeSoftRingTexture(128),
    spark: makeSparkTexture(),
  };
  return _tex;
}

const _sharedCoreGeo = new THREE.SphereGeometry(0.5, 16, 12);
const _sharedGlowGeo = new THREE.SphereGeometry(0.5, 12, 10);
const _sharedRingPlaneGeo = new THREE.PlaneGeometry(1, 1);
const _sharedDebrisGeo = new THREE.BoxGeometry(0.12, 0.04, 0.08);
const _sharedShardGeo = new THREE.TetrahedronGeometry(0.09, 0);

const SHATTER_WALL_RESTITUTION = 0.5; // energy kept by debris bouncing off the shaft wall
const SHATTER_WALL_MAX_PENETRATION = 2.5; // m — deeper than this means the part is outside the shaft, leave it

// * Optional knockout-shaft wall (Classic Record) that detached shatter parts
// * ricochet off, so explosion debris rains down inside the shaft instead of
// * flying out through the visual wall. Registered by the level init and cleared
// * on level dispose; null = no shaft (other levels). Purely visual, client-local.
/** @type {{ wallR: number, topY: number } | null} */
let shatterShaft = null;

/**
 * * Registers (or clears) the level's knockout-shaft wall: a vertical cylinder of
 * * radius `wallR` whose interior debris bounces around in, below `topY`.
 *
 * @param {{ wallR: number, topY: number } | null} params
 * @returns {void}
 */
export function setShatterEnvironment(params) {
  shatterShaft = params ?? null;
}

/**
 * Ease helpers — keep animation readable without importing an animation lib.
 * @param {number} t 0..1
 * @returns {number}
 */
function easeOutCubic(t) {
  const u = 1 - t;
  return 1 - u * u * u;
}

/**
 * @param {number} t 0..1
 * @returns {number}
 */
function easeOutQuart(t) {
  const u = 1 - t;
  return 1 - u * u * u * u;
}

/**
 * Fast attack then long decay (for flash opacity).
 * @param {number} t 0..1 normalized over full duration
 * @param {number} peakAt fraction of duration where opacity peaks
 * @returns {number}
 */
function flashEnvelope(t, peakAt = 0.06) {
  if (t <= peakAt) return t / peakAt;
  return Math.max(0, 1 - (t - peakAt) / (1 - peakAt));
}

/**
 * * Spawns a multi-layer explosion VFX at the given world position.
 * * Materials are created here and disposed by cleanupShatter.
 *
 * @param {THREE.Scene} scene
 * @param {{ x: number, y: number, z: number }} origin World position.
 * @param {number} neonHex Player neon color for the explosion tint.
 * @returns {object} Explosion state bag consumed by updateShatterEffect / cleanupShatter.
 */
function spawnExplosion(scene, origin, neonHex) {
  const lowQ = isLowQualityMode();
  const tex = getExplosionTextures();
  const group = new THREE.Group();
  group.position.set(origin.x, origin.y, origin.z);

  _tmpColor.setHex(neonHex);
  const hotCore = _tmpColor.clone().lerp(_hotWhite, 0.72);
  const midFire = _tmpColor.clone().lerp(_hotWhite, 0.28);
  const smokeTint = _tmpColor.clone().lerp(new THREE.Color(0x1a1028), 0.55);
  const sparkTint = _tmpColor.clone().lerp(_ember, 0.35);

  // --- 1. Camera-facing flash (reads at any angle; very brief white-hot pop) ---
  const flashMat = new THREE.SpriteMaterial({
    map: tex.flash,
    color: hotCore,
    blending: THREE.AdditiveBlending,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  const flash = new THREE.Sprite(flashMat);
  flash.scale.setScalar(0.4);
  group.add(flash);

  // --- 2. Volumetric neon fireball core ---
  const coreMat = new THREE.MeshBasicMaterial({
    color: midFire,
    blending: THREE.AdditiveBlending,
    transparent: true,
    opacity: 1.0,
    depthWrite: false,
  });
  const coreMesh = new THREE.Mesh(_sharedCoreGeo, coreMat);
  coreMesh.scale.setScalar(EXPLOSION_CORE_START_SCALE);
  group.add(coreMesh);

  // --- 3. Soft outer glow shell (larger, dimmer, longer lived) ---
  const glowMat = new THREE.MeshBasicMaterial({
    color: neonHex,
    blending: THREE.AdditiveBlending,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
  });
  const glowMesh = new THREE.Mesh(_sharedGlowGeo, glowMat);
  glowMesh.scale.setScalar(EXPLOSION_GLOW_START_SCALE);
  group.add(glowMesh);

  // --- 4. Dual shock rings (soft textured planes, staggered) ---
  /** @type {{ mesh: THREE.Mesh, mat: THREE.MeshBasicMaterial, delayMs: number, lifeMs: number, startScale: number, endScale: number, peakOpacity: number }[]} */
  const rings = [];
  const ringSpecs = lowQ
    ? [{ delayMs: 0, lifeMs: 520, startScale: 0.5, endScale: 5.2, opacity: 0.95 }]
    : [
      { delayMs: 0, lifeMs: 480, startScale: 0.45, endScale: 4.8, opacity: 1.0 },
      { delayMs: 90, lifeMs: 700, startScale: 0.7, endScale: 7.2, opacity: 0.7 },
      { delayMs: 180, lifeMs: 900, startScale: 1.0, endScale: 9.5, opacity: 0.4 },
    ];
  for (const spec of ringSpecs) {
    const ringMat = new THREE.MeshBasicMaterial({
      map: tex.ring,
      color: hotCore.clone().lerp(midFire, 0.4),
      blending: THREE.AdditiveBlending,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const ringMesh = new THREE.Mesh(_sharedRingPlaneGeo, ringMat);
    ringMesh.rotation.x = -Math.PI / 2;
    ringMesh.scale.setScalar(spec.startScale);
    group.add(ringMesh);
    rings.push({
      mesh: ringMesh,
      mat: ringMat,
      delayMs: spec.delayMs,
      lifeMs: spec.lifeMs,
      startScale: spec.startScale,
      endScale: spec.endScale,
      peakOpacity: spec.opacity,
    });
  }

  // --- 4b. Delayed secondary flash (aftershock pop) ---
  const flash2Mat = new THREE.SpriteMaterial({
    map: tex.flash,
    color: midFire,
    blending: THREE.AdditiveBlending,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  const flash2 = new THREE.Sprite(flash2Mat);
  flash2.scale.setScalar(0.3);
  group.add(flash2);

  // --- 5. Soft smoke / ember sprites (billboard puffs expanding + rising) ---
  /** @type {{ sprite: THREE.Sprite, mat: THREE.SpriteMaterial, vx: number, vy: number, vz: number, startScale: number, endScale: number, delayMs: number, lifeMs: number, spin: number }[]} */
  const smokes = [];
  const smokeCount = lowQ ? 5 : 11;
  for (let i = 0; i < smokeCount; i += 1) {
    const a = (i / smokeCount) * Math.PI * 2 + Math.random() * 0.4;
    const elev = 0.15 + Math.random() * 0.55;
    const speed = 1.4 + Math.random() * 2.4;
    const smokeMat = new THREE.SpriteMaterial({
      map: tex.smoke,
      color: i % 2 === 0 ? midFire.clone() : smokeTint.clone(),
      blending: i % 3 === 0 ? THREE.AdditiveBlending : THREE.NormalBlending,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    const sprite = new THREE.Sprite(smokeMat);
    const startScale = 0.35 + Math.random() * 0.35;
    sprite.scale.setScalar(startScale);
    sprite.position.set(
      Math.cos(a) * 0.15,
      (Math.random() - 0.2) * 0.2,
      Math.sin(a) * 0.15,
    );
    group.add(sprite);
    smokes.push({
      sprite,
      mat: smokeMat,
      vx: Math.cos(a) * speed * Math.cos(elev),
      vy: 0.8 + Math.random() * 1.6 + Math.sin(elev) * 0.5,
      vz: Math.sin(a) * speed * Math.cos(elev),
      startScale,
      endScale: startScale * (2.8 + Math.random() * 2.2),
      delayMs: Math.random() * 80,
      lifeMs: 700 + Math.random() * 400,
      spin: (Math.random() - 0.5) * 1.2,
    });
  }

  // --- 6. Ballistic sparks (streak points) ---
  const sparkCount = lowQ ? 12 : 28;
  const sparkPositions = new Float32Array(sparkCount * 3);
  const sparkVel = [];
  for (let i = 0; i < sparkCount; i += 1) {
    // * Biased upward hemisphere so sparks read above the debris cloud.
    const a = Math.random() * Math.PI * 2;
    const elev = 0.25 + Math.random() * 1.1;
    const speed = 4.5 + Math.random() * 9.5;
    sparkPositions[i * 3 + 0] = 0;
    sparkPositions[i * 3 + 1] = 0;
    sparkPositions[i * 3 + 2] = 0;
    sparkVel.push({
      x: Math.cos(a) * Math.cos(elev) * speed,
      y: Math.sin(elev) * speed + 1.5,
      z: Math.sin(a) * Math.cos(elev) * speed,
    });
  }
  const sparkGeo = new THREE.BufferGeometry();
  sparkGeo.setAttribute("position", new THREE.BufferAttribute(sparkPositions, 3));
  const sparkMat = new THREE.PointsMaterial({
    map: tex.spark,
    color: sparkTint,
    size: lowQ ? 0.22 : 0.32,
    sizeAttenuation: true,
    transparent: true,
    opacity: 1,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  sparkMat.userData.baseSize = sparkMat.size;
  const sparks = new THREE.Points(sparkGeo, sparkMat);
  group.add(sparks);

  // --- 6b. Slow ember motes (warmer, hang longer than sparks) ---
  const emberCount = lowQ ? 6 : 14;
  const emberPositions = new Float32Array(emberCount * 3);
  const emberVel = [];
  for (let i = 0; i < emberCount; i += 1) {
    const a = Math.random() * Math.PI * 2;
    const elev = 0.4 + Math.random() * 0.9;
    const speed = 1.2 + Math.random() * 3.2;
    emberPositions[i * 3] = 0;
    emberPositions[i * 3 + 1] = 0;
    emberPositions[i * 3 + 2] = 0;
    emberVel.push({
      x: Math.cos(a) * Math.cos(elev) * speed,
      y: Math.sin(elev) * speed + 0.8,
      z: Math.sin(a) * Math.cos(elev) * speed,
    });
  }
  const emberGeo = new THREE.BufferGeometry();
  emberGeo.setAttribute("position", new THREE.BufferAttribute(emberPositions, 3));
  const emberPointsMat = new THREE.PointsMaterial({
    map: tex.glow,
    color: _ember.clone().lerp(midFire, 0.4),
    size: lowQ ? 0.18 : 0.28,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  emberPointsMat.userData.baseSize = emberPointsMat.size;
  const emberPoints = new THREE.Points(emberGeo, emberPointsMat);
  group.add(emberPoints);

  // --- 6c. Metal debris shards (tiny tumbling boxes / tets) ---
  /** @type {{ mesh: THREE.Mesh, mat: THREE.MeshBasicMaterial, vx: number, vy: number, vz: number, ax: number, ay: number, az: number }[]} */
  const debris = [];
  const debrisCount = lowQ ? 5 : 12;
  for (let i = 0; i < debrisCount; i += 1) {
    const a = Math.random() * Math.PI * 2;
    const elev = 0.2 + Math.random() * 0.9;
    const speed = 3 + Math.random() * 6;
    const useShard = i % 3 === 0;
    const mat = new THREE.MeshBasicMaterial({
      color: i % 2 === 0 ? midFire.clone() : hotCore.clone().lerp(new THREE.Color(0x888888), 0.45),
      transparent: true,
      opacity: 0.95,
      blending: i % 2 === 0 ? THREE.AdditiveBlending : THREE.NormalBlending,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(useShard ? _sharedShardGeo : _sharedDebrisGeo, mat);
    const s = 0.55 + Math.random() * 1.1;
    mesh.scale.set(s * (0.6 + Math.random()), s, s * (0.5 + Math.random()));
    mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
    group.add(mesh);
    debris.push({
      mesh,
      mat,
      vx: Math.cos(a) * Math.cos(elev) * speed,
      vy: Math.sin(elev) * speed + 1.2,
      vz: Math.sin(a) * Math.cos(elev) * speed,
      ax: (Math.random() - 0.5) * 14,
      ay: (Math.random() - 0.5) * 14,
      az: (Math.random() - 0.5) * 14,
    });
  }

  // --- 7. Secondary horizontal "ember sheet" disc for residual heat ---
  const emberMat = new THREE.MeshBasicMaterial({
    map: tex.glow,
    color: midFire,
    blending: THREE.AdditiveBlending,
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const emberDisc = new THREE.Mesh(_sharedRingPlaneGeo, emberMat);
  emberDisc.rotation.x = -Math.PI / 2;
  emberDisc.position.y = 0.05;
  emberDisc.scale.setScalar(0.6);
  group.add(emberDisc);

  // --- 8. Heat haze / distortion ring (soft wide disc, long hang) ---
  const hazeMat = new THREE.MeshBasicMaterial({
    map: tex.smoke,
    color: midFire.clone().lerp(new THREE.Color(0xffffff), 0.2),
    blending: THREE.AdditiveBlending,
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const hazeDisc = new THREE.Mesh(_sharedRingPlaneGeo, hazeMat);
  hazeDisc.rotation.x = -Math.PI / 2;
  hazeDisc.position.y = 0.08;
  hazeDisc.scale.setScalar(0.8);
  group.add(hazeDisc);

  scene.add(group);

  return {
    group,
    flash,
    flashMat,
    flash2,
    flash2Mat,
    coreMesh,
    coreMat,
    glowMesh,
    glowMat,
    rings,
    smokes,
    sparks,
    sparkGeo,
    sparkMat,
    sparkVel,
    emberPoints,
    emberGeo,
    emberPointsMat,
    emberVel,
    debris,
    emberDisc,
    emberMat,
    hazeDisc,
    hazeMat,
    startMs: performance.now(),
    durationMs: SHATTER_DURATION_MS,
    // * Legacy aliases kept so any external debug that poked core/ring still finds something.
    ringMesh: rings[0]?.mesh ?? null,
    ringMat: rings[0]?.mat ?? null,
  };
}

/**
 * * Detaches a cart's visual meshes, gives each a random outward + angular velocity,
 * * spawns an explosion at the cart center, and sets `cart.isShattering = true` so
 * * {@link syncCartMeshFromPhysics} stops updating the root pose.
 *
 * * Per-instance geometries are disposed on cleanup; shared source geometries
 * * (rave GLTF, procedural shared wheel/hub) are never disposed here.
 *
 * @param {object} cart Cart entity from {@link createCart}.
 * @param {THREE.Scene} scene Active Three.js scene (parts + explosion are reparented here).
 * @param {number} [neonHex=0xffffff] Player neon color for the explosion tint.
 * @returns {void}
 */
export function triggerCartShatter(cart, scene, neonHex = 0xffffff) {
  // * Cache mesh in a local — guards against any edge case where cart.mesh could be
  // * undefined or not a traversable Object3D despite the optional-chain check
  // * (e.g. transitional slot state, stale bundle, or HMR drift).
  // * The console.warn is intentional: if this guard ever fires it means a caller
  // * handed in a cart without a valid visual root, and the message tells you which
  // * condition tripped so you can trace the source instead of guessing.
  const mesh = cart?.mesh;
  if (!mesh || !scene || typeof mesh.traverse !== "function") {
    // eslint-disable-next-line no-console
    console.warn(
      "[cartShatter] triggerCartShatter skipped — invalid args:",
      "cart=", cart,
      "cart.mesh=", cart?.mesh,
      "scene=", scene,
      "traverseType=", cart?.mesh ? typeof cart.mesh.traverse : "n/a",
      "slotIndex=", cart?.slotIndex,
    );
    return;
  }
  // * Guard against double-trigger (host scheduleRespawn + late host_event_fall echo).
  if (cart.isShattering) return;

  cart.isShattering = true;

  // * A squash/boost tween in flight at KO time would leave mesh.scale mid-pulse
  // * (cancel skips onComplete) — snap back to base before debris capture so the
  // * shatter parts and the eventual respawn rebuild both see the true scale.
  resetCartPulseScale(mesh);

  // * Safety: detach any Camera children from the cart root before the root is frozen
  // * during shatter, preventing the camera from snapping away mid-explosion.
  const cameraChildren = mesh.children.filter((c) => c.isCamera);
  for (const cam of cameraChildren) {
    cam.updateWorldMatrix(true, false);
    _worldMat.copy(cam.matrixWorld);
    _worldMat.decompose(_worldPos, _worldQuat, _worldScale);
    mesh.remove(cam);
    scene.add(cam);
    cam.position.copy(_worldPos);
    cam.quaternion.copy(_worldQuat);
    cam.scale.copy(_worldScale);
  }

  // * Capture cart center in world space (root position + visual offset approximated by
  // * the root's current world transform). Used as the explosion origin + outward bias point.
  const cartCenterWorld = new THREE.Vector3();
  mesh.updateMatrixWorld(true);
  mesh.getWorldPosition(cartCenterWorld);

  // * Stash the death world position on the cart so the death camera can pan toward it.
  cart._shatterDeathPos = cartCenterWorld.clone();

  /** @type {{ mesh: THREE.Mesh, vel: THREE.Vector3, angVel: THREE.Vector3, sharedGeometry: boolean }[]} */
  const parts = [];

  // * Phase 1 — read-only traversal: collect all target meshes into a flat array.
  // * We MUST NOT call .remove(), .add(), or .attach() inside traverse() because
  // * modifying the children array mid-iteration shifts indices and causes Three.js
  // * to access undefined children, crashing with "Cannot read properties of
  // * undefined (reading 'traverse')".
  /** @type {THREE.Mesh[]} */
  const meshesToShatter = [];
  mesh.traverse((child) => {
    if (child.isMesh && child.geometry) {
      meshesToShatter.push(child);
    }
  });

  // * Phase 2 — reparent each mesh to the scene at its captured world pose and
  // * assign random outward + angular velocity. We do NOT dispose here — cleanupShatter
  // * handles disposal (shared-geometry-aware) when doRespawn fires.
  for (const child of meshesToShatter) {
    child.updateWorldMatrix(true, false);
    _worldMat.copy(child.matrixWorld);
    _worldMat.decompose(_worldPos, _worldQuat, _worldScale);

    // * Reparent to scene keeping world transform.
    // * Safe here because we are no longer inside the traverse() callback.
    child.parent?.remove(child);
    scene.add(child);
    child.position.copy(_worldPos);
    child.quaternion.copy(_worldQuat);
    child.scale.copy(_worldScale);
    child.updateMatrixWorld(true);

    // * Outward direction from cart center + random spread + upward bias.
    _outwardDir.set(
      _worldPos.x - cartCenterWorld.x,
      0,
      _worldPos.z - cartCenterWorld.z,
    );
    if (_outwardDir.lengthSq() < 1e-6) {
      // * Part sits at cart center — pick a random horizontal direction.
      const a = Math.random() * Math.PI * 2;
      _outwardDir.set(Math.cos(a), 0, Math.sin(a));
    } else {
      _outwardDir.normalize();
    }

    const speed = SHATTER_LINEAR_SPEED_MIN
      + Math.random() * (SHATTER_LINEAR_SPEED_MAX - SHATTER_LINEAR_SPEED_MIN);
    const vel = new THREE.Vector3(
      _outwardDir.x * speed,
      SHATTER_UPWARD_BIAS + Math.random() * 1.5,
      _outwardDir.z * speed,
    );

    const angVel = new THREE.Vector3(
      (Math.random() - 0.5) * 2 * SHATTER_ANGULAR_SPEED_MAX,
      (Math.random() - 0.5) * 2 * SHATTER_ANGULAR_SPEED_MAX,
      (Math.random() - 0.5) * 2 * SHATTER_ANGULAR_SPEED_MAX,
    );

    parts.push({
      mesh: child,
      vel,
      angVel,
      // * Track shared-geometry flag so cleanup only disposes per-instance geometries.
      // * Mirrors the markers honored by disposeCartMeshResources in entities.js.
      sharedGeometry: Boolean(
        child.userData?.isSharedGeometry
        || child.userData?.sharesCartFrameGeometry
        || child.parent?.userData?.isRaveGltf
        || mesh.userData?.isRaveGltf,
      ),
    });
  }

  // * Hide the now-empty cart root so only the detached parts + explosion are visible.
  // * The root is preserved so doRespawn can rebuild visuals into it.
  mesh.visible = false;

  // * Hide the contact shadow during shatter — it's a separate scene object that
  // * frameVisuals.js stops updating once isShattering is true. Restored on cleanup.
  if (cart.contactShadow) cart.contactShadow.visible = false;

  // * Underwater deaths (Sundial Station): the ocean plane is opaque, so an explosion
  // * at depth is invisible. Clamp the core/ring explosion to the waterline — the
  // * horizontal shockwave ring reads as the water shock — and layer the water-death
  // * dressing (light bloom through the surface, foam boil, bubbles) on top.
  const waterY = getWaterDeathSurfaceY();
  let explosionOrigin = cartCenterWorld;
  if (waterY != null && cartCenterWorld.y < waterY) {
    explosionOrigin = new THREE.Vector3(cartCenterWorld.x, waterY + 0.08, cartCenterWorld.z);
    spawnWaterDeathBurst(cartCenterWorld.x, cartCenterWorld.z, neonHex);
  }
  const explosion = spawnExplosion(scene, explosionOrigin, neonHex);

  cart._shatterState = { parts, explosion };
}

/**
 * * True while a cart's shatter animation is still playing (elapsed < duration).
 * * The VFX lifecycle is self-contained: this — not any network-synced flag —
 * * decides whether the death animation is running. Once it returns false the
 * * effect holds its final (faded) state until cleanupShatter tears it down.
 *
 * @param {object} cart Cart entity.
 * @param {number} now Current time in milliseconds (performance.now() clock).
 * @returns {boolean}
 */
export function isShatterAnimating(cart, now) {
  const explosion = cart?._shatterState?.explosion;
  return Boolean(explosion) && now - explosion.startMs < explosion.durationMs;
}

/**
 * * Per-frame shatter animation: integrates part positions (Euler + gravity) and
 * * updates the multi-layer explosion. Called from {@link updateVisualsAndEffects}
 * * for any cart while {@link isShatterAnimating} is true.
 *
 * * Cleanup is NOT triggered here — {@link doRespawn} calls {@link cleanupShatter}
 * * when the cart teleports back to spawn. Explosion progress is clamped at 1 so
 * * the effect holds its final (faded) state until then.
 *
 * @param {object} cart Cart entity with `_shatterState`.
 * @param {number} dt Frame delta in seconds.
 * @param {number} now Current time in milliseconds.
 * @returns {void}
 */
export function updateShatterEffect(cart, dt, now) {
  const state = cart?._shatterState;
  if (!state) return;

  // * Animate detached parts: simple Euler integration with downward gravity.
  for (const part of state.parts) {
    part.vel.y -= SHATTER_GRAVITY * dt;
    part.mesh.position.x += part.vel.x * dt;
    part.mesh.position.y += part.vel.y * dt;
    part.mesh.position.z += part.vel.z * dt;

    // * Shaft-wall ricochet: reflect the radial velocity of debris that crosses the
    // * inside of the knockout shaft's wall, so explosion parts scatter and rain
    // * down the shaft instead of flying out through the visual wall.
    if (shatterShaft && part.mesh.position.y < shatterShaft.topY) {
      const px = part.mesh.position.x;
      const pz = part.mesh.position.z;
      const r = Math.hypot(px, pz);
      const pen = r - shatterShaft.wallR;
      // * Only act on fresh penetration — parts far outside the wall never entered
      // * the shaft (e.g. KO'd out over the stands); leave those falling.
      if (pen > 0 && pen < SHATTER_WALL_MAX_PENETRATION) {
        const ux = px / r;
        const uz = pz / r;
        const vRad = part.vel.x * ux + part.vel.z * uz;
        if (vRad > 0) {
          const j = (1 + SHATTER_WALL_RESTITUTION) * vRad;
          part.vel.x -= j * ux;
          part.vel.z -= j * uz;
          part.angVel.multiplyScalar(0.85);
        }
        const snapR = shatterShaft.wallR - 0.05;
        part.mesh.position.x = ux * snapR;
        part.mesh.position.z = uz * snapR;
      }
    }

    // * Apply angular velocity as a small delta quaternion each frame.
    _angVelAxis.copy(part.angVel);
    const angSpeed = _angVelAxis.length();
    if (angSpeed > 1e-6) {
      _angVelAxis.multiplyScalar(1 / angSpeed);
      _deltaQuat.setFromAxisAngle(_angVelAxis, angSpeed * dt);
      part.mesh.quaternion.premultiply(_deltaQuat);
    }
  }

  const ex = state.explosion;
  if (!ex) return;

  const elapsed = now - ex.startMs;
  const progress = Math.min(1, Math.max(0, elapsed / ex.durationMs));
  const eased = easeOutCubic(progress);
  const easedFast = easeOutQuart(Math.min(1, elapsed / 380));

  // * Flash: white-hot pop in the first ~70ms, then gone.
  const flashT = Math.min(1, elapsed / 220);
  const flashEnv = flashEnvelope(flashT, 0.18);
  ex.flashMat.opacity = flashEnv * 0.95;
  const flashScale = 0.5 + flashEnv * EXPLOSION_FLASH_PEAK_SCALE * (1 - flashT * 0.35);
  ex.flash.scale.setScalar(flashScale);

  // * Secondary aftershock flash (~120–280ms).
  if (ex.flash2 && ex.flash2Mat) {
    const f2 = Math.min(1, Math.max(0, (elapsed - 110) / 200));
    const f2Env = f2 > 0 ? flashEnvelope(f2, 0.22) : 0;
    ex.flash2Mat.opacity = f2Env * 0.55;
    ex.flash2.scale.setScalar(0.8 + f2Env * 2.8);
  }

  // * Core fireball: expand hard early, fade through mid life.
  const coreScale = EXPLOSION_CORE_START_SCALE
    + (EXPLOSION_CORE_END_SCALE - EXPLOSION_CORE_START_SCALE) * easedFast;
  ex.coreMesh.scale.setScalar(coreScale);
  // * Hot early, then neon mid, then out — opacity front-loaded.
  ex.coreMat.opacity = Math.max(0, 1 - Math.pow(progress, 0.55)) * (progress < 0.08 ? 1 : 0.9);

  // * Outer glow: larger, softer, hangs longer.
  const glowScale = EXPLOSION_GLOW_START_SCALE
    + (EXPLOSION_GLOW_END_SCALE - EXPLOSION_GLOW_START_SCALE) * eased;
  ex.glowMesh.scale.setScalar(glowScale);
  ex.glowMat.opacity = 0.75 * Math.max(0, 1 - Math.pow(progress, 0.85));

  // * Shock rings — independent envelopes.
  for (const ring of ex.rings) {
    const local = (elapsed - ring.delayMs) / ring.lifeMs;
    if (local < 0) {
      ring.mat.opacity = 0;
      continue;
    }
    const lt = Math.min(1, Math.max(0, local));
    const re = easeOutQuart(lt);
    const scale = ring.startScale + (ring.endScale - ring.startScale) * re;
    ring.mesh.scale.setScalar(scale);
    // * Bright edge early, soft fade — not a linear chalk wipe.
    ring.mat.opacity = ring.peakOpacity * (1 - lt) * (1 - lt * 0.35);
  }

  // * Smoke sprites — expand, drift, fade.
  for (const s of ex.smokes) {
    const local = (elapsed - s.delayMs) / s.lifeMs;
    if (local < 0) {
      s.mat.opacity = 0;
      continue;
    }
    const lt = Math.min(1, Math.max(0, local));
    s.sprite.position.x += s.vx * dt;
    s.sprite.position.y += s.vy * dt;
    s.sprite.position.z += s.vz * dt;
    // * Drag so puffs don't rocket forever.
    s.vx *= 1 - 1.8 * dt;
    s.vy *= 1 - 0.6 * dt;
    s.vz *= 1 - 1.8 * dt;
    const sc = s.startScale + (s.endScale - s.startScale) * easeOutCubic(lt);
    s.sprite.scale.setScalar(sc);
    // * Soft bell curve opacity.
    s.mat.opacity = 0.55 * Math.sin(Math.min(1, lt) * Math.PI) * (1 - lt * 0.25);
    s.sprite.material.rotation = (s.sprite.material.rotation || 0) + s.spin * dt;
  }

  // * Sparks — ballistic with gravity + drag.
  if (ex.sparkGeo && ex.sparkVel) {
    const pos = ex.sparkGeo.attributes.position;
    for (let i = 0; i < ex.sparkVel.length; i += 1) {
      const v = ex.sparkVel[i];
      v.y -= 18 * dt;
      v.x *= 1 - 0.8 * dt;
      v.z *= 1 - 0.8 * dt;
      pos.array[i * 3 + 0] += v.x * dt;
      pos.array[i * 3 + 1] += v.y * dt;
      pos.array[i * 3 + 2] += v.z * dt;
    }
    pos.needsUpdate = true;
    // * Sparks die faster than the smoke cloud.
    const sparkT = Math.min(1, elapsed / 780);
    ex.sparkMat.opacity = Math.max(0, 1 - sparkT * sparkT);
    const baseSparkSize = ex.sparkMat.userData.baseSize ?? 0.28;
    ex.sparkMat.size = baseSparkSize * (1 - sparkT * 0.5);
  }

  // * Ember motes — slower gravity, longer hang.
  if (ex.emberGeo && ex.emberVel && ex.emberPointsMat) {
    const pos = ex.emberGeo.attributes.position;
    for (let i = 0; i < ex.emberVel.length; i += 1) {
      const v = ex.emberVel[i];
      v.y -= 6 * dt;
      v.x *= 1 - 0.5 * dt;
      v.z *= 1 - 0.5 * dt;
      pos.array[i * 3 + 0] += v.x * dt;
      pos.array[i * 3 + 1] += v.y * dt;
      pos.array[i * 3 + 2] += v.z * dt;
    }
    pos.needsUpdate = true;
    const embT = Math.min(1, elapsed / 1100);
    ex.emberPointsMat.opacity = 0.9 * Math.max(0, 1 - embT * embT);
    const base = ex.emberPointsMat.userData.baseSize ?? 0.24;
    ex.emberPointsMat.size = base * (1 - embT * 0.35);
  }

  // * Debris shards — tumble + fall.
  if (ex.debris) {
    const debT = Math.min(1, elapsed / ex.durationMs);
    for (const d of ex.debris) {
      d.vy -= 16 * dt;
      d.mesh.position.x += d.vx * dt;
      d.mesh.position.y += d.vy * dt;
      d.mesh.position.z += d.vz * dt;
      d.mesh.rotation.x += d.ax * dt;
      d.mesh.rotation.y += d.ay * dt;
      d.mesh.rotation.z += d.az * dt;
      d.mat.opacity = 0.95 * Math.max(0, 1 - debT * 1.1);
    }
  }

  // * Residual ember sheet on the ground plane of the blast.
  if (ex.emberDisc && ex.emberMat) {
    const emberT = Math.min(1, elapsed / ex.durationMs);
    const ee = easeOutCubic(emberT);
    ex.emberDisc.scale.setScalar(0.6 + ee * 5.5);
    // * Peaks mid-blast, lingers dimly.
    const embOp = emberT < 0.15
      ? emberT / 0.15
      : Math.max(0, 1 - (emberT - 0.15) / 0.85);
    ex.emberMat.opacity = 0.45 * embOp * embOp;
  }

  // * Heat haze disc — wide soft residual.
  if (ex.hazeDisc && ex.hazeMat) {
    const ht = Math.min(1, elapsed / ex.durationMs);
    const he = easeOutCubic(ht);
    ex.hazeDisc.scale.setScalar(0.8 + he * 7.5);
    ex.hazeMat.opacity = 0.28 * Math.sin(Math.min(1, ht * 1.1) * Math.PI) * (1 - ht * 0.25);
  }
}

/**
 * * Tears down all shatter state: removes detached parts + explosion from the scene,
 * * disposes per-instance geometries (skipping shared source geometries) and all
 * * per-instance materials, then clears `cart._shatterState` and `cart.isShattering`.
 *
 * * Called by {@link doRespawn} when the cart teleports back to spawn.
 *
 * @param {object} cart Cart entity with `_shatterState`.
 * @param {THREE.Scene | null | undefined} scene Active Three.js scene.
 * @returns {void}
 */
export function cleanupShatter(cart, scene) {
  const state = cart?._shatterState;
  if (!state) return;

  // * Dispose + remove detached parts.
  const disposedMats = new Set();
  for (const part of state.parts) {
    if (scene) scene.remove(part.mesh);
    // * Shared geometries (rave GLTF source, procedural wheel/hub) are never disposed here.
    if (!part.sharedGeometry && part.mesh.geometry) {
      part.mesh.geometry.dispose();
    }
    const mat = part.mesh.material;
    if (mat) {
      const mats = Array.isArray(mat) ? mat : [mat];
      for (const m of mats) {
        // * Skip shared module-level materials (cart.js SHARED_CHROME_MAT,
        // * SHARED_WHEEL_TIRE_MAT, SHARED_FACE_TRIM_MAT) — disposing them would
        // * deallocate GPU resources still used by other cart meshes.
        if (!m || disposedMats.has(m) || m.userData?.isSharedMaterial) continue;
        disposedMats.add(m);
        m.dispose?.();
      }
    }
  }

  // * Dispose + remove explosion meshes/materials (shared geometries/textures are kept).
  const ex = state.explosion;
  if (scene && ex?.group) {
    scene.remove(ex.group);
  }
  ex?.flashMat?.dispose();
  ex?.flash2Mat?.dispose();
  ex?.coreMat?.dispose();
  ex?.glowMat?.dispose();
  ex?.emberMat?.dispose();
  ex?.hazeMat?.dispose();
  ex?.sparkMat?.dispose();
  ex?.sparkGeo?.dispose();
  ex?.emberPointsMat?.dispose();
  ex?.emberGeo?.dispose();
  if (ex?.rings) {
    for (const ring of ex.rings) ring.mat?.dispose();
  }
  if (ex?.smokes) {
    for (const s of ex.smokes) s.mat?.dispose();
  }
  if (ex?.debris) {
    for (const d of ex.debris) d.mat?.dispose();
  }
  // * Legacy single-ring fields (if present from older state).
  if (ex?.ringMat && !ex.rings) ex.ringMat.dispose();

  cart._shatterState = null;
  cart.isShattering = false;
  cart._shatterDeathPos = null;

  // * Re-show the cart root + contact shadow — caller (doRespawn) rebuilds visuals
  // * into the root and frameVisuals resumes updating the contact shadow.
  if (cart.mesh) cart.mesh.visible = true;
  if (cart.contactShadow) cart.contactShadow.visible = true;
}
