import * as THREE from "three";
import { RAPIER } from "./physics/rapierInstance.js";
import { buildCart } from "./cart.js";
import { normalizeThemeId } from "./cartThemeConfig.js";
import {
  createRaveGltfCartInstance,
  disposeRaveGltfInstance,
  isRaveGltfSourceReady,
  prepareRaveGltfCart,
} from "./cartRaveGltf.js";
import { CONFIG } from "./config.js";
import { resolveCartThemeForSlot, resolveCartSunglassesStyleForSlot } from "./customization.js";
import {
  applyCartTheme,
  buildCartThemeMaterialCache,
  disposeCartThemeResources,
} from "./cartThemes.js";
import * as ContactShadows from "./contactShadows.js";
import * as Visuals from "./visuals.js";
import * as GameState from "./gameState.js";
import * as Netcode from "./netcode.js";
import { applyCartMassPropertiesOverride } from "./simulation.js";
import { cleanupShatter } from "./cartShatter.js";
import * as GroceryPool from "./effects/groceryPool.js";

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
export function rebuildCartVisualsIntoRoot(cart, scene) {
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

  // * Preserve the stable base scale for boost pulse animations — reading
  // * from mesh.scale.x mid-pulse would ratchet the scale upward on interruption.
  cart.mesh.userData.baseScale = cart.mesh.scale.x;

  // * Refresh the material cache — the old one referenced disposed materials.
  cart._materialCache = materialCache;

  // * Recreate cargoBay visual inside the basket and update cart.cargoBay ref.
  const cargoBay = GroceryPool.createCargoBay();
  if (cargoBay) {
    cargoBay.position.set(0, CONFIG.cart.visualOffset + 0.1, 0);
    cart.mesh.add(cargoBay);
    cart.cargoBay = cargoBay;
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
 * Creates a cart rigid body, collider, and mesh wired for netcode and gameplay state.
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

  const cargoBay = GroceryPool.createCargoBay();
  if (cargoBay) {
    cargoBay.position.set(0, CONFIG.cart.visualOffset + 0.1, 0);
    mesh.add(cargoBay);
  }

  const spawnQuat = quatFromYaw(spawnYaw);

  return {
    mesh,
    contactShadow,
    body,
    collider,
    spawn: spawnFrozen,
    spawnYaw,
    slotIndex,
    label,
    cartColor: color,
    cartThemeId: themeId,
    cartSunglassesStyle: sunglassesStyle,
    _materialCache: materialCache,
    _lastNetLinvel: { x: 0, y: 0, z: 0 },
    _netTargetPos: mesh.position.clone(),
    _netTargetQuat: mesh.quaternion.clone(),
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
    chargeUpSfxId: null,
    lastHopAtMs: 0,
    respawnAtMs: null,
    pendingRam: null,
    lastRamTimeMs: 0,
    aiNextDecisionMs: 0,
    aiTarget: { x: 0, z: 0 },
    idleAnchorX: spawnFrozen.x,
    idleAnchorZ: spawnFrozen.z,
    idleStillSinceMs: 0,
    unstickStillSinceMs: 0,
    hasSpilled: false,
    tipOverStartMs: null,
    comboTier: 0,
    comboExpiryMs: 0,
    cargoBay,
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
 * @param {ReturnType<typeof createCart> | null | undefined} cart
 */
export function resetCartTransientState(cart) {
  if (!cart?.body) return;

  cart.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
  cart.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  cart.respawnAtMs = null;
  cart.pendingRam = null;
  cart.ramBoostActiveUntilMs = 0;
  cart.ramBoostStreakCarry = 0;
  cart.lastRamBoostTimeMs = Number.NEGATIVE_INFINITY;
  // * Auto-Charge Boost state reset
  cart.isChargingBoost = false;
  cart.boostChargeStartedAtMs = 0;
  cart.boostCooldownUntilMs = 0;
  cart.boostChargeMultiplier = 1;
  cart.chargeUpSfxId = null;
  // * Rampage Combo state reset
  cart.comboTier = 0;
  cart.comboExpiryMs = 0;
  // * AI decision state reset
  cart.aiNextDecisionMs = 0;
  cart.aiTarget = { x: 0, z: 0 };
  cart.aiPauseUntilMs = 0;
  cart.aiReverseUntilMs = 0;
  cart.aiSteerGain = 1.1;
  cart.aiLastProgressMs = 0;
  cart.aiLastDistToTarget = Infinity;
  cart.hasSpilled = false;
  cart.tipOverStartMs = null;
  // * Restore cargoBay mesh visibility on respawn (hidden during spill VFX).
  if (cart.cargoBay) cart.cargoBay.visible = true;
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
    if (child.userData?.isSharedGeometry || child.userData?.sharesCartFrameGeometry) return;
    child.geometry.dispose();
  });

  mesh.traverse((child) => {
    if (!child.isMesh || !child.userData?.isCartPatternLayer || !child.material) return;
    const mat = child.material;
    if (Array.isArray(mat)) mat.forEach((m) => m?.dispose?.());
    else mat.dispose?.();
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
  const angle = (slotIndex * Math.PI) / 2;
  return {
    x: ringR * Math.cos(angle),
    y: CONFIG.cart.spawnHeight,
    z: ringR * Math.sin(angle),
  };
}

/**
 * Resets every cart to spawn between rounds and broadcasts a host transform snapshot.
 */
export function rematchResetWorld() {
  Visuals.disposeAllRamBoostStreaks(ramBoostStreaksRef, sceneRef);
  GameState.clearAllHits();

  for (const cart of allCartsRef) {
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
  for (let slotIndex = 0; slotIndex < allCartsRef.length; slotIndex += 1) {
    const c = allCartsRef[slotIndex];
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
    if (slot?.kind === "empty") {
      cartsBySlotId[slotIndex] = null;
      continue;
    }

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
