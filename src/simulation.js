// simulation.js — core physics + arcade driving simulation (extracted)

import * as THREE from "three";
import { mark } from "./utils/perfSpans.js";
import { RAPIER } from "./physics/rapierInstance.js";
import { CONFIG } from "./config.js";
import * as GameState from "./stores/gameStore.js";
import { queueHostCollisionEvent } from "./hostCollisionBatch.js";
import { getNpcPersonality } from "./npcNames.js";
import { getRoundClockNowMs } from "./roundClock.js";
import { ChallengeTracker } from "./stores/challengeStore.js";
import { PROGRESSION_EVENTS } from "./progression/eventIds.js";
import { recordLocalSpillForMatchStats } from "./scoring/matchStats.js";
import {
  computeSoloRubberband,
  SOLO_RUBBERBAND_NEUTRAL,
} from "./utils/soloRubberband.js";
import { clamp } from "./utils.js";
import { recordDiagEvent } from "./utils/diagnostics.js";
import {
  applyEdgeChaseWeights,
  applyPersonalityMods,
  clampAiLeadDisplacement,
  getActiveAiDifficulty,
  getAiLeadTimeS,
  getEdgeChaseWeightMul,
  getPodiumContestMs,
  getRandomStopChance,
  getReachOuter,
  getStuckWindowMs,
  getTrailChaseMul,
  isHardTactics,
} from "./aiDifficulty.js";

/** When true, NPC chase/nitro use solo score rubberband (set from main for solo mode only). */
let _soloRubberbandActive = false;

/**
 * Enables solo-only AI rubberband. Multiplayer must leave this false.
 * @param {boolean} active
 */
export function setSoloRubberbandActive(active) {
  _soloRubberbandActive = Boolean(active);
}

/**
 * Live solo rubberband factors for NPC chase + nitro (neutral when inactive).
 * @param {Array<object> | null | undefined} netSlots
 * @returns {import("./utils/soloRubberband.js").SoloRubberbandFactors}
 */
export function getSoloRubberbandFactors(netSlots) {
  if (!_soloRubberbandActive) return SOLO_RUBBERBAND_NEUTRAL;
  const cfg = CONFIG.cart?.ramBoost?.soloRubberband;
  if (cfg && cfg.enabled === false) return SOLO_RUBBERBAND_NEUTRAL;
  const scores = GameState.getRoundState()?.scores || {};
  const factors = computeSoloRubberband(scores, netSlots, cfg);
  // * Hard: slightly less forgiving trail ease-off (stacks on rubberband).
  if (factors.band === "trail" && factors.chaseMul !== 1) {
    const scaled = getTrailChaseMul(factors.chaseMul, getActiveAiDifficulty());
    return { ...factors, chaseMul: scaled };
  }
  return factors;
}
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

// * Set at the top of each runFixedPhysicsStep so sub-helpers (suction credit refresh) can
// * host-gate authoritative-only side effects without threading isHost through every call.
let _stepIsHost = false;
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
// * Rammer's LIVE (post-collision) state — the knockback impulse reads this so forward-ram
// * feel matches the pre-fix game; attribution stays on the pre-step buffers above. (AI-1)
const _ramImpulseState = { pos: { x: 0, y: 0, z: 0 }, linvel: { x: 0, y: 0, z: 0 } };

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

/**
 * * Like {@link readRamStateInto}, but takes linvel from the cart's PRE-step snapshot —
 * * the closing velocity at the instant of contact, before Rapier's solver arrested it.
 *
 * Cart-on-cart ram qualification MUST read this. Post-step linvel is what the contact
 * left behind, and a reverse shove (reverseMaxSpeed 8 m/s) carries little momentum, so
 * the solver zeroes or bounces it in the same step — post-step reads ~0, the hit fails
 * `minSpeed`/alignment, and no ram is credited. The victim still gets knocked off by raw
 * contact response, so it reads "FELL OFF" with no attacker → no points (the reverse-ram
 * bug). Pre-step velocity is the same signal the floor-thud impact already trusts
 * (`_preStepLinvel`, populated at the top of runSimulationStep). Position stays post-step
 * (current translation) so rammer→victim direction is measured at the contact.
 *
 * @param {object} cart
 * @param {{ pos: { x: number, y: number, z: number }, linvel: { x: number, y: number, z: number } }} out
 * @returns {void}
 */
function readRamStateIntoPreStep(cart, out) {
  const body = cart.body;
  const p = body.translation();
  out.pos.x = p.x;
  out.pos.y = p.y;
  out.pos.z = p.z;
  // * Fall back to the live linvel if the pre-step snapshot hasn't been taken yet
  // * (first frame a cart exists, before runSimulationStep's capture loop).
  const lv = cart._preStepLinvel || body.linvel();
  out.linvel.x = lv.x;
  out.linvel.y = lv.y;
  out.linvel.z = lv.z;
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

function getBodyMass(body) {
  if (body && typeof body.mass === "function") return body.mass();
  return 1;
}

function planarSpeed(v) {
  return Math.hypot(v.x, v.z);
}

export function yawFromQuaternion(q) {
  const siny = 2 * (q.w * q.y + q.x * q.z);
  const cosy = 1 - 2 * (q.y * q.y + q.z * q.z);
  return Math.atan2(siny, cosy);
}

/**
 * * Ground-projected forward heading — where the cart's -Z nose actually points on
 * * the floor plane. Identical to the visual pipeline's YXZ Euler yaw
 * * (contactShadows.yawFromQuaternion), exact under any pitch/roll. Distinct from
 * * yawFromQuaternion above, whose cos term (z²) drifts under steep tilt — steering
 * * and AI are tuned against that one, so the two must not be merged.
 * @param {{ x: number, y: number, z: number, w: number }} q
 * @returns {number}
 */
export function headingYawFromQuat(q) {
  return Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.y * q.y + q.x * q.x));
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

export function wrapAngleRad(angle) {
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
 * @param {{ label?: string, hx: number, hy: number, hz: number, colliderLocalY: number, comY?: number, massMul?: number, baseMass?: number }} dims
 *   `comY` — center-of-mass height override (default -0.55 "weeble" low-CG).
 *   `massMul` / `baseMass` — optional life-cargo mass scale (CARGO-WT-1); pass stored
 *   base mass so repeated applies do not compound.
 */
export function applyCartMassPropertiesOverride(
  body,
  collider,
  { hx, hy, hz, colliderLocalY, comY = -0.55, massMul = 1, baseMass: baseMassOpt },
) {
  let baseMass = baseMassOpt ?? collider?.mass?.() ?? body?.mass?.() ?? 1;
  if (!Number.isFinite(baseMass) || baseMass <= 0) baseMass = 1;
  const mul = Number.isFinite(massMul) && massMul > 0 ? massMul : 1;
  const mass = baseMass * mul;

  if (typeof collider?.setDensity === "function") {
    collider.setDensity(0);
  }

  const targetCom = new RAPIER.Vector3(0, comY, 0);
  const comOffset = { x: 0, y: comY - colliderLocalY, z: 0 };

  const { ix, iy, iz } = principalInertiaForTranslatedBox(mass, hx, hy, hz, comOffset);

  body.setAdditionalMassProperties(
    mass,
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
 * HOLE-FRICTION-COMBINE-1 — which friction *mode* a cart should be in.
 *
 * Rapier defaults both friction and restitution combine rules to Average
 * (`ColliderDesc` in @dimforge/rapier3d). Setting cart μ to holeAssist.lowFriction
 * (0.05) while the deck is 0.8 therefore felt like ~0.425, not 0.05. Mode `hole`
 * pairs low μ with FrictionCombineRule.Min so the authored value wins; mode
 * `normal` restores Average so floors keep the grip they were tuned against
 * (gotchas.md — floors deliberately keep Average; walls already own Min).
 *
 * Min is collider-wide while active (cart–cart and other contacts slip too).
 * Accepted for v1 — there is no cheap "Min only vs floor" without contact hooks.
 *
 * @param {{
 *   overhanging?: boolean,
 *   centerHoleEnabled?: boolean,
 *   respawning?: boolean,
 * }} opts
 * @returns {"normal" | "hole"}
 */
export function resolveCartFrictionMode(opts = {}) {
  if (opts.respawning) return "normal";
  if (opts.centerHoleEnabled === false) return "normal";
  if (!opts.overhanging) return "normal";
  return "hole";
}

/**
 * Rapier CoefficientCombineRule values. Prefer the live enum after initRapier();
 * numeric fallbacks match the crate (Average=0, Min=1) so unit tests with mock
 * colliders do not need WASM.
 *
 * @param {"normal" | "hole"} mode
 * @returns {number}
 */
function frictionCombineRuleForMode(mode) {
  const rules = RAPIER?.CoefficientCombineRule;
  if (mode === "hole") return rules?.Min ?? 1;
  return rules?.Average ?? 0;
}

/**
 * Applies cart friction + combine rule for `mode`, writing WASM only on transition.
 * Cache lives on `cart._frictionMode` — every other setFriction site must clear it
 * or go through this helper (see applyGeometryUnstick).
 *
 * @param {object | null | undefined} cart
 * @param {"normal" | "hole"} mode
 * @returns {void}
 */
export function applyCartFrictionMode(cart, mode) {
  if (!cart?.collider) return;
  const next = mode === "hole" ? "hole" : "normal";
  if (cart._frictionMode === next) return;

  const friction =
    next === "hole"
      ? (CONFIG.record.holeAssist?.lowFriction ?? 0)
      : (CONFIG.cart.friction ?? 1.1);

  if (typeof cart.collider.setFriction === "function") {
    cart.collider.setFriction(friction);
  }
  if (typeof cart.collider.setFrictionCombineRule === "function") {
    cart.collider.setFrictionCombineRule(frictionCombineRuleForMode(next));
  }
  cart._frictionMode = next;
}

/**
 * Applies continuous arena contact response for one cart.
 *
 * Flat record driving uses Rapier-native linear/angular damping set at body spawn —
 * no per-frame planar impulses on the open floor. Manual X/Z damping impulses fight the
 * trimesh contact solver and cause micro-hopping.
 *
 * Center-hole: once the oriented footprint overhangs the assist lip, hole mode drops
 * friction to `holeAssist.lowFriction` with FrictionCombineRule.Min (HOLE-FRICTION-COMBINE-1)
 * and a gentle inward + downward assist (ramped by overhang depth) helps the cart slide
 * off the chamfer and tumble through. Carts fully on the flat annulus keep normal grip
 * and receive no assist. Fall scoring still happens via `CONFIG.fall.yThreshold` in gameFlow.
 *
 * Reads pos/rot from the module scratch cache (populated by the caller via
 * {@link readBodyStateIntoScratch}); avoids redundant Rapier getter allocations.
 *
 * @param {object} cart Cart entity with Rapier body/collider.
 * @param {number} dtFixed Fixed physics timestep in seconds (drives hole assist impulses).
 */
function applyEnvironmentResponse(cart, dtFixed) {
  if (!cart?.body || !cart.collider) return;

  // * Mid-fall / shatter window: force normal mode so Min does not stick across
  // * respawn. Do not early-return before the restore (HOLE-FRICTION-COMBINE-1).
  const respawning = cart.respawnAtMs != null;
  const centerHoleEnabled = !(
    CONFIG.record.centerHole && CONFIG.record.centerHole.enabled === false
  );

  if (respawning || !centerHoleEnabled) {
    applyCartFrictionMode(cart, "normal");
    return;
  }

  const { overhanging, commit, dirX, dirZ } = writeCenterHoleOverhangState(
    cart,
    _scratchPos,
    _holeOverhangState,
  );

  const mode = resolveCartFrictionMode({
    overhanging,
    centerHoleEnabled: true,
    respawning: false,
  });
  applyCartFrictionMode(cart, mode);

  if (mode !== "hole") return;

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

  // * Re-arm charge while boost is held and we are not already charging / in nitro.
  // * Non-host reconcile replays older nitro:false frames which cancel charge; keydown
  // * only fires once, so the bar stayed dead until re-press (NH-BOOST retest). Host
  // * remotes already re-arm via rising-edge drain → triggerRamBoost.
  if (
    chargeCfg?.enabled
    && axis.boostHeld
    && !cart.isChargingBoost
    && typeof callbacks?.triggerRamBoost === "function"
  ) {
    callbacks.triggerRamBoost(cart, nowMs, {
      silent: Boolean(callbacks.isReconcileReplay),
    });
  }

  // * Auto-Charge Boost: while charging, standard nitro is suppressed. The cart still
  // * drives normally (grip/yaw/drift untouched). Three release paths:
  // *   1. Early release > 100ms — proportional burst (tap = small dash, hold = big boom).
  // *   2. Early release <= 100ms — silent cancel (no boost, just stop SFX).
  // *   3. Full charge ≥ boostChargeTimeMs — max burst auto-release (existing behavior).
  if (chargeCfg?.enabled && cart.isChargingBoost) {
    const chargeElapsedMs = nowMs - cart.boostChargeStartedAtMs;
    // * Reconcile replays older nitro:false samples that would cancel a live hold and
    // * reset charge progress (inconsistent fire). Only honor release/cancel on live ticks;
    // * full-charge auto-release still runs in replay so host-matched windows can complete.
    const honorRelease = !callbacks?.isReconcileReplay;

    // * Early-release: player let go of the boost button before full charge.
    if (axis.boostCancel) {
      cancelNpcBoostCharge(cart, nowMs, callbacks);
    } else if (!axis.boostHeld && honorRelease) {
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
        // * Gold energy trails only for a near-full release; early taps stay simple cart neon.
        cart.nitroStreakCharged = proportionalMultiplier >= 0.85;

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
    } else if (axis.boostHeld && chargeElapsedMs >= chargeCfg.boostChargeTimeMs) {
      // * Full-charge auto-release: maximum burst.
      cart.isChargingBoost = false;
      cart.boostChargeMultiplier = chargeCfg.boostMaxMultiplier;
      cart.boostCooldownUntilMs = nowMs + chargeCfg.boostCooldownMs;
      // * Charge boost gets a longer nitro window than instant boost (1.5× duration).
      cart.ramBoostActiveUntilMs = nowMs + rb.durationSec * 1.5 * 1000;
      cart.lastRamBoostTimeMs = nowMs;
      cart.ramBoostStreakCarry = 0;
      // * Full auto-release always gets the gold energy trail.
      cart.nitroStreakCharged = true;

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
  // * Living Cargo top-heavy handling — a fuller cart (higher round score) slides wider.
  // * Life-cargo weight (cargoLoad.js): baseline grip stays 1.0; boss slides wider.
  const cargoWeight01 = cart.cargoFullness01 ?? 0;
  const cargoGripFullFactor = CONFIG.cargo?.gripFullFactor;
  if (cargoGripFullFactor != null && cargoWeight01 > 0) {
    const full = Math.max(1, CONFIG.cargo?.fullScore ?? 8);
    const baselineW = (CONFIG.cargo?.baselinePoints ?? 3) / full;
    if (cargoWeight01 > baselineW && baselineW < 1) {
      const t = (cargoWeight01 - baselineW) / (1 - baselineW);
      grip *= THREE.MathUtils.lerp(1, cargoGripFullFactor, t);
    }
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
    // * Life-cargo drive curve — stripped is fast/glass, boss is slower/chaseable.
    // * Baseline (spawn) stays at 1.0. Nitro always wins while its window is open.
    if (!nitroForward && axis.forward > 0) {
      const cargoCfg = CONFIG.cargo;
      if (cargoCfg) {
        const w = cart.cargoFullness01 ?? 0;
        const full = Math.max(1, cargoCfg.fullScore ?? 8);
        const baselineW = (cargoCfg.baselinePoints ?? 3) / full;
        const speedAt0 = cargoCfg.driveSpeedAtStripped ?? 1;
        const speedAt1 = cargoCfg.driveSpeedAtBoss ?? 1;
        const accelAt0 = cargoCfg.driveAccelAtStripped ?? 1;
        const accelAt1 = cargoCfg.driveAccelAtBoss ?? 1;
        let speedMul = 1;
        let accelMul = 1;
        if (baselineW <= 1e-6) {
          speedMul = THREE.MathUtils.lerp(speedAt0, speedAt1, w);
          accelMul = THREE.MathUtils.lerp(accelAt0, accelAt1, w);
        } else if (w <= baselineW) {
          const t = w / baselineW;
          speedMul = THREE.MathUtils.lerp(speedAt0, 1, t);
          accelMul = THREE.MathUtils.lerp(accelAt0, 1, t);
        } else {
          const t = (w - baselineW) / (1 - baselineW);
          speedMul = THREE.MathUtils.lerp(1, speedAt1, t);
          accelMul = THREE.MathUtils.lerp(1, accelAt1, t);
        }
        targetSpeed = CONFIG.driving.maxSpeed * speedMul;
        accelRate = CONFIG.driving.accel * accelMul;
      }
    }
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
  // * Storerooms registers a suctionBand → holes pull carts in (replaces the outward rescue).
  // * Other square-void levels (none today) fall back to the gentle lip rescue.
  if (_levelHazards?.suctionBand) {
    applySquareHoleSuction(cart, dtFixed, nowMs);
  } else {
    applySquareHoleLipAssist(cart, dtFixed, nowMs);
  }
  rereadLinvelIntoScratch(cart);
  // * Solid un-climbable obstacles (Storerooms furniture pile) shove pressing carts back out.
  applyWallKeepOutBounce(cart, dtFixed);
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
 * Hard-cancels a host NPC charge when its target or path becomes unsafe. This differs
 * from the human early-release branch: it never applies a burst or opens nitro.
 *
 * @param {object} cart
 * @param {number} nowMs
 * @param {{ onBoostCancel?: (cart: object) => void }} [callbacks]
 * @returns {boolean} true when a live charge was cancelled
 */
export function cancelNpcBoostCharge(cart, nowMs, callbacks) {
  if (!cart?.isChargingBoost) return false;
  cart.isChargingBoost = false;
  cart.boostChargeStartedAtMs = 0;
  cart.boostChargeMultiplier = 1;
  cart.nitroStreakCharged = false;
  // * NPC instant, charged, and cancelled attempts share one cooldown family.
  cart.lastRamBoostTimeMs = nowMs;
  callbacks?.onBoostCancel?.(cart);
  return true;
}

// * Storerooms void suction (playtest 2026-07-15: the outward lip rescue made the holes feel
// * safe and kills near-impossible). Replaces that rescue on any level that registers a
// * `suctionBand` — a cart in the flat-floor band just outside a void is dragged toward it,
// * pull ramping with depth so the OUTER half is escapable at full throttle while deep capture,
// * or a shove, commits. Symmetric across humans and NPCs (asymmetric physics reads as
// * cheating); bots keep clear via the widened keep-out in the level's aiHazards. The band
// * WIDTH is owned by the level (`_levelHazards.suctionBand`); these are the force-feel knobs.
const SUCTION_PEAK_ACCEL = 33; // m/s² inward at the floor lip, linear to 0 at the band's outer edge (+10% per playtest 2026-07-16)
const SUCTION_CAPTURE_GAIN = 2.4; // extra inward m/s² per m/s of shove-in velocity (depth-scaled)
const SUCTION_CREDIT_DEPTH = 0.4; // only keep kill-credit alive once this deep in the band
const SUCTION_CREDIT_KEEPALIVE_MS = 2600; // recent-ram window refreshed while suction holds a cart
const SUCTION_CREDIT_THROTTLE_MS = 500; // min gap between credit re-stamps per cart

/**
 * * Pure suction solve for a point inside a registered `suctionBand`. Returns the inward pull
 * acceleration (m/s²) and unit direction toward the nearest void, plus band depth (0 at the
 * outer edge → 1 at the lip), or null when outside every band or no band is registered.
 * Exported for tests; the impulse application + credit keepalive live in applySquareHoleSuction.
 *
 * @param {number} px
 * @param {number} pz
 * @param {number} vx Planar velocity X (for the shove-in capture assist).
 * @param {number} vz Planar velocity Z.
 * @returns {{ inwardX: number, inwardZ: number, accel: number, depth: number } | null}
 */
export function computeSquareHoleSuction(px, pz, vx, vz) {
  const bandWidth = _levelHazards?.suctionBand;
  if (!bandWidth) return null;
  const { cheb, hole } = nearestSquareHole(px, pz);
  const depth = clamp((_levelHazards.half + bandWidth - cheb) / bandWidth, 0, 1);
  if (depth <= 0) return null;

  const dx = px - hole.x;
  const dz = pz - hole.z;
  const len = Math.hypot(dx, dz) || 1;
  const inwardX = -dx / len;
  const inwardZ = -dz / len;

  const towardHole = vx * inwardX + vz * inwardZ; // + = already sliding / being shoved inward
  let accel = depth * SUCTION_PEAK_ACCEL;
  if (towardHole > 0) accel += towardHole * SUCTION_CAPTURE_GAIN * depth;

  return { inwardX, inwardZ, accel, depth };
}

/**
 * * Storerooms void suction — see the SUCTION_* block. Reads pos + linvel from the module
 * scratch cache (populated by the caller). The force runs wherever the cart's physics is
 * simulated (host: all carts; client: its predicted local cart) so prediction stays consistent;
 * the kill-credit refresh is host-gated via `_stepIsHost`.
 *
 * @param {object} cart
 * @param {number} dtFixed
 * @param {number} nowMs
 */
function applySquareHoleSuction(cart, dtFixed, nowMs) {
  if (!_levelHazards?.suctionBand || !cart?.body || cart.respawnAtMs != null || !dtFixed) return;

  const pos = _scratchPos;
  const lv = _scratchLinvel;
  const s = computeSquareHoleSuction(pos.x, pos.z, lv.x, lv.z);
  if (!s) return;

  const mass = getBodyMass(cart.body);
  const mag = s.accel * mass * dtFixed;
  _impulse.x = s.inwardX * mag;
  _impulse.y = 0;
  _impulse.z = s.inwardZ * mag;
  cart.body.applyImpulse(_impulse, true);
  cart.body.wakeUp();

  // * Kill-credit keepalive (host only): while suction drags a just-rammed cart in, keep the
  // * shover's attribution fresh so a slow drag-to-fall still credits them, not "fell off". The
  // * ordinary ram→fall path already fits inside hitWindowMs; this only covers lingering captures.
  if (
    _stepIsHost
    && s.depth > SUCTION_CREDIT_DEPTH
    && (cart.slotIndex ?? -1) >= 0
    && cart.lastRammedAtMs != null
    && nowMs - cart.lastRammedAtMs < SUCTION_CREDIT_KEEPALIVE_MS
    && nowMs - (cart.suctionCreditStampMs ?? 0) > SUCTION_CREDIT_THROTTLE_MS
  ) {
    const prior = GameState.getLastHitBy().get(cart.slotIndex);
    if (prior && prior.attackerSlotIndex >= 0 && prior.attackerSlotIndex !== cart.slotIndex) {
      GameState.recordHit(
        cart.slotIndex,
        prior.attackerSlotIndex,
        prior.wasCritical,
        prior.impactSpeed,
        prior.fromPodium,
      );
      cart.suctionCreditStampMs = nowMs;
    }
  }
}

// * Wall keep-out bounce (Storerooms furniture pile). Rapier's contact solver alone cannot
// * free a cart pressing into the hull: arcade drive re-feeds the contact every tick, and
// * applyGeometryUnstick only arms after 2s under 1.2 m/s AND under 0.45m of travel, so a cart
// * sawing the face at 2-3 m/s never qualifies. STORE-PILE-1's 0.9m origin pad missed
// * head-on contact (body origin sits ~hz outside the hull). Depth is now measured from the
// * hull surface to the cart's forward half-extent. Drive-strip removes only this frame's
// * inward drive increment — not a full linvel reflect, which would throw into the corner
// * voids. Symmetric across humans and NPCs. Only `wall` zones qualify, so Sundial's
// * drivable podium is untouched.
const WALL_BOUNCE_PRESS = 0.3; // m extra press beyond cart hz where the pad still counts
const WALL_BOUNCE_PEAK_ACCEL = 17; // m/s² outward at full penetration, for a stationary wedge
const WALL_BOUNCE_MAX_DV = 4; // m/s outward cap per step — stops a hole-feeding launch
const WALL_BOUNCE_MAX_Y = 1.6; // m — above this a cart is ON the pile, not wedged against it

/** Pad reach from the keep-out surface: cart forward half-extent + press. */
function wallBounceReach() {
  return CONFIG.cart.size.z / 2 + WALL_BOUNCE_PRESS;
}

/**
 * * Pure bounce solve for a body origin near a `wall` circular keep-out. Depth is 0 when
 * the origin is `reach` metres outside the keep-out radius (nose just short of the hull)
 * and 1 at the keep-out surface. Walk-out accel does not depend on speed — drive-strip
 * lives in {@link resolveWallKeepOutDeltaV}. Exported for tests.
 *
 * @param {number} px
 * @param {number} pz
 * @param {number} [_vx] unused; kept so call sites and tests stay stable
 * @param {number} [_vz] unused
 * @returns {{ outX: number, outZ: number, accel: number, depth: number } | null}
 */
export function computeWallKeepOutBounce(px, pz, _vx, _vz) {
  const zones = (_levelHazards ?? _octagonHazards)?.circularKeepOuts;
  if (!zones?.length) return null;

  const reach = wallBounceReach();
  let best = null;
  let bestDepth = 0;
  for (let i = 0; i < zones.length; i += 1) {
    const ko = zones[i];
    if (!ko.wall) continue;
    const dx = px - ko.x;
    const dz = pz - ko.z;
    const dist = Math.hypot(dx, dz);
    const surfaceGap = dist - ko.radius;
    const depth = clamp((reach - surfaceGap) / reach, 0, 1);
    if (depth <= 0 || depth <= bestDepth) continue;
    const len = dist || 1;
    bestDepth = depth;
    best = dist > 1e-6
      ? { outX: dx / len, outZ: dz / len, depth }
      : { outX: 1, outZ: 0, depth };
  }
  if (!best) return null;

  return { outX: best.outX, outZ: best.outZ, accel: best.depth * WALL_BOUNCE_PEAK_ACCEL, depth: best.depth };
}

/**
 * * Outward planar Δv for one physics step. Walk-out accel plus (when still driving in)
 * this frame's inward drive increment, capped so a ram cannot launch into a void.
 *
 * @param {number} vx
 * @param {number} vz
 * @param {{ outX: number, outZ: number, depth: number, accel: number }} bounce
 * @param {number} dtFixed
 * @returns {{ dvx: number, dvz: number }}
 */
export function resolveWallKeepOutDeltaV(vx, vz, bounce, dtFixed) {
  if (!bounce || !dtFixed) return { dvx: 0, dvz: 0 };
  const inward = -(vx * bounce.outX + vz * bounce.outZ);
  const maxStrip = (CONFIG.cart.ramBoost?.boostedAccel ?? CONFIG.driving.accel) * dtFixed;
  let outwardDv = bounce.accel * dtFixed;
  if (inward > 0) outwardDv += Math.min(inward, maxStrip);
  outwardDv = Math.min(outwardDv, WALL_BOUNCE_MAX_DV);
  return { dvx: bounce.outX * outwardDv, dvz: bounce.outZ * outwardDv };
}

/**
 * * Storerooms furniture-pile bounce — see the WALL_BOUNCE_* block. Reads pos + linvel from
 * the module scratch cache (populated by the caller). Runs wherever the cart's physics is
 * simulated (host: all carts; client: its predicted local cart) so prediction stays consistent.
 *
 * @param {object} cart
 * @param {number} dtFixed
 */
function applyWallKeepOutBounce(cart, dtFixed) {
  if (!cart?.body || cart.respawnAtMs != null || !dtFixed) return;

  const pos = _scratchPos;
  // * A cart launched onto the pile top is inside the radius but not wedged — leave it be.
  if (pos.y > WALL_BOUNCE_MAX_Y) return;

  const lv = _scratchLinvel;
  const b = computeWallKeepOutBounce(pos.x, pos.z, lv.x, lv.z);
  if (!b) return;

  const d = resolveWallKeepOutDeltaV(lv.x, lv.z, b, dtFixed);
  if (d.dvx === 0 && d.dvz === 0) return;

  const mass = getBodyMass(cart.body);
  _impulse.x = d.dvx * mass;
  _impulse.y = 0;
  _impulse.z = d.dvz * mass;
  cart.body.applyImpulse(_impulse, true);
  cart.body.wakeUp();
}

/**
 * * Backrooms void lip — outward impulse so carts (especially NPCs) don't slide down chamfers.
 * Superseded by suction on levels that register a `suctionBand` (see applyArcadeControls);
 * retained for any future square-void level that wants the gentle rescue instead.
 *
 * Reads pos + linvel from the module scratch cache (populated by the caller); avoids
 * redundant Rapier getter allocations.
 *
 * @param {object} cart
 * @param {number} dtFixed
 */
function applySquareHoleLipAssist(cart, dtFixed, nowMs) {
  if (!_levelHazards?.arenaHalf || !cart?.body || cart.respawnAtMs != null || !dtFixed) return;

  // * Stand down after a qualified ram: this outward shove was fighting the shover's
  // * kill — a rammed cart got rescued from the very hole it was knocked toward, which
  // * read as "my hit did nothing" and made Storerooms kills feel impossible
  // * (playtest 2026-07-15). The window comfortably outlasts the 3-step ram spread.
  if (nowMs != null && cart.lastRammedAtMs != null && nowMs - cart.lastRammedAtMs < 1200) return;

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
  // * The local human can see the void and may be committing to a deliberate edge play, so
  // * give them only a faint safety nudge instead of a full outward shove that fights their
  // * input. NPCs (and remote carts) keep the full assist — they rely on it to not slide in.
  const assistScale = cart === _collisionCallbacks.localCart ? 0.4 : 1;
  const baseOut = (3 + urgency * 6) * mass * dtFixed * assistScale;
  _impulse.x = outwardX * baseOut;
  _impulse.z = outwardZ * baseOut;
  const boost = towardHole * 8 * mass * dtFixed * assistScale;
  _impulse.x += outwardX * boost;
  _impulse.z += outwardZ * boost;
  _impulse.y = urgency * 2 * mass * dtFixed * assistScale;
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
  // * HOLE-FRICTION-COMBINE-1 — hole mode owns friction while overhanging. Unstick
  // * impulse may still free a wedge; the μ cut must not overwrite lowFriction/Min
  // * (call order: env then unstick). Non-hole: cut μ and clear the mode cache so
  // * the next env pass re-applies normal cleanly.
  if (cart._frictionMode === "hole") return;
  if (cart.collider?.setFriction) {
    cart.collider.setFriction((CONFIG.cart.friction ?? 1.1) * 0.35);
    cart._frictionMode = null;
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
export function getRammingQualificationScore(rammerState, victimState) {
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
export function resolveCartRamCollision(c1, c2) {
  readRamStateIntoPreStep(c1, _ramStateA);
  readRamStateIntoPreStep(c2, _ramStateB);

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
 * Positions come from the pre-step state fetched by {@link resolveCartRamCollision};
 * the knockback/crit side re-reads the rammer's LIVE post-collision velocity from
 * Rapier (see the AI-1 decouple comment below), and the live alignment check here can
 * fail independently of the upstream pre-step qualification — that failure is exactly
 * the "attribution without knockback" path a reverse shove takes.
 *
 * @param {object} rammer Attacking cart entity.
 * @param {object} victim Target cart entity.
 * @param {{ pos: { x: number, y: number, z: number }, linvel: { x: number, y: number, z: number } }} rammerState
 * @param {{ pos: { x: number, y: number, z: number }, linvel: { x: number, y: number, z: number } }} victimState
 * @param {object} callbacks Injected helpers (FX, local cart, host broadcast).
 * @param {boolean} isHost Whether this client is the room host.
 */
export function applyRammingImpulse(rammer, victim, rammerState, victimState, callbacks, isHost, nowMs) {
  const playCollisionRef = callbacks?.playCollision;
  const spawnTrashBurstRef = callbacks?.spawnTrashBurst;

  // * Knockback + crit read the rammer's LIVE (post-collision) velocity, so forward-ram feel
  // * matches the pre-fix game. A near-stationary reverse shove reads ~0 here → no ram impulse
  // * (the victim is still moved by raw contact response, exactly as before). Attribution is
  // * DECOUPLED below: resolveCartRamCollision already qualified this pair from the PRE-step
  // * closing velocity, so the KO credits the shover even when this live velocity is ~0. (AI-1)
  readRamStateInto(rammer, _ramImpulseState);
  const rv = _ramImpulseState.linvel;
  const speed = planarSpeed(rv);

  const rp = rammerState.pos;
  const vp = victimState.pos;
  _toVictim.set(vp.x - rp.x, 0, vp.z - rp.z);
  const haveToVictim = _toVictim.lengthSq() >= 1e-6;
  if (haveToVictim) _toVictim.normalize();

  const isRammerBoosting = nowMs <= (rammer.ramBoostActiveUntilMs || 0);
  let fxIntensity = 0;

  // * Knockback impulse — applied only with real live closing velocity aimed at the victim.
  _planarDir.set(rv.x, 0, rv.z);
  const dirLen = _planarDir.length();
  if (speed >= CONFIG.ramming.minSpeed && dirLen > 1e-6 && haveToVictim) {
    _planarDir.multiplyScalar(1 / dirLen);
    if (_planarDir.dot(_toVictim) >= CONFIG.ramming.alignmentDotMin) {
      const vv = victimState.linvel;
      const closingSpeed = Math.max(speed, speed + (-(vv.x * _planarDir.x + vv.z * _planarDir.z)));

      const victimWeight01 = victim.cargoFullness01 ?? 0;
      const cargoCfg = CONFIG.cargo;
      let cargoRamIncoming = 1;
      if (cargoCfg) {
        const full = Math.max(1, cargoCfg.fullScore ?? 8);
        const baselineW = (cargoCfg.baselinePoints ?? 3) / full;
        const at0 = cargoCfg.ramIncomingAtStripped ?? 1;
        const at1 = cargoCfg.ramIncomingAtBoss ?? 1;
        if (baselineW <= 1e-6) {
          cargoRamIncoming = THREE.MathUtils.lerp(at0, at1, victimWeight01);
        } else if (victimWeight01 <= baselineW) {
          cargoRamIncoming = THREE.MathUtils.lerp(at0, 1, victimWeight01 / baselineW);
        } else {
          cargoRamIncoming = THREE.MathUtils.lerp(
            1,
            at1,
            (victimWeight01 - baselineW) / (1 - baselineW),
          );
        }
      }
      const impulseMagBase = Math.max(
        0,
        Math.min(
          CONFIG.ramming.strength * closingSpeed * getBodyMass(victim.body) * cargoRamIncoming,
          CONFIG.ramming.maxImpulse
        )
      );
      const boostMul = CONFIG.ramming.boostImpulseMultiplier ?? 2;
      const impulseMag = isRammerBoosting ? impulseMagBase * boostMul : impulseMagBase;
      fxIntensity = Math.min(impulseMag / CONFIG.ramming.maxImpulse, 1.35);
      const fxOpts = { isBoosting: isRammerBoosting };

      const impulse = { x: _planarDir.x * impulseMag, y: 0, z: _planarDir.z * impulseMag };

      // * Host plays FX locally; non-host normally replays from the snapshot collisions[] tail
      // * so prediction did not double-spawn particles. NH-HIT: non-host still feels late
      // * rams vs NPCs (RTT + input jitter + 40Hz snap) even with a strong host (cap-89/90).
      // * When the local cart is the rammer on the live prediction path, fire presentation
      // * immediately; note the pair into the collision FX dedupe so the host tail is quiet
      // * for ~250ms (same window as NET-PRES-1). Reconcile replay keeps FX null.
      const localRammerOptimistic =
        !isHost
        && !callbacks?.isReconcileReplay
        && callbacks?.localCart === rammer
        && fxIntensity > 0;
      if (isHost || localRammerOptimistic) {
        if (playCollisionRef) {
          playCollisionRef(fxIntensity, fxOpts);
        }
        if (spawnTrashBurstRef && GameState.getRoundState().phase === "running") {
          const midpoint = { x: (rp.x + vp.x) / 2, y: (rp.y + vp.y) / 2, z: (rp.z + vp.z) / 2 };
          spawnTrashBurstRef(midpoint, fxIntensity, "cart", fxOpts);
        }
        if (callbacks?.onLocalRamImpact && callbacks.localCart === rammer) {
          callbacks.onLocalRamImpact(fxIntensity, isRammerBoosting);
        } else if (isHost && callbacks?.onLocalHitTaken && callbacks.localCart === victim) {
          // * Hit-from direction in world XZ: from victim toward rammer (where the blow came from).
          // * HUD maps this into cart-local sides (left/right/front/rear → screen edges).
          // * Host-only here — non-host victim feedback still comes from the collision tail.
          callbacks.onLocalHitTaken(
            fxIntensity,
            isRammerBoosting,
            -_toVictim.x,
            -_toVictim.z,
          );
        }
        if (callbacks?.onCartImpactSquash) {
          callbacks.onCartImpactSquash(rammer, victim, fxIntensity);
        }
        if (localRammerOptimistic) {
          const slotA = rammer.slotIndex;
          const slotB = victim.slotIndex;
          if (typeof slotA === "number" && typeof slotB === "number") {
            callbacks.noteOptimisticCollisionFx?.(slotA, slotB, slotA);
          }
        }
      }

      // Spread impulse
      const steps = CONFIG.ramming.spreadSteps;
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
      victim.lastRamTimeMs = nowMs;
      rammer.lastRamTimeMs = nowMs;
    }
  }

  // Stage A: record last hit for scoring attribution (host only) and update combo tier. Runs for
  // the pre-qualified pair regardless of the live impulse above, so a reverse shove (knocked off
  // by contact, ~0 live velocity) still credits the shover its KO + points. (AI-1)
  const nowPerf = nowMs;
  const attackerSlotIndex = rammer.slotIndex ?? -1;
  const victimSlotIndex = victim.slotIndex ?? -1;
  if (isHost && attackerSlotIndex >= 0 && victimSlotIndex >= 0 && !victim.respawnAtMs && !victim.isSuddenDeathSpectator) {
    // * Critical hit is velocity-based (decision D1): a fast ram, not a nitro-boosted one.
    // * `speed` is the rammer's live planar speed at contact (m/s); the KO Event carries it as
    // * impactSpeed and derives the critical bonus. A reverse shove is slow → impactSpeed ~0,
    // * never critical (matches its gentle feel).
    const impactSpeed = speed;
    const wasCritical = impactSpeed >= (CONFIG.scoring?.criticalVelocityThreshold ?? Infinity);
    // * High-ground credit (Sundial podium): captured at contact time — the attacker
    // * may roll off the podium before the victim actually splashes down.
    const fromPodium = isOnPodiumHighGround(rp.x, rp.z);
    GameState.recordHit(victimSlotIndex, attackerSlotIndex, wasCritical, impactSpeed, fromPodium);
    // * Stamped for applySquareHoleLipAssist: a just-rammed cart is being deliberately
    // * shoved, and the lip assist must not fight the shover's kill. Set here (not at
    // * the impulse) so solver-arrested reverse shoves count too (AI-1).
    victim.lastRammedAtMs = nowPerf;
  }

  // Update combo tier for attacker and refresh local store if rammer is local player.
  // * Gated on fxIntensity > 0 — a real knockback impulse landed — so combo stays tied to
  // * actual rams (its pre-fix behavior). A contactless reverse shove or a solver-arrested
  // * head-on still credits the KO via recordHit above, but does NOT inflate the combo streak.
  // * isReconcileReplay: client prediction already applied combo/challenges on the live
  // * path; replaying pending inputs must not re-increment tiers or double-count
  // * combo_t2/t3/spill challenges (non-host reconcile at ~40 Hz).
  if (
    !callbacks?.isReconcileReplay
    && (isHost || callbacks?.localCart === rammer)
    && fxIntensity > 0
    && attackerSlotIndex >= 0
    && victimSlotIndex >= 0
    && !victim.respawnAtMs
    && !victim.isSuddenDeathSpectator
  ) {
    const maxTier = CONFIG.combo?.maxTier ?? 3;
    const decayMs = CONFIG.combo?.decayMs ?? 5000;
    rammer.comboTier = Math.min((rammer.comboTier || 0) + 1, maxTier);
    rammer.comboExpiryMs = nowPerf + decayMs;

    if (callbacks?.localCart === rammer) {
      GameState.setLocalCombo(rammer.comboTier, rammer.comboExpiryMs);
      if (rammer.comboTier === 2) ChallengeTracker.record(PROGRESSION_EVENTS.COMBO_T2);
      if (rammer.comboTier === 3) ChallengeTracker.record(PROGRESSION_EVENTS.COMBO_T3);
      if (!victim.hasSpilled) {
        ChallengeTracker.record(PROGRESSION_EVENTS.SPILL);
        recordLocalSpillForMatchStats();
      }
    }
  }

  // Host collision FX queued for batched send — only when a knockback impulse actually landed
  // (a scored-but-contactless reverse shove sends no ram FX, matching the pre-fix game).
  if (isHost && fxIntensity > 0) {
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
 *   suctionBand?: number,
 *   circularKeepOuts?: {
 *     x: number, z: number, radius: number, margin?: number,
 *     solid?: boolean, wall?: boolean,
 *   }[],
 *   acLaunchers?: readonly object[],
 * } | null}
 */
let _levelHazards = null;

/** @type {readonly object[] | null} */
let _levelAcLaunchers = null;

/**
 * Computes the fixed launch velocity for a Night Shift AC unit. Route units aim at a roof
 * center from the cart's live position; the chaos unit cancels planar travel and fires straight
 * up. Exported so the authored route and strength contract can be tested without Rapier.
 *
 * @param {object} launcher
 * @param {{ x: number, y?: number, z: number }} position
 * @returns {{ x: number, y: number, z: number } | null}
 */
export function computeAcLauncherVelocity(launcher, position) {
  if (!launcher || !position || !Number.isFinite(launcher.verticalSpeed)) return null;
  if (launcher.kind === "vertical") {
    return { x: 0, y: launcher.verticalSpeed, z: 0 };
  }
  if (
    launcher.kind !== "route"
    || !Number.isFinite(launcher.targetX)
    || !Number.isFinite(launcher.targetZ)
    || !Number.isFinite(launcher.horizontalSpeed)
  ) {
    return null;
  }
  const dx = launcher.targetX - position.x;
  const dz = launcher.targetZ - position.z;
  const distance = Math.hypot(dx, dz);
  if (distance < 1e-4) return { x: 0, y: launcher.verticalSpeed, z: 0 };
  return {
    x: (dx / distance) * launcher.horizontalSpeed,
    y: launcher.verticalSpeed,
    z: (dz / distance) * launcher.horizontalSpeed,
  };
}

/**
 * Applies at most one level AC launch to a cart. A launcher stays latched until the cart exits
 * its footprint, which prevents the vertical unit from re-firing as the same airborne cart
 * descends. The independent cooldowns still allow deliberate chains across different units.
 *
 * @param {object} cart
 * @param {number} nowMs
 * @returns {string | null} Fired launcher id.
 */
function applyLevelAcLauncher(cart, nowMs) {
  const launchers = _levelAcLaunchers;
  if (!launchers?.length || !cart?.body || cart.respawnAtMs != null) return null;

  const position = cart.body.translation();
  const state = cart._acLauncherState ??= {
    latched: Object.create(null),
    cooldownUntilMs: Object.create(null),
  };

  for (const launcher of launchers) {
    const halfWidth = launcher.halfWidth ?? 2.1;
    const insideXz =
      Math.abs(position.x - launcher.x) <= halfWidth
      && Math.abs(position.z - launcher.z) <= halfWidth;
    if (!insideXz) {
      state.latched[launcher.id] = false;
      continue;
    }
    if (
      state.latched[launcher.id]
      || position.y > (launcher.maxBodyY ?? 1.55)
      || nowMs < (state.cooldownUntilMs[launcher.id] ?? Number.NEGATIVE_INFINITY)
    ) {
      continue;
    }

    const current = cart.body.linvel();
    if (Math.abs(current.y) > (launcher.maxVerticalSpeed ?? 2)) continue;
    const velocity = computeAcLauncherVelocity(launcher, position);
    if (!velocity) continue;
    const rawMass = cart.body.mass?.() ?? 1;
    const mass = Number.isFinite(rawMass) && rawMass > 0 ? rawMass : 1;
    _impulse.x = (velocity.x - current.x) * mass;
    _impulse.y = (velocity.y - current.y) * mass;
    _impulse.z = (velocity.z - current.z) * mass;
    cart.body.applyImpulse(_impulse, true);
    state.latched[launcher.id] = true;
    state.cooldownUntilMs[launcher.id] = nowMs + (launcher.cooldownMs ?? 750);
    return launcher.id;
  }
  return null;
}

/**
 * Open-octagon hazard descriptor (e.g. Sundial Station): every edge is a kill zone, plus
 * optional circular keep-outs (center podium). Kept separate from `_levelHazards` because
 * the square-void machinery above assumes `squareHoles` exists on every code path.
 *
 * @type {{
 *   arenaHalf?: number,
 *   circumRadius?: number,
 *   circularKeepOuts?: {
 *     x: number, z: number, radius: number, margin?: number,
 *     solid?: boolean, wall?: boolean,
 *   }[],
 * } | null}
 */
let _octagonHazards = null;

/**
 * Classifies a fall position against the active level's high-value scoring kill zones.
 * "corner_void": inside a Storerooms square-void footprint (small skirt past the lip so
 * carts nudged over the chamfer still count). Levels without square voids return null.
 *
 * @param {{ x: number, y: number, z: number }} p Victim body translation at the fall.
 * @returns {"corner_void" | null}
 */
export function classifyLevelKillZone(p) {
  const holes = _levelHazards?.squareHoles;
  if (holes && _levelHazards.half != null) {
    const need = _levelHazards.half + 1;
    for (let i = 0; i < holes.length; i += 1) {
      if (Math.abs(p.x - holes[i].x) < need && Math.abs(p.z - holes[i].z) < need) {
        return "corner_void";
      }
    }
  }
  return null;
}

/**
 * True when an XZ position sits on the podium high ground (Sundial's center keep-out
 * zone). Used at ram time to credit the HIGH GROUND scoring bonus.
 *
 * @param {number} x
 * @param {number} z
 * @returns {boolean}
 */
function isOnPodiumHighGround(x, z) {
  const zones = _octagonHazards?.circularKeepOuts;
  if (!zones || zones.length === 0) return false;
  for (let i = 0; i < zones.length; i += 1) {
    const dx = x - zones[i].x;
    const dz = z - zones[i].z;
    const r = zones[i].radius + 0.5;
    if (dx * dx + dz * dz <= r * r) return true;
  }
  return false;
}

/**
 * Registers the active level's NPC hazard model. Pass `null` (or a level with no special
 * hazards) to restore the default circular Classic Record behavior.
 *
 * @param {typeof _levelHazards & { isOctagon?: boolean }} hazards
 */
export function setLevelHazards(hazards) {
  _levelAcLaunchers = hazards?.acLaunchers?.length ? hazards.acLaunchers : null;
  _levelHazards =
    hazards && Array.isArray(hazards.squareHoles) && hazards.squareHoles.length > 0
      ? hazards
      : null;
  _octagonHazards =
    hazards && hazards.isOctagon === true && hazards.arenaHalf != null && !_levelHazards
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
 * True when an NPC is inside the near-edge band of the active level hazard model
 * (Backrooms corner voids, open-octagon rim, classic center hole). Used by rare
 * hop edge-saves so bots don't only juke on open floor.
 *
 * @param {number} px
 * @param {number} pz
 * @param {number} [extraProximityM=3.2]
 * @returns {boolean}
 */
export function isNpcNearHazardEdge(px, pz, extraProximityM = 3.2) {
  const prox = Number.isFinite(extraProximityM) ? extraProximityM : 3.2;
  if (_levelHazards?.arenaHalf != null) {
    const { cheb } = nearestSquareHole(px, pz);
    const keepOut = squareHoleKeepOutRadius(0);
    if (cheb < keepOut + prox) return true;
    if (_levelHazards.circularKeepOuts?.length > 0) {
      for (let i = 0; i < _levelHazards.circularKeepOuts.length; i += 1) {
        const ko = _levelHazards.circularKeepOuts[i];
        if (Math.hypot(px - ko.x, pz - ko.z) < ko.radius + (ko.margin ?? 1.5) + prox * 0.75) {
          return true;
        }
      }
    }
    return false;
  }
  if (_octagonHazards) {
    if (octagonEdgeDistance(px, pz) > _octagonHazards.arenaHalf - prox) return true;
    if (_octagonHazards.circularKeepOuts?.length > 0) {
      for (let i = 0; i < _octagonHazards.circularKeepOuts.length; i += 1) {
        const ko = _octagonHazards.circularKeepOuts[i];
        if (Math.hypot(px - ko.x, pz - ko.z) < ko.radius + (ko.margin ?? 1.5) + prox * 0.75) {
          return true;
        }
      }
    }
    return false;
  }
  if (CONFIG.record.centerHole?.enabled !== false) {
    const holeLip = CONFIG.record.innerRadius + (CONFIG.record.physics?.holeClearance ?? 0.45);
    if (Math.hypot(px, pz) < holeLip + prox) return true;
  }
  return false;
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
  const zones = (_levelHazards ?? _octagonHazards)?.circularKeepOuts;
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

// * Wall keep-outs (Storerooms furniture pile) steer tangentially from further out than the
// * radial band: a tangent curves the approach without braking it, so engaging early is
// * cheap. Radial-only repulsion cannot route around an obstacle at all — aimed at the
// * center it is exactly anti-parallel to the heading, so it yields zero lateral steer and
// * the bot just drives in, flips, and re-approaches (playtest 2026-08-14).
const WALL_TANGENT_REACH_MUL = 2.2; // × margin beyond the keep-out edge where the tangent engages
const WALL_TANGENT_GAIN = 2.1; // tangent weight at a fully head-on approach

/**
 * Blends repulsion away from circular keep-out zones into a planar heading.
 *
 * Zones flagged `wall` (un-climbable obstacles) also get a tangential term so the heading
 * curves *around* them. The tangent is weighted by how head-on the approach is, which is
 * exactly where the radial term degenerates, and it picks the side that stays closer to the
 * chase target so the bot takes the short way round.
 *
 * @param {number} px
 * @param {number} pz
 * @param {THREE.Vector3} dir
 * @param {number} [targetX] Chase target X, biasing which way to round a wall zone.
 * @param {number} [targetZ] Chase target Z.
 */
export function applyCircularKeepOutAvoidance(px, pz, dir, targetX, targetZ) {
  const zones = (_levelHazards ?? _octagonHazards)?.circularKeepOuts;
  if (!zones?.length) return;
  let rx = 0;
  let rz = 0;
  let tx = 0;
  let tz = 0;
  for (let i = 0; i < zones.length; i += 1) {
    const ko = zones[i];
    const dx = px - ko.x;
    const dz = pz - ko.z;
    const dist = Math.hypot(dx, dz);
    const edge = ko.radius + (ko.margin ?? 1.5);
    const band = ko.margin ?? 1.5;
    const len = dist || 1;
    const outX = dx / len;
    const outZ = dz / len;

    if (ko.wall) {
      const reach = edge + band * WALL_TANGENT_REACH_MUL;
      if (dist < reach) {
        // * headOn: 1 when driving straight at the center, 0 when already tangent or leaving.
        const headOn = clamp(-(dir.x * outX + dir.z * outZ), 0, 1);
        if (headOn > 0) {
          const esc = circularKeepOutTangentEscape(px, pz, ko, targetX, targetZ);
          const proximity = clamp((reach - dist) / (reach - ko.radius || 1), 0, 1);
          const w = headOn * proximity * WALL_TANGENT_GAIN;
          tx += esc.x * w;
          tz += esc.z * w;
        }
      }
    }

    if (dist >= edge + band) continue;
    const strength = clamp((edge + band - dist) / band, 0, 2.4);
    rx += outX * strength;
    rz += outZ * strength;
  }
  if (rx === 0 && rz === 0 && tx === 0 && tz === 0) return;
  dir.x += rx * 1.6 + tx;
  dir.z += rz * 1.6 + tz;
  if (dir.lengthSq() < 1e-6) dir.set(rx + tx, 0, rz + tz);
  dir.normalize();
}

/**
 * Nearest registered circular keep-out on the active square-void level (Storerooms center
 * furniture), by signed surface distance. `null` when the level has none. Used by the wedge
 * break-out so a bot sawing the furniture face circles the RIGHT obstacle. (AI-2)
 *
 * @param {number} px
 * @param {number} pz
 * @returns {{ x: number, z: number, radius: number, margin?: number } | null}
 */
function nearestLevelCircularKeepOut(px, pz) {
  const zones = _levelHazards?.circularKeepOuts;
  if (!zones?.length) return null;
  let best = null;
  let bestD = Infinity;
  for (let i = 0; i < zones.length; i += 1) {
    const ko = zones[i];
    const d = Math.hypot(px - ko.x, pz - ko.z) - ko.radius;
    if (d < bestD) {
      bestD = d;
      best = ko;
    }
  }
  return best;
}

/**
 * Tangent escape heading (unit XZ) for a cart grinding a SOLID circular keep-out — 90° to the
 * outward radial so the bot circles the obstacle instead of sawing its near face. Of the two
 * tangents, picks the one pointing more toward the chase target (the shorter way round). (AI-2)
 *
 * @param {number} px Cart X.
 * @param {number} pz Cart Z.
 * @param {{ x: number, z: number }} zone Keep-out center.
 * @param {number} [targetX] Chase target X (biases which way to circle).
 * @param {number} [targetZ] Chase target Z.
 * @returns {{ x: number, z: number }}
 */
export function circularKeepOutTangentEscape(px, pz, zone, targetX, targetZ) {
  const dx = px - zone.x;
  const dz = pz - zone.z;
  const dist = Math.hypot(dx, dz) || 1;
  let tx = -dz / dist;
  let tz = dx / dist;
  if (typeof targetX === "number" && typeof targetZ === "number") {
    const toTx = targetX - px;
    const toTz = targetZ - pz;
    if (tx * toTx + tz * toTz < 0) {
      tx = -tx;
      tz = -tz;
    }
  }
  return { x: tx, z: tz };
}

const SQUARE_HOLE_TTE_WINDOW_S = 0.45;
const SQUARE_HOLE_PANIC_REVERSE_TTE_S = 0.32;

/**
 * Time-to-physical-lip panic for a Storerooms square void. 0 when not diving.
 * Exported for tests (STOREROOMS-NPC-SELFKO-2).
 *
 * @param {number} cheb Chebyshev distance from the hole center.
 * @param {number} towardHoleSpeed Speed toward the hole (m/s). ≤ 0.5 → 0.
 * @param {number} half Physical void half-extent (the floor lip).
 * @returns {number} 0..1.6
 */
export function computeSquareHoleTtePanic(cheb, towardHoleSpeed, half) {
  if (towardHoleSpeed <= 0.5) return 0;
  const gap = cheb - half;
  if (gap <= 0) return 1.6;
  const tte = gap / towardHoleSpeed;
  return clamp((SQUARE_HOLE_TTE_WINDOW_S - tte) / SQUARE_HOLE_TTE_WINDOW_S, 0, 1) * 1.6;
}

/**
 * True when a Storerooms NPC should panic-reverse off a square void. Position lip
 * check or short time-to-physical-lip while diving. Exported for tests.
 *
 * @param {{
 *   cheb: number,
 *   half: number,
 *   keepOut: number,
 *   speed: number,
 *   towardHole: number,
 *   insideZone: boolean,
 * }} opts
 * @returns {boolean}
 */
export function shouldNpcPanicReverseSquareHole(opts) {
  const speed = opts.speed;
  if (speed <= 1.0) return false;
  if (opts.insideZone) return true;
  const diving = opts.towardHole > 0.45;
  if (!diving) return false;
  if (opts.cheb < opts.keepOut + 0.22) return true;
  const approachSpeed = speed * opts.towardHole;
  if (approachSpeed <= 0.5) return false;
  const gap = opts.cheb - opts.half;
  const tte = gap <= 0 ? 0 : gap / approachSpeed;
  return tte < SQUARE_HOLE_PANIC_REVERSE_TTE_S;
}

/**
 * Steers an NPC heading away from Storerooms square corner voids.
 * Static radial + Classic-style TTE panic to the physical lip (max, not sum).
 */
function applySquareHoleAvoidance(px, pz, lv, dir, targetX, targetZ) {
  const holes = _levelHazards.squareHoles;
  const half = _levelHazards.half;
  const edge = half + _levelHazards.avoidMargin;
  const band = _levelHazards.influenceBand;
  let rx = 0;
  let rz = 0;
  for (let i = 0; i < holes.length; i += 1) {
    const dx = px - holes[i].x;
    const dz = pz - holes[i].z;
    const cheb = Math.max(Math.abs(dx), Math.abs(dz));
    const len = Math.hypot(dx, dz) || 1;
    // * Radial from hole → cart (outward). Diving = velocity toward hole = −(lv · radial).
    const radialX = dx / len;
    const radialZ = dz / len;
    const towardHoleSpeed = -(lv.x * radialX + lv.z * radialZ);
    const panic = computeSquareHoleTtePanic(cheb, towardHoleSpeed, half);
    if (cheb >= edge + band && panic <= 0) continue;
    const strength = cheb < edge + band ? clamp((edge + band - cheb) / band, 0, 2.2) : 0;
    const movingTowardHole = towardHoleSpeed > 0.5;
    // * Gutter: tangent-first; light radial only when diving (avoids "scared of whole corner").
    // * Inside lip: stronger peel-off so unforced void dives drop.
    const inGutterBand = cheb >= edge;
    const radialScale = inGutterBand
      ? (movingTowardHole ? 0.15 : 0)
      : 0.60;
    // * STOREROOMS-NPC-SELFKO-2 L1: TTE panic maxes with the static radial (not sum).
    const radialMag = Math.max(radialScale > 0 ? strength * radialScale : 0, panic);
    if (radialMag > 0) {
      rx += radialX * radialMag;
      rz += radialZ * radialMag;
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
function applyClassicCenterHoleAvoidance(px, pz, lv, dir) {
  const innerR = CONFIG.record.innerRadius;
  const holeClearance = CONFIG.record.physics?.holeClearance ?? 0.45;
  const edge = innerR + holeClearance;
  const band = 4.5;
  const dist = Math.hypot(px, pz);

  // * Speed-aware panic (bot-suicide triage 2026-07-16): at maxSpeed 23.5 m/s a cart
  // * crosses the whole 4.5 m band in ~0.2 s — distance-based strength alone never
  // * turned fast carts in time (soak: ~half of 63 unforced falls/round were the hole).
  // * Engage by time-to-lip along the inward radial velocity, same shape as the
  // * outer-rim time-to-edge panic below.
  let panic = 0;
  if (dist > 1e-3) {
    const inwardSpeed = -(lv.x * (px / dist) + lv.z * (pz / dist));
    if (inwardSpeed > 0.5) {
      const tte = (dist - edge) / inwardSpeed;
      panic = clamp((0.9 - tte) / 0.9, 0, 1) * 1.6;
    }
  }

  if (dist >= edge + band && panic <= 0) return;

  const strength = Math.max(clamp((edge + band - dist) / band, 0, 1.6), panic);
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
 * * Classic disc outer rim — inward heading push. The rim had NO reactive avoidance
 * * (only the 0.84/0.95 target clamp), so momentum, drift impulses, and target jitter
 * * carried bots straight off (playtest 2026-07-15: "they don't stop at the edge").
 * * Time-to-edge gating keeps it out of the way of AI-4 edge-camper chases: a slow,
 * * controlled approach to a rim-side target feels nothing; a bot about to fly off does.
 *
 * @param {number} px
 * @param {number} pz
 * @param {{ x: number, z: number }} lv Planar linvel (module scratch).
 * @param {THREE.Vector3} dir Heading to adjust in place.
 */
function applyClassicOuterRimAvoidance(px, pz, lv, dir) {
  const dist = Math.hypot(px, pz);
  if (dist < 1e-3) return;
  const rx = px / dist;
  const rz = pz / dist;
  const gap = CONFIG.record.radius - dist;

  // * Thin static band so idle drift at the lip still gets a nudge…
  let strength = clamp((1.6 - gap) / 1.6, 0, 1);
  // * …and a speed-aware panic that engages by time-to-edge, not distance.
  const outwardSpeed = lv.x * rx + lv.z * rz;
  if (outwardSpeed > 0.5) {
    const tte = gap / outwardSpeed;
    strength = Math.max(strength, clamp((0.55 - tte) / 0.55, 0, 1) * 1.6);
  }
  if (strength <= 0) return;

  dir.x -= rx * strength * 1.1;
  dir.z -= rz * strength * 1.1;
  if (dir.lengthSq() < 1e-6) dir.set(-rx, 0, -rz);
  dir.normalize();
}

/**
 * * Routes a Classic-disc AI path around the center hole. Backrooms has had this since
 * * AI-2 (routeBackroomsChaseTarget); Classic relied on the reactive radial push alone,
 * * so any wander/chase target across the disc drew a chord straight over the hole —
 * * at 23.5 m/s the 4.5 m reactive band gave ~0.2 s of correction, i.e. none (soak
 * * 2026-07-16: 63 unforced NPC falls in 118 s, ~half down the hole). When the straight
 * * segment to the target passes inside the hole's safe circle, returns a tangent-side
 * * waypoint that clears it; null when the direct line is already safe.
 *
 * @param {number} fx Cart X.
 * @param {number} fz Cart Z.
 * @param {number} tx Target X.
 * @param {number} tz Target Z.
 * @returns {{ x: number, z: number } | null}
 */
function routeClassicHoleTarget(fx, fz, tx, tz) {
  const holeLip = CONFIG.record.innerRadius + (CONFIG.record.physics?.holeClearance ?? 0.45);
  const safeR = holeLip + 2.4;
  const dx = tx - fx;
  const dz = tz - fz;
  const len2 = dx * dx + dz * dz;
  if (len2 < 1e-6) return null;
  // * Closest approach of the segment to the origin (hole center).
  const t = clamp(-(fx * dx + fz * dz) / len2, 0, 1);
  if (t <= 0 || t >= 1) return null; // hole is behind or beyond the target — direct is fine
  const cx = fx + dx * t;
  const cz = fz + dz * t;
  const d = Math.hypot(cx, cz);
  if (d >= safeR) return null;
  // * Waypoint: push the closest-approach point out to a clearing circle. A segment
  // * through the exact center gets an arbitrary perpendicular side.
  let nx, nz;
  if (d > 1e-3) {
    nx = cx / d;
    nz = cz / d;
  } else {
    const invLen = 1 / Math.sqrt(len2);
    nx = -dz * invLen;
    nz = dx * invLen;
  }
  const wpR = safeR + 1.2;
  return { x: nx * wpR, z: nz * wpR };
}

/**
 * Pure octagon rim avoidance strength: static band + Classic-style time-to-edge panic.
 * Used by applyOctagonRimAvoidance and unit tests (AI-ARENA-SELFKO-1).
 *
 * @param {number} px Cart world X.
 * @param {number} pz Cart world Z.
 * @param {number} lvx Linear velocity X.
 * @param {number} lvz Linear velocity Z.
 * @param {number} apothem Octagon apothem (arenaHalf).
 * @param {number} [band=OCTAGON_RIM_BAND]
 * @returns {number} Strength ≥ 0 (0 outside the band).
 */
export function computeOctagonRimStrength(px, pz, lvx, lvz, apothem, band = OCTAGON_RIM_BAND) {
  const edgeDist = octagonEdgeDistance(px, pz);
  if (edgeDist <= apothem - band) return 0;
  // * Static band (position-only), same shape as pre-SELFKO Sundial.
  let strength = clamp((edgeDist - (apothem - band)) / band, 0, 1.5);
  // * Classic outer-rim TTE panic: only when moving outward fast enough.
  const dist = Math.hypot(px, pz) || 1;
  const rx = px / dist;
  const rz = pz / dist;
  const outwardSpeed = lvx * rx + lvz * rz;
  if (outwardSpeed > 0.5) {
    const gap = apothem - edgeDist;
    const tte = gap / outwardSpeed;
    strength = Math.max(strength, clamp((0.55 - tte) / 0.55, 0, 1) * 1.6);
  }
  return strength;
}

/**
 * * Steers an octagon-arena NPC's heading inward when it's within the rim influence band.
 * * Sundial Station's outer rim is the only kill edge, so — unlike a center hole — bots must
 * * be pushed toward center. Robust across all eight flats (pushes along −position).
 * * AI-ARENA-SELFKO-1: Classic-style TTE panic on top of the static band (max, not sum).
 *
 * @param {number} px Cart world X.
 * @param {number} pz Cart world Z.
 * @param {{ x: number, z: number }} lv Planar linear velocity.
 * @param {THREE.Vector3} dir Normalized planar heading (modified in place).
 */
function applyOctagonRimAvoidance(px, pz, lv, dir) {
  if (!_octagonHazards) return;
  const apothem = _octagonHazards.arenaHalf ?? CONFIG.record.radius;
  // * AI-3 band 5.25 + gain 1.26; SELFKO-1 adds speed-aware TTE via computeOctagonRimStrength.
  const strength = computeOctagonRimStrength(px, pz, lv.x, lv.z, apothem);
  if (strength <= 0) return;
  const dist = Math.hypot(px, pz) || 1;
  dir.x += (-px / dist) * strength * 1.26;
  dir.z += (-pz / dist) * strength * 1.26;
  if (dir.lengthSq() < 1e-6) dir.set(-px / dist, 0, -pz / dist);
  dir.normalize();
}

/**
 * True when Sundial-style open-octagon hazards are active (not Classic / Storerooms).
 * @returns {boolean}
 */
export function isOctagonArenaActive() {
  return !!_octagonHazards;
}

/**
 * Abort opportunistic nitro when the bot→target segment leaves the safe octagon deck.
 * No-ops (false) when not on an octagon arena — never mis-fire on Classic/Storerooms.
 * Safe zone is convex (regular octagon), so endpoint checks are exact for the segment.
 *
 * @param {number} ax Bot X.
 * @param {number} az Bot Z.
 * @param {number} bx Target X.
 * @param {number} bz Target Z.
 * @param {number} [marginM=1.25] Inset from apothem (meters).
 * @returns {boolean}
 */
export function boostSegmentExitsOctagon(ax, az, bx, bz, marginM = 1.25) {
  if (!_octagonHazards) return false;
  const apothem = _octagonHazards.arenaHalf ?? CONFIG.record.radius;
  const margin = Number.isFinite(marginM) ? marginM : 1.25;
  const safe = apothem - margin;
  if (octagonEdgeDistance(ax, az) > safe) return true;
  if (octagonEdgeDistance(bx, bz) > safe) return true;
  return false;
}

/**
 * Classic Record is a circular floor, not an octagon. Keep its boost runway check
 * separate so callers do not accidentally treat the missing octagon hazards as safe.
 * @param {number} ax Bot X.
 * @param {number} az Bot Z.
 * @param {number} bx Runway-end X.
 * @param {number} bz Runway-end Z.
 * @param {number} [marginM=1.25] Inset from the outer death rim (meters).
 * @returns {boolean}
 */
export function boostSegmentExitsClassicDisc(ax, az, bx, bz, marginM = 1.25) {
  if (_levelHazards || _octagonHazards || CONFIG.record.centerHole?.enabled === false) return false;
  const margin = Number.isFinite(marginM) ? marginM : 1.25;
  const safeRadius = CONFIG.record.radius - margin;
  return Math.hypot(ax, az) > safeRadius || Math.hypot(bx, bz) > safeRadius;
}

/**
 * Sundial "near the kill rim" band, meters in from the octagon apothem. One
 * constant for BOTH the steering push (applyOctagonRimAvoidance) and the
 * inward escape-commit trigger — these drifted apart during AI-3 (5.25 vs 5.0)
 * and describe the same conceptual band.
 */
const OCTAGON_RIM_BAND = 5.25;

/**
 * * True during the first 8s of a round or while any human is still on a spawn booth.
 */
function isAiCautiousPhase(allCarts, netSlots) {
  const round = GameState.getRoundState();
  if (round.phase !== "running" || !round.startedAtMs) return true;
  // * startedAtMs lives in the getRoundClockNowMs() domain (timeOrigin +
  // * performance.now()); the physics-step `now` handed to getAiAxis is bare
  // * performance.now(). Subtracting the two gave ≈ -timeOrigin (~-1.75e12),
  // * which is always < AI_CAUTIOUS_MS, so bots were pinned in cautious phase for
  // * the ENTIRE match — the reachOuter/booth tuning past the first 8s never ran.
  // * Read the round clock in its own domain instead.
  if (getRoundClockNowMs() - round.startedAtMs < AI_CAUTIOUS_MS) return true;

  const boothMinR = CONFIG.record.radius * 0.82;
  for (let i = 0; i < (netSlots?.length ?? 0); i += 1) {
    const s = netSlots[i];
    if (!s || s.kind !== "human" || !s.connId) continue;
    const cart = allCarts?.[i];
    if (!cart?.body) continue;
    const pos = cart.body.translation();
    const dist = Math.hypot(pos.x, pos.z);
    // * "On a spawn booth" = elevated AND out at booth radius. This was an OR: a
    // * floor-level human parked beyond 0.82R held every bot in permanent cautious
    // * phase, whose chase cap is ALSO 0.82R (clampAiTargetAwayFromHazards) — bots
    // * stalled at exactly the boundary against the deep rim-campers AI-4 punishes.
    if (pos.y > CONFIG.record.y + 2.5 && dist > boothMinR) return true;
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
  // * STOREROOMS-NPC-SELFKO-2 L1: never a negative extra — that placed chase /
  // * gutter targets inside the suction band.
  const holeExtra = opts.cornerPatrol
    ? (cautious ? 0.1 : 0.05)
    : (cautious ? 0.3 : 0.15);
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
 * * Regular-octagon edge metric (flats normal to the k·45° directions, matching the
 * * Sundial Station deck): a point is on the deck iff this distance ≤ the apothem.
 */
function octagonEdgeDistance(x, z) {
  const ax = Math.abs(x);
  const az = Math.abs(z);
  return Math.max(ax, az, (ax + az) * Math.SQRT1_2);
}

/**
 * * Open-octagon arenas: clamp a target inside the deck apothem (every edge is a kill
 * * zone, so the inset is wider than Backrooms' walled clamp) + circular keep-outs.
 */
function clampOctagonAiTarget(x, z, cautious, opts = {}) {
  const apothem = _octagonHazards.arenaHalf ?? CONFIG.record.radius;
  const edgeInset = cautious ? 4.5 : 2.5;
  const maxCoord = Math.max(1, apothem - edgeInset);
  let outX = clamp(x, -maxCoord, maxCoord);
  let outZ = clamp(z, -maxCoord, maxCoord);
  const diag = (Math.abs(outX) + Math.abs(outZ)) * Math.SQRT1_2;
  if (diag > maxCoord) {
    const s = maxCoord / diag;
    outX *= s;
    outZ *= s;
  }
  // * allowPodium: keep a chase target on the high ground so bots can contest a camper
  // * instead of being pushed off the podium keep-out.
  if (opts.allowPodium) return { x: outX, z: outZ };
  const kept = pushPointOutOfCircularKeepOuts(outX, outZ, cautious ? 0.8 : 0.3);
  return { x: kept.x, z: kept.z };
}

/**
 * * Clamps a target point into a safe annulus — tighter band during cautious phase.
 */
function clampAiTargetAwayFromHazards(x, z, cautious, opts = {}) {
  if (_octagonHazards) {
    return clampOctagonAiTarget(x, z, cautious);
  }
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
  // * reachOuter (human chase) lets bots follow edge-campers closer to the rim; patrol and
  // * wander keep the tighter default so idle bots don't drift into the outer kill band.
  // * AI-3: Cart Rave edge caution — pulled the idle/patrol caps in (0.72→0.68, 0.88→0.84) so
  // * non-chasing bots keep more margin from the outer rim.
  // * AI-4: edge-camp punish — nudged the chase reachOuter caps out (0.78→0.82, 0.92→0.95) so a
  // * bot chasing a rim-camper follows it closer to the edge before the annulus cap stops it.
  const outerLimit = cautious
    ? CONFIG.record.radius * (opts.reachOuter ? getReachOuter(0.82, getActiveAiDifficulty()) : 0.68)
    : CONFIG.record.radius * (opts.reachOuter ? getReachOuter(0.95, getActiveAiDifficulty()) : 0.84);
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

/**
 * Hard-only: 0..1 how close a point is to a death edge (higher = nearer hazard).
 * @param {number} x
 * @param {number} z
 * @returns {number}
 */
function hardEdgeVictimBias(x, z) {
  if (_levelHazards?.arenaHalf != null) {
    const { cheb } = nearestSquareHole(x, z);
    const keepOut = squareHoleKeepOutRadius(0);
    const band = 4.0;
    if (cheb < keepOut + band) return clamp(1 - (cheb - keepOut) / band, 0, 1);
    return 0;
  }
  if (_octagonHazards) {
    const edgeDist = octagonEdgeDistance(x, z);
    const half = _octagonHazards.arenaHalf;
    const fromRim = half - edgeDist;
    if (fromRim < 4.0) return clamp(1 - fromRim / 4.0, 0, 1);
    return 0;
  }
  if (CONFIG.record.centerHole?.enabled !== false) {
    const dist = Math.hypot(x, z);
    const holeLip = CONFIG.record.innerRadius + (CONFIG.record.physics?.holeClearance ?? 0.45);
    const outer = CONFIG.record.radius;
    let bias = 0;
    if (dist < holeLip + 4) bias = Math.max(bias, clamp(1 - (dist - holeLip) / 4, 0, 1));
    if (dist > outer - 4) bias = Math.max(bias, clamp(1 - (outer - dist) / 4, 0, 1));
    return bias;
  }
  return 0;
}

/**
 * AI-DAY-1: read-only edge/void proximity of a point (0..1). Used by chase-weight + solo finisher boost.
 * @param {number} x
 * @param {number} z
 * @returns {number}
 */
export function getEdgeVictimBias(x, z) {
  return hardEdgeVictimBias(x, z);
}

/**
 * True when a cart pose is on a spawn booth deck (height AND spawn-ring XZ).
 * Height alone is not enough: Night Shift high roofs sit above platformY - 0.5.
 *
 * @param {{ x?: number, y?: number, z?: number } | null | undefined} pos
 * @returns {boolean}
 */
export function isOnSpawnBooth(pos) {
  if (!pos || pos.y <= CONFIG.booth.platformY - 0.5) return false;
  const dist = Math.hypot(pos.x, pos.z);
  const boothInnerR =
    CONFIG.cart.spawnRingRadius - CONFIG.booth.platformDepth / 2 - 0.5;
  return dist >= boothInnerR;
}

export function findNearestHumanTarget(fromPos, allCarts, netSlots, slotIndex = 0) {
  let nearestPos = null;
  let nearestWeightedD2 = Infinity;
  let nearestVel = null;
  // * AI-DAY-1: difficulty-scaled intercept; planar lead clamped so proximity gates still fire.
  const leadTimeS = getAiLeadTimeS(getActiveAiDifficulty());
  const fallYThreshold = CONFIG.fall.yThreshold;

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
    if (isOnSpawnBooth(hp)) continue;
    const dx = hp.x - fromPos.x;
    const dz = hp.z - fromPos.z;
    let d2 = dx * dx + dz * dz;

    // * Multi-human score rubberband: prioritize leader; ease off trailing humans.
    const sc = Number(roundScores[i] || 0);
    if (activeHumans > 1 && topScore > 0) {
      if (sc === topScore) {
        d2 *= 0.65; // Appears 35% closer → higher chase priority against leader
      } else if (sc === minScore && sc < topScore) {
        d2 *= 1.30; // Appears 30% farther → lower priority against trailing player
      }
    }

    // * Solo rubberband: single human — scale chase distance from score lead/trail.
    if (activeHumans === 1 && _soloRubberbandActive) {
      const solo = getSoloRubberbandFactors(netSlots);
      if (solo.distanceMul !== 1) d2 *= solo.distanceMul;
    }

    // * Hard-only: prefer victims near an edge / void (appear closer → higher chase priority).
    if (isHardTactics(getActiveAiDifficulty())) {
      const edgeBias = hardEdgeVictimBias(hp.x, hp.z);
      if (edgeBias > 0) d2 *= 1 - Math.min(0.35, edgeBias);
    }

    if (d2 < nearestWeightedD2) {
      nearestWeightedD2 = d2;
      nearestPos = hp;
      nearestVel = cart.body.linvel();
    }
  }
  if (!nearestPos) return null;

  const jitter = _levelHazards?.arenaHalf != null ? 0.5 : 1.8;
  const rawLeadX = nearestVel ? nearestVel.x * leadTimeS : 0;
  const rawLeadZ = nearestVel ? nearestVel.z * leadTimeS : 0;
  const lead = clampAiLeadDisplacement(rawLeadX, rawLeadZ);
  let targetX = nearestPos.x + lead.x;
  let targetZ = nearestPos.z + lead.z;

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
    // * Hard Sudden Death: bias inward instead — they don't self-KO to aggression.
    const distToCenter = Math.hypot(nearestPos.x, nearestPos.z);
    const npcDistToCenter = Math.hypot(fromPos.x, fromPos.z);
    if (npcDistToCenter < distToCenter) {
      const outDirX = nearestPos.x / (distToCenter || 1);
      const outDirZ = nearestPos.z / (distToCenter || 1);
      if (isHardTactics(getActiveAiDifficulty())) {
        targetX -= outDirX * 2.0;
        targetZ -= outDirZ * 2.0;
      } else {
        targetX += outDirX * 2.0;
        targetZ += outDirZ * 2.0;
      }
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
  if (cart.aiContestPodiumUntilMs == null) cart.aiContestPodiumUntilMs = 0;
  if (!cart.aiPersonalityBase) {
    // * Carts carry their NPC name on `.label` (createCart), never `.name` — the old
    // * `cart.name` was always undefined, so every bot fell back to slotIndex%4
    // * behavior while the HUD/nametag badge resolved personality from the name. The
    // * two disagreed (a bot badged AGGRESSOR drove like a lurker; solo never had an
    // * aggressor at all). Read `.label` so behavior matches the shown badge.
    cart.aiPersonalityBase = getNpcPersonality(cart.label ?? cart.slotIndex);
  }
  const diff = getActiveAiDifficulty();
  if (cart.aiDifficultyApplied !== diff || !cart.aiPersonality) {
    cart.aiPersonality = applyPersonalityMods(cart.aiPersonalityBase, diff);
    cart.aiDifficultyApplied = diff;
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
 * @returns {{ x: number, z: number, aiDriveIntent?: "chase" | "patrol" }}
 */
function pickAiTarget(cart, fromPos, allCarts, netSlots, nowMs, slotIndex = 0) {
  ensureAiBehaviorState(cart);
  const personality = cart.aiPersonality;
  const cautious = isAiCautiousPhase(allCarts, netSlots);
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

  // 3. Solo rubberband — ease off when the human is crushed; hunt harder when stomping.
  if (!isSuddenDeath && _soloRubberbandActive) {
    const solo = getSoloRubberbandFactors(netSlots);
    if (solo.chaseMul !== 1) {
      humanWeight = Math.min(0.97, Math.max(0.12, humanWeight * solo.chaseMul));
      if (solo.band === "trail") {
        // * Trailing human: slightly more patrol so the field breathes.
        patrolWeight = Math.min(0.55, patrolWeight * 1.15);
      } else if (solo.band === "lead") {
        patrolWeight = Math.max(0.04, patrolWeight * 0.75);
      }
    }
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

  // * Proximity aggression: a human within ~8m gets hunted almost regardless of personality,
  // * patrol mood, or cautious phase. Bots should turn and ram the player right next to them
  // * instead of committing to a weighted/far target and cruising past (the "drives past
  // * nearby players" complaint). Only ever raises chase weight — never fights Bloodhound.
  // * AI-4 edge-camp punish (~+15%): widened the aggression range 7→8m and raised the commit
  // * 0.9→0.95 so a rim-camper gets hunted harder. Uniform on every arena (Cart Rave /
  // * Storerooms / Sundial) — the cross-arena "same increase as Sundial" lever.
  if (humanTarget) {
    const closeDist = Math.hypot(humanTarget.x - fromPos.x, humanTarget.z - fromPos.z);
    if (closeDist < 8) humanWeight = Math.max(humanWeight, 0.95);
  }

  // * AI-DAY-1 lever 2: edge-aware chase weight (solo/quickplay effective — not multi-human ranking).
  // * Rim / hole-lip camps raise hunt weight and trim patrol so bots leave mid-arena loops.
  // * SD bonus is halved so bloodhound does not stack into pure pinball.
  if (humanTarget) {
    const edgeBias = hardEdgeVictimBias(humanTarget.x, humanTarget.z);
    const edgeMul = getEdgeChaseWeightMul(getActiveAiDifficulty());
    const edged = applyEdgeChaseWeights({
      humanWeight,
      patrolWeight,
      edgeBias,
      mul: edgeMul,
      isSuddenDeath,
    });
    humanWeight = edged.humanWeight;
    patrolWeight = edged.patrolWeight;
  }

  if (roll < humanWeight && humanTarget) {
    if (_levelHazards?.arenaHalf != null) {
      if (!findBlockingSquareHole(fromPos.x, fromPos.z, humanTarget.x, humanTarget.z, 0.04)) {
        return { ...clampBackroomsAiTarget(humanTarget.x, humanTarget.z, cautious), aiDriveIntent: "chase" };
      }
      return {
        ...routeBackroomsChaseTarget(fromPos.x, fromPos.z, humanTarget.x, humanTarget.z, cautious),
        aiDriveIntent: "chase",
      };
    }
    // * Sundial high-ground contest: if the human is camping the podium, drive onto it to
    // * ram them off instead of being repelled by the keep-out. Gated to real campers so bots
    // * don't loiter on empty high ground. Hard also contests whenever the podium scores
    // * (human on high ground counts — same allowPodium path).
    if (_octagonHazards && isOnPodiumHighGround(humanTarget.x, humanTarget.z)) {
      // * FEEL-2 (2026-07-14): 1500→1650 (~+10%) — bots stay committed to the high-ground
      // * contest ~10% longer, so they fight harder for the bigger ART-4 podium zone.
      const contestMs = getPodiumContestMs(1650, getActiveAiDifficulty());
      cart.aiContestPodiumUntilMs = nowMs + contestMs;
      return {
        ...clampOctagonAiTarget(humanTarget.x, humanTarget.z, cautious, { allowPodium: true }),
        aiDriveIntent: "chase",
      };
    }
    // * reachOuter: when chasing a human, let the goal reach closer to the arena rim so bots
    // * follow edge-campers instead of stopping short at the safe-annulus cap.
    return {
      ...clampAiTargetAwayFromHazards(humanTarget.x, humanTarget.z, cautious, { reachOuter: true }),
      aiDriveIntent: "chase",
    };
  }

  if (roll < humanWeight + patrolWeight) {
    return { ...pickAiPatrolTarget(cautious, slotIndex), aiDriveIntent: "patrol" };
  }
  return { ...pickAiRandomWanderTarget(fromPos, cautious, slotIndex), aiDriveIntent: "patrol" };
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
 * @returns {{ forward: number, turn: number, boostHeld?: boolean, boostCancel?: boolean }}
 */
export function getAiAxis(now, cart, allCarts, netSlots) {
  ensureAiBehaviorState(cart);

  if (now < cart.aiPauseUntilMs) {
    cart.aiDriveIntent = "patrol";
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
    cart.aiDriveIntent = "recover";
    // * Classic disc: "toward center" must stop SHORT of the center hole — with the
    // * raw {0,0} target, freshly-landed bots carried a dead-center heading at speed
    // * and dove straight in (playtest 2026-07-15). Mid-annulus point on the same
    // * inbound line keeps the roll-off direction identical, minus the suicide.
    if (!_levelHazards && !_octagonHazards && CONFIG.record.centerHole?.enabled !== false) {
      const dCenter = Math.hypot(p.x, p.z) || 1;
      const midR = CONFIG.record.radius * 0.55;
      cart.aiTarget = { x: (p.x / dCenter) * midR, z: (p.z / dCenter) * midR };
    } else {
      cart.aiTarget = { x: 0, z: 0 };
    }
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
    const toHoleX = hole.x - p.x;
    const toHoleZ = hole.z - p.z;
    const toHoleLen = Math.hypot(toHoleX, toHoleZ) || 1;
    const towardHole = speed > 1e-3
      ? (lv.x * toHoleX + lv.z * toHoleZ) / (speed * toHoleLen)
      : 0;
    // * STOREROOMS-NPC-SELFKO-2 L1: also reverse on short TTE, not only lip + 0.22.
    if (shouldNpcPanicReverseSquareHole({
      cheb,
      half: _levelHazards.half,
      keepOut: lip,
      speed,
      towardHole,
      insideZone: isInsideSquareHoleZone(p.x, p.z, -0.08),
    })) {
      cart.aiReverseUntilMs = now + (420 + Math.random() * 280);
      const escape = gutterWaypointAroundHole(hole, targetX, targetZ, false);
      cart.aiTarget.x = escape.x;
      cart.aiTarget.z = escape.z;
      cart._aiWorkingTarget = null;
    }
  }

  // * Classic disc: proactive re-route around the center hole (working target only —
  // * cart.aiTarget stays put so the bot resumes its real goal once past the hole).
  if (!_levelHazards && !_octagonHazards && CONFIG.record.centerHole?.enabled !== false && !onSpawnPlatform) {
    cart._aiWorkingTarget = routeClassicHoleTarget(
      p.x, p.z,
      cart.aiTarget?.x ?? p.x, cart.aiTarget?.z ?? p.z,
    );
  }

  const slotIndex = cart.slotIndex || 0;
  const onBackrooms = _levelHazards?.arenaHalf != null;

  if (now >= cart.aiNextDecisionMs) {
    cart.aiTarget = pickAiTarget(cart, p, allCarts, netSlots, now, slotIndex);
    cart.aiDriveIntent = cart.aiTarget.aiDriveIntent ?? "patrol";
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

    // * Random short stop to break up constant circling — but never freeze when a human
    // * is close or bearing down. A bot sitting idle next to a player reads as broken, and
    // * this pause was the #1 "AI stops for no reason" offender (was 14% every 0.15-0.95s).
    let allowPause = true;
    const nearHumanForPause = findNearestHumanTarget(p, allCarts, netSlots, slotIndex);
    if (nearHumanForPause) {
      const humanDist = Math.hypot(nearHumanForPause.x - p.x, nearHumanForPause.z - p.z);
      if (humanDist < 9) allowPause = false;
    }
    if (allowPause && Math.random() < getRandomStopChance(onBackrooms, getActiveAiDifficulty())) {
      cart.aiPauseUntilMs = now + (400 + Math.random() * 700);
      cart.aiLastProgressMs = now;
      // * Don't re-roll a pause the instant this one ends — commit to driving for a beat.
      cart.aiNextDecisionMs = cart.aiPauseUntilMs + (600 + Math.random() * 400);
      return { forward: 0, turn: 0 };
    }
  }

  const activeTarget = cart._aiWorkingTarget || cart.aiTarget;
  const toTarget = _aiToTarget.set(activeTarget.x - p.x, 0, activeTarget.z - p.z);
  const distToTarget = Math.sqrt(toTarget.lengthSq());

  if (distToTarget < 0.5) {
    cart.aiTarget = pickAiTarget(cart, p, allCarts, netSlots, now, slotIndex);
    cart.aiDriveIntent = cart.aiTarget.aiDriveIntent ?? "patrol";
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
  const isStuck = speed < 1.4 && stuckForMs > getStuckWindowMs(getActiveAiDifficulty());

  // * Hard: after a failed close-range ram grind, disengage via short tangent escape
  // * instead of reversing into the same line (reuse avoidance-commit window).
  if (
    isHardTactics(getActiveAiDifficulty())
    && isStuck
    && now >= (cart.aiAvoidanceCommitUntilMs || 0)
  ) {
    const nearHuman = findNearestHumanTarget(p, allCarts, netSlots, slotIndex);
    if (nearHuman) {
      const dHuman = Math.hypot(nearHuman.x - p.x, nearHuman.z - p.z);
      if (dHuman < 6) {
        cart.aiAvoidanceCommitUntilMs = now + 700;
        cart.aiLastProgressMs = now;
      }
    }
  }

  // * Reverse only when genuinely wedged (isStuck). The old code also reversed 25% of the
  // * time just for being within 2.8m of the target — which made bots back off exactly as
  // * they closed on a player. Pressing the attack is the fun read; keep driving.
  if (now >= cart.aiReverseUntilMs && isStuck) {
    const reverseChance = stuckForMs > 2500 ? 0.90 : 0.65;

    // * Hazard proximity gate — forbid reverse when near a death edge to avoid
    // * backing the cart into a hole / void it can't see.
    let nearHazard = false;
    if (_levelHazards?.arenaHalf != null) {
      // * Backrooms: check distance to nearest square corner void.
      const { cheb } = nearestSquareHole(p.x, p.z);
      const keepOut = squareHoleKeepOutRadius(0);
      nearHazard = cheb < keepOut + 3.0;
      // * The center furniture is a SOLID circular keep-out, not a death void — a bot
      // * wedged against it SHOULD reverse off (Wyatt: "reverse if touching it for >1s").
      // * So it is deliberately excluded from the no-reverse gate here; only the corner
      // * voids forbid reversing. Backing off the furniture heads inward toward mid-arena,
      // * well short of the corner voids at ~holeCenter. (AI-2 Storerooms wedge)
    } else if (_octagonHazards) {
      // * Open octagon: the outer rim is the death edge — never reverse near it.
      nearHazard = octagonEdgeDistance(p.x, p.z) > _octagonHazards.arenaHalf - 3.5;
      if (!nearHazard && _octagonHazards.circularKeepOuts?.length > 0) {
        for (let i = 0; i < _octagonHazards.circularKeepOuts.length; i += 1) {
          const ko = _octagonHazards.circularKeepOuts[i];
          // * `solid` keep-outs (Sundial podium) are drivable obstacles, not death
          // * voids — a bot wedged against one SHOULD reverse off it, same rule as
          // * the Storerooms center furniture (AI-2). Only true voids forbid reverse.
          if (ko.solid) continue;
          if (Math.hypot(p.x - ko.x, p.z - ko.z) < ko.radius + (ko.margin ?? 1.5) + 2.5) {
            nearHazard = true;
            break;
          }
        }
      }
    } else if (CONFIG.record.centerHole?.enabled !== false) {
      // * Classic: check distance to center-hole physics lip AND the outer rim —
      // * both are death edges, and blind 600-1500ms reverses walked bots straight
      // * off the rim (playtest 2026-07-15).
      const holeLip = CONFIG.record.innerRadius + (CONFIG.record.physics?.holeClearance ?? 0.45);
      const distFromCenter = Math.hypot(p.x, p.z);
      nearHazard = distFromCenter < holeLip + 3.0
        || distFromCenter > CONFIG.record.radius - 3.0;
    }

    if (Math.random() < reverseChance && !nearHazard) {
      cart.aiReverseUntilMs = now + (600 + Math.random() * 900);
      // * When reversing near a hazard, drive forward/away instead of a new random target.
      cart.aiTarget = pickAiTarget(cart, p, allCarts, netSlots, now, slotIndex);
      toTarget.set(cart.aiTarget.x - p.x, 0, cart.aiTarget.z - p.z);
    } else if (nearHazard) {
      // * Too close to an edge to reverse — pick a target that pulls the bot away and
      // * COMMIT to it. Without resetting the stuck clock + deferring the next re-pick,
      // * `isStuck` stayed latched and this branch re-ran every 60Hz substep, thrashing
      // * targets so the bot ground in place near the edge (the freeze-near-hazard bug).
      cart.aiTarget = pickAiTarget(cart, p, allCarts, netSlots, now, slotIndex);
      toTarget.set(cart.aiTarget.x - p.x, 0, cart.aiTarget.z - p.z);
      cart.aiLastProgressMs = now;
      cart.aiNextDecisionMs = Math.max(cart.aiNextDecisionMs, now + 450);
    }
  }

  if (toTarget.lengthSq() < 1e-6) {
    return { forward: 0, turn: 0 };
  }
  toTarget.normalize();

  // * Steer the heading away from arena hazards (hole voids, center pit, furniture).
  if (_levelHazards) {
    // * Backrooms: square-void keep-out zones + circular furniture avoidance.
    applySquareHoleAvoidance(p.x, p.z, lv, toTarget, cart.aiTarget.x, cart.aiTarget.z);
    applyCircularKeepOutAvoidance(p.x, p.z, toTarget, cart.aiTarget.x, cart.aiTarget.z);
  } else if (_octagonHazards) {
    // * Open octagon: steer away from the outer kill rim always, and around the center
    // * podium keep-out UNLESS this bot is actively contesting a camper on the high ground.
    if (now < cart.aiContestPodiumUntilMs) {
      applyOctagonRimAvoidance(p.x, p.z, lv, toTarget);
    } else {
      applyCircularKeepOutAvoidance(p.x, p.z, toTarget);
      applyOctagonRimAvoidance(p.x, p.z, lv, toTarget);
    }
  } else if (CONFIG.record.centerHole?.enabled !== false) {
    // * Classic Record: reactive radial push away from the center hole + the rim.
    applyClassicCenterHoleAvoidance(p.x, p.z, lv, toTarget);
    applyClassicOuterRimAvoidance(p.x, p.z, lv, toTarget);
  }

  // * Avoidance commitment — when a bot is in the hazard avoidance band and its speed
  // * drops below 2.0 m/s (oscillating), lock it onto a tangent escape vector for 1.5s
  // * to break the loop: drive away cleanly before turning back to chase.
  let inAvoidanceBand = false;
  let escapeMode = "tangent"; // "tangent" (circle a void) | "inward" (leave a kill rim)
  let escapeKeepOut = null; // solid circular obstacle to circle, when that's the wedge (AI-2)
  if (_levelHazards?.arenaHalf != null) {
    const { cheb } = nearestSquareHole(p.x, p.z);
    const edge = _levelHazards.half + _levelHazards.avoidMargin;
    const band = _levelHazards.influenceBand;
    inAvoidanceBand = cheb < edge + band;
    // * Center furniture (Storerooms): a solid circular obstacle a bot saws against while
    // * chasing a human parked on the far side. Give it the same tangent-escape commit the
    // * corner voids get so it circles the furniture instead of grinding it. (AI-2)
    const ko = nearestLevelCircularKeepOut(p.x, p.z);
    if (ko) {
      const koReach = ko.radius + (ko.margin ?? 1.5) + (_levelHazards.influenceBand ?? 2);
      if (Math.hypot(p.x - ko.x, p.z - ko.z) < koReach) {
        inAvoidanceBand = true;
        escapeKeepOut = ko;
      }
    }
  } else if (_octagonHazards) {
    // * Sundial octagon: the outer rim is the only kill edge, so a wedged/oscillating bot
    // * near it must escape *inward* (toward center), not tangent along the drop.
    const apothem = _octagonHazards.arenaHalf ?? CONFIG.record.radius;
    if (octagonEdgeDistance(p.x, p.z) > apothem - OCTAGON_RIM_BAND) {
      inAvoidanceBand = true;
      escapeMode = "inward";
    }
  } else if (CONFIG.record.centerHole?.enabled !== false) {
    const holeLip = CONFIG.record.innerRadius + (CONFIG.record.physics?.holeClearance ?? 0.45);
    const band = 4.5;
    inAvoidanceBand = Math.hypot(p.x, p.z) < holeLip + band;
  }

  const lvScratch = _scratchLinvel;
  const speedCheck = Math.hypot(lvScratch.x, lvScratch.z);
  // * Solid furniture arms the escape commit at sawing speeds too — a bot grinding
  // * the Storerooms centerpiece at 2-3 m/s never dropped under the 2.0 gate, so it
  // * ground there forever (playtest 2026-07-15 residual of AI-2). Death voids keep
  // * the tight gate: committing at speed near a lip would drive carts along the edge.
  const commitSpeedCap = escapeKeepOut ? 3.2 : 2.0;
  if (inAvoidanceBand && speedCheck < commitSpeedCap && now >= cart.aiAvoidanceCommitUntilMs) {
    cart.aiAvoidanceCommitUntilMs = now + 1500;
  }

  if (now < cart.aiAvoidanceCommitUntilMs) {
    cart.aiDriveIntent = "escape";
    // * Escape vector — tangent to circle a void, or straight inward to leave a kill rim.
    let escapeX, escapeZ;
    if (escapeKeepOut) {
      // * Circle the solid furniture toward the chase target, not the nearest corner void.
      const esc = circularKeepOutTangentEscape(
        p.x, p.z, escapeKeepOut, cart.aiTarget.x, cart.aiTarget.z,
      );
      escapeX = esc.x;
      escapeZ = esc.z;
    } else if (escapeMode === "inward") {
      const dist = Math.hypot(p.x, p.z) || 1;
      escapeX = -p.x / dist;
      escapeZ = -p.z / dist;
    } else if (_levelHazards?.arenaHalf != null) {
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

  // * NPC-BOOST-1: save the final safe steering direction after hazard avoidance.
  // * The frame-level boost selector may use it for an instant escape/recovery boost.
  if (!cart.aiBoostDirection) cart.aiBoostDirection = { x: 0, z: 0 };
  cart.aiBoostDirection.x = p.x + toTarget.x * 6;
  cart.aiBoostDirection.z = p.z + toTarget.z * 6;

  const desiredYaw = Math.atan2(-toTarget.x, -toTarget.z);
  const currentYaw = yawFromQuaternion(_scratchRot);
  const yawDiff = wrapAngleRad(desiredYaw - currentYaw);

  const slotPhase = (cart.slotIndex || 0) * 1.7;
  const steerWobble = Math.sin(now * 0.0022 + slotPhase) * 0.1;
  const turn = clamp(yawDiff * cart.aiSteerGain + steerWobble, -1, 1);

  if (now < cart.aiReverseUntilMs) {
    cart.aiDriveIntent = "recover";
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
  } else if (!_octagonHazards && CONFIG.record.centerHole?.enabled !== false) {
    // * Classic disc time-to-death braking — bots held forward 1.0 all the way off
    // * both edges ("doesn't stop at the edge", playtest 2026-07-15). Ease throttle
    // * by seconds-to-edge along the current radial velocity: braking starts sooner
    // * the faster the approach, recovers as avoidance turns the heading.
    const distFromCenter = Math.hypot(p.x, p.z);
    if (distFromCenter > 1e-3) {
      const radialSpeed = (lv.x * p.x + lv.z * p.z) / distFromCenter; // + = outward
      let secondsToEdge = Infinity;
      if (radialSpeed > 0.5) {
        secondsToEdge = (CONFIG.record.radius - distFromCenter) / radialSpeed;
      } else if (radialSpeed < -0.5) {
        const holeLip = CONFIG.record.innerRadius + (CONFIG.record.physics?.holeClearance ?? 0.45);
        secondsToEdge = (distFromCenter - holeLip) / -radialSpeed;
      }
      if (secondsToEdge < 0.8) {
        forward *= clamp(secondsToEdge / 0.8, 0.3, 1);
      }
      // * Emergency brake (bot-suicide triage 2026-07-16): under ~0.38 s to a death
      // * edge with the nose still committed toward it (>~60° of yaw to recover),
      // * throttle-trim alone cannot bleed 20+ m/s — slam reverse. Nose-direction
      // * gate keeps this from backing a recovered cart over the edge it just left.
      if (secondsToEdge < 0.38 && Math.abs(yawDiff) > 1.05) {
        forward = -0.85;
      }
    }
  }
  return { forward, turn };
}

function ensurePreStepLinvel(cart) {
  if (!cart._preStepLinvel) {
    cart._preStepLinvel = { x: 0, y: 0, z: 0 };
  }
  return cart._preStepLinvel;
}

function classifyEnvironmentCollision(otherHandle, callbacks) {
  if (callbacks.recordColliderHandles?.includes(otherHandle)) return "floor";
  // * ZAN-BOLLARD-PT-1: posts (Sundial bollards + gnomon) are their own class — the
  // * metallic clang. Other verticals (pit wall, booth legs) stay "edge": FX only.
  if (callbacks.bollardColliderHandles?.includes(otherHandle)) return "clang";
  if (otherHandle === callbacks.pitWallColliderHandle) return "edge";
  if (callbacks.boothColliderHandles?.includes(otherHandle)) return "edge";
  return "floor";
}

function getEnvironmentImpact(cart, envType, impacts, state) {
  const pre = cart._preStepLinvel;

  if (envType === "floor") {
    // * state.linvel is the pre-step snapshot (readRamStateInto) — the fall speed is
    // * read off it, the same signal the floor-thud path always trusted.
    const fallSpeed = -((pre ?? state.linvel).y);
    if (fallSpeed <= impacts.floorFallSpeedThreshold) return null;
    return Math.min(1.0, (fallSpeed - impacts.floorFallSpeedThreshold) / impacts.intensityRange);
  }

  // * ZAN-BOLLARD-PT-1: the edge clang is the Δv the impact produced in ONE substep.
  // * state.linvel is the PRE-step snapshot, and the old code subtracted it from
  // * itself — Δv was always 0, so edge impacts never fired (bollards, gnomon and
  // * booth legs were all silent; ZAN-BOLLARD-CLASS-1's "matching booth legs" premise
  // * assumed a path that was dead). processCollisionEvents drains after world.step,
  // * so the body's live linvel is the post-impact velocity — that is the sample.
  // * The +4 cart solver iterations spread the impulse, so real impact Δv is
  // * ~1.6–1.7 m/s at any approach speed — CONFIG.edgeDeltaVThreshold (0.75) and
  // * edgeIntensityRange (6) are tuned to that measured floor.
  if (!pre) return null;
  const live = cart.body.linvel();
  const dvXZ = Math.hypot(live.x - pre.x, live.z - pre.z);
  if (dvXZ <= impacts.edgeDeltaVThreshold) return null;
  return Math.min(1.0, (dvXZ - impacts.edgeDeltaVThreshold) / impacts.edgeIntensityRange);
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

  // * ZAN-BOLLARD-PT-1: the outward projection to the pit ring is only correct for
  // * contacts already AT the ring (the pit wall). It used to push every edge impact
  // * there — booth legs, corner bollards and the gnomon are inboard posts, so their
  // * sparks floated over the void instead of sitting on the thing that was hit.
  // * Outboard overshoot (a cart past the ring, falling) still snaps back to the ring.
  if (dist >= pitInnerRadius) {
    const scale = pitInnerRadius / dist;
    out.x = rp.x * scale;
    out.z = rp.z * scale;
  }
  return out;
}

/**
 * Cart pairs currently in physical contact (keyed by ordered slot indexes). Rapier only
 * emits a collision event on the STARTED/stopped edges, so ram qualification used to get
 * exactly one attempt per touch — at the (often slow) first-contact velocity. Two carts
 * grinding in a furball then shoved each other off with no attribution and no knockback
 * ever qualifying (the playtest "hits do nothing" / unattributed-fall report; a 100 s
 * 3-NPC soak produced 6 falls and ZERO attributed rams). Pairs in this map are re-offered
 * to {@link resolveCartRamCollision} each substep, on a per-pair cooldown.
 * @type {Map<string, { a: object, b: object, lastRamAtMs: number }>}
 */
const _activeCartContacts = new Map();

/** Re-qualification cooldown per contact pair — one hit's spread impulse (~spreadSteps
 *  substeps) must land and separate the pair before the same sustained contact may fire
 *  again, or a single hard ram held in contact would machine-gun impulses. */
const RAM_SUSTAINED_REQUALIFY_MS = 500;

/** * Max planar separation (m) for a tracked contact pair before it is dropped as stale.
 * Two carts in physical contact keep their body origins within one full cart length
 * (2 × CONFIG.cart.size.z half-extent) even end-to-end; doubling that leaves margin for
 * tilt / round-cuboid corner contact, while the two closest spawn-ring slots sit tens of
 * meters apart. Prunes pairs whose Rapier stopped edge never fired (teleport-to-spawn,
 * Sudden Death setEnabled(false)) so they cannot re-qualify an attributed ram from
 * across the arena (RAM-CONTACT-STALE-1). */
const RAM_SUSTAINED_MAX_SEPARATION_M = CONFIG.cart.size.z * 4;
const RAM_SUSTAINED_MAX_SEPARATION_SQ = RAM_SUSTAINED_MAX_SEPARATION_M ** 2;

/** @param {object} c1 @param {object} c2 @returns {string} */
function cartPairKey(c1, c2) {
  const s1 = c1.slotIndex ?? -1;
  const s2 = c2.slotIndex ?? -1;
  return s1 <= s2 ? `${s1}|${s2}` : `${s2}|${s1}`;
}

function processCollisionEvents(world, eventQueue, allCarts, callbacks, isHost, nowMs) {
  _colliderMap.clear();
  for (const c of allCarts || []) {
    if (c && c.collider) {
      _colliderMap.set(c.collider.handle, c);
    }
  }

  const impacts = CONFIG.environmentImpacts;

  eventQueue.drainCollisionEvents((h1, h2, started) => {
    const cc1 = _colliderMap.get(h1);
    const cc2 = _colliderMap.get(h2);
    if (cc1 && cc2 && cc1 !== cc2 && !started) {
      // * Cart pair separated — stop tracking it for sustained re-qualification.
      _activeCartContacts.delete(cartPairKey(cc1, cc2));
      return;
    }
    if (!started) return;
    const c1 = cc1;
    const c2 = cc2;

    if (c1 && c2) {
      if (c1 !== c2) {
        // * Track the live contact; the post-drain sweep below re-attempts qualification
        // * while the pair stays in contact (grinding), not just on this started edge.
        const rec = { a: c1, b: c2, lastRamAtMs: 0 };
        _activeCartContacts.set(cartPairKey(c1, c2), rec);
        const ram = resolveCartRamCollision(c1, c2);
        if (ram) {
          applyRammingImpulse(
            ram.rammer,
            ram.victim,
            ram.rammerState,
            ram.victimState,
            callbacks,
            isHost,
            nowMs,
          );
          rec.lastRamAtMs = nowMs; // this touch fired — cooldown before any sustained re-fire
        }
      }
    } else if (c1 || c2) {
      const cart = c1 || c2;
      const otherHandle = c1 ? h2 : h1;
      const envType = classifyEnvironmentCollision(otherHandle, callbacks);
      // * Fetch this cart's pos + linvel ONCE; shared by impact + contact-pos math.
      readRamStateInto(cart, _ramStateA);

      // * Hop landing (rising-edge floor contact after takeoff). Fires even when fall
      // * speed is below the normal floor-impact threshold so soft hops still thud.
      // * Local cart: always (prediction + host). Remote/NPC: host only.
      // * Suppresses the generic floor impact on the same contact to avoid double-thud.
      let hopLandedThisContact = false;
      if (
        envType === "floor" &&
        cart.hopAwaitingLand &&
        cart.hopAirborne
      ) {
        cart.hopAwaitingLand = false;
        cart.hopAirborne = false;
        hopLandedThisContact = true;
        const isLocal = callbacks.localCart === cart;
        if ((isLocal || isHost) && callbacks.onHopLand) {
          const fallSpeed = Math.max(0, -(cart._preStepLinvel?.y ?? _ramStateA.linvel.y));
          const landI = Math.min(1, Math.max(0.22, fallSpeed / 10));
          callbacks.onHopLand(cart, landI);
        }
      }

      const intensity = getEnvironmentImpact(cart, envType, impacts, _ramStateA);
      // * ZAN-BOLLARD-PT-1 diag (?diag only — no-op otherwise): what the impact path
      // * actually sees for env contacts. Missing events = the collision event never
      // * reaches the drain; envType wrong = classification; gated edge = Δv below
      // * threshold; ungated = the impact fired and the sound path is the suspect.
      recordDiagEvent("sim", "env_impact", {
        envType,
        gated: !(intensity != null && intensity > impacts.minIntensity),
        intensity: intensity == null ? null : Math.round(intensity * 1000) / 1000,
        otherHandle,
        slot: cart.slotIndex ?? null,
        started,
      });
      if (intensity == null || intensity <= impacts.minIntensity) return;

      const contactPos = getEnvironmentContactPosition(envType, impacts, _ramStateA, _envContactPos);

      if (isHost) {
        if (envType === "floor") {
          if (!hopLandedThisContact) {
            if (callbacks.playFloorImpact) callbacks.playFloorImpact(intensity);
            if (callbacks.spawnTrashBurst) callbacks.spawnTrashBurst(contactPos, intensity, "floor");
          }
        } else if (envType === "clang") {
          // * ZAN-BOLLARD-PT-1: only the Sundial posts clang. Pit wall / booth legs
          // * ("edge") keep the FX but stay silent — the metallic clang was going off
          // * on every vertical surface.
          if (callbacks.playEdgeImpact) callbacks.playEdgeImpact(intensity);
          if (callbacks.spawnTrashBurst) callbacks.spawnTrashBurst(contactPos, intensity, "edge");
        } else {
          if (callbacks.spawnTrashBurst) callbacks.spawnTrashBurst(contactPos, intensity, "edge");
        }
        if (callbacks.onCartImpactSquash) {
          callbacks.onCartImpactSquash(null, cart, intensity);
        }
      }

      if (isHost) {
        const slotIndex = cart.slotIndex;
        // * Hop landings never broadcast — clients already play their own predicted
        // * landing thud, and a replayed generic floor impact would double-thud.
        if (slotIndex >= 0 && !hopLandedThisContact) {
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

  // * Sustained-contact re-qualification: pairs still touching get a fresh qualification
  // * attempt each substep (per-pair cooldown). A cart that drifted into contact slowly and
  // * THEN accelerated/boosted into its opponent now lands a real, attributed ram instead of
  // * silently shoving them off. Stale pairs (respawn/teardown/world rebuild) are pruned by
  // * identity against the live collider map — separation normally removes them via the
  // * stopped edge above.
  for (const [key, rec] of _activeCartContacts) {
    const { a, b } = rec;
    if (
      !a?.body ||
      !b?.body ||
      _colliderMap.get(a.collider?.handle) !== a ||
      _colliderMap.get(b.collider?.handle) !== b
    ) {
      _activeCartContacts.delete(key);
      continue;
    }
    // * Separation guard — a pair this far apart is not touching, whatever the stopped
    // * edge said (or never fired). The geometric cone can realign from across the arena
    // * and the stale pair would re-fire a fully attributed ram + knockback without it.
    const pa = a.body.translation();
    const pb = b.body.translation();
    const dx = pa.x - pb.x;
    const dz = pa.z - pb.z;
    if (dx * dx + dz * dz > RAM_SUSTAINED_MAX_SEPARATION_SQ) {
      _activeCartContacts.delete(key);
      continue;
    }
    if (nowMs - rec.lastRamAtMs < RAM_SUSTAINED_REQUALIFY_MS) continue;
    const ram = resolveCartRamCollision(a, b);
    if (ram) {
      applyRammingImpulse(ram.rammer, ram.victim, ram.rammerState, ram.victimState, callbacks, isHost, nowMs);
      rec.lastRamAtMs = nowMs;
    }
  }
}

/**
 * * Drops every tracked sustained-contact pair involving `cart` from `_activeCartContacts`.
 *
 * Called from {@link resetCartTransientState} (entities.js) on respawn/rematch so a pair
 * whose Rapier stopped edge never fired (teleport-to-spawn while touching, Sudden Death
 * `setEnabled(false)` mid-contact) cannot re-qualify a ram from across the arena
 * (RAM-CONTACT-STALE-1). The separation guard in {@link processCollisionEvents} is the
 * backstop for pairs no code path resets.
 *
 * @param {object} cart
 * @returns {void}
 */
export function clearActiveCartContactsForCart(cart) {
  if (!cart) return;
  for (const [key, rec] of _activeCartContacts) {
    if (rec.a === cart || rec.b === cart) _activeCartContacts.delete(key);
  }
}

// ── PIT-PT-1 measurement probe ──────────────────────────────────────────────
// * TEMPORARY. Evidence-gathering for the Cart Rave pit residuals (burial that worsens
// * with depth; wall partly drivable on a wheels-first landing). Records nothing but
// * pose — it never reads or writes gameplay state — and compiles to a property read
// * when `?diag` is absent. Remove once the follow-up fix card closes.
// *
// * Deliberately logs RAW pose and does the geometry offline: the collider radii come
// * from a tangent-fit derivation in arena.js that this file must not duplicate, and
// * keeping the numbers raw means the analysis can be redone without a re-flight.

/** Radial distance (m) past which a cart counts as "at the pit", paired with the Y gate. */
const PIT_PROBE_OPEN_RADIUS = 42;
/** * Y gate for opening an episode. Radius alone would fire on dancefloor-edge traffic. */
const PIT_PROBE_OPEN_Y = -2;

/**
 * Open fall episodes keyed by cart. WeakMap so a destroyed cart cannot leak an episode.
 * @type {WeakMap<object, { rMax: number, yAtRMax: number, thetaAtRMax: number,
 *   yawAtRMax: number, vRadial: number, vy: number, grip: number, minY: number,
 *   startMs: number }>}
 */
let _pitEpisodes = new WeakMap();

/** Test seam — drops any in-flight episodes between cases. */
export function __resetPitProbeForTest() {
  _pitEpisodes = new WeakMap();
}

/**
 * Ground authority as `applyArcadeControls` computes it (1 = full grip, airControlFactor
 * = full air). Recomputed here from POST-step pose: burial is a post-contact question and
 * the control-time scratch is the previous frame's state.
 *
 * @param {number} posY
 * @param {number} vy
 * @returns {number}
 */
function pitProbeGrip(posY, vy) {
  const groundBlend = posY > CONFIG.fall.yThreshold
    ? THREE.MathUtils.smoothstep(Math.abs(vy), 1.5, 2.5)
    : 1;
  return THREE.MathUtils.lerp(1, CONFIG.driving.airControlFactor, groundBlend);
}

/** @param {number} v @returns {number} */
function round3(v) {
  return Math.round(v * 1000) / 1000;
}

/**
 * Samples every cart's radial excursion into the pit, once per fixed step AFTER
 * `world.step`. One `pit`/`fall` event is emitted per episode, at the KO — not per
 * contact, and not after the KO: tracking through the shatter + respawn delay would let
 * post-KO ricochets dominate `rMax` and measure the wrong thing.
 *
 * @param {object[]} allCarts
 * @param {number} nowMs
 */
function samplePitProbe(allCarts, nowMs) {
  if (typeof window === "undefined" || !window.__ccDiagActive) return;
  for (const cart of allCarts || []) {
    if (!cart?.body) continue;
    const ep = _pitEpisodes.get(cart);
    const pos = cart.body.translation();
    const lv = cart.body.linvel();
    // * The KO closes the episode: respawnAtMs is set at the fall, and yThreshold is
    // * where the fall is scored. Nothing in normal play goes deeper.
    const koed = cart.respawnAtMs != null || pos.y < CONFIG.fall.yThreshold;

    if (!ep) {
      if (koed) continue;
      const r = Math.hypot(pos.x, pos.z);
      if (r <= PIT_PROBE_OPEN_RADIUS || pos.y >= PIT_PROBE_OPEN_Y) continue;
      // * Seed from the opening pose rather than -Infinity: a cart that crosses the gate
      // * and KOs on the very next step is still one real fall, and an unseeded episode
      // * would have had no sample to report and been dropped silently.
      _pitEpisodes.set(cart, {
        rMax: r,
        yAtRMax: pos.y,
        thetaAtRMax: Math.atan2(pos.z, pos.x),
        yawAtRMax: yawFromQuaternion(cart.body.rotation()),
        vRadial: r > 1e-6 ? (lv.x * pos.x + lv.z * pos.z) / r : 0,
        vy: lv.y,
        grip: pitProbeGrip(pos.y, lv.y),
        minY: pos.y,
        startMs: nowMs,
      });
      continue;
    }

    if (koed) {
      _pitEpisodes.delete(cart);
      if (!Number.isFinite(ep.rMax)) continue;
      recordDiagEvent("pit", "fall", {
        rMax: round3(ep.rMax),
        yAtRMax: round3(ep.yAtRMax),
        thetaAtRMax: round3(ep.thetaAtRMax),
        yawAtRMax: round3(ep.yawAtRMax),
        vRadial: round3(ep.vRadial),
        vy: round3(ep.vy),
        grip: round3(ep.grip),
        minY: round3(ep.minY),
        durMs: Math.round(nowMs - ep.startMs),
        // * Config half-extent basis — burial vs the drawn wall depends on heading, so
        // * the offline pass needs both of these against yawAtRMax, not one half-width.
        hx: CONFIG.cart?.size?.x ?? 0,
        hz: CONFIG.cart?.size?.z ?? 0,
      });
      continue;
    }

    if (pos.y < ep.minY) ep.minY = pos.y;
    const r = Math.hypot(pos.x, pos.z);
    if (r > ep.rMax) {
      ep.rMax = r;
      ep.yAtRMax = pos.y;
      ep.thetaAtRMax = Math.atan2(pos.z, pos.x);
      ep.yawAtRMax = yawFromQuaternion(cart.body.rotation());
      // * Outward-positive radial speed at the deepest point.
      ep.vRadial = r > 1e-6 ? (lv.x * pos.x + lv.z * pos.z) / r : 0;
      ep.vy = lv.y;
      ep.grip = pitProbeGrip(pos.y, lv.y);
    }
  }
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
  _stepIsHost = isHost;

  // Save pre-step linear velocities for collision impact calculations
  const hopCfg = CONFIG.cart?.hop;
  const hopLandingMaxMs = hopCfg?.landingMaxMs ?? 900;
  const hopAirborneVy = hopCfg?.airborneVy ?? 1.15;
  for (const cart of allCarts || []) {
    if (cart && cart.body) {
      const lv = cart.body.linvel();
      const pre = ensurePreStepLinvel(cart);
      pre.x = lv.x;
      pre.y = lv.y;
      pre.z = lv.z;

      // * Hop landing edge-detect: mark airborne after takeoff; time out stale awaits
      // * so ordinary floor bumps never re-fire a thud.
      if (cart.hopAwaitingLand) {
        if (lv.y > hopAirborneVy) cart.hopAirborne = true;
        if (now - (cart.lastHopAtMs || 0) > hopLandingMaxMs) {
          cart.hopAwaitingLand = false;
          cart.hopAirborne = false;
        }
      }
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

  // 5. Host-authoritative level launchers. Apply after controls/ram impulses so the authored
  // launch vector wins this step; ordinary host snapshots carry the result to remote clients.
  if (isHost && GameState.getRoundState().phase === "running") {
    for (const cart of allCarts || []) {
      if (!cart?.isSuddenDeathSpectator) applyLevelAcLauncher(cart, now);
    }
  }

  // 6. Step world
  if (world && eventQueue) {
    // * Named span so a KO-adjacent host freeze can be attributed to (or ruled out of)
    // * the Rapier step vs shatter VFX / PA audio (perfSpans → longframe.spans).
    mark("physics.step", () => world.step(eventQueue));
    Object.assign(_collisionCallbacks, callbacks);
    _collisionCallbacks.localCart = localCart;
    processCollisionEvents(world, eventQueue, allCarts, _collisionCallbacks, isHost, now);
    // * PIT-PT-1 probe (temporary, ?diag only) — post-step pose, so it sees where the
    // * solver actually left the cart rather than where control application read it.
    samplePitProbe(allCarts, now);
  }
}
