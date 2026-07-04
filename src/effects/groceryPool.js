/**
 * groceryPool.js — Pre-allocated cosmetic grocery-spill rigidbodies + InstancedMesh pool.
 *
 * Loads 6 GLTF grocery models (milk, cereal, soda, soup, orange, baguette) and creates
 * one InstancedMesh per model type. Each model gets ~11 pre-allocated Rapier dynamic
 * rigidbodies. Grocery items spawn when a cart takes a hit (triggerSpill) and fade out
 * after 8.5 s or when the owning cart respawns (releaseByCartId). Collision groups
 * isolate groceries from carts (group 1) so they never push player physics.
 */

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { RAPIER } from "../physics/rapierInstance.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** @type {number} Raw Rapier collision groups bitmask — group 2 membership, filter collides with everything except group 1 (carts). */
const GROCERY_COLLISION_GROUPS = (0x0002 << 16) | 0xFFFFFFFE;

/** @type {number} Instances per grocery model (6 models × 11 = 66 total). */
const PER_MODEL_POOL = 11;

/** @type {number} Total pre-allocated grocery item slots. */
const POOL_SIZE = 66;

/** @type {number} Milliseconds before auto-fade begins. */
const FADE_DELAY_MS = 8500;

/** @type {number} Fade duration in milliseconds (scale ramps from 1 → 0). */
const FADE_DURATION_MS = 1500;

/** @type {number} Friction coefficient for grocery colliders. */
const COLLIDER_FRICTION = 0.4;

/** @type {number} Restitution (bounciness) for grocery colliders. */
const COLLIDER_RESTITUTION = 0.15;

/** @type {string} Draco decoder WASM/JS path (mirrors cartRaveGltf.js). */
const DRACO_DECODER_PATH = "/draco/gltf/";

/**
 * * Grocery model definitions — each maps to a GLTF file and a collider shape type.
 * * Actual collider half-extents are computed dynamically from the normalized
 * * geometry bounding box in init().
 * @type {Array<{
 *   name: string,
 *   path: string,
 *   type: "cuboid" | "cylinder" | "ball",
 * }>}
 */
const MODEL_DEFS = [
  { name: "milk", path: "/models/groceries/milk.glb", type: "cuboid" },
  { name: "cereal", path: "/models/groceries/cereal.glb", type: "cuboid" },
  { name: "soda", path: "/models/groceries/soda.glb", type: "cylinder" },
  { name: "soup", path: "/models/groceries/soup.glb", type: "cylinder" },
  { name: "orange", path: "/models/groceries/orange.glb", type: "ball" },
  { name: "baguette", path: "/models/groceries/baguette.glb", type: "cuboid" },
];

/**
 * * Local spawn offsets relative to the cart body (meters).
 * * Rotated by the cart quaternion before adding to cart position.
 * @type {Array<{ x: number, y: number, z: number }>}
 */
const LOCAL_OFFSETS = [
  { x: -0.2, y: 0.5, z: 0 },
  { x: 0.2, y: 0.5, z: 0 },
  { x: 0, y: 0.7, z: 0.1 },
  { x: -0.3, y: 0.4, z: 0.2 },
  { x: 0.3, y: 0.4, z: -0.2 },
  { x: 0, y: 0.6, z: -0.3 },
];

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

/** @type {THREE.InstancedMesh[]} */
let instancedMeshes = [];

/** @type {THREE.Scene | null} */
let sceneRef = null;

/** @type {import("@dimforge/rapier3d").World | null} */
let worldRef = null;

/**
 * * Each pool slot tracks which InstancedMesh owns it and its index within.
 * @type {Array<{
 *   body: import("@dimforge/rapier3d").RigidBody,
 *   meshRef: THREE.InstancedMesh,
 *   meshIndex: number,
 *   active: boolean,
 *   spawnTimeMs: number,
 *   cartId: string | null,
 *   fadeStartMs: number,
 * }>} */
let pool = [];

/** @type {THREE.BufferGeometry[]} */
let loadedGeometries = [];

/** @type {THREE.Material[]} */
let loadedMaterials = [];

// ---------------------------------------------------------------------------
// Scratch objects (reused each frame / spawn to avoid GC pressure)
// ---------------------------------------------------------------------------

const _scratchPosition = new THREE.Vector3();
const _scratchQuat = new THREE.Quaternion();
const _scratchScale = new THREE.Vector3();
const _scratchMatrix = new THREE.Matrix4();
const _zeroScale = new THREE.Vector3(0, 0, 0);
const _oneScale = new THREE.Vector3(1, 1, 1);

// ---------------------------------------------------------------------------
// DRACO / GLTF loader (lazy singleton, mirrors cartRaveGltf.js pattern)
// ---------------------------------------------------------------------------

/** @type {DRACOLoader | null} */
let _dracoLoader = null;

/** @type {GLTFLoader | null} */
let _loader = null;

/** @returns {DRACOLoader} */
function getDracoLoader() {
  if (!_dracoLoader) {
    _dracoLoader = new DRACOLoader();
    _dracoLoader.setDecoderPath(DRACO_DECODER_PATH);
    _dracoLoader.setWorkerLimit(
      Math.max(1, Math.min(4, (navigator.hardwareConcurrency ?? 4) - 1)),
    );
    _dracoLoader.preload();
  }
  return _dracoLoader;
}

/** @returns {GLTFLoader} */
function getLoader() {
  if (!_loader) {
    _loader = new GLTFLoader();
    _loader.setDRACOLoader(getDracoLoader());
  }
  return _loader;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * * Loads all 6 GLTF grocery models and creates one InstancedMesh per model type
 * * with 11 pre-allocated Rapier dynamic rigidbodies each (66 total). All instances
 * * start inactive (scale 0). Grocery items use collision group 2 and filter out
 * * group 1 (carts).
 *
 * @param {THREE.Scene} scene Active Three.js scene.
 * @param {import("@dimforge/rapier3d").World} world Active Rapier physics world.
 * @returns {Promise<void>}
 */
export async function init(scene, world) {
  sceneRef = scene;
  worldRef = world;

  const loader = getLoader();

  // * Load all 6 GLTF models in parallel.
  /** @type {THREE.Object3D[]} */
  const gltfs = await Promise.all(
    MODEL_DEFS.map((def) =>
      loader.loadAsync(def.path).then((gltf) => gltf.scene),
    ),
  );

  // * Build InstancedMeshes and Rapier rigidbodies for each model type.
  const interactionGroups = GROCERY_COLLISION_GROUPS;

  instancedMeshes = [];
  pool = [];

  for (let modelIdx = 0; modelIdx < MODEL_DEFS.length; modelIdx += 1) {
    const def = MODEL_DEFS[modelIdx];
    const gltfScene = gltfs[modelIdx];

    // * Find the first mesh in the loaded scene to extract geometry and material.
    /** @type {THREE.Mesh | null} */
    let sourceMesh = null;
    gltfScene.traverse((child) => {
      if (!sourceMesh && child instanceof THREE.Mesh) {
        sourceMesh = child;
      }
    });

    if (!sourceMesh) {
      // eslint-disable-next-line no-console
      console.warn(`[groceryPool] No mesh found in ${def.path}`);
      continue;
    }

    const geometry = sourceMesh.geometry.clone();
    const material = sourceMesh.material.clone();

    // * Normalize geometry: text-to-3D models may have arbitrary scale and off-center pivots.
    // * Bake a uniform scale so the model fits within ~0.5 world units, then recenter the origin.
    geometry.computeBoundingBox();
    const bb = geometry.boundingBox;
    if (bb) {
      const size = new THREE.Vector3();
      bb.getSize(size);
      const scaleFactor = 0.5 / Math.max(size.x, size.y, size.z);
      if (Number.isFinite(scaleFactor) && scaleFactor !== 1) {
        geometry.scale(scaleFactor, scaleFactor, scaleFactor);
      }
      // Recompute bounding box AFTER scale to get the correct center
      geometry.computeBoundingBox();
      const center = new THREE.Vector3();
      geometry.boundingBox.getCenter(center);
      geometry.translate(-center.x, -center.y, -center.z);
      geometry.computeBoundingBox();
    }

    // * Compute collider half-extents from the normalized geometry bounding box
    // * so primitive colliders perfectly match the visual mesh.
    const bbFinal = geometry.boundingBox;
    const hx = (bbFinal.max.x - bbFinal.min.x) / 2;
    const hy = (bbFinal.max.y - bbFinal.min.y) / 2;
    const hz = (bbFinal.max.z - bbFinal.min.z) / 2;

    let colliderDesc;
    switch (def.type) {
      case "cuboid":
        colliderDesc = RAPIER.ColliderDesc.cuboid(hx, hy, hz);
        break;
      case "cylinder":
        colliderDesc = RAPIER.ColliderDesc.cylinder(Math.max(hx, hz), hy);
        break;
      case "ball":
        colliderDesc = RAPIER.ColliderDesc.ball(Math.max(hx, hy, hz));
        break;
      default:
        colliderDesc = RAPIER.ColliderDesc.cuboid(hx, hy, hz);
    }
    colliderDesc
      .setFriction(COLLIDER_FRICTION)
      .setRestitution(COLLIDER_RESTITUTION)
      .setCollisionGroups(interactionGroups);

    // * Store normalized geometry & material for cargo bay visual.
    // * Mark as isSharedMaterial so cartShatter cleanup does not dispose GPU resources.
    material.userData = { ...material.userData, isSharedMaterial: true };
    const cargoMat = material.clone();
    cargoMat.userData = { ...cargoMat.userData, isSharedMaterial: true };
    loadedGeometries.push(geometry.clone());
    loadedMaterials.push(cargoMat);

    const im = new THREE.InstancedMesh(geometry, material, PER_MODEL_POOL);
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    im.frustumCulled = false; // * Prevent culling when camera looks away from scattered groceries.
    im.castShadow = true;
    im.receiveShadow = true;
    scene.add(im);
    instancedMeshes.push(im);

    // * Pre-allocate Rapier rigidbodies for this model.
    for (let i = 0; i < PER_MODEL_POOL; i += 1) {
      const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(0, -999, 0) // * Off-screen while inactive.
        .setCanSleep(true);
      const body = world.createRigidBody(bodyDesc);

      world.createCollider(colliderDesc, body);

      // * Start disabled — will be enabled on triggerSpill and disabled on fade-out.
      body.setEnabled(false);

      // * Set initial instance matrix to scale 0 (invisible).
      _scratchMatrix.compose(
        _scratchPosition.set(0, -999, 0),
        _scratchQuat.identity(),
        _zeroScale,
      );
      im.setMatrixAt(i, _scratchMatrix);

      pool.push({
        body,
        meshRef: im,
        meshIndex: i,
        active: false,
        spawnTimeMs: 0,
        cartId: null,
        fadeStartMs: Number.POSITIVE_INFINITY,
      });
    }

    im.instanceMatrix.needsUpdate = true;
  }
}

/**
 * * Creates a pre-spill visual cargo bay: a THREE.Group with 6 randomly selected
 * * grocery meshes arranged in a loose pile, scaled down to fit inside the cart basket.
 *
 * @returns {THREE.Group} The cargo bay group (empty if models haven't loaded yet).
 */
export function createCargoBay() {
  const group = new THREE.Group();
  if (loadedGeometries.length === 0) return group;

  // * Shuffle indices so we get a good random mix of the 6 model types.
  const indices = Array.from(
    { length: loadedGeometries.length },
    (_, k) => k,
  );
  for (let i = indices.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }

  // * Scale down to fit inside the cart basket.
  const cargoScale = 0.7;

  for (let i = 0; i < 6; i += 1) {
    const idx = indices[i % indices.length];
    const mesh = new THREE.Mesh(loadedGeometries[idx], loadedMaterials[idx]);
    mesh.scale.setScalar(cargoScale);
    mesh.position.set(
      (Math.random() - 0.5) * 0.4,  // X: [-0.2, 0.2]
      Math.random() * 0.15,         // Y: [0, 0.15]
      (Math.random() - 0.5) * 0.4,  // Z: [-0.2, 0.2]
    );
    mesh.rotation.set(
      Math.random() * Math.PI * 2,
      Math.random() * Math.PI * 2,
      Math.random() * Math.PI * 2,
    );
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  return group;
}

/**
 * * Spawns up to `count` grocery items at the cart's position with velocity
 * * derived from the cart's linear velocity plus random scatter. Models are
 * * randomly selected; if a model's pool is full, another is picked.
 *
 * @param {string} cartId Unique identifier of the owning cart.
 * @param {{ x: number, y: number, z: number }} cartPos World-space cart position.
 * @param {{ x: number, y: number, z: number, w: number }} cartQuat Rapier quaternion.
 * @param {{ x: number, y: number, z: number }} cartLinvel Cart's current linear velocity.
 * @param {number} [count=6] Number of grocery items to spawn (clamped to available slots).
 * @param {THREE.Object3D} [cargoBay=null] Optional cargo bay group to hide on spill.
 */
export function triggerSpill(cartId, cartPos, cartQuat, cartLinvel, count = 6, cargoBay = null) {
  if (instancedMeshes.length === 0 || !worldRef) return;

  // * Hide the cargo bay visual immediately when spill happens.
  if (cargoBay) cargoBay.visible = false;

  const cartThreeQuat = _scratchQuat.set(
    cartQuat.x,
    cartQuat.y,
    cartQuat.z,
    cartQuat.w,
  );
  const now = performance.now();
  let spawned = 0;

  // * Build a shuffled list of model indices for per-attempt pool assignment.
  const modelOrder = Array.from(
    { length: MODEL_DEFS.length },
    (_, k) => k,
  );
  for (let i = modelOrder.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [modelOrder[i], modelOrder[j]] = [modelOrder[j], modelOrder[i]];
  }

  for (let attempt = 0; attempt < count; attempt += 1) {
    let slot = null;

    // * Target a specific model pool first for variety, then fallback if full.
    const targetModelIdx = modelOrder[attempt % modelOrder.length];
    const baseIdx = targetModelIdx * PER_MODEL_POOL;
    for (let i = baseIdx; i < baseIdx + PER_MODEL_POOL; i += 1) {
      if (!pool[i].active) {
        slot = pool[i];
        break;
      }
    }

    // * Fallback: target pool full — try any other pool.
    if (!slot) {
      for (let m = 0; m < modelOrder.length; m += 1) {
        if (modelOrder[m] === targetModelIdx) continue;
        const fbBase = modelOrder[m] * PER_MODEL_POOL;
        for (let i = fbBase; i < fbBase + PER_MODEL_POOL; i += 1) {
          if (!pool[i].active) {
            slot = pool[i];
            break;
          }
        }
        if (slot) break;
      }
    }

    if (!slot) break; // * All pools exhausted.

    const spawnedIdx = spawned;
    const offset =
      LOCAL_OFFSETS[spawnedIdx % LOCAL_OFFSETS.length];
    _scratchPosition.set(offset.x, offset.y, offset.z);

    // * Rotate local offset by cart orientation, then add to cart world position.
    _scratchPosition.applyQuaternion(cartThreeQuat);
    _scratchPosition.x += cartPos.x;
    _scratchPosition.y += cartPos.y;
    _scratchPosition.z += cartPos.z;

    // * Wake and teleport the rigidbody to the spawn position.
    slot.body.setTranslation(
      { x: _scratchPosition.x, y: _scratchPosition.y, z: _scratchPosition.z },
      true,
    );
    slot.body.setEnabled(true);
    slot.body.wakeUp();

    // * Random outward velocity: inherit cart's direction with scatter.
    const velX = cartLinvel.x * 0.8 + (Math.random() - 0.5) * 4;
    const velY = Math.random() * 3 + 1;
    const velZ = cartLinvel.z * 0.8 + (Math.random() - 0.5) * 4;
    slot.body.setLinvel({ x: velX, y: velY, z: velZ }, true);

    // * Random initial angular velocity for tumbling.
    slot.body.setAngvel(
      {
        x: (Math.random() - 0.5) * 6,
        y: (Math.random() - 0.5) * 6,
        z: (Math.random() - 0.5) * 6,
      },
      true,
    );

    slot.active = true;
    slot.spawnTimeMs = now;
    slot.cartId = cartId;
    slot.fadeStartMs = now + FADE_DELAY_MS;

    spawned += 1;
  }
}

/**
 * * Immediately begins fade-out for all active grocery items belonging to a cart.
 * * Called when the cart respawns so its spilled items don't linger indefinitely.
 *
 * @param {string} cartId Cart whose grocery items should start fading.
 */
export function releaseByCartId(cartId) {
  const now = performance.now();
  for (let i = 0; i < pool.length; i += 1) {
    const slot = pool[i];
    if (slot.active && slot.cartId === cartId) {
      slot.fadeStartMs = now;
    }
  }
}

/**
 * * Advances all active grocery items: copies Rapier transforms into each
 * * slot's InstancedMesh, handles fade-out scaling, and recycles inactive slots.
 *
 * @param {number} _dt Frame delta in seconds (unused — Rapier advances on its own).
 * @param {number} now Current time in milliseconds (performance.now()).
 */
export function update(_dt, now) {
  if (instancedMeshes.length === 0 || !worldRef) return;

  /** @type {Map<THREE.InstancedMesh, boolean>} */
  const dirtyMeshes = new Map();

  for (let i = 0; i < pool.length; i += 1) {
    const slot = pool[i];

    if (!slot.active) continue;

    // * Fade-out: scale ramps from 1 → 0 over FADE_DURATION_MS.
    if (now > slot.fadeStartMs) {
      const fadeProgress =
        (now - slot.fadeStartMs) / FADE_DURATION_MS;
      if (fadeProgress >= 1) {
        // * Fully faded — disable body and recycle slot.
        slot.body.setEnabled(false);
        slot.active = false;
        slot.cartId = null;

        // * Set instance to scale 0 (invisible) at off-screen position.
        _scratchMatrix.compose(
          _scratchPosition.set(0, -999, 0),
          _scratchQuat.identity(),
          _zeroScale,
        );
        slot.meshRef.setMatrixAt(slot.meshIndex, _scratchMatrix);
        dirtyMeshes.set(slot.meshRef, true);
        continue;
      }

      // * Interpolate scale toward zero.
      const s = 1 - fadeProgress;
      _scratchScale.set(s, s, s);

      const translation = slot.body.translation();
      const rotation = slot.body.rotation();
      _scratchPosition.set(translation.x, translation.y, translation.z);
      _scratchQuat.set(rotation.x, rotation.y, rotation.z, rotation.w);

      _scratchMatrix.compose(_scratchPosition, _scratchQuat, _scratchScale);
      slot.meshRef.setMatrixAt(slot.meshIndex, _scratchMatrix);
      dirtyMeshes.set(slot.meshRef, true);
    } else if (slot.body.isEnabled()) {
      // * Active and not fading — copy Rapier transform into instance matrix.
      const translation = slot.body.translation();
      const rotation = slot.body.rotation();
      _scratchPosition.set(translation.x, translation.y, translation.z);
      _scratchQuat.set(rotation.x, rotation.y, rotation.z, rotation.w);

      _scratchMatrix.compose(_scratchPosition, _scratchQuat, _oneScale);
      slot.meshRef.setMatrixAt(slot.meshIndex, _scratchMatrix);
      dirtyMeshes.set(slot.meshRef, true);
    }
  }

  for (const [mesh] of dirtyMeshes) {
    mesh.instanceMatrix.needsUpdate = true;
  }
}

/**
 * * Removes all grocery rigidbodies from the Rapier world and disposes all
 * * InstancedMeshes and their resources from the scene.
 *
 * @param {THREE.Scene} scene Active Three.js scene.
 * @param {import("@dimforge/rapier3d").World} world Active Rapier physics world.
 */
export function dispose(scene, world) {
  for (const im of instancedMeshes) {
    if (scene) scene.remove(im);
    im.geometry?.dispose();
    if (Array.isArray(im.material)) {
      im.material.forEach((m) => m?.dispose?.());
    } else {
      im.material?.dispose?.();
    }
  }
  instancedMeshes = [];

  for (let i = 0; i < pool.length; i += 1) {
    const slot = pool[i];
    if (slot.body && world) {
      world.removeRigidBody(slot.body);
    }
  }

  pool = [];

  for (const geo of loadedGeometries) geo?.dispose();
  for (const mat of loadedMaterials) {
    // Dispose textures to prevent VRAM leaks on level swap
    for (const key in mat) {
      if (mat[key] && mat[key].isTexture) {
        mat[key].dispose();
      }
    }
    mat.dispose();
  }
  loadedGeometries = [];
  loadedMaterials = [];

  sceneRef = null;
  worldRef = null;
}
