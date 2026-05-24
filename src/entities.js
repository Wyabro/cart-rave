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

export function createCart({ scene, world, color, spawn, spawnYaw, label, slotIndex }) {
  const mesh = buildCart(color);
  scene.add(mesh);
  mesh.updateMatrixWorld(true);
  const materialCache = buildCartMaterialCache(mesh);

  const spawnFrozen = { x: spawn.x, y: spawn.y, z: spawn.z };

  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(spawnFrozen.x, spawnFrozen.y, spawnFrozen.z)
      .setLinearDamping(CONFIG.cart.linearDamping)
      .setAngularDamping(CONFIG.cart.angularDamping),
  );
  body.setRotation(quatFromYaw(spawnYaw), true);
  // Keep the cart responsive; some Rapier builds may sleep bodies aggressively.
  if (typeof body.setCanSleep === "function") {
    body.setCanSleep(false);
  }
  // Lock pitch and roll rotations for maximum movement stability
  if (typeof body.setEnabledRotations === "function") {
    body.setEnabledRotations(false, true, false, true);
  }

  const hx = CONFIG.cart.size.x / 2;
  const hy = CONFIG.cart.size.y / 2;
  const hz = CONFIG.cart.size.z / 2;

  // Reduce physical collider height and translate upward to lift it off the floor
  const hyPhys = hy - 0.25;
  const colliderLocalY = -0.12 + 0.25;

  // Replace sharp cuboid with a round cuboid to stop trimesh snagging
  const colliderDesc = RAPIER.ColliderDesc.roundCuboid(hx, hyPhys, hz, 0.1)
    .setTranslation(0, colliderLocalY, 0)
    .setFriction(CONFIG.cart.friction)
    .setRestitution(CONFIG.cart.restitution);
  if (typeof colliderDesc.setActiveEvents === "function") {
    colliderDesc.setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
  }
  const collider = world.createCollider(colliderDesc, body);

  applyCartMassPropertiesOverride(body, collider, {
    label,
    hx,
    hy: hyPhys,
    hz,
    colliderLocalY,
  });

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
    lastRamBoostTimeMs: Number.NEGATIVE_INFINITY,
    ramBoostActiveUntilMs: 0,
    ramBoostStreakCarry: 0,
    lastHopAtMs: 0,
    lastWheelScreechAtMs: Number.NEGATIVE_INFINITY,
    respawnAtMs: null,
    pendingRam: null,
    aiNextDecisionMs: 0,
    aiTarget: { x: 0, z: 0 },
  };
}

export function doRespawn(cart) {
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
  Visuals.resetCartVisualState(cart.mesh);
}

export function spawnOnRingForSlot(slotIndex) {
  const ringR = CONFIG.cart.spawnRingRadius;
  const angle = (slotIndex * Math.PI) / 2;
  return {
    x: ringR * Math.cos(angle),
    y: CONFIG.cart.spawnHeight,
    z: ringR * Math.sin(angle),
  };
}

export function rematchResetWorld() {
  if (ramBoostStreaksRef) {
    for (let i = ramBoostStreaksRef.length - 1; i >= 0; i -= 1) {
      const s = ramBoostStreaksRef[i];
      if (sceneRef) {
        sceneRef.remove(s.mesh);
      }
      s.mesh.geometry.dispose();
      s.material.dispose();
      ramBoostStreaksRef.splice(i, 1);
    }
  }
  GameState.clearAllHits();
  for (const cart of allCartsRef) {
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
    Visuals.resetCartVisualState(cart.mesh);
  }
  const carts = {};
  for (let slotIndex = 0; slotIndex < allCartsRef.length; slotIndex += 1) {
    const c = allCartsRef[slotIndex];
    const t = c.body.translation();
    const r = c.body.rotation();
    const lv = c.body.linvel();
    const av = c.body.angvel();
    carts[String(slotIndex)] = {
      p: [t.x, t.y, t.z],
      q: [r.x, r.y, r.z, r.w],
      lv: [lv.x, lv.y, lv.z],
      av: [av.x, av.y, av.z],
    };
  }
  Netcode.broadcastHostTransform(carts);
}

export function initCarts({
  scene,
  world,
  ramBoostStreaks,
  netSlots,
  youConnId,
  CART_COLORS,
  colorHexForSlot,
  pendingMidRoundJoinRespawnConnId
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
    colliderHandleToCart.set(c.collider.handle, c);
  }

  allCartsRef = cartsBySlotId;

  return {
    allCarts: allCartsRef,
    colliderHandleToCart,
    nextPendingMidRoundJoinRespawnConnId
  };
}
