// waterDeathFx.js — splash + underwater-detonation VFX for arenas with a water plane
// (Sundial Station). Client-local, no physics, no network traffic.
//
// The ocean plane is OPAQUE, so nothing can literally render below it — every
// "underwater" read is faked just above the surface, which is also how a detonation
// under water looks from above: a bloom of light through the surface, a foam boil,
// and bubbles. Three pieces:
//
//   1. Entry splash — when a falling cart crosses the waterline: white foam ring,
//      a brief spray column, and ballistic droplets. Detected per frame from cart
//      mesh positions (works for local, host, and net-interpolated remote carts).
//   2. Depth burst — called by cartShatter when a cart explodes below the waterline:
//      a hot neon-tinted light bloom expanding through the surface, a sharp shock
//      ring, a delayed foam boil, and rising bubble churn. cartShatter also clamps
//      its own core/ring explosion to the surface so the two read as one event.
//
// Lifecycle mirrors cartShatter: shared geometries live at module level; per-effect
// materials/geometries are created on spawn and disposed when the effect ends. The
// level registers the environment in its init and clears it in dispose(), which also
// tears down any effects still running.

import * as THREE from "three";
import { CONFIG } from "../config.js";

const MAX_ACTIVE_EFFECTS = 8; // hard cap — 4 carts can die nearly simultaneously
const TELEPORT_JUMP_M = 8; // per-frame Y jump larger than this is a respawn, not a fall

// * Shared geometry singletons (never disposed).
const _ringGeo = new THREE.RingGeometry(0.5, 0.85, 32);
const _discGeo = new THREE.CircleGeometry(1, 24);
const _columnGeo = new THREE.ConeGeometry(0.42, 1.6, 10, 1, true);

const _tmpColor = new THREE.Color();
const _warmGlow = new THREE.Color(0xff9040); // sunset-water tint mixed into neon blooms

/** @type {{ scene: THREE.Scene, waterY: number } | null} */
let env = null;

/**
 * Live effects. Each entry owns its scene objects and disposables and exposes a
 * step(now, dt) that returns false when finished.
 * @type {{ step: (now: number, dt: number) => boolean, teardown: () => void }[]}
 */
const active = [];

/**
 * Registers (or clears) the active level's water plane for death FX. Clearing tears
 * down any effects still playing. Call from level init / dispose.
 *
 * @param {{ scene: THREE.Scene, waterY: number } | null} params
 * @returns {void}
 */
export function setWaterDeathEnvironment(params) {
  if (!params) {
    for (const fx of active) fx.teardown();
    active.length = 0;
  }
  env = params ?? null;
}

/**
 * Water surface height of the active level, or null when the level has no water.
 * Used by cartShatter to clamp underwater explosion origins to the surface.
 *
 * @returns {number | null}
 */
export function getWaterDeathSurfaceY() {
  return env ? env.waterY : null;
}

/**
 * Diagnostic: number of splash/burst effects currently animating. A count that never
 * drains back to zero means the per-frame driver (frameVisuals) is not running.
 * Reached via the window.CartClashWaterFx console handle (not exported — no in-code callers).
 *
 * @returns {number}
 */
function getActiveWaterFxCount() {
  return active.length;
}

// * Agent-facing console API (same convention as CartClashDevUnlocks): dynamic imports
// * from the console get a different Vite module instance, so debugging must go
// * through this handle to reach the instance the game actually uses.
if (typeof window !== "undefined") {
  window.CartClashWaterFx = {
    getActiveWaterFxCount,
    getWaterDeathSurfaceY,
    spawnWaterDeathBurst,
  };
}

/** Pushes an effect, dropping the request when at the cap (never the oldest — an
 * in-flight teardown mid-step would corrupt the update loop's iteration). */
function addEffect(fx) {
  if (active.length >= MAX_ACTIVE_EFFECTS) {
    fx.teardown();
    return;
  }
  active.push(fx);
}

/**
 * Entry splash at (x, waterY, z): foam ring + spray column + ballistic droplets.
 *
 * @param {number} x
 * @param {number} z
 * @param {number} intensity 0..1 — scales ring size and droplet count/speed.
 * @returns {void}
 */
function spawnSplash(x, z, intensity) {
  if (!env) return;
  const { scene, waterY } = env;
  const startMs = performance.now();

  const group = new THREE.Group();
  group.position.set(x, waterY + 0.06, z);

  const ringMat = new THREE.MeshBasicMaterial({
    color: 0xfff3e2,
    transparent: true,
    opacity: 0.85,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const ring = new THREE.Mesh(_ringGeo, ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.scale.setScalar(1.1);
  group.add(ring);

  const columnMat = new THREE.MeshBasicMaterial({
    color: 0xffe9d2,
    transparent: true,
    opacity: 0.75,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const column = new THREE.Mesh(_columnGeo, columnMat);
  column.position.y = 0.7;
  column.scale.set(1, 0.4, 1);
  group.add(column);

  // Droplets — ballistic points with per-splash geometry (disposed on teardown).
  const count = 10 + Math.round(intensity * 10);
  const positions = new Float32Array(count * 3);
  const velocities = [];
  for (let i = 0; i < count; i += 1) {
    const a = Math.random() * Math.PI * 2;
    const vHoriz = 0.8 + Math.random() * (2.2 + intensity * 2.5);
    positions[i * 3 + 0] = Math.cos(a) * 0.4;
    positions[i * 3 + 1] = 0.15;
    positions[i * 3 + 2] = Math.sin(a) * 0.4;
    velocities.push({
      x: Math.cos(a) * vHoriz,
      y: 3.5 + Math.random() * (4.5 + intensity * 4),
      z: Math.sin(a) * vHoriz,
    });
  }
  const dropGeo = new THREE.BufferGeometry();
  dropGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const dropMat = new THREE.PointsMaterial({
    color: 0xfff2e0,
    size: 0.17,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
  });
  const drops = new THREE.Points(dropGeo, dropMat);
  group.add(drops);

  scene.add(group);
  const durationMs = 850;
  const ringEndScale = 4.5 + intensity * 3;

  addEffect({
    step(now, dt) {
      const t = Math.min(1, (now - startMs) / durationMs);
      const eased = 1 - (1 - t) * (1 - t);
      ring.scale.setScalar(1.1 + (ringEndScale - 1.1) * eased);
      ringMat.opacity = 0.85 * (1 - t);
      // Column: fast rise, then collapse.
      const colT = Math.min(1, t * 1.8);
      const rise = colT < 0.45 ? colT / 0.45 : 1 - (colT - 0.45) / 0.55;
      column.scale.set(1 + eased * 0.7, 0.4 + rise * (0.9 + intensity * 0.6), 1 + eased * 0.7);
      column.position.y = 0.7 * column.scale.y;
      columnMat.opacity = 0.75 * (1 - colT);
      // Droplets: Euler ballistics in group space.
      const pos = dropGeo.attributes.position;
      for (let i = 0; i < velocities.length; i += 1) {
        const v = velocities[i];
        v.y -= 22 * dt;
        pos.array[i * 3 + 0] += v.x * dt;
        pos.array[i * 3 + 1] = Math.max(0.02, pos.array[i * 3 + 1] + v.y * dt);
        pos.array[i * 3 + 2] += v.z * dt;
      }
      pos.needsUpdate = true;
      dropMat.opacity = 0.9 * (1 - t);
      return t < 1;
    },
    teardown() {
      scene.remove(group);
      ringMat.dispose();
      columnMat.dispose();
      dropMat.dispose();
      dropGeo.dispose();
    },
  });
}

/**
 * Underwater-detonation surface dressing at (x, waterY, z): neon-tinted light bloom,
 * sharp shock ring, delayed foam boil, and rising bubble churn. cartShatter calls
 * this alongside its (surface-clamped) core/ring explosion.
 *
 * @param {number} x
 * @param {number} z
 * @param {number} neonHex Victim's neon color — tinted toward warm sunset water.
 * @returns {void}
 */
export function spawnWaterDeathBurst(x, z, neonHex) {
  if (!env) return;
  const { scene, waterY } = env;
  const startMs = performance.now();

  const group = new THREE.Group();
  group.position.set(x, waterY + 0.05, z);

  _tmpColor.setHex(neonHex).lerp(_warmGlow, 0.45);

  // Light bloom through the surface — the "you can see it go off down there" read.
  const bloomMat = new THREE.MeshBasicMaterial({
    color: _tmpColor.clone(),
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const bloom = new THREE.Mesh(_discGeo, bloomMat);
  bloom.rotation.x = -Math.PI / 2;
  bloom.scale.setScalar(1.5);
  group.add(bloom);

  // Sharp shock ring — the initial crack.
  const shockMat = new THREE.MeshBasicMaterial({
    color: neonHex,
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const shock = new THREE.Mesh(_ringGeo, shockMat);
  shock.rotation.x = -Math.PI / 2;
  shock.position.y = 0.02;
  shock.scale.setScalar(1);
  group.add(shock);

  // Geyser pillar — the detonation kicks a glowing spray column above the surface.
  // The one VERTICAL element in the burst: horizontal discs vanish at the grazing
  // angles most players see distant water from, but the pillar reads at any range.
  const geyserMat = new THREE.MeshBasicMaterial({
    color: _tmpColor.clone(),
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const geyser = new THREE.Mesh(_columnGeo, geyserMat);
  geyser.position.y = 0.8;
  geyser.scale.set(1.6, 0.5, 1.6);
  group.add(geyser);

  // Foam boil — delayed, soft, white.
  const boilMat = new THREE.MeshBasicMaterial({
    color: 0xffefdd,
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const boil = new THREE.Mesh(_ringGeo, boilMat);
  boil.rotation.x = -Math.PI / 2;
  boil.position.y = 0.04;
  boil.scale.setScalar(1);
  group.add(boil);

  // Bubble churn — points drifting outward and barely upward, popping at the surface.
  const bubbleCount = 16;
  const bubblePositions = new Float32Array(bubbleCount * 3);
  const bubbleVel = [];
  for (let i = 0; i < bubbleCount; i += 1) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.random() * 1.4;
    bubblePositions[i * 3 + 0] = Math.cos(a) * r;
    bubblePositions[i * 3 + 1] = 0.08;
    bubblePositions[i * 3 + 2] = Math.sin(a) * r;
    bubbleVel.push({ x: Math.cos(a) * (0.6 + Math.random()), z: Math.sin(a) * (0.6 + Math.random()) });
  }
  const bubbleGeo = new THREE.BufferGeometry();
  bubbleGeo.setAttribute("position", new THREE.BufferAttribute(bubblePositions, 3));
  const bubbleMat = new THREE.PointsMaterial({
    color: 0xfff6e8,
    size: 0.14,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  const bubbles = new THREE.Points(bubbleGeo, bubbleMat);
  group.add(bubbles);

  scene.add(group);
  const durationMs = 1050;
  const boilDelayMs = 200;

  addEffect({
    step(now, dt) {
      const elapsed = now - startMs;
      const t = Math.min(1, elapsed / durationMs);
      const eased = 1 - (1 - t) * (1 - t) * (1 - t);

      // Bloom: hard flash in the first ~90ms, then a long decay while expanding.
      const flash = Math.min(1, elapsed / 90);
      bloomMat.opacity = 0.95 * flash * (1 - t * t);
      bloom.scale.setScalar(1.5 + eased * 8.5);

      shockMat.opacity = 0.9 * Math.max(0, 1 - elapsed / 300);
      shock.scale.setScalar(1 + Math.min(1, elapsed / 300) * 5.5);

      // Geyser: erupts just after the flash, collapses through the back half.
      const gT = Math.min(1, Math.max(0, (elapsed - 60) / 700));
      const gRise = gT < 0.35 ? gT / 0.35 : 1 - (gT - 0.35) / 0.65;
      geyser.scale.set(1.6 + gT * 1.2, 0.5 + gRise * 2.6, 1.6 + gT * 1.2);
      geyser.position.y = 0.8 * geyser.scale.y;
      geyserMat.opacity = 0.85 * gRise;

      const boilT = Math.min(1, Math.max(0, (elapsed - boilDelayMs) / (durationMs - boilDelayMs)));
      boilMat.opacity = 0.55 * Math.sin(Math.min(1, boilT) * Math.PI);
      boil.scale.setScalar(1 + boilT * 7.5);

      const pos = bubbleGeo.attributes.position;
      for (let i = 0; i < bubbleVel.length; i += 1) {
        pos.array[i * 3 + 0] += bubbleVel[i].x * dt;
        pos.array[i * 3 + 1] += 0.35 * dt;
        pos.array[i * 3 + 2] += bubbleVel[i].z * dt;
      }
      pos.needsUpdate = true;
      bubbleMat.opacity = 0.8 * Math.sin(boilT * Math.PI);

      return t < 1;
    },
    teardown() {
      scene.remove(group);
      bloomMat.dispose();
      shockMat.dispose();
      geyserMat.dispose();
      boilMat.dispose();
      bubbleMat.dispose();
      bubbleGeo.dispose();
    },
  });
}

/**
 * Per-frame driver: detects falling carts crossing the waterline (spawning entry
 * splashes) and advances all live effects. No-ops instantly when the active level
 * has no water. Call once per rendered frame.
 *
 * @param {object[]} allCarts Slot carts (entries may be null).
 * @param {number} now Current time in milliseconds (performance.now() clock).
 * @param {number} dt Frame delta in seconds.
 * @returns {void}
 */
export function updateWaterDeathFx(allCarts, now, dt) {
  if (!env) return;

  const visualOffset = CONFIG.cart.visualOffset;
  for (let i = 0; i < (allCarts?.length ?? 0); i += 1) {
    const cart = allCarts[i];
    if (!cart?.mesh) continue;
    const bodyY = cart.mesh.position.y - visualOffset;
    const lastY = cart._waterFxLastY;
    cart._waterFxLastY = bodyY;
    if (lastY == null) continue;
    const drop = lastY - bodyY;
    // Downward waterline crossing at falling speed — teleports (respawns, sudden-death
    // spectator parking) jump farther than any real fall can in one frame.
    if (lastY >= env.waterY && bodyY < env.waterY && drop > 0 && drop < TELEPORT_JUMP_M) {
      const vy = drop / Math.max(dt, 1 / 240);
      if (vy > 2.5) {
        spawnSplash(cart.mesh.position.x, cart.mesh.position.z, Math.min(1, (vy - 2.5) / 16));
      }
    }
  }

  for (let i = active.length - 1; i >= 0; i -= 1) {
    if (!active[i].step(now, dt)) {
      active[i].teardown();
      active.splice(i, 1);
    }
  }
}
