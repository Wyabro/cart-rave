/**
 * groceryPool.js — Pre-allocated cosmetic grocery-spill rigidbodies + InstancedMesh pool.
 *
 * Loads 6 GLTF grocery models (milk, cereal, soda, soup, orange, baguette) once per
 * session and creates one InstancedMesh per model type. Each model gets ~11 pre-allocated
 * Rapier dynamic rigidbodies. Level swaps call init() again, which only clears active
 * spills — it does not re-download GLBs. Grocery items spawn when a cart takes a hit
 * (triggerSpill) and fade out after 8.5 s or when the owning cart respawns
 * (releaseByCartId). Collision groups isolate groceries from carts (group 1) so they
 * never push player physics.
 */

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { getSharedDracoLoader } from "../loaders/sharedDracoLoader.js";
import { RAPIER } from "../physics/rapierInstance.js";
import { CONFIG } from "../config.js";
import { spawnTrashBurst } from "../effects.js";
import { playGrocerySpill } from "../sfxSynth.js";
import { GROCERY_DEFINITIONS } from "./groceryDefinitions.js";
import { publicUrl } from "../utils/publicUrl.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** @type {number} Raw Rapier collision groups bitmask — group 2 membership, filter collides with everything except group 1 (carts). */
const GROCERY_COLLISION_GROUPS = (0x0002 << 16) | 0xFFFE;

/** @type {number} Instances per grocery model. */
const PER_MODEL_POOL = 11;

/** @type {number} Total pre-allocated grocery item slots. */
const POOL_SIZE = GROCERY_DEFINITIONS.length * PER_MODEL_POOL;

/** @type {number} Milliseconds before auto-fade begins. */
const FADE_DELAY_MS = 8500;

/** @type {number} Fade duration in milliseconds (scale ramps from 1 → 0). */
const FADE_DURATION_MS = 1500;

/** @type {number} Friction coefficient for grocery colliders. */
const COLLIDER_FRICTION = 0.4;

/** @type {number} Restitution (bounciness) for grocery colliders. */
const COLLIDER_RESTITUTION = 0.15;

/** @type {number} Minimum world-units for the shortest dimension after geometry normalization.
 * * Prevents extreme-aspect-ratio models (baguette) from being paper-thin. */
const MIN_GROCERY_DIM = 0.06;

// * These runtime GLBs are Draco+WebP compressed (npm run compress:groceries);
// * uncompressed masters live in art/models/groceries/.
const MODEL_DEFS = GROCERY_DEFINITIONS;

/**
 * ─── GROCERY SCALE TUNING — the one place to size groceries ─────────────────
 *
 * Two independent presentations share the same normalized geometry:
 *
 * 1. SPILL / loose debris: rendered at scale 1, so `sizeM` IS the world-space
 *    longest dimension in meters. Physics colliders are derived from the scaled
 *    geometry in init(), so collider and visual always match. Changing `sizeM`
 *    requires a reload (geometry + colliders are baked once at pool init).
 * 2. BASKET CARGO: rendered at `cargoScale × cargoMul` on top of the normalized
 *    geometry. Effective cargo longest-dim ≈ sizeM × cargoScale × cargoMul.
 *    Cargo bays are rebuilt per round, so these apply on the next cargo build.
 *
 * Current values (2026-07-14 art pass — ART-1 baguette 4× spill, ART-2 milk +15%):
 *
 *   model     sizeM   spill longest-dim   cargoMul   cargo longest-dim
 *   milk      0.575   0.575 m             1.0        0.30 m
 *   cereal    0.50    0.50 m              1.0        0.26 m
 *   soda      0.50    0.50 m              1.0        0.26 m
 *   soup      0.50    0.50 m              1.0        0.26 m
 *   orange    0.50    0.50 m              1.0        0.26 m
 *   baguette  2.00*   2.00 m              0.26       0.27 m
 *
 * (*) extreme-aspect models are additionally clamped so their SHORTEST dimension
 *     is ≥ MIN_GROCERY_DIM (0.06 m). ART-1 makes the *spill* baguette 4× (0.5→2.0 m)
 *     — a big comedic loaf in the mess — while cargoMul is dropped 1.05→0.26 to KEEP
 *     the *cargo* baguette at its old safe ~0.27 m. This decoupling is deliberate:
 *     cargo longest-dim = sizeM × cargoScale × cargoMul, and a >0.5 m cargo baguette
 *     punches through the basket rear wall even after radius insets.
 *
 * (Basket fill count — how MANY groceries pack the bay — is CONFIG.cargo.baseItems/
 *  maxItems + the GRID in createCargoBay, not here.)
 *
 * DEV: `window.CartClashGrocery.sizes()` logs the actual effective dimensions of
 * every loaded model (spill + cargo) so tuning sessions see real numbers.
 */
const GROCERY_SCALES = {
  /** Global basket-cargo multiplier ("compact pile" factor). 0.52 → 0.60 in the
   * CARGO-VIS-1 session-3 retune — 18 items at 0.52 read as confetti once the bay
   * footprint matched the real (wider) rave cavity. */
  cargoScale: 0.6,
  /** @type {Record<string, { sizeM: number, cargoMul: number }>} */
  perModel: Object.fromEntries(
    MODEL_DEFS.map((definition) => [
      definition.name,
      { sizeM: definition.sizeM, cargoMul: definition.cargoMul },
    ]),
  ),
};

/** @param {string} name */
function groceryScaleFor(name) {
  return GROCERY_SCALES.perModel[name] ?? { sizeM: 0.5, cargoMul: 1.0 };
}

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

/**
 * * Spill calls that arrive before init() resolves are queued here and replayed
 * * once instancedMeshes and pool are fully populated.
 * @type {Array<[string, object, object, object, number, THREE.Object3D | null]>}
 */
let pendingSpills = [];

/**
 * * Cargo bays created before init() resolves (createCargoBay returned an empty
 * * group). buildPool() re-runs the item build for any still-parented bay so a
 * * cold-boot cart doesn't ride an empty basket until the next KO rebuild
 * * (CARGO-RACE-1 — mirrors the pendingSpills replay).
 * @type {Array<{ group: THREE.Group, hw: number | undefined, hl: number | undefined, rimY: number | undefined }>}
 */
let pendingBays = [];

/** @type {THREE.BufferGeometry[]} */
let loadedGeometries = [];

/** @type {THREE.Material[]} */
let loadedMaterials = [];

/** True after the first successful init (GLBs + pool live for the session). */
let ready = false;

/** Coalesces concurrent init() calls (e.g. rapid level swaps during first load). */
/** @type {Promise<void> | null} */
let initInFlight = null;

// ---------------------------------------------------------------------------
// Scratch objects (reused each frame / spawn to avoid GC pressure)
// ---------------------------------------------------------------------------

const _scratchPosition = new THREE.Vector3();
const _scratchQuat = new THREE.Quaternion();
const _scratchScale = new THREE.Vector3();
const _scratchMatrix = new THREE.Matrix4();
const _zeroScale = new THREE.Vector3(0, 0, 0);
const _oneScale = new THREE.Vector3(1, 1, 1);

/** * Reused across update() calls so idle frames don't allocate a Map. */
/** @type {Map<THREE.InstancedMesh, boolean>} */
const _dirtyMeshes = new Map();

// ---------------------------------------------------------------------------
// GLTF loader (lazy singleton; Draco decoder shared with cartRaveGltf.js)
// ---------------------------------------------------------------------------

/** @type {GLTFLoader | null} */
let _loader = null;

/** @returns {GLTFLoader} */
function getLoader() {
  if (!_loader) {
    _loader = new GLTFLoader();
    _loader.setDRACOLoader(getSharedDracoLoader());
  }
  return _loader;
}

/**
 * Frees source GLTF GPU buffers after geometries/materials are cloned into the pool.
 *
 * Important: `Material.clone()` shares texture references. Do **not** dispose
 * `map` / `normalMap` on the source — those textures still back the pool's
 * InstancedMesh + cargo materials. Geometry was deep-cloned, so source geometry
 * is safe to free. Material.dispose() only drops the material object (no textures).
 * @param {THREE.Object3D} root
 */
function disposeLoadedGltfScene(root) {
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.geometry?.dispose();
    const mats = Array.isArray(child.material) ? child.material : [child.material];
    for (const mat of mats) {
      if (!mat) continue;
      mat.dispose?.();
    }
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parks every active grocery (disabled body, invisible instance). Does not free
 * GLBs, InstancedMeshes, or Rapier allocations — use on level swap.
 */
function clearActiveSlots() {
  pendingSpills.length = 0;
  if (pool.length === 0) return;

  for (let i = 0; i < pool.length; i += 1) {
    const slot = pool[i];
    slot.active = false;
    slot.cartId = null;
    slot.spawnTimeMs = 0;
    slot.fadeStartMs = Number.POSITIVE_INFINITY;
    if (slot.body) {
      try {
        slot.body.setEnabled(false);
        slot.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
        slot.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
        slot.body.setTranslation({ x: 0, y: -999, z: 0 }, true);
      } catch {
        // Body may already be removed if world was torn down.
      }
    }
    if (slot.meshRef) {
      _scratchMatrix.compose(
        _scratchPosition.set(0, -999, 0),
        _scratchQuat.identity(),
        _zeroScale,
      );
      slot.meshRef.setMatrixAt(slot.meshIndex, _scratchMatrix);
    }
  }
  for (const im of instancedMeshes) {
    im.instanceMatrix.needsUpdate = true;
  }
}

/**
 * @param {THREE.Scene} scene
 */
function ensureMeshesInScene(scene) {
  for (const im of instancedMeshes) {
    if (im.parent !== scene) {
      if (im.parent) im.parent.remove(im);
      scene.add(im);
    }
  }
}

/**
 * First-time (or post-dispose) build: load GLTFs once and allocate the pool.
 * @param {THREE.Scene} scene
 * @param {import("@dimforge/rapier3d").World} world
 */
async function buildPool(scene, world) {
  const loader = getLoader();

  // * Load all 6 GLTF models in parallel (session once — not per level swap).
  /** @type {THREE.Object3D[]} */
  const gltfs = await Promise.all(
    MODEL_DEFS.map((def) =>
      loader.loadAsync(publicUrl(def.path)).then((gltf) => gltf.scene),
    ),
  );

  const interactionGroups = GROCERY_COLLISION_GROUPS;

  instancedMeshes = [];
  pool = [];
  loadedGeometries = [];
  loadedMaterials = [];

  for (let modelIdx = 0; modelIdx < MODEL_DEFS.length; modelIdx += 1) {
    const def = MODEL_DEFS[modelIdx];
    const gltfScene = gltfs[modelIdx];

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
    const material = /** @type {THREE.Material} */ (sourceMesh.material).clone();

    // * Readability: give groceries a gentle self-lit glow so they read against the dark neon
    // * arenas — both in-basket and once spilled — without brightening the scene. Emissive
    // * follows the albedo (texture map if present, else base color) and stays well under the
    // * bloom threshold. Applied before the cargoMat clone so both the InstancedMesh (spilled)
    // * and the cargo-bay meshes inherit it.
    if (/** @type {any} */ (material).isMeshStandardMaterial) {
      const std = /** @type {THREE.MeshStandardMaterial} */ (material);
      if (std.map) {
        std.emissiveMap = std.map;
        std.emissive = new THREE.Color(0xffffff);
      } else {
        std.emissive = std.color.clone();
      }
      std.emissiveIntensity = 0.28;
      std.needsUpdate = true;
    }

    // * Normalize geometry: text-to-3D models may have arbitrary scale and off-center pivots.
    // * Target longest dimension comes from GROCERY_SCALES (per-model spill size).
    geometry.computeBoundingBox();
    const bb = geometry.boundingBox;
    if (bb) {
      const size = new THREE.Vector3();
      bb.getSize(size);
      const longestDim = Math.max(size.x, size.y, size.z);
      const shortestDim = Math.min(size.x, size.y, size.z);
      let scaleFactor = groceryScaleFor(def.name).sizeM / longestDim;
      if (shortestDim * scaleFactor < MIN_GROCERY_DIM) {
        scaleFactor = MIN_GROCERY_DIM / shortestDim;
      }
      if (Number.isFinite(scaleFactor) && scaleFactor !== 1) {
        geometry.scale(scaleFactor, scaleFactor, scaleFactor);
      }
      geometry.computeBoundingBox();
      const center = new THREE.Vector3();
      geometry.boundingBox.getCenter(center);
      geometry.translate(-center.x, -center.y, -center.z);
      geometry.computeBoundingBox();
    }

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

    material.userData = { ...material.userData, isSharedMaterial: true };
    const cargoMat = material.clone();
    cargoMat.userData = { ...cargoMat.userData, isSharedMaterial: true };
    loadedGeometries.push(geometry);
    loadedMaterials.push(cargoMat);

    const im = new THREE.InstancedMesh(geometry, material, PER_MODEL_POOL);
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    im.frustumCulled = false;
    scene.add(im);
    instancedMeshes.push(im);

    for (let i = 0; i < PER_MODEL_POOL; i += 1) {
      const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(0, -999, 0)
        .setCanSleep(true);
      const body = world.createRigidBody(bodyDesc);

      world.createCollider(colliderDesc, body);
      body.setEnabled(false);

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
    disposeLoadedGltfScene(gltfScene);
  }

  ready = true;

  // * CARGO-RACE-1: heal bays that were built empty while the GLBs were still loading —
  // * before the spill replay so a queued spill's hideCargoBay lands on a populated bay.
  if (pendingBays.length > 0) {
    const queuedBays = pendingBays.slice();
    pendingBays.length = 0;
    for (const { group, hw, hl, rimY } of queuedBays) {
      // * Parentless = discarded (removeCargoBaysFromMesh) before models arrived.
      if (!group.parent) continue;
      if (group.userData.cargoItems?.length) continue;
      populateCargoBay(group, hw, hl, rimY);
    }
  }

  if (pendingSpills.length > 0) {
    const queued = pendingSpills.slice();
    pendingSpills.length = 0;
    for (const args of queued) {
      triggerSpill(...args);
    }
  }
}

/**
 * Ensures the grocery pool is ready for the live scene/world.
 *
 * - **First call:** loads 6 GLTFs and allocates InstancedMeshes + 66 bodies.
 * - **Later level swaps (same Rapier world):** clears active spills only — no re-fetch.
 *
 * Call after each arena load; safe to await every time.
 *
 * @param {THREE.Scene} scene Active Three.js scene.
 * @param {import("@dimforge/rapier3d").World} world Active Rapier physics world.
 * @returns {Promise<void>}
 */
export async function init(scene, world) {
  // * Coalesce concurrent first-load inits (menu preview spam while GLBs load).
  if (initInFlight) {
    await initInFlight;
    sceneRef = scene;
    if (ready && worldRef === world) {
      ensureMeshesInScene(scene);
      clearActiveSlots();
    } else if (ready && worldRef !== world) {
      // * Rare: physics world replaced — full rebuild for the new world.
      dispose(sceneRef ?? scene, worldRef);
      sceneRef = scene;
      worldRef = world;
      initInFlight = buildPool(scene, world);
      try {
        await initInFlight;
      } finally {
        initInFlight = null;
      }
    }
    return;
  }

  if (ready && worldRef === world && pool.length > 0) {
    sceneRef = scene;
    ensureMeshesInScene(scene);
    clearActiveSlots();
    return;
  }

  if (ready && worldRef !== world) {
    dispose(sceneRef ?? scene, worldRef);
  }

  sceneRef = scene;
  worldRef = world;
  initInFlight = buildPool(scene, world);
  try {
    await initInFlight;
  } finally {
    initInFlight = null;
  }
}

/**
 * * Hides every cargo bay under a cart mesh (or a single bay group). Spill paths must
 * * clear ALL bays — rebuild can leave a stale sibling, and a single `cart.cargoBay`
 * * ref may point at the wrong one.
 *
 * @param {THREE.Object3D | { mesh?: THREE.Object3D, cargoBay?: THREE.Object3D } | null | undefined} cartOrBay
 */
export function hideCargoBay(cartOrBay) {
  if (!cartOrBay) return;
  if (/** @type {any} */ (cartOrBay).isObject3D) {
    const obj = /** @type {THREE.Object3D} */ (cartOrBay);
    if (obj.name === "cargoBay") {
      obj.visible = false;
      return;
    }
    obj.traverse((child) => {
      if (child.name === "cargoBay") child.visible = false;
    });
    return;
  }
  const cart = /** @type {{ mesh?: THREE.Object3D, cargoBay?: THREE.Object3D }} */ (cartOrBay);
  if (cart.cargoBay) cart.cargoBay.visible = false;
  if (cart.mesh) {
    cart.mesh.traverse((child) => {
      if (child.name === "cargoBay") child.visible = false;
    });
  }
}

/**
 * * Removes every existing cargoBay child from a cart mesh (shatter rebuild hygiene).
 * @param {THREE.Object3D | null | undefined} mesh
 */
export function removeCargoBaysFromMesh(mesh) {
  if (!mesh) return;
  /** @type {THREE.Object3D[]} */
  const doomed = [];
  mesh.traverse((child) => {
    if (child !== mesh && child.name === "cargoBay") doomed.push(child);
  });
  for (const bay of doomed) {
    bay.parent?.remove(bay);
    // * Geometries/materials are shared pool assets — only dispose the group tree structure.
    bay.traverse((c) => {
      if (/** @type {any} */ (c).isMesh) {
        // * Leave shared geo/mat alone.
      }
    });
  }
}

/**
 * * Creates a pre-spill visual cargo bay: a THREE.Group with 6 randomly selected
 * * grocery meshes packed into the basket cavity (not the outer body hull).
 *
 * @param {number} [hw] Basket half-width in mesh-local space (defaults to 0.2 for compat).
 * @param {number} [hl] Basket half-length in mesh-local space (defaults to 0.2 for compat).
 * @param {number} [rimY] Basket rim height in BAY-LOCAL space (bay origin = basket floor).
 *   When provided, the top overflow layer solves against it so a full bay crests the rim
 *   (CARGO-VIS-1). Omitted → legacy item-size stacking only.
 * @returns {THREE.Group} The cargo bay group. Built empty if models haven't loaded yet —
 *   the bay is then queued and self-heals in place when init() resolves (CARGO-RACE-1).
 */
export function createCargoBay(hw, hl, rimY) {
  const group = new THREE.Group();
  group.name = "cargoBay";
  if (loadedGeometries.length === 0) {
    // * GLBs still loading (init is fire-and-forget at level swap) — register the empty
    // * bay; buildPool() populates it in place once models land (CARGO-RACE-1).
    pendingBays.push({ group, hw, hl, rimY });
    return group;
  }
  populateCargoBay(group, hw, hl, rimY);
  return group;
}

/**
 * * Item build for a cargo bay group — split from {@link createCargoBay} so the
 * * CARGO-RACE-1 self-heal in buildPool() can re-run it on bays created empty.
 * @param {THREE.Group} group
 * @param {number} [hw]
 * @param {number} [hl]
 * @param {number} [rimY]
 */
function populateCargoBay(group, hw, hl, rimY) {
  // * Shuffle indices so we get a good random mix of the 6 model types, then cycle
  // * across the fixed GRID (more slots than models → each type repeats a couple times).
  const indices = Array.from(
    { length: loadedGeometries.length },
    (_, k) => k,
  );
  for (let i = indices.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }

  // * Compact pile — large enough to read, small enough to stay inside the wire cavity.
  const cargoScale = GROCERY_SCALES.cargoScale;
  const wallPad = 0.03;
  const halfW = hw != null ? Math.max(0.1, hw - wallPad) : 0.22;
  const halfL = hl != null ? Math.max(0.1, hl - wallPad) : 0.22;

  // * Fixed grid keeps items off the rear wall better than pure random scatter.
  // * Fractions are of the *usable* half-extent after item size — ±1.0 = flush to the
  // * wall, and the floor/mid layers deliberately reach it so a stocked basket fills the
  // * WHOLE bay footprint. Ordered by fill priority — Living Cargo reveals items
  // * front-to-back as the slot's score climbs, so layer-0 floor items come first and
  // * the overflowing top layer comes last.
  // * D-CARGO-VIS-1 (07-30): the old "keep the pile under the rim" invariant is REVERSED —
  // * a boss/full bay is SUPPOSED to crest the rim (layer 2 solves against rimY below).
  // * Session-3 pass 3 (Wyatt 07-30 4-phase pacing): 30 slots (15 floor · 10 mid ·
  // * 5 crest) — the last fillPhases step reveals every slot, so a boss bay reads
  // * PACKED across the widened real cavity. CONFIG.cargo.maxItems (= fillPhases[3])
  // * mirrors GRID.length — keep them synced.
  const GRID = [
    // layer 0 — floor (corners, edge midpoints, mid-edge band, centre: the full footprint)
    { u: -1.0, v: -0.9, layer: 0 },
    { u: 1.0, v: -0.9, layer: 0 },
    { u: -1.0, v: 0.85, layer: 0 },
    { u: 1.0, v: 0.85, layer: 0 },
    { u: -1.0, v: 0.0, layer: 0 },
    { u: 1.0, v: 0.0, layer: 0 },
    { u: 0.0, v: -1.0, layer: 0 },
    { u: 0.0, v: 1.0, layer: 0 },
    { u: 0.0, v: 0.0, layer: 0 },
    { u: -0.55, v: -0.95, layer: 0 },
    { u: 0.55, v: -0.95, layer: 0 },
    { u: -0.55, v: 0.95, layer: 0 },
    { u: 0.55, v: 0.95, layer: 0 },
    { u: -1.0, v: -0.45, layer: 0 },
    { u: 1.0, v: 0.45, layer: 0 },
    // layer 1 — mid (still spread wide so the heap reads full, not tent-poled)
    { u: -0.85, v: -0.6, layer: 1 },
    { u: 0.85, v: -0.6, layer: 1 },
    { u: -0.85, v: 0.6, layer: 1 },
    { u: 0.85, v: 0.6, layer: 1 },
    { u: 0.0, v: -0.55, layer: 1 },
    { u: 0.0, v: 0.55, layer: 1 },
    { u: -0.45, v: 0.0, layer: 1 },
    { u: 0.45, v: 0.0, layer: 1 },
    { u: -0.45, v: -0.85, layer: 1 },
    { u: 0.45, v: 0.85, layer: 1 },
    // layer 2 — overflow crest (central so the spill-over reads from every camera angle)
    { u: -0.35, v: -0.3, layer: 2 },
    { u: 0.4, v: 0.3, layer: 2 },
    { u: 0.0, v: 0.0, layer: 2 },
    { u: 0.2, v: -0.35, layer: 2 },
    { u: -0.2, v: 0.3, layer: 2 },
  ];

  /** @type {THREE.Mesh[]} Fill-order list consumed by {@link setCargoFill}. */
  const cargoItems = [];
  /** Per-item layer + horizontal half-extent for the separation pass below. */
  const itemLayers = [];
  const itemHoriz = [];

  for (let i = 0; i < GRID.length; i += 1) {
    const idx = indices[i % indices.length];
    const def = MODEL_DEFS[idx];
    const scaleMul = groceryScaleFor(def.name).cargoMul;
    const geo = loadedGeometries[idx];
    if (!geo.boundingBox) geo.computeBoundingBox();
    if (!geo.boundingSphere) geo.computeBoundingSphere();
    const s = cargoScale * scaleMul;
    const bb = geo.boundingBox;
    // * Axis-aligned footprint after mild yaw-only tumble (full random spin made long
    // * items clip the basket walls regardless of sphere insets).
    const halfX = Math.max(Math.abs(bb.min.x), Math.abs(bb.max.x)) * s;
    const halfY = Math.max(Math.abs(bb.min.y), Math.abs(bb.max.y)) * s;
    const halfZ = Math.max(Math.abs(bb.min.z), Math.abs(bb.max.z)) * s;
    const horiz = Math.max(halfX, halfZ);

    const mesh = new THREE.Mesh(geo, loadedMaterials[idx]);
    mesh.scale.setScalar(s);
    // * Yaw free, pitch/roll tiny — reads as "tossed in" without wall-clipping diagonals.
    mesh.rotation.set(
      (Math.random() - 0.5) * 0.4,
      Math.random() * Math.PI * 2,
      (Math.random() - 0.5) * 0.3,
    );

    const slot = GRID[i];
    const reachX = Math.max(0.015, halfW - horiz);
    const reachZ = Math.max(0.015, halfL - horiz);
    // * Layers 0/1 stack physically off item height. Layer 2 is the CARGO-VIS-1 overflow
    // * crest: pull it up toward the rim (item centre at rimY + 0.6·halfY → most of the
    // * item pokes above the rim), but never more than ~2.2·halfY above its natural
    // * stack so deep baskets (procedural cart, rim ≫ pile) don't get floating groceries.
    // * (1.4 → 2.2 in session 3: 1.4 capped the crest below the real rave rim.)
    const stackLift = slot.layer * (halfY * 1.7 + 0.02);
    const layerLift =
      slot.layer === 2 && Number.isFinite(rimY)
        ? Math.max(stackLift, Math.min(rimY - halfY * 0.35, stackLift + halfY * 2.2))
        : stackLift;
    mesh.position.set(
      slot.u * reachX + (Math.random() - 0.5) * 0.03,
      halfY * 0.95 + layerLift + Math.random() * 0.015,
      slot.v * reachZ + (Math.random() - 0.5) * 0.03,
    );
    group.add(mesh);
    cargoItems.push(mesh);
    itemLayers.push(slot.layer);
    itemHoriz.push(horiz);
  }

  // * Same-layer separation: large items shrink the usable reach, which collapses
  // * grid slots toward center and interpenetrates neighbors. A few relaxation
  // * passes push overlapping same-layer pairs apart along XZ, clamped to the
  // * walls. 0.72 leaves a light lean so the pile still reads as packed-in.
  const clampToWalls = (value, horiz, half) => {
    const limit = Math.max(0, half - horiz);
    return Math.min(limit, Math.max(-limit, value));
  };
  for (let pass = 0; pass < 3; pass += 1) {
    for (let a = 0; a < cargoItems.length; a += 1) {
      for (let b = a + 1; b < cargoItems.length; b += 1) {
        if (itemLayers[a] !== itemLayers[b]) continue;
        const pa = cargoItems[a].position;
        const pb = cargoItems[b].position;
        const dx = pb.x - pa.x;
        const dz = pb.z - pa.z;
        const dist = Math.hypot(dx, dz);
        const minDist = (itemHoriz[a] + itemHoriz[b]) * 0.72;
        if (dist >= minDist) continue;
        const push = (minDist - dist) / 2;
        const nx = dist > 1e-4 ? dx / dist : 1;
        const nz = dist > 1e-4 ? dz / dist : 0;
        pa.x = clampToWalls(pa.x - nx * push, itemHoriz[a], halfW);
        pa.z = clampToWalls(pa.z - nz * push, itemHoriz[a], halfL);
        pb.x = clampToWalls(pb.x + nx * push, itemHoriz[b], halfW);
        pb.z = clampToWalls(pb.z + nz * push, itemHoriz[b], halfL);
      }
    }
  }

  // * Living Cargo: expose the fill-order list and start at empty-cart fullness —
  // * cargoLoad.js drives per-frame fullness from the synced round scores.
  group.userData.cargoItems = cargoItems;
  setCargoFill(group, 0);
}

/**
 * * Living Cargo — shows the first N groceries of a bay's fill-order list.
 * * Cheap enough to call per frame (visibility writes are skipped when unchanged).
 *
 * @param {THREE.Group | null | undefined} cargoBay Bay group built by {@link createCargoBay}.
 * @param {number} count Exact visible grocery count (clamped to the bay's item list).
 */
export function setCargoFillCount(cargoBay, count) {
  const items = cargoBay?.userData?.cargoItems;
  if (!items || items.length === 0) return;

  const visibleCount = Math.max(0, Math.min(items.length, Math.round(count)));

  if (cargoBay.userData.cargoFillCount === visibleCount) return;
  cargoBay.userData.cargoFillCount = visibleCount;

  for (let i = 0; i < items.length; i += 1) {
    items[i].visible = i < visibleCount;
  }
}

/**
 * * Legacy fullness mapper — N maps fullness 0→1 onto CONFIG.cargo.baseItems→maxItems.
 * * Prefer {@link setCargoFillCount} + life-cargo visual counts (CARGO-WT-1).
 *
 * @param {THREE.Group | null | undefined} cargoBay Bay group built by {@link createCargoBay}.
 * @param {number} fullness01 Cargo fullness in [0, 1].
 */
export function setCargoFill(cargoBay, fullness01) {
  const cargoCfg = CONFIG.cargo;
  const itemsLen = cargoBay?.userData?.cargoItems?.length ?? 0;
  const base = THREE.MathUtils.clamp(cargoCfg?.baseItems ?? 2, 0, itemsLen || 18);
  const max = THREE.MathUtils.clamp(cargoCfg?.maxItems ?? (itemsLen || 18), base, itemsLen || 18);
  const f = THREE.MathUtils.clamp(fullness01, 0, 1);
  setCargoFillCount(cargoBay, Math.round(THREE.MathUtils.lerp(base, max, f)));
}

/**
 * * Spawns up to `count` grocery items at the cart's position with velocity
 * * derived from the cart's linear velocity plus random scatter. Models are
 * * randomly selected; if a model's pool is full, another is picked.
 *
 * @param {string} cartId Unique identifier of the owning cart.
 * @param {{ x: number, y: number, z: number }} cartPosParam World-space cart position.
 * @param {{ x: number, y: number, z: number, w: number }} cartQuatParam Rapier quaternion.
 * @param {{ x: number, y: number, z: number }} cartLinvelParam Cart's current linear velocity.
 * @param {number} [count=6] Number of grocery items to spawn (clamped to available slots).
 * @param {THREE.Object3D} [cargoBay=null] Optional cargo bay group to hide on spill.
 */
export function triggerSpill(cartId, cartPosParam, cartQuatParam, cartLinvelParam, count = 6, cargoBay = null) {
  if (instancedMeshes.length === 0 || !worldRef) {
    // * Queue the call — init() hasn't finished loading GLTF models yet.
    // * The args are replayed verbatim once init() resolves.
    pendingSpills.push([cartId, cartPosParam, cartQuatParam, cartLinvelParam, count, cargoBay]);
    return;
  }

  const cartPos = (cartPosParam && typeof cartPosParam === "object") ? cartPosParam : { x: 0, y: 0, z: 0 };
  const cartQuat = (cartQuatParam && typeof cartQuatParam === "object") ? cartQuatParam : { x: 0, y: 0, z: 0, w: 1 };
  const cartLinvel = (cartLinvelParam && typeof cartLinvelParam === "object") ? cartLinvelParam : { x: 0, y: 0, z: 0 };

  // * Despawn in-basket groceries the moment physics groceries fly (all bays under parent).
  if (cargoBay) {
    hideCargoBay(cargoBay);
    if (cargoBay.parent) hideCargoBay(cargoBay.parent);
  }

  const cartThreeQuat = _scratchQuat.set(
    typeof cartQuat.x === "number" ? cartQuat.x : 0,
    typeof cartQuat.y === "number" ? cartQuat.y : 0,
    typeof cartQuat.z === "number" ? cartQuat.z : 0,
    typeof cartQuat.w === "number" ? cartQuat.w : 1,
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

    if (!slot) {
      // eslint-disable-next-line no-console
      console.warn(`[groceryPool] All ${POOL_SIZE} pre-allocated grocery slots exhausted; spawning fewer items.`);
      break;
    }

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

  // * Signature spill juice: one supermarket-themed debris burst + procedural clatter per
  // * spill. Fired here — the sole choke point for host, P2P `MSG.spill` replay, and the
  // * pending-init replay — so every peer gets identical feedback with no divergence risk.
  if (spawned > 0) {
    const linSpeed = Math.hypot(cartLinvel.x, cartLinvel.y, cartLinvel.z);
    const spillIntensity = Math.min(0.35 + spawned / 10 + linSpeed / 30, 1.2);
    spawnTrashBurst({ x: cartPos.x, y: cartPos.y, z: cartPos.z }, spillIntensity, "grocery");
    playGrocerySpill(spawned, spillIntensity);
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

  const dirtyMeshes = _dirtyMeshes;
  dirtyMeshes.clear();

  for (let i = 0; i < pool.length; i += 1) {
    const slot = pool[i];

    if (!slot.active) continue;

    // * Fade-out: scale ramps from 1 → 0 over FADE_DURATION_MS.
    if (now > slot.fadeStartMs) {
      if (slot.body.isEnabled()) {
        slot.body.setEnabled(false);
      }
      const fadeProgress =
        (now - slot.fadeStartMs) / FADE_DURATION_MS;
      if (fadeProgress >= 1) {
        // * Fully faded — recycle slot.
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
 * Full teardown (bodies, meshes, GPU resources). Module-private on purpose:
 * the public lifecycle is level-swap re-entry via {@link init}, which clears
 * active slots and keeps decoded GLBs warm; only the rare physics-world
 * replacement inside init() needs the full rebuild.
 *
 * @param {THREE.Scene | null | undefined} scene Active Three.js scene.
 * @param {import("@dimforge/rapier3d").World | null | undefined} world Active Rapier physics world.
 */
function dispose(scene, world) {
  pendingSpills.length = 0;
  pendingBays.length = 0;

  for (const im of instancedMeshes) {
    if (scene) scene.remove(im);
    // * Geometry is shared with cargo bays (loadedGeometries) — dispose once below.
    // * Spill materials share texture maps with cargo materials; free maps once there.
    if (Array.isArray(im.material)) {
      im.material.forEach((m) => m?.dispose?.());
    } else {
      im.material?.dispose?.();
    }
  }
  instancedMeshes = [];

  const bodyWorld = world ?? worldRef;
  for (let i = 0; i < pool.length; i += 1) {
    const slot = pool[i];
    if (slot.body && bodyWorld) {
      try {
        bodyWorld.removeRigidBody(slot.body);
      } catch {
        // World may already be gone.
      }
    }
  }

  pool = [];

  for (const geo of loadedGeometries) geo?.dispose();
  for (const mat of loadedMaterials) {
    for (const key in mat) {
      if (mat[key] && mat[key].isTexture) {
        mat[key].dispose();
      }
    }
    mat.dispose();
  }
  loadedGeometries = [];
  loadedMaterials = [];

  ready = false;
  initInFlight = null;
  sceneRef = null;
  worldRef = null;
}

// ─── DEV tuning aid ──────────────────────────────────────────────────────────
// * `window.CartClashGrocery.sizes()` prints the ACTUAL effective dimensions of
// * every loaded grocery (spill world size and basket-cargo size) so scale-tuning
// * sessions work from real numbers, not the config's intent. `scales` exposes
// * the live GROCERY_SCALES table for reference (edits require a reload — spill
// * geometry + colliders bake at pool init).
if (import.meta.env.DEV && typeof window !== "undefined") {
  /** @type {any} */ (window).CartClashGrocery = {
    scales: GROCERY_SCALES,
    sizes() {
      if (loadedGeometries.length === 0) {
        console.log("[CartClashGrocery] Pool not initialized yet — start a round first.");
        return;
      }
      const rows = MODEL_DEFS.map((def, i) => {
        const geo = loadedGeometries[i];
        if (!geo) return { model: def.name, loaded: false };
        if (!geo.boundingBox) geo.computeBoundingBox();
        const s = new THREE.Vector3();
        geo.boundingBox?.getSize(s);
        const tune = groceryScaleFor(def.name);
        const cargoMul = GROCERY_SCALES.cargoScale * tune.cargoMul;
        const f = (n) => Number(n.toFixed(3));
        return {
          model: def.name,
          "spill size (m)": `${f(s.x)} × ${f(s.y)} × ${f(s.z)}`,
          "cargo size (m)": `${f(s.x * cargoMul)} × ${f(s.y * cargoMul)} × ${f(s.z * cargoMul)}`,
          sizeM: tune.sizeM,
          cargoMul: tune.cargoMul,
        };
      });
      console.table(rows);
    },
  };
}
