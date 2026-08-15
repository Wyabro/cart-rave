/**
 * ramBoostStreaks.js — Nitro afterimage streak meshes (pooled shader trails).
 *
 * Extracted from src/effects.js (EFFECTS-SPLIT-1). Owns its own `sceneRef`
 * (captured at `initRamBoostStreaks`), independent of the ambient-particles
 * module's copy.
 */

import * as THREE from "three";
import * as Simulation from "../simulation.js";
import * as GameState from "../stores/gameStore.js";
import { CONFIG } from "../config.js";
import { clamp } from "../utils.js";

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

/** @typedef {{
 *   group: THREE.Group,
 *   coreMesh: THREE.Mesh,
 *   glowMesh: THREE.Mesh,
 *   coreMat: THREE.ShaderMaterial,
 *   glowMat: THREE.ShaderMaterial,
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

/** @type {THREE.Scene | null} */
let sceneRef = null;

/**
 * Captures the owning scene and resets the streak pool/config. Called once by
 * `initEffects` (composition root in effects.js) before any spawn/update runs.
 * @param {THREE.Scene} scene
 * @param {RamBoostVisualConfig | null | undefined} config
 */
export function initRamBoostStreaks(scene, config) {
  sceneRef = scene;
  ramBoostConfig = config ?? null;
  ramBoostStreaks = [];
  ramBoostStreakFreeList = [];
  if (ramBoostConfig) ensureStreakGeometries(ramBoostConfig);
}

/**
 * Returns the live streak pool array (entries pushed/removed during play).
 * Read by `initEffects` to hand back to the game boot.
 * @returns {RamBoostStreakEntry[]}
 */
export function getRamBoostStreaks() {
  return ramBoostStreaks;
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
  const safeHex = Number.isFinite(hex) ? (hex >>> 0) : 0xff2bd6;
  ramBoostStreakColorScratch.setHex(safeHex);
  ramBoostStreakColorScratch.getHSL(ramBoostStreakHslScratch);
  // * Cap lightness so neon stays chromatic (high L + additive = white wash).
  ramBoostStreakColorScratch.setHSL(
    ramBoostStreakHslScratch.h,
    Math.min(1, Math.max(0.55, ramBoostStreakHslScratch.s * satMul)),
    Math.min(0.62, Math.max(0.28, ramBoostStreakHslScratch.l * brightMul)),
  );
  return ramBoostStreakColorScratch;
}

/**
 * Cart neon, or a pure gold filament for charged boost (no gold→white wash on cart color).
 * Charged: binary pick — either full cart neon OR solid gold — so both hues read in the wake.
 * Instant/NPC: always cart neon. Gold chance scales with charge multiplier (full charge = more gold).
 * @param {number} hex Cart color
 * @param {RamBoostVisualConfig} rb
 * @param {boolean} charged Charge-release style
 * @param {number} [chargeMul=1] 0..1 charge strength (boostChargeMultiplier)
 * @returns {THREE.Color}
 */
function getStreakColorForBoost(hex, rb, charged, chargeMul = 1) {
  const mul = Number.isFinite(chargeMul) ? clamp(chargeMul, 0, 1) : 1;
  // * Full charge → full goldChance; weak early release → mostly cart neon only.
  const goldChance = charged
    ? (rb.streakChargedGoldChance ?? 0.4) * (0.15 + 0.85 * mul)
    : 0;
  if (goldChance > 0 && Math.random() < goldChance) {
    const goldHex = rb.streakChargedGoldHex ?? 0xffb020;
    ramBoostStreakColorScratch.setHex(goldHex);
    // * Saturated gold, not pale yellow-white.
    ramBoostStreakColorScratch.getHSL(ramBoostStreakHslScratch);
    ramBoostStreakColorScratch.setHSL(
      ramBoostStreakHslScratch.h,
      Math.min(1, Math.max(0.85, ramBoostStreakHslScratch.s)),
      Math.min(0.55, Math.max(0.42, ramBoostStreakHslScratch.l)),
    );
    return ramBoostStreakColorScratch;
  }
  return getAnimeStreakColor(hex, rb);
}

/**
 * Nitro afterimage streak shader — scrolling energy bands on the unit cylinder shell
 * (Y = length). NOTE: these are *hollow* shells, so every fragment sits on the outer
 * radius — do NOT use length(position.xz) as a soft disk falloff (that zeros the trail).
 * Additive + toneMapped off so bloom still picks them up.
 * @param {boolean} isCore Hot white-leaning core vs soft colored sheath.
 * @returns {THREE.ShaderMaterial}
 */
function createRamBoostStreakMaterial(isCore) {
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    // * Shell is thin; both sides so camera angles don't lose the filament.
    side: THREE.DoubleSide,
    uniforms: {
      uColor: { value: new THREE.Color(1, 1, 1) },
      uOpacity: { value: 1 },
      // * 0 at spawn → 1 at death (age fraction).
      uLife: { value: 0 },
      uTime: { value: 0 },
      uSeed: { value: 0 },
      uIsCore: { value: isCore ? 1 : 0 },
      // * 1 = charge-release energy + gold path; 0 = simple solid cart afterimage (instant/NPC).
      uCharged: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uOpacity;
      uniform float uLife;
      uniform float uTime;
      uniform float uSeed;
      uniform float uIsCore;
      uniform float uCharged;
      varying vec2 vUv;

      void main() {
        float along = vUv.y;
        float around = vUv.x;
        float isCore = step(0.5, uIsCore);
        float ends = smoothstep(0.0, 0.1, along) * smoothstep(1.0, 0.82, along);
        float lifeFade = 1.0 - uLife * uLife;

        // --- Instant / NPC: calm solid cart neon (no energy packets, no gold path) ---
        if (uCharged < 0.5) {
          float body = ends * lifeFade;
          float gain = mix(0.85, 1.0, isCore);
          vec3 col = uColor * gain;
          float alpha = clamp(uOpacity * body * mix(0.95, 1.15, isCore), 0.0, 1.0);
          gl_FragColor = vec4(col, alpha);
          return;
        }

        // --- Charge-release: scrolling energy on cart/gold color ---
        float t = uTime * 18.0 + uSeed;
        float band = 0.5 + 0.5 * sin(along * 14.0 - t * 1.35 + uSeed * 0.4);
        band = pow(clamp(band, 0.0, 1.0), 1.6);
        float band2 = 0.5 + 0.5 * sin(along * 7.0 - t * 0.7 + around * 6.28318);
        band2 = pow(clamp(band2, 0.0, 1.0), 2.2);
        float crackle = 0.5 + 0.5 * sin(along * 55.0 - t * 2.8 + around * 18.0 + uSeed);
        crackle = pow(clamp(crackle, 0.0, 1.0), 5.0);

        float body = ends * lifeFade;
        float energy = body * (0.6 + band * 0.7 + band2 * 0.35 + crackle * 0.85);

        vec3 neon = uColor;
        // * Run-6: core gain + bloomBoost trimmed — the >1 radiance stack bloomed the
        // * core to white; the streak should stay the cart's neon.
        float gain = mix(0.95, 1.12, isCore) * (0.75 + band * 0.35 + crackle * 0.45);
        vec3 col = neon * gain;
        col += neon * crackle * mix(0.15, 0.35, isCore);

        float alphaMul = mix(1.05, 1.35, isCore);
        float alpha = clamp(uOpacity * energy * alphaMul, 0.0, 1.0);
        float bloomBoost = mix(1.0, 1.15, isCore);
        gl_FragColor = vec4(col * bloomBoost, alpha);
      }
    `,
  });
  mat.toneMapped = false;
  return mat;
}

/**
 * Builds a fresh (inactive) streak pool entry — shared unit geometries, own materials.
 * @returns {RamBoostStreakEntry}
 */
function buildStreakEntry() {
  const coreMat = createRamBoostStreakMaterial(true);
  const glowMat = createRamBoostStreakMaterial(false);
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

/** @type {THREE.Group | null} */
let _ramStreakWarmupGroup = null;

/**
 * Parks one invisible ram-boost streak (core + glow) in the scene so its custom
 * ShaderMaterial program compiles during play-entry warm-up (renderer.compile()
 * traverses invisible objects) instead of synchronously on the FIRST boost mid-round.
 *
 * Streak entries are pool-built lazily on first spawn (buildStreakEntry), so without
 * this the opening boost of a match triggers a program compile — a visible hitch
 * during exactly the first 30s the round is warming up. Mirrors the shatter /
 * hitmarker / water-death anchors. The streak program is a single source keyed on
 * uniforms (uIsCore/uCharged are uniforms, not defines), so one anchor covers every
 * variant. Uses a throwaway geometry so it never pre-seeds the shared unit geos
 * (ensureStreakGeometries) with default dims before the real rb config lands.
 *
 * @param {THREE.Scene} scene
 */
export function installRamStreakProgramWarmup(scene) {
  if (!scene) return;
  if (_ramStreakWarmupGroup) {
    if (_ramStreakWarmupGroup.parent !== scene) scene.add(_ramStreakWarmupGroup);
    return;
  }
  const group = new THREE.Group();
  group.name = "ramStreakProgramWarmup";
  group.visible = false;
  group.position.set(0, -500, 0);
  const geo = new THREE.CylinderGeometry(0.12, 1, 1, 6, 1);
  group.add(new THREE.Mesh(geo, createRamBoostStreakMaterial(true)));
  group.add(new THREE.Mesh(geo, createRamBoostStreakMaterial(false)));
  _ramStreakWarmupGroup = group;
  scene.add(group);
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

  // * Thin tip of CylinderGeometry is +Y — point +Y rearward so the taper trails
  // * behind the cart (thick end toward bumper, spit toward the wake).
  fwd.negate();
  ramBoostStreakAlignQuat.setFromUnitVectors(ramBoostCylinderAxisY, fwd);
  fwd.negate();

  const t = cart.body.translation();
  ramBoostStreakScratchOrigin.set(t.x, t.y, t.z);

  // * Charged release (human or NPC): energy shader + gold filaments + intensity.
  // * Instant boost: simple solid cart afterimage (different look on purpose).
  const charged = cart.nitroStreakCharged === true;
  const chargeMul = charged
    ? clamp(Number(cart.boostChargeMultiplier) || 1, 0, 1)
    : 0;
  const chargedIntensity = rb.streakChargedIntensityMul ?? 1.25;
  const intensityMul = charged ? 1 + (chargedIntensity - 1) * Math.max(0.35, chargeMul) : 1;
  // * Instant trails stay a bit thinner/softer so charge release reads as the "big" one.
  const radiusMul = charged ? 1 + 0.12 * chargeMul : 0.82;
  const baseRadius = (rb.streakRadiusMeters ?? 0.014) * radiusMul;
  const lengthMul = variant.lengthMul ?? 0.88 + Math.random() * 0.2;
  // * Instant: slightly shorter segments; charged: full length.
  const lengthScale = charged ? 1 : 0.78;
  const streakLength = rb.streakLengthMeters * lengthMul * lengthScale;
  const streakColor = getStreakColorForBoost(cart.cartColor, rb, charged, chargeMul);
  const coreBase = rb.streakCoreOpacity ?? 0.52;
  const glowBase = rb.streakGlowOpacity ?? 0.62;
  const coreOpacity = (charged ? coreBase : coreBase * 0.72) * intensityMul;
  const glowOpacity = (charged ? glowBase : glowBase * 0.65) * intensityMul;

  // * Unit cylinder is centered on the group — place the *whole* segment behind the
  // * rear bumper so it never reads as fire under the chassis.
  const halfLen = (CONFIG.cart?.size?.z ?? 2.26) * 0.5;
  const rearClearance = rb.streakRearClearanceM ?? 0.18;
  const height = rb.streakHeightM ?? 0.28;
  // * Forward tip of the streak (toward cart) sits just aft of the rear bumper.
  const back = halfLen + rearClearance + streakLength * 0.5 + Math.random() * 0.1;
  const lat = variant.lateral ?? (Math.random() * 2 - 1) * 0.28;
  ramBoostStreakScratchPos
    .copy(ramBoostStreakScratchOrigin)
    .addScaledVector(fwd, -back)
    .addScaledVector(rgt, lat);
  ramBoostStreakScratchPos.y += height;

  const entry = acquireStreakEntry(maxActive);
  const seed = Math.random() * 1000;
  const chargedF = charged ? 1 : 0;
  entry.coreMat.uniforms.uColor.value.copy(streakColor);
  entry.coreMat.uniforms.uOpacity.value = coreOpacity;
  entry.coreMat.uniforms.uLife.value = 0;
  entry.coreMat.uniforms.uTime.value = birthMs * 0.001;
  entry.coreMat.uniforms.uSeed.value = seed;
  entry.coreMat.uniforms.uCharged.value = chargedF;
  entry.glowMat.uniforms.uColor.value.copy(streakColor);
  entry.glowMat.uniforms.uOpacity.value = glowOpacity;
  entry.glowMat.uniforms.uLife.value = 0;
  entry.glowMat.uniforms.uTime.value = birthMs * 0.001;
  entry.glowMat.uniforms.uSeed.value = seed + 17.3;
  entry.glowMat.uniforms.uCharged.value = chargedF;

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
    // * Missing/undefined untilMs would make `nowMs > undefined` false and never skip —
    // * treat as inactive. createCart always sets 0; this is belt-and-suspenders for
    // * partial mocks / mid-hello cart objects.
    if (nowMs > (cart.ramBoostActiveUntilMs || 0)) continue;
    cart.ramBoostStreakCarry = (cart.ramBoostStreakCarry || 0) + rb.streakSpawnRatePerSec * dtSec;
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
  // * Hoisted out of the per-streak loop — round phase doesn't change mid-update.
  const isRoundRunning = GameState.getRoundState().phase === "running";

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

    const isBoosting = isRoundRunning
      && s.cart
      && s.cart.ramBoostActiveUntilMs > nowMs;
    const pulse = isBoosting && pulseHz > 0
      ? 1 + 0.22 * Math.sin(nowMs * 0.001 * Math.PI * 2 * pulseHz)
      : 1;

    const coreBase = ramBoostConfig?.streakCoreOpacity ?? 0.85;
    const timeSec = nowMs * 0.001;
    // * Life + time drive the energy shader; opacity keeps config/pulse control.
    // * Allow >1 opacity into the shader — additive HDR headroom for bloom.
    s.coreMat.uniforms.uLife.value = t;
    s.coreMat.uniforms.uTime.value = timeSec;
    s.coreMat.uniforms.uOpacity.value = fade * coreBase * pulse;
    s.glowMat.uniforms.uLife.value = t;
    s.glowMat.uniforms.uTime.value = timeSec;
    s.glowMat.uniforms.uOpacity.value = fade * glowBase * pulse;
  }
}
