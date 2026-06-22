// simulation.js — core physics + arcade driving simulation (extracted)

import * as THREE from "https://unpkg.com/three@0.164.1/build/three.module.js";
import RAPIER from "https://cdn.skypack.dev/@dimforge/rapier3d-compat";
import { CONFIG, BASELINE_CONFIG } from "./config.js";
import * as GameState from "./gameState.js";

const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _quat = new THREE.Quaternion();
const _toVictim = new THREE.Vector3();
const _planarDir = new THREE.Vector3();
const _colliderMap = new Map();

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/**
 * * Writes planar forward/right basis vectors from a body rotation quaternion.
 * * Flattens Y so driving controls stay correct when the cart is tilted or airborne.
 */
function setPlanarBasisFromRotation(rot, forward, right) {
  forward.set(0, 0, -1).applyQuaternion(_quat.set(rot.x, rot.y, rot.z, rot.w));
  forward.y = 0;
  if (forward.lengthSq() > 1e-6) {
    forward.normalize();
  } else {
    forward.set(0, 0, -1);
  }
  right.crossVectors(forward, _up).normalize();
}

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
  setPlanarBasisFromRotation(cart.body.rotation(), _forward, _right);
  const reach =
    Math.abs(hx * (_right.x * dirX + _right.z * dirZ)) +
    Math.abs(hz * (_forward.x * dirX + _forward.z * dirZ));
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

/**
 * Applies continuous arena contact response for one cart.
 *
 * Flat record driving uses Rapier-native linear/angular damping set at body spawn —
 * no per-frame planar impulses here. Manual X/Z damping impulses fight the trimesh
 * contact solver and cause micro-hopping on the flat floor.
 *
 * Center-hole logic runs only when the cart is near the hole: low friction when the
 * footprint overhangs the open hole so the cart slides off and falls through cleanly.
 *
 * @param {object} cart Cart entity with Rapier body/collider.
 * @param {number} _dtFixed Fixed physics timestep in seconds (reserved for future hole assist).
 */
export function applyEnvironmentResponse(cart, _dtFixed) {
  if (!cart?.body || cart.respawnAtMs != null || !cart.collider) return;

  const pos = cart.body.translation();
  const collider = cart.collider;

  const innerR = CONFIG.record.innerRadius;
  const holeClearance =
    CONFIG.record.physics?.holeClearance ??
    CONFIG.record.physics?.chamferWidth ??
    1.05;
  const floorInnerR = innerR + holeClearance;

  const posX = pos.x;
  const posZ = pos.z;
  const distanceFromCenter = Math.hypot(posX, posZ);

  // * Dead center: already over the open hole — low grip so the cart can fall through.
  if (distanceFromCenter < 1e-3) {
    collider.setFriction(CONFIG.record.holeAssist?.lowFriction ?? 0);
    return;
  }

  const hx = CONFIG.cart.size.x / 2;
  const hz = CONFIG.cart.size.z / 2;
  const maxReach = hx + hz;

  // * Fully on the flat record: normal grip, no special handling. Linear/angular damping
  // * stay at spawn-time Rapier values — do not zero damping or apply planar impulses.
  if (distanceFromCenter - maxReach >= floorInnerR) {
    collider.setFriction(CONFIG.cart.friction);
    return;
  }

  // --- Near center hole: only adjust friction when the footprint overhangs the hole ---
  const dirX = posX / distanceFromCenter;
  const dirZ = posZ / distanceFromCenter;

  setPlanarBasisFromRotation(cart.body.rotation(), _forward, _right);

  const radialReach =
    Math.abs(hx * (_right.x * dirX + _right.z * dirZ)) +
    Math.abs(hz * (_forward.x * dirX + _forward.z * dirZ));
  const nearestEdge = distanceFromCenter - radialReach;

  const overhangingHole = nearestEdge < floorInnerR;
  collider.setFriction(
    overhangingHole
      ? CONFIG.record.holeAssist?.lowFriction ?? 0
      : CONFIG.cart.friction,
  );
}

/**
 * @param {number} nowMs
 */
export function applyArcadeControls(cart, axis, dtFixed, nowMs) {
  const pos = cart.body.translation();
  const rot = cart.body.rotation();
  const linvel = cart.body.linvel();
  const mass = getBodyMass(cart.body);

  // Cheap ground check: if vertical velocity is near zero and the cart isn't
  // well below the arena, treat as grounded. Works on booths and arena alike.
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

  const grip =
    axis.turn !== 0
      ? CONFIG.driving.lateralGrip * CONFIG.driving.driftGripFactor
      : CONFIG.driving.lateralGrip;
  const dvRight = (-vRight) * grip * dtFixed;
  const gripImpulse = right.clone().multiplyScalar(mass * dvRight);
  cart.body.applyImpulse(vec3ToRapier(gripImpulse), true);

  if (axis.forward !== 0) {
    const rb = CONFIG.cart.ramBoost;
    const nitroForward =
      rb.enabled && nowMs <= cart.ramBoostActiveUntilMs && axis.forward > 0;
    let targetSpeed =
      axis.forward > 0 ? CONFIG.driving.maxSpeed : -CONFIG.driving.reverseMaxSpeed;
    if (nitroForward) {
      targetSpeed = CONFIG.driving.maxSpeed * 1.2;
    }
    const accelRate =
      nitroForward && rb.boostedAccel != null ? rb.boostedAccel : CONFIG.driving.accel;
    const speedError = targetSpeed - vForward;
    const maxDeltaV = accelRate * controlFactor * dtFixed;
    const dvForward = Math.max(-maxDeltaV, Math.min(maxDeltaV, speedError));
    if (Math.abs(dvForward) > 1e-4) {
      const driveImpulse = forward.clone().multiplyScalar(mass * dvForward);
      cart.body.applyImpulse(vec3ToRapier(driveImpulse), true);
    }
  }

  if (axis.turn !== 0) {
    const av = cart.body.angvel();
    const desiredYawRate = axis.turn * CONFIG.driving.tankYawRate * controlFactor;
    const yawError = desiredYawRate - av.y;
    const torqueImpulseY = yawError * CONFIG.driving.yawResponsiveness * mass * dtFixed;
    cart.body.applyTorqueImpulse({ x: 0, y: torqueImpulseY, z: 0 }, true);

    const speedForDrift = Math.abs(vForward);
    if (speedForDrift > 0.25) {
      const driftDir = right.clone().multiplyScalar(axis.turn * Math.sign(vForward || 1));
      const driftMag =
        speedForDrift *
        CONFIG.driving.driftImpulseStrength *
        controlFactor *
        mass *
        dtFixed;
      cart.body.applyImpulse(vec3ToRapier(driftDir.multiplyScalar(driftMag)), true);
    }
  }

  applyEnvironmentResponse(cart, dtFixed);

  // Temporarily disabled for testing — restore later
  /*
  const av = cart.body.angvel();
  const maxPitchRoll = 3.2;
  if (Math.abs(av.x) > maxPitchRoll || Math.abs(av.z) > maxPitchRoll) {
    cart.body.setAngvel({
      x: clamp(av.x, -maxPitchRoll, maxPitchRoll),
      y: av.y,
      z: clamp(av.z, -maxPitchRoll, maxPitchRoll),
    }, true);
  }
  */
}

/**
 * * Returns a ramming qualification score for rammer → victim, or 0 if the hit does not qualify.
 */
function getRammingQualificationScore(rammer, victim) {
  const rv = rammer.body.linvel();
  const speed = planarSpeed(rv);
  if (speed < CONFIG.ramming.minSpeed) return 0;

  _planarDir.set(rv.x, 0, rv.z);
  const dirLen = _planarDir.length();
  if (dirLen <= 1e-6) return 0;
  _planarDir.multiplyScalar(1 / dirLen);

  const vv = victim.body.linvel();
  const closingSpeed = Math.max(speed, speed + (-(vv.x * _planarDir.x + vv.z * _planarDir.z)));

  const rp = rammer.body.translation();
  const vp = victim.body.translation();
  _toVictim.set(vp.x - rp.x, 0, vp.z - rp.z);
  if (_toVictim.lengthSq() < 1e-6) return 0;
  _toVictim.normalize();

  if (_planarDir.dot(_toVictim) < CONFIG.ramming.alignmentDotMin) return 0;

  return closingSpeed;
}

/**
 * * Picks the dominant rammer/victim pair for a cart-on-cart collision.
 */
function resolveCartRamCollision(c1, c2) {
  const score1 = getRammingQualificationScore(c1, c2);
  const score2 = getRammingQualificationScore(c2, c1);
  if (score1 <= 0 && score2 <= 0) return null;
  if (score1 >= score2) return { rammer: c1, victim: c2 };
  return { rammer: c2, victim: c1 };
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
 * @param {object[]|null} allCarts All cart entities in slot order (legacy param, unused for slot lookup).
 */
export function applyRammingImpulse(rammer, victim, playCollisionRef, spawnTrashBurstRef, isHost, partySocket, allCarts) {
  const rv = rammer.body.linvel();
  const speed = planarSpeed(rv);
  if (speed < CONFIG.ramming.minSpeed) return;

  _planarDir.set(rv.x, 0, rv.z);
  const dirLen = _planarDir.length();
  if (dirLen <= 1e-6) return;
  _planarDir.multiplyScalar(1 / dirLen);

  const vv = victim.body.linvel();
  const closingSpeed = Math.max(speed, speed + (-(vv.x * _planarDir.x + vv.z * _planarDir.z)));

  const rp = rammer.body.translation();
  const vp = victim.body.translation();
  _toVictim.set(vp.x - rp.x, 0, vp.z - rp.z);
  if (_toVictim.lengthSq() < 1e-6) return;
  _toVictim.normalize();

  if (_planarDir.dot(_toVictim) < CONFIG.ramming.alignmentDotMin) return;

  const impulseMagBase = Math.max(
    0,
    Math.min(
      CONFIG.ramming.strength * closingSpeed * getBodyMass(victim.body),
      CONFIG.ramming.maxImpulse
    )
  );
  const isRammerBoosting = performance.now() <= (rammer.ramBoostActiveUntilMs || 0);
  const impulseMag = isRammerBoosting ? impulseMagBase * 2 : impulseMagBase;

  const impulse = { x: _planarDir.x * impulseMag, y: 0, z: _planarDir.z * impulseMag };

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
  const ramTimeMs = performance.now();
  if (!victim.pendingRam) {
    victim.pendingRam = { impulse, remainingSteps: steps };
  } else {
    victim.pendingRam.impulse.x += impulse.x;
    victim.pendingRam.impulse.y += impulse.y;
    victim.pendingRam.impulse.z += impulse.z;
    victim.pendingRam.remainingSteps = Math.max(victim.pendingRam.remainingSteps, steps);
  }
  victim.lastRamTimeMs = ramTimeMs;
  rammer.lastRamTimeMs = ramTimeMs;

  // Stage A: record last hit for scoring attribution (host only).
  if (isHost) {
    const attackerSlotIndex = rammer.slotIndex;
    const victimSlotIndex = victim.slotIndex;
    if (attackerSlotIndex >= 0 && victimSlotIndex >= 0) {
      const nowPerf = performance.now();
      const wasCritical = nowPerf <= (rammer.ramBoostActiveUntilMs || 0);
      GameState.recordHit(victimSlotIndex, attackerSlotIndex, wasCritical);
    }
  }

  // Host collision event broadcast
  if (isHost && partySocket) {
    const slotA = rammer.slotIndex;
    const slotB = victim.slotIndex;
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

const _aiToTarget = new THREE.Vector3();

const AI_CAUTIOUS_MS = 8000;

/**
 * * True during the first 8s of a round or while any human is still on a spawn booth.
 */
function isAiCautiousPhase(nowMs, allCarts, netSlots) {
  const round = GameState.getRoundState();
  if (round.phase !== "running" || !round.startedAtMs) return true;
  if (nowMs - round.startedAtMs < AI_CAUTIOUS_MS) return true;

  const boothMinR = CONFIG.record.radius * 0.82;
  for (let i = 0; i < (netSlots?.length ?? 0); i += 1) {
    const s = netSlots[i];
    if (!s || s.kind !== "human" || !s.connId) continue;
    const cart = allCarts?.[i];
    if (!cart?.body) continue;
    const pos = cart.body.translation();
    const dist = Math.hypot(pos.x, pos.z);
    if (pos.y > CONFIG.record.y + 2.5 || dist > boothMinR) return true;
  }
  return false;
}

/**
 * * Clamps a target point into a safe annulus — tighter band during cautious phase.
 */
function clampAiTargetAwayFromHazards(x, z, cautious) {
  const dist = Math.hypot(x, z);
  let angle = dist > 1e-3 ? Math.atan2(z, x) : Math.random() * Math.PI * 2;
  const innerLimit = cautious
    ? CONFIG.record.innerRadius * 2.2
    : CONFIG.record.innerRadius * 1.8;
  const outerLimit = cautious
    ? CONFIG.record.radius * 0.72
    : CONFIG.record.radius * 0.88;
  const r = clamp(dist, innerLimit, outerLimit);
  return { x: Math.cos(angle) * r, z: Math.sin(angle) * r };
}

function findNearestHumanTarget(fromPos, allCarts, netSlots) {
  let nearestPos = null;
  let nearestD2 = Infinity;
  for (let i = 0; i < (allCarts?.length ?? 0); i += 1) {
    const s = netSlots?.[i];
    if (!s || s.kind !== "human" || !s.connId) continue;
    const cart = allCarts[i];
    if (!cart?.body) continue;
    const hp = cart.body.translation();
    const dx = hp.x - fromPos.x;
    const dz = hp.z - fromPos.z;
    const d2 = dx * dx + dz * dz;
    if (d2 < nearestD2) {
      nearestD2 = d2;
      nearestPos = hp;
    }
  }
  if (!nearestPos) return null;
  const jitter = 1.8;
  return {
    x: nearestPos.x + (Math.random() - 0.5) * jitter,
    z: nearestPos.z + (Math.random() - 0.5) * jitter,
  };
}

function pickAiPatrolTarget() {
  const angle = Math.random() * Math.PI * 2;
  const r = CONFIG.record.radius * (0.68 + Math.random() * 0.14);
  return clampAiTargetAwayFromHazards(Math.cos(angle) * r, Math.sin(angle) * r, false);
}

/**
 * Picks a world-space XZ target for one NPC cart.
 *
 * @param {{ x: number, y: number, z: number }} fromPos Current cart position.
 * @param {object[]|null} allCarts All slot carts.
 * @param {object[]|null} netSlots Network slot metadata.
 * @param {number} nowMs Current time in milliseconds.
 * @returns {{ x: number, z: number }}
 */
export function pickAiTarget(fromPos, allCarts, netSlots, nowMs) {
  const cautious = isAiCautiousPhase(nowMs, allCarts, netSlots);
  const dist = Math.hypot(fromPos.x, fromPos.z);

  // * Prefer humans when available.
  if (Math.random() < 0.72) {
    const humanTarget = findNearestHumanTarget(fromPos, allCarts, netSlots);
    if (humanTarget) {
      return clampAiTargetAwayFromHazards(humanTarget.x, humanTarget.z, cautious);
    }
  }

  // * Occasional outer-ring patrol.
  const patrolChance = cautious ? 0.1 : 0.25;
  if (Math.random() < patrolChance) {
    return pickAiPatrolTarget();
  }

  if (cautious) {
    const minR = CONFIG.record.innerRadius * 2.5;
    const maxR = CONFIG.record.radius * 0.65;
    const r = minR + Math.sqrt(Math.random()) * (maxR - minR);
    const angle = Math.random() * Math.PI * 2;
    return clampAiTargetAwayFromHazards(Math.cos(angle) * r, Math.sin(angle) * r, true);
  }

  const edgeBiasStart = CONFIG.record.radius * 0.78;
  if (dist > edgeBiasStart) {
    const angle = Math.random() * Math.PI * 2;
    const r = CONFIG.record.radius * 0.45;
    return clampAiTargetAwayFromHazards(Math.cos(angle) * r, Math.sin(angle) * r, false);
  }

  const minR = CONFIG.record.innerRadius * 2.0;
  const maxR = CONFIG.record.radius * 0.85;
  const r = minR + Math.sqrt(Math.random()) * (maxR - minR);
  const angle = Math.random() * Math.PI * 2;
  return clampAiTargetAwayFromHazards(Math.cos(angle) * r, Math.sin(angle) * r, false);
}

/**
 * Computes tank-steer input for one NPC cart toward its current AI target.
 *
 * @param {number} now Current time in milliseconds.
 * @param {{ body: object, aiNextDecisionMs: number, aiTarget: { x: number, z: number } }} cart
 * @param {object[]|null} allCarts All slot carts.
 * @param {object[]|null} netSlots Network slot metadata.
 * @returns {{ forward: number, turn: number }}
 */
export function getAiAxis(now, cart, allCarts, netSlots) {
  const p = cart.body.translation();
  if (now >= cart.aiNextDecisionMs) {
    cart.aiTarget = pickAiTarget(p, allCarts, netSlots, now);
    cart.aiNextDecisionMs = now + (900 + Math.random() * 1100);
  }

  const toTarget = _aiToTarget.set(cart.aiTarget.x - p.x, 0, cart.aiTarget.z - p.z);
  if (toTarget.lengthSq() < 0.25) {
    cart.aiTarget = pickAiTarget(p, allCarts, netSlots, now);
    cart.aiNextDecisionMs = now + (900 + Math.random() * 1100);
    toTarget.set(cart.aiTarget.x - p.x, 0, cart.aiTarget.z - p.z);
  }
  toTarget.normalize();

  const desiredYaw = Math.atan2(-toTarget.x, -toTarget.z);
  const currentYaw = yawFromQuaternion(cart.body.rotation());
  const yawDiff = wrapAngleRad(desiredYaw - currentYaw);

  const turn = clamp(yawDiff * 1.45, -1, 1);
  const forward = Math.abs(yawDiff) > 2.4 ? -0.35 : 1;
  return { forward, turn };
}

// Note: roundPhase is intentionally left as external reference for now
// (will be cleaned when gameState.js is extracted)
export function setRoundPhase(phase) {
  GameState.setRoundPhase(phase);
}

function classifyEnvironmentCollision(otherHandle, callbacks) {
  if (otherHandle === callbacks.recordColliderHandle) return "floor";
  if (otherHandle === callbacks.pitWallColliderHandle) return "edge";
  if (callbacks.boothColliderHandles?.includes(otherHandle)) return "edge";
  return "floor";
}

function getEnvironmentImpact(cart, envType, impacts) {
  const lv = cart.body.linvel();
  const pre = cart.preStepLinvel || lv;

  if (envType === "floor") {
    const fallSpeed = -pre.y;
    if (fallSpeed <= impacts.floorFallSpeedThreshold) return null;
    return Math.min(1.0, (fallSpeed - impacts.floorFallSpeedThreshold) / impacts.intensityRange);
  }

  const dvX = lv.x - pre.x;
  const dvZ = lv.z - pre.z;
  const dvXZ = Math.hypot(dvX, dvZ);
  if (dvXZ <= impacts.edgeDeltaVThreshold) return null;
  return Math.min(1.0, (dvXZ - impacts.edgeDeltaVThreshold) / impacts.intensityRange);
}

function getEnvironmentContactPosition(cart, envType, impacts) {
  const rp = cart.body.translation();
  const contactPos = { x: rp.x, y: rp.y + impacts.contactYOffset, z: rp.z };

  if (envType !== "edge") return contactPos;

  const pitInnerRadius =
    (CONFIG.record.radius + impacts.pitRadiusOffset) * impacts.pitRadiusScale;
  const dist = Math.hypot(rp.x, rp.z);
  if (dist <= 1e-3) return contactPos;

  return {
    x: rp.x * (pitInnerRadius / dist),
    y: rp.y,
    z: rp.z * (pitInnerRadius / dist),
  };
}

function processCollisionEvents(world, eventQueue, allCarts, callbacks, isHost) {
  _colliderMap.clear();
  for (const c of allCarts || []) {
    if (c && c.collider) {
      _colliderMap.set(c.collider.handle, c);
    }
  }

  const impacts = CONFIG.environmentImpacts;

  eventQueue.drainCollisionEvents((h1, h2, started) => {
    if (!started) return;
    const c1 = _colliderMap.get(h1);
    const c2 = _colliderMap.get(h2);

    if (c1 && c2) {
      if (c1 !== c2) {
        const ram = resolveCartRamCollision(c1, c2);
        if (ram) {
          applyRammingImpulse(
            ram.rammer,
            ram.victim,
            callbacks.playCollision,
            callbacks.spawnTrashBurst,
            isHost,
            callbacks.partySocket,
            allCarts,
          );
        }
      }
    } else if (c1 || c2) {
      const cart = c1 || c2;
      const otherHandle = c1 ? h2 : h1;
      const envType = classifyEnvironmentCollision(otherHandle, callbacks);
      const intensity = getEnvironmentImpact(cart, envType, impacts);
      if (intensity == null || intensity <= impacts.minIntensity) return;

      const contactPos = getEnvironmentContactPosition(cart, envType, impacts);

      if (envType === "floor") {
        if (callbacks.playFloorImpact) callbacks.playFloorImpact(intensity);
        if (callbacks.spawnTrashBurst) callbacks.spawnTrashBurst(contactPos, intensity, "floor");
      } else {
        if (callbacks.playEdgeImpact) callbacks.playEdgeImpact(intensity);
        if (callbacks.spawnTrashBurst) callbacks.spawnTrashBurst(contactPos, intensity, "edge");
      }

      if (isHost && callbacks.partySocket) {
        const slotIndex = cart.slotIndex;
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
