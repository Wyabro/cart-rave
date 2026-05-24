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

export function applyArcadeControls(cart, axis, dtFixed, nowMs) {
  const pos = cart.body.translation();
  const rot = cart.body.rotation();
  const linvel = cart.body.linvel();
  const mass = getBodyMass(cart.body);

  const vertVel = Math.abs(linvel.y);
  const onGround = vertVel < 2.0 && pos.y > CONFIG.fall.yThreshold;
  const controlFactor = onGround ? 1 : CONFIG.driving.airControlFactor;

  const yaw = yawFromQuaternion(rot);
  const { forward, right } = getForwardRightFromYaw(yaw);

  const v = rapierToVec3(linvel);
  const vForward = forward.dot(v);
  const vRight = right.dot(v);

  if (axis.forward !== 0 || axis.turn !== 0) {
    cart.body.wakeUp();
  }

  // Lateral grip
  const grip = axis.turn !== 0
    ? CONFIG.driving.lateralGrip * CONFIG.driving.driftGripFactor
    : CONFIG.driving.lateralGrip;

  const dvRight = (-vRight) * grip * dtFixed;
  const gripImpulse = right.clone().multiplyScalar(mass * dvRight);
  cart.body.applyImpulse(vec3ToRapier(gripImpulse), true);

  // Forward drive
  if (axis.forward !== 0) {
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

  // Steering torque + drift impulse
  if (Math.abs(axis.turn) > 0.01) {
    const av = cart.body.angvel();
    const desiredYawRate = axis.turn * CONFIG.driving.tankYawRate * controlFactor;
    const yawError = desiredYawRate - av.y;
    const torqueImpulseY = yawError * CONFIG.driving.yawResponsiveness * mass * dtFixed;
    cart.body.applyTorqueImpulse({ x: 0, y: torqueImpulseY, z: 0 }, true);

    const speedForDrift = Math.abs(vForward);
    if (speedForDrift > 0.25) {
      const driftDir = right.clone().multiplyScalar(axis.turn * Math.sign(vForward || 1));
      const driftMag = speedForDrift * CONFIG.driving.driftImpulseStrength * controlFactor * mass * dtFixed;
      cart.body.applyImpulse(vec3ToRapier(driftDir.multiplyScalar(driftMag)), true);
    }
  } else {
    // When not steering, damp any unwanted yaw rotations extra hard to ensure straight driving and prevent tiny random turns
    const av = cart.body.angvel();
    const extraYawDamping = 12.0; // strong damping to keep driving straight
    cart.body.applyTorqueImpulse({ x: 0, y: -av.y * extraYawDamping * mass * dtFixed, z: 0 }, true);
  }

  // Damping + pitch/roll clamp
  if (cart.body) {
    cart.body.setAngularDamping(CONFIG.cart.angularDamping);
    
    // Anisotropic Linear Damping: set Rapier's default linear damping to 0 and apply manually
    cart.body.setLinearDamping(0);
    
    const dvX = -linvel.x * CONFIG.cart.linearDamping * dtFixed;
    const dvZ = -linvel.z * CONFIG.cart.linearDamping * dtFixed;
    // Y damping: use a stable constant damping (1.2) to prevent micro-bounces and hopping
    // while keeping falls fast and planted under gravity.
    const yDamping = 1.2;
    const dvY = -linvel.y * yDamping * dtFixed;
    
    cart.body.applyImpulse({ x: dvX * mass, y: dvY * mass, z: dvZ * mass }, true);

  }

  // Center hole gravity well pull & downward assist
  const distXZ = Math.hypot(pos.x, pos.z);
  
  // Low-friction band right at the rim (0.1–0.2) so carts slide off instead of catching
  if (cart.collider) {
    if (distXZ > CONFIG.record.innerRadius - 0.2 && distXZ < CONFIG.record.innerRadius + 0.8) {
      cart.collider.setFriction(0.15); // low friction right at the rim
    } else {
      cart.collider.setFriction(CONFIG.cart.friction); // Restore standard high floor friction
    }
  }

  const pullOuterRadius = CONFIG.record.innerRadius + 3.0; // e.g. 3.63 + 3.0 = 6.63
  if (distXZ < pullOuterRadius && distXZ > CONFIG.record.innerRadius - 1.0) {
    // Direction toward center (0,0) in XZ plane
    const pullDir = new THREE.Vector3(-pos.x, 0, -pos.z).normalize();
    // Strength scales up as the cart gets closer to the hole
    const t = 1.0 - (distXZ - (CONFIG.record.innerRadius - 1.0)) / (pullOuterRadius - (CONFIG.record.innerRadius - 1.0));
    const pullStrength = 15.0 * t; // max 15 m/s^2 pull acceleration
    const pullImpulse = pullDir.multiplyScalar(mass * pullStrength * dtFixed);
    cart.body.applyImpulse(vec3ToRapier(pullImpulse), true);
  }
  // Sharp downward pull when crossing the rim (only after center of mass crosses the edge)
  if (distXZ < CONFIG.record.innerRadius) {
    const downAssistStrength = 22.0; // additional downward acceleration
    cart.body.applyImpulse({ x: 0, y: -downAssistStrength * mass * dtFixed, z: 0 }, true);
  }

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

  if (dir.dot(toVictim) < 0.1) return;

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
  const steps = 3;
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

/**
 * High-level fixed physics step.
 * This is what game.js will call every fixed timestep.
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
  if (isHost && remoteInputs) {
    for (const [connId, input] of remoteInputs.entries()) {
      // TODO: resolve cart and apply
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

    const colliderHandleToCart = new Map();
    for (const c of allCarts || []) {
      if (c && c.collider) {
        colliderHandleToCart.set(c.collider.handle, c);
      }
    }

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
        // Environment collision!
        const cart = c1 || c2;
        const otherHandle = c1 ? h2 : h1;

        let envType = "floor";
        if (otherHandle === callbacks.recordColliderHandle) {
          envType = "floor";
        } else if (otherHandle === callbacks.pitWallColliderHandle) {
          envType = "edge";
        } else if (callbacks.boothColliderHandles && callbacks.boothColliderHandles.includes(otherHandle)) {
          envType = "edge"; // Booth platforms behave like edges (bouncy wall)
        }

        const lv = cart.body.linvel();
        const pre = cart.preStepLinvel || lv;
        let intensity = 0;
        let shouldTrigger = false;

        if (envType === "floor") {
          // Hard landing: downward velocity prior to impact
          const fallSpeed = -pre.y;
          const threshold = 3.0; // only trigger if falling faster than 3 m/s
          if (fallSpeed > threshold) {
            intensity = Math.min(1.0, (fallSpeed - threshold) / 15.0);
            shouldTrigger = true;
          }
        } else if (envType === "edge") {
          // Hard wall hit: horizontal velocity change
          const dvX = lv.x - pre.x;
          const dvZ = lv.z - pre.z;
          const dvXZ = Math.hypot(dvX, dvZ);
          const threshold = 2.5; // only trigger on sudden horizontal velocity change
          if (dvXZ > threshold) {
            intensity = Math.min(1.0, (dvXZ - threshold) / 15.0);
            shouldTrigger = true;
          }
        }

        if (shouldTrigger && intensity > 0.01) {
          const rp = cart.body.translation();
          const contactPos = { x: rp.x, y: rp.y - 0.4, z: rp.z };
          
          if (envType === "edge") {
            const pitInnerRadius = (CONFIG.record.radius + 2) * 1.30 * 1.20;
            const dist = Math.hypot(rp.x, rp.z);
            if (dist > 1e-3) {
              contactPos.x = rp.x * (pitInnerRadius / dist);
              contactPos.y = rp.y;
              contactPos.z = rp.z * (pitInnerRadius / dist);
            }
          }

          // Trigger local callbacks on host (since host runs local audio / particles too)
          if (envType === "floor") {
            if (callbacks.playFloorImpact) callbacks.playFloorImpact(intensity);
            if (callbacks.spawnTrashBurst) callbacks.spawnTrashBurst(contactPos, intensity, "floor");
          } else if (envType === "edge") {
            if (callbacks.playEdgeImpact) callbacks.playEdgeImpact(intensity);
            if (callbacks.spawnTrashBurst) callbacks.spawnTrashBurst(contactPos, intensity, "edge");
          }

          // Broadcast to other clients (host only)
          if (isHost && callbacks.partySocket && allCarts) {
            const slotIndex = allCarts.indexOf(cart);
            if (slotIndex >= 0) {
              callbacks.partySocket.send(JSON.stringify({
                type: "host_event_collision",
                slotA: slotIndex,
                slotB: envType === "floor" ? -1 : -2, // -1 means floor, -2 means edge/booth
                intensity,
                midpoint: contactPos,
              }));
            }
          }
        }
      }
    });
  }
}