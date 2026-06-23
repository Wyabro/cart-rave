// simulation.js — core physics + arcade driving simulation (extracted)

import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
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
 * * Inner radius of the flat physics playing surface (matches arena `playInnerR`).
 * * Visual hole stays at `CONFIG.record.innerRadius`; physics adds `holeClearance`.
 */
function getRecordFloorInnerR() {
  const innerR = CONFIG.record.innerRadius;
  const holeClearance =
    CONFIG.record.physics?.holeClearance ??
    CONFIG.record.physics?.chamferWidth ??
    0.45;
  return innerR + holeClearance;
}

/**
 * * Overhang state for center-hole response. Uses oriented footprint projection so tipped
 * * carts (V1 pitch/roll) trigger low-friction + assist only when an edge crosses the lip.
 *
 * @returns {{
 *   floorInnerR: number,
 *   overhanging: boolean,
 *   nearestEdge: number,
 *   commit: number,
 *   dirX: number,
 *   dirZ: number,
 * }}
 */
function getCenterHoleOverhangState(cart, pos) {
  const floorInnerR = getRecordFloorInnerR();
  const posX = pos.x;
  const posZ = pos.z;
  const distanceFromCenter = Math.hypot(posX, posZ);

  const hx = CONFIG.cart.size.x / 2;
  const hz = CONFIG.cart.size.z / 2;
  const maxReach = hx + hz;

  if (distanceFromCenter - maxReach >= floorInnerR) {
    return {
      floorInnerR,
      overhanging: false,
      nearestEdge: distanceFromCenter - maxReach,
      commit: 0,
      dirX: 0,
      dirZ: 0,
    };
  }

  const assistBand = CONFIG.record.holeAssist?.lowFrictionBandM ?? 1.5;

  // * Dead center: fully over the open hole — full assist, no radial unstick.
  if (distanceFromCenter < 1e-3) {
    return {
      floorInnerR,
      overhanging: true,
      nearestEdge: 0,
      commit: 1,
      dirX: 0,
      dirZ: 0,
    };
  }

  const dirX = posX / distanceFromCenter;
  const dirZ = posZ / distanceFromCenter;

  setPlanarBasisFromRotation(cart.body.rotation(), _forward, _right);
  const radialReach =
    Math.abs(hx * (_right.x * dirX + _right.z * dirZ)) +
    Math.abs(hz * (_forward.x * dirX + _forward.z * dirZ));
  const nearestEdge = distanceFromCenter - radialReach;
  const overhanging = nearestEdge < floorInnerR;
  const commit = overhanging
    ? Math.max(0, Math.min(1, (floorInnerR - nearestEdge) / Math.max(assistBand, 1e-3)))
    : 0;

  return { floorInnerR, overhanging, nearestEdge, commit, dirX, dirZ };
}

/**
 * Applies continuous arena contact response for one cart.
 *
 * Flat record driving uses Rapier-native linear/angular damping set at body spawn —
 * no per-frame planar impulses on the open floor. Manual X/Z damping impulses fight the
 * trimesh contact solver and cause micro-hopping.
 *
 * Center-hole: once the oriented footprint overhangs the physics lip (`playInnerR` in
 * `buildRecordPhysicsGeometry`), friction drops to `holeAssist.lowFriction` and a gentle
 * inward + downward assist (ramped by overhang depth) helps the cart slide off the chamfer
 * and tumble through. Carts fully on the flat annulus keep normal grip and receive no assist.
 * Fall scoring still happens via `CONFIG.fall.yThreshold` in gameFlow.
 *
 * @param {object} cart Cart entity with Rapier body/collider.
 * @param {number} dtFixed Fixed physics timestep in seconds (drives hole assist impulses).
 */
export function applyEnvironmentResponse(cart, dtFixed) {
  if (!cart?.body || cart.respawnAtMs != null || !cart.collider) return;

  // * Levels without a central hole (Backrooms Supermarket) disable the origin
  // * suck/assist so carts keep normal grip on the solid arena center.
  if (CONFIG.record.centerHole && CONFIG.record.centerHole.enabled === false) {
    cart.collider.setFriction(CONFIG.cart.friction);
    return;
  }

  const pos = cart.body.translation();
  const collider = cart.collider;
  const { overhanging, commit, dirX, dirZ } = getCenterHoleOverhangState(cart, pos);

  if (!overhanging) {
    collider.setFriction(CONFIG.cart.friction);
    return;
  }

  collider.setFriction(CONFIG.record.holeAssist?.lowFriction ?? 0);
  cart.body.wakeUp();

  if (!dtFixed || dtFixed <= 0) return;

  const mass = getBodyMass(cart.body);
  const downAccel =
    (CONFIG.record.holeAssist?.approachDownAccel ?? 5.0) +
    (CONFIG.record.holeAssist?.fallThroughAccel ?? 16.0) * commit;
  const inAccel = (CONFIG.record.holeAssist?.unstickAccel ?? 32.0) * 0.3 * commit;

  cart.body.applyImpulse(
    {
      x: dirX ? -dirX * inAccel * mass * dtFixed : 0,
      y: -downAccel * mass * dtFixed,
      z: dirZ ? -dirZ * inAccel * mass * dtFixed : 0,
    },
    true,
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

  const rb = CONFIG.cart.ramBoost;
  const nitroActive = rb.enabled && nowMs <= cart.ramBoostActiveUntilMs;
  const nitroForward = nitroActive && axis.forward > 0;

  let grip =
    axis.turn !== 0
      ? CONFIG.driving.lateralGrip * CONFIG.driving.driftGripFactor
      : CONFIG.driving.lateralGrip;
  if (nitroForward && rb.nitroGripFactor != null) {
    grip *= rb.nitroGripFactor;
  }
  const dvRight = (-vRight) * grip * dtFixed;
  const gripImpulse = right.clone().multiplyScalar(mass * dvRight);
  cart.body.applyImpulse(vec3ToRapier(gripImpulse), true);

  if (axis.forward !== 0) {
    let targetSpeed =
      axis.forward > 0 ? CONFIG.driving.maxSpeed : -CONFIG.driving.reverseMaxSpeed;
    if (nitroForward) {
      targetSpeed = rb.boostedMaxSpeed ?? CONFIG.driving.maxSpeed * 1.2;
    }
    let accelRate = nitroForward
      ? (rb.boostedAccel ?? CONFIG.driving.accel * (CONFIG.ramming.nitroAccelMultiplier ?? 1.6))
      : CONFIG.driving.accel;
    if (nitroForward && rb.launchAccelMul != null && rb.launchWindowSec > 0) {
      const nitroElapsedSec = Math.max(
        0,
        (rb.durationSec * 1000 - (cart.ramBoostActiveUntilMs - nowMs)) / 1000
      );
      if (nitroElapsedSec < rb.launchWindowSec) {
        accelRate *= rb.launchAccelMul;
      }
    }
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
      const driftMul = nitroActive && rb.nitroDriftMul != null ? rb.nitroDriftMul : 1;
      const driftMag =
        speedForDrift *
        CONFIG.driving.driftImpulseStrength *
        driftMul *
        controlFactor *
        mass *
        dtFixed;
      cart.body.applyImpulse(vec3ToRapier(driftDir.multiplyScalar(driftMag)), true);
    }
  }

  applyEnvironmentResponse(cart, dtFixed);

  // * Pitch/roll angular clamp intentionally off — V1 tipping must stay free near the hole lip.
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
 * @param {object} callbacks Injected helpers (FX, local cart, host broadcast).
 * @param {boolean} isHost Whether this client is the room host.
 */
export function applyRammingImpulse(rammer, victim, callbacks, isHost) {
  const playCollisionRef = callbacks?.playCollision;
  const spawnTrashBurstRef = callbacks?.spawnTrashBurst;
  const partySocket = callbacks?.partySocket;
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
  const boostMul = CONFIG.ramming.boostImpulseMultiplier ?? 2;
  const impulseMag = isRammerBoosting ? impulseMagBase * boostMul : impulseMagBase;
  const fxIntensity = Math.min(impulseMag / CONFIG.ramming.maxImpulse, 1.35);
  const fxOpts = { isBoosting: isRammerBoosting };

  const impulse = { x: _planarDir.x * impulseMag, y: 0, z: _planarDir.z * impulseMag };

  // * Host plays FX locally; non-host replays the same events from host_event_collision
  // * so prediction physics does not double-spawn bright particles (extra bloom).
  if (isHost) {
    if (playCollisionRef) {
      playCollisionRef(fxIntensity, fxOpts);
    }
    if (spawnTrashBurstRef && GameState.getRoundState().phase === "running") {
      const midpoint = { x: (rp.x + vp.x) / 2, y: (rp.y + vp.y) / 2, z: (rp.z + vp.z) / 2 };
      spawnTrashBurstRef(midpoint, fxIntensity, "cart", fxOpts);
    }
    if (callbacks?.onLocalRamImpact && callbacks.localCart === rammer) {
      callbacks.onLocalRamImpact(fxIntensity, isRammerBoosting);
    }
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
        rammerSlot: rammer.slotIndex,
        isBoosting: isRammerBoosting,
        intensity: fxIntensity,
        midpoint: { x: (rp.x + vp.x) / 2, y: (rp.y + vp.y) / 2, z: (rp.z + vp.z) / 2 },
      }));
    }
  }
}

const _aiToTarget = new THREE.Vector3();

const AI_CAUTIOUS_MS = 8000;

/**
 * Active-level hazard descriptor for NPC AI avoidance. `null` = Classic Record's circular
 * model (center hole + outer rim), handled entirely by the annulus clamp. When set (e.g. the
 * Backrooms level), NPCs additionally avoid the listed axis-aligned square voids.
 *
 * @type {{
 *   squareHoles: { x: number, z: number }[],
 *   half: number,
 *   avoidMargin: number,
 *   influenceBand: number,
 * } | null}
 */
let _levelHazards = null;

/**
 * Registers the active level's NPC hazard model. Pass `null` (or a level with no special
 * hazards) to restore the default circular Classic Record behavior.
 *
 * @param {typeof _levelHazards} hazards
 */
export function setLevelHazards(hazards) {
  _levelHazards =
    hazards && Array.isArray(hazards.squareHoles) && hazards.squareHoles.length > 0
      ? hazards
      : null;
}

/**
 * Pushes an XZ point out of every square-void avoidance box (Chebyshev metric), nudging it
 * along its axis of least penetration. Two passes settle points near a box corner.
 *
 * @param {number} x
 * @param {number} z
 * @param {number} [extraMargin] Additional safety buffer (meters) added during cautious phase.
 * @returns {{ x: number, z: number }}
 */
function pushPointOutOfSquareHoles(x, z, extraMargin = 0) {
  const holes = _levelHazards.squareHoles;
  const need = _levelHazards.half + _levelHazards.avoidMargin + extraMargin;
  let px = x;
  let pz = z;
  for (let pass = 0; pass < 2; pass += 1) {
    for (let i = 0; i < holes.length; i += 1) {
      const dx = px - holes[i].x;
      const dz = pz - holes[i].z;
      const ax = Math.abs(dx);
      const az = Math.abs(dz);
      if (ax < need && az < need) {
        if (need - ax <= need - az) px = holes[i].x + (dx >= 0 ? need : -need);
        else pz = holes[i].z + (dz >= 0 ? need : -need);
      }
    }
  }
  return { x: px, z: pz };
}

/**
 * Blends a repulsion away from nearby square voids into an NPC's heading direction so it
 * steers around the holes instead of driving straight in. Mutates and re-normalizes `dir`.
 *
 * @param {number} px Cart world X.
 * @param {number} pz Cart world Z.
 * @param {THREE.Vector3} dir Normalized planar heading (modified in place).
 */
function applySquareHoleAvoidance(px, pz, dir) {
  const holes = _levelHazards.squareHoles;
  const edge = _levelHazards.half + _levelHazards.avoidMargin;
  const band = _levelHazards.influenceBand;
  let rx = 0;
  let rz = 0;
  for (let i = 0; i < holes.length; i += 1) {
    const dx = px - holes[i].x;
    const dz = pz - holes[i].z;
    const cheb = Math.max(Math.abs(dx), Math.abs(dz));
    if (cheb >= edge + band) continue;
    const strength = clamp((edge + band - cheb) / band, 0, 2.2);
    const len = Math.hypot(dx, dz) || 1;
    rx += (dx / len) * strength;
    rz += (dz / len) * strength;
  }
  if (rx === 0 && rz === 0) return;
  const GAIN = 1.4;
  dir.x += rx * GAIN;
  dir.z += rz * GAIN;
  if (dir.lengthSq() < 1e-6) dir.set(rx, 0, rz);
  dir.normalize();
}

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
  let outX = Math.cos(angle) * r;
  let outZ = Math.sin(angle) * r;
  // * Square-void levels (Backrooms): also keep the target clear of the corner holes.
  if (_levelHazards) {
    const pushed = pushPointOutOfSquareHoles(outX, outZ, cautious ? 1.0 : 0.4);
    outX = pushed.x;
    outZ = pushed.z;
  }
  return { x: outX, z: outZ };
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

function pickAiPatrolTarget(cautious = false) {
  const angle = Math.random() * Math.PI * 2;
  const r = CONFIG.record.radius * (
    cautious
      ? 0.58 + Math.random() * 0.12
      : 0.68 + Math.random() * 0.14
  );
  return clampAiTargetAwayFromHazards(Math.cos(angle) * r, Math.sin(angle) * r, cautious);
}

function pickAiRandomWanderTarget(fromPos, cautious) {
  if (cautious) {
    const minR = CONFIG.record.innerRadius * 2.5;
    const maxR = CONFIG.record.radius * 0.65;
    const r = minR + Math.sqrt(Math.random()) * (maxR - minR);
    const angle = Math.random() * Math.PI * 2;
    return clampAiTargetAwayFromHazards(Math.cos(angle) * r, Math.sin(angle) * r, true);
  }

  const dist = Math.hypot(fromPos.x, fromPos.z);
  const edgeBiasStart = CONFIG.record.radius * 0.78;
  if (dist > edgeBiasStart) {
    const angle = Math.random() * Math.PI * 2;
    const r = CONFIG.record.radius * (0.38 + Math.random() * 0.22);
    return clampAiTargetAwayFromHazards(Math.cos(angle) * r, Math.sin(angle) * r, false);
  }

  const minR = CONFIG.record.innerRadius * 2.0;
  const maxR = CONFIG.record.radius * 0.85;
  const r = minR + Math.sqrt(Math.random()) * (maxR - minR);
  const angle = Math.random() * Math.PI * 2;
  return clampAiTargetAwayFromHazards(Math.cos(angle) * r, Math.sin(angle) * r, false);
}

/**
 * @param {object} cart
 */
function ensureAiBehaviorState(cart) {
  if (cart.aiPauseUntilMs == null) cart.aiPauseUntilMs = 0;
  if (cart.aiReverseUntilMs == null) cart.aiReverseUntilMs = 0;
  if (cart.aiSteerGain == null) cart.aiSteerGain = 1.1;
  if (cart.aiLastProgressMs == null) cart.aiLastProgressMs = 0;
  if (cart.aiLastDistToTarget == null) cart.aiLastDistToTarget = Infinity;
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
  const humanTarget = findNearestHumanTarget(fromPos, allCarts, netSlots);
  const roll = Math.random();

  // * Weighted mix: humans, outer-ring patrol, random wander.
  const humanWeight = cautious ? 0.38 : 0.42;
  const patrolWeight = cautious ? 0.18 : 0.30;

  if (roll < humanWeight && humanTarget) {
    return clampAiTargetAwayFromHazards(humanTarget.x, humanTarget.z, cautious);
  }
  if (roll < humanWeight + patrolWeight) {
    return pickAiPatrolTarget(cautious);
  }
  return pickAiRandomWanderTarget(fromPos, cautious);
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
  ensureAiBehaviorState(cart);

  if (now < cart.aiPauseUntilMs) {
    const idleWobble = Math.sin(now * 0.002 + (cart.slotIndex || 0)) * 0.12;
    return { forward: 0, turn: clamp(idleWobble, -0.18, 0.18) };
  }

  const p = cart.body.translation();
  if (now >= cart.aiNextDecisionMs) {
    cart.aiTarget = pickAiTarget(p, allCarts, netSlots, now);
    cart.aiNextDecisionMs = now + (800 + Math.random() * 1200);
    cart.aiSteerGain = 1.0 + Math.random() * 0.5;
    cart.aiLastProgressMs = now;
    cart.aiLastDistToTarget = Infinity;

    // * Random short stop to break up constant circling.
    if (Math.random() < 0.14) {
      cart.aiPauseUntilMs = now + (500 + Math.random() * 1000);
      return { forward: 0, turn: 0 };
    }
  }

  const toTarget = _aiToTarget.set(cart.aiTarget.x - p.x, 0, cart.aiTarget.z - p.z);
  const distToTarget = Math.sqrt(toTarget.lengthSq());

  if (distToTarget < 0.5) {
    cart.aiTarget = pickAiTarget(p, allCarts, netSlots, now);
    cart.aiNextDecisionMs = now + (800 + Math.random() * 1200);
    cart.aiLastProgressMs = now;
    toTarget.set(cart.aiTarget.x - p.x, 0, cart.aiTarget.z - p.z);
  }

  const lv = cart.body.linvel();
  const speed = Math.hypot(lv.x, lv.z);
  if (distToTarget < cart.aiLastDistToTarget - 0.35) {
    cart.aiLastProgressMs = now;
  }
  cart.aiLastDistToTarget = distToTarget;

  const stuckForMs = now - cart.aiLastProgressMs;
  const isStuck = speed < 1.4 && stuckForMs > 1100 && distToTarget > 2.0;
  const isClose = distToTarget < 2.8;

  if (now >= cart.aiReverseUntilMs && (isStuck || isClose)) {
    const reverseChance = isStuck ? 0.2 : 0.12;
    if (Math.random() < reverseChance) {
      cart.aiReverseUntilMs = now + (450 + Math.random() * 650);
      cart.aiTarget = pickAiTarget(p, allCarts, netSlots, now);
      toTarget.set(cart.aiTarget.x - p.x, 0, cart.aiTarget.z - p.z);
    }
  }

  if (toTarget.lengthSq() < 1e-6) {
    return { forward: 0, turn: 0 };
  }
  toTarget.normalize();

  // * Square-void levels (Backrooms): steer the heading away from nearby corner holes.
  if (_levelHazards) {
    applySquareHoleAvoidance(p.x, p.z, toTarget);
  }

  const desiredYaw = Math.atan2(-toTarget.x, -toTarget.z);
  const currentYaw = yawFromQuaternion(cart.body.rotation());
  const yawDiff = wrapAngleRad(desiredYaw - currentYaw);

  const slotPhase = (cart.slotIndex || 0) * 1.7;
  const steerWobble = Math.sin(now * 0.0022 + slotPhase) * 0.1;
  const turn = clamp(yawDiff * cart.aiSteerGain + steerWobble, -1, 1);

  if (now < cart.aiReverseUntilMs) {
    return {
      forward: -(0.5 + Math.random() * 0.3),
      turn,
    };
  }

  // * Gentle correction only — no constant hard reverse on wide headings.
  const forward = Math.abs(yawDiff) > 2.85 ? 0.25 : 1;
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
          applyRammingImpulse(ram.rammer, ram.victim, callbacks, isHost);
        }
      }
    } else if (c1 || c2) {
      const cart = c1 || c2;
      const otherHandle = c1 ? h2 : h1;
      const envType = classifyEnvironmentCollision(otherHandle, callbacks);
      const intensity = getEnvironmentImpact(cart, envType, impacts);
      if (intensity == null || intensity <= impacts.minIntensity) return;

      const contactPos = getEnvironmentContactPosition(cart, envType, impacts);

      if (isHost) {
        if (envType === "floor") {
          if (callbacks.playFloorImpact) callbacks.playFloorImpact(intensity);
          if (callbacks.spawnTrashBurst) callbacks.spawnTrashBurst(contactPos, intensity, "floor");
        } else {
          if (callbacks.playEdgeImpact) callbacks.playEdgeImpact(intensity);
          if (callbacks.spawnTrashBurst) callbacks.spawnTrashBurst(contactPos, intensity, "edge");
        }
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
    processCollisionEvents(world, eventQueue, allCarts, { ...callbacks, localCart }, isHost);
  }
}
