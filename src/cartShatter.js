// cartShatter.js — "Shatter & Explosion" death VFX for falling carts.
//
// * Detaches a cart's visual meshes, gives each a random outward + angular velocity
// * (simple Euler integration, no Rapier bodies), and spawns a lightweight additive
// * explosion (glowing sphere + horizontal shockwave ring) at the cart center.
// * Geometries/materials for the explosion are created on the fly and disposed after
// * ~1s. Per-instance shatter-part geometries are disposed on cleanup while shared
// * source geometries (rave GLTF / procedural shared wheel+hub) are left alone.
// * Physics sync is disabled while shattering so syncCartMeshFromPhysics leaves the
// * root pose frozen; doRespawn calls cleanupShatter to tear everything down.

import * as THREE from "three";

// * Tuning — kept lightweight for 60fps with 4 carts potentially shattering at once.
const SHATTER_GRAVITY = 14.0; // m/s^2 — slightly stronger than world gravity for a "juicy" fall
const SHATTER_LINEAR_SPEED_MIN = 2.5; // m/s — min outward burst speed per part
const SHATTER_LINEAR_SPEED_MAX = 6.5; // m/s — max outward burst speed per part
const SHATTER_UPWARD_BIAS = 2.0; // m/s — initial upward kick so parts lift before falling
const SHATTER_ANGULAR_SPEED_MAX = 6.0; // rad/s — max tumble rate per axis
const SHATTER_DURATION_MS = 1000; // ms — explosion animation length before parts hold last pose

const EXPLOSION_CORE_START_SCALE = 0.6;
const EXPLOSION_CORE_END_SCALE = 3.2;
const EXPLOSION_RING_START_SCALE = 0.4;
const EXPLOSION_RING_END_SCALE = 5.5;

// * Reused scratch vectors — avoid per-frame allocations across potentially many parts.
const _worldPos = new THREE.Vector3();
const _worldQuat = new THREE.Quaternion();
const _worldScale = new THREE.Vector3();
const _worldMat = new THREE.Matrix4();
const _outwardDir = new THREE.Vector3();
const _angVelAxis = new THREE.Vector3();
const _deltaQuat = new THREE.Quaternion();

/**
 * * Spawns the explosion VFX (additive glowing sphere + horizontal shockwave ring)
 * * at the given world position. Geometries + materials are created here and disposed
 * * by {@link cleanupShatter}.
 *
 * @param {THREE.Scene} scene
 * @param {{ x: number, y: number, z: number }} origin World position.
 * @param {number} neonHex Player neon color for the explosion tint.
 * @returns {{ group: THREE.Group, coreMesh: THREE.Mesh, coreMat: THREE.MeshBasicMaterial, ringMesh: THREE.Mesh, ringMat: THREE.MeshBasicMaterial, startMs: number, durationMs: number }}
 */
function spawnExplosion(scene, origin, neonHex) {
  const group = new THREE.Group();
  group.position.set(origin.x, origin.y, origin.z);

  // * Core: additive glowing sphere that scales up + fades out.
  const coreGeo = new THREE.SphereGeometry(0.5, 16, 12);
  const coreMat = new THREE.MeshBasicMaterial({
    color: neonHex,
    blending: THREE.AdditiveBlending,
    transparent: true,
    opacity: 1.0,
    depthWrite: false,
  });
  const coreMesh = new THREE.Mesh(coreGeo, coreMat);
  coreMesh.scale.setScalar(EXPLOSION_CORE_START_SCALE);
  group.add(coreMesh);

  // * Ring: flat horizontal shockwave that expands outward + fades out.
  const ringGeo = new THREE.RingGeometry(0.5, 0.85, 32);
  const ringMat = new THREE.MeshBasicMaterial({
    color: neonHex,
    blending: THREE.AdditiveBlending,
    transparent: true,
    opacity: 1.0,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const ringMesh = new THREE.Mesh(ringGeo, ringMat);
  // * Orient horizontally (RingGeometry lives in XY plane; rotate -π/2 about X to lie flat).
  ringMesh.rotation.x = -Math.PI / 2;
  ringMesh.scale.setScalar(EXPLOSION_RING_START_SCALE);
  group.add(ringMesh);

  scene.add(group);

  return {
    group,
    coreMesh,
    coreMat,
    ringMesh,
    ringMat,
    startMs: performance.now(),
    durationMs: SHATTER_DURATION_MS,
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

  // * Capture cart center in world space (root position + visual offset approximated by
  // * the root's current world transform). Used as the explosion origin + outward bias point.
  mesh.updateMatrixWorld(true);
  mesh.getWorldPosition(_worldPos);

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
      _worldPos.x - (mesh.position.x),
      0,
      _worldPos.z - (mesh.position.z),
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

  const explosion = spawnExplosion(scene, mesh.position, neonHex);

  cart._shatterState = { parts, explosion };
}

/**
 * * Per-frame shatter animation: integrates part positions (Euler + gravity) and
 * * updates the explosion scale/opacity. Called from {@link updateVisualsAndEffects}
 * * for any cart with `isShattering === true`.
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

    // * Apply angular velocity as a small delta quaternion each frame.
    _angVelAxis.copy(part.angVel);
    const angSpeed = _angVelAxis.length();
    if (angSpeed > 1e-6) {
      _angVelAxis.multiplyScalar(1 / angSpeed);
      _deltaQuat.setFromAxisAngle(_angVelAxis, angSpeed * dt);
      part.mesh.quaternion.premultiply(_deltaQuat);
    }
  }

  // * Animate explosion: scale up + fade out over SHATTER_DURATION_MS.
  const elapsed = now - state.explosion.startMs;
  const progress = Math.min(1, Math.max(0, elapsed / state.explosion.durationMs));
  // * Ease-out cubic for a snappy pop that settles.
  const eased = 1 - (1 - progress) * (1 - progress) * (1 - progress);

  const coreScale = EXPLOSION_CORE_START_SCALE
    + (EXPLOSION_CORE_END_SCALE - EXPLOSION_CORE_START_SCALE) * eased;
  state.explosion.coreMesh.scale.setScalar(coreScale);
  state.explosion.coreMat.opacity = 1 - progress;

  const ringScale = EXPLOSION_RING_START_SCALE
    + (EXPLOSION_RING_END_SCALE - EXPLOSION_RING_START_SCALE) * eased;
  state.explosion.ringMesh.scale.setScalar(ringScale);
  state.explosion.ringMat.opacity = 1 - progress;
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
        if (!m || disposedMats.has(m)) continue;
        disposedMats.add(m);
        m.dispose?.();
      }
    }
  }

  // * Dispose + remove explosion meshes/materials.
  if (scene && state.explosion?.group) {
    scene.remove(state.explosion.group);
  }
  state.explosion?.coreMesh?.geometry?.dispose();
  state.explosion?.coreMat?.dispose();
  state.explosion?.ringMesh?.geometry?.dispose();
  state.explosion?.ringMat?.dispose();

  cart._shatterState = null;
  cart.isShattering = false;

  // * Re-show the cart root + contact shadow — caller (doRespawn) rebuilds visuals
  // * into the root and frameVisuals resumes updating the contact shadow.
  if (cart.mesh) cart.mesh.visible = true;
  if (cart.contactShadow) cart.contactShadow.visible = true;
}
