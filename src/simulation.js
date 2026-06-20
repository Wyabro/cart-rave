// simulation.js — core physics + arcade driving simulation (extracted)

import * as THREE from "https://unpkg.com/three@0.164.1/build/three.module.js";
import RAPIER from "https://cdn.skypack.dev/@dimforge/rapier3d-compat";
import { CONFIG, BASELINE_CONFIG } from "./config.js";
import * as GameState from "./gameState.js";

const _v = new THREE.Vector3();

export function vec3ToRapier(v) {
  return { x: v.x, y: v.y, z: v.z };
}

export function rapierToVec3(v) {
  return new THREE.Vector3(v.x, v.y, v.z);
}

export function getBodyMass(body) {
  if (body && typeof body.mass === "function") return body.mass();
  return 1;
}

export function planarSpeed(v) {
  return Math.hypot(v.x, v.z);
}

export function vec3PlanarDirection(v) {
  const d = new THREE.Vector3(v.x, 0, v.z);
  const len = d.length();
  if (len <= 1e-6) return null;
  return d.multiplyScalar(1 / len);
}

export function yawFromQuaternion(q) {
  const siny = 2 * (q.w * q.y + q.x * q.z);
  const cosy = 1 - 2 * (q.y * q.y + q.z * q.z);
  return Math.atan2(siny, cosy);
}

export function getForwardRightFromYaw(yaw) {
  const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
  const up = new THREE.Vector3(0, 1, 0);
  const right = new THREE.Vector3().crossVectors(forward, up).normalize();
  return { forward, right };
}

export function wrapAngleRad(angle) {
  let a = angle;
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

export function principalInertiaForTranslatedBox(mass, hx, hy, hz, comOffset) {
  const ix0 = (mass / 12) * (4 * hy * hy + 4 * hz * hz);
  const iy0 = (mass / 12) * (4 * hx * hx + 4 * hz * hz);
  const iz0 = (mass / 12) * (4 * hx * hx + 4 * hy * hy);

  const { x, y, z } = comOffset;
  const r2 = x * x + y * y + z * z;

  return {
    ix: ix0 + mass * (r2 - x * x),
    iy: iy0 + mass * (r2 - y * y),
    iz: iz0 + mass * (r2 - z * z),
  };
}

export function applyCartMassPropertiesOverride(body, collider, { hx, hy, hz, colliderLocalY }) {
  let baseMass = collider?.mass?.() ?? body?.mass?.() ?? 1;
  if (!Number.isFinite(baseMass) || baseMass <= 0) baseMass = 1;

  if (typeof collider?.setDensity === "function") {
    collider.setDensity(0);
  }

  const targetCom = new RAPIER.Vector3(0, -0.55, 0);
  const comOffset = { x: 0, y: -0.55 - colliderLocalY, z: 0 };

  const { ix, iy, iz } = principalInertiaForTranslatedBox(baseMass, hx, hy, hz, comOffset);

  body.setAdditionalMassProperties(
    baseMass,
    targetCom,
    new RAPIER.Vector3(ix, iy, iz),
    RAPIER.RotationOps.identity(),
    true
  );

  if (typeof body.recomputeMassPropertiesFromColliders === "function") {
    body.recomputeMassPropertiesFromColliders(true);
  }
}

/**
 * * Center-hole fall-through assist (called from applyArcadeControls).
 *
 * * Goal: a cart that reaches the hole should TUMBLE IN and then die — never wedge on the
 * * lip, and never die early on the flat floor. The physics collider's center hole is larger
 * * than the visual hole and has no inner wall/chamfer, so carts lose support before their
 * * colliders can catch the neon lip.
 *
 * * Fix: once the cart's nearest edge overhangs the expanded physics hole, strip its friction and add a
 * * gentle inward + downward pull (ramped by how far it overhangs) so it slides off the lip
 * * and free-falls through the open hole. No teleport — the cart visibly drops into the void,
 * * and the host-authoritative fall detector then scores the center-hole knockout (+2) once it
 * * passes `CONFIG.fall.yThreshold`. Carts fully on the flat floor keep normal grip.
 */
export function applyCenterHoleAssist(cart, dtFixed, pos, mass) {
  // * Already committed to a fall/respawn — let the existing pipeline run its course.
  if (cart.respawnAtMs != null) return;

  const posX = pos.x;
  const posZ = pos.z;
  const distanceFromCenter = Math.hypot(posX, posZ);
  if (distanceFromCenter < 1e-3) return; // dead center: already over the open hole, falling

  const innerR = CONFIG.record.innerRadius;
  // * Flat playable surface ends here; inside is open space in the physics collider.
  const holeClearance =
    CONFIG.record.physics?.holeClearance ??
    CONFIG.record.physics?.chamferWidth ??
    1.05;
  const floorInnerR = innerR + holeClearance;

  const dirX = posX / distanceFromCenter;
  const dirZ = posZ / distanceFromCenter;

  // * Overhang-aware: project the oriented footprint onto the radial direction to find how
  // * close the cart's nearest edge is to the center (handles nose-in and side-on poses).
  const hx = CONFIG.cart.size.x / 2;
  const hz = CONFIG.cart.size.z / 2;
  const yaw = yawFromQuaternion(cart.body.rotation());
  const { forward, right } = getForwardRightFromYaw(yaw);
  const reach =
    Math.abs(hx * (right.x * dirX + right.z * dirZ)) +
    Math.abs(hz * (forward.x * dirX + forward.z * dirZ));
  const nearestEdge = distanceFromCenter - reach;

  if (nearestEdge >= floorInnerR) {
    // * Fully on the flat floor: restore normal grip, no assist.
    if (cart.collider) cart.collider.setFriction(CONFIG.cart.friction);
    return;
  }

  // * Cart overhangs the physics hole: make it slide off and fall in cleanly.
  cart.body.wakeUp();
  if (cart.collider) cart.collider.setFriction(0);

  const assistBand = CONFIG.record.holeAssist?.lowFrictionBandM ?? 1.5;
  const commit = Math.max(0, Math.min(1, (floorInnerR - nearestEdge) / Math.max(assistBand, 1e-3)));
  const downAccel =
    (CONFIG.record.holeAssist?.approachDownAccel ?? 6.0) +
    (CONFIG.record.holeAssist?.fallThroughAccel ?? 22.0) * commit;
  const inAccel = (CONFIG.record.holeAssist?.unstickAccel ?? 32.0) * 0.3 * commit;
  cart.body.applyImpulse(
    {
      x: -dirX * inAccel * mass * dtFixed,
      y: -downAccel * mass * dtFixed,
      z: -dirZ * inAccel * mass * dtFixed,
    },
    true,
  );
}

function applyLateralGrip(cart, axis, dtFixed, mass, v, right) {
  const vRight = right.dot(v);
  const grip = axis.turn !== 0
    ? CONFIG.driving.lateralGrip * CONFIG.driving.driftGripFactor
    : CONFIG.driving.lateralGrip;

  const dvRight = (-vRight) * grip * dtFixed;
  const gripImpulse = right.clone().multiplyScalar(mass * dvRight);
  cart.body.applyImpulse(vec3ToRapier(gripImpulse), true);
}

function applyForwardDrive(cart, axis, dtFixed, nowMs, controlFactor, forward, vForward, mass) {
  if (axis.forward === 0) return;

  const rb = CONFIG.cart.ramBoost;
  const nitroForward = rb.enabled && nowMs <= cart.ramBoostActiveUntilMs && axis.forward > 0;

  let targetSpeed = axis.forward > 0 ? CONFIG.driving.maxSpeed : -CONFIG.driving.reverseMaxSpeed;
  if (nitroForward) targetSpeed = rb.boostedMaxSpeed;

  const accelRate = nitroForward && rb.boostedAccel != null ? rb.boostedAccel : CONFIG.driving.accel;
  const speedError = targetSpeed - vForward;
  const maxDeltaV = accelRate * controlFactor * dtFixed;
  const dvForward = Math.max(-maxDeltaV, Math.min(maxDeltaV, speedError));

  if (Math.abs(dvForward) > 1e-4) {
    const driveImpulse = forward.clone().multiplyScalar(mass * dvForward);
    cart.body.applyImpulse(vec3ToRapier(driveImpulse), true);
  }
}

function applySteeringAndDrift(cart, axis, dtFixed, controlFactor, right, vForward, mass) {
  if (Math.abs(axis.turn) > CONFIG.driving.steerDeadzone) {
    const av = cart.body.angvel();
    const desiredYawRate = axis.turn * CONFIG.driving.tankYawRate * controlFactor;
    const yawError = desiredYawRate - av.y;
    const torqueImpulseY = yawError * CONFIG.driving.yawResponsiveness * mass * dtFixed;
    cart.body.applyTorqueImpulse({ x: 0, y: torqueImpulseY, z: 0 }, true);

    const speedForDrift = Math.abs(vForward);
    if (speedForDrift > CONFIG.driving.driftMinSpeed) {
      const driftDir = right.clone().multiplyScalar(axis.turn * Math.sign(vForward || 1));
      const driftMag = speedForDrift * CONFIG.driving.driftImpulseStrength * controlFactor * mass * dtFixed;
      cart.body.applyImpulse(vec3ToRapier(driftDir.multiplyScalar(driftMag)), true);
    }
  } else {
    const av = cart.body.angvel();
    cart.body.applyTorqueImpulse(
      { x: 0, y: -av.y * CONFIG.driving.extraYawDamping * mass * dtFixed, z: 0 },
      true,
    );
  }
}

function applyDampingAndStability(cart, dtFixed, pos, linvel) {
  if (!cart.body) return;

  const mass = getBodyMass(cart.body);
  cart.body.setAngularDamping(CONFIG.cart.angularDamping);

  // Anisotropic linear damping: Rapier default set to 0, applied manually per axis.
  cart.body.setLinearDamping(0);

  const dvX = -linvel.x * CONFIG.cart.linearDamping * dtFixed;
  const dvZ = -linvel.z * CONFIG.cart.linearDamping * dtFixed;
  const distXZForDamp = Math.hypot(pos.x, pos.z);
  const innerRForDamp = CONFIG.record.innerRadius;
  const holeBandM = CONFIG.record.holeAssist?.lowFrictionBandM ?? 1.5;
  const inHoleZone =
    distXZForDamp < innerRForDamp ||
    (distXZForDamp >= innerRForDamp && distXZForDamp <= innerRForDamp + holeBandM);
  const yDamping = inHoleZone
    ? CONFIG.driving.holeZoneLinearYDamping
    : CONFIG.driving.defaultLinearYDamping;
  const dvY = -linvel.y * yDamping * dtFixed;

  cart.body.applyImpulse({ x: dvX * mass, y: dvY * mass, z: dvZ * mass }, true);
}

/**
 * Applies arcade tank steering, grip, drift, damping, and center-hole assist to one cart.
 *
 * @param {object} cart Cart entity with Rapier body/collider.
 * @param {{ forward: number, turn: number }} axis Normalized drive input.
 * @param {number} dtFixed Fixed physics timestep in seconds.
 * @param {number} nowMs Current time in milliseconds (for nitro window checks).
 */
export function applyArcadeControls(cart, axis, dtFixed, nowMs) {
  const pos = cart.body.translation();
  const rot = cart.body.rotation();
  const linvel = cart.body.linvel();
  const mass = getBodyMass(cart.body);

  const vertVel = Math.abs(linvel.y);
  const onGround = vertVel < CONFIG.driving.groundVerticalVelThreshold && pos.y > CONFIG.fall.yThreshold;
  const controlFactor = onGround ? 1 : CONFIG.driving.airControlFactor;

  const yaw = yawFromQuaternion(rot);
  const { forward, right } = getForwardRightFromYaw(yaw);

  const v = rapierToVec3(linvel);
  const vForward = forward.dot(v);

  if (axis.forward !== 0 || axis.turn !== 0) {
    cart.body.wakeUp();
  }

  applyLateralGrip(cart, axis, dtFixed, mass, v, right);
  applyForwardDrive(cart, axis, dtFixed, nowMs, controlFactor, forward, vForward, mass);
  applySteeringAndDrift(cart, axis, dtFixed, controlFactor, right, vForward, mass);
  applyDampingAndStability(cart, dtFixed, pos, linvel);

  applyCenterHoleAssist(cart, dtFixed, pos, mass);

  const av = cart.body.angvel();
  const maxPR = CONFIG.cart.maxPitchRoll;
  if (Math.abs(av.x) > maxPR || Math.abs(av.z) > maxPR) {
    cart.body.setAngvel({
      x: Math.max(-maxPR, Math.min(maxPR, av.x)),
      y: av.y,
      z: Math.max(-maxPR, Math.min(maxPR, av.z)),
    }, true);
  }
}

/**
 * Applies a spread ramming impulse from rammer to victim and triggers FX / host events.
 *
 * @param {object} rammer Attacking cart entity.
 * @param {object} victim Target cart entity.
 * @param {Function|null} playCollisionRef Local collision audio callback.
 * @param {Function|null} spawnTrashBurstRef Local particle burst callback.
 * @param {boolean} isHost Whether this client is the room host.
 * @param {object|null} partySocket Active PartyKit socket (host broadcast).
 * @param {object[]|null} allCarts All cart entities in slot order.
 */
export function applyRammingImpulse(rammer, victim, playCollisionRef, spawnTrashBurstRef, isHost, partySocket, allCarts) {
  const rv = rammer.body.linvel();
  const speed = planarSpeed(rv);
  if (speed < CONFIG.ramming.minSpeed) return;

  const dir = vec3PlanarDirection(rv);
  if (!dir) return;

  const vv = victim.body.linvel();
  const closingSpeed = Math.max(speed, speed + (-(vv.x * dir.x + vv.z * dir.z)));

  const rp = rammer.body.translation();
  const vp = victim.body.translation();
  const toVictim = new THREE.Vector3(vp.x - rp.x, 0, vp.z - rp.z);
  if (toVictim.lengthSq() < 1e-6) return;
  toVictim.normalize();

  if (dir.dot(toVictim) < CONFIG.ramming.alignmentDotMin) return;

  const impulseMag = Math.max(
    0,
    Math.min(
      CONFIG.ramming.strength * closingSpeed * getBodyMass(victim.body),
      CONFIG.ramming.maxImpulse
    )
  );

  const impulse = { x: dir.x * impulseMag, y: 0, z: dir.z * impulseMag };

  // Visual + audio feedback (local only)
  if (playCollisionRef) {
    playCollisionRef(impulseMag / CONFIG.ramming.maxImpulse);
  }
  if (spawnTrashBurstRef && GameState.getRoundState().phase === "running") {
    const midpoint = { x: (rp.x + vp.x) / 2, y: (rp.y + vp.y) / 2, z: (rp.z + vp.z) / 2 };
    spawnTrashBurstRef(midpoint, impulseMag / CONFIG.ramming.maxImpulse);
  }

  // Spread impulse
  const steps = CONFIG.ramming.spreadSteps;
  if (!victim.pendingRam) {
    victim.pendingRam = { impulse, remainingSteps: steps };
  } else {
    victim.pendingRam.impulse.x += impulse.x;
    victim.pendingRam.impulse.y += impulse.y;
    victim.pendingRam.impulse.z += impulse.z;
    victim.pendingRam.remainingSteps = Math.max(victim.pendingRam.remainingSteps, steps);
  }

  // Stage A: record last hit for scoring attribution (host only).
  if (isHost && allCarts) {
    const attackerSlotIndex = allCarts.indexOf(rammer);
    const victimSlotIndex = allCarts.indexOf(victim);
    if (attackerSlotIndex >= 0 && victimSlotIndex >= 0) {
      const nowPerf = performance.now();
      const wasCritical = nowPerf <= (rammer.ramBoostActiveUntilMs || 0);
      GameState.recordHit(victimSlotIndex, attackerSlotIndex, wasCritical);
    }
  }

  // Host collision event broadcast
  if (isHost && partySocket && allCarts) {
    const slotA = allCarts.indexOf(rammer);
    const slotB = allCarts.indexOf(victim);
    if (slotA >= 0 && slotB >= 0 && slotA < slotB) {
      partySocket.send(JSON.stringify({
        type: "host_event_collision",
        slotA, slotB,
        intensity: impulseMag / CONFIG.ramming.maxImpulse,
        midpoint: { x: (rp.x + vp.x) / 2, y: (rp.y + vp.y) / 2, z: (rp.z + vp.z) / 2 },
      }));
    }
  }
}

// Note: roundPhase is intentionally left as external reference for now
// (will be cleaned when gameState.js is extracted)
export function setRoundPhase(phase) {
  GameState.setRoundPhase(phase);
}

function processCollisionEvents(world, eventQueue, allCarts, callbacks, isHost) {
  const colliderHandleToCart = new Map();
  for (const c of allCarts || []) {
    if (c && c.collider) {
      colliderHandleToCart.set(c.collider.handle, c);
    }
  }

  const impacts = CONFIG.environmentImpacts;

  eventQueue.drainCollisionEvents((h1, h2, started) => {
    if (!started) return;
    const c1 = colliderHandleToCart.get(h1);
    const c2 = colliderHandleToCart.get(h2);

    if (c1 && c2) {
      if (c1 !== c2) {
        applyRammingImpulse(c1, c2, callbacks.playCollision, callbacks.spawnTrashBurst, isHost, callbacks.partySocket, allCarts);
        applyRammingImpulse(c2, c1, callbacks.playCollision, callbacks.spawnTrashBurst, isHost, callbacks.partySocket, allCarts);
      }
    } else if (c1 || c2) {
      const cart = c1 || c2;
      const otherHandle = c1 ? h2 : h1;

      let envType = "floor";
      if (otherHandle === callbacks.recordColliderHandle) {
        envType = "floor";
      } else if (otherHandle === callbacks.pitWallColliderHandle) {
        envType = "edge";
      } else if (callbacks.boothColliderHandles && callbacks.boothColliderHandles.includes(otherHandle)) {
        envType = "edge";
      }

      const lv = cart.body.linvel();
      const pre = cart.preStepLinvel || lv;
      let intensity = 0;
      let shouldTrigger = false;

      if (envType === "floor") {
        const fallSpeed = -pre.y;
        if (fallSpeed > impacts.floorFallSpeedThreshold) {
          intensity = Math.min(1.0, (fallSpeed - impacts.floorFallSpeedThreshold) / impacts.intensityRange);
          shouldTrigger = true;
        }
      } else if (envType === "edge") {
        const dvX = lv.x - pre.x;
        const dvZ = lv.z - pre.z;
        const dvXZ = Math.hypot(dvX, dvZ);
        if (dvXZ > impacts.edgeDeltaVThreshold) {
          intensity = Math.min(1.0, (dvXZ - impacts.edgeDeltaVThreshold) / impacts.intensityRange);
          shouldTrigger = true;
        }
      }

      if (shouldTrigger && intensity > impacts.minIntensity) {
        const rp = cart.body.translation();
        const contactPos = { x: rp.x, y: rp.y + impacts.contactYOffset, z: rp.z };

        if (envType === "edge") {
          const pitInnerRadius =
            (CONFIG.record.radius + impacts.pitRadiusOffset) * impacts.pitRadiusScale;
          const dist = Math.hypot(rp.x, rp.z);
          if (dist > 1e-3) {
            contactPos.x = rp.x * (pitInnerRadius / dist);
            contactPos.y = rp.y;
            contactPos.z = rp.z * (pitInnerRadius / dist);
          }
        }

        if (envType === "floor") {
          if (callbacks.playFloorImpact) callbacks.playFloorImpact(intensity);
          if (callbacks.spawnTrashBurst) callbacks.spawnTrashBurst(contactPos, intensity, "floor");
        } else if (envType === "edge") {
          if (callbacks.playEdgeImpact) callbacks.playEdgeImpact(intensity);
          if (callbacks.spawnTrashBurst) callbacks.spawnTrashBurst(contactPos, intensity, "edge");
        }

        if (isHost && callbacks.partySocket && allCarts) {
          const slotIndex = allCarts.indexOf(cart);
          if (slotIndex >= 0) {
            callbacks.partySocket.send(JSON.stringify({
              type: "host_event_collision",
              slotA: slotIndex,
              slotB: envType === "floor" ? -1 : -2,
              intensity,
              midpoint: contactPos,
            }));
          }
        }
      }
    }
  });
}

/**
 * Runs one fixed-timestep physics update: controls, pending rams, world step, and collisions.
 *
 * @param {object} params
 * @param {object} params.world Rapier physics world.
 * @param {object} params.eventQueue Rapier event queue for collision draining.
 * @param {object[]} params.allCarts All cart entities in slot order.
 * @param {object|null} params.localCart Local human cart (may be null on non-host observers).
 * @param {Map|null} params.remoteInputs Host-side remote input map (connId → input).
 * @param {object[]} [params.npcs] NPC cart entities controlled by host AI.
 * @param {number} params.dt Fixed timestep in seconds.
 * @param {number} params.now Current time in milliseconds.
 * @param {boolean} params.isHost Whether this client runs authoritative physics.
 * @param {object} [params.callbacks] Injected helpers (getAxis, FX, collider handles, etc.).
 */
export function runFixedPhysicsStep({
  world,
  eventQueue,
  allCarts,
  localCart,
  remoteInputs,
  npcs = [],
  dt,
  now,
  isHost,
  callbacks = {},
}) {
  const getAxis = callbacks.getAxis || (() => ({ forward: 0, turn: 0 }));
  const getAiAxis = callbacks.getAiAxis || null;

  // Save pre-step linear velocities for collision impact calculations
  for (const cart of allCarts || []) {
    if (cart && cart.body) {
      const lv = cart.body.linvel();
      cart.preStepLinvel = { x: lv.x, y: lv.y, z: lv.z };
    }
  }

  // 1. Local player
  if (localCart) {
    const axis = getAxis();
    applyArcadeControls(localCart, axis, dt, now);
  }

  // 2. Remote players (host only)
  // * resolveCartForConn is injected by the caller (main.js) so this module stays
  // * free of netSlots / connId knowledge.
  if (isHost && remoteInputs && callbacks.resolveCartForConn) {
    for (const [connId, input] of remoteInputs.entries()) {
      const remoteCart = callbacks.resolveCartForConn(connId);
      if (!remoteCart) continue;
      applyArcadeControls(
        remoteCart,
        { forward: input.throttle ?? 0, turn: input.steer ?? 0 },
        dt,
        now,
      );
    }
  }

  // 3. NPC AI (host only)
  if (isHost && getAiAxis && npcs.length > 0) {
    for (const npc of npcs) {
      const aiAxis = getAiAxis(now, npc);
      applyArcadeControls(npc, aiAxis, dt, now);
    }
  }

  // 4. Pending ramming impulses
  for (const cart of allCarts || []) {
    if (!cart.pendingRam) continue;
    const { impulse, remainingSteps } = cart.pendingRam;
    const denom = Math.max(1, remainingSteps);
    cart.body.applyImpulse({
      x: impulse.x / denom, y: impulse.y / denom, z: impulse.z / denom
    }, true);
    cart.pendingRam.remainingSteps--;
    if (cart.pendingRam.remainingSteps <= 0) cart.pendingRam = null;
  }

  // 5. Step world
  if (world && eventQueue) {
    world.step(eventQueue);
    processCollisionEvents(world, eventQueue, allCarts, callbacks, isHost);
  }
}
