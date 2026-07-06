// simulation.js — core physics + arcade driving simulation (extracted)

import * as THREE from "three";
import { RAPIER } from "./physics/rapierInstance.js";
import { CONFIG, BASELINE_CONFIG } from "./config.js";
import * as GameState from "./gameState.js";
import { queueHostCollisionEvent } from "./hostCollisionBatch.js";
import { getNpcPersonality } from "./npcNames.js";
import { ChallengeTracker } from "./stores/challengeStore.js";
const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _quat = new THREE.Quaternion();
const _upVecScratch = new THREE.Vector3(0, 1, 0);
const _tipQuatScratch = new THREE.Quaternion();
const _toVictim = new THREE.Vector3();
const _planarDir = new THREE.Vector3();
const _colliderMap = new Map();
const _impulse = { x: 0, y: 0, z: 0 };
const _torqueImpulse = { x: 0, y: 0, z: 0 };
const _pendingRamStepImpulse = { x: 0, y: 0, z: 0 };
const _remoteAxis = { forward: 0, turn: 0, boostHeld: false };
const _collisionCallbacks = { localCart: null };
const _holeOverhangState = {
  floorInnerR: 0,
  overhanging: false,
  nearestEdge: 0,
  commit: 0,
  dirX: 0,
  dirZ: 0,
};
const _envContactPos = { x: 0, y: 0, z: 0 };

// * Per-cart physics state scratch — populated once at the top of each per-cart
// * control pass in runFixedPhysicsStep, then read by every downstream helper
// * (applyArcadeControls, applyEnvironmentResponse, AI, ramming). Rapier getters
// * like body.translation()/.linvel()/.angvel()/.rotation() allocate a fresh JS
// * object at the WASM boundary on every call; caching into these plain objects
// * collapses ~14 allocs/cart/step down to 4.
const _scratchPos = { x: 0, y: 0, z: 0 };
const _scratchRot = { x: 0, y: 0, z: 0, w: 1 };
const _scratchLinvel = { x: 0, y: 0, z: 0 };
const _scratchAngvel = { x: 0, y: 0, z: 0 };

// * Ramming pair state scratch — populated once per cart-cart collision pair in
// * processCollisionEvents, shared by qualification scoring + impulse application.
const _ramStateA = { pos: { x: 0, y: 0, z: 0 }, linvel: { x: 0, y: 0, z: 0 } };
const _ramStateB = { pos: { x: 0, y: 0, z: 0 }, linvel: { x: 0, y: 0, z: 0 } };

/**
 * * Fetches a cart body's translation/rotation/linvel/angvel ONCE into the module
 * * scratch cache. Must be called at the top of each per-cart control pass before
 * * any helper reads body state. Position/rotation/angvel stay valid for the whole
 * * pass (only world.step() mutates them); linvel is re-fetched via
 * * {@link rereadLinvelIntoScratch} after each impulse-applying sub-helper because
 * * Rapier applyImpulse immediately mutates the body's live linvel.
 *
 * @param {object | null | undefined} cart
 * @returns {void}
 */
function readBodyStateIntoScratch(cart) {
  const body = cart?.body;
  if (!body) return;
  const p = body.translation();
  _scratchPos.x = p.x;
  _scratchPos.y = p.y;
  _scratchPos.z = p.z;
  const r = body.rotation();
  _scratchRot.x = r.x;
  _scratchRot.y = r.y;
  _scratchRot.z = r.z;
  _scratchRot.w = r.w;
  const lv = body.linvel();
  _scratchLinvel.x = lv.x;
  _scratchLinvel.y = lv.y;
  _scratchLinvel.z = lv.z;
  const av = body.angvel();
  _scratchAngvel.x = av.x;
  _scratchAngvel.y = av.y;
  _scratchAngvel.z = av.z;
}

/**
 * * Fetches a cart body's translation + linvel into a ramming state buffer.
 *
 * @param {object} cart
 * @param {{ pos: { x: number, y: number, z: number }, linvel: { x: number, y: number, z: number } }} out
 * @returns {void}
 */
function readRamStateInto(cart, out) {
  const body = cart.body;
  const p = body.translation();
  out.pos.x = p.x;
  out.pos.y = p.y;
  out.pos.z = p.z;
  const lv = body.linvel();
  out.linvel.x = lv.x;
  out.linvel.y = lv.y;
  out.linvel.z = lv.z;
}

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

function vec3ToRapier(v) {
  return { x: v.x, y: v.y, z: v.z };
}

function rapierToVec3(v) {
  return new THREE.Vector3(v.x, v.y, v.z);
}

function getBodyMass(body) {
  if (body && typeof body.mass === "function") return body.mass();
  return 1;
}

function planarSpeed(v) {
  return Math.hypot(v.x, v.z);
}

function vec3PlanarDirection(v) {
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

/**
 * * Writes planar forward/right unit vectors from a yaw angle (Y-up, -Z forward at yaw 0).
 * @param {number} yaw
 * @param {THREE.Vector3} forward Out — mutated in place.
 * @param {THREE.Vector3} right Out — mutated in place.
 */
export function setForwardRightFromYaw(yaw, forward, right) {
  forward.set(-Math.sin(yaw), 0, -Math.cos(yaw));
  right.crossVectors(forward, _up).normalize();
}

/** @deprecated Prefer {@link setForwardRightFromYaw} — returns module scratch vectors. */
function getForwardRightFromYaw(yaw) {
  setForwardRightFromYaw(yaw, _forward, _right);
  return { forward: _forward, right: _right };
}

function wrapAngleRad(angle) {
  let a = angle;
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

function principalInertiaForTranslatedBox(mass, hx, hy, hz, comOffset) {
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

/**
 * @param {any} body
 * @param {any} collider
 * @param {{ label?: string, hx: number, hy: number, hz: number, colliderLocalY: number }} dims
 */
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
 * * Returns `CONFIG.record.innerRadius` directly; no longer adds `holeClearance`.
 */
function getRecordFloorInnerR() {
  return CONFIG.record.innerRadius;
}

/**
 * * Overhang state for center-hole response. Uses oriented footprint projection so tipped
 * * carts (V1 pitch/roll) trigger low-friction + assist only when an edge crosses the lip.
 *
 * @param {object} out Reused output object — mutated in place.
 */
function writeCenterHoleOverhangState(cart, pos, out) {
  const floorInnerR = getRecordFloorInnerR();
  const posX = pos.x;
  const posZ = pos.z;
  const distanceFromCenter = Math.hypot(posX, posZ);

  const hx = CONFIG.cart.size.x / 2;
  const hz = CONFIG.cart.size.z / 2;
  const maxReach = hx + hz;

  out.floorInnerR = floorInnerR;

  if (distanceFromCenter - maxReach >= floorInnerR) {
    out.overhanging = false;
    out.nearestEdge = distanceFromCenter - maxReach;
    out.commit = 0;
    out.dirX = 0;
    out.dirZ = 0;
    return out;
  }

  const assistBand = CONFIG.record.holeAssist?.lowFrictionBandM ?? 1.5;

  // * Dead center: fully over the open hole — full assist, no radial unstick.
  if (distanceFromCenter < 1e-3) {
    out.overhanging = true;
    out.nearestEdge = 0;
    out.commit = 1;
    out.dirX = 0;
    out.dirZ = 0;
    return out;
  }

  const dirX = posX / distanceFromCenter;
  const dirZ = posZ / distanceFromCenter;

  // * Use the cached rotation from the per-cart scratch (_scratchRot) instead of a fresh
  // * body.rotation() getter call. The caller (applyEnvironmentResponse) guarantees the
  // * scratch is populated for this cart and that no world.step() has run since.
  setPlanarBasisFromRotation(_scratchRot, _forward, _right);
  const radialReach =
    Math.abs(hx * (_right.x * dirX + _right.z * dirZ)) +
    Math.abs(hz * (_forward.x * dirX + _forward.z * dirZ));
  const nearestEdge = distanceFromCenter - radialReach;
  const overhanging = nearestEdge < floorInnerR;
  const commit = overhanging
    ? Math.max(0, Math.min(1, (floorInnerR - nearestEdge) / Math.max(assistBand, 1e-3)))
    : 0;

  out.overhanging = overhanging;
  out.nearestEdge = nearestEdge;
  out.commit = commit;
  out.dirX = dirX;
  out.dirZ = dirZ;
  return out;
}

/**
 * * Re-reads only linvel into the module scratch. Used between sub-helpers that apply
 * * impulses (which mutate the body's live linvel) so the next helper sees fresh velocity.
 *
 * @param {object} cart
 * @returns {void}
 */
function rereadLinvelIntoScratch(cart) {
  const lv = cart.body.linvel();
  _scratchLinvel.x = lv.x;
  _scratchLinvel.y = lv.y;
  _scratchLinvel.z = lv.z;
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
 * Reads pos/rot from the module scratch cache (populated by the caller via
 * {@link readBodyStateIntoScratch}); avoids redundant Rapier getter allocations.
 *
 * @param {object} cart Cart entity with Rapier body/collider.
 * @param {number} dtFixed Fixed physics timestep in seconds (drives hole assist impulses).
 */
function applyEnvironmentResponse(cart, dtFixed) {
  if (!cart?.body || cart.respawnAtMs != null || !cart.collider) return;

  // * Levels without a central hole (Backrooms Supermarket) disable the origin
  // * suck/assist so carts keep normal grip on the solid arena center.
  if (CONFIG.record.centerHole && CONFIG.record.centerHole.enabled === false) {
    cart.collider.setFriction(CONFIG.cart.friction);
    return;
  }

  const collider = cart.collider;
  const { overhanging, commit, dirX, dirZ } = writeCenterHoleOverhangState(
    cart,
    _scratchPos,
    _holeOverhangState,
  );

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

  _impulse.x = dirX ? -dirX * inAccel * mass * dtFixed : 0;
  _impulse.y = -downAccel * mass * dtFixed;
  _impulse.z = dirZ ? -dirZ * inAccel * mass * dtFixed : 0;
  cart.body.applyImpulse(_impulse, true);
}

/**
 * @param {number} nowMs
 * @param {object} [callbacks] Injected helpers (FX, audio, local-cart identity). Optional
 *   but required for Auto-Charge Boost auto-release FX (onBoostRelease).
 *
 * Caller invariant: {@link readBodyStateIntoScratch} has been called for `cart` so that
 * `_scratchPos`, `_scratchRot`, `_scratchLinvel`, and `_scratchAngvel` hold this cart's
 * current pose + velocities. Position/rotation/angvel stay valid for the whole pass
 * (only world.step() mutates them); linvel is re-read after each impulse-applying
 * sub-helper via {@link rereadLinvelIntoScratch} since applyImpulse mutates live linvel.
 */
function applyArcadeControls(cart, axis, dtFixed, nowMs, callbacks) {
  const pos = _scratchPos;
  const rot = _scratchRot;
  const linvel = _scratchLinvel;
  const mass = getBodyMass(cart.body);

  // * Ground authority blends continuously with vertical velocity. A binary
  // * vertVel < 2.0 check caused a twitch in control authority when bouncing;
  // * smoothstep over [1.5, 2.5] fades ground grip (1.0) into air control
  // * (airControlFactor). The yThreshold gate still drops authority fully
  // * once the cart is below the arena floor (fallen).
  const vertVel = Math.abs(linvel.y);
  const groundBlend = pos.y > CONFIG.fall.yThreshold
    ? THREE.MathUtils.smoothstep(vertVel, 1.5, 2.5)
    : 1;
  const controlFactor = THREE.MathUtils.lerp(
    1,
    CONFIG.driving.airControlFactor,
    groundBlend,
  );

  const yaw = yawFromQuaternion(rot);
  setForwardRightFromYaw(yaw, _forward, _right);

  const vForward = _forward.x * linvel.x + _forward.y * linvel.y + _forward.z * linvel.z;
  const vRight = _right.x * linvel.x + _right.y * linvel.y + _right.z * linvel.z;

  if (axis.forward !== 0 || axis.turn !== 0) {
    cart.body.wakeUp();
  }

  const rb = CONFIG.cart.ramBoost;
  const chargeCfg = rb.boostCharge;

  // * Auto-Charge Boost: while charging, standard nitro is suppressed. The cart still
  // * drives normally (grip/yaw/drift untouched). Three release paths:
  // *   1. Early release > 100ms — proportional burst (tap = small dash, hold = big boom).
  // *   2. Early release <= 100ms — silent cancel (no boost, just stop SFX).
  // *   3. Full charge ≥ boostChargeTimeMs — max burst auto-release (existing behavior).
  if (chargeCfg?.enabled && cart.isChargingBoost) {
    const chargeElapsedMs = nowMs - cart.boostChargeStartedAtMs;

    // * Early-release: player let go of the boost button before full charge.
    if (!axis.boostHeld) {
      if (chargeElapsedMs > 100) {
        // Proportional burst — tap for a small dash, hold for the big boom.
        const proportionalMultiplier = clamp(
          chargeElapsedMs / chargeCfg.boostChargeTimeMs,
          chargeCfg.boostMinMultiplier,
          chargeCfg.boostMaxMultiplier,
        );
        cart.isChargingBoost = false;
        cart.boostChargeMultiplier = proportionalMultiplier;
        cart.boostCooldownUntilMs = nowMs + chargeCfg.boostCooldownMs;
        // * Charge boost gets a longer nitro window than instant boost (1.5× duration).
        cart.ramBoostActiveUntilMs = nowMs + rb.durationSec * 1.5 * 1000;
        cart.lastRamBoostTimeMs = nowMs;
        cart.ramBoostStreakCarry = 0;

        // * Launch burst impulse — forward kick scaled by mass × proportional multiplier.
        const burstMag = chargeCfg.burstImpulse * mass * proportionalMultiplier;
        _impulse.x = _forward.x * burstMag;
        _impulse.y = _forward.y * burstMag;
        _impulse.z = _forward.z * burstMag;
        cart.body.applyImpulse(_impulse, true);
        cart.body.wakeUp();

        if (callbacks?.onBoostRelease) {
          callbacks.onBoostRelease(cart);
        }
      } else {
        // * Released before 100ms — cancel charge silently, no boost.
        cart.isChargingBoost = false;
        if (callbacks?.onBoostCancel) {
          callbacks.onBoostCancel(cart);
        }
      }
    } else if (chargeElapsedMs >= chargeCfg.boostChargeTimeMs) {
      // * Full-charge auto-release: maximum burst.
      cart.isChargingBoost = false;
      cart.boostChargeMultiplier = chargeCfg.boostMaxMultiplier;
      cart.boostCooldownUntilMs = nowMs + chargeCfg.boostCooldownMs;
      // * Charge boost gets a longer nitro window than instant boost (1.5× duration).
      cart.ramBoostActiveUntilMs = nowMs + rb.durationSec * 1.5 * 1000;
      cart.lastRamBoostTimeMs = nowMs;
      cart.ramBoostStreakCarry = 0;

      // * Launch burst impulse — forward kick scaled by mass × multiplier. Separate
      // * from the ongoing nitro accel window; gives the release a tangible punch.
      const burstMag = chargeCfg.burstImpulse * mass * chargeCfg.boostMaxMultiplier;
      _impulse.x = _forward.x * burstMag;
      _impulse.y = _forward.y * burstMag;
      _impulse.z = _forward.z * burstMag;
      cart.body.applyImpulse(_impulse, true);
      cart.body.wakeUp();

      if (callbacks?.onBoostRelease) {
        callbacks.onBoostRelease(cart);
      }
    }
  }

  // * A charging cart must not also benefit from a lingering nitro window, so treat
  // * nitro as inactive while the charge is building. Once released above, the freshly
  // * set ramBoostActiveUntilMs re-enables nitro for the normal drive pass this frame.
  const nitroActive = rb.enabled
    && !cart.isChargingBoost
    && nowMs <= cart.ramBoostActiveUntilMs;
  const nitroForward = nitroActive && axis.forward > 0;

  // * Continuous grip: full grip at zero steer, drift grip at full lock — eliminates the
  // * step-function snap that caused violent jitter when transitioning into/out of a drift.
  const steerMag = Math.abs(axis.turn);
  const gripBase = THREE.MathUtils.lerp(
    CONFIG.driving.lateralGrip,
    CONFIG.driving.lateralGrip * CONFIG.driving.driftGripFactor,
    steerMag,
  );
  let grip = gripBase;
  if (nitroForward && rb.nitroGripFactor != null) {
    grip *= rb.nitroGripFactor;
  }
  // * Clamp the lateral grip delta-v so it can only kill vRight, never reverse it.
  // * Without this, a large grip * dtFixed product overshoots zero and induces jitter.
  const dvRight = THREE.MathUtils.clamp(
    (-vRight) * grip * dtFixed,
    -Math.abs(vRight),
    Math.abs(vRight),
  );
  const gripMag = mass * dvRight;
  _impulse.x = _right.x * gripMag;
  _impulse.y = _right.y * gripMag;
  _impulse.z = _right.z * gripMag;
  cart.body.applyImpulse(_impulse, true);

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
      const driveMag = mass * dvForward;
      _impulse.x = _forward.x * driveMag;
      _impulse.y = _forward.y * driveMag;
      _impulse.z = _forward.z * driveMag;
      cart.body.applyImpulse(_impulse, true);
    }
  }

  if (axis.turn !== 0) {
    // * angvel is stable across linear impulses — safe to read from the cached scratch.
    const av = _scratchAngvel;
    const desiredYawRate = axis.turn * CONFIG.driving.tankYawRate * controlFactor;
    const yawError = desiredYawRate - av.y;
    const torqueImpulseY = yawError * CONFIG.driving.yawResponsiveness * mass * dtFixed;
    _torqueImpulse.x = 0;
    _torqueImpulse.y = torqueImpulseY;
    _torqueImpulse.z = 0;
    cart.body.applyTorqueImpulse(_torqueImpulse, true);

    // * Apply extraYawDamping as an opposing angular impulse proportional to current yaw rate.
    // * Counter-torque scales with steer magnitude so light steering keeps authority while
    // * full-lock turns bleed off overshoot (prevents the high-responsiveness torque from
    // * swinging the cart past the intended heading).
    const yawDamp = CONFIG.driving.extraYawDamping ?? 0;
    if (yawDamp > 0) {
      _torqueImpulse.x = 0;
      _torqueImpulse.y = -av.y * yawDamp * steerMag * mass * dtFixed;
      _torqueImpulse.z = 0;
      cart.body.applyTorqueImpulse(_torqueImpulse, true);
    }

    const speedForDrift = Math.abs(vForward);
    if (speedForDrift > 0.25) {
      const driftMul = nitroActive && rb.nitroDriftMul != null ? rb.nitroDriftMul : 1;
      const driftMag =
        speedForDrift *
        CONFIG.driving.driftImpulseStrength *
        driftMul *
        controlFactor *
        mass *
        dtFixed *
        axis.turn *
        Math.sign(vForward || 1);
      _impulse.x = _right.x * driftMag;
      _impulse.y = _right.y * driftMag;
      _impulse.z = _right.z * driftMag;
      cart.body.applyImpulse(_impulse, true);
    }
  }

  // * Re-read linvel before the sub-helpers: the impulses above mutated the body's live
  // * linvel, and applyEnvironmentResponse/applySquareHoleLipAssist/applyGeometryUnstick
  // * all read post-drive velocity. Position and rotation are unchanged (no world.step()
  // * has run), so _scratchPos/_scratchRot stay valid for all sub-helpers.
  rereadLinvelIntoScratch(cart);
  applyEnvironmentResponse(cart, dtFixed);
  rereadLinvelIntoScratch(cart);
  applySquareHoleLipAssist(cart, dtFixed);
  rereadLinvelIntoScratch(cart);
  applyGeometryUnstick(cart, dtFixed, nowMs);

  // * Pitch/roll angular clamp intentionally off — V1 tipping must stay free near the hole lip.

  // * Spilling Cart VFX trigger — fires after 0.5s of continuous tipping past 0.3 up-dot.
  {
    _tipQuatScratch.set(rot.x, rot.y, rot.z, rot.w);
    _upVecScratch.set(0, 1, 0).applyQuaternion(_tipQuatScratch);
    const upDot = _upVecScratch.y;
    if (upDot < 0.3 && !cart.hasSpilled) {
      if (!cart.tipOverStartMs) {
        cart.tipOverStartMs = nowMs;
      } else if (nowMs - cart.tipOverStartMs > 500) {
        callbacks?.onSpill?.(cart);
        cart.hasSpilled = true;
        cart.tipOverStartMs = null;
      }
    } else {
      cart.tipOverStartMs = null;
    }
  }
}

/**
 * * Backrooms void lip — outward impulse so carts (especially NPCs) don't slide down chamfers.
 *
 * Reads pos + linvel from the module scratch cache (populated by the caller); avoids
 * redundant Rapier getter allocations.
 *
 * @param {object} cart
 * @param {number} dtFixed
 */
function applySquareHoleLipAssist(cart, dtFixed) {
  if (!_levelHazards?.arenaHalf || !cart?.body || cart.respawnAtMs != null || !dtFixed) return;

  const pos = _scratchPos;
  const { cheb, hole } = nearestSquareHole(pos.x, pos.z);
  const lip = squareHoleKeepOutRadius(0);
  // * Only when hugging the lip — don't fight NPCs driving through outer gutters.
  if (cheb >= lip + 0.45) return;

  const dx = pos.x - hole.x;
  const dz = pos.z - hole.z;
  const len = Math.hypot(dx, dz) || 1;
  const outwardX = dx / len;
  const outwardZ = dz / len;
  const lv = _scratchLinvel;
  const towardHole = -(lv.x * outwardX + lv.z * outwardZ);
  const urgency = clamp((lip + 0.45 - cheb) / 0.45, 0, 1);
  if (urgency <= 0 || towardHole < 0.35) return;

  const mass = getBodyMass(cart.body);
  const baseOut = (3 + urgency * 6) * mass * dtFixed;
  _impulse.x = outwardX * baseOut;
  _impulse.z = outwardZ * baseOut;
  const boost = towardHole * 8 * mass * dtFixed;
  _impulse.x += outwardX * boost;
  _impulse.z += outwardZ * boost;
  _impulse.y = urgency * 2 * mass * dtFixed;
  cart.body.applyImpulse(_impulse, true);
  cart.body.wakeUp();
}

/**
 * Applies periodic upward / jitter impulses when a cart has been wedged against static
 * geometry for a few seconds — frees many trimesh / hull snags before the 10s idle respawn.
 *
 * Reads pos + linvel from the module scratch cache (populated by the caller); avoids
 * redundant Rapier getter allocations.
 *
 * @param {object} cart
 * @param {number} dtFixed
 * @param {number} nowMs
 */
function applyGeometryUnstick(cart, dtFixed, nowMs) {
  if (!cart?.body || cart.respawnAtMs != null || !dtFixed || dtFixed <= 0) return;

  const pos = _scratchPos;
  if (pos.y > CONFIG.booth.platformY - 1.0) {
    cart.unstickStillSinceMs = 0;
    return;
  }

  const lv = _scratchLinvel;
  const planarSpeed = Math.hypot(lv.x, lv.z);
  const moved = Math.hypot(pos.x - cart.idleAnchorX, pos.z - cart.idleAnchorZ);
  const stuckCfg = CONFIG.fall?.stuck;
  const radiusM = stuckCfg?.positionRadiusM ?? 0.45;

  if (planarSpeed > 1.2 || moved > radiusM) {
    cart.unstickStillSinceMs = 0;
    return;
  }

  if (!cart.unstickStillSinceMs) {
    cart.unstickStillSinceMs = nowMs;
    return;
  }

  const stuckMs = nowMs - cart.unstickStillSinceMs;
  const unstickAfterMs = stuckCfg?.unstickAfterMs ?? 2000;
  if (stuckMs < unstickAfterMs) return;

  cart.body.wakeUp();
  const mass = getBodyMass(cart.body);
  const phase = (cart.slotIndex || 0) * 1.37;
  const jitter = nowMs * 0.003 + phase;
  _impulse.x = Math.cos(jitter) * 2.2 * mass * dtFixed;
  _impulse.y = 3.0 * mass * dtFixed;
  _impulse.z = Math.sin(jitter) * 2.2 * mass * dtFixed;
  cart.body.applyImpulse(_impulse, true);
  if (cart.collider?.setFriction) {
    cart.collider.setFriction((CONFIG.cart.friction ?? 1.1) * 0.35);
  }
}

/**
 * * Returns a ramming qualification score for rammer → victim, or 0 if the hit does not qualify.
 *
 * Reads pre-fetched pos + linvel from the supplied ram state buffers instead of calling
 * the Rapier getters again. State is fetched once per pair in {@link resolveCartRamCollision}
 * and shared with {@link applyRammingImpulse}.
 *
 * @param {{ pos: { x: number, y: number, z: number }, linvel: { x: number, y: number, z: number } }} rammerState
 * @param {{ pos: { x: number, y: number, z: number }, linvel: { x: number, y: number, z: number } }} victimState
 * @returns {number}
 */
function getRammingQualificationScore(rammerState, victimState) {
  const rv = rammerState.linvel;
  const speed = planarSpeed(rv);
  if (speed < CONFIG.ramming.minSpeed) return 0;

  _planarDir.set(rv.x, 0, rv.z);
  const dirLen = _planarDir.length();
  if (dirLen <= 1e-6) return 0;
  _planarDir.multiplyScalar(1 / dirLen);

  const vv = victimState.linvel;
  const closingSpeed = Math.max(speed, speed + (-(vv.x * _planarDir.x + vv.z * _planarDir.z)));

  const rp = rammerState.pos;
  const vp = victimState.pos;
  _toVictim.set(vp.x - rp.x, 0, vp.z - rp.z);
  if (_toVictim.lengthSq() < 1e-6) return 0;
  _toVictim.normalize();

  if (_planarDir.dot(_toVictim) < CONFIG.ramming.alignmentDotMin) return 0;

  return closingSpeed;
}

/**
 * * Picks the dominant rammer/victim pair for a cart-on-cart collision.
 *
 * Fetches each cart's pos + linvel ONCE into the module ram-state buffers, then shares
 * them with {@link getRammingQualificationScore} (both directions) and the downstream
 * {@link applyRammingImpulse}. Collapses ~12 Rapier getter allocs per pair down to 4.
 *
 * @param {object} c1
 * @param {object} c2
 * @returns {{ rammer: object, victim: object, rammerState: object, victimState: object } | null}
 */
function resolveCartRamCollision(c1, c2) {
  readRamStateInto(c1, _ramStateA);
  readRamStateInto(c2, _ramStateB);

  const score1 = getRammingQualificationScore(_ramStateA, _ramStateB);
  const score2 = getRammingQualificationScore(_ramStateB, _ramStateA);
  if (score1 <= 0 && score2 <= 0) return null;
  if (score1 >= score2) {
    return { rammer: c1, victim: c2, rammerState: _ramStateA, victimState: _ramStateB };
  }
  return { rammer: c2, victim: c1, rammerState: _ramStateB, victimState: _ramStateA };
}

/**
 * Applies a spread ramming impulse from rammer to victim and triggers FX / host events.
 *
 * Reuses the pre-fetched ram state from {@link resolveCartRamCollision} — does not call
 * Rapier getters itself. The qualification math is recomputed here only to derive the
 * impulse direction + magnitude (alignment was already validated upstream, but the
 * direction vectors `_planarDir` / `_toVictim` are module scratch and may have been
 * overwritten by the second `getRammingQualificationScore` call, so they are rebuilt).
 *
 * @param {object} rammer Attacking cart entity.
 * @param {object} victim Target cart entity.
 * @param {{ pos: { x: number, y: number, z: number }, linvel: { x: number, y: number, z: number } }} rammerState
 * @param {{ pos: { x: number, y: number, z: number }, linvel: { x: number, y: number, z: number } }} victimState
 * @param {object} callbacks Injected helpers (FX, local cart, host broadcast).
 * @param {boolean} isHost Whether this client is the room host.
 */
function applyRammingImpulse(rammer, victim, rammerState, victimState, callbacks, isHost) {
  const playCollisionRef = callbacks?.playCollision;
  const spawnTrashBurstRef = callbacks?.spawnTrashBurst;
  const rv = rammerState.linvel;
  const speed = planarSpeed(rv);
  if (speed < CONFIG.ramming.minSpeed) return;

  _planarDir.set(rv.x, 0, rv.z);
  const dirLen = _planarDir.length();
  if (dirLen <= 1e-6) return;
  _planarDir.multiplyScalar(1 / dirLen);

  const vv = victimState.linvel;
  const closingSpeed = Math.max(speed, speed + (-(vv.x * _planarDir.x + vv.z * _planarDir.z)));

  const rp = rammerState.pos;
  const vp = victimState.pos;
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
    victim.pendingRam = { impulse, remainingSteps: steps, totalSteps: steps };
  } else {
    const appliedFraction = 1 - (victim.pendingRam.remainingSteps / victim.pendingRam.totalSteps);
    victim.pendingRam.impulse.x = (victim.pendingRam.impulse.x * (1 - appliedFraction)) + impulse.x;
    victim.pendingRam.impulse.y = (victim.pendingRam.impulse.y * (1 - appliedFraction)) + impulse.y;
    victim.pendingRam.impulse.z = (victim.pendingRam.impulse.z * (1 - appliedFraction)) + impulse.z;
    victim.pendingRam.remainingSteps = Math.max(victim.pendingRam.remainingSteps, steps);
    victim.pendingRam.totalSteps = Math.max(victim.pendingRam.totalSteps, steps);
  }
  victim.lastRamTimeMs = ramTimeMs;
  rammer.lastRamTimeMs = ramTimeMs;

  // Stage A: record last hit for scoring attribution (host only) and update combo tier.
  const nowPerf = performance.now();
  const attackerSlotIndex = rammer.slotIndex ?? -1;
  const victimSlotIndex = victim.slotIndex ?? -1;
  if (isHost && attackerSlotIndex >= 0 && victimSlotIndex >= 0 && !victim.respawnAtMs && !victim.isSuddenDeathSpectator) {
    const wasCritical = nowPerf <= (rammer.ramBoostActiveUntilMs || 0);
    GameState.recordHit(victimSlotIndex, attackerSlotIndex, wasCritical);
  }

  // Update combo tier for attacker and refresh local store if rammer is local player
  if ((isHost || callbacks?.localCart === rammer) && attackerSlotIndex >= 0 && victimSlotIndex >= 0 && !victim.respawnAtMs && !victim.isSuddenDeathSpectator) {
    const maxTier = CONFIG.combo?.maxTier ?? 3;
    const decayMs = CONFIG.combo?.decayMs ?? 5000;
    rammer.comboTier = Math.min((rammer.comboTier || 0) + 1, maxTier);
    rammer.comboExpiryMs = nowPerf + decayMs;

    if (callbacks?.localCart === rammer) {
      GameState.setLocalCombo(rammer.comboTier, rammer.comboExpiryMs);
      if (rammer.comboTier === 2) ChallengeTracker.record('combo_t2');
      if (rammer.comboTier === 3) ChallengeTracker.record('combo_t3');
      if (!victim.hasSpilled) {
        ChallengeTracker.record('spill');
      }
    }
  }

  // Host collision FX queued for batched send on the next host_transform tick.
  if (isHost) {
    const slotA = rammer.slotIndex;
    const slotB = victim.slotIndex;
    if (slotA >= 0 && slotB >= 0) {
      queueHostCollisionEvent({
        slotA,
        slotB,
        rammerSlot: rammer.slotIndex,
        isBoosting: isRammerBoosting,
        intensity: fxIntensity,
        midpoint: { x: (rp.x + vp.x) / 2, y: (rp.y + vp.y) / 2, z: (rp.z + vp.z) / 2 },
      });
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
 *   holeCenter?: number,
 *   arenaHalf?: number,
 *   avoidMargin: number,
 *   influenceBand: number,
 *   circularKeepOuts?: { x: number, z: number, radius: number, margin?: number }[],
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
 * Chebyshev keep-out radius around each square void (hole half + AI margin).
 *
 * @param {number} [extraMargin]
 * @returns {number}
 */
function squareHoleKeepOutRadius(extraMargin = 0) {
  return _levelHazards.half + _levelHazards.avoidMargin + extraMargin;
}

/**
 * @param {number} x
 * @param {number} z
 * @param {number} [extraMargin]
 * @returns {boolean}
 */
function isInsideSquareHoleZone(x, z, extraMargin = 0) {
  const need = squareHoleKeepOutRadius(extraMargin);
  for (let i = 0; i < _levelHazards.squareHoles.length; i += 1) {
    const h = _levelHazards.squareHoles[i];
    if (Math.abs(x - h.x) < need && Math.abs(z - h.z) < need) return true;
  }
  return false;
}

/**
 * @param {number} ax
 * @param {number} az
 * @param {number} bx
 * @param {number} bz
 * @param {number} minX
 * @param {number} minZ
 * @param {number} maxX
 * @param {number} maxZ
 * @returns {boolean}
 */
function segmentIntersectsAabb(ax, az, bx, bz, minX, minZ, maxX, maxZ) {
  const dx = bx - ax;
  const dz = bz - az;
  let t0 = 0;
  let t1 = 1;
  const p = [-dx, dx, -dz, dz];
  const q = [ax - minX, maxX - ax, az - minZ, maxZ - az];
  for (let i = 0; i < 4; i += 1) {
    if (Math.abs(p[i]) < 1e-8) {
      if (q[i] < 0) return false;
    } else {
      const t = q[i] / p[i];
      if (p[i] < 0) t0 = Math.max(t0, t);
      else t1 = Math.min(t1, t);
      if (t0 > t1) return false;
    }
  }
  return true;
}

/**
 * @param {number} fx
 * @param {number} fz
 * @param {number} tx
 * @param {number} tz
 * @param {number} [extraMargin]
 * @returns {{ x: number, z: number } | null}
 */
export function findBlockingSquareHole(fx, fz, tx, tz, extraMargin = 0) {
  if (!_levelHazards?.squareHoles) return null;
  const need = squareHoleKeepOutRadius(extraMargin);
  for (let i = 0; i < _levelHazards.squareHoles.length; i += 1) {
    const h = _levelHazards.squareHoles[i];
    if (segmentIntersectsAabb(
      fx, fz, tx, tz,
      h.x - need, h.z - need, h.x + need, h.z + need,
    )) {
      return h;
    }
  }
  return null;
}

/**
 * @param {number} px
 * @param {number} pz
 * @returns {{ cheb: number, hole: { x: number, z: number } }}
 */
function nearestSquareHole(px, pz) {
  let bestCheb = Infinity;
  let bestHole = _levelHazards.squareHoles[0];
  for (let i = 0; i < _levelHazards.squareHoles.length; i += 1) {
    const h = _levelHazards.squareHoles[i];
    const cheb = Math.max(Math.abs(px - h.x), Math.abs(pz - h.z));
    if (cheb < bestCheb) {
      bestCheb = cheb;
      bestHole = h;
    }
  }
  return { cheb: bestCheb, hole: bestHole };
}

/**
 * Gutter waypoint on the outer corner of a void's keep-out box toward the chase target.
 *
 * @param {{ x: number, z: number }} hole
 * @param {number} tx
 * @param {number} tz
 * @param {boolean} cautious
 * @returns {{ x: number, z: number }}
 */
function gutterWaypointAroundHole(hole, tx, tz, cautious) {
  const pad = _levelHazards.avoidMargin + (cautious ? 0.55 : 0.35);
  const gutter = (_levelHazards.holeCenter ?? 18) + _levelHazards.half + pad;
  const sx = tx >= hole.x ? 1 : -1;
  const sz = tz >= hole.z ? 1 : -1;
  return { x: hole.x + sx * gutter, z: hole.z + sz * gutter };
}

/**
 * Routes a chase target around square voids — direct line only when it misses every hole.
 *
 * @param {number} fx
 * @param {number} fz
 * @param {number} tx
 * @param {number} tz
 * @param {boolean} cautious
 * @returns {{ x: number, z: number }}
 */
function routeBackroomsChaseTarget(fx, fz, tx, tz, cautious) {
  const routeMargin = cautious ? 0.22 : 0.06;
  const lip = squareHoleKeepOutRadius(0);

  // * Both ends in the outer gutter — go direct unless the segment crosses the void box.
  if (nearestSquareHole(tx, tz).cheb >= lip - 0.15
    && nearestSquareHole(fx, fz).cheb >= lip - 0.35
    && !findBlockingSquareHole(fx, fz, tx, tz, -0.05)) {
    return clampBackroomsAiTarget(tx, tz, cautious);
  }

  const hole = findBlockingSquareHole(fx, fz, tx, tz, routeMargin);
  if (!hole) {
    return clampBackroomsAiTarget(tx, tz, cautious);
  }

  const need = squareHoleKeepOutRadius(routeMargin);
  const outsideX = Math.abs(fx - hole.x) >= need;
  const outsideZ = Math.abs(fz - hole.z) >= need;

  // * Already past one axis of the void — finish on the safe axis toward the human.
  if (outsideX && !outsideZ) {
    return clampBackroomsAiTarget(tx, fz, cautious);
  }
  if (outsideZ && !outsideX) {
    return clampBackroomsAiTarget(fx, tz, cautious);
  }

  const wp = gutterWaypointAroundHole(hole, tx, tz, cautious);
  return clampBackroomsAiTarget(wp.x, wp.z, cautious);
}

/**
 * Pushes an XZ point outside registered circular keep-out zones (e.g. center furniture).
 *
 * @param {number} x
 * @param {number} z
 * @param {number} [extraMargin]
 * @returns {{ x: number, z: number }}
 */
function pushPointOutOfCircularKeepOuts(x, z, extraMargin = 0) {
  const zones = _levelHazards?.circularKeepOuts;
  if (!zones?.length) return { x, z };
  let px = x;
  let pz = z;
  for (let i = 0; i < zones.length; i += 1) {
    const ko = zones[i];
    const dx = px - ko.x;
    const dz = pz - ko.z;
    const dist = Math.hypot(dx, dz);
    const minDist = ko.radius + (ko.margin ?? 1.5) + extraMargin;
    if (dist >= minDist) continue;
    if (dist > 1e-6) {
      const scale = minDist / dist;
      px = ko.x + dx * scale;
      pz = ko.z + dz * scale;
    } else {
      px = ko.x + minDist;
      pz = ko.z;
    }
  }
  return { x: px, z: pz };
}

/**
 * Blends repulsion away from circular keep-out zones into a planar heading.
 *
 * @param {number} px
 * @param {number} pz
 * @param {THREE.Vector3} dir
 */
function applyCircularKeepOutAvoidance(px, pz, dir) {
  const zones = _levelHazards?.circularKeepOuts;
  if (!zones?.length) return;
  let rx = 0;
  let rz = 0;
  for (let i = 0; i < zones.length; i += 1) {
    const ko = zones[i];
    const dx = px - ko.x;
    const dz = pz - ko.z;
    const dist = Math.hypot(dx, dz);
    const edge = ko.radius + (ko.margin ?? 1.5);
    const band = ko.margin ?? 1.5;
    if (dist >= edge + band) continue;
    const len = dist || 1;
    const strength = clamp((edge + band - dist) / band, 0, 2.4);
    rx += (dx / len) * strength;
    rz += (dz / len) * strength;
  }
  if (rx === 0 && rz === 0) return;
  dir.x += rx * 1.6;
  dir.z += rz * 1.6;
  if (dir.lengthSq() < 1e-6) dir.set(rx, 0, rz);
  dir.normalize();
}

/**
 * Blends a repulsion away from nearby square voids into an NPC's heading direction so it
 * steers around the holes instead of driving straight in. Mutates and re-normalizes `dir`.
 *
 * @param {number} px Cart world X.
 * @param {number} pz Cart world Z.
 * @param {THREE.Vector3} dir Normalized planar heading (modified in place).
 * @param {number} [targetX] Optional chase X for tangent routing around voids.
 * @param {number} [targetZ] Optional chase Z for tangent routing around voids.
 */
function applySquareHoleAvoidance(px, pz, dir, targetX, targetZ) {
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
    const radialX = dx / len;
    const radialZ = dz / len;
    // * Gutter band: tangent only — radial push reads as "scared of the whole corner".
    const inGutterBand = cheb >= edge;
    const radialScale = inGutterBand ? 0 : 0.35;
    if (radialScale > 0) {
      rx += radialX * strength * radialScale;
      rz += radialZ * strength * radialScale;
    }

    // * Near the lip, bias tangent toward the chase target.
    if (strength > 0.12 && targetX != null && targetZ != null) {
      const tanAX = -radialZ;
      const tanAZ = radialX;
      const tanBX = radialZ;
      const tanBZ = -radialX;
      const toTx = targetX - px;
      const toTz = targetZ - pz;
      const pickA = toTx * tanAX + toTz * tanAZ;
      const pickB = toTx * tanBX + toTz * tanBZ;
      const useTan = pickA >= pickB;
      const tanX = useTan ? tanAX : tanBX;
      const tanZ = useTan ? tanAZ : tanBZ;
      const tanGain = inGutterBand ? 1.4 : 1.1;
      rx += tanX * strength * tanGain;
      rz += tanZ * strength * tanGain;
    }
  }
  if (rx === 0 && rz === 0) return;
  const GAIN = 0.82;
  dir.x += rx * GAIN;
  dir.z += rz * GAIN;
  if (dir.lengthSq() < 1e-6) dir.set(rx, 0, rz);
  dir.normalize();
}

/**
 * Steers an NPC's heading away from the Classic Record center hole when the cart is
 * within the influence band of the physics lip. Radial outward push strength ramps
 * from 0 at the outer edge of the influence band to max at the hole lip.
 *
 * @param {number} px Cart world X.
 * @param {number} pz Cart world Z.
 * @param {THREE.Vector3} dir Normalized planar heading (modified in place).
 */
function applyClassicCenterHoleAvoidance(px, pz, dir) {
  const innerR = CONFIG.record.innerRadius;
  const holeClearance = CONFIG.record.physics?.holeClearance ?? 0.45;
  const edge = innerR + holeClearance;
  const band = 4.5;
  const dist = Math.hypot(px, pz);

  if (dist >= edge + band) return;

  const strength = clamp((edge + band - dist) / band, 0, 1.6);
  let rx, rz;
  if (dist > 1e-3) {
    rx = px / dist;
    rz = pz / dist;
  } else {
    rx = 1;
    rz = 0;
  }

  dir.x += rx * strength * 1.1;
  dir.z += rz * strength * 1.1;
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
 * * Clamps a patrol / chase target for Backrooms — square arena bounds + void keep-out only.
 * Does not use the Classic vinyl annulus (that capped outer reach at ~23 m).
 */
function clampBackroomsAiTarget(x, z, cautious, opts = {}) {
  const arenaHalf = _levelHazards.arenaHalf ?? 34;
  const edgeInset = cautious ? 3.2 : 1.2;
  const maxCoord = arenaHalf - edgeInset;
  let outX = clamp(x, -maxCoord, maxCoord);
  let outZ = clamp(z, -maxCoord, maxCoord);
  const holeExtra = opts.cornerPatrol
    ? (cautious ? 0.1 : -0.12)
    : (cautious ? 0.3 : -0.05);
  const pushed = pushPointOutOfSquareHoles(outX, outZ, holeExtra);
  outX = pushed.x;
  outZ = pushed.z;
  const kept = pushPointOutOfCircularKeepOuts(outX, outZ, cautious ? 0.8 : 0.3);
  return { x: kept.x, z: kept.z };
}

/**
 * * Patrol target in the outer corner gutter between each void and the arena perimeter.
 *
 * @param {boolean} cautious
 * @param {number} [slotIndex]
 */
function pickBackroomsCornerPatrolTarget(cautious, slotIndex = 0) {
  const arenaHalf = _levelHazards.arenaHalf ?? 34;
  const holeCenter = _levelHazards.holeCenter ?? 18;
  const holeOuter = holeCenter + _levelHazards.half;
  const gutterMin = holeOuter + (cautious ? 0.55 : 0.1);
  const gutterMax = arenaHalf - (cautious ? 2.2 : 0.8);
  const corners = [
    [1, 1], [-1, 1], [1, -1], [-1, -1],
  ];
  const corner = corners[(slotIndex + Math.floor(Math.random() * 2)) % corners.length];
  const [sx, sz] = corner;
  const patrolOpts = { cornerPatrol: true };

  const roll = Math.random();
  if (roll < 0.5) {
    // * Deep corner pocket — sqrt bias pushes picks toward the outer hide spots.
    const c = gutterMin + Math.sqrt(Math.random()) * Math.max(0.8, gutterMax - gutterMin);
    const j = (Math.random() - 0.5) * 0.8;
    return clampBackroomsAiTarget(sx * c + j, sz * c + j, cautious, patrolOpts);
  }
  const outer = gutterMax - Math.random() * 0.6;
  const lane = gutterMin + Math.random() * Math.max(0.8, gutterMax - gutterMin);
  if (roll < 0.71) {
    // * Gutter lane along outer wall.
    return clampBackroomsAiTarget(sx * outer, sz * lane, cautious, patrolOpts);
  }
  return clampBackroomsAiTarget(sx * lane, sz * outer, cautious, patrolOpts);
}

/**
 * * Random wander anywhere on the Backrooms square floor (not the Classic annulus).
 */
function pickBackroomsWanderTarget(cautious) {
  const arenaHalf = _levelHazards.arenaHalf ?? 34;
  const inset = cautious ? 6.0 : 3.0;
  const span = Math.max(1, (arenaHalf - inset) * 2);
  const outX = -arenaHalf + inset + Math.random() * span;
  const outZ = -arenaHalf + inset + Math.random() * span;
  return clampBackroomsAiTarget(outX, outZ, cautious);
}

/**
 * * Clamps a target point into a safe annulus — tighter band during cautious phase.
 */
function clampAiTargetAwayFromHazards(x, z, cautious) {
  if (_levelHazards?.arenaHalf != null) {
    return clampBackroomsAiTarget(x, z, cautious);
  }

  // * Flat square arenas (e.g. Test Arena): clamp to safe inner square bounds.
  if (CONFIG.record.centerHole?.enabled === false) {
    const maxCoord = cautious ? 20 : 24;
    return { x: clamp(x, -maxCoord, maxCoord), z: clamp(z, -maxCoord, maxCoord) };
  }

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
    const kept = pushPointOutOfCircularKeepOuts(outX, outZ, cautious ? 0.8 : 0.3);
    outX = kept.x;
    outZ = kept.z;
  }
  return { x: outX, z: outZ };
}

function findNearestHumanTarget(fromPos, allCarts, netSlots, slotIndex = 0) {
  let nearestPos = null;
  let nearestWeightedD2 = Infinity;
  let nearestVel = null;
  const LEAD_TIME_S = 0.5;
  const fallYThreshold = CONFIG.fall?.yThreshold ?? -1.0;

  // * Rubberbanding: fetch current round scores to prioritize match leader
  const roundState = GameState.getRoundState();
  const roundScores = roundState.scores || {};
  let topScore = -Infinity;
  let minScore = Infinity;
  let activeHumans = 0;

  for (let i = 0; i < (netSlots?.length ?? 0); i += 1) {
    const s = netSlots?.[i];
    if (s?.kind === "human" && s.connId) {
      activeHumans += 1;
      const sc = Number(roundScores[i] || 0);
      topScore = Math.max(topScore, sc);
      minScore = Math.min(minScore, sc);
    }
  }

  for (let i = 0; i < (allCarts?.length ?? 0); i += 1) {
    const s = netSlots?.[i];
    if (!s || s.kind !== "human" || !s.connId) continue;
    const cart = allCarts[i];
    if (!cart?.body || cart.respawnAtMs != null || cart.isSuddenDeathSpectator) continue;
    const hp = cart.body.translation();
    if (hp.y < fallYThreshold) continue;
    const dx = hp.x - fromPos.x;
    const dz = hp.z - fromPos.z;
    let d2 = dx * dx + dz * dz;

    // * Score Rubberbanding: prioritize leader by scaling effective distance down; handicap trailing player
    const sc = Number(roundScores[i] || 0);
    if (activeHumans > 1 && topScore > 0) {
      if (sc === topScore) {
        d2 *= 0.65; // Appears 35% closer → higher chase priority against leader
      } else if (sc === minScore && sc < topScore) {
        d2 *= 1.30; // Appears 30% farther → lower priority against trailing player
      }
    }

    if (d2 < nearestWeightedD2) {
      nearestWeightedD2 = d2;
      nearestPos = hp;
      nearestVel = cart.body.linvel();
    }
  }
  if (!nearestPos) return null;

  const jitter = _levelHazards?.arenaHalf != null ? 0.5 : 1.8;
  let targetX = nearestPos.x + (nearestVel ? nearestVel.x * LEAD_TIME_S : 0);
  let targetZ = nearestPos.z + (nearestVel ? nearestVel.z * LEAD_TIME_S : 0);

  // * Sudden Death Tactics: Flanking / Pincer angles & Edge push bias
  if (roundState.isSuddenDeath) {
    // 1. Pincer offset based on NPC slotIndex
    const pincerSign = (slotIndex % 2 === 0) ? 1 : -1;
    const speed = nearestVel ? Math.hypot(nearestVel.x, nearestVel.z) : 0;
    if (speed > 0.5) {
      const vx = nearestVel.x / speed;
      const vz = nearestVel.z / speed;
      // Perpendicular flank vector
      targetX += -vz * pincerSign * 2.5;
      targetZ += vx * pincerSign * 2.5;
    }

    // 2. Outward edge push: if target is near an edge/void and NPC is inside, push target point toward edge
    const distToCenter = Math.hypot(nearestPos.x, nearestPos.z);
    const npcDistToCenter = Math.hypot(fromPos.x, fromPos.z);
    if (npcDistToCenter < distToCenter) {
      const outDirX = nearestPos.x / (distToCenter || 1);
      const outDirZ = nearestPos.z / (distToCenter || 1);
      targetX += outDirX * 2.0;
      targetZ += outDirZ * 2.0;
    }
  }

  return {
    x: targetX + (Math.random() - 0.5) * jitter,
    z: targetZ + (Math.random() - 0.5) * jitter,
  };
}

function pickAiPatrolTarget(cautious = false, slotIndex = 0) {
  if (_levelHazards?.arenaHalf != null) {
    // * Heavy corner-gutter bias — sweep hide pockets even when not chasing a human.
    if (Math.random() < 0.84) {
      return pickBackroomsCornerPatrolTarget(cautious, slotIndex);
    }
    return pickBackroomsWanderTarget(cautious);
  }

  const angle = Math.random() * Math.PI * 2;
  const r = CONFIG.record.radius * (
    cautious
      ? 0.58 + Math.random() * 0.12
      : 0.68 + Math.random() * 0.14
  );
  return clampAiTargetAwayFromHazards(Math.cos(angle) * r, Math.sin(angle) * r, cautious);
}

function pickAiRandomWanderTarget(fromPos, cautious, slotIndex = 0) {
  if (_levelHazards?.arenaHalf != null) {
    if (cautious) {
      if (Math.random() < 0.65) return pickBackroomsCornerPatrolTarget(true, slotIndex);
      return pickBackroomsWanderTarget(true);
    }
    const dist = Math.max(Math.abs(fromPos.x), Math.abs(fromPos.z));
    const arenaHalf = _levelHazards.arenaHalf;
    if (dist > arenaHalf * 0.38 || Math.random() < 0.7) {
      return pickBackroomsCornerPatrolTarget(false, slotIndex);
    }
    return pickBackroomsWanderTarget(false);
  }

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
  if (cart.aiAvoidanceCommitUntilMs == null) cart.aiAvoidanceCommitUntilMs = 0;
  if (!cart.aiPersonality) {
    cart.aiPersonality = getNpcPersonality(cart.name ?? cart.slotIndex);
  }
}

/**
 * Picks a world-space XZ target for one NPC cart.
 *
 * @param {{ x: number, y: number, z: number }} fromPos Current cart position.
 * @param {object[]|null} allCarts All slot carts.
 * @param {object[]|null} netSlots Network slot metadata.
 * @param {number} nowMs Current time in milliseconds.
 * @param {number} [slotIndex] Cart slot for corner-sweep variety.
 * @returns {{ x: number, z: number }}
 */
function pickAiTarget(cart, fromPos, allCarts, netSlots, nowMs, slotIndex = 0) {
  ensureAiBehaviorState(cart);
  const personality = cart.aiPersonality;
  const cautious = isAiCautiousPhase(nowMs, allCarts, netSlots);
  const humanTarget = findNearestHumanTarget(fromPos, allCarts, netSlots, slotIndex);
  const roll = Math.random();

  const roundState = GameState.getRoundState();
  const isSuddenDeath = roundState.isSuddenDeath;
  const roundScores = roundState.scores || {};
  let topScore = 0;
  for (let key in roundScores) topScore = Math.max(topScore, Number(roundScores[key] || 0));

  let humanWeight = cautious ? personality.humanWeight * 0.85 : personality.humanWeight;
  let patrolWeight = personality.patrolWeight;

  // 1. Sudden Death Bloodhound Override: boost human chase weight across ALL personalities
  if (isSuddenDeath) {
    humanWeight = Math.max(humanWeight, 0.88);
    patrolWeight = 0.05;
  } else if (topScore >= 2) {
    // 2. Match Point Leader Pressure: boost chase weight by 1.25x when a player is on Match Point
    humanWeight = Math.min(0.95, humanWeight * 1.25);
  }

  if (_levelHazards?.arenaHalf != null && !isSuddenDeath) {
    if (humanTarget && !cautious) {
      humanWeight = Math.max(humanWeight, 0.70);
      patrolWeight = 0.15;
    } else if (!cautious) {
      humanWeight = 0.30;
      patrolWeight = 0.40;
    }
  }

  if (roll < humanWeight && humanTarget) {
    if (_levelHazards?.arenaHalf != null) {
      if (!findBlockingSquareHole(fromPos.x, fromPos.z, humanTarget.x, humanTarget.z, 0.04)) {
        return clampBackroomsAiTarget(humanTarget.x, humanTarget.z, cautious);
      }
      return routeBackroomsChaseTarget(fromPos.x, fromPos.z, humanTarget.x, humanTarget.z, cautious);
    }
    return clampAiTargetAwayFromHazards(humanTarget.x, humanTarget.z, cautious);
  }

  if (roll < humanWeight + patrolWeight) {
    return pickAiPatrolTarget(cautious, slotIndex);
  }
  return pickAiRandomWanderTarget(fromPos, cautious, slotIndex);
}

/**
 * Computes tank-steer input for one NPC cart toward its current AI target.
 *
 * Caller invariant: {@link readBodyStateIntoScratch} has been called for `cart` so that
 * `_scratchPos`, `_scratchLinvel`, and `_scratchRot` hold this cart's current state.
 * getAiAxis is read-only (applies no impulses), so the scratch stays valid for the
 * immediately-following {@link applyArcadeControls} call without re-fetching.
 *
 * @param {number} now Current time in milliseconds.
 * @param {any} cart Active cart object.
 * @param {object[]|null} allCarts All slot carts.
 * @param {object[]|null} netSlots Network slot metadata.
 * @returns {{ forward: number, turn: number }}
 */
export function getAiAxis(now, cart, allCarts, netSlots) {
  ensureAiBehaviorState(cart);

  if (now < cart.aiPauseUntilMs) {
    cart.aiLastProgressMs = now;
    const idleWobble = Math.sin(now * 0.002 + (cart.slotIndex || 0)) * 0.12;
    return { forward: 0, turn: clamp(idleWobble, -0.18, 0.18) };
  }

  const p = _scratchPos;

  // * Spawn platform: force bots to drive toward the arena center until they roll
  // * off the booth and land on the main floor. Prevents beeline suicide across
  // * corner voids (Backrooms) or the center hole (Classic) at round start / respawn.
  const onSpawnPlatform = p.y > CONFIG.booth.platformY - 0.5;
  if (onSpawnPlatform) {
    cart.aiTarget = { x: 0, z: 0 };
    cart._aiWorkingTarget = null;
    cart.aiNextDecisionMs = now + 200;
    cart.aiLastProgressMs = now;
    cart.aiLastDistToTarget = Math.hypot(p.x, p.z);
    if (p.y < CONFIG.booth.platformY + 0.5) {
      // * Still on/near the booth deck — nudge forward with a gentle random swerve
      // * so bots don't sit idle or drive in a perfect straight line off the lip.
      const toCenterX = -p.x;
      const toCenterZ = -p.z;
      const toCenterLen = Math.hypot(toCenterX, toCenterZ) || 1;
      const toTarget = _aiToTarget.set(toCenterX / toCenterLen, 0, toCenterZ / toCenterLen);
      const desiredYaw = Math.atan2(-toTarget.x, -toTarget.z);
      const currentYaw = yawFromQuaternion(_scratchRot);
      const yawDiff = wrapAngleRad(desiredYaw - currentYaw);
      const swerve = Math.sin(now * 0.0015 + (cart.slotIndex || 0) * 1.9) * 0.25;
      return { forward: 0.85, turn: clamp(yawDiff * 0.8 + swerve, -1, 1) };
    }
    // * Already dropped — let the normal AI pick a real target this tick.
  }

  // * Backrooms: re-route only when the path actually crosses a void (not wide safety bubbles).
  if (_levelHazards?.arenaHalf != null) {
    const { cheb, hole } = nearestSquareHole(p.x, p.z);
    const lip = squareHoleKeepOutRadius(0);
    const targetX = cart.aiTarget?.x ?? p.x;
    const targetZ = cart.aiTarget?.z ?? p.z;

    if (findBlockingSquareHole(p.x, p.z, targetX, targetZ, 0.05)) {
      cart._aiWorkingTarget = routeBackroomsChaseTarget(p.x, p.z, targetX, targetZ, false);
    } else {
      cart._aiWorkingTarget = null;
    }

    const lv = _scratchLinvel;
    const speed = Math.hypot(lv.x, lv.z);
    // * Panic reverse only on the lip while actively sliding in — not idle in gutters.
    if (cheb < lip + 0.22 && speed > 1.0) {
      const toHoleX = hole.x - p.x;
      const toHoleZ = hole.z - p.z;
      const toHoleLen = Math.hypot(toHoleX, toHoleZ) || 1;
      const towardHole = (lv.x * toHoleX + lv.z * toHoleZ) / (speed * toHoleLen);
      if (towardHole > 0.45 || isInsideSquareHoleZone(p.x, p.z, -0.08)) {
        cart.aiReverseUntilMs = now + (420 + Math.random() * 280);
        const escape = gutterWaypointAroundHole(hole, targetX, targetZ, false);
        cart.aiTarget.x = escape.x;
        cart.aiTarget.z = escape.z;
        cart._aiWorkingTarget = null;
      }
    }
  }

  const slotIndex = cart.slotIndex || 0;
  const onBackrooms = _levelHazards?.arenaHalf != null;

  if (now >= cart.aiNextDecisionMs) {
    cart.aiTarget = pickAiTarget(cart, p, allCarts, netSlots, now, slotIndex);
    cart._aiWorkingTarget = null;
    const pcfg = cart.aiPersonality;
    const minI = pcfg?.decisionIntervalMin ?? 300;
    const maxI = pcfg?.decisionIntervalMax ?? 800;
    cart.aiNextDecisionMs = now + (minI + Math.random() * (maxI - minI));
    const minG = pcfg?.steerGainMin ?? 1.0;
    const maxG = pcfg?.steerGainMax ?? 1.5;
    cart.aiSteerGain = minG + Math.random() * (maxG - minG);
    cart.aiLastProgressMs = now;
    cart.aiLastDistToTarget = Infinity;

    // * Random short stop to break up constant circling.
    if (Math.random() < (onBackrooms ? 0.07 : 0.14)) {
      cart.aiPauseUntilMs = now + (500 + Math.random() * 1000);
      cart.aiLastProgressMs = now;
      return { forward: 0, turn: 0 };
    }
  }

  const activeTarget = cart._aiWorkingTarget || cart.aiTarget;
  const toTarget = _aiToTarget.set(activeTarget.x - p.x, 0, activeTarget.z - p.z);
  const distToTarget = Math.sqrt(toTarget.lengthSq());

  if (distToTarget < 0.5) {
    cart.aiTarget = pickAiTarget(cart, p, allCarts, netSlots, now, slotIndex);
    cart._aiWorkingTarget = null;
    const pcfg = cart.aiPersonality;
    const minI = pcfg?.decisionIntervalMin ?? 300;
    const maxI = pcfg?.decisionIntervalMax ?? 800;
    cart.aiNextDecisionMs = now + (minI + Math.random() * (maxI - minI));
    cart.aiLastProgressMs = now;
    const newTarget = cart.aiTarget;
    toTarget.set(newTarget.x - p.x, 0, newTarget.z - p.z);
  }

  const lv = _scratchLinvel;
  const speed = Math.hypot(lv.x, lv.z);
  if (distToTarget < cart.aiLastDistToTarget - 0.35) {
    cart.aiLastProgressMs = now;
  }
  cart.aiLastDistToTarget = distToTarget;

  const stuckForMs = now - cart.aiLastProgressMs;
  const isStuck = speed < 1.4 && stuckForMs > 1100;
  const isClose = distToTarget < 2.8;

  if (now >= cart.aiReverseUntilMs && (isStuck || isClose)) {
    const reverseChance = isStuck
      ? (stuckForMs > 2500 ? 0.90 : 0.65)
      : 0.25;

    // * Hazard proximity gate — forbid reverse when near a death edge to avoid
    // * backing the cart into a hole / void it can't see.
    let nearHazard = false;
    if (_levelHazards?.arenaHalf != null) {
      // * Backrooms: check distance to nearest square corner void.
      const { cheb } = nearestSquareHole(p.x, p.z);
      const keepOut = squareHoleKeepOutRadius(0);
      nearHazard = cheb < keepOut + 3.0;
      if (!nearHazard && _levelHazards.circularKeepOuts?.length > 0) {
        for (let i = 0; i < _levelHazards.circularKeepOuts.length; i += 1) {
          const ko = _levelHazards.circularKeepOuts[i];
          const distKo = Math.hypot(p.x - ko.x, p.z - ko.z);
          if (distKo < ko.radius + (ko.margin ?? 1.5) + 2.5) {
            nearHazard = true;
            break;
          }
        }
      }
    } else if (CONFIG.record.centerHole?.enabled !== false) {
      // * Classic: check distance to center-hole physics lip.
      const holeLip = CONFIG.record.innerRadius + (CONFIG.record.physics?.holeClearance ?? 0.45);
      nearHazard = Math.hypot(p.x, p.z) < holeLip + 3.0;
    }

    if (Math.random() < reverseChance && !nearHazard) {
      cart.aiReverseUntilMs = now + (600 + Math.random() * 900);
      // * When reversing near a hazard, drive forward/away instead of a new random target.
      cart.aiTarget = pickAiTarget(cart, p, allCarts, netSlots, now, slotIndex);
      toTarget.set(cart.aiTarget.x - p.x, 0, cart.aiTarget.z - p.z);
    } else if (nearHazard) {
      // * Too close to an edge to reverse — pick a target that pulls the bot away.
      cart.aiTarget = pickAiTarget(cart, p, allCarts, netSlots, now, slotIndex);
      toTarget.set(cart.aiTarget.x - p.x, 0, cart.aiTarget.z - p.z);
    }
  }

  if (toTarget.lengthSq() < 1e-6) {
    return { forward: 0, turn: 0 };
  }
  toTarget.normalize();

  // * Steer the heading away from arena hazards (hole voids, center pit, furniture).
  if (_levelHazards) {
    // * Backrooms: square-void keep-out zones + circular furniture avoidance.
    applySquareHoleAvoidance(p.x, p.z, toTarget, cart.aiTarget.x, cart.aiTarget.z);
    applyCircularKeepOutAvoidance(p.x, p.z, toTarget);
  } else if (CONFIG.record.centerHole?.enabled !== false) {
    // * Classic Record: reactive radial push away from the center hole.
    applyClassicCenterHoleAvoidance(p.x, p.z, toTarget);
  }

  // * Avoidance commitment — when a bot is in the hazard avoidance band and its speed
  // * drops below 2.0 m/s (oscillating), lock it onto a tangent escape vector for 1.5s
  // * to break the loop: drive away cleanly before turning back to chase.
  let inAvoidanceBand = false;
  if (_levelHazards?.arenaHalf != null) {
    const { cheb } = nearestSquareHole(p.x, p.z);
    const edge = _levelHazards.half + _levelHazards.avoidMargin;
    const band = _levelHazards.influenceBand;
    inAvoidanceBand = cheb < edge + band;
  } else if (CONFIG.record.centerHole?.enabled !== false) {
    const holeLip = CONFIG.record.innerRadius + (CONFIG.record.physics?.holeClearance ?? 0.45);
    const band = 4.5;
    inAvoidanceBand = Math.hypot(p.x, p.z) < holeLip + band;
  }

  const lvScratch = _scratchLinvel;
  const speedCheck = Math.hypot(lvScratch.x, lvScratch.z);
  if (inAvoidanceBand && speedCheck < 2.0 && now >= cart.aiAvoidanceCommitUntilMs) {
    cart.aiAvoidanceCommitUntilMs = now + 1500;
  }

  if (now < cart.aiAvoidanceCommitUntilMs) {
    // * Lock to tangent escape — perpendicular to radial direction from nearest hazard.
    let escapeX, escapeZ;
    if (_levelHazards?.arenaHalf != null) {
      const { hole } = nearestSquareHole(p.x, p.z);
      const dx = p.x - hole.x;
      const dz = p.z - hole.z;
      const dist = Math.hypot(dx, dz) || 1;
      escapeX = -dz / dist;
      escapeZ = dx / dist;
    } else {
      const dist = Math.hypot(p.x, p.z) || 1;
      escapeX = -p.z / dist;
      escapeZ = p.x / dist;
    }
    toTarget.set(escapeX, 0, escapeZ);
  }

  const desiredYaw = Math.atan2(-toTarget.x, -toTarget.z);
  const currentYaw = yawFromQuaternion(_scratchRot);
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

  // * Continuous throttle trim: ease from full (1.0) down to 0.6 as the heading
  // * error grows across [2.0, 3.0] rad — keeps bots driving while turning.
  const absYawDiff = Math.abs(yawDiff);
  const yawThrottleBlend = THREE.MathUtils.smoothstep(absYawDiff, 2.0, 3.0);
  let forward = THREE.MathUtils.lerp(1, 0.6, yawThrottleBlend);
  if (onBackrooms) {
    const { cheb } = nearestSquareHole(p.x, p.z);
    const lip = squareHoleKeepOutRadius(0);
    if (cheb < lip + 0.55) {
      const t = clamp((lip + 0.55 - cheb) / 0.55, 0, 1);
      forward *= 1 - t * 0.42;
    }
    // * Smoothly ease throttle down to 0.6 across the inner lip band [lip, lip+0.12]
    // * instead of a hard Math.min clamp — prevents snap deceleration at the lip edge.
    if (cheb < lip + 0.12) {
      const lipBlend = THREE.MathUtils.smoothstep(cheb, lip, lip + 0.12);
      forward = THREE.MathUtils.lerp(0.6, forward, lipBlend);
    }
  }
  return { forward, turn };
}

// Note: roundPhase is intentionally left as external reference for now
// (will be cleaned when gameState.js is extracted)
export function setRoundPhase(phase) {
  GameState.setRoundPhase(phase);
}

function ensurePreStepLinvel(cart) {
  if (!cart._preStepLinvel) {
    cart._preStepLinvel = { x: 0, y: 0, z: 0 };
  }
  return cart._preStepLinvel;
}

function classifyEnvironmentCollision(otherHandle, callbacks) {
  if (callbacks.recordColliderHandles?.includes(otherHandle)) return "floor";
  if (otherHandle === callbacks.pitWallColliderHandle) return "edge";
  if (callbacks.boothColliderHandles?.includes(otherHandle)) return "edge";
  return "floor";
}

function getEnvironmentImpact(cart, envType, impacts, state) {
  const lv = state.linvel;
  const pre = cart._preStepLinvel || lv;

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

function getEnvironmentContactPosition(envType, impacts, state, out) {
  const rp = state.pos;
  out.x = rp.x;
  out.y = rp.y + impacts.contactYOffset;
  out.z = rp.z;

  if (envType !== "edge") return out;

  const pitInnerRadius =
    (CONFIG.record.radius + impacts.pitRadiusOffset) * impacts.pitRadiusScale;
  const dist = Math.hypot(rp.x, rp.z);
  if (dist <= 1e-3) return out;

  const scale = pitInnerRadius / dist;
  out.x = rp.x * scale;
  out.z = rp.z * scale;
  return out;
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
            ram.rammerState,
            ram.victimState,
            callbacks,
            isHost,
          );
        }
      }
    } else if (c1 || c2) {
      const cart = c1 || c2;
      const otherHandle = c1 ? h2 : h1;
      const envType = classifyEnvironmentCollision(otherHandle, callbacks);
      // * Fetch this cart's pos + linvel ONCE; shared by impact + contact-pos math.
      readRamStateInto(cart, _ramStateA);
      const intensity = getEnvironmentImpact(cart, envType, impacts, _ramStateA);
      if (intensity == null || intensity <= impacts.minIntensity) return;

      const contactPos = getEnvironmentContactPosition(envType, impacts, _ramStateA, _envContactPos);

      if (isHost) {
        if (envType === "floor") {
          if (callbacks.playFloorImpact) callbacks.playFloorImpact(intensity);
          if (callbacks.spawnTrashBurst) callbacks.spawnTrashBurst(contactPos, intensity, "floor");
        } else {
          if (callbacks.playEdgeImpact) callbacks.playEdgeImpact(intensity);
          if (callbacks.spawnTrashBurst) callbacks.spawnTrashBurst(contactPos, intensity, "edge");
        }
      }

      if (isHost) {
        const slotIndex = cart.slotIndex;
        if (slotIndex >= 0) {
          queueHostCollisionEvent({
            slotA: slotIndex,
            slotB: envType === "floor" ? -1 : -2,
            intensity,
            midpoint: { x: contactPos.x, y: contactPos.y, z: contactPos.z },
          });
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
 * @param {object|null} [params.localInputOverride] Optional input override for client-side prediction replay.
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
  localInputOverride = null,
}) {
  const getAxis = callbacks.getAxis || (() => ({ forward: 0, turn: 0 }));
  const getAiAxis = callbacks.getAiAxis || null;

  // Save pre-step linear velocities for collision impact calculations
  for (const cart of allCarts || []) {
    if (cart && cart.body) {
      const lv = cart.body.linvel();
      const pre = ensurePreStepLinvel(cart);
      pre.x = lv.x;
      pre.y = lv.y;
      pre.z = lv.z;
    }
  }

  // 1. Local player
  if (localCart && !localCart.isSuddenDeathSpectator) {
    let axis;
    if (localInputOverride) {
      axis = {
        forward: localInputOverride.throttle ?? 0,
        turn: localInputOverride.steer ?? 0,
        boostHeld: localInputOverride.nitro ?? false,
      };
      if (localInputOverride.hop && callbacks.triggerHopRef) {
        callbacks.triggerHopRef(localCart, now);
      }
    } else {
      axis = getAxis();
      // * Driving input is locked outside the running phase so carts cannot be
      // * throttle/turn/nitro-driven during countdown, lobby, or podium. Hop is
      // * gated separately in main.js input handlers. Remote inputs are only
      // * received during running (host ignores client_input otherwise).
      const canDrive = GameState.getRoundState().phase === "running";
      if (!canDrive) {
        axis.forward = 0;
        axis.turn = 0;
      }
    }
    // * Populate scratch once for this cart; applyArcadeControls + its sub-helpers all
    // * read pos/rot/angvel from the cache (stable across the pass — no world.step() runs
    // * between here and the next cart). linvel is re-read internally after each impulse.
    readBodyStateIntoScratch(localCart);
    applyArcadeControls(localCart, axis, dt, now, callbacks);
  }

  // 2. Remote players (host only)
  // * resolveCartForConn is injected by the caller (main.js) so this module stays
  // * free of netSlots / connId knowledge. Skip spectator carts.
  if (isHost && remoteInputs && callbacks.resolveCartForConn) {
    for (const [connId, input] of remoteInputs.entries()) {
      const remoteCart = callbacks.resolveCartForConn(connId);
      if (!remoteCart || remoteCart.isSuddenDeathSpectator) continue;
      _remoteAxis.forward = input.throttle ?? 0;
      _remoteAxis.turn = input.steer ?? 0;
      _remoteAxis.boostHeld = input.nitro ?? false;
      readBodyStateIntoScratch(remoteCart);
      applyArcadeControls(
        remoteCart,
        _remoteAxis,
        dt,
        now,
        callbacks,
      );
    }
  }

  // 3. NPC AI (host only) — skip spectator carts.
  if (isHost && getAiAxis && npcs.length > 0) {
    for (const npc of npcs) {
      if (npc.isSuddenDeathSpectator) continue;
      // * Populate scratch once; getAiAxis (read-only) and applyArcadeControls share it.
      // * getAiAxis may call pickAiTarget → findNearestHumanTarget/isAiCautiousPhase,
      // * which iterate OTHER carts via their own .translation() calls — those do not
      // * touch _scratchPos, so this NPC's cached state survives the AI decision pass.
      readBodyStateIntoScratch(npc);
      const canDrive = GameState.getRoundState().phase === "running";
      const aiAxis = canDrive ? getAiAxis(now, npc) : { forward: 0, turn: 0 };
      applyArcadeControls(npc, aiAxis, dt, now, callbacks);
    }
  }

  // 4. Pending ramming impulses
  for (const cart of allCarts || []) {
    if (!cart?.pendingRam) continue;
    const { impulse, totalSteps } = cart.pendingRam;
    const denom = Math.max(1, totalSteps);
    _pendingRamStepImpulse.x = impulse.x / denom;
    _pendingRamStepImpulse.y = impulse.y / denom;
    _pendingRamStepImpulse.z = impulse.z / denom;
    cart.body.applyImpulse(_pendingRamStepImpulse, true);
    cart.pendingRam.remainingSteps--;
    // * Massive hit spills groceries even if the cart stays upright.
    if (
      !cart.hasSpilled &&
      Math.hypot(impulse.x, impulse.y, impulse.z) > 50
    ) {
      callbacks?.onSpill?.(cart);
      cart.hasSpilled = true;
    }
    if (cart.pendingRam.remainingSteps <= 0) cart.pendingRam = null;
  }

  // 5. Step world
  if (world && eventQueue) {
    world.step(eventQueue);
    Object.assign(_collisionCallbacks, callbacks);
    _collisionCallbacks.localCart = localCart;
    processCollisionEvents(world, eventQueue, allCarts, _collisionCallbacks, isHost);
  }
}
