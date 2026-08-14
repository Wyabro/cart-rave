import * as THREE from "three";
import { RAPIER } from "./physics/rapierInstance.js";
import { buildCart } from "./carts/cart.js";
import { normalizeThemeId } from "./carts/cartThemeConfig.js";
import {
  createRaveGltfCartInstance,
  disposeRaveGltfInstance,
  isRaveGltfSourceReady,
  prepareRaveGltfCart,
  setEmissiveTrimMul,
} from "./carts/cartRaveGltf.js";
import { CONFIG, computeSpawnAngleForSlot } from "./config.js";
import { resolveCartThemeForSlot, resolveCartSunglassesStyleForSlot } from "./carts/customization.js";
import {
  applyCartTheme,
  buildCartThemeMaterialCache,
  disposeCartThemeResources,
} from "./carts/cartThemes.js";
import * as ContactShadows from "./contactShadows.js";
import * as Visuals from "./effects/visuals.js";
import * as GameState from "./stores/gameStore.js";
import * as Netcode from "./netcode.js";
import {
  applyCartFrictionMode,
  applyCartMassPropertiesOverride,
  clearActiveCartContactsForCart,
} from "./simulation.js";
import {
  baselineLifeCargoPoints,
  clearCargoOverflowForSlot,
} from "./cargoLoad.js";
import { cleanupShatter } from "./cartShatter.js";
import { applyCartPattern } from "./carts/cartPatterns.js";
import * as GroceryPool from "./effects/groceryPool.js";
import { stopSfx, stopAllSfx } from "./audioManager.js";

// Module-level references
let allCartsRef = null;
const colliderHandleToCart = new Map();

let sceneRef = null;
let worldRef = null;
let ramBoostStreaksRef = null;

function yawToCenter(spawn) {
  // Our yaw convention yields forward = (-sin(yaw), 0, -cos(yaw)).
  // Facing the center means forward should point from spawn -> (0,0).
  return Math.atan2(spawn.x, spawn.z);
}

function quatFromYaw(yaw) {
  const half = yaw / 2;
  return { x: 0, y: Math.sin(half), z: 0, w: Math.cos(half) };
}

/**
 * * Copies a cart body's current pose into its reusable prevPosition / prevRotation fields.
 * @param {object | null | undefined} cart
 * @returns {void}
 */
function copyBodyPoseToCartPrev(cart) {
  if (!cart?.body || !cart.prevPosition || !cart.prevRotation) return;
  const p = cart.body.translation();
  const r = cart.body.rotation();
  cart.prevPosition.x = p.x;
  cart.prevPosition.y = p.y;
  cart.prevPosition.z = p.z;
  cart.prevRotation.x = r.x;
  cart.prevRotation.y = r.y;
  cart.prevRotation.z = r.z;
  cart.prevRotation.w = r.w;
}

/**
 * * Snapshots every cart body pose before a fixed physics substep (visual interpolation).
 * @param {Array<object | null | undefined> | null | undefined} allCarts
 * @returns {void}
 */
export function captureCartsPhysicsPrevPoses(allCarts) {
  for (const cart of allCarts || []) {
    copyBodyPoseToCartPrev(cart);
  }
}

function buildCartMaterialCache(cartMesh) {
  return buildCartThemeMaterialCache(cartMesh);
}

/**
 * @param {import("@dimforge/rapier3d").World} world
 * @param {{ x: number, y: number, z: number }} spawn
 * @param {number} spawnYaw
 * @returns {import("@dimforge/rapier3d").RigidBody | null}
 */
function createCartBody(world, spawn, spawnYaw) {
  if (!world || !spawn) return null;

  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setCcdEnabled(true)
      // * PIT-PT-1: carts sank up to 1.185m into the Cart Rave pit staves (measured,
      // * cap-234) — most of a 1.5m wall. It is not a tunnelling problem: CCD is on
      // * above, and penetration showed NO correlation with impact speed (-0.09 vs
      // * vertical, 0.05 vs radial), which is what under-solved contacts look like
      // * rather than fast ones. Rapier ran on stock defaults everywhere.
      // * Per-BODY rather than world-wide (integrationParameters.numSolverIterations)
      // * so the extra solver work lands on four carts, not every collider in the
      // * arena — the low-end perf floor is already a live complaint (PERF-PASS-1).
      .setAdditionalSolverIterations(CONFIG.cart.rigidBody.additionalSolverIterations ?? 4)
      .setTranslation(spawn.x, spawn.y, spawn.z)
      .setLinearDamping(CONFIG.cart.linearDamping)
      .setAngularDamping(CONFIG.cart.angularDamping),
  );
  body.setRotation(quatFromYaw(spawnYaw), true);

  const { canSleep } = CONFIG.cart.rigidBody;
  if (typeof body.setCanSleep === "function") {
    body.setCanSleep(canSleep);
  }
  // * V1 tipping: leave Rapier rotation axes unlocked (setEnabledRotations not applied).
  // * Hole overhang detection in simulation.js uses oriented footprint projection.

  return body;
}

/**
 * @param {import("@dimforge/rapier3d").World} world
 * @param {import("@dimforge/rapier3d").RigidBody} body
 * @returns {{
 *   collider: import("@dimforge/rapier3d").Collider,
 *   hx: number,
 *   hyPhys: number,
 *   hz: number,
 *   colliderLocalY: number,
 * } | null}
 */
/** * Cart collision groups — group 1 membership, filter collides with everything except group 2 (groceries). */
const CART_COLLISION_GROUPS = (0x0001 << 16) | 0xFFFD;

function createCartCollider(world, body) {
  if (!world || !body) return null;

  const hx = CONFIG.cart.size.x / 2;
  const hy = CONFIG.cart.size.y / 2;
  const hz = CONFIG.cart.size.z / 2;
  const { hyReduction, localYOffset } = CONFIG.cart.collider;
  const hyPhys = hy - hyReduction;
  const colliderLocalY = localYOffset;

  const colliderDesc = RAPIER.ColliderDesc.roundCuboid(hx, hyPhys, hz, 0.08)
    .setTranslation(0, colliderLocalY, 0)
    .setFriction(CONFIG.cart.friction)
    .setRestitution(CONFIG.cart.restitution)
    .setCollisionGroups(CART_COLLISION_GROUPS);
  if (typeof colliderDesc.setActiveEvents === "function") {
    colliderDesc.setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
  }

  const collider = world.createCollider(colliderDesc, body);
  return { collider, hx, hyPhys, hz, colliderLocalY };
}

/**
 * Builds the cart visual mesh (rave GLTF or procedural fallback) and its material cache.
 * Does NOT add the mesh to the scene — caller is responsible for scene/root parenting.
 *
 * @param {number} color
 * @param {string} themeId
 * @param {string} [sunglassesStyle] - sunglasses style id for the rave GLTF face assembly (defaults to silver mirror when omitted)
 * @returns {{ mesh: THREE.Object3D, materialCache: ReturnType<typeof buildCartThemeMaterialCache> }}
 */
function buildCartVisualMesh(color, themeId, sunglassesStyle) {
  const id = normalizeThemeId(themeId);
  let mesh;
  let materialCache;

  if (id === "rave" && isRaveGltfSourceReady()) {
    mesh = createRaveGltfCartInstance(sunglassesStyle);
    materialCache = prepareRaveGltfCart(mesh, color);
  } else {
    if (id === "rave") {
      console.warn(
        "[entities] Rave GLTF not ready — using procedural cart fallback. " +
          "Call prefetchRaveGltf() before spawning carts.",
      );
    }
    mesh = buildCart(color);
    applyCartTheme(mesh, themeId, color);
    materialCache = buildCartMaterialCache(mesh);
  }

  // * Store the true base scale so boost pulses never ratchet from interrupted animations.
  mesh.userData.baseScale = mesh.scale.x;

  return { mesh, materialCache };
}

/**
 * @param {THREE.Scene} scene
 * @param {number} color
 * @param {string} themeId
 * @param {string} [sunglassesStyle] - sunglasses style id for the rave GLTF face assembly (defaults to silver mirror when omitted)
 * @returns {{ mesh: THREE.Object3D, materialCache: ReturnType<typeof buildCartThemeMaterialCache>, contactShadow: object | null, themeId: string }}
 */
function setupCartVisuals(scene, color, themeId, sunglassesStyle) {
  const { mesh, materialCache } = buildCartVisualMesh(color, themeId, sunglassesStyle);

  scene.add(mesh);
  const contactShadow = ContactShadows.createCartContactShadow();
  if (contactShadow) scene.add(contactShadow);
  mesh.updateMatrixWorld(true);
  return { mesh, materialCache, contactShadow, themeId };
}

/**
 * Rebuilds cart visual meshes into an existing root after shatter cleanup detached
 * and disposed the original children. Preserves the root reference (so physics sync,
 * name labels, and camera tracking keep working) and refreshes the material cache.
 *
 * @param {object} cart Cart entity — `cart.mesh` is the empty root to repopulate.
 * @param {THREE.Scene} scene Active scene (contact shadow re-parented here).
 * @returns {void}
 */
function rebuildCartVisualsIntoRoot(cart, scene) {
  if (!cart?.mesh || !scene) return;

  // * Build a fresh mesh (rave GLTF instance or procedural cart) and move its children
  // * into the existing root so external refs (camera, labels) stay valid.
  const { mesh: freshMesh, materialCache } = buildCartVisualMesh(
    cart.cartColor,
    cart.cartThemeId,
    cart.cartSunglassesStyle,
  );

  // * Transfer children + userdata from the freshly built mesh into the existing root.
  const children = [...freshMesh.children];
  for (const child of children) {
    freshMesh.remove(child);
    cart.mesh.add(child);
  }
  // * Preserve relevant userData flags (isRaveGltf, cartThemeId, cartVisual) so
  // * updateCartVisuals / resetCartVisualState dispatch correctly after rebuild.
  if (freshMesh.userData) {
    cart.mesh.userData = { ...cart.mesh.userData, ...freshMesh.userData };
  }
  freshMesh.children.length = 0;
  cart.mesh.visible = true;
  cart.mesh.updateMatrixWorld(true);

  // * Restore the root to the canonical base scale rather than trusting the live
  // * scale.x — a squash/pulse tween interrupted at KO time can leave the root
  // * mid-pulse, and capturing that here would bake the wrong size in permanently.
  // * (userData.baseScale here is the fresh-build value merged from freshMesh above,
  // * falling back to the live value only if no build ever recorded one.)
  const baseScale = cart.mesh.userData.baseScale ?? cart.mesh.scale.x;
  cart.mesh.scale.setScalar(baseScale);
  cart.mesh.userData.baseScale = baseScale;

  // * Refresh the material cache — the old one referenced disposed materials.
  cart._materialCache = materialCache;

  // * Restore the slot's pattern: the fresh build bakes "classic" into the new
  // * CartFrame material and no slots broadcast follows a respawn, so the entity
  // * cache (set in updateCartMaterialsFromSlots) is the only carrier. Without
  // * this, patterns vanished after the first KO (playtest 2026-07-15).
  if (cart.cartPatternId && cart.cartPatternId !== "classic") {
    applyCartPattern(cart.mesh, cart.cartPatternId, cart.cartColor);
  }
  // * FIX-EMISSIVE — unconditional, unlike the pattern re-apply above: the fresh build was born
  // * "classic" (prepareRaveGltfCart takes no patternId here), so a patterned cart must be
  // * restored to 1 as well as a classic one held at the trim. No recolor needed — the caller
  // * repaints from slots right after a respawn.
  setEmissiveTrimMul(materialCache, cart.cartPatternId, cart.mesh);

  // * Drop any pre-shatter cargo bays first — leaving them caused double piles and
  // * spill hide only clearing the stale ref while groceries stayed visible.
  GroceryPool.removeCargoBaysFromMesh(cart.mesh);

  // * Recreate cargoBay visual inside the basket and update cart.cargoBay ref.
  const cargoParams = getBasketCargoParams(cart.mesh);
  const cargoBay = GroceryPool.createCargoBay(cargoParams.hw, cargoParams.hl, cargoParams.rimY);
  if (cargoBay) {
    cargoBay.name = "cargoBay";
    cargoBay.position.set(
      cargoParams.centerX ?? 0,
      cargoParams.floorY + 0.02,
      cargoParams.centerZ ?? 0,
    );
    cart.mesh.add(cargoBay);
    cart.cargoBay = cargoBay;
    cart.cargoBay.visible = true;
  } else {
    cart.cargoBay = null;
    // eslint-disable-next-line no-console
    console.warn("[entities] rebuildCartVisualsIntoRoot: cargoBay object not found in cart mesh");
  }

  // * Contact shadow persists across shatter (it was never detached); leave it as-is.
}

/**
 * @param {import("@dimforge/rapier3d").RigidBody} body
 * @param {import("@dimforge/rapier3d").Collider} collider
 * @param {{ label?: string, hx: number, hyPhys: number, hz: number, colliderLocalY: number }} dims
 */
function applyCartPhysicsOverrides(body, collider, { label, hx, hyPhys, hz, colliderLocalY }) {
  if (!body || !collider) return;

  applyCartMassPropertiesOverride(body, collider, {
    label,
    hx,
    hy: hyPhys,
    hz,
    colliderLocalY,
  });
}

/**
 * * Computes the *interior cargo cavity* (not the outer body hull) for cargo placement.
 * * Procedural carts use known basket dims; rave GLTF derives from the body mesh then
 * * insets heavily — outer AABB includes thick walls/handle shelf, so using it raw
 * * puts groceries through the rear of the basket. The body mesh is authored as
 * * `tripo_part_0` but renamed `CartFrame` at instance prep (cartRaveGltf.js) — match
 * * both, or every live rave cart silently gets the conservative fallback (CARGO-VIS-1
 * * session 1c: fallback dims buried the boss pile with no rim crest).
 *
 * @param {THREE.Object3D} mesh
 * @returns {{ floorY: number, hw: number, hl: number, centerX: number, centerZ: number, rimY: number }}
 */
function getBasketCargoParams(mesh) {
  if (!mesh?.userData?.isRaveGltf) {
    // * Procedural cart: basket floor at Y = -0.54, halfWidth = 0.675, halfLength = 1.05
    // * (matches CART_DIMS in cart.js). Slightly inset so pile clears the wire walls.
    // * rimY is BAY-LOCAL (bay group sits at floorY + 0.02): BASKET_RIM_TOP_Y 0.51 − (−0.52).
    return { floorY: -0.54, hw: 0.55, hl: 0.72, centerX: 0, centerZ: -0.05, rimY: 1.03 };
  }

  // * Rave GLTF: body bounds in cart-mesh local space (handles RaveGltfModel orient + bodyScale).
  // * Measured ROTATION-INDEPENDENTLY: geometry bbox through the child's transform relative to
  // * the cart root (root⁻¹ · childWorld). The old world-AABB-then-invert measurement was exact
  // * at creation (identity pose) but inflated up to ~2× on KO rebuilds, where the mesh still
  // * holds its death pose (yaw + tumble pitch/roll) — bays drifted into walls then fully
  // * outside the basket, worse with wilder deaths (Wyatt prod playtest 07-30).
  mesh.updateMatrixWorld(true);
  const box = new THREE.Box3();
  let found = false;
  const invRoot = new THREE.Matrix4().copy(mesh.matrixWorld).invert();
  const relToRoot = new THREE.Matrix4();
  mesh.traverse((child) => {
    if (found) return;
    if ((child.name === "CartFrame" || child.name === "tripo_part_0") && /** @type {any} */ (child).isMesh) {
      const geo = /** @type {THREE.Mesh} */ (child).geometry;
      if (!geo.boundingBox) geo.computeBoundingBox();
      relToRoot.multiplyMatrices(invRoot, child.matrixWorld);
      box.copy(geo.boundingBox).applyMatrix4(relToRoot);
      found = true;
    }
  });

  if (!found || box.isEmpty()) {
    // * Conservative rave-cart cavity fallback (meters, cart-local). rimY is a bay-local
    // * estimate matching the main path's bodyH * 0.72 proportion for a typical body.
    return { floorY: -0.12, hw: 0.38, hl: 0.48, centerX: 0, centerZ: 0, rimY: 0.5 };
  }

  const outerHw = (box.max.x - box.min.x) * 0.5;
  const outerHl = (box.max.z - box.min.z) * 0.5;
  const bodyH = box.max.y - box.min.y;
  const centerX = (box.max.x + box.min.x) * 0.5;
  // * Tiny front nudge (−Z, away from the handle shelf). Was 0.08 — combined with the old
  // * 0.6 length inset it left a permanent dead strip along the rear wall (session-3 pass 4,
  // * Wyatt annotation); rear-shelf clipping is re-checked by the rig's rear-view shot.
  const centerZ = (box.max.z + box.min.z) * 0.5 - outerHl * 0.02;
  // * Interior cavity vs outer hull: the rave basket walls are thin — session-3 Wyatt
  // * annotation (07-30) showed the old 0.48/0.42 insets left the pile floating in the
  // * middle of a basket twice its size. Keep just enough inset to clear the wall shell.
  const hw = Math.max(0.18, outerHw * 0.68);
  const hl = Math.max(0.2, outerHl * 0.7);
  // * Basket floor sits above the chassis bottom of the body mesh.
  const floorY = box.min.y + bodyH * 0.28;
  // * Rim height in BAY-LOCAL space: the bay group is parented at floorY + 0.02, so the
  // * body-mesh top (box.max.y, cart-local) lands at box.max.y − floorY − 0.02 inside the
  // * bay. CARGO-VIS-1: the overflow layer solves against this so a full basket crests
  // * the rim instead of guessing from item sizes.
  const rimY = box.max.y - floorY - 0.02;

  return { floorY, hw, hl, centerX, centerZ, rimY };
}

/**
 *
 * @param {{
 *   scene: THREE.Scene,
 *   world: import("@dimforge/rapier3d").World,
 *   color: number,
 *   themeId: string,
 *   sunglassesStyle?: string,
 *   spawn: { x: number, y: number, z: number },
 *   spawnYaw: number,
 *   label: string,
 *   slotIndex: number,
 * }} params
 * @returns {object}
 */
export function createCart({ scene, world, color, themeId, sunglassesStyle, spawn, spawnYaw, label, slotIndex }) {
  const spawnFrozen = { x: spawn.x, y: spawn.y, z: spawn.z };
  const { mesh, materialCache, contactShadow } = setupCartVisuals(scene, color, themeId, sunglassesStyle);

  const body = createCartBody(world, spawnFrozen, spawnYaw);
  const { collider, hx, hyPhys, hz, colliderLocalY } = createCartCollider(world, body);
  applyCartPhysicsOverrides(body, collider, { label, hx, hyPhys, hz, colliderLocalY });
  const baseMass = body.mass?.() ?? 1;
  const cargoBaseMass = Number.isFinite(baseMass) && baseMass > 0 ? baseMass : 1;

  const cargoParams = getBasketCargoParams(mesh);
  const cargoBay = GroceryPool.createCargoBay(cargoParams.hw, cargoParams.hl, cargoParams.rimY);
  if (cargoBay) {
    cargoBay.position.set(
      cargoParams.centerX ?? 0,
      cargoParams.floorY + 0.02,
      cargoParams.centerZ ?? 0,
    );
    mesh.add(cargoBay);
  }

  const spawnQuat = quatFromYaw(spawnYaw);

  // * Mesh is built at local origin; body is at spawn. Seed both the mesh and the
  // * net-interp targets at spawn so non-host remotes are not frozen at (0,0,0)
  // * (map center) while waiting for the first host snapshot / if P2P is delayed.
  mesh.position.set(spawnFrozen.x, spawnFrozen.y, spawnFrozen.z);
  mesh.quaternion.set(spawnQuat.x, spawnQuat.y, spawnQuat.z, spawnQuat.w);

  return {
    mesh,
    contactShadow,
    body,
    collider,
    _cargoBaseMass: cargoBaseMass,
    spawn: spawnFrozen,
    spawnYaw,
    slotIndex,
    label,
    cartColor: color,
    cartThemeId: themeId,
    cartSunglassesStyle: sunglassesStyle,
    _materialCache: materialCache,
    _lastNetLinvel: { x: 0, y: 0, z: 0 },
    // * Host snapshot yaw/pitch/roll rates — remote present path reads this instead of
    // * body.angvel() (WASM boundary alloc per remote cart per visual frame).
    _lastNetAngvel: { x: 0, y: 0, z: 0 },
    _netTargetPos: new THREE.Vector3(spawnFrozen.x, spawnFrozen.y, spawnFrozen.z),
    _netTargetQuat: new THREE.Quaternion(spawnQuat.x, spawnQuat.y, spawnQuat.z, spawnQuat.w),
    prevPosition: { x: spawnFrozen.x, y: spawnFrozen.y, z: spawnFrozen.z },
    prevRotation: { x: spawnQuat.x, y: spawnQuat.y, z: spawnQuat.z, w: spawnQuat.w },
    lastRamBoostTimeMs: Number.NEGATIVE_INFINITY,
    ramBoostActiveUntilMs: 0,
    ramBoostStreakCarry: 0,
    // * Auto-Charge Boost state — set by triggerRamBoost, consumed by applyArcadeControls.
    // * isChargingBoost=true while charging; boostChargeStartedAtMs marks the press time;
    // * boostCooldownUntilMs blocks re-charging after a released burst; chargeUpSfxId
    // * tracks the looping charge sound so it can be stopped on release / interrupt.
    isChargingBoost: false,
    boostChargeStartedAtMs: 0,
    boostCooldownUntilMs: 0,
    boostChargeMultiplier: 1,
    // * When true, nitro afterimage streaks use the charged (gold-mixed) look.
    nitroStreakCharged: false,
    chargeUpSfxId: null,
    lastHopAtMs: 0,
    // * Hop landing one-shot: set on takeoff; cleared on rising-edge floor contact
    // * (or landingMaxMs timeout). Prevents thud spam on ordinary floor bumps.
    hopAwaitingLand: false,
    hopAirborne: false,
    // * Non-host hop-land anchor (netcode applyCartState); cleared on land/timeout/respawn.
    takeoffPy: undefined,
    respawnAtMs: null,
    pendingRam: null,
    lastRamTimeMs: 0,
    aiNextDecisionMs: 0,
    aiTarget: { x: 0, z: 0 },
    // * NPC-BOOST-1: host-only boost intent. The fixed AI tick holds or hard-cancels
    // * a charged attack against this target slot; snapshots already carry charge state.
    aiDriveIntent: "patrol",
    npcBoostChargeTargetSlotIndex: null,
    aiBoostDirection: { x: spawnFrozen.x, z: spawnFrozen.z },
    idleAnchorX: spawnFrozen.x,
    idleAnchorZ: spawnFrozen.z,
    idleStillSinceMs: 0,
    unstickStillSinceMs: 0,
    hasSpilled: false,
    tipOverStartMs: null,
    comboTier: 0,
    comboExpiryMs: 0,
    cargoBay,
    // * Living Cargo (CARGO-WT-1) — life-scoped points; HUD round score is separate.
    // * weight01 = lifeCargoPoints / fullScore drives grip / drive / ram-incoming / bay.
    lifeCargoPoints: baselineLifeCargoPoints(),
    cargoFullness01: baselineLifeCargoPoints() / Math.max(1, CONFIG.cargo?.fullScore ?? 8),
    // * Spill announce window — deliberately NOT cleared by resetCartTransientState so a
    // * fall spill can still fire spill_rush after the 600ms respawn.
    spillBoostUntilMs: 0,
    // * Rim entry state — captured when dropping below FALL_ENTRY_Y for accurate KO classification/attribution.
    fallEntryPos: null,
    fallEntryTimeMs: null,
  };
}

/**
 * Resets idle / geometry-unstick tracking after teleport or booth respawn.
 *
 * @param {ReturnType<typeof createCart> | null | undefined} cart
 */
export function resetCartIdleWatch(cart) {
  if (!cart?.body) return;
  const p = cart.body.translation();
  cart.idleAnchorX = p.x;
  cart.idleAnchorZ = p.z;
  cart.idleStillSinceMs = Number.NEGATIVE_INFINITY;
  cart.unstickStillSinceMs = Number.NEGATIVE_INFINITY;
}

/**
 * Resets transient combat, boost, and AI state fields shared by doRespawn and
 * rematchResetWorld so the two paths do not drift apart over time.
 *
 * Stops the charge-up Howler instance *before* nulling chargeUpSfxId — nulling
 * alone used to orphan a loop:true SFX forever (NH-BOOST / rematch orphans).
 *
 * @param {ReturnType<typeof createCart> | null | undefined} cart
 */
export function resetCartTransientState(cart) {
  if (!cart?.body) return;

  cart.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
  cart.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  // * Drop any tracked sustained-contact pair involving this cart — a respawn/rematch
  // * teleport (or Sudden Death setEnabled(false)) can leave a stale pair in
  // * _activeCartContacts with no Rapier stopped edge, and it would re-fire an
  // * attributed ram whenever the geometric cone realigns (RAM-CONTACT-STALE-1).
  clearActiveCartContactsForCart(cart);
  // * HOLE-FRICTION-COMBINE-1 — force Average + cart μ on every respawn/rematch/SD
  // * reset so Min never survives the mid-fall window into the next life.
  applyCartFrictionMode(cart, "normal");
  cart.respawnAtMs = null;
  cart.fallEntryPos = null;
  cart.fallEntryTimeMs = null;
  cart.pendingRam = null;
  cart.ramBoostActiveUntilMs = 0;
  cart.ramBoostStreakCarry = 0;
  cart.lastRamBoostTimeMs = Number.NEGATIVE_INFINITY;
  // * Auto-Charge Boost state reset — stop by id first so the Howl cannot outlive the field.
  if (cart.chargeUpSfxId != null) {
    stopSfx("chargeUp", cart.chargeUpSfxId);
    cart.chargeUpSfxId = null;
  }
  cart.isChargingBoost = false;
  cart.boostChargeStartedAtMs = 0;
  cart.boostCooldownUntilMs = 0;
  cart.boostChargeMultiplier = 1;
  cart.nitroStreakCharged = false;
  // * Hop landing one-shot — clear so mid-hop death cannot thud on the first
  // * floor contact after respawn (timeout alone is not enough if respawn is fast).
  cart.hopAwaitingLand = false;
  cart.hopAirborne = false;
  cart.takeoffPy = undefined;
  // * Rampage Combo state reset
  cart.comboTier = 0;
  cart.comboExpiryMs = 0;
  // * AI decision state reset
  cart.aiNextDecisionMs = 0;
  cart.aiTarget = { x: 0, z: 0 };
  cart.aiDriveIntent = "patrol";
  cart.npcBoostChargeTargetSlotIndex = null;
  cart.aiBoostDirection = {
    x: cart.spawn?.x ?? cart.pos?.x ?? 0,
    z: cart.spawn?.z ?? cart.pos?.z ?? 0,
  };
  cart.aiPauseUntilMs = 0;
  cart.aiReverseUntilMs = 0;
  cart.aiSteerGain = 1.1;
  cart.aiLastProgressMs = 0;
  cart.aiLastDistToTarget = Infinity;
  cart.hasSpilled = false;
  cart.tipOverStartMs = null;
  // * Life-scoped cargo — respawn / rematch return to baseline stocked (today's feel).
  cart.lifeCargoPoints = baselineLifeCargoPoints();
  cart.cargoFullness01 =
    cart.lifeCargoPoints / Math.max(1, CONFIG.cargo?.fullScore ?? 8);
  cart._cargoWeightApplied = undefined;
  clearCargoOverflowForSlot(cart.slotIndex);
  // * Restore cargoBay mesh visibility on respawn (hidden during spill VFX).
  // * Prefer the live child on the mesh so a stale ref can't leave groceries gone.
  const liveBay = cart.mesh?.getObjectByName?.("cargoBay") || cart.cargoBay;
  if (liveBay) {
    cart.cargoBay = liveBay;
    cart.cargoBay.visible = true;
  }
}

/**
 * Disposes one cart mesh: per-cart geometries and frame materials only.
 * Skips module-shared wheel/hub geometry ({@link cart.js} `isSharedGeometry`).
 *
 * @param {THREE.Object3D | null | undefined} mesh
 * @param {ReturnType<typeof buildCartMaterialCache> | null | undefined} materialCache
 */
function disposeCartMeshResources(mesh, materialCache) {
  if (!mesh) return;

  if (mesh.userData?.isRaveGltf) {
    disposeRaveGltfInstance(mesh);
    return;
  }

  disposeCartThemeResources(mesh);

  mesh.traverse((child) => {
    if (!child.isMesh || !child.geometry) return;
    if (child.userData?.isSharedGeometry) return;
    child.geometry.dispose();
  });

  if (materialCache?.frameMats) {
    for (const mat of materialCache.frameMats) {
      if (mat && typeof mat.dispose === "function") mat.dispose();
    }
  }
}

/**
 * Removes all slot carts from the physics world and scene.
 * Foundation for in-tab menu returns without a full page reload.
 *
 * @param {{
 *   scene?: THREE.Scene | null,
 *   nameLabels?: Array<{ element?: HTMLElement } | null | undefined> | null,
 * }} [options]
 */
export function destroyCarts(options = {}) {
  const scene = options.scene ?? sceneRef;

  Visuals.disposeAllRamBoostStreaks(ramBoostStreaksRef, scene);

  if (allCartsRef) {
    for (const cart of allCartsRef) {
      if (!cart) continue;
      // * Tear down any active shatter VFX so detached parts + explosion are disposed
      // * before the cart root is removed.
      if (cart.isShattering || cart._shatterState) {
        cleanupShatter(cart, scene);
      }
      if (worldRef && cart.body) {
        worldRef.removeRigidBody(cart.body);
      }
      if (cart.mesh && scene) {
        scene.remove(cart.mesh);
        disposeCartMeshResources(cart.mesh, cart._materialCache);
      }
      if (cart.contactShadow && scene) {
        scene.remove(cart.contactShadow);
        ContactShadows.disposeContactShadow(cart.contactShadow);
      }
    }
  }

  colliderHandleToCart.clear();
  allCartsRef = null;

  const nameLabels = options.nameLabels;
  if (nameLabels && scene) {
    while (nameLabels.length > 0) {
      const label = nameLabels.pop();
      if (!label) continue;
      scene.remove(label);
      if (label.element?.parentNode) {
        label.element.parentNode.removeChild(label.element);
      }
    }
  }
}

/**
 * Teleports a cart to its spawn pose and clears transient combat / boost state.
 *
 * @param {ReturnType<typeof createCart>} cart
 */
export function doRespawn(cart, callbacks) {
  if (!cart?.body) return;

  // * Charge-up SFX cleanup is PER-CART: the respawning cart's own loop (if any) is
  // * stopped by id in resetCartTransientState below. chargeUp is played by the local
  // * cart AND NPCs (startNpcChargeSfx), so a global sweep here would cut other carts'
  // * live charge loops mid-charge — a respawn of any cart must not silence a charging
  // * player. Do NOT null chargeUpSfxId without stopSfx("chargeUp", id) first; the only
  // * no-handle orphan killers are the round-boundary sweep (stopAllChargeSfx) and the
  // * rematchResetWorld nuclear below.

  // * Tear down any active shatter + explosion VFX (host fall or non-host replay).
  // * Rebuilds the cart visual mesh into the existing root so camera / labels keep
  // * their references. No-op when the cart was not shattering.
  if (cart.isShattering || cart._shatterState) {
    cleanupShatter(cart, sceneRef);
    if (cart.mesh && sceneRef) {
      rebuildCartVisualsIntoRoot(cart, sceneRef);
    }
  }

  callbacks?.onCartRespawn?.(cart.slotIndex);

  cart.body.setTranslation({ x: cart.spawn.x, y: cart.spawn.y, z: cart.spawn.z }, true);
  cart.body.setRotation(quatFromYaw(cart.spawnYaw), true);
  copyBodyPoseToCartPrev(cart);
  resetCartTransientState(cart);
  resetCartIdleWatch(cart);
  if (cart.mesh) {
    Visuals.resetCartVisualState(cart.mesh);
  }
}

/**
 * @param {number} slotIndex
 * @returns {{ x: number, y: number, z: number }}
 */
function spawnOnRingForSlot(slotIndex) {
  const ringR = CONFIG.cart.spawnRingRadius;
  const angle = computeSpawnAngleForSlot(CONFIG, slotIndex);
  return {
    x: ringR * Math.cos(angle),
    y: CONFIG.cart.spawnHeight,
    z: ringR * Math.sin(angle),
  };
}

/**
 * Recomputes every cart's spawn point + yaw from the CURRENT spawn ring. Required
 * after a mid-session arena swap (Quickplay rotation): loadLevel applies per-level
 * radius overrides (config.record.radiusByLevel), but cart.spawn is frozen at
 * createCart time — respawns would otherwise land on the previous arena's ring
 * (over the void when the new arena is smaller).
 */
export function refreshCartSpawnPositions() {
  for (const cart of allCartsRef || []) {
    if (!cart) continue;
    const spawn = spawnOnRingForSlot(cart.slotIndex);
    cart.spawn = spawn;
    cart.spawnYaw = yawToCenter(spawn);
  }
}

/**
 * Resets every cart to spawn between rounds and broadcasts a host transform snapshot
 * (WebRTC + reliable PartyKit host_spawn).
 */
export function rematchResetWorld() {
  // * Nuclear before any resetCartTransientState nulls ids (callers can forget
  // * stopAllChargeSfx — this is the last line of defense against orphan loops).
  stopAllSfx("chargeUp");

  Visuals.disposeAllRamBoostStreaks(ramBoostStreaksRef, sceneRef);
  GameState.clearAllHits();
  // * Drop stale prediction / reconcile seq so the next host snaps are not ignored.
  try {
    Netcode.resetClientPredictionState?.();
  } catch {
    /* netcode may not be initialised in isolated unit tests */
  }

  for (const cart of allCartsRef || []) {
    if (!cart?.body) continue;

    // * Clear Sudden Death spectator state on every cart between rounds.
    cart.isSuddenDeathSpectator = false;
    if (cart.mesh) cart.mesh.visible = true;
    if (cart.collider) cart.collider.setEnabled(true);
    if (cart.body) cart.body.setEnabled(true);

    // * Tear down any active shatter + explosion VFX between rounds (e.g. a cart was
    // * mid-fall when the round ended). Rebuilds the visual mesh into the existing root.
    if (cart.isShattering || cart._shatterState) {
      cleanupShatter(cart, sceneRef);
      if (cart.mesh && sceneRef) {
        rebuildCartVisualsIntoRoot(cart, sceneRef);
      }
    }

    cart.body.setTranslation({ x: cart.spawn.x, y: cart.spawn.y, z: cart.spawn.z }, true);
    cart.body.setRotation(quatFromYaw(cart.spawnYaw), true);
    copyBodyPoseToCartPrev(cart);
    resetCartTransientState(cart);
    resetCartIdleWatch(cart);
    if (cart.mesh) {
      Visuals.resetCartVisualState(cart.mesh);
    }
  }

  const carts = [];
  for (let slotIndex = 0; slotIndex < (allCartsRef || []).length; slotIndex += 1) {
    const c = (allCartsRef || [])[slotIndex];
    if (!c?.body) continue;

    const t = c.body.translation();
    const r = c.body.rotation();
    const lv = c.body.linvel();
    const av = c.body.angvel();
    carts[slotIndex] = {
      p: [t.x, t.y, t.z],
      q: [r.x, r.y, r.z, r.w],
      lv: [lv.x, lv.y, lv.z],
      av: [av.x, av.y, av.z],
    };
  }
  Netcode.broadcastHostTransform(carts);
}

/**
 * Spawns four slot carts, registers collider handles, and handles mid-round join respawn.
 *
 * @param {{
 *   scene: THREE.Scene,
 *   world: import("@dimforge/rapier3d").World,
 *   ramBoostStreaks: Array<object>,
 *   netSlots: Array<object | null | undefined>,
 *   youConnId: string | null | undefined,
 *   CART_COLORS: Record<string, { hex: number }>,
 *   colorHexForSlot: (slot: object | null | undefined) => number,
 *   themeForSlot?: (slot: object | null | undefined) => string,
 *   sunglassesStyleForSlot?: (slot: object | null | undefined) => string,
 *   pendingMidRoundJoinRespawnConnId: string | null | undefined,
 *   spawnForSlot?: (slotIndex: number, slot: object | null | undefined) => { x: number, y: number, z: number },
 *   spawnYawForSlot?: (slotIndex: number, spawn: { x: number, y: number, z: number }) => number,
 * }} params
 */
export function initCarts({
  scene,
  world,
  ramBoostStreaks,
  netSlots,
  youConnId,
  CART_COLORS,
  colorHexForSlot,
  themeForSlot,
  sunglassesStyleForSlot,
  pendingMidRoundJoinRespawnConnId,
  spawnForSlot,
  spawnYawForSlot,
}) {
  sceneRef = scene;
  worldRef = world;
  ramBoostStreaksRef = ramBoostStreaks;

  const cartsBySlotId = [];
  let nextPendingMidRoundJoinRespawnConnId = pendingMidRoundJoinRespawnConnId;

  const resolveTheme = themeForSlot
    ?? ((slot) => resolveCartThemeForSlot(slot, { youConnId }));
  const resolveSunglassesStyle = sunglassesStyleForSlot
    ?? ((slot) => resolveCartSunglassesStyleForSlot(slot, { youConnId }));

  for (let slotIndex = 0; slotIndex < 4; slotIndex += 1) {
    const slot = netSlots[slotIndex];

    const spawn = spawnForSlot
      ? spawnForSlot(slotIndex, slot)
      : spawnOnRingForSlot(slotIndex);
    const cartColorHex = colorHexForSlot(slot);
    const cartThemeId = resolveTheme(slot);
    const cartSunglassesStyle = resolveSunglassesStyle(slot);

    const cart = createCart({
      scene,
      world,
      color: cartColorHex,
      themeId: cartThemeId,
      sunglassesStyle: cartSunglassesStyle,
      spawn,
      spawnYaw: spawnYawForSlot ? spawnYawForSlot(slotIndex, spawn) : yawToCenter(spawn),
      label: slot?.name ?? `slot-${slotIndex}`,
      slotIndex,
    });
    cartsBySlotId[slotIndex] = cart;

    if (!slot || slot.kind === "empty") {
      if (cart.mesh) cart.mesh.visible = false;
      if (cart.body) cart.body.setEnabled(false);
    }

    if (
      pendingMidRoundJoinRespawnConnId === youConnId &&
      slot?.connId === youConnId
    ) {
      doRespawn(cart);
      nextPendingMidRoundJoinRespawnConnId = null;
    }
  }

  colliderHandleToCart.clear();
  for (const c of cartsBySlotId) {
    if (c?.collider) {
      colliderHandleToCart.set(c.collider.handle, c);
    }
  }

  allCartsRef = cartsBySlotId;

  return {
    allCarts: allCartsRef,
    colliderHandleToCart,
    nextPendingMidRoundJoinRespawnConnId,
  };
}
