import * as THREE from "https://unpkg.com/three@0.164.1/build/three.module.js";
import RAPIER from "https://cdn.skypack.dev/@dimforge/rapier3d-compat";
import { buildCart } from "../cart.js";
import { CONFIG } from "./config.js";
import * as Visuals from "./visuals.js";
import * as GameState from "./gameState.js";
import * as Netcode from "./netcode.js";
import { applyCartMassPropertiesOverride } from "./simulation.js";

// Module-level references
export let allCartsRef = null;
export const colliderHandleToCart = new Map();

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

export function buildCartMaterialCache(cartMesh) {
  const frameMats = [];
  const wheelGlowMats = [];
  const frameGlowMats = [];
  const seen = new Set();

  /**
   * @param {THREE.Material | THREE.Material[] | null | undefined} material
   * @param {(m: THREE.Material) => void} add
   */
  function forEachMaterial(material, add) {
    if (!material) return;
    if (Array.isArray(material)) {
      material.forEach((m) => m && add(m));
      return;
    }
    add(material);
  }

  cartMesh.traverse((child) => {
    if (!child.isMesh || !child.material) return;
    if (child.userData && (child.userData.isFace || child.userData.isHandle)) return;

    const isWheel = Boolean(child.userData && child.userData.isWheel);
    forEachMaterial(child.material, (mat) => {
      if (seen.has(mat)) return;
      seen.add(mat);

      if (isWheel) {
        if (mat.emissive) wheelGlowMats.push(mat);
      } else {
        frameMats.push(mat);
        if (mat.emissive) frameGlowMats.push(mat);
      }
    });
  });

  return { frameMats, wheelGlowMats, frameGlowMats };
}

/**
 * @param {import("@dimforge/rapier3d-compat").World} world
 * @param {{ x: number, y: number, z: number }} spawn
 * @param {number} spawnYaw
 * @returns {import("@dimforge/rapier3d-compat").RigidBody | null}
 */
function createCartBody(world, spawn, spawnYaw) {
  if (!world || !spawn) return null;

  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(spawn.x, spawn.y, spawn.z)
      .setLinearDamping(0.6)
      .setAngularDamping(1.2),
  );
  body.setRotation(quatFromYaw(spawnYaw), true);

  const { canSleep } = CONFIG.cart.rigidBody;
  if (typeof body.setCanSleep === "function") {
    body.setCanSleep(canSleep);
  }
  // Temporarily disabled for tipping test — config enabledRotations locks pitch/roll off
  /*
  const { enabledRotations } = CONFIG.cart.rigidBody;
  if (typeof body.setEnabledRotations === "function" && Array.isArray(enabledRotations)) {
    const [pitch, yaw, roll, wake] = enabledRotations;
    body.setEnabledRotations(pitch, yaw, roll, wake);
  }
  */

  return body;
}

/**
 * @param {import("@dimforge/rapier3d-compat").World} world
 * @param {import("@dimforge/rapier3d-compat").RigidBody} body
 * @returns {{
 *   collider: import("@dimforge/rapier3d-compat").Collider,
 *   hx: number,
 *   hyPhys: number,
 *   hz: number,
 *   colliderLocalY: number,
 * } | null}
 */
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
    .setRestitution(CONFIG.cart.restitution);
  if (typeof colliderDesc.setActiveEvents === "function") {
    colliderDesc.setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
  }

  const collider = world.createCollider(colliderDesc, body);
  return { collider, hx, hyPhys, hz, colliderLocalY };
}

/**
 * @param {THREE.Scene} scene
 * @param {number} color
 * @returns {{ mesh: THREE.Object3D, materialCache: ReturnType<typeof buildCartMaterialCache> }}
 */
function setupCartVisuals(scene, color) {
  const mesh = buildCart(color);
  scene.add(mesh);
  mesh.updateMatrixWorld(true);
  const materialCache = buildCartMaterialCache(mesh);
  return { mesh, materialCache };
}

/**
 * @param {import("@dimforge/rapier3d-compat").RigidBody} body
 * @param {import("@dimforge/rapier3d-compat").Collider} collider
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
 *   world: import("@dimforge/rapier3d-compat").World,
 *   color: number,
 *   spawn: { x: number, y: number, z: number },
 *   spawnYaw: number,
 *   label: string,
 *   slotIndex: number,
 * }} params
 * @returns {object}
 */
export function createCart({ scene, world, color, spawn, spawnYaw, label, slotIndex }) {
  const spawnFrozen = { x: spawn.x, y: spawn.y, z: spawn.z };
  const { mesh, materialCache } = setupCartVisuals(scene, color);

  const body = createCartBody(world, spawnFrozen, spawnYaw);
  const { collider, hx, hyPhys, hz, colliderLocalY } = createCartCollider(world, body);
  applyCartPhysicsOverrides(body, collider, { label, hx, hyPhys, hz, colliderLocalY });

  const prevPosition = body.translation();
  const prevRotation = body.rotation();

  return {
    mesh,
    body,
    collider,
    spawn: spawnFrozen,
    spawnYaw,
    slotIndex,
    label,
    cartColor: color,
    _materialCache: materialCache,
    _lastNetLinvel: { x: 0, y: 0, z: 0 },
    _netTargetPos: mesh.position.clone(),
    _netTargetQuat: mesh.quaternion.clone(),
    prevPosition,
    prevRotation,
    lastRamBoostTimeMs: Number.NEGATIVE_INFINITY,
    ramBoostActiveUntilMs: 0,
    ramBoostStreakCarry: 0,
    lastHopAtMs: 0,
    lastWheelScreechAtMs: Number.NEGATIVE_INFINITY,
    respawnAtMs: null,
    pendingRam: null,
    lastRamTimeMs: 0,
    aiNextDecisionMs: 0,
    aiTarget: { x: 0, z: 0 },
  };
}

/**
 * Teleports a cart to its spawn pose and clears transient combat / boost state.
 *
 * @param {ReturnType<typeof createCart>} cart
 */
export function doRespawn(cart) {
  if (!cart?.body) return;

  cart.body.setTranslation({ x: cart.spawn.x, y: cart.spawn.y, z: cart.spawn.z }, true);
  cart.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
  cart.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  cart.body.setRotation(quatFromYaw(cart.spawnYaw), true);
  cart.prevPosition = cart.body.translation();
  cart.prevRotation = cart.body.rotation();
  cart.respawnAtMs = null;
  cart.pendingRam = null;
  cart.ramBoostActiveUntilMs = 0;
  cart.ramBoostStreakCarry = 0;
  if (cart.mesh) {
    Visuals.resetCartVisualState(cart.mesh);
  }
}

/**
 * @param {number} slotIndex
 * @returns {{ x: number, y: number, z: number }}
 */
export function spawnOnRingForSlot(slotIndex) {
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

    cart.body.setTranslation({ x: cart.spawn.x, y: cart.spawn.y, z: cart.spawn.z }, true);
    cart.body.setRotation(quatFromYaw(cart.spawnYaw), true);
    cart.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    cart.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    cart.prevPosition = cart.body.translation();
    cart.prevRotation = cart.body.rotation();
    cart.respawnAtMs = null;
    cart.pendingRam = null;
    cart.ramBoostActiveUntilMs = 0;
    cart.ramBoostStreakCarry = 0;
    cart.lastRamBoostTimeMs = Number.NEGATIVE_INFINITY;
    cart.aiNextDecisionMs = 0;
    cart.aiTarget = { x: 0, z: 0 };
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
 *   world: import("@dimforge/rapier3d-compat").World,
 *   ramBoostStreaks: Array<object>,
 *   netSlots: Array<object | null | undefined>,
 *   youConnId: string | null | undefined,
 *   CART_COLORS: Record<string, { hex: number }>,
 *   colorHexForSlot: (slot: object | null | undefined) => number,
 *   pendingMidRoundJoinRespawnConnId: string | null | undefined,
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
  pendingMidRoundJoinRespawnConnId,
}) {
  sceneRef = scene;
  worldRef = world;
  ramBoostStreaksRef = ramBoostStreaks;

  const cartsBySlotId = [];
  let nextPendingMidRoundJoinRespawnConnId = pendingMidRoundJoinRespawnConnId;

  for (let slotIndex = 0; slotIndex < 4; slotIndex += 1) {
    const spawn = spawnOnRingForSlot(slotIndex);
    const slot = netSlots[slotIndex];
    const cartColorHex = slot?.connId === youConnId && CART_COLORS[localStorage.getItem("cartRaveColor")]
      ? CART_COLORS[localStorage.getItem("cartRaveColor")].hex
      : colorHexForSlot(slot);

    const cart = createCart({
      scene,
      world,
      color: cartColorHex,
      spawn,
      spawnYaw: yawToCenter(spawn),
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
